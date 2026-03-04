// api/alexa-webhook.js
// Backend Vercel pour Alexa Skill - Lecture MQTT directe

import mqtt from 'mqtt';
import { TOPICS, calculateWaterQuality } from '../shared/pool-model.js';

// Connexion MQTT et lecture des valeurs retained
async function getPoolState() {
  return new Promise((resolve, reject) => {
    const client = mqtt.connect('wss://maqiatto.com:8883/mqtt', {
      username: process.env.MQTT_USER,
      password: process.env.MQTT_PASS,
      clean: true
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
    }, 5000);
    
    client.on('connect', () => {
      // S'abonner à tous les topics
      topics.forEach(topic => {
        client.subscribe(topic, { qos: 1 });
      });
    });
    
    client.on('message', (topic, message) => {
      const value = parseFloat(message.toString());
      
      // Mapper topic → clé
      if (topic.endsWith('/Temperature')) state.temperature = value;
      else if (topic.endsWith('/PH')) state.ph = value;
      else if (topic.endsWith('/Redox')) state.redox = value;
      else if (topic.endsWith('/TAC')) state.tac = value;
      else if (topic.endsWith('/TH')) state.th = value;
      else if (topic.endsWith('/TDS')) state.tds = value;
      else if (topic.endsWith('/Mode')) state.mode = value;
      
      receivedCount++;
      
      // Une fois qu'on a reçu toutes les valeurs retained
      if (receivedCount >= topics.length) {
        clearTimeout(timeout);
        client.end();
        resolve(state);
      }
    });
    
    client.on('error', (err) => {
      clearTimeout(timeout);
      client.end();
      reject(err);
    });
  });
}

// Publier sur MQTT
async function publishMQTT(topic, value) {
  return new Promise((resolve, reject) => {
    const client = mqtt.connect('wss://maqiatto.com:8883/mqtt', {
      username: process.env.MQTT_USER,
      password: process.env.MQTT_PASS
    });
    
    client.on('connect', () => {
      client.publish(topic, String(value), { qos: 1, retain: true }, (err) => {
        client.end();
        if (err) reject(err);
        else resolve();
      });
    });
    
    client.on('error', (err) => {
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
    
    // Récupérer l'état depuis MQTT
    let state;
    try {
      state = await getPoolState();
    } catch (err) {
      console.error('Erreur MQTT:', err);
      return res.json({
        version: '1.0',
        response: {
          outputSpeech: {
            type: 'PlainText',
            text: 'Désolé, je ne peux pas récupérer les données de la piscine pour le moment. Vérifiez que la connexion MQTT fonctionne.'
          },
          shouldEndSession: true
        }
      });
    }
    
    let speechText = '';
    
    // Intent : Température
    if (intentName === 'GetTemperatureIntent') {
      const temp = state.temperature;
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
      const ph = state.ph;
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

     // Calculer ISL directement avec les valeurs reçues
     const { ph, tds, th, tac, temperature } = state;
  
     if (!ph || !tds || !th || !tac || !temperature || tds <= 1 || th <= 0 || tac <= 0) {
       speechText = 'Je ne peux pas calculer l\'indice de Langelier car certaines données sont manquantes.';
     } else {
       const A = Math.log10(tds - 1) / 10;
       const B = -13.12 * Math.log10(temperature + 273) + 34.55;
       const C = Math.log10(th) - 0.4;
       const D = Math.log10(tac);
       const isl = ph - ((9.3 + A + B) - (C + D));
    
       speechText = `L'indice de Langelier est de ${isl.toFixed(2)}.`;
    
       if (isl >= -0.3 && isl <= 0.3) {
         speechText += ' L\'eau est équilibrée.';
       } else if (isl < -1) {
         speechText += ' Attention, l\'eau est très agressive.';
       } else if (isl > 1) {
         speechText += ' Attention, l\'eau est très entartrante.';
       } else if (isl < 0) {
         speechText += ' L\'eau est légèrement agressive.';
       } else {
         speechText += ' L\'eau est légèrement entartrante.';
       }
     }
   }
    
    // Intent : Qualité globale
    else if (intentName === 'GetWaterQualityIntent') {
      const quality = calculateWaterQuality(state);
      const isl = calculateISL(state);
      
      speechText = `La qualité de l'eau est ${quality.quality}.`;
      
      if (quality.issues.length > 0) {
        speechText += ` Cependant, ${quality.issues.join(' et ')}.`;
      }
      
      // Ajouter ISL si disponible
      if (isl && isl.status !== 'ok') {
        if (isl.value < 0) {
          speechText += ' L\'eau est un peu agressive.';
        } else {
          speechText += ' L\'eau est un peu entartrante.';
        }
      }
      
      speechText += ` Température: ${state.temperature.toFixed(1)} degrés, pH: ${state.ph.toFixed(1)}, Redox: ${Math.round(state.redox)} millivolts.`;
    }
    
    // Intent : Résumé complet
    else if (intentName === 'GetStatusIntent') {
      const quality = calculateWaterQuality(state);
      const isl = calculateISL(state);
      
      speechText = `Voici l'état de votre piscine. `;
      speechText += `Température: ${state.temperature.toFixed(1)} degrés. `;
      speechText += `pH: ${state.ph.toFixed(1)}. `;
      speechText += `Qualité de l'eau: ${quality.quality}.`;
      
      if (isl) {
        speechText += ` Indice de Langelier: ${isl.value.toFixed(2)}.`;
      }
      
      // Mode de filtration
      const mode = state.mode;
      const modeText = mode === 0 ? 'arrêt' : mode === 1 ? 'automatique' : 'manuel';
      speechText += ` Mode de filtration: ${modeText}.`;
    }
    
    // Intent : Démarrer filtration
    else if (intentName === 'StartFiltrationIntent') {
      try {
        await publishMQTT('francois.soudant@gmail.com/Piscine/Mode', '1');
        speechText = 'J\'ai activé le mode automatique de la filtration.';
      } catch (err) {
        speechText = 'Désolé, je n\'ai pas pu activer la filtration. Vérifiez la connexion.';
      }
    }
    
    // Intent : Arrêter filtration
    else if (intentName === 'StopFiltrationIntent') {
      try {
        await publishMQTT('francois.soudant@gmail.com/Piscine/Mode', '0');
        speechText = 'J\'ai arrêté la filtration.';
      } catch (err) {
        speechText = 'Désolé, je n\'ai pas pu arrêter la filtration. Vérifiez la connexion.';
      }
    }
    
    // Intent inconnu
    else {
      speechText = 'Désolé, je n\'ai pas compris. Vous pouvez me demander la température, le pH, la qualité de l\'eau, ou l\'indice de Langelier.';
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
