/**
 * app.js
 * Câblage — Dependency Injection / Orchestration
 * Connecte les couches entre elles via IoC
 */

'use strict';

import { TOPICS, TOPIC_TO_KEY, setValue, getValue, computeISL, normalize, classify, normBounds } from './pool-model.js';
import { MqttService, ConnectionState } from './mqtt-service.js';
import { UIController } from './ui-controller.js';

// Configuration du proxy MQTT (en dur)
const MQTT_PROXY_CONFIG = {
  host: 'mqtt-proxy-piscine.onrender.com',
  port: 443,
  tls: true  // WSS
};

// ── INITIALISATION ─────────────────────────────────────────────────────────
const mqttService = new MqttService();
const ui = new UIController();

// ── MQTT → MODÈLE → UI ─────────────────────────────────────────────────────

mqttService.on('stateChange', state => {
  ui.setConnectionStatus(state);
  
  if (state === ConnectionState.CONNECTED) {
    ui.hideModal();
    // Attendre 100ms puis souscrire
    setTimeout(() => {
      mqttService.subscribe(Object.values(TOPICS).map(t => t.topic));
    }, 100);
  }
  
  if (state === ConnectionState.ERROR || state === ConnectionState.DISCONNECTED) {
    // Ne pas réafficher la modal automatiquement si l'utilisateur s'est déjà connecté
    // On laisse juste l'indicateur de statut
  }
});

mqttService.on('error', err => {
  ui.showConnError('Erreur de connexion : ' + err.message);
});

mqttService.on('message', (topic, rawValue) => {
  console.log('📨', topic, ':', rawValue);
  
  const key = TOPIC_TO_KEY[topic];
  if (!key) return;

  const val = setValue(key, rawValue);
  if (val === null) return;

  dispatchToUI(key, val);
});

// ── UI → MODÈLE → MQTT ─────────────────────────────────────────────────────

ui.onConnect = (credentials) => {
  // Combiner le proxy avec les credentials
  const config = {
    ...MQTT_PROXY_CONFIG,
    user: credentials.user,
    pass: credentials.pass
  };
  
  mqttService.connect(config);
};

ui.onPublish = (topic, value) => {
  mqttService.publish(topic, value);
};

ui.onModeChange = (mode) => {
  mqttService.publish(TOPICS.mode.topic, mode);
  setValue('mode', mode);
  ui.updateMode(mode);
};

ui.onPrimeRequest = (key) => {
  const topicMap = {
    'amorceph':    TOPICS.amorcePH.topic,
    'amorceredox': TOPICS.amorceRedox.topic,
  };
  
  const topic = topicMap[key];
  if (!topic) return;

  mqttService.publish(topic, '1', false);
  ui.showPriming(key);

  setTimeout(() => {
    mqttService.publish(topic, '0', false);
    ui.hidePriming(key);
  }, 5000);
};

// ── DISPATCH MESSAGES VERS UI ──────────────────────────────────────────────

function dispatchToUI(key, val) {
  const readSliderKeys = ['ph', 'redox', 'tds', 'temperature', 'depression'];
  if (readSliderKeys.includes(key)) {
    updateReadSlider(key, val);
  }

  if (key === 'tac' || key === 'th') {
    const meta = TOPICS[key];
    ui.syncEditableSlider('slider-' + key, 'val-' + key, val, 0, meta.unit);
  }

  const simpleMap = {
    tempMoy:   { id: 'val-tempmoy', dec: 1, unit: '°C' },
    tempMin:   { id: 'val-tempmin', dec: 1, unit: '°C' },
    tempMax:   { id: 'val-tempmax', dec: 1, unit: '°C' },
    frequence: { id: 'val-freq',    dec: 1, unit: 'Hz' },
  };
  if (simpleMap[key]) {
    const s = simpleMap[key];
    ui.updateSimpleValue(s.id, val, s.dec, s.unit);
  }

  const timeMap = {
    heureDeb: 'hDeb', minDeb: 'mDeb', heureFin: 'hFin', minFin: 'mFin'
  };
  if (timeMap[key]) ui.updateTimeField(timeMap[key], val);

  const paramKeys = ['volume','debitpompe','pompeph','pomperedox',
                     'freqbasse','freqmoy','freqhaute','minfreqhaut',
                     'etalonph1','etalonph2'];
  if (paramKeys.includes(key.toLowerCase())) {
    const meta = TOPICS[key];
    const dec  = meta.unit === 'm³/h' || meta.unit === 'pH' ? 1 : 0;
    ui.syncEditableSlider('p-' + key.toLowerCase(), 'pv-' + key.toLowerCase(), val, dec, meta.unit);
  }

  if (key === 'mode') ui.updateMode(val);

  const islDeps = ['ph', 'tds', 'th', 'tac', 'temperature'];
  if (islDeps.includes(key)) {
    ui.updateISL(computeISL());
  }
}

function updateReadSlider(key, val) {
  const meta    = TOPICS[key];
  const pct     = normalize(key, val) * 100;
  const status  = classify(key, val);
  const bounds  = normBounds(key);
  const dec     = (meta.max - meta.min) > 50 ? 0 : 1;
  const display = val.toFixed(dec);
  const badgeMap = { ok: '✓ OK', warn: '△ Hors norme', danger: '⚠ Alerte', info: '' };

  ui.updateReadSlider(
    key, pct,
    bounds ? bounds.low  * 100 : 0,
    bounds ? bounds.high * 100 : 100,
    status, display, badgeMap[status]
  );
}

// ── DÉMARRAGE ──────────────────────────────────────────────────────────────

document.addEventListener('DOMContentLoaded', () => {
  ui.init();
  ui.setConnectionStatus(ConnectionState.DISCONNECTED);
  ui.showModal();
});

// Enregistrement du Service Worker
window.addEventListener('load', () => {
  setTimeout(() => {
    if ('serviceWorker' in navigator) {
      console.log('🔧 Enregistrement du Service Worker...');
      navigator.serviceWorker.register('/service-worker.js', { scope: '/' })
        .then(registration => {
          console.log('✅ Service Worker enregistré:', registration.scope);
          console.log('📦 État:', registration.installing ? 'Installation...' : 
                                 registration.waiting ? 'En attente...' : 
                                 registration.active ? 'Actif' : 'Inconnu');
        })
        .catch(error => {
          console.error('❌ Erreur Service Worker:', error);
          console.error('Détails:', error.message);
          console.error('Stack:', error.stack);
        });
    } else {
      console.warn('⚠️ Service Workers non supportés par ce navigateur');
    }
  }, 500);
});
