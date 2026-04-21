// api/push/check.js
// Appelé par Vercel Cron (cf. vercel.json)
// Lit l'état de la piscine via MQTT, détecte les dépassements de seuils,
// et envoie des notifications push aux abonnés.
//
// Variables d'environnement requises :
//   MQTT_USER, MQTT_PASS, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY,
//   VAPID_EMAIL (ex: admin@piscine.local), CRON_SECRET, BLOB_READ_WRITE_TOKEN

import webpush from 'web-push';
import mqtt    from 'mqtt';
import { put, list } from '@vercel/blob';

// ── Config MQTT ───────────────────────────────────────────────────────────────
const BASE       = 'francois.soudant@gmail.com';
const MQTT_PROXY = 'wss://mqtt-proxy-piscine.onrender.com/mqtt';

// ── Seuils d'alerte ───────────────────────────────────────────────────────────
// Miroir exact de pool-model.js : mêmes normLow / normHigh que l'UI
// (température : seuils custom — absent de TOPICS car pas de normLow/normHigh)
const ALERT_CONFIG = {
  ph: {
    topic: `${BASE}/Piscine/PH`,
    normLow: 7.0, normHigh: 7.4, decimals: 1, unit: '',
  },
  redox: {
    topic: `${BASE}/Piscine/Redox`,
    normLow: 650, normHigh: 750, decimals: 0, unit: 'mV',
  },
  tac: {
    topic: `${BASE}/Piscine/TAC`,
    normLow: 80, normHigh: 120, decimals: 0, unit: 'ppm',
  },
  th: {
    topic: `${BASE}/Piscine/TH`,
    normLow: 100, normHigh: 250, decimals: 0, unit: 'ppm',
  },
  depression: {
    topic: `${BASE}/Piscine/Depression`,
    normLow: -3, normHigh: -1, decimals: 0, unit: 'bar',
    onlyLow: true, // Alerte uniquement si trop en dessous (filtre colmaté)
  },
  temperature: {
    topic: `${BASE}/Piscine/Temperature`,
    normLow: 15, normHigh: 32, decimals: 1, unit: '°C',
    // Seuils élargis : l'UI n'affiche pas de badge pour la température
    // mais des températures extrêmes méritent une notification
  },
};

// ── Messages d'alerte ─────────────────────────────────────────────────────────
const ALERT_MESSAGES = {
  ph: {
    low:  v => `pH trop bas : ${v.toFixed(1)} (norme 7,0 – 7,4)\n→ Ajouter du pH+`,
    high: v => `pH trop élevé : ${v.toFixed(1)} (norme 7,0 – 7,4)\n→ Ajouter du pH−`,
  },
  redox: {
    low:  v => `Redox insuffisant : ${Math.round(v)} mV (norme 650 – 750)\n→ Ajouter du chlore`,
    high: v => `Redox trop élevé : ${Math.round(v)} mV\n→ Eau surchlorée, ajouter de l'eau fraîche`,
  },
  tac: {
    low:  v => `TAC trop bas : ${Math.round(v)} ppm (norme 80 – 120)\n→ Bicarbonate de soude`,
    high: v => `TAC trop élevé : ${Math.round(v)} ppm (norme 80 – 120)\n→ Acide chlorhydrique`,
  },
  th: {
    low:  v => `TH trop bas : ${Math.round(v)} ppm (norme 100 – 250)\n→ Chlorure de calcium`,
    high: v => `TH trop élevé : ${Math.round(v)} ppm (norme 100 – 250)\n→ Renouveler de l'eau`,
  },
  depression: {
    low:  v => `Dépression pompe : ${v} bar\n→ Nettoyage des filtres requis`,
    high: () => null,
  },
  temperature: {
    low:  v => `Température basse : ${v.toFixed(1)} °C`,
    high: v => `Température élevée : ${v.toFixed(1)} °C\n→ Risque de prolifération algale`,
  },
};

const COOLDOWN_MS = 4 * 60 * 60 * 1000; // 4h min entre deux alertes identiques
const BLOB_PATH   = 'piscine-push-subs.json';

// ── VAPID ─────────────────────────────────────────────────────────────────────
webpush.setVapidDetails(
  `mailto:${process.env.VAPID_EMAIL || 'admin@piscine.local'}`,
  process.env.VAPID_PUBLIC_KEY,
  process.env.VAPID_PRIVATE_KEY,
);

// ── Helpers Blob ──────────────────────────────────────────────────────────────
async function readStore() {
  try {
    const { blobs } = await list({ prefix: BLOB_PATH });
    if (!blobs.length) return { subscriptions: [], lastAlerts: {} };
    const res = await fetch(blobs[0].url, { cache: 'no-store' });
    return await res.json();
  } catch {
    return { subscriptions: [], lastAlerts: {} };
  }
}

async function writeStore(store) {
  await put(BLOB_PATH, JSON.stringify(store, null, 2), {
    access: 'public',
    addRandomSuffix: false,
    contentType: 'application/json',
  });
}

