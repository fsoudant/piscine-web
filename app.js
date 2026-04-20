/**
 * app.js
 * Câblage UI — Orchestration via PoolController
 *
 * Ce fichier ne connaît ni MqttService ni Pool directement.
 * Il câble l'UI (UIController) avec la façade (PoolController).
 */

'use strict';

import { PoolController, ConnectionState } from './pool-controller.js';
import { TOPICS, MODES }                   from './shared/pool-model.js';
import { UIController }                    from './ui-controller.js';

// ── Instances ──────────────────────────────────────────────────────────────

const controller = new PoolController();
const ui         = new UIController();

// ── MQTT → UI ──────────────────────────────────────────────────────────────

controller.on('stateChange', state => {
  ui.setConnectionStatus(state);

  if (state === ConnectionState.CONNECTED) {
    ui.hideModal();
  }
});

controller.on('error', err => {
  ui.showConnError('Erreur de connexion : ' + err.message);
});

controller.on('valueChange', (key, val) => {
  dispatchToUI(key, val);
});

// ── UI → Controller ────────────────────────────────────────────────────────

ui.onConnect = ({ user, pass }) => {
  controller.connect(user, pass);
};

ui.onPublish = (topic, value) => {
  controller.publish(topic, value);
};

ui.onModeChange = mode => {
  controller.setValue('mode', mode);
  ui.updateMode(mode);
};

// Amorçage pompes — affiche le chronomètre de progression
ui.onPrimeRequest = key => {
  const keyMap = { 'amorceph': 'amorcePH', 'amorceredox': 'amorceRedox' };
  const poolKey = keyMap[key];
  if (!poolKey) return;
  controller.setValue(poolKey, 1);
  ui.showPriming(key);
  // L'ESP12F remet à 0 via MQTT
};

// Étalonnage pH / TDS — simple impulsion 0→1 ; l'ESP renvoie 0 quand c'est fait
ui.onEtalonnage = poolKey => {
  controller.setValue(poolKey, 1);
};

// ── Dispatch valeurs vers UI ───────────────────────────────────────────────

function dispatchToUI(key, val) {

  const readSliderKeys = ['ph', 'redox', 'tds', 'temperature', 'depression', 'tac', 'th'];
  if (readSliderKeys.includes(key)) {
    updateReadSlider(key, val);
  }

  const simpleMap = {
    tempMoy:   'val-tempmoy',
    tempMin:   'val-tempmin',
    tempMax:   'val-tempmax',
    frequence: 'val-freq',
  };
  if (simpleMap[key]) {
    const meta = TOPICS[key];
    ui.updateSimpleValue(simpleMap[key], val, meta.decimals, meta.unit);
  }

  const timeKeys = ['heureDeb', 'minDeb', 'heureFin', 'minFin'];
  if (timeKeys.includes(key) && ui.updateFiltrationTime) {
    ui.updateFiltrationTime(
      controller.getValue('heureDeb') ?? 0,
      controller.getValue('minDeb')   ?? 0,
      controller.getValue('heureFin') ?? 0,
      controller.getValue('minFin')   ?? 0,
    );
  }

  const paramKeys = ['volume','debitpompe','pompeph','pomperedox',
                     'freqbasse','freqmoy','freqhaute','minfreqhaut',
                     'etalonph1','etalonph2','etalontds2'];
  if (paramKeys.includes(key.toLowerCase())) {
    const meta = TOPICS[key];
    ui.syncEditableSlider('p-' + key.toLowerCase(), 'pv-' + key.toLowerCase(),
                          val, meta.decimals, meta.unit);
  }

  if (key === 'mode') {
    ui.updateMode(val);
  }

  // Mise à jour du libellé des boutons d'étalonnage (valeur courante de l'étalon)
  const etalonLabelMap = {
    etalonPh1:  { span: 'lbl-etalonph1',  decimals: 2, unit: '' },
    etalonPh2:  { span: 'lbl-etalonph2',  decimals: 2, unit: '' },
    etalonTds2: { span: 'lbl-etalontds2', decimals: 0, unit: 'ppm' },
  };
  if (etalonLabelMap[key]) {
    const { span, decimals, unit } = etalonLabelMap[key];
    ui.updateEtalonnageLabel(span, val, decimals, unit);
  }

  // État actif/inactif des boutons d'étalonnage (1 = en cours, 0 = terminé)
  const etalonStateMap = {
    etalonnagePh1:  'btn-etalonnageph1',
    etalonnagePh2:  'btn-etalonnageph2',
    etalonnageTds1: 'btn-etalonnageTds1',
    etalonnageTds2: 'btn-etalonnageTds2',
  };
  if (etalonStateMap[key]) {
    ui.setEtalonnageState(etalonStateMap[key], Number(val) === 1);
  }

  if (key === 'preco') {
    ui.updatePreco(val);
  }

  if (key === 'isl') {
    ui.updateISL(val);
  }
}

