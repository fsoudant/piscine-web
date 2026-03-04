# 🏊‍♂️ Piscine Connectée - Système Unifié

Système complet de gestion et surveillance de piscine connectée via MQTT avec interface web PWA et contrôle vocal Alexa.

## 🎯 Fonctionnalités

### Progressive Web App (PWA)
- 📱 Interface responsive (mobile/desktop/tablette)
- 🔄 Temps réel via MQTT
- 📊 Visualisation des paramètres (pH, Redox, Température, etc.)
- 🎚️ Double slider pour période de filtration
- ⚙️ 3 modes : Arrêt, Automatique, Manuel
- 💾 Fonctionne hors ligne (Service Worker)
- 🏠 Installation sur écran d'accueil

### Alexa Skill
- 🎙️ Contrôle vocal naturel
- 📈 Informations temps réel
- 🧪 Calcul qualité d'eau
- 📐 Indice de Langelier (ISL)
- 🎛️ Commandes de contrôle (démarrer/arrêter filtration)

### Technologie
- 🔌 Communication MQTT (Maqiatto)
- ☁️ Déployé sur Vercel
- 🚀 Auto-deploy via GitHub
- 📦 Architecture modulaire

---

## 🏗️ Architecture

```
/                      → PWA (Progressive Web App)
/api/alexa-webhook     → API Alexa Skill
/shared/pool-model.js  → Logique métier partagée (source unique)
```

### Structure du projet

```
piscine/
├── api/
│   └── alexa-webhook.js       # API Alexa (lit MQTT, retourne réponses vocales)
├── public/
│   ├── index.html             # PWA interface
│   ├── app.js                 # Logique applicative
│   ├── ui-controller.js       # Contrôleur UI
│   ├── mqtt-service.js        # Service MQTT
│   ├── style.css              # Styles
│   ├── service-worker.js      # Cache offline
│   └── manifest.json          # PWA manifest
├── shared/
│   └── pool-model.js          # ⭐ Source unique de vérité
├── package.json
├── vercel.json
└── README.md
```

---

## 🚀 Déploiement

### Auto-deploy

Chaque `git push` déclenche un déploiement automatique sur Vercel :

```bash
git add .
git commit -m "Amélioration interface"
git push origin main

# → Vercel build et déploie automatiquement PWA + API
# → Temps : ~30 secondes
```

### URLs de production

- **PWA** : https://piscine.vercel.app
- **API Alexa** : https://piscine.vercel.app/api/alexa-webhook

---

## 📱 Commandes Alexa

### Informations

```
"Alexa, demande à ma piscine quelle est la température"
→ "La température de la piscine est de 26,5 degrés Celsius. C'est parfait pour se baigner."

"Alexa, demande à ma piscine le pH"
→ "Le pH de la piscine est de 7,2. C'est parfait, le pH est dans la norme."

"Alexa, demande à ma piscine si l'eau est bonne"
→ "La qualité de l'eau est excellente. Température: 26,5 degrés, pH: 7,2, Redox: 680 millivolts."

"Alexa, demande à ma piscine l'indice de Langelier"
→ "L'indice de Langelier est de 0,15. L'eau est équilibrée."

"Alexa, demande à ma piscine l'état complet"
→ Résumé complet avec tous les paramètres
```

### Contrôle

```
"Alexa, dis à ma piscine de démarrer la filtration"
→ "J'ai activé le mode automatique de la filtration."

"Alexa, dis à ma piscine d'arrêter la filtration"
→ "J'ai arrêté la filtration."
```

---

## 🔧 Configuration

### Variables d'environnement (Vercel)

```
MQTT_USER = francois.soudant@gmail.com
MQTT_PASS = votre_mot_de_passe_mqtt
```

### MQTT Topics

Tous les topics utilisent le préfixe `francois.soudant@gmail.com/Piscine/`

- `/PH` - pH de l'eau (0-14)
- `/Redox` - Potentiel Redox (0-800 mV)
- `/Temperature` - Température (°C)
- `/TAC` - Alcalinité (ppm)
- `/TH` - Dureté (ppm)
- `/TDS` - Solides dissous (ppm)
- `/Mode` - Mode filtration (0=Arrêt, 1=Auto, 2=Manuel)
- `/HeureDeb` / `/MinDeb` - Heure début filtration
- `/HeureFin` / `/MinFin` - Heure fin filtration
- ... (voir pool-model.js pour la liste complète)

