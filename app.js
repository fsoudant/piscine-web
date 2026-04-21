/**
 * app.js
 * Câblage UI — Orchestration via PoolController + PushManager
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
  if (state === ConnectionState.CONNECTED) ui.hideModal();
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

ui.onPrimeRequest = key => {
  const keyMap = { 'amorceph': 'amorcePH', 'amorceredox': 'amorceRedox' };
  const poolKey = keyMap[key];
  if (!poolKey) return;
  controller.setValue(poolKey, 1);
  ui.showPriming(key);
};

ui.onEtalonnage = poolKey => {
  controller.setValue(poolKey, 1);
};

// ── Dispatch valeurs vers UI ───────────────────────────────────────────────

function dispatchToUI(key, val) {

  const readSliderKeys = ['ph', 'redox', 'tds', 'temperature', 'depression', 'tac', 'th'];
  if (readSliderKeys.includes(key)) updateReadSlider(key, val);

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

  if (key === 'mode') ui.updateMode(val);

  const etalonLabelMap = {
    etalonPh1:  { span: 'lbl-etalonph1',  decimals: 2, unit: '' },
    etalonPh2:  { span: 'lbl-etalonph2',  decimals: 2, unit: '' },
    etalonTds2: { span: 'lbl-etalontds2', decimals: 0, unit: 'ppm' },
  };
  if (etalonLabelMap[key]) {
    const { span, decimals, unit } = etalonLabelMap[key];
    ui.updateEtalonnageLabel(span, val, decimals, unit);
  }

  const etalonStateMap = {
    etalonnagePh1:  'btn-etalonnageph1',
    etalonnagePh2:  'btn-etalonnageph2',
    etalonnageTds1: 'btn-etalonnageTds1',
    etalonnageTds2: 'btn-etalonnageTds2',
  };
  if (etalonStateMap[key]) ui.setEtalonnageState(etalonStateMap[key], Number(val) === 1);

  if (key === 'preco') ui.updatePreco(val);
  if (key === 'isl')   ui.updateISL(val);
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

  ['ph', 'redox', 'tds', 'temperature', 'depression'].forEach(key => {
    const meta = TOPICS[key];
    ui.setBoundsLabels(key, meta.min, meta.max, meta.unit);
    if (meta.normLow !== undefined) ui.setNormLabel(key, meta.normLow, meta.normHigh, meta.unit);
    ui.setUnit(`unit-${key}`, meta.unit);
  });

  ['tac', 'th'].forEach(key => {
    const meta = TOPICS[key];
    ui.setBoundsLabels(key, meta.min, meta.max, meta.unit);
    ui.setNormLabel(key, meta.normLow, meta.normHigh, meta.unit);
    ui.setUnit(`unit-${key}`, meta.unit);
  });

  ['tempMoy', 'tempMin', 'tempMax', 'frequence'].forEach(key => {
    ui.setUnit(`unit-${key}`, TOPICS[key].unit);
  });

  ui.setISLNormLabel('Équilibré entre −0,3 et +0,3');

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
      console.warn('⚠️ Service Workers non supportés');
      return;
    }

    console.log('🔧 Enregistrement du Service Worker…');
    let swReg;
    try {
      swReg = await navigator.serviceWorker.register('./service-worker.js', { scope: './' });
      const state = swReg.installing ? 'Installation…'
                  : swReg.waiting   ? 'En attente…'
                  : swReg.active    ? 'Actif'
                  :                   'Inconnu';
      console.log('✅ Service Worker enregistré :', swReg.scope, '—', state);
    } catch (err) {
      console.error('❌ Erreur Service Worker :', err);
      return;
    }

    // ── Initialisation des notifications push ────────────────────────────
    // Attendre que le SW soit actif
    const activeSw = swReg.active || await new Promise(resolve => {
      const sw = swReg.installing || swReg.waiting;
      if (!sw) { resolve(null); return; }
      sw.addEventListener('statechange', e => {
        if (e.target.state === 'activated') resolve(swReg.active);
      });
    });

    if (!activeSw) return;

    const pushState = await push.init(swReg);
    console.log('🔔 État push initial :', pushState);
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
        console.log('🔔 Notifications :', newState);
      } catch (err) {
        console.error('❌ Push toggle error :', err.message);
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
