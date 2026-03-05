// api/alexa-webhook.js
// Backend Vercel pour Alexa Skill - Via proxy MQTT

import mqtt from 'mqtt';

// Connexion MQTT via proxy et lecture des valeurs retained
async function getPoolState() {
  return new Promise((resolve, reject) => {
    const client = mqtt.connect('wss://mqtt-proxy-piscine.onrender.com:443', {
      username: process.env.MQTT_USER,
      password: process.env.MQTT_PASS,
      protocol: 'wss',
      rejectUnauthorized: false
    });
    
    const state = {};
    const topics = [
      'francois.soudant@gmail.com/Piscine/Temperature',
      'francois.soudant@gmail.com/Piscine/PH',
      'francois.soudant@gmail.com/Piscine/Redox',
      'francois.soudant@gmail.com/Piscine/TAC',
      'francois.soudant@gmail.com/Piscine/TH',
      'francois.soudant@gmail.com/Piscine/TDS',
      'francois.soudant@gmail.com/Piscine/Mode'
    ];
    
    let receivedCount = 0;
    const timeout = setTimeout(() => {
      client.end();
      reject(new Error('MQTT timeout'));
    }, 10000);
    
    client.on('connect', () => {
      console.log('✅ MQTT Connected via proxy');
      topics.forEach(topic => {
        client.subscribe(topic, { qos: 1 });
      });
    });
    
    client.on('message', (topic, message) => {
      const value = parseFloat(message.toString());
      
      if (topic.endsWith('/Temperature')) state.temperature = value;
      else if (topic.endsWith('/PH')) state.ph = value;
      else if (topic.endsWith('/Redox')) state.redox = value;
      else if (topic.endsWith('/TAC')) state.tac = value;
      else if (topic.endsWith('/TH')) state.th = value;
      else if (topic.endsWith('/TDS')) state.tds = value;
      else if (topic.endsWith('/Mode')) state.mode = value;
      
      receivedCount++;
      
      if (receivedCount >= topics.length) {
        clearTimeout(timeout);
        client.end();
        console.log('✅ État reçu:', state);
        resolve(state);
      }
    });
    
    client.on('error', (err) => {
      console.error('❌ MQTT Error:', err.message);
      clearTimeout(timeout);
      client.end();
      reject(err);
    });
  });
}

// Calculer la qualité globale
function calculateWaterQuality(state) {
  let score = 0;
  let issues = [];
  
  if (state.ph >= 7.0 && state.ph <= 7.4) {
    score += 40;
  } else if (state.ph >= 6.8 && state.ph <= 7.6) {
    score += 20;
    issues.push('le pH est légèrement hors norme');
  } else {
    issues.push('le pH est hors norme');
  }
  
  if (state.redox >= 650 && state.redox <= 750) {
    score += 30;
  } else if (state.redox >= 600 && state.redox <= 800) {
    score += 15;
    issues.push('le redox est acceptable');
  } else {
    issues.push('le redox est hors norme');
  }
  
  if (state.temperature >= 24 && state.temperature <= 28) {
    score += 20;
  } else {
    score += 10;
  }
  
  if (state.tac >= 80 && state.tac <= 120) {
    score += 10;
  }
  
  if (score >= 90) return { quality: 'excellente', issues: [] };
  if (score >= 70) return { quality: 'bonne', issues };
  if (score >= 50) return { quality: 'correcte', issues };
  return { quality: 'mauvaise', issues };
}

// Publier sur MQTT via proxy
async function publishMQTT(topic, value) {
  return new Promise((resolve, reject) => {
    const client = mqtt.connect('wss://mqtt-proxy-piscine.onrender.com:443', {
      username: process.env.MQTT_USER,
      password: process.env.MQTT_PASS,
      protocol: 'wss',
      rejectUnauthorized: false
    });
    
    const timeout = setTimeout(() => {
      client.end();
      reject(new Error('Publish timeout'));
    }, 5000);
    
    client.on('connect', () => {
      client.publish(topic, String(value), { qos: 1, retain: true }, (err) => {
        clearTimeout(timeout);
        client.end();
        if (err) reject(err);
        else resolve();
      });
    });
    
    client.on('error', (err) => {
      clearTimeout(timeout);
      client.end();
      reject(err);
    });
  });
}

