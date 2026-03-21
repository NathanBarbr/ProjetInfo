# PingPong Video Platform

Plateforme d'analyse de matchs de ping-pong avec lecture video, navigation par clips, recherche full-text, recherche semantique, visualisation d'embeddings, comparaison de joueurs et chatbot.

## Sommaire

1. [Presentation](#presentation)
2. [Fonctionnalites](#fonctionnalites)
3. [Architecture](#architecture)
4. [Structure du projet](#structure-du-projet)
5. [Prérequis](#prerequis)
6. [Lancement en local](#lancement-en-local)
7. [Preparation des donnees](#preparation-des-donnees)
8. [Variables d'environnement](#variables-denvironnement)
9. [Tests](#tests)
10. [API principale](#api-principale)
11. [Deploiement OVH](#deploiement-ovh)
12. [Exploitation et maintenance](#exploitation-et-maintenance)
13. [Depannage](#depannage)

## Presentation

L'application repose sur deux blocs principaux :

- un `backend` FastAPI qui sert l'API, les videos, les clips et les recherches
- un `frontend` Next.js qui expose l'interface utilisateur

Le moteur de recherche s'appuie sur Elasticsearch avec deux usages distincts :

- index classique des points pour les filtres et la recherche structuree
- index vectoriel pour les embeddings, la recherche semantique et la visualisation

Le projet fonctionne :

- en local, avec `frontend`, `backend` et `elasticsearch`
- en production, via Docker Compose et Nginx sur un VPS Ubuntu

## Fonctionnalites

- galerie de matchs et page de lecture video
- navigation par clips, sets et points
- streaming video et thumbnails
- recherche par filtres sur les points
- recherche semantique et mode highlights
- recommandations de points similaires
- visualisation 2D/3D des embeddings
- page de comparaison entre joueurs
- page de sketch/recherche par trajectoire
- favoris locaux dans le navigateur
- chatbot avec OpenAI si `OPENAI_API_KEY` est configuree


## Structure du projet

```text
ProjetInfo/
├── backend/
│   ├── data/
│   │   └── points_index.csv
│   ├── embeddings/
│   │   ├── embedder.py
│   │   ├── indexer.py
│   │   └── pipeline.py
│   ├── routers/
│   │   ├── chat.py
│   │   ├── search.py
│   │   ├── semantic.py
│   │   ├── videos.py
│   │   └── visualization.py
│   ├── scripts/
│   │   ├── generate_points_index.py
│   │   ├── generate_thumbnails.py
│   │   └── index_to_elasticsearch.py
│   ├── tests/
│   ├── videos/
│   │   └── videos.json
│   ├── Dockerfile
│   ├── main.py
│   └── requirements.txt
├── deploy/
│   └── nginx/
│       └── default.conf
├── frontend/
│   ├── app/
│   ├── components/
│   ├── lib/
│   ├── Dockerfile
│   └── package.json
├── tests/
│   └── e2e/
├── .env.example
├── DEPLOYMENT_OVH.md
├── docker-compose.yml
├── playwright.config.ts
└── README.md
```

## Prerequis

### Pour le developpement local

- Python 3.10 ou plus
- Node.js 20 recommande
- Docker et Docker Compose

### Pour la production

- VPS Ubuntu
- Docker
- Docker Compose

Le projet a deja ete deploie avec succes sur un VPS OVH Ubuntu.

## Lancement en local

### 1. Lancer Elasticsearch

Depuis la racine du projet :

```bash
docker compose up -d elasticsearch
```

Verification :

```bash
curl http://localhost:9200
```

### 2. Lancer le backend

```bash
cd backend
python -m venv venv
```

Activation :

```bash
# Windows
.\venv\Scripts\activate

# Linux / macOS
source venv/bin/activate
```

Installation :

```bash
pip install -r requirements.txt
```

Demarrage :

```bash
uvicorn main:app --reload --host 0.0.0.0 --port 8001
```

Acces :

- API : `http://localhost:8001`
- docs Swagger : `http://localhost:8001/docs`

### 3. Lancer le frontend

Dans un second terminal :

```bash
cd frontend
npm install
npm run dev
```

Acces :

- frontend : `http://localhost:3000`

En local, `frontend/lib/api.ts` utilise par defaut `http://localhost:8001` si `NEXT_PUBLIC_API_URL` n'est pas defini.

### 4. Indexer les donnees de recherche

Index classique des points :

```bash
cd backend
python scripts/index_to_elasticsearch.py
```

Recreer l'index si besoin :

```bash
python scripts/index_to_elasticsearch.py --delete
```

### 5. Indexer les embeddings

Cette etape est necessaire pour :

- `/visualization`
- les recherches semantiques
- les recommandations de points similaires

Commande :

```bash
cd backend
python embeddings/pipeline.py index --csv data/points_index.csv --es-host http://localhost:9200 --recreate
```

Test rapide :

```bash
python embeddings/pipeline.py search "long rally topspin winner" -k 5
```

## Preparation des donnees

### Videos

Les videos sont stockees dans :

- `backend/videos/`

Le fichier :

- `backend/videos/videos.json`

decrit les matchs exposes dans la galerie.

### Clips

Les clips sont ranges par match, set et point. Exemple :

```text
backend/videos/
└── fan-zhendong-vs-moregard/
    ├── FAN-ZHENDONG_vs_TRULS-MOREGARD.mp4
    ├── FAN-ZHENDONG_vs_TRULS-MOREGARD.jpg
    └── clips/
        ├── set_1_point_0/
        │   ├── set_1_point_0.mp4
        │   └── set_1_point_0.jpg
        └── ...
```

### CSV des points

Le fichier principal est :

- `backend/data/points_index.csv`

Il alimente :

- la recherche standard
- les comparaisons
- la visualisation
- la recherche semantique apres generation des embeddings

Si le CSV change, il faut reindexer Elasticsearch.

## Variables d'environnement

Le projet fournit un exemple :

- `.env.example`

Contenu :

```env
NEXT_PUBLIC_API_URL=
FRONTEND_ORIGINS=http://YOUR_SERVER_IP
OPENAI_API_KEY=
OPENAI_MODEL=gpt-4o-mini
ES_JAVA_OPTS=-Xms1g -Xmx1g
```

### Variables importantes

- `NEXT_PUBLIC_API_URL`
  - local : vide ou non definie pour utiliser `http://localhost:8001`
  - production OVH : mettre `http://IP_DU_SERVEUR` si le frontend build en appelle absolu
- `FRONTEND_ORIGINS`
  - origine autorisee par CORS dans le backend
  - exemple : `http://51.91.120.62`
- `OPENAI_API_KEY`
  - optionnelle
  - active les fonctions de chat basees sur OpenAI
- `OPENAI_MODEL`
  - modele OpenAI utilise
- `ES_JAVA_OPTS`
  - memoire allouee a Elasticsearch

## Tests

### Tests backend

Depuis `backend/` :

```bash
pytest tests -v
```

### Tests d'integration backend

Demarrer Elasticsearch avant :

```bash
docker compose up -d elasticsearch
cd backend
pytest tests/integration -v
```

### Tests frontend E2E

Depuis la racine :

```bash
npm install
npx playwright install
npm run test:e2e
```

Autres commandes utiles :

```bash
npm run test:e2e:ui
npm run test:e2e:headed
npm run test:e2e:debug
```

## API principale

### Videos

- `GET /api/videos`
- `GET /api/videos/{id}`
- `GET /api/videos/{id}/meta`
- `GET /api/videos/{id}/clips`
- `GET /api/videos/{id}/clips/{clip_id}`
- `GET /api/videos/{id}/clips/{clip_id}/thumbnail`
- `GET /api/videos/stream/{file_path}?match_id=...`

### Recherche

- `GET /api/search/status`
- `GET /api/search`
- `GET /api/search/point/{match_id}/{point_id}`
- `GET /api/search/match-momentum/{match_id}`
- `GET /api/search/player-compare/{match_id}`
- `GET /api/search/stats`

### Recherche semantique

- `GET /api/semantic/status`
- `GET /api/semantic/highlights`
- `GET /api/semantic/similar`

### Visualisation

- `GET /api/visualization/embeddings`

### Chat

- `POST /api/chat`
- `GET /api/chat/status`

## Deploiement OVH

Cette section documente le deploiement effectue sur un VPS OVH Ubuntu, avec Docker Compose.

### Architecture retenue

Le choix de deploiement a ete :

- un seul VPS
- `frontend`, `backend`, `elasticsearch` et `nginx` sur la meme machine
- videos stockees localement sur le disque du VPS
- Elasticsearch non utilise comme service externe

Pourquoi ce choix :

- c'est le plus simple a maintenir
- les videos existent deja en local et le backend les sert directement
- le projet avait deja une base Docker/Elasticsearch

### Services Docker

Le fichier `docker-compose.yml` lance 4 services :

- `frontend`
- `backend`
- `elasticsearch`
- `nginx`

Points importants :

- `backend` monte `./backend/videos:/app/backend/videos`
- `elasticsearch` stocke ses donnees dans le volume `elasticsearch_data`
- `nginx` expose le port `80`
- le backend reste aussi joignable en direct sur `8001`

### Reverse proxy Nginx

`deploy/nginx/default.conf` route :

- `/` vers `frontend:3000`
- `/api/` vers `backend:8000`

Cela permet d'utiliser une seule adresse publique pour toute l'application.

### 1. Commander le VPS

Le deploiement a ete prepare pour un VPS Ubuntu OVH.

Configuration cible recommandee :

- Ubuntu
- au moins 8 Go de RAM si possible
- acces SSH

### 2. Se connecter au serveur

Depuis Windows PowerShell :

```powershell
ssh ubuntu@IP_DU_SERVEUR
```

### 3. Installer Docker

Sur le VPS :

```bash
sudo apt update
sudo apt install -y docker.io docker-compose-v2 git
sudo usermod -aG docker $USER
newgrp docker
docker --version
docker compose version
```

Si le groupe Docker ne prend pas effet tout de suite, utiliser `sudo docker ...`.

### 4. Recuperer le projet

```bash
git clone https://github.com/<user>/<repo>.git
cd ProjetInfo
git checkout backNathan
```

### 5. Creer le fichier `.env`

```bash
cp .env.example .env
```

Exemple de contenu pour le VPS :

```env
NEXT_PUBLIC_API_URL=http://IP_DU_SERVEUR
FRONTEND_ORIGINS=http://IP_DU_SERVEUR
OPENAI_API_KEY=
OPENAI_MODEL=gpt-4o-mini
ES_JAVA_OPTS=-Xms1g -Xmx1g
```

Remarques :

- `NEXT_PUBLIC_API_URL` doit etre coherent avec la facon dont le frontend est build
- `FRONTEND_ORIGINS` doit contenir l'IP ou le domaine public autorise en CORS
- si tu ajoutes un domaine plus tard, pense a mettre a jour cette valeur

### 6. Copier les videos sur le VPS

Les videos ne sont pas stockees dans Git. Il faut les copier depuis la machine locale.

Depuis PowerShell sous Windows :

```powershell
scp -r "C:\Users\natha\PycharmProjects\ProjetInfo\backend\videos" ubuntu@IP_DU_SERVEUR:/home/ubuntu/ProjetInfo/backend/
```

Verification sur le serveur :

```bash
cd ~/ProjetInfo
ls backend/videos
```

Verifier en particulier :

- la presence de `videos.json`
- la presence des fichiers `.mp4`
- la presence des dossiers `clips`

### 7. Construire et lancer l'application

Depuis `~/ProjetInfo` :

```bash
sudo docker compose up -d --build
```

Verification :

```bash
sudo docker compose ps
```

Acces attendus :

- application : `http://IP_DU_SERVEUR`
- API : `http://IP_DU_SERVEUR/api/videos`
- backend direct : `http://IP_DU_SERVEUR:8001`

### 8. Indexer les donnees

#### Index standard

```bash
sudo docker compose exec backend python scripts/index_to_elasticsearch.py
```

Si tu veux recreer l'index :

```bash
sudo docker compose exec backend python scripts/index_to_elasticsearch.py --delete
```

#### Index embeddings

```bash
sudo docker compose exec backend python embeddings/pipeline.py index --csv data/points_index.csv --es-host http://elasticsearch:9200 --recreate
```

Cette commande est necessaire pour :

- la page `visualization`
- les recherches semantiques
- les recommendations

### 9. Mettre a jour l'application

Sur le VPS :

```bash
cd ~/ProjetInfo
git pull origin backNathan
sudo docker compose up -d --build
```

Si le VPS a des modifications locales :

```bash
git stash -u
git pull origin backNathan
sudo docker compose up -d --build
```

Pour ne rebuild qu'un service :

```bash
sudo docker compose up -d --build backend
sudo docker compose up -d --build frontend
```

### 10. Ajouter un nom de domaine

Le projet peut etre branche facilement sur un domaine OVH.

Principe :

1. creer un enregistrement `A` vers l'IP du VPS
2. remplacer `server_name _;` dans `deploy/nginx/default.conf`
3. rebuild ou recharger Nginx
4. ajouter ensuite HTTPS avec Let's Encrypt si besoin

Exemples DNS :

- `@ -> IP_DU_SERVEUR`
- `www -> IP_DU_SERVEUR`

### 11. Desactiver le renouvellement si le VPS est temporaire

Si le serveur est pris pour un mois seulement, penser a desactiver le renouvellement automatique dans l'espace client OVH.

## Exploitation et maintenance

Commandes utiles sur le serveur :

```bash
sudo docker compose ps
sudo docker compose logs -f backend
sudo docker compose logs -f frontend
sudo docker compose logs -f nginx
sudo docker compose logs -f elasticsearch
sudo docker compose restart
sudo docker compose down
```

Verifier l'etat Elasticsearch :

```bash
curl http://127.0.0.1/api/search/status
```

Verifier l'API videos :

```bash
curl http://127.0.0.1/api/videos
```

## Depannage

### Le frontend charge mais pas les donnees

Verifier :

- `NEXT_PUBLIC_API_URL`
- `FRONTEND_ORIGINS`
- `docker compose ps`
- `docker compose logs nginx`
- `docker compose logs backend`

### Elasticsearch est vide ou incoherent

Recreer l'index standard :

```bash
sudo docker compose exec backend python scripts/index_to_elasticsearch.py --delete
```

Recreer les embeddings :

```bash
sudo docker compose exec backend python embeddings/pipeline.py index --csv data/points_index.csv --es-host http://elasticsearch:9200 --recreate
```

### La visualisation charge mais n'affiche aucun point

Cause classique :

- l'index classique existe
- mais les embeddings n'ont pas ete generes

Solution :

```bash
sudo docker compose exec backend python embeddings/pipeline.py index --csv data/points_index.csv --es-host http://elasticsearch:9200 --recreate
```

### Les videos ne se lisent pas

Verifier :

- la presence des fichiers dans `backend/videos`
- la coherence de `backend/videos/videos.json`
- les chemins des clips
- les logs du backend

### Le backend repond mais certaines stats sont fausses

Certaines vues reconstruisent des informations a partir des points indexes. Si le CSV a change :

1. recreer l'index standard
2. recreer les embeddings
3. rebuild le backend si le code a change

## Notes

- Le deploiement OVH actuel a ete fait avec Docker Compose, sans Kubernetes et sans stockage objet externe.
- Les videos sont volontairement stockees localement sur le serveur pour limiter la complexite.
- `DEPLOYMENT_OVH.md` reste disponible comme memo court, mais ce README est maintenant la reference principale.
