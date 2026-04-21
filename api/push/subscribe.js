// api/push/subscribe.js
// Gestion des abonnements push — stockage JSON persistant via Vercel Blob
//
// POST   /api/push/subscribe   → enregistre un abonné
// DELETE /api/push/subscribe   → supprime un abonné

import { put, list } from '@vercel/blob';

const BLOB_PATH = 'piscine-push-subs.json';

// ── Helpers Blob ──────────────────────────────────────────────────────────────

async function readStore() {
  try {
    const { blobs } = await list({ prefix: BLOB_PATH });
    if (!blobs.length) return { subscriptions: [], lastAlerts: {} };
    const res = await fetch(blobs[0].url, { cache: 'no-store' });
    return await res.json();
  } catch (err) {
    console.warn('⚠️ Impossible de lire le store push:', err.message);
    return { subscriptions: [], lastAlerts: {} };
  }
}

async function writeStore(store) {
  await put(BLOB_PATH, JSON.stringify(store, null, 2), {
    access: 'private',
    addRandomSuffix: false,
    contentType: 'application/json',
  });
}

// ── Handler ───────────────────────────────────────────────────────────────────

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();

  const store = await readStore();

  // ── POST : ajouter un abonnement ──────────────────────────────────────────
  if (req.method === 'POST') {
    const sub = req.body;
    if (!sub?.endpoint) {
      return res.status(400).json({ error: 'Subscription invalide : endpoint manquant' });
    }

    const alreadyExists = store.subscriptions.some(s => s.endpoint === sub.endpoint);
    if (!alreadyExists) {
      store.subscriptions.push({ ...sub, registeredAt: new Date().toISOString() });
      await writeStore(store);
      console.log(`✅ Nouvel abonné push enregistré. Total : ${store.subscriptions.length}`);
    } else {
      console.log('ℹ️ Abonné déjà existant, pas de doublon ajouté.');
    }

    return res.status(201).json({ ok: true, total: store.subscriptions.length });
  }

  // ── DELETE : supprimer un abonnement ─────────────────────────────────────
  if (req.method === 'DELETE') {
    const { endpoint } = req.body;
    if (!endpoint) return res.status(400).json({ error: 'endpoint manquant' });

    const before = store.subscriptions.length;
    store.subscriptions = store.subscriptions.filter(s => s.endpoint !== endpoint);
    const removed = before - store.subscriptions.length;

    if (removed > 0) {
      await writeStore(store);
      console.log(`🗑️ Abonné supprimé. Total restant : ${store.subscriptions.length}`);
    }

    return res.status(200).json({ ok: true, removed, total: store.subscriptions.length });
  }

  return res.status(405).json({ error: 'Method not allowed' });
}