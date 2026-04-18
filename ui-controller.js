/**
 * ui-controller.js
 * Couche Présentation — manipulation DOM uniquement
 * Aucune logique métier, aucun appel MQTT
 * Communique avec les autres couches via callbacks (injection de dépendances)
 */

'use strict';

// Référence aux métadonnées TOPICS (injectée par app.js si nécessaire)
let _topicsCache = null;

export class UIController {

  constructor() {
    // Callbacks injectés par app.js (IoC)
    this.onConnect        = null;   // ({ user, pass }) => void
    this.onPublish        = null;   // (topic, value) => void
    this.onModeChange     = null;   // (mode: 0|1|2) => void
    this.onPrimeRequest   = null;   // (key: 'amorcePH'|'amorceRedox') => void
  }
  
  // Injecter le cache TOPICS pour éviter les imports dynamiques
  setTopicsCache(topics) {
    _topicsCache = topics;
  }

  // ── Initialisation ────────────────────────────────────────────────────────

  init() {
    this._bindTabs();
    this._bindConnectForm();
    // _bindModeButtons sera appelé par buildModeButtons() après création des boutons
    this._bindEditableSliders();
    this._bindTimeInputs();
    // Les sliders paramètres sont liés explicitement via bindParamSlider() dans app.js
    this._bindPrimeButtons();
    this._positionTabIndicator(0);
  }

  // ── Initialisation des labels de normes ──────────────────────────────────

  buildModeButtons(modes) {
    const container = document.getElementById('modePicker');
    if (!container) return;
    
    container.innerHTML = ''; // Vider le conteneur
    
    modes.forEach(mode => {
      const btn = document.createElement('button');
      btn.className = 'mode-btn';
      if (mode.default) btn.classList.add('active');
      btn.dataset.val = mode.value;
      btn.textContent = mode.label;
      container.appendChild(btn);
    });
    
    // Rebinder les événements après création
    this._bindModeButtons();
  }

  setNormLabel(key, normLow, normHigh, unit) {
    const el = document.getElementById(`norm-label-${key}`);
    if (!el) return;
    
    // Formater selon le type de norme
    if (key === 'depression') {
      // Cas spécial : dépression (valeur négative, affichage "-3 à -1 bar")
      el.textContent = `${normLow} à ${normHigh} ${unit}`;
    } else {
      // Cas général : plage min – max
      const low = Number.isInteger(normLow) ? normLow : normLow.toFixed(1);
      const high = Number.isInteger(normHigh) ? normHigh : normHigh.toFixed(1);
      el.textContent = unit ? `${low} – ${high} ${unit}` : `${low} – ${high}`;
    }
  }

  setISLNormLabel(text) {
    const el = document.getElementById('isl-norm-label');
    if (el) el.textContent = text;
  }

  setSliderRange(sliderId, min, max, defaultValue, step) {
    const slider = document.getElementById(sliderId);
    if (!slider) return;
    slider.min = min;
    slider.max = max;
    if (step !== undefined) slider.step = step;
    if (defaultValue !== undefined) {
      slider.value = defaultValue;
    }
  }

  setNumberInputRange(inputId, min, max) {
    const input = document.getElementById(inputId);
    if (!input) return;
    input.min = min;
    input.max = max;
  }

  setBoundsLabels(key, min, max, unit) {
    const minEl = document.getElementById(`min-label-${key}`);
    const maxEl = document.getElementById(`max-label-${key}`);
    
    if (minEl) minEl.textContent = unit ? `${min} ${unit}` : min;
    if (maxEl) maxEl.textContent = unit ? `${max} ${unit}` : max;
  }

  setUnit(elementId, unit) {
    const el = document.getElementById(elementId);
    if (el) el.textContent = unit;
  }

  // ── Connexion ─────────────────────────────────────────────────────────────

  showModal()  { document.getElementById('mqttModal').style.display = 'flex'; }
  hideModal()  { document.getElementById('mqttModal').style.display = 'none'; }
  showConnError(msg) {
    const el = document.getElementById('mqttError');
    el.textContent = msg;
    el.style.display = 'block';
  }
  hideConnError() { document.getElementById('mqttError').style.display = 'none'; }