// Handler principal
export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }
  
  const alexaRequest = req.body;
  const requestType = alexaRequest.request.type;
  
  // LaunchRequest
  if (requestType === 'LaunchRequest') {
    return res.json({
      version: '1.0',
      response: {
        outputSpeech: {
          type: 'PlainText',
          text: 'Bienvenue sur le contrôle de votre piscine. Vous pouvez me demander la température, le pH, ou la qualité de l\'eau.'
        },
        shouldEndSession: false
      }
    });
  }
  
  // IntentRequest
  if (requestType === 'IntentRequest') {
    const intentName = alexaRequest.request.intent.name;
    
    let state;
    try {
      state = await getPoolState();
    } catch (err) {
      console.error('Erreur récupération état MQTT:', err);
      return res.json({
        version: '1.0',
        response: {
          outputSpeech: {
            type: 'PlainText',
            text: 'Désolé, je ne peux pas récupérer les données de la piscine pour le moment. Vérifiez que la connexion est active.'
          },
          shouldEndSession: true
        }
      });
    }
    
    let speechText = '';
    
    // Intent : Température
    if (intentName === 'GetTemperatureIntent') {
      const temp = state.temperature || 0;
      speechText = `La température de la piscine est de ${temp.toFixed(1)} degrés Celsius.`;
      
      if (temp < 20) {
        speechText += ' C\'est un peu froid pour se baigner.';
      } else if (temp > 30) {
        speechText += ' C\'est très chaud, attention à la prolifération d\'algues.';
      } else if (temp >= 24 && temp <= 28) {
        speechText += ' C\'est parfait pour se baigner.';
      }
    }
    
    // Intent : pH
    else if (intentName === 'GetPHIntent') {
      const ph = state.ph || 0;
      speechText = `Le pH de la piscine est de ${ph.toFixed(1)}.`;
      
      if (ph >= 7.0 && ph <= 7.4) {
        speechText += ' C\'est parfait, le pH est dans la norme.';
      } else if (ph < 7.0) {
        speechText += ' Le pH est trop bas, l\'eau est acide. Ajoutez du pH plus.';
      } else if (ph > 7.4) {
        speechText += ' Le pH est trop haut, l\'eau est basique. Ajoutez du pH moins.';
      }
    }
    
    // Intent : Redox
    else if (intentName === 'GetRedoxIntent') {
      const redox = state.redox || 0;
      speechText = `Le potentiel Redox est de ${Math.round(redox)} millivolts.`;
      
      if (redox >= 650 && redox <= 750) {
        speechText += ' C\'est excellent, l\'eau est bien désinfectée.';
      } else if (redox < 650) {
        speechText += ' C\'est un peu bas, pensez à ajouter du chlore.';
      } else {
        speechText += ' C\'est élevé, l\'eau est bien traitée.';
      }
    }
    
    // Intent : Qualité globale
    else if (intentName === 'GetWaterQualityIntent') {
      const quality = calculateWaterQuality(state);
      
      speechText = `La qualité de l'eau est ${quality.quality}.`;
      
      if (quality.issues.length > 0) {
        speechText += ` Cependant, ${quality.issues.join(' et ')}.`;
      }
      
      speechText += ` Température: ${(state.temperature || 0).toFixed(1)} degrés, pH: ${(state.ph || 0).toFixed(1)}, Redox: ${Math.round(state.redox || 0)} millivolts.`;
    }
    
    // Intent : Résumé complet
    else if (intentName === 'GetStatusIntent') {
      const quality = calculateWaterQuality(state);
      
      speechText = `Voici l'état de votre piscine. `;
      speechText += `Température: ${(state.temperature || 0).toFixed(1)} degrés. `;
      speechText += `pH: ${(state.ph || 0).toFixed(1)}. `;
      speechText += `Qualité de l'eau: ${quality.quality}.`;
      
      const mode = state.mode || 0;
      const modeText = mode === 0 ? 'arrêt' : mode === 1 ? 'automatique' : 'manuel';
      speechText += ` Mode de filtration: ${modeText}.`;
    }
    
    // Intent : Démarrer filtration
    else if (intentName === 'StartFiltrationIntent') {
      try {
        await publishMQTT('francois.soudant@gmail.com/Piscine/Mode', '1');
        speechText = 'J\'ai activé le mode automatique de la filtration.';
      } catch (err) {
        console.error('Erreur publish MQTT:', err);
        speechText = 'Désolé, je n\'ai pas pu activer la filtration.';
      }
    }
    
    // Intent : Arrêter filtration
    else if (intentName === 'StopFiltrationIntent') {
      try {
        await publishMQTT('francois.soudant@gmail.com/Piscine/Mode', '0');
        speechText = 'J\'ai arrêté la filtration.';
      } catch (err) {
        console.error('Erreur publish MQTT:', err);
        speechText = 'Désolé, je n\'ai pas pu arrêter la filtration.';
      }
    }
    
    // Intent inconnu
    else {
      speechText = 'Désolé, je n\'ai pas compris. Vous pouvez me demander la température, le pH, ou la qualité de l\'eau.';
    }
    
    return res.json({
      version: '1.0',
      response: {
        outputSpeech: {
          type: 'PlainText',
          text: speechText
        },
        shouldEndSession: true
      }
    });
  }
  
  // SessionEndedRequest
  if (requestType === 'SessionEndedRequest') {
    return res.json({ version: '1.0' });
  }
  
  return res.status(400).json({ error: 'Unknown request type' });
}
