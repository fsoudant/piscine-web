// api/oauth/authorize.js
// OAuth simplifié pour usage personnel Smart Home

export default async function handler(req, res) {
  const { client_id, redirect_uri, state } = req.query;
  
  console.log('🔐 OAuth Authorize:', { client_id, redirect_uri, state });
  
  // Validation basique
  if (client_id !== 'piscine-client') {
    return res.status(400).send('Invalid client_id');
  }
  
  // Pour un usage personnel, on auto-approve
  // Générer un code d'autorisation simple
  const authCode = 'auth_' + Date.now();
  
  // Rediriger vers Alexa avec le code
  const redirectUrl = `${redirect_uri}?state=${state}&code=${authCode}`;
  
  console.log('✅ Redirecting to:', redirectUrl);
  
  return res.redirect(redirectUrl);
}