  setConnectionStatus(state) {
    const dot   = document.getElementById('connDot');
    const label = document.getElementById('connLabel');
    const map = {
      connected:    { cls: 'connected',    txt: 'Connecté' },
      connecting:   { cls: 'connecting',   txt: 'Connexion…' },
      disconnected: { cls: '',             txt: 'Déconnecté' },
      error:        { cls: '',             txt: 'Erreur' },
    };
    const s = map[state] || map.disconnected;
    dot.className   = s.cls;
    label.textContent = s.txt;
  }

  // ── Mode ──────────────────────────────────────────────────────────────────

  updateMode(mode) {
    const modeNum = typeof mode === 'number' ? mode : parseInt(mode);
    console.log('🔄 Mise à jour UI mode:', modeNum);
    
    document.querySelectorAll('.mode-btn').forEach(b => {
      const btnVal = parseInt(b.dataset.val);
      const isActive = btnVal === modeNum;
      b.classList.toggle('active', isActive);
    });

    const isManual = mode === 1;
    ['hDeb', 'mDeb', 'hFin', 'mFin'].forEach(id => {
      const el = document.getElementById(id);
      if (el) el.disabled = !isManual;
    });

    const badge = document.getElementById('filtModeBadge');
    if (badge) {
      badge.textContent = mode === 1 ? '✏️ Manuel' : mode === 0 ? '⏹ Arrêt' : '⚙️ Auto';
      badge.className   = 'badge ' + (mode === 1 ? 'ok' : 'warn');
    }
  }

  // ── Sliders de lecture ────────────────────────────────────────────────────

  /**
   * @param {string} key        Identifiant (ex: 'ph')
   * @param {number} pct        Position 0..100
   * @param {number} normLowPct Borne basse de norme 0..100
   * @param {number} normHighPct Borne haute de norme 0..100
   * @param {string} status     'ok'|'warn'|'danger'
   * @param {string} displayVal Valeur formatée à afficher
   * @param {string} badgeText  Texte du badge
   */
  updateReadSlider(key, pct, normLowPct, normHighPct, status, displayVal, badgeText) {
    const fill  = document.getElementById('fill-'  + key);
    const thumb = document.getElementById('thumb-' + key);
    const norm  = document.getElementById('norm-'  + key);
    const valEl = document.getElementById('val-'   + key);
    const badge = document.getElementById('badge-' + key);

    if (fill)  { fill.style.width  = pct + '%';  fill.className  = 'slider-fill '  + status; }
    if (thumb) { thumb.style.left  = pct + '%';  thumb.className = 'slider-thumb ' + status; }
    if (norm)  {
      norm.style.left  = normLowPct + '%';
      norm.style.width = (normHighPct - normLowPct) + '%';
    }
    if (valEl) valEl.textContent = displayVal;
    if (badge) { badge.textContent = badgeText; badge.className = 'badge ' + status; }
  }

  // ── ISL ──────────────────────────────────────────────────────────────────

  updateISL(result) {
    const el    = document.getElementById('val-isl');
    const badge = document.getElementById('badge-isl');
    const fill  = document.getElementById('fill-isl');
    const thumb = document.getElementById('thumb-isl');
    const norm  = document.getElementById('norm-isl');

    if (!result) {
      if (el) el.textContent = '--';
      return;
    }

    const { value, status } = result;
    const pct = Math.max(0, Math.min(100, (value + 5) / 10 * 100));

    const colorMap = { ok: 'var(--success)', warn: 'var(--warning)', danger: 'var(--danger)' };
    const textMap  = {
      ok:     '✓ Équilibré',
      warn:   '△ À corriger',
      danger: '⚠ Corrosif/Entartrant',
    };

    if (el)    { el.textContent = value.toFixed(2); el.style.color = colorMap[status]; }
    if (badge) { badge.textContent = textMap[status]; badge.className = 'badge ' + status; }
    if (fill)  { fill.style.width = pct + '%';  fill.className  = 'slider-fill '  + status; }
    if (thumb) { thumb.style.left = pct + '%';  thumb.className = 'slider-thumb ' + status; }
    if (norm)  { norm.style.left = '47%'; norm.style.width = '6%'; }
  }

