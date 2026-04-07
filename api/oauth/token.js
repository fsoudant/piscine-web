// api/oauth/token.js
// OAuth token endpoint - gère HTTP Basic Auth et form-urlencoded

export default async function handler(req, res) {
  console.log('🔑 OAuth Token endpoint called');
  console.log('Content-Type:', req.headers['content-type']);
  console.log('Method:', req.method);
  
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'method_not_allowed' });
  }
  
  // Parser le body selon le Content-Type
  let body = {};
  
  // Alexa peut envoyer en application/x-www-form-urlencoded
  if (req.headers['content-type']?.includes('application/x-www-form-urlencoded')) {
    // Vercel parse automatiquement en req.body pour form-urlencoded
    body = req.body;
  } else if (req.headers['content-type']?.includes('application/json')) {
    body = req.body;
  } else {
    // Fallback
    body = req.body;
  }
  
  // Alexa envoie client_id/secret en HTTP Basic Auth header
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith('Basic ')) {
    const base64Credentials = authHeader.substring(6);
    const credentials = Buffer.from(base64Credentials, 'base64').toString('utf-8');
    const [clientId, clientSecret] = credentials.split(':');
    
    // Utiliser les credentials de l'header
    body.client_id = clientId;
    body.client_secret = clientSecret;
    
    console.log('📨 Using HTTP Basic Auth');
  }
  
  console.log('📋 Request data:', {
    grant_type: body.grant_type,
    code: body.code,
    client_id: body.client_id,
    has_secret: !!body.client_secret,
    redirect_uri: body.redirect_uri
  });
  
  // Validation client_id
  if (body.client_id !== 'piscine-client') {
    console.error('❌ Invalid client_id:', body.client_id);
    return res.status(400).json({ 
      error: 'invalid_client',
      error_description: 'Client ID does not match'
    });
  }
  
  // Validation client_secret
  if (body.client_secret !== process.env.OAUTH_SECRET) {
    console.error('❌ Invalid client_secret');
    console.error('Expected:', process.env.OAUTH_SECRET ? 'Set' : 'NOT SET');
    console.error('Received:', body.client_secret);
    return res.status(400).json({ 
      error: 'invalid_client',
      error_description: 'Client secret does not match'
    });
  }
  
  // Validation grant_type
  if (body.grant_type !== 'authorization_code') {
    console.error('❌ Unsupported grant_type:', body.grant_type);
    return res.status(400).json({ 
      error: 'unsupported_grant_type',
      error_description: 'Only authorization_code is supported'
    });
  }
  
  // Générer access token
  const accessToken = 'piscine_token_' + Date.now() + '_' + Math.random().toString(36).substring(7);
  const refreshToken = 'refresh_' + Date.now() + '_' + Math.random().toString(36).substring(7);
  
  console.log('✅ Access token generated successfully');
  
  // Retourner le token
  return res.status(200).json({
    access_token: accessToken,
    token_type: 'Bearer',
    expires_in: 31536000, // 1 an
    refresh_token: refreshToken
  });
}