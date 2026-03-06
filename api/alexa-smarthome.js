// api/alexa-smarthome.js
// Smart Home Skill API pour contrôle direct Alexa

import mqtt from 'mqtt';

// Connexion MQTT et lecture des valeurs (réutilisé de alexa-webhook.js)
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
      'francois.soudant@gmail.com/Piscine/TAC',
      'francois.soudant@gmail.com/Piscine/TH',
      'francois.soudant@gmail.com/Piscine/TDS',
      'francois.soudant@gmail.com/Piscine/Mode'
    ];
    
    let receivedCount = 0;
    const timeout = setTimeout(() => {
      client.end();
      reject(new Error('MQTT timeout'));
    }, 20000);
    
    client.on('connect', () => {
      console.log('✅ MQTT Connected via proxy');
      topics.forEach(topic => client.subscribe(topic, { qos: 1 }));
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

// Publier sur MQTT
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
    }, 10000);
    
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

// Générer une réponse d'erreur Smart Home
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
      endpoint: {
        endpointId: request.directive.endpoint?.endpointId
      },
      payload: {
        type: errorType,
        message: errorMessage
      }
    }
  };
}

// Handler principal Smart Home
export default async function handler(req, res) {
  console.log('📥 Smart Home Request:', JSON.stringify(req.body, null, 2));
  
  const request = req.body;
  const namespace = request.directive?.header?.namespace;
  const name = request.directive?.header?.name;
  
  try {
    // DISCOVERY - Découverte des appareils
    if (namespace === 'Alexa.Discovery' && name === 'Discover') {
      console.log('🔍 Discovery request');
      
      const response = {
        event: {
          header: {
            namespace: 'Alexa.Discovery',
            name: 'Discover.Response',
            messageId: request.directive.header.messageId,
            payloadVersion: '3'
          },
          payload: {
            endpoints: [
              // 1. Température
              {
                endpointId: 'piscine-temperature',
                manufacturerName: 'DIY',
                friendlyName: 'Température piscine',
                description: 'Capteur de température de la piscine',
                displayCategories: ['TEMPERATURE_SENSOR'],
                capabilities: [
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
                  {
                    type: 'AlexaInterface',
                    interface: 'Alexa.EndpointHealth',
                    version: '3',
                    properties: {
                      supported: [{ name: 'connectivity' }],
                      proactivelyReported: false,
                      retrievable: true
                    }
                  },
                  {
                    type: 'AlexaInterface',
                    interface: 'Alexa',
                    version: '3'
                  }
                ]
              },
              
              // 2. pH
              {
                endpointId: 'piscine-ph',
                manufacturerName: 'DIY',
                friendlyName: 'pH piscine',
                description: 'Capteur de pH de la piscine',
                displayCategories: ['OTHER'],
                capabilities: [
                  {
                    type: 'AlexaInterface',
                    interface: 'Alexa.RangeController',
                    instance: 'ph',
                    version: '3',
                    properties: {
                      supported: [{ name: 'rangeValue' }],
                      proactivelyReported: false,
                      retrievable: true
                    },
                    capabilityResources: {
                      friendlyNames: [
                        { '@type': 'text', value: { text: 'pH', locale: 'fr-FR' } },
                        { '@type': 'text', value: { text: 'Acidité', locale: 'fr-FR' } }
                      ]
                    },
                    configuration: {
                      supportedRange: {
                        minimumValue: 0,
                        maximumValue: 14,
                        precision: 0.1
                      }
                    }
                  },
                  {
                    type: 'AlexaInterface',
                    interface: 'Alexa',
                    version: '3'
                  }
                ]
              },
              
              // 3. Redox
              {
                endpointId: 'piscine-redox',
                manufacturerName: 'DIY',
                friendlyName: 'Redox piscine',
                description: 'Potentiel Redox (désinfection)',
                displayCategories: ['OTHER'],
                capabilities: [
                  {
                    type: 'AlexaInterface',
                    interface: 'Alexa.RangeController',
                    instance: 'redox',
                    version: '3',
                    properties: {
                      supported: [{ name: 'rangeValue' }],
                      proactivelyReported: false,
                      retrievable: true
                    },
                    capabilityResources: {
                      friendlyNames: [
                        { '@type': 'text', value: { text: 'Redox', locale: 'fr-FR' } },
                        { '@type': 'text', value: { text: 'Désinfection', locale: 'fr-FR' } }
                      ]
                    },
                    configuration: {
                      supportedRange: {
                        minimumValue: 0,
                        maximumValue: 1000,
                        precision: 1
                      },
                      unitOfMeasure: 'millivolts'
                    }
                  },
                  {
                    type: 'AlexaInterface',
                    interface: 'Alexa',
                    version: '3'
                  }
                ]
              },
              
              // 4. Filtration (Switch)
              {
                endpointId: 'piscine-filtration',
                manufacturerName: 'DIY',
                friendlyName: 'Filtration piscine',
                description: 'Système de filtration de la piscine',
                displayCategories: ['SWITCH'],
                capabilities: [
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
                  {
                    type: 'AlexaInterface',
                    interface: 'Alexa',
                    version: '3'
                  }
                ]
              }
            ]
          }
        }
      };
      
      console.log('✅ Discovery response:', response.event.payload.endpoints.length, 'endpoints');
      return res.json(response);
    }
    
    // REPORT STATE - Rapporter l'état d'un appareil
    if (namespace === 'Alexa' && name === 'ReportState') {
      const endpointId = request.directive.endpoint.endpointId;
      console.log('📊 ReportState for:', endpointId);
      
      const state = await getPoolState();
      const properties = [];
      
      if (endpointId === 'piscine-temperature') {
        properties.push({
          namespace: 'Alexa.TemperatureSensor',
          name: 'temperature',
          value: {
            value: state.temperature || 0,
            scale: 'CELSIUS'
          },
          timeOfSample: new Date().toISOString(),
          uncertaintyInMilliseconds: 1000
        });
      }
      
      if (endpointId === 'piscine-ph') {
        properties.push({
          namespace: 'Alexa.RangeController',
          instance: 'ph',
          name: 'rangeValue',
          value: state.ph || 0,
          timeOfSample: new Date().toISOString(),
          uncertaintyInMilliseconds: 1000
        });
      }
      
      if (endpointId === 'piscine-redox') {
        properties.push({
          namespace: 'Alexa.RangeController',
          instance: 'redox',
          name: 'rangeValue',
          value: state.redox || 0,
          timeOfSample: new Date().toISOString(),
          uncertaintyInMilliseconds: 1000
        });
      }
      
      if (endpointId === 'piscine-filtration') {
        const powerState = (state.mode === 1 || state.mode === 2) ? 'ON' : 'OFF';
        properties.push({
          namespace: 'Alexa.PowerController',
          name: 'powerState',
          value: powerState,
          timeOfSample: new Date().toISOString(),
          uncertaintyInMilliseconds: 1000
        });
      }
      
      const response = {
        event: {
          header: {
            namespace: 'Alexa',
            name: 'StateReport',
            messageId: request.directive.header.messageId,
            correlationToken: request.directive.header.correlationToken,
            payloadVersion: '3'
          },
          endpoint: {
            endpointId: endpointId
          },
          payload: {}
        },
        context: {
          properties: properties
        }
      };
      
      console.log('✅ StateReport:', properties);
      return res.json(response);
    }
    
    // TURN ON - Allumer la filtration
    if (namespace === 'Alexa.PowerController' && name === 'TurnOn') {
      console.log('🟢 TurnOn filtration');
      
      await publishMQTT('francois.soudant@gmail.com/Piscine/Mode', '1');
      
      const response = {
        event: {
          header: {
            namespace: 'Alexa',
            name: 'Response',
            messageId: request.directive.header.messageId,
            correlationToken: request.directive.header.correlationToken,
            payloadVersion: '3'
          },
          endpoint: {
            endpointId: 'piscine-filtration'
          },
          payload: {}
        },
        context: {
          properties: [{
            namespace: 'Alexa.PowerController',
            name: 'powerState',
            value: 'ON',
            timeOfSample: new Date().toISOString(),
            uncertaintyInMilliseconds: 500
          }]
        }
      };
      
      console.log('✅ Filtration turned ON');
      return res.json(response);
    }
    
    // TURN OFF - Éteindre la filtration
    if (namespace === 'Alexa.PowerController' && name === 'TurnOff') {
      console.log('🔴 TurnOff filtration');
      
      await publishMQTT('francois.soudant@gmail.com/Piscine/Mode', '0');
      
      const response = {
        event: {
          header: {
            namespace: 'Alexa',
            name: 'Response',
            messageId: request.directive.header.messageId,
            correlationToken: request.directive.header.correlationToken,
            payloadVersion: '3'
          },
          endpoint: {
            endpointId: 'piscine-filtration'
          },
          payload: {}
        },
        context: {
          properties: [{
            namespace: 'Alexa.PowerController',
            name: 'powerState',
            value: 'OFF',
            timeOfSample: new Date().toISOString(),
            uncertaintyInMilliseconds: 500
          }]
        }
      };
      
      console.log('✅ Filtration turned OFF');
      return res.json(response);
    }
    
    // Directive non supportée
    console.warn('⚠️ Unsupported directive:', namespace, name);
    return res.json(errorResponse(request, 'INVALID_DIRECTIVE', 'Directive not supported'));
    
  } catch (error) {
    console.error('❌ Error:', error);
    return res.json(errorResponse(request, 'INTERNAL_ERROR', error.message));
  }
}