function updateTempWidget() {
  const cur = controller.getValue('temperature');
  const min = controller.getValue('tempMin');
  const max = controller.getValue('tempMax');
  const avg = controller.getValue('tempMoy');

  const elMin = document.getElementById('tw-bound-min');
  const elMax = document.getElementById('tw-bound-max');
  if (elMin) elMin.textContent = (min !== null) ? min.toFixed(1) + ' °C' : '-- °C';
  if (elMax) elMax.textContent = (max !== null) ? max.toFixed(1) + ' °C' : '-- °C';

  if (min === null || max === null || max <= min) return;
  const range = max - min;

  if (cur !== null) {
    const pct = Math.max(2, Math.min(98, ((cur - min) / range) * 100));
    const el     = document.getElementById('tw-cur');
    const bubble = document.getElementById('tw-cur-bubble');
    if (el)     el.style.left       = pct + '%';
    if (bubble) bubble.textContent  = cur.toFixed(1) + '°C';
  }

  if (avg !== null) {
    const pct = Math.max(2, Math.min(98, ((avg - min) / range) * 100));
    const el  = document.getElementById('tw-avg');
    if (el) el.style.left = pct + '%';
  }
}

function updateReadSlider(key, val) {
  const meta    = TOPICS[key];
  const pct     = controller.normalize(key, val) * 100;
  const status  = controller.classify(key, val);
  const bounds  = controller.normBounds(key);
  const display = val.toFixed(meta.decimals);
  const badgeMap = { ok: '✓ OK', warn: '△ Hors norme', danger: '⚠ Alerte', info: '' };

  ui.updateReadSlider(
    key, pct,
    bounds ? bounds.low  * 100 : 0,
    bounds ? bounds.high * 100 : 100,
    status, display, badgeMap[status],
  );
}

// ── Démarrage ──────────────────────────────────────────────────────────────

document.addEventListener('DOMContentLoaded', () => {
  ui.setTopicsCache(TOPICS);
  ui.init();
  ui.buildModeButtons(MODES);

  // ── Sliders de lecture (pH, Redox, TDS, Température, Dépression) ──────────
  ['ph', 'redox', 'tds', 'temperature', 'depression'].forEach(key => {
    const meta = TOPICS[key];
    ui.setBoundsLabels(key, meta.min, meta.max, meta.unit);
    if (meta.normLow !== undefined) ui.setNormLabel(key, meta.normLow, meta.normHigh, meta.unit);
    ui.setUnit(`unit-${key}`, meta.unit);
  });

  // ── Sliders éditables (TAC, TH) ───────────────────────────────────────────
  ['tac', 'th'].forEach(key => {
    const meta = TOPICS[key];
    ui.setBoundsLabels(key, meta.min, meta.max, meta.unit);
    ui.setNormLabel(key, meta.normLow, meta.normHigh, meta.unit);
    ui.setUnit(`unit-${key}`, meta.unit);
  });

  // ── Valeurs simples (températures, fréquence) ─────────────────────────────
  ['tempMoy', 'tempMin', 'tempMax', 'frequence'].forEach(key => {
    ui.setUnit(`unit-${key}`, TOPICS[key].unit);
  });

  // ── ISL ───────────────────────────────────────────────────────────────────
  ui.setISLNormLabel('Équilibré entre −0,3 et +0,3');

  // ── Paramètres (onglet Paramètres) ────────────────────────────────────────
  [
    { key: 'volume',      id: 'p-volume'      },
    { key: 'debitPompe',  id: 'p-debitpompe'  },
    { key: 'pompePH',     id: 'p-pompeph'     },
    { key: 'pompeRedox',  id: 'p-pomperedox'  },
    { key: 'freqBasse',   id: 'p-freqbasse'   },
    { key: 'freqMoy',     id: 'p-freqmoy'     },
    { key: 'freqHaute',   id: 'p-freqhaute'   },
    { key: 'minFreqHaut', id: 'p-minfreqhaut' },
    { key: 'etalonPh1',   id: 'p-etalonph1'   },
    { key: 'etalonPh2',   id: 'p-etalonph2'   },
    { key: 'etalonTds2',  id: 'p-etalontds2'  },
  ].forEach(({ key, id }) => {
    const meta = TOPICS[key];
    ui.setSliderRange(id, meta.min, meta.max, undefined, meta.step);
    ui.setBoundsLabels(id, meta.min, meta.max, meta.unit);
    ui.bindParamSlider(id, 'pv-' + id.slice(2), meta.topic, meta.decimals, meta.unit);
  });

  ui.setConnectionStatus(ConnectionState.DISCONNECTED);
  ui.showModal();
});

// ── Service Worker ─────────────────────────────────────────────────────────

window.addEventListener('load', () => {
  setTimeout(() => {
    if (!('serviceWorker' in navigator)) {
      console.warn('⚠️ Service Workers non supportés par ce navigateur');
      return;
    }
    console.log('🔧 Enregistrement du Service Worker...');
    navigator.serviceWorker.register('./service-worker.js', { scope: './' })
      .then(reg => {
        const state = reg.installing ? 'Installation...'
                    : reg.waiting   ? 'En attente...'
                    : reg.active    ? 'Actif'
                    :                 'Inconnu';
        console.log('✅ Service Worker enregistré:', reg.scope, '—', state);
      })
      .catch(err => console.error('❌ Erreur Service Worker:', err));
  }, 500);
});
