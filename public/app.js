/**
 * app.js
 * Câblage — Dependency Injection / Orchestration
 * Connecte les couches entre elles via IoC
 */

'use strict';

import { TOPICS, TOPIC_TO_KEY, MODES, setValue, getValue, computeISL, normalize, classify, normBounds } from '../shared/pool-model.js';
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
  console.log('🎛️ Mode changé par utilisateur:', mode);
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
  const readSliderKeys = ['ph', 'redox', 'tds', 'temperature', 'depression', 'tac', 'th'];
  if (readSliderKeys.includes(key)) {
    updateReadSlider(key, val);
  }

  const simpleMap = {
    tempMoy:   { key: 'tempMoy',   id: 'val-tempmoy' },
    tempMin:   { key: 'tempMin',   id: 'val-tempmin' },
    tempMax:   { key: 'tempMax',   id: 'val-tempmax' },
    frequence: { key: 'frequence', id: 'val-freq' },
  };
  if (simpleMap[key]) {
    const s = simpleMap[key];
    const meta = TOPICS[s.key];
    ui.updateSimpleValue(s.id, val, meta.decimals, meta.unit);
  }

  const timeKeys = ['heureDeb', 'minDeb', 'heureFin', 'minFin'];
  if (timeKeys.includes(key)) {
    // Collecter toutes les valeurs de filtration
    import('../shared/pool-model.js').then(module => {
      const hDeb = module.getValue('heureDeb') || 0;
      const mDeb = module.getValue('minDeb') || 0;
      const hFin = module.getValue('heureFin') || 0;
      const mFin = module.getValue('minFin') || 0;
      
      // Mettre à jour le double slider si tous les paramètres sont définis
      if (ui.updateFiltrationTime) {
        ui.updateFiltrationTime(hDeb, mDeb, hFin, mFin);
      }
    });
  }

  const paramKeys = ['volume','debitpompe','pompeph','pomperedox',
                     'freqbasse','freqmoy','freqhaute','minfreqhaut',
                     'etalonph1','etalonph2'];
  if (paramKeys.includes(key.toLowerCase())) {
    const meta = TOPICS[key];
    ui.syncEditableSlider('p-' + key.toLowerCase(), 'pv-' + key.toLowerCase(), val, meta.decimals, meta.unit);
  }

  if (key === 'mode') {
    console.log('📨 Mode reçu depuis MQTT:', val, typeof val);
    ui.updateMode(val);
  }

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
  const display = val.toFixed(meta.decimals); // Utilise decimals depuis TOPICS
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
  
  // Construire les boutons de mode depuis pool-model.js
  ui.buildModeButtons(MODES);
  
  // ═══════════════════════════════════════════════════════════════════════════
  // INJECTION COMPLÈTE DES MÉTADONNÉES DEPUIS pool-model.js
  // ═══════════════════════════════════════════════════════════════════════════
  
  // 1. Sliders de lecture avec normes (pH, Redox, TDS, Température, Dépression)
  const readSliderKeys = ['ph', 'redox', 'tds', 'temperature', 'depression'];
  readSliderKeys.forEach(key => {
    const meta = TOPICS[key];
    
    // Injecter les bornes min/max
    ui.setBoundsLabels(key, meta.min, meta.max, meta.unit);
    
    // Injecter les normes
    if (meta.normLow !== undefined && meta.normHigh !== undefined) {
      ui.setNormLabel(key, meta.normLow, meta.normHigh, meta.unit);
    }
    
    // Injecter l'unité
    const unitId = `unit-${key}`;
    ui.setUnit(unitId, meta.unit);
  });
  
  // 2. Sliders éditables (TAC, TH) - Utilisent la même structure que les read sliders
  const editableSliderKeys = ['tac', 'th'];
  editableSliderKeys.forEach(key => {
    const meta = TOPICS[key];
    
    // Injecter les bornes min/max
    ui.setBoundsLabels(key, meta.min, meta.max, meta.unit);
    
    // Injecter les normes
    ui.setNormLabel(key, meta.normLow, meta.normHigh, meta.unit);
    
    // Injecter l'unité
    ui.setUnit(`unit-${key}`, meta.unit);
  });
  
  // 3. Valeurs simples avec unités (tempMoy, tempMin, tempMax, frequence)
  ['tempMoy', 'tempMin', 'tempMax', 'frequence'].forEach(key => {
    const meta = TOPICS[key];
    ui.setUnit(`unit-${key}`, meta.unit);
  });
  
  // 4. Label ISL (norme spéciale)
  ui.setISLNormLabel('Équilibré entre −0,3 et +0,3');
  
  // 5. Paramètres (onglet Paramètres)
  const paramKeys = [
    { key: 'volume',      id: 'p-volume' },
    { key: 'debitPompe',  id: 'p-debitpompe' },
    { key: 'pompePH',     id: 'p-pompeph' },
    { key: 'pompeRedox',  id: 'p-pomperedox' },
    { key: 'freqBasse',   id: 'p-freqbasse' },
    { key: 'freqMoy',     id: 'p-freqmoy' },
    { key: 'freqHaute',   id: 'p-freqhaute' },
    { key: 'minFreqHaut', id: 'p-minfreqhaut' },
    { key: 'etalonPh1',   id: 'p-etalonph1' },
    { key: 'etalonPh2',   id: 'p-etalonph2' },
  ];
  
  paramKeys.forEach(({ key, id }) => {
    const meta = TOPICS[key];
    
    // Configurer le slider
    ui.setSliderRange(id, meta.min, meta.max, undefined, meta.step);
    
    // Injecter les bornes avec unités
    ui.setBoundsLabels(id, meta.min, meta.max, meta.unit);
  });
  
  // 6. Double slider de filtration (initialisé dans _bindFiltrationSlider)
  // Les valeurs hDeb, mDeb, hFin, mFin seront mises à jour automatiquement via dispatchToUI
  
  // ═══════════════════════════════════════════════════════════════════════════
  
  ui.setConnectionStatus(ConnectionState.DISCONNECTED);
  ui.showModal();
});

// Enregistrement du Service Worker
window.addEventListener('load', () => {
  setTimeout(() => {
    if ('serviceWorker' in navigator) {
      console.log('🔧 Enregistrement du Service Worker...');
      navigator.serviceWorker.register('./service-worker.js', { scope: './' })
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
