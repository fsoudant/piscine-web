/**
 * pool-model.js
 * Couche Métier — aucune dépendance UI, aucune dépendance MQTT
 * Contient : définition des topics, normes, calculs, état applicatif
 * Style Java-like : classe avec attributs privés, getters/setters
 */

'use strict';

// ── TOPICS MAP ─────────────────────────────────────────────────────────────
const BASE = 'francois.soudant@gmail.com';

export const MODES = [
  { value: 0, label: '⏹ Arrêt',        icon: '⏹' },
  { value: 1, label: '⚙️ Automatique', icon: '⚙️', default: true },
  { value: 2, label: '🔧 Manuel',      icon: '🔧' },
];

export const TOPICS = {
  mode:        { topic: `${BASE}/Piscine/Mode`,          unit: '',       min: 0,   max: 2,    decimals: 0, step: 1     },
  ph:          { topic: `${BASE}/Piscine/PH`,            unit: '',       min: 6,   max: 9,    decimals: 1, step: 0.1,  normLow: 7.0,  normHigh: 7.4  },
  redox:       { topic: `${BASE}/Piscine/Redox`,         unit: 'mV',     min: 0,   max: 800,  decimals: 0, step: 1,    normLow: 650,  normHigh: 750  },
  tac:         { topic: `${BASE}/Piscine/TAC`,           unit: 'ppm',    min: 0,   max: 200,  decimals: 0, step: 1,    normLow: 80,   normHigh: 120  },
  tds:         { topic: `${BASE}/Piscine/TDS`,           unit: 'ppm',    min: 0,   max: 2000, decimals: 0, step: 1,    normLow: 250,  normHigh: 2000 },
  th:          { topic: `${BASE}/Piscine/TH`,            unit: 'ppm',    min: 0,   max: 300,  decimals: 0, step: 1,    normLow: 100,  normHigh: 250  },
  temperature: { topic: `${BASE}/Piscine/Temperature`,   unit: '°C',     min: -10, max: 45,   decimals: 1, step: 0.1   },
  tempMoy:     { topic: `${BASE}/Piscine/TempMoy`,       unit: '°C',     min: -10, max: 45,   decimals: 1, step: 0.1   },
  tempMin:     { topic: `${BASE}/Piscine/TempMin`,       unit: '°C',     min: -10, max: 45,   decimals: 1, step: 0.1   },
  tempMax:     { topic: `${BASE}/Piscine/TempMax`,       unit: '°C',     min: -10, max: 45,   decimals: 1, step: 0.1   },
  frequence:   { topic: `${BASE}/Piscine/Frequence`,     unit: 'Hz',     min: 0,   max: 50,   decimals: 0, step: 5     },
  heureDeb:    { topic: `${BASE}/Piscine/HeureDeb`,      unit: 'h',      min: 0,   max: 23,   decimals: 0, step: 1     },
  minDeb:      { topic: `${BASE}/Piscine/MinDeb`,        unit: 'min',    min: 0,   max: 59,   decimals: 0, step: 1     },
  heureFin:    { topic: `${BASE}/Piscine/HeureFin`,      unit: 'h',      min: 0,   max: 23,   decimals: 0, step: 1     },
  minFin:      { topic: `${BASE}/Piscine/MinFin`,        unit: 'min',    min: 0,   max: 59,   decimals: 0, step: 1     },
  depression:  { topic: `${BASE}/Piscine/Depression`,    unit: 'bar',    min: -5,  max: 0,    decimals: 0, step: 1,    normLow: -3,   normHigh: -1   },
  volume:      { topic: `${BASE}/Piscine/Volume`,        unit: 'm³',     min: 0,   max: 200,  decimals: 0, step: 1     },
  debitPompe:  { topic: `${BASE}/Piscine/DebitPompe`,    unit: 'm³/h',   min: 0,   max: 20,   decimals: 1, step: 0.1   },
  pompePH:     { topic: `${BASE}/Piscine/PompePH`,       unit: 'dl/m',   min: 0,   max: 200,  decimals: 0, step: 1     },
  pompeRedox:  { topic: `${BASE}/Piscine/PompeRedox`,    unit: 'dl/m',   min: 0,   max: 200,  decimals: 0, step: 1     },
  freqBasse:   { topic: `${BASE}/Piscine/FreqBasse`,     unit: 'Hz',     min: 0,   max: 50,   decimals: 0, step: 5     },
  freqMoy:     { topic: `${BASE}/Piscine/FreqMoy`,       unit: 'Hz',     min: 0,   max: 50,   decimals: 0, step: 5     },
  freqHaute:   { topic: `${BASE}/Piscine/FreqHaute`,     unit: 'Hz',     min: 0,   max: 50,   decimals: 0, step: 5     },
  minFreqHaut: { topic: `${BASE}/Piscine/minFreqHaut`,   unit: 'min',    min: 0,   max: 59,   decimals: 0, step: 1     },
  etalonPh1:   { topic: `${BASE}/Piscine/EtalonPh1`,     unit: '',       min: 0,   max: 14,   decimals: 2, step: 0.01  },
  etalonPh2:   { topic: `${BASE}/Piscine/EtalonPh2`,     unit: '',       min: 0,   max: 14,   decimals: 2, step: 0.01  },
  amorcePH:    { topic: `${BASE}/Piscine/AmorcePH`,      unit: '',       min: 0,   max: 1,    decimals: 0, step: 1     },
  amorceRedox: { topic: `${BASE}/Piscine/AmorceRedox`,   unit: '',       min: 0,   max: 1,    decimals: 0, step: 1     },
  isl:         { topic: '',                              unit: '',       min: -5,  max: 5,    decimals: 2, step: 0.01  }, // Calculé, pas de topic MQTT direct
};

