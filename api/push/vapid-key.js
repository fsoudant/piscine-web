// api/push/vapid-key.js
// Expose la clé publique VAPID au client (la clé publique n'est pas secrète)

export default function handler(req, res) {
  res.setHeader('Cache-Control', 'public, max-age=86400'); // 24h — la clé ne change pas
  res.json({ publicKey: process.env.VAPID_PUBLIC_KEY || '' });
}
