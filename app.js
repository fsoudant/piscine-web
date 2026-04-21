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
import { PushManager }                     from './push-manager.js';

// ── Instances ──────────────────────────────────────────────────────────────

const controller = new PoolController();
const ui         = new UIController();
const push       = new PushManager();

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

  // ── Température seule garde l'ancien slider ────────────────────────────
  if (key === 'temperature') {
    updateReadSlider(key, val);
    updateTempWidget();
  }

  // ── Widget temp (min/moy/max) ──────────────────────────────────────────
  if (['tempMin', 'tempMax', 'tempMoy'].includes(key)) {
    updateTempWidget();
  }

  // ── Valeurs simples ────────────────────────────────────────────────────
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

  // ── Plage de filtration ────────────────────────────────────────────────
  const timeKeys = ['heureDeb', 'minDeb', 'heureFin', 'minFin'];
  if (timeKeys.includes(key) && ui.updateFiltrationTime) {
    ui.updateFiltrationTime(
      controller.getValue('heureDeb') ?? 0,
      controller.getValue('minDeb')   ?? 0,
      controller.getValue('heureFin') ?? 0,
      controller.getValue('minFin')   ?? 0,
    );
  }

  // ── Paramètres éditables (onglet Paramètres) ───────────────────────────
  const paramKeys = ['volume','debitpompe','pompeph','pomperedox',
                     'freqbasse','freqmoy','freqhaute','minfreqhaut',
                     'etalonph1','etalonph2','etalontds2'];
  if (paramKeys.includes(key.toLowerCase())) {
    const meta = TOPICS[key];
    ui.syncEditableSlider('p-' + key.toLowerCase(), 'pv-' + key.toLowerCase(),
                          val, meta.decimals, meta.unit);
  }

  // ── Mode ───────────────────────────────────────────────────────────────
  if (key === 'mode') {
    ui.updateMode(val);
  }

  // ── Paramètres physico-chimiques + dépression → chem widget ───────────
  const chemKeys = ['ph', 'redox', 'tac', 'th', 'tds', 'depression'];
  if (chemKeys.includes(key)) {
    updateChemRow(key, val);
  }

  // ── ISL → widget ISL ───────────────────────────────────────────────────
  if (key === 'isl') {
    updateIslRow(val);
  }

  // ── Étalonnage labels ──────────────────────────────────────────────────
  const etalonLabelMap = {
    etalonPh1:  { span: 'lbl-etalonph1',  decimals: 2, unit: '' },
    etalonPh2:  { span: 'lbl-etalonph2',  decimals: 2, unit: '' },
    etalonTds2: { span: 'lbl-etalontds2', decimals: 0, unit: 'ppm' },
  };
  if (etalonLabelMap[key]) {
    const { span, decimals, unit } = etalonLabelMap[key];
    ui.updateEtalonnageLabel(span, val, decimals, unit);
  }

  // ── Étalonnage états boutons ───────────────────────────────────────────
  const etalonStateMap = {
    etalonnagePh1:  'btn-etalonnageph1',
    etalonnagePh2:  'btn-etalonnageph2',
    etalonnageTds1: 'btn-etalonnageTds1',
    etalonnageTds2: 'btn-etalonnageTds2',
  };
  if (etalonStateMap[key]) {
    ui.setEtalonnageState(etalonStateMap[key], Number(val) === 1);
  }

  // ── Préconisation ──────────────────────────────────────────────────────
  if (key === 'preco') {
    ui.updatePreco(val);
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

function initChemWidget() {
  const chemKeys = ['ph', 'redox', 'tac', 'th', 'tds'];
  chemKeys.forEach(key => {
    const meta = TOPICS[key];
    const bar  = document.getElementById('bar-' + key);
    if (!bar || meta.normLow === undefined) return;

    const range   = meta.max - meta.min;
    const lowPct  = (meta.normLow  - meta.min) / range * 100;
    const highPct = (meta.normHigh - meta.min) / range * 100;
    const tw = 5; // largeur de la zone de transition en %

    const l1 = Math.max(0,   lowPct  - tw).toFixed(1);
    const l2 = lowPct.toFixed(1);
    const h1 = highPct.toFixed(1);
    const h2 = Math.min(100, highPct + tw).toFixed(1);

    let gradient;
    if (highPct >= 99) {
      // Pas de danger à droite (ex: TDS — normHigh = max)
      gradient = `linear-gradient(90deg, var(--danger) 0%, var(--warning) ${l1}%, var(--success) ${l2}%, var(--success) 100%)`;
    } else if (lowPct <= 1) {
      // Pas de danger à gauche
      gradient = `linear-gradient(90deg, var(--success) 0%, var(--success) ${h1}%, var(--warning) ${h2}%, var(--danger) 100%)`;
    } else {
      gradient = `linear-gradient(90deg, var(--danger) 0%, var(--warning) ${l1}%, var(--success) ${l2}%, var(--success) ${h1}%, var(--warning) ${h2}%, var(--danger) 100%)`;
    }
    bar.style.background = gradient;

    // Labels
    const fmtN = v => Number.isInteger(v) ? v : v.toFixed(1);
    const u = meta.unit ? '\u00a0' + meta.unit : '';
    const minEl  = document.getElementById('crmin-'  + key);
    const maxEl  = document.getElementById('crmax-'  + key);
    const normEl = document.getElementById('crnorm-' + key);
    if (minEl)  minEl.textContent  = meta.min  + u;
    if (maxEl)  maxEl.textContent  = meta.max  + u;
    if (normEl) normEl.textContent = `${fmtN(meta.normLow)} – ${fmtN(meta.normHigh)}` + u;
  });
  
// ISL — plage fixe −5 / +5, normes −0.3 / +0.3
  const islBar = document.getElementById('bar-isl');
  if (islBar) {
    const ISL_MIN = -5, ISL_MAX = 5, ISL_LOW = -0.3, ISL_HIGH = 0.3;
    const range   = ISL_MAX - ISL_MIN;
    const lowPct  = (ISL_LOW  - ISL_MIN) / range * 100; // ≈ 47%
    const highPct = (ISL_HIGH - ISL_MIN) / range * 100; // ≈ 53%
    const tw = 5;
    const l1 = (lowPct  - tw).toFixed(1);
    const l2 = lowPct.toFixed(1);
    const h1 = highPct.toFixed(1);
    const h2 = (highPct + tw).toFixed(1);
    islBar.style.background =
      `linear-gradient(90deg, var(--danger) 0%, var(--warning) ${l1}%, var(--success) ${l2}%, var(--success) ${h1}%, var(--warning) ${h2}%, var(--danger) 100%)`;
  }
}

function updateChemRow(key, val) {
  const meta    = TOPICS[key];
  const status  = controller.classify(key, val);
  const pct     = Math.max(2, Math.min(98, controller.normalize(key, val) * 100));
  const display = val.toFixed(meta.decimals);
  const unit    = meta.unit;
  const badgeMap = { ok: '✓ OK', warn: '△ Hors norme', danger: '⚠ Alerte', info: '' };
  const colorMap = { ok: 'var(--success)', warn: 'var(--warning)', danger: 'var(--danger)', info: 'var(--accent)' };

  const valEl  = document.getElementById('val-'    + key);
  const badge  = document.getElementById('badge-'  + key);
  const pin    = document.getElementById('pin-'    + key);
  const bubble = document.getElementById('bubble-' + key);
  const dot    = document.getElementById('dot-'    + key);

  if (valEl)  valEl.textContent   = display;
  if (badge)  { badge.textContent = badgeMap[status]; badge.className = 'badge ' + status; }
  if (pin)    pin.style.left      = pct + '%';
  if (bubble) bubble.textContent  = display + (unit ? '\u00a0' + unit : '');
  if (dot) {
    dot.style.borderColor = colorMap[status];
    dot.style.boxShadow   = `0 0 8px ${colorMap[status]}80, 0 2px 4px rgba(0,0,0,.4)`;
  }
}

function updateIslRow(result) {
  if (!result) return;
  const { value, status } = result;
  const ISL_MIN = -5, ISL_MAX = 5;
  const pct    = Math.max(2, Math.min(98, (value - ISL_MIN) / (ISL_MAX - ISL_MIN) * 100));
  const display = value.toFixed(2);
  const badgeMap = { ok: '✓ Équilibré', warn: '△ À corriger', danger: '⚠ Corrosif/Entartrant' };
  const colorMap = { ok: 'var(--success)', warn: 'var(--warning)', danger: 'var(--danger)' };

  const valEl  = document.getElementById('val-isl');
  const badge  = document.getElementById('badge-isl');
  const pin    = document.getElementById('pin-isl');
  const bubble = document.getElementById('bubble-isl');
  const dot    = document.getElementById('dot-isl');

  if (valEl)  { valEl.textContent = display; valEl.style.color = colorMap[status]; }
  if (badge)  { badge.textContent = badgeMap[status]; badge.className = 'badge ' + status; }
  if (pin)    pin.style.left     = pct + '%';
  if (bubble) bubble.textContent = display;
  if (dot) {
    dot.style.borderColor = colorMap[status];
    dot.style.boxShadow   = `0 0 8px ${colorMap[status]}80, 0 2px 4px rgba(0,0,0,.4)`;
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

  // ── NOUVEAU : initialise les barres dégradées ──────────────────────────
  initChemWidget();

  // ── NOUVEAU : bind édition TAC et TH ──────────────────────────────────
  ['tac', 'th'].forEach(key => {
    const row = document.getElementById('cr-' + key);
    if (!row) return;
    row.addEventListener('click', () => {
      const meta = TOPICS[key];
      const cur  = controller.getValue(key);
      const newVal = prompt(
        `Nouvelle valeur pour ${key.toUpperCase()} (${meta.min} – ${meta.max} ${meta.unit})`,
        cur !== null ? cur : ''
      );
      if (newVal === null) return;
      const num = parseFloat(newVal);
      if (isNaN(num) || num < meta.min || num > meta.max) {
        alert(`Valeur invalide. Entrez un nombre entre ${meta.min} et ${meta.max}.`);
        return;
      }
      controller.publish(meta.topic, num);
    });
  });

  // ── Sliders de lecture (température, dépression) ──────────────────────
  /*
  ['temperature', 'depression'].forEach(key => {
    const meta = TOPICS[key];
    ui.setBoundsLabels(key, meta.min, meta.max, meta.unit);
    if (meta.normLow !== undefined) ui.setNormLabel(key, meta.normLow, meta.normHigh, meta.unit);
    ui.setUnit(`unit-${key}`, meta.unit);
  });
  */

  // ── Valeurs simples (fréquence) ───────────────────────────────────────
  ['tempMoy', 'tempMin', 'tempMax', 'frequence'].forEach(key => {
    ui.setUnit(`unit-${key}`, TOPICS[key].unit);
  });

  // ── Paramètres (onglet Paramètres) ────────────────────────────────────
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

// ── Service Worker + Push ──────────────────────────────────────────────────

window.addEventListener('load', () => {
  setTimeout(async () => {
    if (!('serviceWorker' in navigator)) {
      console.warn('⚠️ Service Workers non supportés par ce navigateur');
      return;
    }
    console.log('🔧 Enregistrement du Service Worker...');
    let swReg;
    try {
      swReg = await navigator.serviceWorker.register('./service-worker.js', { scope: './' });
      const state = swReg.installing ? 'Installation...'
                  : swReg.waiting   ? 'En attente...'
                  : swReg.active    ? 'Actif'
                  :                   'Inconnu';
      console.log('✅ Service Worker enregistré:', swReg.scope, '—', state);
    } catch (err) {
      console.error('❌ Erreur Service Worker:', err);
      return;
    }

    // ── Init push : attendre que le SW soit actif ────────────────────────
    const activeSw = swReg.active || await new Promise(resolve => {
      const sw = swReg.installing || swReg.waiting;
      if (!sw) { resolve(null); return; }
      sw.addEventListener('statechange', e => {
        if (e.target.state === 'activated') resolve(swReg.active);
      });
    });

    if (!activeSw) return;

    const pushState = await push.init(swReg);
    console.log('🔔 État push initial:', pushState);
    updateNotifBtn(pushState);

    // Clic sur le bouton cloche
    document.getElementById('notifBtn')?.addEventListener('click', async () => {
      const btn = document.getElementById('notifBtn');
      if (!push.isSupported) {
        alert('Les notifications ne sont pas supportées sur ce navigateur.\n'
            + '(Sur iOS : installez d\'abord l\'app sur l\'écran d\'accueil)');
        return;
      }
      if (push.permission === 'denied') {
        alert('Les notifications ont été bloquées.\nVeuillez les autoriser dans les réglages du navigateur.');
        return;
      }
      btn.disabled = true;
      try {
        const newState = await push.toggle(updateNotifBtn);
        console.log('🔔 Notifications:', newState);
      } catch (err) {
        console.error('❌ Push toggle error:', err.message);
        alert('Impossible d\'activer les notifications :\n' + err.message);
      } finally {
        btn.disabled = false;
      }
    });

  }, 500);
});

// ── Mise à jour visuelle du bouton cloche ──────────────────────────────────

function updateNotifBtn(state) {
  const btn = document.getElementById('notifBtn');
  if (!btn) return;
  const map = {
    subscribed:  { icon: '🔔', title: 'Notifications activées — cliquer pour désactiver', cls: 'active'   },
    idle:        { icon: '🔕', title: 'Activer les notifications push',                   cls: ''         },
    denied:      { icon: '🚫', title: 'Notifications bloquées par le navigateur',         cls: 'denied'   },
    unsupported: { icon: '🔕', title: 'Notifications non supportées',                     cls: 'disabled' },
    error:       { icon: '🔕', title: 'Erreur de configuration push',                     cls: 'disabled' },
  };
  const { icon, title, cls } = map[state] || map.idle;
  btn.textContent = icon;
  btn.title       = title;
  btn.className   = 'notif-btn' + (cls ? ' ' + cls : '');
}