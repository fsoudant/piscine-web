/**
 * pool-model.js
 * Couche Métier — aucune dépendance UI, aucune dépendance MQTT
 * Contient : définition des topics, normes, calculs, état applicatif
 */

'use strict';

// ── TOPICS MAP ─────────────────────────────────────────────────────────────
// Chaque entrée décrit une variable métier de la piscine
const BASE = 'francois.soudant@gmail.com';

export const TOPICS = {
  mode:        { topic: `${BASE}/PiscineMode`,           unit: '',       min: 0,   max: 2   },
  ph:          { topic: `${BASE}/Piscine/PH`,            unit: '',       min: 0,   max: 14,  normLow: 7.0,  normHigh: 7.4  },
  redox:       { topic: `${BASE}/Piscine/Redox`,         unit: 'mV',     min: 0,   max: 800, normLow: 650,  normHigh: 720  },
  tac:         { topic: `${BASE}/Piscine/TAC`,           unit: 'ppm',    min: 0,   max: 200, normLow: 80,   normHigh: 120  },
  tds:         { topic: `${BASE}/Piscine/TDS`,           unit: 'ppm',    min: 0,   max: 2000,normLow: 250,  normHigh: 1500 },
  th:          { topic: `${BASE}/Piscine/TH`,            unit: 'ppm',    min: 0,   max: 300, normLow: 80,   normHigh: 200  },
  temperature: { topic: `${BASE}/Piscine/Temperature`,   unit: '°C',     min: -10, max: 45,  normLow: 25,   normHigh: 30   },
  tempMoy:     { topic: `${BASE}/Piscine/TempMoy`,       unit: '°C',     min: -10, max: 45   },
  tempMin:     { topic: `${BASE}/Piscine/TempMin`,       unit: '°C',     min: -10, max: 45   },
  tempMax:     { topic: `${BASE}/Piscine/TempMax`,       unit: '°C',     min: -10, max: 45   },
  frequence:   { topic: `${BASE}/Piscine/Frequence`,     unit: 'Hz',     min: 0,   max: 50   },
  heureDeb:    { topic: `${BASE}/Piscine/HeureDeb`,      unit: 'h',      min: 0,   max: 23   },
  minDeb:      { topic: `${BASE}/Piscine/MinDeb`,        unit: 'min',    min: 0,   max: 59   },
  heureFin:    { topic: `${BASE}/Piscine/HeureFin`,      unit: 'h',      min: 0,   max: 23   },
  minFin:      { topic: `${BASE}/Piscine/MinFin`,        unit: 'min',    min: 0,   max: 59   },
  depression:  { topic: `${BASE}/Piscine/Depression`,    unit: 'bar',    min: -50, max: 0,   normLow: -50, normHigh: -3   },
  volume:      { topic: `${BASE}/Piscine/Volume`,        unit: 'm³',     min: 0,   max: 200  },
  debitPompe:  { topic: `${BASE}/Piscine/DebitPompe`,    unit: 'm³/h',   min: 0,   max: 20   },
  pompePH:     { topic: `${BASE}/Piscine/PompePH`,       unit: 'dl/m',   min: 0,   max: 200  },
  pompeRedox:  { topic: `${BASE}/Piscine/PompeRedox`,    unit: 'dl/m',   min: 0,   max: 200  },
  freqBasse:   { topic: `${BASE}/Piscine/FreqBasse`,     unit: 'Hz',     min: 0,   max: 50   },
  freqMoy:     { topic: `${BASE}/Piscine/FreqMoy`,       unit: 'Hz',     min: 0,   max: 50   },
  freqHaute:   { topic: `${BASE}/Piscine/FreqHaute`,     unit: 'Hz',     min: 0,   max: 50   },
  minFreqHaut: { topic: `${BASE}/Piscine/minFreqHaut`,   unit: 'min',    min: 0,   max: 59   },
  etalonPh1:   { topic: `${BASE}/Piscine/EtalonPh1`,     unit: 'pH',     min: 0,   max: 14   },
  etalonPh2:   { topic: `${BASE}/Piscine/EtalonPh2`,     unit: 'pH',     min: 0,   max: 14   },
  amorcePH:    { topic: `${BASE}/Piscine/AmorcePH`,      unit: '',       min: 0,   max: 1    },
  amorceRedox: { topic: `${BASE}/Piscine/AmorceRedox`,   unit: '',       min: 0,   max: 1    },
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