export const TOPIC_TO_KEY = Object.fromEntries(
  Object.entries(TOPICS)
    .filter(([, v]) => v.topic !== '') // Exclure les topics vides (ex: ISL calculé)
    .map(([k, v]) => [v.topic, k])
);

export class Pool {
  #mode; #ph; #redox; #tac; #tds; #th; #temperature;
  #tempMoy; #tempMin; #tempMax; #frequence; #heureDeb; #minDeb;
  #heureFin; #minFin; #depression; #volume; #debitPompe;
  #pompePH; #pompeRedox; #freqBasse; #freqMoy; #freqHaute;
  #minFreqHaut; #etalonPh1; #etalonPh2; #amorcePH; #amorceRedox;
  #isL;
  #mqttService = null;
  #receivingFromMqtt = false; // Guard : empêche le re-publish des valeurs reçues de MQTT

  constructor(mqttService = null) {
    this.#mode = null; this.#ph = null; this.#redox = null;
    this.#tac = null; this.#tds = null; this.#th = null;
    this.#temperature = null; this.#tempMoy = null; this.#tempMin = null;
    this.#tempMax = null; this.#frequence = null; this.#heureDeb = null;
    this.#minDeb = null; this.#heureFin = null; this.#minFin = null;
    this.#depression = null; this.#volume = null; this.#debitPompe = null;
    this.#pompePH = null; this.#pompeRedox = null; this.#freqBasse = null;
    this.#freqMoy = null; this.#freqHaute = null; this.#minFreqHaut = null;
    this.#etalonPh1 = null; this.#etalonPh2 = null;
    this.#amorcePH = null; this.#amorceRedox = null;
    this.#mqttService = mqttService;
    
    // Calcul initial de l'ISL
    this.#computeISL();
  }