  // ── Valeurs simples ───────────────────────────────────────────────────────

  updateSimpleValue(elementId, val, decimals = 1, unit = '') {
    const el = document.getElementById(elementId);
    if (el) el.textContent = val.toFixed(decimals) + (unit ? ' ' + unit : '');
  }

  // ── Sliders éditables (lecture depuis MQTT) ───────────────────────────────

  syncEditableSlider(sliderId, displayId, val, decimals, unit) {
    const slider  = document.getElementById(sliderId);
    const display = document.getElementById(displayId);
    if (slider)  slider.value       = val;
    if (display) display.textContent = val.toFixed(decimals) + (unit ? ' ' + unit : '');
  }

  // ── Champs horaires ───────────────────────────────────────────────────────

  updateTimeField(id, val) {
    const el = document.getElementById(id);
    if (el) el.value = val;
  }

  // ── Amorçage ──────────────────────────────────────────────────────────────

  showPriming(key) {
    const btn  = document.getElementById('btn-' + key);
    const prog = document.getElementById('prog-' + key);
    if (!btn) return;

    btn.classList.add('priming');
    btn.dataset.originalText = btn.textContent;

    let sec = 5;
    const tick = () => {
      btn.textContent = `⏱ Amorçage… ${sec}s`;
      if (sec > 0) { sec--; setTimeout(tick, 1000); }
    };
    tick();

    if (prog) {
      prog.classList.add('active');
      prog.innerHTML = '<div class="prime-bar"></div>';
    }
  }

  hidePriming(key) {
    const btn  = document.getElementById('btn-' + key);
    const prog = document.getElementById('prog-' + key);
    if (btn)  { btn.classList.remove('priming'); btn.textContent = btn.dataset.originalText || key; }
    if (prog) prog.classList.remove('active');
  }

  isPriming(key) {
    const btn = document.getElementById('btn-' + key);
    return btn ? btn.classList.contains('priming') : false;
  }

  // ── Bindings internes ─────────────────────────────────────────────────────

  _bindTabs() {
    document.querySelectorAll('.tab-btn').forEach((btn, i) => {
      btn.addEventListener('click', () => this._switchTab(i));
    });
  }

  _switchTab(n) {
    document.querySelectorAll('.tab-panel').forEach((p, i) => p.classList.toggle('active', i === n));
    document.querySelectorAll('.tab-btn').forEach((b, i) => b.classList.toggle('active', i === n));
    this._positionTabIndicator(n);
  }

  _positionTabIndicator(n) {
    const btns = document.querySelectorAll('.tab-btn');
    const bar  = document.getElementById('tabBar');
    if (!btns[n] || !bar) return;
    const b = btns[n].getBoundingClientRect();
    const r = bar.getBoundingClientRect();
    const ind = document.getElementById('tabIndicator');
    if (ind) ind.style.left = (b.left - r.left + b.width / 2 - 15) + 'px';
  }

  _bindConnectForm() {
    document.getElementById('connectBtn').addEventListener('click', () => {
      this.hideConnError();
      this.onConnect?.({
        user: document.getElementById('mqttUser').value.trim(),
        pass: document.getElementById('mqttPass').value,
      });
    });
  }

