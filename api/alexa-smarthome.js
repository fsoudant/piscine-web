// api/alexa-smarthome.js
import mqtt from 'mqtt';

// --- FONCTIONS UTILITAIRES ---

async function getPoolState() {
  return new Promise((resolve, reject) => {
    const client = mqtt.connect('wss://mqtt-proxy-piscine.onrender.com/mqtt', {
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
      'francois.soudant@gmail.com/Piscine/Mode'
    ];
    
    let receivedCount = 0;
    const timeout = setTimeout(() => {
      client.end();
      reject(new Error('MQTT timeout'));
    }, 15000);
    
    client.on('connect', () => {
      topics.forEach(topic => client.subscribe(topic, { qos: 1 }));
    });
    
    client.on('message', (topic, message) => {
      const value = parseFloat(message.toString());
      if (topic.endsWith('/Temperature')) state.temperature = value;
      else if (topic.endsWith('/PH')) state.ph = value;
      else if (topic.endsWith('/Redox')) state.redox = value;
      else if (topic.endsWith('/Mode')) state.mode = value;
      
      receivedCount++;
      if (receivedCount >= topics.length) {
        clearTimeout(timeout);
        client.end();
        resolve(state);
      }
    });
  });
}

async function publishMQTT(topic, value) {
  return new Promise((resolve, reject) => {
    const client = mqtt.connect('wss://mqtt-proxy-piscine.onrender.com/mqtt', {
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
  });
}

function errorResponse(request, errorType, errorMessage) {
  return {
    event: {
      header: {
        namespace: 'Alexa',
        name: 'ErrorResponse',
        messageId: request.directive.header.messageId,
        correlationToken: request.directive.header.correlationToken,
        payloadVersion: '3'
      },
      endpoint: { endpointId: request.directive.endpoint?.endpointId },
      payload: { type: errorType, message: errorMessage }
    }
  };
}

// --- HANDLER PRINCIPAL ---

export default async function handler(req, res) {
  const request = req.body;
  const namespace = request.directive?.header?.namespace;
  const name = request.directive?.header?.name;

  try {
    // 1. DISCOVERY
    if (namespace === 'Alexa.Discovery' && name === 'Discover') {
      return res.json({
        event: {
          header: {
            namespace: 'Alexa.Discovery',
            name: 'Discover.Response',
            messageId: request.directive.header.messageId,
            payloadVersion: '3'
          },
          payload: {
            endpoints: [{
              endpointId: 'piscine-unique',
              manufacturerName: 'DIY',
              friendlyName: 'piscine',
              description: 'Système de gestion globale de la piscine',
              displayCategories: ['OTHER', 'TEMPERATURE_SENSOR'],
              capabilities: [
                // Capteur de Température
                {
                  type: 'AlexaInterface',
                  interface: 'Alexa.TemperatureSensor',
                  version: '3',
                  properties: {
                    supported: [{ name: 'temperature' }],
                    proactivelyReported: false,
                    retrievable: true
                  }
                },
                // Contrôle de la filtration (Marche/Arrêt)
                {
                  type: 'AlexaInterface',
                  interface: 'Alexa.PowerController',
                  version: '3',
                  properties: {
                    supported: [{ name: 'powerState' }],
                    proactivelyReported: false,
                    retrievable: true
                  }
                },
                // Capteur de pH (utilisant RangeController)
                {
                  type: 'AlexaInterface',
                  interface: 'Alexa.RangeController',
                  instance: 'piscine.ph',
                  version: '3',
                  capabilityResources: {
                    friendlyNames: [{ '@type': 'text', value: { text: 'pH', locale: 'fr-FR' } }]
                  },
                  configuration: {
                    supportedRange: { minimumValue: 0, maximumValue: 14, precision: 0.1 }
                  },
                  properties: {
                    supported: [{ name: 'rangeValue' }],
                    proactivelyReported: false,
                    retrievable: true
                  }
                },
                // Capteur Redox
                {
                  type: 'AlexaInterface',
                  interface: 'Alexa.RangeController',
                  instance: 'piscine.redox',
                  version: '3',
                  capabilityResources: {
                    friendlyNames: [{ '@type': 'text', value: { text: 'Redox', locale: 'fr-FR' } }]
                  },
                  configuration: {
                    supportedRange: { minimumValue: 0, maximumValue: 1000, precision: 1 },
                    unitOfMeasure: 'millivolts'
                  },
                  properties: {
                    supported: [{ name: 'rangeValue' }],
                    proactivelyReported: false,
                    retrievable: true
                  }
                },
                { type: 'AlexaInterface', interface: 'Alexa', version: '3' }
              ]
            }]
          }
        }
      });
    }

    // 2. REPORT STATE (Alexa demande toutes les valeurs d'un coup)
    if (namespace === 'Alexa' && name === 'ReportState') {
      const state = await getPoolState();
      return res.json({
        event: {
          header: {
            namespace: 'Alexa',
            name: 'StateReport',
            messageId: request.directive.header.messageId,
            correlationToken: request.directive.header.correlationToken,
            payloadVersion: '3'
          },
          endpoint: { endpointId: 'piscine-unique' },
          payload: {}
        },
        context: {
          properties: [
            {
              namespace: 'Alexa.TemperatureSensor',
              name: 'temperature',
              value: { value: state.temperature || 0, scale: 'CELSIUS' },
              timeOfSample: new Date().toISOString(),
              uncertaintyInMilliseconds: 1000
            },
            {
              namespace: 'Alexa.PowerController',
              name: 'powerState',
              value: (state.mode === 1 || state.mode === 2) ? 'ON' : 'OFF',
              timeOfSample: new Date().toISOString(),
              uncertaintyInMilliseconds: 1000
            },
            {
              namespace: 'Alexa.RangeController',
              instance: 'piscine.ph',
              name: 'rangeValue',
              value: state.ph || 0,
              timeOfSample: new Date().toISOString(),
              uncertaintyInMilliseconds: 1000
            },
            {
              namespace: 'Alexa.RangeController',
              instance: 'piscine.redox',
              name: 'rangeValue',
              value: state.redox || 0,
              timeOfSample: new Date().toISOString(),
              uncertaintyInMilliseconds: 1000
            }
          ]
        }
      });
    }

    // 3. COMMANDES (PowerController)
    if (namespace === 'Alexa.PowerController') {
      const powerState = (name === 'TurnOn') ? 'ON' : 'OFF';
      const mqttValue = (name === 'TurnOn') ? '1' : '0';
      
      await publishMQTT('francois.soudant@gmail.com/Piscine/Mode', mqttValue);

      return res.json({
        event: {
          header: {
            namespace: 'Alexa',
            name: 'Response',
            messageId: request.directive.header.messageId,
            correlationToken: request.directive.header.correlationToken,
            payloadVersion: '3'
          },
          endpoint: { endpointId: 'piscine-unique' },
          payload: {}
        },
        context: {
          properties: [{
            namespace: 'Alexa.PowerController',
            name: 'powerState',
            value: powerState,
            timeOfSample: new Date().toISOString(),
            uncertaintyInMilliseconds: 500
          }]
        }
      });
    }

    return res.json(errorResponse(request, 'INVALID_DIRECTIVE', 'Directive non supportée'));

  } catch (error) {
    return res.json(errorResponse(request, 'INTERNAL_ERROR', error.message));
  }
}