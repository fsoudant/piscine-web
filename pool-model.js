/**
 * pool-model.js
 * Couche Métier — aucune dépendance UI, aucune dépendance MQTT
 * Contient : définition des topics, normes, calculs, état applicatif
 */

'use strict';

// ── TOPICS MAP ─────────────────────────────────────────────────────────────
// Chaque entrée décrit une variable métier de la piscine
const BASE = 'francois.soudant@gmail.com';

// Modes de fonctionnement
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
  temperature: { topic: `${BASE}/Piscine/Temperature`,   unit: '°C',     min: -10, max: 45,   decimals: 1, step: 0.1,  },
  tempMoy:     { topic: `${BASE}/Piscine/TempMoy`,       unit: '°C',     min: -10, max: 45,   decimals: 1, step: 0.1   },
  tempMin:     { topic: `${BASE}/Piscine/TempMin`,       unit: '°C',     min: -10, max: 45,   decimals: 1, step: 0.1   },
  tempMax:     { topic: `${BASE}/Piscine/TempMax`,       unit: '°C',     min: -10, max: 45,   decimals: 1, step: 0.1   },
  frequence:   { topic: `${BASE}/Piscine/Frequence`,     unit: 'Hz',     min: 0,   max: 50,   decimals: 0, step: 5     },
  heureDeb:    { topic: `${BASE}/Piscine/HeureDeb`,      unit: 'h',      min: 0,   max: 23,   decimals: 0, step: 1     },
  minDeb:      { topic: `${BASE}/Piscine/MinDeb`,        unit: 'min',    min: 0,   max: 59,   decimals: 0, step: 1     },
  heureFin:    { topic: `${BASE}/Piscine/HeureFin`,      unit: 'h',      min: 0,   max: 23,   decimals: 0, step: 1     },
  minFin:      { topic: `${BASE}/Piscine/MinFin`,        unit: 'min',    min: 0,   max: 59,   decimals: 0, step: 1     },
  depression:  { topic: `${BASE}/Piscine/Depression`,    unit: 'bar',    min: -5, max: 0,     decimals: 0, step: 1,    normLow: -3,  normHigh: -1   },
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
};

// Index inverse : topic → clé métier
export const TOPIC_TO_KEY = Object.fromEntries(
  Object.entries(TOPICS).map(([k, v]) => [v.topic, k])
);

// ── ÉTAT APPLICATIF ────────────────────────────────────────────────────────
const _state = {};

export function setValue(key, raw) {
  const meta = TOPICS[key];
  if (!meta) return null;
  const val = parseFloat(raw);
  if (isNaN(val)) return null;
  _state[key] = val;
  return val;
}

export function getValue(key) {
  return _state[key] ?? null;
}

export function getAllValues() {
  return { ..._state };
}

// ── CALCULS MÉTIER ─────────────────────────────────────────────────────────

/**
 * Indice de Langelier (ISL)
 * ISL = pH - ((9.3 + A + B) - (C + D))
 *   A = log10(TDS - 1) / 10
 *   B = -13.12 * log10(T + 273) + 34.55
 *   C = log10(TH) - 0.4
 *   D = log10(TAC)
 * @returns {{ value: number, status: string }|null}
 */
export function computeISL() {
  const ph  = _state.ph;
  const tds = _state.tds;
  const th  = _state.th;
  const tac = _state.tac;
  const t   = _state.temperature;

  if ([ph, tds, th, tac, t].some(v => v === undefined || v === null)) return null;
  if (tds <= 1 || th <= 0 || tac <= 0) return null;

  const A   = Math.log10(tds - 1) / 10;
  const B   = -13.12 * Math.log10(t + 273) + 34.55;
  const C   = Math.log10(th) - 0.4;
  const D   = Math.log10(tac);
  const isl = ph - ((9.3 + A + B) - (C + D));

  return { value: isl, status: classifyISL(isl) };
}

function classifyISL(isl) {
  if (isl >= -0.3 && isl <= 0.3) return 'ok';
  if (Math.abs(isl) > 1)          return 'danger';
  return 'warn';
}

/**
 * Normalise une valeur dans [0,1] par rapport à son domaine
 */
export function normalize(key, val) {
  const { min, max } = TOPICS[key];
  return Math.max(0, Math.min(1, (val - min) / (max - min)));
}

/**
 * Détermine le statut (ok / warn / danger) d'une valeur
 */
export function classify(key, val) {
  const meta = TOPICS[key];
  if (!meta.normLow && !meta.normHigh) return 'info';
  const inRange = val >= meta.normLow && val <= meta.normHigh;
  if (inRange) return 'ok';
  const mid    = (meta.normLow + meta.normHigh) / 2;
  const spread = (meta.normHigh - meta.normLow);
  return Math.abs(val - mid) > spread ? 'danger' : 'warn';
}

/**
 * Retourne les positions relatives [0..1] des bornes de norme
 */
export function normBounds(key) {
  const meta = TOPICS[key];
  if (!meta.normLow && !meta.normHigh) return null;
  return {
    low:  normalize(key, meta.normLow),
    high: normalize(key, meta.normHigh),
  };
}