  _bindModeButtons() {
    document.querySelectorAll('.mode-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        this.onModeChange?.(parseInt(btn.dataset.val));
      });
    });
  }

  _bindEditableSliders() {
    // Bind des sliders custom éditables (TAC, TH)
    document.querySelectorAll('.editable-slider').forEach(slider => {
      slider.addEventListener('click', (e) => {
        const key = slider.dataset.key;  // 'tac' ou 'th'
        if (!key) return;
        
        // Utiliser le cache TOPICS si disponible
        const meta = _topicsCache ? _topicsCache[key] : null;
        if (!meta) {
          console.warn('TOPICS non initialisé pour', key);
          return;
        }
        
        const currentVal = document.getElementById(`val-${key}`).textContent;
        
        // Prompt avec la valeur actuelle
        const newVal = prompt(
          `Nouvelle valeur pour ${key.toUpperCase()} (${meta.min}-${meta.max} ${meta.unit})`,
          currentVal !== '--' ? currentVal : ''
        );
        
        if (newVal === null) return;  // Annulation
        
        const numVal = parseFloat(newVal);
        if (isNaN(numVal) || numVal < meta.min || numVal > meta.max) {
          alert(`Valeur invalide. Entrez un nombre entre ${meta.min} et ${meta.max}.`);
          return;
        }
        
        // Publier sur MQTT
        this.onPublish?.(meta.topic, numVal);
      });
    });
  }

  _bindTimeInputs() {
    // Maintenant géré par le double slider de filtration
    this._bindFiltrationSlider();
  }

  _bindFiltrationSlider() {
    const track = document.getElementById('filtSliderTrack');
    const range = document.getElementById('filtRange');
    const thumbStart = document.getElementById('filtThumbStart');
    const thumbEnd = document.getElementById('filtThumbEnd');
    const tooltipStart = document.getElementById('filtTooltipStart');
    const tooltipEnd = document.getElementById('filtTooltipEnd');
    
    if (!track || !thumbStart || !thumbEnd) return;
    
    // État interne (en minutes depuis minuit)
    let startMinutes = 8 * 60;  // 08:00
    let endMinutes = 20 * 60;   // 20:00
    let isDragging = null;      // 'start' | 'end' | null
    
    // Helpers
    const minutesToPercent = (min) => (min / (24 * 60)) * 100;
    const percentToMinutes = (pct) => Math.round((pct / 100) * (24 * 60));
    const minutesToTime = (min) => {
      const h = Math.floor(min / 60);
      const m = min % 60;
      return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}`;
    };
    const getDuration = (start, end) => {
      let diff = end - start;
      if (diff < 0) diff += 24 * 60;
      const h = Math.floor(diff / 60);
      const m = diff % 60;
      return `${h}h ${m.toString().padStart(2, '0')}min`;
    };
    
    // Mettre à jour l'UI
    const updateUI = () => {
      const startPct = minutesToPercent(startMinutes);
      const endPct = minutesToPercent(endMinutes);
      
      thumbStart.style.left = startPct + '%';
      thumbEnd.style.left = endPct + '%';
      
      range.style.left = startPct + '%';
      range.style.width = (endPct - startPct) + '%';
      
      const startTime = minutesToTime(startMinutes);
      const endTime = minutesToTime(endMinutes);
      const duration = getDuration(startMinutes, endMinutes);
      
      tooltipStart.textContent = startTime;
      tooltipEnd.textContent = endTime;
      document.getElementById('filt-start').textContent = startTime;
      document.getElementById('filt-end').textContent = endTime;
      document.getElementById('filt-duration').textContent = duration;
    };
    
    // Publier sur MQTT
    const publish = () => {
      if (!_topicsCache) {
        console.warn('TOPICS non initialisé, impossible de publier');
        return;
      }
      const startH = Math.floor(startMinutes / 60);
      const startM = startMinutes % 60;
      const endH = Math.floor(endMinutes / 60);
      const endM = endMinutes % 60;
      
      this.onPublish?.(_topicsCache.heureDeb.topic, startH);
      this.onPublish?.(_topicsCache.minDeb.topic, startM);
      this.onPublish?.(_topicsCache.heureFin.topic, endH);
      this.onPublish?.(_topicsCache.minFin.topic, endM);
    };
    
    // Gérer le drag
    const onMouseDown = (e, type) => {
      e.preventDefault();
      isDragging = type;
      document.body.style.cursor = 'grabbing';
      document.body.style.userSelect = 'none';
    };
    
    const onMouseMove = (e) => {
      if (!isDragging) return;
      
      const rect = track.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const pct = Math.max(0, Math.min(100, (x / rect.width) * 100));
      const minutes = percentToMinutes(pct);
      
      // Arrondir à 15 min
      const rounded = Math.round(minutes / 15) * 15;
      
      if (isDragging === 'start') {
        startMinutes = Math.max(0, Math.min(endMinutes - 15, rounded));
      } else {
        endMinutes = Math.max(startMinutes + 15, Math.min(24 * 60, rounded));
      }
      
      updateUI();
    };
    
    const onMouseUp = () => {
      if (isDragging) {
        publish();
        isDragging = null;
        document.body.style.cursor = '';
        document.body.style.userSelect = '';
      }
    };
    
    // Clic sur la track pour déplacer le curseur le plus proche
    track.addEventListener('click', (e) => {
      if (e.target !== track && e.target !== range) return;
      
      const rect = track.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const pct = (x / rect.width) * 100;
      const minutes = percentToMinutes(pct);
      const rounded = Math.round(minutes / 15) * 15;
      
      const distStart = Math.abs(rounded - startMinutes);
      const distEnd = Math.abs(rounded - endMinutes);
      
      if (distStart < distEnd) {
        startMinutes = Math.max(0, Math.min(endMinutes - 15, rounded));
      } else {
        endMinutes = Math.max(startMinutes + 15, Math.min(24 * 60, rounded));
      }
      
      updateUI();
      publish();
    });
    
    // Bind events
    thumbStart.addEventListener('mousedown', (e) => onMouseDown(e, 'start'));
    thumbEnd.addEventListener('mousedown', (e) => onMouseDown(e, 'end'));
    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('mouseup', onMouseUp);
    
    // Touch events pour mobile
    thumbStart.addEventListener('touchstart', (e) => {
      isDragging = 'start';
      e.preventDefault();
    });
    thumbEnd.addEventListener('touchstart', (e) => {
      isDragging = 'end';
      e.preventDefault();
    });
    document.addEventListener('touchmove', (e) => {
      if (!isDragging) return;
      const touch = e.touches[0];
      const rect = track.getBoundingClientRect();
      const x = touch.clientX - rect.left;
      const pct = Math.max(0, Math.min(100, (x / rect.width) * 100));
      const minutes = percentToMinutes(pct);
      const rounded = Math.round(minutes / 15) * 15;
      
      if (isDragging === 'start') {
        startMinutes = Math.max(0, Math.min(endMinutes - 15, rounded));
      } else {
        endMinutes = Math.max(startMinutes + 15, Math.min(24 * 60, rounded));
      }
      updateUI();
    });
    document.addEventListener('touchend', () => {
      if (isDragging) {
        publish();
        isDragging = null;
      }
    });
    
    // Méthode publique pour mettre à jour depuis MQTT
    this.updateFiltrationTime = (hDeb, mDeb, hFin, mFin) => {
      startMinutes = (hDeb * 60) + mDeb;
      endMinutes = (hFin * 60) + mFin;
      updateUI();
    };
    
    // Init UI
    updateUI();
  }

  /**
   * Lie un slider paramètre à son affichage et à la publication MQTT.
   * Appelé explicitement depuis app.js pour chaque paramètre, après que
   * les métadonnées (topic, decimals, unit) sont disponibles.
   *
   * @param {string} sliderId  ID de l'<input type="range">
   * @param {string} displayId ID de l'élément affichant la valeur courante
   * @param {string} topic     Topic MQTT cible
   * @param {number} decimals  Nombre de décimales pour l'affichage
   * @param {string} unit      Unité affichée
   */
  bindParamSlider(sliderId, displayId, topic, decimals, unit) {
    const slider = document.getElementById(sliderId);
    if (!slider) return;

    slider.addEventListener('input', e => {
      const val = parseFloat(e.target.value);

      // Mise à jour immédiate de l'affichage pendant le glissement
      const displayEl = document.getElementById(displayId);
      if (displayEl) {
        displayEl.textContent = val.toFixed(decimals) + (unit ? '\u00a0' + unit : '');
      }

      // Publication MQTT
      this.onPublish?.(topic, String(val));
    });
  }

  _bindPrimeButtons() {
    document.querySelectorAll('[data-prime-key]').forEach(btn => {
      btn.addEventListener('click', () => {
        const key = btn.dataset.primeKey;
        if (!this.isPriming(key)) this.onPrimeRequest?.(key);
      });
    });
  }
}