  get mode() { return this.#mode; }
  get ph() { return this.#ph; }
  get redox() { return this.#redox; }
  get tac() { return this.#tac; }
  get tds() { return this.#tds; }
  get th() { return this.#th; }
  get temperature() { return this.#temperature; }
  get tempMoy() { return this.#tempMoy; }
  get tempMin() { return this.#tempMin; }
  get tempMax() { return this.#tempMax; }
  get frequence() { return this.#frequence; }
  get heureDeb() { return this.#heureDeb; }
  get minDeb() { return this.#minDeb; }
  get heureFin() { return this.#heureFin; }
  get minFin() { return this.#minFin; }
  get depression() { return this.#depression; }
  get volume() { return this.#volume; }
  get debitPompe() { return this.#debitPompe; }
  get pompePH() { return this.#pompePH; }
  get pompeRedox() { return this.#pompeRedox; }
  get freqBasse() { return this.#freqBasse; }
  get freqMoy() { return this.#freqMoy; }
  get freqHaute() { return this.#freqHaute; }
  get minFreqHaut() { return this.#minFreqHaut; }
  get etalonPh1() { return this.#etalonPh1; }
  get etalonPh2() { return this.#etalonPh2; }
  get amorcePH() { return this.#amorcePH; }
  get amorceRedox() { return this.#amorceRedox; }
  get isl() { return this.#isL; }

  #validate(key, raw) {
    const meta = TOPICS[key];
    if (!meta) return null;
    const val = parseFloat(raw);
    return isNaN(val) ? null : val;
  }

  #publishIfChanged(topicKey, oldValue, newValue) {
    // Ne jamais republier une valeur qui vient d'arriver de MQTT : évite l'echo loop
    // et le warning "Cannot publish: client not connected" sur connexion lente
    if (this.#receivingFromMqtt) return;
    if (oldValue !== newValue && this.#mqttService) {
      const topic = TOPICS[topicKey].topic;
      this.#mqttService.publish(topic, newValue, true);
    }
  }

  #computeISL() {
    const { ph, tds, th, tac, temperature: t } = this;
    if ([ph, tds, th, tac, t].some(v => v === null)) {
      this.#isL = null;
      return;
    }
    if (tds <= 1 || th <= 0 || tac <= 0) {
      this.#isL = null;
      return;
    }
    const A = Math.log10(tds - 1) / 10;
    const B = -13.12 * Math.log10(t + 273) + 34.55;
    const C = Math.log10(th) - 0.4;
    const D = Math.log10(tac);
    const isl = ph - ((9.3 + A + B) - (C + D));
    let status = (isl >= -0.3 && isl <= 0.3) ? 'ok' : (Math.abs(isl) > 1 ? 'danger' : 'warn');
    this.#isL = { value: isl, status };
    // Pas de publication MQTT ici, l'ISL est une valeur calculée déduite des autres paramètres
  }

  set mode(v) { 
    const val = this.#validate('mode', v); 
    if (val !== null) { 
      const oldVal = this.#mode;
      this.#mode = val; 
      this.#publishIfChanged('mode', oldVal, val);
    } 
  }
  set ph(v) { 
    const val = this.#validate('ph', v); 
    if (val !== null) { 
      const oldVal = this.#ph;
      this.#ph = val; 
      this.#publishIfChanged('ph', oldVal, val);
      this.#computeISL();
    } 
  }
  set redox(v) { 
    const val = this.#validate('redox', v); 
    if (val !== null) { 
      const oldVal = this.#redox;
      this.#redox = val; 
      this.#publishIfChanged('redox', oldVal, val);
    } 
  }
  set tac(v) { 
    const val = this.#validate('tac', v); 
    if (val !== null) { 
      const oldVal = this.#tac;
      this.#tac = val; 
      this.#publishIfChanged('tac', oldVal, val);
      this.#computeISL();
    } 
  }
  set tds(v) { 
    const val = this.#validate('tds', v); 
    if (val !== null) { 
      const oldVal = this.#tds;
      this.#tds = val; 
      this.#publishIfChanged('tds', oldVal, val);
      this.#computeISL();
    } 
  }
  set th(v) { 
    const val = this.#validate('th', v); 
    if (val !== null) { 
      const oldVal = this.#th;
      this.#th = val; 
      this.#publishIfChanged('th', oldVal, val);
      this.#computeISL();
    } 
  }
  set temperature(v) { 
    const val = this.#validate('temperature', v); 
    if (val !== null) { 
      const oldVal = this.#temperature;
      this.#temperature = val; 
      this.#publishIfChanged('temperature', oldVal, val);
      this.#computeISL();
    } 
  }
  set tempMoy(v) { 
    const val = this.#validate('tempMoy', v); 
    if (val !== null) { 
      const oldVal = this.#tempMoy;
      this.#tempMoy = val; 
      this.#publishIfChanged('tempMoy', oldVal, val);
    } 
  }
  set tempMin(v) { 
    const val = this.#validate('tempMin', v); 
    if (val !== null) { 
      const oldVal = this.#tempMin;
      this.#tempMin = val; 
      this.#publishIfChanged('tempMin', oldVal, val);
    } 
  }
  set tempMax(v) { 
    const val = this.#validate('tempMax', v); 
    if (val !== null) { 
      const oldVal = this.#tempMax;
      this.#tempMax = val; 
      this.#publishIfChanged('tempMax', oldVal, val);
    } 
  }
  set frequence(v) { 
    const val = this.#validate('frequence', v); 
    if (val !== null) { 
      const oldVal = this.#frequence;
      this.#frequence = val; 
      this.#publishIfChanged('frequence', oldVal, val);
    } 
  }
  set heureDeb(v) { 
    const val = this.#validate('heureDeb', v); 
    if (val !== null) { 
      const oldVal = this.#heureDeb;
      this.#heureDeb = val; 
      this.#publishIfChanged('heureDeb', oldVal, val);
    } 
  }
  set minDeb(v) { 
    const val = this.#validate('minDeb', v); 
    if (val !== null) { 
      const oldVal = this.#minDeb;
      this.#minDeb = val; 
      this.#publishIfChanged('minDeb', oldVal, val);
    } 
  }
  set heureFin(v) { 
    const val = this.#validate('heureFin', v); 
    if (val !== null) { 
      const oldVal = this.#heureFin;
      this.#heureFin = val; 
      this.#publishIfChanged('heureFin', oldVal, val);
    } 
  }
  set minFin(v) { 
    const val = this.#validate('minFin', v); 
    if (val !== null) { 
      const oldVal = this.#minFin;
      this.#minFin = val; 
      this.#publishIfChanged('minFin', oldVal, val);
    } 
  }
  set depression(v) { 
    const val = this.#validate('depression', v); 
    if (val !== null) { 
      const oldVal = this.#depression;
      this.#depression = val; 
      this.#publishIfChanged('depression', oldVal, val);
    } 
  }
  set volume(v) { 
    const val = this.#validate('volume', v); 
    if (val !== null) { 
      const oldVal = this.#volume;
      this.#volume = val; 
      this.#publishIfChanged('volume', oldVal, val);
    } 
  }
  set debitPompe(v) { 
    const val = this.#validate('debitPompe', v); 
    if (val !== null) { 
      const oldVal = this.#debitPompe;
      this.#debitPompe = val; 
      this.#publishIfChanged('debitPompe', oldVal, val);
    } 
  }
  set pompePH(v) { 
    const val = this.#validate('pompePH', v); 
    if (val !== null) { 
      const oldVal = this.#pompePH;
      this.#pompePH = val; 
      this.#publishIfChanged('pompePH', oldVal, val);
    } 
  }
  set pompeRedox(v) { 
    const val = this.#validate('pompeRedox', v); 
    if (val !== null) { 
      const oldVal = this.#pompeRedox;
      this.#pompeRedox = val; 
      this.#publishIfChanged('pompeRedox', oldVal, val);
    } 
  }
  set freqBasse(v) { 
    const val = this.#validate('freqBasse', v); 
    if (val !== null) { 
      const oldVal = this.#freqBasse;
      this.#freqBasse = val; 
      this.#publishIfChanged('freqBasse', oldVal, val);
    } 
  }
  set freqMoy(v) { 
    const val = this.#validate('freqMoy', v); 
    if (val !== null) { 
      const oldVal = this.#freqMoy;
      this.#freqMoy = val; 
      this.#publishIfChanged('freqMoy', oldVal, val);
    } 
  }
  set freqHaute(v) { 
    const val = this.#validate('freqHaute', v); 
    if (val !== null) { 
      const oldVal = this.#freqHaute;
      this.#freqHaute = val; 
      this.#publishIfChanged('freqHaute', oldVal, val);
    } 
  }
  set minFreqHaut(v) { 
    const val = this.#validate('minFreqHaut', v); 
    if (val !== null) { 
      const oldVal = this.#minFreqHaut;
      this.#minFreqHaut = val; 
      this.#publishIfChanged('minFreqHaut', oldVal, val);
    } 
  }
  set etalonPh1(v) { 
    const val = this.#validate('etalonPh1', v); 
    if (val !== null) { 
      const oldVal = this.#etalonPh1;
      this.#etalonPh1 = val; 
      this.#publishIfChanged('etalonPh1', oldVal, val);
    } 
  }
  set etalonPh2(v) { 
    const val = this.#validate('etalonPh2', v); 
    if (val !== null) { 
      const oldVal = this.#etalonPh2;
      this.#etalonPh2 = val; 
      this.#publishIfChanged('etalonPh2', oldVal, val);
    } 
  }
  set amorcePH(v) { 
    const val = this.#validate('amorcePH', v); 
    if (val !== null) { 
      const oldVal = this.#amorcePH;
      this.#amorcePH = val; 
      this.#publishIfChanged('amorcePH', oldVal, val);
    } 
  }
  set amorceRedox(v) { 
    const val = this.#validate('amorceRedox', v); 
    if (val !== null) { 
      const oldVal = this.#amorceRedox;
      this.#amorceRedox = val; 
      this.#publishIfChanged('amorceRedox', oldVal, val);
    } 
  }

  /**
   * Positionne une valeur reçue depuis MQTT — sans déclencher de re-publication.
   * À utiliser exclusivement dans le handler 'message' de MqttService.
   */
  setFromMqtt(key, value) {
    this.#receivingFromMqtt = true;
    try {
      this[key] = value; // route vers le setter public
    } finally {
      this.#receivingFromMqtt = false;
    }
    return this[key] !== null;
  }

  setValue(key, value) {
    if (!(key in this)) return false;
    // Redirige vers le setter approprié
    this[key] = value;
    return this[key] !== null;
  }

  getAllValues() {
    return {
      mode: this.#mode, ph: this.#ph, redox: this.#redox, tac: this.#tac,
      tds: this.#tds, th: this.#th, temperature: this.#temperature,
      tempMoy: this.#tempMoy, tempMin: this.#tempMin, tempMax: this.#tempMax,
      frequence: this.#frequence, heureDeb: this.#heureDeb, minDeb: this.#minDeb,
      heureFin: this.#heureFin, minFin: this.#minFin, depression: this.#depression,
      volume: this.#volume, debitPompe: this.#debitPompe, pompePH: this.#pompePH,
      pompeRedox: this.#pompeRedox, freqBasse: this.#freqBasse, freqMoy: this.#freqMoy,
      freqHaute: this.#freqHaute, minFreqHaut: this.#minFreqHaut,
      etalonPh1: this.#etalonPh1, etalonPh2: this.#etalonPh2,
      amorcePH: this.#amorcePH, amorceRedox: this.#amorceRedox,
    };
  }

  computeISL() {
    return this.#isL;
  }

  normalize(key, val) {
    const meta = TOPICS[key];
    if (!meta) return null;
    const { min, max } = meta;
    return Math.max(0, Math.min(1, (val - min) / (max - min)));
  }

  classify(key, val) {
    const meta = TOPICS[key];
    if (!meta || (!meta.normLow && !meta.normHigh)) return 'info';
    const inRange = val >= meta.normLow && val <= meta.normHigh;
    if (inRange) return 'ok';
    const mid = (meta.normLow + meta.normHigh) / 2;
    const spread = meta.normHigh - meta.normLow;
    return Math.abs(val - mid) > spread ? 'danger' : 'warn';
  }

  normBounds(key) {
    const meta = TOPICS[key];
    if (!meta || (meta.normLow === undefined && meta.normHigh === undefined)) return null;
    return { low: meta.normLow, high: meta.normHigh };
  }

  calculateWaterQuality() {
    const results = {};
    const keysToCheck = ['ph', 'redox', 'tac', 'tds', 'th', 'depression'];
    
    for (const key of keysToCheck) {
      const value = this['#' + key];
      if (value !== null) {
        results[key] = {
          value: value,
          status: this.classify(key, value),
          bounds: this.normBounds(key)
        };
      }
    }
    
    // Ajout de l'ISL
    const isl = this.computeISL();
    if (isl) {
      results.isl = isl;
    }
    
    return results;
  }

  getValue(key) { return (key in this) ? this[key] : null; }
}

let _poolInstance = null;

export function initPool(mqttService) {
  if (!_poolInstance) {
    _poolInstance = new Pool(mqttService);
  }
  return _poolInstance;
}

export function getPoolInstance() {
  return _poolInstance;
}

export function setFromMqtt(key, raw) {
  if (!_poolInstance) return null;
  return _poolInstance.setFromMqtt(key, raw) ? _poolInstance.getValue(key) : null;
}
export function setValue(key, raw) { 
  if (!_poolInstance) return null;
  return _poolInstance.setValue(key, raw) ? _poolInstance.getValue(key) : null; 
}
export function getValue(key) { 
  return _poolInstance ? _poolInstance.getValue(key) : null; 
}
export function getAllValues() { 
  return _poolInstance ? _poolInstance.getAllValues() : {}; 
}
export function computeISL() { 
  return _poolInstance ? _poolInstance.computeISL() : null; 
}
export function getIsl() { 
  return _poolInstance ? _poolInstance.isl : null; 
}
export function normalize(key, val) { 
  return _poolInstance ? _poolInstance.normalize(key, val) : null; 
}
export function classify(key, val) { 
  return _poolInstance ? _poolInstance.classify(key, val) : 'info'; 
}
export function normBounds(key) { 
  return _poolInstance ? _poolInstance.normBounds(key) : null; 
}
export function calculateWaterQuality(state) {
  if (state) Object.entries(state).forEach(([k, v]) => _poolInstance.setValue(k, v));
  return _poolInstance.calculateWaterQuality();
}
