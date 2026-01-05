# PingPong Video Platform - Projet Full-Stack Avancé

Une plateforme complète d'analyse vidéo de matchs de ping-pong avec **streaming vidéo**, **recherche intelligente**, **chatbot IA** et **gestion de clips**, construite avec **FastAPI** (Python), **Next.js** (React/TypeScript), **Elasticsearch** et **OpenAI**.

---

## Table des Matières

1. [Vue d'Ensemble](#vue-densemble)
2. [Architecture du Projet](#architecture-du-projet)
3. [Fonctionnalités](#fonctionnalités)
4. [Stack Technologique](#stack-technologique)
5. [Installation et Démarrage](#installation-et-démarrage)
6. [Architecture Backend](#architecture-backend)
7. [Architecture Frontend](#architecture-frontend)
8. [Concepts Clés](#concepts-clés)
9. [API Endpoints](#api-endpoints)
10. [Utilisation](#utilisation)

---

## Vue d'Ensemble

Cette plateforme permet d'analyser et de naviguer dans des matchs de ping-pong de manière intelligente :

- **Streaming vidéo** avec support HTTP Range Requests pour navigation fluide
- **Gestion de clips** par set et point pour analyse détaillée
- **Recherche avancée** avec Elasticsearch (full-text, filtres, fuzzy matching)
- **Chatbot IA** avec RAG (Retrieval-Augmented Generation) utilisant OpenAI
- **Métadonnées structurées** pour chaque point de match
- **Architecture containerisée** avec Docker

---

## Architecture du Projet

```
ProjetInfo/
├── backend/                          # API FastAPI
│   ├── main.py                       # Point d'entrée principal
│   ├── routers/                      # Architecture modulaire
│   │   ├── videos.py                 # Streaming vidéo et clips
│   │   ├── search.py                 # Recherche Elasticsearch
│   │   └── chat.py                   # Chatbot RAG avec OpenAI
│   ├── videos/                       # Stockage vidéos
│   │   ├── videos.json               # Métadonnées des vidéos
│   │   └── *.mp4                     # Fichiers vidéo
│   ├── requirements.txt              # Dépendances Python
│   └── venv/                         # Environnement virtuel
│
├── frontend/                         # Application Next.js
│   ├── app/
│   │   ├── page.tsx                  # Page d'accueil (liste vidéos)
│   │   ├── watch/[id]/page.tsx       # Lecteur vidéo avec clips
│   │   ├── search/page.tsx           # Interface de recherche
│   │   ├── layout.tsx                # Layout global
│   │   └── globals.css               # Styles globaux
│   └── package.json                  # Dépendances Node.js
│
├── FAN-ZHENDONG_vs_TRULS-MOREGARD/   # Données d'un match
│   ├── clips/                        # Clips organisés par point
│   │   ├── set_1_point_1/
│   │   │   ├── set_1_point_1.mp4
│   │   │   └── set_1_point_1.jpg     # Thumbnail
│   │   └── ...
│   └── *.mp4                         # Vidéo complète du match
│
└── docker-compose.yml                # Configuration Elasticsearch
```

---

## Fonctionnalités

### Streaming Vidéo Avancé
- **HTTP Range Requests** : Navigation instantanée dans la vidéo (seek)
- **Streaming par chunks** : Optimisation de la bande passante (1MB chunks)
- **Support multi-sources** : Vidéos dans `backend/videos/` ou dossiers de match
- **Métadonnées riches** : Titre, description, joueurs, date, etc.

### Gestion de Clips
- **Organisation hiérarchique** : Clips groupés par set et point
- **Thumbnails automatiques** : Aperçu visuel de chaque point
- **API dédiée** : Endpoints pour lister et streamer les clips
- **Navigation fluide** : Passage rapide entre les points d'un match

### Recherche Elasticsearch
- **Full-text search** : Recherche dans descriptions, tags, scores
- **Fuzzy matching** : Tolérance aux fautes de frappe
- **Filtres multiples** : Par vidéo, set, gagnant
- **Pagination** : Gestion efficace de grands volumes de données
- **Indexation CSV** : Import facile de métadonnées

### Chatbot IA (RAG)
- **Retrieval-Augmented Generation** : Combine recherche ES + génération OpenAI
- **Contexte conversationnel** : Historique des 5 derniers messages
- **Réponses en français** : Interface naturelle et conviviale
- **Fallback intelligent** : Fonctionne sans OpenAI (mode dégradé)
- **Résultats cliquables** : Liens directs vers les clips trouvés

---

## Stack Technologique

### Backend
- **FastAPI** 0.3.0 - Framework API moderne et performant
- **Uvicorn** - Serveur ASGI
- **Elasticsearch** 8.11.0 - Moteur de recherche
- **OpenAI API** - Génération de réponses IA (optionnel)
- **Pandas** - Traitement de données CSV

### Frontend
- **Next.js** 16.1.1 - Framework React avec SSR
- **React** 19.2.3 - Bibliothèque UI
- **TypeScript** 5 - Typage statique
- **Tailwind CSS** 4 - Framework CSS utilitaire

### Infrastructure
- **Docker** - Containerisation Elasticsearch
- **Python** 3.10+ - Runtime backend
- **Node.js** 18+ - Runtime frontend

---

## Installation et Démarrage

### Prérequis
- **Python 3.10+**
- **Node.js 18+**
- **Docker Desktop** (pour Elasticsearch)

### 1. Lancer Elasticsearch (optionnel mais recommandé)

```bash
# Démarrer le conteneur Elasticsearch
docker-compose up -d

# Vérifier que ES tourne
curl http://localhost:9200
```

### 2. Configurer le Backend

```bash
cd backend

# Créer l'environnement virtuel
python -m venv venv

# Activer l'environnement
.\venv\Scripts\activate        # Windows
# source venv/bin/activate     # Mac/Linux

# Installer les dépendances
pip install -r requirements.txt

# (Optionnel) Configurer OpenAI
# Créer un fichier .env avec :
# OPENAI_API_KEY=sk-...

# Lancer le serveur
uvicorn main:app --reload
```

Backend disponible sur **http://localhost:8000**  
Documentation API : **http://localhost:8000/docs**

### 3. Configurer le Frontend

```bash
cd frontend

# Installer les dépendances
npm install

# Lancer le serveur de développement
npm run dev
```

Frontend disponible sur **http://localhost:3000**

---

## Architecture Backend

### Architecture Modulaire avec Routers

```python
# main.py - Point d'entrée
app = FastAPI(title="Video Streaming API", version="0.3.0")

# Inclusion des routers
app.include_router(videos.router)   # /api/videos
app.include_router(search.router)   # /api/search
app.include_router(chat.router)     # /api/chat
```

### Router Videos (`routers/videos.py`)

**Responsabilités** :
- Streaming vidéo avec HTTP Range Requests
- Gestion des métadonnées vidéo
- Listing et streaming des clips
- Génération de thumbnails

**Fonctions clés** :
```python
def stream_video_range(file_path, start, end):
    """Générateur pour streamer une portion de vidéo"""
    with open(file_path, "rb") as video:
        video.seek(start)
        while remaining > 0:
            yield video.read(chunk_size)

def get_clips_for_video(video_id):
    """Récupère tous les clips d'une vidéo, groupés par set"""
    # Parcourt clips/set_X_point_Y/
    # Retourne {set_number: [points]}
```

### Router Search (`routers/search.py`)

**Responsabilités** :
- Connexion à Elasticsearch
- Indexation de données CSV
- Recherche full-text avec filtres
- Gestion de l'index

**Mapping Elasticsearch** :
```python
POINTS_MAPPING = {
    "mappings": {
        "properties": {
            "video_id": {"type": "keyword"},
            "set_number": {"type": "integer"},
            "point_number": {"type": "integer"},
            "description": {"type": "text", "analyzer": "standard"},
            "tags": {"type": "keyword"},
            "winner": {"type": "keyword"},
            # ...
        }
    }
}
```

### Router Chat (`routers/chat.py`)

**Responsabilités** :
- Recherche de points pertinents via Elasticsearch
- Génération de réponses avec OpenAI GPT-3.5
- Gestion de l'historique conversationnel
- Mode fallback sans IA

**Pipeline RAG** :
```
User Query → Elasticsearch Search → Top 5 Points → 
→ Build Context → OpenAI API → AI Response + Points
```

---

## Architecture Frontend

### Pages Next.js

#### `app/page.tsx` - Page d'Accueil
- Liste toutes les vidéos disponibles
- Cards avec métadonnées (joueurs, date, sets)
- Navigation vers le lecteur

#### `app/watch/[id]/page.tsx` - Lecteur Vidéo
- Lecteur vidéo HTML5 personnalisé
- Liste des clips par set
- Thumbnails cliquables
- Contrôles avancés (play/pause, seek, volume, fullscreen)

#### `app/search/page.tsx` - Interface de Recherche
- Barre de recherche full-text
- Filtres (vidéo, set, gagnant)
- Résultats paginés
- Liens vers les clips

### Composants Clés

```tsx
// Exemple de streaming avec Range Requests
<video
  ref={videoRef}
  src={`http://localhost:8000/api/videos/${videoId}`}
  crossOrigin="anonymous"  // Important pour CORS
  onTimeUpdate={handleTimeUpdate}
/>

// Chargement des clips
useEffect(() => {
  fetch(`http://localhost:8000/api/videos/${id}/clips`)
    .then(res => res.json())
    .then(data => setClips(data.sets));
}, [id]);
```

---

## Concepts Clés

### 1. HTTP Range Requests

Permet de télécharger seulement une partie d'un fichier :

```
Client → Header: Range: bytes=1000-2000
Server → Status: 206 Partial Content
Server → Header: Content-Range: bytes 1000-2000/50000
Server → Body: [1001 bytes de données]
```

**Avantages** :
- Seek instantané dans la vidéo
- Économie de bande passante
- Meilleure expérience utilisateur

### 2. CORS (Cross-Origin Resource Sharing)

Le frontend (port 3000) et le backend (port 8000) sont sur des origines différentes.

**Configuration Backend** :
```python
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000"],
    allow_credentials=True,
    allow_methods=["GET", "HEAD", "POST", "DELETE"],
    expose_headers=["Content-Range", "Accept-Ranges"],
)
```

**Configuration Frontend** :
```tsx
<video crossOrigin="anonymous" />
```

### 3. Elasticsearch Full-Text Search

**Query DSL** :
```json
{
  "query": {
    "bool": {
      "must": [
        {
          "multi_match": {
            "query": "smash",
            "fields": ["description", "tags"],
            "fuzziness": "AUTO"
          }
        }
      ],
      "filter": [
        {"term": {"set_number": 3}}
      ]
    }
  }
}
```

### 4. RAG (Retrieval-Augmented Generation)

Combine la recherche de documents pertinents avec la génération de texte :

```
1. User: "Montre-moi les smashes de Fan Zhendong"
2. Elasticsearch → Trouve 5 points avec "smash" + "Fan Zhendong"
3. Context: "Points trouvés: Set 2 Point 5: Smash gagnant..."
4. OpenAI → Génère réponse naturelle avec le contexte
5. Response: "J'ai trouvé 5 smashes impressionnants ! Voici..."
```

---

## API Endpoints

### Videos Router (`/api/videos`)

| Méthode | Endpoint | Description |
|---------|----------|-------------|
| `GET` | `/api/videos` | Liste toutes les vidéos |
| `GET` | `/api/videos/{id}` | Stream une vidéo (Range support) |
| `GET` | `/api/videos/{id}/meta` | Métadonnées d'une vidéo |
| `GET` | `/api/videos/{id}/clips` | Liste les clips par set |
| `GET` | `/api/videos/{id}/clips/{clip_id}` | Stream un clip |
| `GET` | `/api/videos/{id}/clips/{clip_id}/thumbnail` | Thumbnail d'un clip |

### Search Router (`/api/search`)

| Méthode | Endpoint | Description |
|---------|----------|-------------|
| `GET` | `/api/search/status` | Statut Elasticsearch |
| `POST` | `/api/search/index` | Indexer un fichier CSV |
| `GET` | `/api/search?q=...` | Rechercher des points |
| `DELETE` | `/api/search/index` | Vider l'index |

**Paramètres de recherche** :
- `q` : Query full-text
- `video_id` : Filtrer par vidéo
- `set_number` : Filtrer par set
- `winner` : Filtrer par gagnant
- `page` : Numéro de page (défaut: 1)
- `size` : Résultats par page (défaut: 20, max: 100)

### Chat Router (`/api/chat`)

| Méthode | Endpoint | Description |
|---------|----------|-------------|
| `POST` | `/api/chat` | Envoyer un message au chatbot |
| `GET` | `/api/chat/status` | Statut du service (OpenAI + ES) |

**Body de la requête** :
```json
{
  "message": "Montre-moi les meilleurs points du set 3",
  "history": [
    {"role": "user", "content": "Bonjour"},
    {"role": "assistant", "content": "Salut ! Comment puis-je t'aider ?"}
  ]
}
```

**Réponse** :
```json
{
  "response": "J'ai trouvé 3 points exceptionnels du set 3...",
  "points": [
    {
      "clip_id": "set_3_point_12",
      "video_id": "fan-zhendong-vs-moregard",
      "description": "Échange long terminé par un smash",
      "relevance_score": 8.5
    }
  ]
}
```

---

## Utilisation

### 1. Regarder une Vidéo

1. Accéder à **http://localhost:3000**
2. Cliquer sur une vidéo
3. Utiliser les contrôles du lecteur :
   - **Espace** : Play/Pause
   - **←/→** : Reculer/Avancer 10s
   - **F** : Plein écran
   - **M** : Mute

### 2. Naviguer dans les Clips

1. Dans le lecteur, voir la liste des clips à droite
2. Cliquer sur un thumbnail pour charger le clip
3. Les clips sont organisés par set

### 3. Rechercher des Points

**Option A : Interface de recherche**
1. Aller sur `/search`
2. Entrer une requête (ex: "smash")
3. Appliquer des filtres (set, gagnant)
4. Cliquer sur un résultat pour voir le clip

**Option B : Chatbot IA**
1. Utiliser l'interface de chat (si implémentée)
2. Poser une question naturelle :
   - "Montre-moi les points gagnés par Fan Zhendong au set 2"
   - "Quels sont les échanges les plus longs ?"
3. Cliquer sur les points suggérés

### 4. Indexer des Données

```bash
# Préparer un CSV avec les colonnes :
# video_id, set_number, point_number, clip_id, winner, description, tags

# Indexer via l'API
curl -X POST http://localhost:8000/api/search/index \
  -F "file=@points_data.csv"
```

---

## Variables d'Environnement

Créer un fichier `.env` dans `backend/` :

```env
# Elasticsearch (optionnel, défaut: http://localhost:9200)
ELASTICSEARCH_HOST=http://localhost:9200

# OpenAI (optionnel, pour le chatbot IA)
OPENAI_API_KEY=sk-...
```

---

## Structure des Données

### `videos.json`

```json
[
  {
    "id": "fan-zhendong-vs-moregard",
    "title": "Fan Zhendong vs Truls Moregard",
    "filename": "match.mp4",
    "description": "Finale olympique Paris 2024",
    "players": ["Fan Zhendong", "Truls Moregard"],
    "date": "2024-08-10",
    "has_clips": true,
    "match_folder": "FAN-ZHENDONG_vs_TRULS-MOREGARD"
  }
]
```

### Organisation des Clips

```
FAN-ZHENDONG_vs_TRULS-MOREGARD/
└── clips/
    ├── set_1_point_1/
    │   ├── set_1_point_1.mp4
    │   └── set_1_point_1.jpg
    ├── set_1_point_2/
    │   ├── set_1_point_2.mp4
    │   └── set_1_point_2.jpg
    └── ...
```

---

## Dépannage

### Elasticsearch ne démarre pas
```bash
# Vérifier Docker
docker ps

# Redémarrer le conteneur
docker-compose restart

# Voir les logs
docker-compose logs elasticsearch
```

### CORS Errors
- Vérifier que le backend autorise `http://localhost:3000`
- Vérifier `crossOrigin="anonymous"` sur les éléments `<video>`

### Vidéo ne charge pas
- Vérifier que le fichier existe dans `backend/videos/` ou le dossier de match
- Vérifier les permissions de lecture
- Consulter les logs du backend

---

## Ressources

- **FastAPI** : [fastapi.tiangolo.com](https://fastapi.tiangolo.com/)
- **Next.js** : [nextjs.org](https://nextjs.org/docs)
- **Elasticsearch** : [elastic.co/guide](https://www.elastic.co/guide/en/elasticsearch/reference/current/index.html)
- **OpenAI API** : [platform.openai.com/docs](https://platform.openai.com/docs)
- **HTTP Range Requests** : [MDN Web Docs](https://developer.mozilla.org/en-US/docs/Web/HTTP/Range_requests)

---

## Concepts Appris

Ce projet illustre des concepts avancés de développement web :

- **Architecture Full-Stack** : Séparation backend/frontend  
- **API REST** : Design d'endpoints RESTful  
- **Streaming Vidéo** : HTTP Range Requests, chunking  
- **Recherche Full-Text** : Elasticsearch, indexation, queries  
- **Intelligence Artificielle** : RAG, intégration OpenAI  
- **Containerisation** : Docker, docker-compose  
- **TypeScript** : Typage statique, interfaces  
- **React Hooks** : useState, useEffect, useRef, useCallback  
- **CORS** : Sécurité cross-origin  
- **Pagination** : Gestion de grands datasets  

---

**Projet créé pour l'apprentissage du développement web full-stack avancé**  
*Analyse vidéo de ping-pong avec IA et recherche intelligente*