---

## 🛠️ Développement local

### Prérequis

- Node.js >= 18
- Git
- Vercel CLI (optionnel)

### Installation

```bash
# Cloner le repo
git clone https://github.com/VOTRE_USERNAME/piscine.git
cd piscine

# Installer les dépendances
npm install

# Installer Vercel CLI (optionnel)
npm install -g vercel
```

### Lancer en local

```bash
# Créer .env.local avec vos credentials MQTT
echo "MQTT_USER=francois.soudant@gmail.com" > .env.local
echo "MQTT_PASS=votre_password" >> .env.local

# Lancer le serveur de dev
vercel dev

# Ouvrir
# → PWA : http://localhost:3000
# → API : http://localhost:3000/api/alexa-webhook
```

### Tester l'API Alexa en local

```bash
curl -X POST http://localhost:3000/api/alexa-webhook \
  -H "Content-Type: application/json" \
  -d '{
    "version": "1.0",
    "request": {
      "type": "IntentRequest",
      "intent": { "name": "GetTemperatureIntent" }
    }
  }'
```

---

## 📊 Paramètres surveillés

| Paramètre | Norme | Unité | Source |
|-----------|-------|-------|--------|
| **pH** | 7,0 - 7,4 | - | Sonde |
| **Redox** | 650 - 750 | mV | Sonde |
| **Température** | - | °C | Sonde |
| **TAC** | 80 - 120 | ppm | Manuel |
| **TH** | 100 - 250 | ppm | Manuel |
| **TDS** | 250 - 2000 | ppm | Sonde |
| **Dépression** | -3 à -1 | bar | Capteur |

---

## 🎓 Architecture technique

### Avantages du projet unifié

✅ **Source unique de vérité** : `shared/pool-model.js` utilisé par PWA et API
✅ **Cohérence garantie** : PWA et Alexa utilisent les mêmes normes/calculs
✅ **Déploiement atomique** : PWA + API déployés ensemble
✅ **Maintenance simplifiée** : Un seul repo Git
✅ **Historique unifié** : Toutes les modifications tracées ensemble

### Flux de données

```
┌─────────────┐
│  Hardware   │
│   Piscine   │
└──────┬──────┘
       │ MQTT Publish
       ↓
┌─────────────┐
│  Maqiatto   │
│    Broker   │
└──┬───────┬──┘
   │       │
   │       │ Subscribe
   ↓       ↓
┌──────┐ ┌──────────┐
│ PWA  │ │ Alexa API│
└──────┘ └──────────┘
   ↓          ↓
┌──────────────────┐
│ pool-model.js    │
│ (shared logic)   │
└──────────────────┘
```

---

## 🔐 Sécurité

- ✅ Credentials MQTT dans variables d'environnement (pas dans le code)
- ✅ Communication MQTT chiffrée (WSS)
- ✅ API Alexa avec signature validation
- ✅ HTTPS uniquement (Vercel)
- ✅ Service Worker avec cache sécurisé

---

## 📈 Évolutions futures possibles

- [ ] Historique des mesures (graphiques)
- [ ] Alertes push (notifications)
- [ ] Google Assistant integration
- [ ] API REST publique
- [ ] Dashboard admin avancé
- [ ] Tests automatisés
- [ ] Intégration Home Assistant

---

## 🤝 Contribution

Ce projet est personnel mais les suggestions sont bienvenues !

1. Fork le projet
2. Créer une branche (`git checkout -b feature/amelioration`)
3. Commit (`git commit -m 'Ajout fonctionnalité'`)
4. Push (`git push origin feature/amelioration`)
5. Ouvrir une Pull Request

---

## 📄 Licence

MIT © François Soudant

---

## 🙏 Remerciements

- Maqiatto pour le broker MQTT gratuit
- Vercel pour l'hébergement
- Amazon Alexa pour l'API vocale
- Claude (Anthropic) pour l'assistance au développement 😊

---

## 📞 Contact

Pour toute question : [Votre email ou GitHub]

---

**Fait avec ❤️ pour une piscine parfaite ! 🏊‍♂️💧**
