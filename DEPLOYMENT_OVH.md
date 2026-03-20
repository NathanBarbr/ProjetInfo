# Deploiement OVH

## 1. Preparer le serveur

Sur le VPS Ubuntu:

```bash
sudo apt update
sudo apt install -y docker.io docker-compose-plugin git
sudo usermod -aG docker $USER
newgrp docker
```

## 2. Recuperer le projet

```bash
git clone <URL_DU_REPO>
cd ProjetInfo
cp .env.example .env
```

Edite `.env` et remplace au minimum:

- `FRONTEND_ORIGINS=http://IP_DU_VPS`
- `OPENAI_API_KEY=...` si tu veux le chat OpenAI

## 3. Mettre les videos

Copie tes videos et clips dans `backend/videos/`.

Le fichier `backend/videos/videos.json` doit etre present et coherent avec les dossiers de clips.

## 4. Lancer l'application

```bash
docker compose up -d --build
```

Acces:

- front: `http://IP_DU_VPS/`
- API: `http://IP_DU_VPS/api/`
- backend direct: `http://IP_DU_VPS:8001/`
- Elasticsearch direct: `http://IP_DU_VPS:9200/`

## 5. Indexer Elasticsearch

Une fois les conteneurs lances:

```bash
docker compose exec backend python scripts/index_to_elasticsearch.py
```

## 6. Commandes utiles

```bash
docker compose ps
docker compose logs -f backend
docker compose logs -f frontend
docker compose logs -f elasticsearch
docker compose restart
docker compose down
```

## 7. Important

- `NEXT_PUBLIC_API_URL=/api` permet au frontend d'appeler le backend via Nginx.
- les videos restent sur le disque du VPS via `./backend/videos:/app/backend/videos`
- Elasticsearch conserve ses donnees dans le volume Docker `elasticsearch_data`
