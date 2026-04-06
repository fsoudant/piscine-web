// api/oauth/token.js
// OAuth token endpoint - simplifié pour usage personnel

export default async function handler(req, res) {
  const { grant_type, code, client_id, client_secret } = req.body;
  
  console.log('🔑 OAuth Token:', { grant_type, code, client_id });
  
  // Validation
  if (client_id !== 'piscine-client') {
    return res.status(400).json({ error: 'invalid_client' });
  }
  
  if (client_secret !== process.env.OAUTH_SECRET) {
    return res.status(400).json({ error: 'invalid_client' });
  }
  
  if (grant_type !== 'authorization_code') {
    return res.status(400).json({ error: 'unsupported_grant_type' });
  }
  
  // Générer un access token simple
  // Pour usage personnel, on peut utiliser un token fixe
  const accessToken = 'piscine_token_' + Date.now();
  
  console.log('✅ Access token generated');
  
  return res.json({
    access_token: accessToken,
    token_type: 'Bearer',
    expires_in: 3600 * 24 * 365, // 1 an
    refresh_token: 'refresh_' + Date.now()
  });
}
