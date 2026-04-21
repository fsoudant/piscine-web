/**
 * push-manager.js
 * Couche Notifications — gestion côté client des abonnements push
 *
 * Usage dans app.js :
 *   import { PushManager } from './push-manager.js';
 *   const push = new PushManager();
 *   // Après enregistrement du Service Worker :
 *   const state = await push.init(swRegistration);
 *   // Sur clic bouton cloche :
 *   await push.toggle(onStateChange);
 */

'use strict';

const SUBSCRIBE_API  = '/api/push/subscribe';
const VAPID_KEY_API  = '/api/push/vapid-key';

export class PushManager {
  #vapidPublicKey  = null;
  #swRegistration  = null;

  // ── Getters d'état ────────────────────────────────────────────────────────

  /** Vrai si l'API Push est disponible dans ce navigateur */
  get isSupported() {
    return 'Notification' in window
      && 'PushManager' in window
      && 'serviceWorker' in navigator;
  }

  /** 'default' | 'granted' | 'denied' */
  get permission() {
    return this.isSupported ? Notification.permission : 'denied';
  }

  // ── Initialisation ────────────────────────────────────────────────────────

  /**
   * À appeler juste après l'enregistrement réussi du Service Worker.
   * @param  {ServiceWorkerRegistration} swReg
   * @returns {Promise<'unsupported'|'denied'|'subscribed'|'idle'|'error'>}
   */
  async init(swReg) {
    if (!this.isSupported) return 'unsupported';
    this.#swRegistration = swReg;

    // Récupérer la clé VAPID publique depuis l'API Vercel
    try {
      const r = await fetch(VAPID_KEY_API);
      const { publicKey } = await r.json();
      if (!publicKey) throw new Error('Clé VAPID vide');
      this.#vapidPublicKey = publicKey;
    } catch (err) {
      console.warn('⚠️ Clé VAPID inaccessible :', err.message);
      return 'error';
    }

    if (this.permission === 'denied') return 'denied';

    const existing = await this.#swRegistration.pushManager.getSubscription();
    return existing ? 'subscribed' : 'idle';
  }

  // ── Abonnement ────────────────────────────────────────────────────────────

  /**
   * Demande la permission, crée l'abonnement push et l'enregistre côté serveur.
   * @throws {Error} si la permission est refusée ou si l'API est indisponible
   */
  async subscribe() {
    if (!this.isSupported)     throw new Error('Notifications non supportées sur cet appareil.');
    if (!this.#swRegistration) throw new Error('Service Worker non initialisé.');
    if (!this.#vapidPublicKey) throw new Error('Clé VAPID manquante — vérifiez la config serveur.');

    const permission = await Notification.requestPermission();
    if (permission !== 'granted') throw new Error('Permission refusée par l\'utilisateur.');

    const subscription = await this.#swRegistration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: this.#urlBase64ToUint8Array(this.#vapidPublicKey),
    });

    const res = await fetch(SUBSCRIBE_API, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(subscription),
    });

    if (!res.ok) throw new Error('Échec de l\'enregistrement côté serveur.');

    console.log('🔔 Notifications push activées');
    return subscription;
  }

  // ── Désabonnement ─────────────────────────────────────────────────────────

  async unsubscribe() {
    if (!this.#swRegistration) return;

    const sub = await this.#swRegistration.pushManager.getSubscription();
    if (!sub) return;

    // Supprimer côté serveur
    await fetch(SUBSCRIBE_API, {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ endpoint: sub.endpoint }),
    });

    // Désabonner côté navigateur
    await sub.unsubscribe();
    console.log('🔕 Notifications push désactivées');
  }

  // ── Toggle (pratique pour le bouton UI) ──────────────────────────────────

  /**
   * Bascule l'état abonné/désabonné.
   * @param {function} onStateChange  Callback appelé avec le nouvel état
   * @returns {Promise<'subscribed'|'idle'>}
   */
  async toggle(onStateChange) {
    const existing = await this.#swRegistration?.pushManager.getSubscription();

    if (existing) {
      await this.unsubscribe();
      onStateChange?.('idle');
      return 'idle';
    } else {
      await this.subscribe();
      onStateChange?.('subscribed');
      return 'subscribed';
    }
  }

  // ── Utilitaire : décode la clé VAPID base64url → Uint8Array ──────────────

  #urlBase64ToUint8Array(base64String) {
    const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
    const base64  = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
    const raw     = atob(base64);
    return Uint8Array.from([...raw].map(c => c.charCodeAt(0)));
  }
}
