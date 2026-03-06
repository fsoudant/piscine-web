/**
 * mqtt-service.js
 * Couche Transport — MQTT uniquement, aucune dépendance UI ni métier
 *
 * NOTE sur le port :
 *   - 1883 → MQTT TCP brut       (impossible depuis un navigateur)
 *   - 8883 → MQTT TCP + TLS      (impossible depuis un navigateur)
 *   - 9001 → MQTT WebSocket      (standard Mosquitto)
 *   - 8083 → MQTT WebSocket      (HiveMQ, EMQX)
 *   - 443  → MQTT WebSocket/TLS  (WSS, passe les firewalls)
 *   ⇒ Demandez à votre hébergeur Maquiatto quel port WS ils exposent.
 */

'use strict';

export const ConnectionState = Object.freeze({
  DISCONNECTED: 'disconnected',
  CONNECTING:   'connecting',
  CONNECTED:    'connected',
  ERROR:        'error',
});

export class MqttService {

  constructor() {
    this._client      = null;
    this._listeners   = {};   // { event: [fn, ...] }
    this._config      = null;
    this._state       = ConnectionState.DISCONNECTED;
  }

  // ── Événements ────────────────────────────────────────────────────────────
  on(event, fn) {
    if (!this._listeners[event]) this._listeners[event] = [];
    this._listeners[event].push(fn);
    return this;
  }

  _emit(event, ...args) {
    (this._listeners[event] || []).forEach(fn => fn(...args));
  }

  // ── API publique ──────────────────────────────────────────────────────────

  /**
   * @param {{ host: string, port: number, user: string, pass: string, tls: boolean }} config
   */
  connect(config) {
    this._config = config;
    this._setState(ConnectionState.CONNECTING);

    const proto = config.tls ? 'wss' : 'ws';
    const url   = `${proto}://${config.host}:${config.port}/mqtt`;

    this._client = mqtt.connect(url, {
      username:        config.user,
      password:        config.pass,
      clientId:        'piscine_pwa_' + Math.random().toString(16).slice(2, 10),
      keepalive:       60,
      reconnectPeriod: 5000,
      connectTimeout:  10000,
    });

    this._client.on('connect',   ()        => this._onConnect());
    this._client.on('error',     (err)     => this._onError(err));
    this._client.on('offline',   ()        => this._setState(ConnectionState.DISCONNECTED));
    this._client.on('reconnect', ()        => this._setState(ConnectionState.CONNECTING));
    this._client.on('message',   (t, msg)  => this._emit('message', t, msg.toString()));
  }

  disconnect() {
    if (this._client) {
      this._client.end(true);
      this._client = null;
    }
    this._setState(ConnectionState.DISCONNECTED);
  }

  subscribe(topics) {
    if (!this._client) return;
    topics.forEach(t => this._client.subscribe(t, { qos: 1 }));
  }

  /**
   * @param {string} topic
   * @param {string|number} value
   * @param {boolean} [retain=true]
   */
  publish(topic, value, retain = true) {
    if (!this._client || !this._isConnected()) {
      console.warn('⚠️ Cannot publish: client not connected');
      return false;
    }
    console.log('📤 Publishing to', topic, ':', value);
    this._client.publish(topic, String(value), { qos: 1, retain });
    return true;
  }

  get connectionState() { return this._state; }
  get isConnected()     { return this._state === ConnectionState.CONNECTED; }

  // ── Privé ─────────────────────────────────────────────────────────────────

  _onConnect() {
    this._setState(ConnectionState.CONNECTED);
    this._emit('connected');
  }

  _onError(err) {
    this._setState(ConnectionState.ERROR);
    this._emit('error', err);
  }

  _setState(newState) {
    if (this._state === newState) return;
    this._state = newState;
    this._emit('stateChange', newState);
  }

  _isConnected() {
    return this._state === ConnectionState.CONNECTED;
  }
}
