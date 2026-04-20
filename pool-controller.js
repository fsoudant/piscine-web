/**
 * pool-controller.js
 * Façade — orchestre MqttService et Pool
 *
 * Responsabilités :
 *   - Instancier et posséder MqttService et Pool
 *   - Gérer la configuration du proxy MQTT
 *   - Câbler MQTT → Pool (setFromMqtt) et émettre 'valueChange'
 *   - Exposer une API unifiée à app.js
 *
 * app.js ne voit ni MqttService ni Pool directement.
 */

'use strict';

import { Pool, TOPICS, TOPIC_TO_KEY } from './shared/pool-model.js';
import { MqttService, ConnectionState } from './mqtt-service.js';

// Dépendances du calcul ISL — toute modification d'une de ces clés
// déclenche automatiquement un recalcul et l'émission de 'valueChange' pour 'isl'
const ISL_DEPS = new Set(['ph', 'tds', 'th', 'tac', 'temperature']);

// Dépendances de la préconisation
const PRECO_DEPS = new Set(['redox', 'depression', 'tac', 'ph', 'tds', 'th']);

export { ConnectionState };

// Configuration du proxy — détail d'infrastructure masqué à l'extérieur
const MQTT_PROXY = {
  host: 'mqtt-proxy-piscine.onrender.com',
  port: 443,
  tls:  true,   // WSS
};

// Topics à souscrire (on exclut les topics vides comme l'ISL calculé)
const SUBSCRIBABLE_TOPICS = Object.values(TOPICS)
  .filter(t => t.topic !== '')
  .map(t => t.topic);

export class PoolController {

  #pool;
  #mqtt;
  #listeners = {};

  constructor() {
    this.#mqtt = new MqttService();
    this.#pool = new Pool(this.#mqtt);
    this.#wireInternalEvents();
  }

  // ── Connexion ──────────────────────────────────────────────────────────────

  /**
   * Lance la connexion MQTT avec les credentials utilisateur.
   * La config proxy est gérée ici, invisible pour app.js.
   *
   * @param {string} user
   * @param {string} pass
   */
  connect(user, pass) {
    this.#mqtt.connect({ ...MQTT_PROXY, user, pass });
  }

  disconnect() {
    this.#mqtt.disconnect();
  }

  // ── Événements publics ─────────────────────────────────────────────────────
  //
  // Événements émis :
  //   'stateChange' (state: ConnectionState)  — état de connexion MQTT
  //   'error'       (err: Error)              — erreur MQTT
  //   'valueChange' (key: string, val: any)   — valeur Pool mise à jour depuis MQTT

  on(event, fn) {
    if (!this.#listeners[event]) this.#listeners[event] = [];
    this.#listeners[event].push(fn);
    return this;
  }

  // ── API Pool (valeurs métier) ──────────────────────────────────────────────

  /**
   * Modification initiée par l'utilisateur → publie vers MQTT.
   * Si la clé est une dépendance ISL, émet aussi 'valueChange' pour 'isl'.
   */
  setValue(key, value) {
    const result = this.#pool.setValue(key, value);
    if (result && ISL_DEPS.has(key)) this.#emitIsl();
    if (result && PRECO_DEPS.has(key)) this.#emitPreco();
    return result;
  }

  getValue(key)         { return this.#pool.getValue(key); }
  getAllValues()        { return this.#pool.getAllValues(); }
  normalize(key, val)  { return this.#pool.normalize(key, val); }
  classify(key, val)   { return this.#pool.classify(key, val); }
  normBounds(key)      { return this.#pool.normBounds(key); }

  // ── API MQTT directe ───────────────────────────────────────────────────────
  //   Réservée aux publications ponctuelles depuis l'UI (ui.onPublish)
  //   qui ne passent pas par le modèle Pool.

  publish(topic, value, retain = true) {
    return this.#mqtt.publish(topic, value, retain);
  }

  get connectionState() { return this.#mqtt.connectionState; }
  get isConnected()     { return this.#mqtt.isConnected; }

  // ── Câblage interne MqttService → Pool → événements ──────────────────────

  #emit(event, ...args) {
    (this.#listeners[event] || []).forEach(fn => fn(...args));
  }

  #emitIsl() {
    const isl = this.#pool.isl;
    if (isl !== null) this.#emit('valueChange', 'isl', isl);
  }

  #emitPreco() {
    const preco = this.#pool.preco;
    // Émettre même si vide : l'UI doit pouvoir effacer un message précédent
    this.#emit('valueChange', 'preco', preco);
  }

  #wireInternalEvents() {

    this.#mqtt.on('stateChange', state => {
      if (state === ConnectionState.CONNECTED) {
        // Petit délai pour laisser le handshake se stabiliser
        // (comportement observé nécessaire sur connexion lente / iPhone)
        setTimeout(() => this.#mqtt.subscribe(SUBSCRIBABLE_TOPICS), 100);
      }
      this.#emit('stateChange', state);
    });

    this.#mqtt.on('error', err => this.#emit('error', err));

    this.#mqtt.on('message', (topic, rawValue) => {
      const key = TOPIC_TO_KEY[topic];
      if (!key) return;

      // setFromMqtt : positionne la valeur SANS re-publier (pas d'echo loop)
      const ok  = this.#pool.setFromMqtt(key, rawValue);
      if (!ok) return;

      const val = this.#pool.getValue(key);
      this.#emit('valueChange', key, val);

      // Si la valeur modifie l'ISL, on l'émet immédiatement à sa suite
      if (ISL_DEPS.has(key)) this.#emitIsl();
      // Si la valeur modifie la préconisation, on l'émet aussi
      if (PRECO_DEPS.has(key)) this.#emitPreco();
    });
  }
}
