# PingPong Video Platform - Recherche Multimodale Intelligente

Une plateforme complète d'analyse vidéo de matchs de ping-pong avec **streaming vidéo**, **recherche sémantique multi-niveaux**, **chatbot IA** et **recommandations intelligentes**, construite avec **FastAPI** (Python), **Next.js** (React/TypeScript), **Elasticsearch** et **Sentence-Transformers**.

---

## Table des Matières

1. [Vue d'Ensemble](#vue-densemble)
2. [Architecture du Projet](#architecture-du-projet)
3. [Fonctionnalités](#fonctionnalités)
4. [Stack Technologique](#stack-technologique)
5. [Installation et Démarrage](#installation-et-démarrage)
6. [Architecture Backend](#architecture-backend)
7. [Architecture Frontend](#architecture-frontend)
8. [Recherche Sémantique](#recherche-sémantique)
9. [Concepts Clés](#concepts-clés)
10. [API Endpoints](#api-endpoints)
11. [Tests](#tests)
12. [Utilisation](#utilisation)

---

## Vue d'Ensemble

Cette plateforme permet d'analyser et de naviguer dans des matchs de ping-pong avec **3 niveaux de recherche** :

### 🎯 Recherche Multi-niveaux
- **Niveau 1 - Full-text** : Recherche textuelle classique avec filtres (Elasticsearch)
- **Niveau 2 - Sémantique** : Recherche par similarité vectorielle avec embeddings (384D)
- **Niveau 3 - Conversationnelle** : Chatbot IA avec RAG (OpenAI GPT-3.5)

### 🚀 Fonctionnalités Avancées
- **Streaming vidéo** optimisé avec HTTP Range Requests
- **Mode Highlights** : Détection automatique des meilleurs points
- **Recommandations** : Suggestions de points similaires (k-NN)
- **Gestion de clips** par set et point avec thumbnails
- **Tests automatisés** : 40+ tests (unitaires, intégration, E2E)
- **Architecture containerisée** avec Docker

---

## Architecture du Projet

```
ProjetInfo/
├── backend/                          # API FastAPI
│   ├── main.py                       # Point d'entrée principal (4 routers)
│   ├── routers/                      # Architecture modulaire
│   │   ├── videos.py                 # Streaming vidéo et clips
│   │   ├── search.py                 # Recherche Elasticsearch full-text
│   │   ├── semantic.py               # Recherche vectorielle + highlights
│   │   └── chat.py                   # Chatbot RAG avec OpenAI
│   ├── embeddings/                   # Génération embeddings sémantiques
│   │   ├── embedder.py               # Sentence-Transformers (384D)
│   │   ├── indexer.py                # Indexation vectorielle dans ES
│   │   └── pipeline.py               # Pipeline complet CSV → Embeddings
│   ├── scripts/                      # Scripts utilitaires
│   │   ├── index_to_elasticsearch.py # Indexation CSV → ES
│   │   └── generate_thumbnails.py    # Génération thumbnails
│   ├── tests/                        # Tests unitaires et intégration
│   │   ├── test_videos.py            # Tests router videos
│   │   ├── test_search.py            # Tests router search
│   │   ├── test_chat.py              # Tests router chat
│   │   └── integration/              # Tests avec ES réel
│   ├── data/                         # Données
│   │   └── points_index.csv          # CSV des points (170 lignes)
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
│   ├── components/                   # Composants React
│   │   ├── VideoPlayer.tsx           # Lecteur vidéo avancé (600+ lignes)
│   │   ├── ClipsSidebar.tsx          # Navigation clips par set
│   │   ├── ChatWidget.tsx            # Interface chatbot IA
│   │   ├── VideoCard.tsx             # Card vidéo avec métadonnées
│   │   └── ThemeToggle.tsx           # Mode sombre/clair
│   └── package.json                  # Dépendances Node.js

├── tests/e2e/                        # Tests End-to-End (Playwright)
│   ├── video-playback.spec.ts        # Tests lecture vidéo + clips
│   ├── search-flow.spec.ts           # Tests recherche + filtres
│   └── chat-interaction.spec.ts      # Tests chatbot

├── FAN-ZHENDONG_vs_TRULS-MOREGARD/   # Match 1 avec clips
│   ├── clips/                        # Clips organisés par point
│   │   ├── set_1_point_1/
│   │   │   ├── set_1_point_1.mp4
│   │   │   └── set_1_point_1.jpg     # Thumbnail
│   │   └── ...
│   └── *.mp4                         # Vidéo complète du match

├── HUGO-CALDERANO_vs_FELIX-LEBRUN/   # Match 2 avec clips
│   └── clips/                        # Idem structure

├── docker-compose.yml                # Elasticsearch + Kibana
├── playwright.config.ts              # Config tests E2E
├── TESTING.md                        # Documentation tests complète
└── README.md                         # Ce fichier
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

### Recherche Sémantique (Nouveau !)
- **Embeddings vectoriels** : Modèle `paraphrase-multilingual-MiniLM-L12-v2` (384 dimensions)
- **Mode Highlights** : Détection automatique des meilleurs points
  - Critères : points gagnants (`pt_gagne`) + échanges longs (≥5 coups)
  - Tri par similarité vectorielle (cosine similarity)
- **Recommandations k-NN** : "Vous aimerez aussi" basé sur similarité
- **Recherche hybride** : Combine full-text + vectorielle (pondération ajustable)
- **Descriptions enrichies** : Transformation des données structurées en texte naturel

**Exemple de description générée** :
```
Point du set 2, point 19. Score: 0-1.
Serveur: TRULS-MOREGARD, Gagnant: FAN-ZHENDONG.
Échange de 4 coups: service coup droit zone m3,
topspin revers zone g3, topspin coup droit zone g3,
topspin revers zone g3. Fin: out.
```

### Chatbot IA (RAG)
- **Retrieval-Augmented Generation** : Combine recherche ES + génération OpenAI GPT-3.5
- **Contexte conversationnel** : Historique des 5 derniers messages
- **Réponses en français** : Interface naturelle et conviviale
- **Fallback intelligent** : Fonctionne sans OpenAI (mode dégradé)
- **Résultats cliquables** : Liens directs vers les clips trouvés
- **Pipeline optimisé** : Question → ES Search → Build Context → GPT → Response

---

## Stack Technologique

### Backend
- **FastAPI** 0.3.0 - Framework API moderne et performant
- **Uvicorn** - Serveur ASGI
- **Elasticsearch** 8.11.0 - Moteur de recherche + recherche vectorielle
- **Sentence-Transformers** - Génération embeddings (paraphrase-multilingual-MiniLM-L12-v2)
- **OpenAI API** - GPT-3.5 pour chatbot RAG (optionnel)
- **Pandas** - Traitement de données CSV
- **Pytest** - Tests unitaires et intégration

### Frontend
- **Next.js** 16.1.1 - Framework React avec SSR
- **React** 19.2.3 - Bibliothèque UI avec Hooks
- **TypeScript** 5 - Typage statique
- **Tailwind CSS** 4 - Framework CSS utilitaire
- **Playwright** - Tests End-to-End

### Infrastructure
- **Docker** - Containerisation Elasticsearch + Kibana
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

Backend disponible sur **http://localhost:8001**  
Documentation API : **http://localhost:8001/docs**

### 2.5. Générer les Embeddings (Nouveau !)

```bash
cd backend

# Option 1: En ligne de commande
python embeddings/pipeline.py index --csv data/points_index.csv --recreate

# Option 2: Via script Python
python -c "from embeddings.pipeline import run_embedding_pipeline; run_embedding_pipeline('data/points_index.csv', recreate_index=True)"

# Tester la recherche sémantique
python embeddings/pipeline.py search "smash gagnant" -k 5
```


**Note** : Cette étape génère les embeddings vectoriels (384D) pour tous les points du CSV et les indexe dans Elasticsearch. C'est nécessaire pour utiliser le mode Highlights et les recommandations.

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
  src={`http://localhost:8001/api/videos/${videoId}`}
  crossOrigin="anonymous"  // Important pour CORS
  onTimeUpdate={handleTimeUpdate}
/>

// Chargement des clips
useEffect(() => {
  fetch(`http://localhost:8001/api/videos/${id}/clips`)
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

### Semantic Router (`/api/semantic`) - Nouveau !

| Méthode | Endpoint | Description |
|---------|----------|-------------|
| `GET` | `/api/semantic/status` | Statut de l'index embeddings |
| `GET` | `/api/semantic/highlights` | Mode highlights (meilleurs points) |
| `GET` | `/api/semantic/similar` | Recommandations par similarité |
| `GET` | `/api/semantic/point/{id}/similar` | Points similaires à un point |

**Paramètres highlights** :
- `k` : Nombre de résultats (défaut: 20, max: 100)
- `match_id` : Filtrer par match
- `winner` : Filtrer par gagnant
- `serveur` : Filtrer par serveur
- `set_num` : Filtrer par set

**Exemple highlights** :
```bash
GET /api/semantic/highlights?k=10&match_id=FAN-ZHENDONG_vs_TRULS-MOREGARD
```

**Réponse** :
```json
{
  "total": 10,
  "mode": "highlights",
  "points": [
    {
      "id": "FAN-ZHENDONG_vs_TRULS-MOREGARD_39",
      "similarity_score": 0.945,
      "is_set_point": false,
      "is_point_gagnant": true,
      "nb_coups": 9,
      "description": "Point du set 3, point 39..."
    }
  ]
}
```

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

## Tests

Le projet dispose d'une suite de tests complète avec **40+ tests** automatisés.

### Pyramide de Tests

```
     /\
    /E2E\         ← 7+ tests Playwright (scénarios complets)
   /------\
  /Intégra\      ← Tests avec ES réel
 /----------\
/ Unitaires  \   ← 26+ tests (routers, fonctions)
```

### Commandes Rapides

**Tests Unitaires (rapides, <1s/test)** :
```bash
cd backend
.\\venv\\Scripts\\activate
pytest tests/ -v -m "not integration"
```

**Tests d'Intégration (avec Elasticsearch réel)** :
```bash
# Démarrer ES d'abord
docker-compose up -d

cd backend
pytest tests/integration/ -v -m integration
```

**Tests E2E (Playwright, scénarios utilisateur)** :
```bash
# Installer Playwright (première fois)
npm install
npx playwright install

# Lancer les tests E2E
npm run test:e2e

# Mode UI interactif (recommandé pour debug)
npm run test:e2e:ui
```

### Couverture de Tests

| Type | Nombre | Vitesse | Exemples |
|------|--------|---------|----------|
| Unitaires | 26+ | <1s | test_videos.py, test_search.py, test_chat.py |
| Intégration | ~10 | 1-5s | test_elasticsearch_integration.py |
| E2E | 7+ | 5-30s | video-playback.spec.ts, search-flow.spec.ts |

**Documentation complète** : Voir [TESTING.md](TESTING.md) pour plus de détails.

---

## Recherche Sémantique

### Pipeline Complet

Le système génère automatiquement des descriptions textuelles enrichies puis les transforme en vecteurs :

```
CSV (points_index.csv)
    ↓
embedder.py → Descriptions textuelles
    ↓
sentence-transformers → Vecteurs 384D
    ↓
indexer.py → Elasticsearch (dense_vector)
    ↓
semantic.py → API de recherche vectorielle
    ↓
Frontend → Affiche highlights/recommandations
```

### Mode Highlights - Comment ça marche ?

1. **Calcul du profil "beau point"** : Average des embeddings des points gagnants avec échanges longs
2. **Recherche k-NN** : Trouve les K points les plus similaires au profil
3. **Enrichissement** : Détecte automatiquement les points de fin de set
4. **Tri** : Par score de similarité (cosine similarity)

**Code exemple** :
```python
# Route /api/semantic/highlights
results = indexer.search_by_highlight_similarity(k=20, filters={"match_id": match})

for point in results:
    point["is_set_point"] = is_set_point(score_a, score_b, winner)
    point["is_point_gagnant"] = (faute_type == "pt_gagne")
```

### Recommandations Similaires

```python
# 1. Récupérer embeddings de référence
embeddings = indexer.get_documents_embeddings(reference_ids)

# 2. Moyenne
avg_embedding = np.mean(embeddings, axis=0)

# 3. Recherche k-NN en excluant déjà vus
recommendations = indexer.search_similar_excluding(
    query_embedding= avg_embedding,
    exclude_ids=already_shown,
    k=6
)
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
curl -X POST http://localhost:8001/api/search/index \
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
- **Sentence-Transformers** : [sbert.net](https://www.sbert.net/)
- **OpenAI API** : [platform.openai.com/docs](https://platform.openai.com/docs)
- **Playwright** : [playwright.dev](https://playwright.dev/)
- **HTTP Range Requests** : [MDN Web Docs](https://developer.mozilla.org/en-US/docs/Web/HTTP/Range_requests)

---

## Concepts Appris

Ce projet illustre des concepts avancés de développement web et IA :

### Architecture & Backend
- **Architecture Full-Stack** : Séparation backend/frontend  
- **API REST** : Design d'endpoints RESTful modulaires
- **Architecture modulaire** : 4 routers FastAPI (videos, search, semantic, chat)
- **Streaming Vidéo** : HTTP Range Requests, chunking optimisé
- **Containerisation** : Docker, docker-compose pour Elasticsearch

### Recherche & IA
- **Recherche Full-Text** : Elasticsearch, indexation, queries DSL
- **Recherche Vectorielle** : k-NN, embeddings 384D, cosine similarity
- **NLP** : Sentence-Transformers, modèles multilingues
- **RAG (Retrieval-Augmented Generation)** : Pipeline complet ES + GPT
- **Híbride Search** : Combinaison full-text + vectorielle

### Frontend & Tests
- **TypeScript** : Typage statique, interfaces
- **React Hooks** : useState, useEffect, useRef, useCallback
- **Tests E2E** : Playwright pour scénarios utilisateur
- **Tests Pyramide** : Unitaires, intégration, E2E (40+ tests)
- **CORS** : Sécurité cross-origin

### Data Science
- **Transformation de données** : CSV → Descriptions → Embeddings vectoriels
- **Pipeline ML** : Préparation, transformation, indexation
- **Similarité sémantique** : Cosine similarity, k-NN search
- **Analyse multimodale** : Texte, métadonnées, patterns de jeu

---

**Projet créé pour l'apprentissage du développement web full-stack avancé avec IA**  
*Plateforme d'analyse vidéo de ping-pong avec recherche sémantique intelligente*

**Auteur :** Projet Informatique 2025