// ── Lecture MQTT (messages retained → arrivée quasi-immédiate) ───────────────
async function fetchMqttState() {
  return new Promise(resolve => {
    const client = mqtt.connect(MQTT_PROXY, {
      username: process.env.MQTT_USER,
      password: process.env.MQTT_PASS,
      protocol: 'wss',
      rejectUnauthorized: false,
    });

    const allTopics  = Object.values(ALERT_CONFIG).map(c => c.topic);
    const topicToKey = Object.fromEntries(
      Object.entries(ALERT_CONFIG).map(([k, v]) => [v.topic, k])
    );
    const state = {};

    // Résoudre après 18s avec l'état partiel (plutôt que rejeter)
    const timeout = setTimeout(() => {
      console.warn('⚠️ MQTT timeout — état partiel:', state);
      client.end();
      resolve(state);
    }, 18000);

    client.on('connect', () => {
      allTopics.forEach(t => client.subscribe(t, { qos: 1 }));
    });

    client.on('message', (topic, msg) => {
      const key = topicToKey[topic];
      if (!key) return;
      const val = parseFloat(msg.toString());
      if (!isNaN(val)) state[key] = val;

      // Résolution anticipée si on a tout reçu
      if (Object.keys(state).length >= allTopics.length) {
        clearTimeout(timeout);
        client.end();
        resolve(state);
      }
    });

    client.on('error', err => {
      console.error('❌ MQTT error:', err.message);
      clearTimeout(timeout);
      client.end();
      resolve(state); // état partiel plutôt qu'exception
    });
  });
}

// ── Détection des dépassements ────────────────────────────────────────────────
function detectAlerts(state) {
  const alerts = [];

  for (const [key, cfg] of Object.entries(ALERT_CONFIG)) {
    const value = state[key];
    if (value === undefined || value === null) continue;

    // Seuil haut
    if (!cfg.onlyLow && cfg.normHigh !== undefined && value > cfg.normHigh) {
      const msg = ALERT_MESSAGES[key]?.high?.(value);
      if (msg) alerts.push({ key, direction: 'high', message: msg });
    }
    // Seuil bas
    else if (cfg.normLow !== undefined && value < cfg.normLow) {
      const msg = ALERT_MESSAGES[key]?.low?.(value);
      if (msg) alerts.push({ key, direction: 'low', message: msg });
    }
  }

  return alerts;
}

// ── Handler ───────────────────────────────────────────────────────────────────
export default async function handler(req, res) {
  // Vercel injecte automatiquement Authorization: Bearer ${CRON_SECRET}
  // sur les requêtes cron si CRON_SECRET est défini dans les env vars
  if (req.headers.authorization !== `Bearer ${process.env.CRON_SECRET}`) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  // Lecture parallèle MQTT + store
  const [state, store] = await Promise.all([fetchMqttState(), readStore()]);
  console.log('📊 État MQTT:', state);
  console.log(`👥 Abonnés push : ${store.subscriptions.length}`);

  if (!store.subscriptions.length) {
    return res.json({ ok: true, info: 'Aucun abonné push', state });
  }

  const alerts = detectAlerts(state);
  console.log('🚨 Alertes détectées :', alerts.map(a => `${a.key}(${a.direction})`));

  const now          = Date.now();
  let storeModified  = false;
  const sent         = [];
  const skipped      = [];
  const deadEndpoints = [];

  for (const alert of alerts) {
    // Vérification cooldown
    const lastTime   = store.lastAlerts?.[alert.key];
    const inCooldown = lastTime && (now - new Date(lastTime).getTime()) < COOLDOWN_MS;

    if (inCooldown) {
      skipped.push(alert.key);
      console.log(`⏸ ${alert.key} en cooldown (dernière alerte : ${lastTime})`);
      continue;
    }

    // Envoi à tous les abonnés
    for (const sub of store.subscriptions) {
      try {
        await webpush.sendNotification(sub, JSON.stringify({
          title:    '🏊 Piscine — Alerte',
          body:     alert.message,
          icon:     '/icons/icon-192.png',
          badge:    '/icons/icon-72.png',
          tag:      `piscine-${alert.key}`,  // écrase la notif précédente du même paramètre
          renotify: true,
          data:     { key: alert.key },
        }));
        console.log(`📬 Push envoyé [${alert.key}] → ${sub.endpoint.slice(-20)}…`);
      } catch (err) {
        if (err.statusCode === 410 || err.statusCode === 404) {
          // Subscription expirée côté navigateur
          deadEndpoints.push(sub.endpoint);
        } else {
          console.error(`❌ Push échoué [${alert.key}]:`, err.message);
        }
      }
    }

    store.lastAlerts[alert.key] = new Date().toISOString();
    sent.push(alert.key);
    storeModified = true;
  }

  // Réinitialiser le cooldown des paramètres revenus dans les normes
  // → permet d'alerter à nouveau dès le prochain dépassement
  const alertKeys = new Set(alerts.map(a => a.key));
  for (const key of Object.keys(store.lastAlerts || {})) {
    if (!alertKeys.has(key)) {
      delete store.lastAlerts[key];
      storeModified = true;
      console.log(`✅ ${key} revenu dans les normes — cooldown réinitialisé`);
    }
  }

  // Nettoyer les subscriptions expirées
  if (deadEndpoints.length) {
    store.subscriptions = store.subscriptions.filter(
      s => !deadEndpoints.includes(s.endpoint)
    );
    storeModified = true;
    console.log(`🧹 ${deadEndpoints.length} subscription(s) expirée(s) supprimées`);
  }

  if (storeModified) await writeStore(store);

  return res.json({ ok: true, state, alerts: alerts.map(a => a.key), sent, skipped });
}
