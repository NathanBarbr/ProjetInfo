"""
Script d'indexation des points dans Elasticsearch.

Ce script charge le fichier points_index.csv et l'indexe dans Elasticsearch
pour permettre des recherches rapides et filtrées.

Usage:
    python index_to_elasticsearch.py                    # Indexer tout
    python index_to_elasticsearch.py --delete           # Supprimer et réindexer
"""

import csv
import json
import argparse
from pathlib import Path
from typing import List
from urllib.request import Request, urlopen
from urllib.error import URLError, HTTPError


# Configuration Elasticsearch
ES_HOST = "http://localhost:9200"
INDEX_NAME = "pingpong_points"

# Mapping pour l'index (types de champs optimisés pour la recherche)
INDEX_MAPPING = {
    "mappings": {
        "properties": {
            "match_id": {"type": "keyword"},
            "point_id": {"type": "integer"},
            "set_num": {"type": "integer"},
            "score_A": {"type": "integer"},
            "score_B": {"type": "integer"},
            "set_A": {"type": "integer"},
            "set_B": {"type": "integer"},
            "serveur": {"type": "keyword"},
            "winner": {"type": "keyword"},
            "nb_coups": {"type": "integer"},
            "duree_frames": {"type": "integer"},
            "frame_debut": {"type": "integer"},
            "frame_fin": {"type": "integer"},
            
            # Séquences - text pour recherche full-text, keyword pour filtres exacts
            "sequence_coups": {"type": "text"},
            "sequence_lateralites": {"type": "text", "fields": {"keyword": {"type": "keyword"}}},
            "sequence_effets": {"type": "text", "fields": {"keyword": {"type": "keyword"}}},
            "sequence_zones": {"type": "text"},
            
            # Service
            "service_lateralite": {"type": "keyword"},
            "service_zone": {"type": "keyword"},
            
            # Fin du point
            "faute_type": {"type": "keyword"},
            "faute_lateralite": {"type": "keyword"},
            "dernier_coup": {"type": "keyword"},
            "derniere_zone": {"type": "keyword"},
            "occupancy_zone": {"type": "keyword"},
            "movement_intensity": {"type": "integer"},
            "rally_intensity": {"type": "float"},
            
            # Vidéo
            "clip_path": {"type": "keyword"},
            
            # Métadonnées match
            "player_A": {"type": "keyword"},
            "player_B": {"type": "keyword"},
            "competition": {"type": "keyword"},
            "date": {"type": "date", "format": "yyyy-MM-dd||epoch_millis", "ignore_malformed": True}
        }
    },
    "settings": {
        "number_of_shards": 1,
        "number_of_replicas": 0
    }
}


def _parse_zones(sequence_zones: str) -> List[str]:
    if not sequence_zones:
        return []
    return [z.strip().lower() for z in str(sequence_zones).split(",") if z.strip()]


def _dominant_occupancy_zone(sequence_zones: str) -> str:
    zones = _parse_zones(sequence_zones)
    if not zones:
        return "unknown"
    counts = {"left": 0, "middle": 0, "right": 0}
    for zone in zones:
        if zone.startswith("g"):
            counts["left"] += 1
        elif zone.startswith("m"):
            counts["middle"] += 1
        elif zone.startswith("d"):
            counts["right"] += 1
    best = max(counts, key=counts.get)
    return best if counts[best] > 0 else "unknown"


def _movement_intensity(sequence_zones: str) -> int:
    zones = _parse_zones(sequence_zones)
    if len(zones) < 2:
        return 0
    transitions = 0
    for i in range(1, len(zones)):
        if zones[i] != zones[i - 1]:
            transitions += 1
    return transitions


def _rally_intensity(nb_coups: int, duree_frames: int, movement: int) -> float:
    rally_component = min(1.0, (nb_coups or 0) / 12.0)
    duration_component = min(1.0, (duree_frames or 0) / 250.0)
    movement_component = min(1.0, movement / 10.0)
    score = 0.45 * rally_component + 0.30 * duration_component + 0.25 * movement_component
    return round(score, 3)


def es_request(method: str, path: str, body: dict = None) -> dict:
    """Effectue une requête HTTP vers Elasticsearch."""
    url = f"{ES_HOST}{path}"
    headers = {"Content-Type": "application/json"}
    
    data = None
    if body is not None:
        data = json.dumps(body).encode('utf-8')
    
    req = Request(url, data=data, headers=headers, method=method)
    
    try:
        with urlopen(req) as response:
            return json.loads(response.read().decode('utf-8'))
    except HTTPError as e:
        if e.code == 404:
            return {"found": False, "status": 404}
        error_body = e.read().decode('utf-8')
        raise Exception(f"ES Error {e.code}: {error_body}")
    except URLError as e:
        raise ConnectionError(f"Cannot connect to Elasticsearch: {e}")


def check_connection():
    """Vérifie la connexion à Elasticsearch."""
    try:
        info = es_request("GET", "/")
        print(f"✅ Connecté à Elasticsearch {info['version']['number']}: {ES_HOST}")
        return True
    except Exception as e:
        print(f"❌ Erreur de connexion: {e}")
        return False


def index_exists() -> bool:
    """Vérifie si l'index existe."""
    try:
        result = es_request("HEAD", f"/{INDEX_NAME}")
        return result.get("status") != 404
    except:
        return True  # Si pas 404, l'index existe probablement


def create_index(delete_existing: bool = False):
    """Crée l'index avec le mapping approprié."""
    try:
        # Vérifier si existe
        es_request("GET", f"/{INDEX_NAME}")
        exists = True
    except Exception as e:
        if "404" in str(e):
            exists = False
        else:
            exists = True
    
    if exists:
        if delete_existing:
            print(f"🗑️  Suppression de l'index existant: {INDEX_NAME}")
            es_request("DELETE", f"/{INDEX_NAME}")
        else:
            print(f"ℹ️  L'index {INDEX_NAME} existe déjà")
            return
    
    es_request("PUT", f"/{INDEX_NAME}", INDEX_MAPPING)
    print(f"✅ Index créé: {INDEX_NAME}")


def load_csv(csv_path: Path) -> list[dict]:
    """Charge le CSV et convertit les types."""
    points = []
    
    with open(csv_path, 'r', encoding='utf-8') as f:
        reader = csv.DictReader(f)
        for row in reader:
            # Convertir les types numériques
            point = {
                'match_id': row['match_id'],
                'point_id': int(row['point_id']),
                'set_num': int(row['set_num']),
                'score_A': int(row['score_A']),
                'score_B': int(row['score_B']),
                'set_A': int(row['set_A']),
                'set_B': int(row['set_B']),
                'serveur': row['serveur'],
                'winner': row['winner'],
                'nb_coups': int(row['nb_coups']),
                'duree_frames': int(row['duree_frames']),
                'frame_debut': int(row['frame_debut']),
                'frame_fin': int(row['frame_fin']),
                'sequence_coups': row['sequence_coups'],
                'sequence_lateralites': row['sequence_lateralites'],
                'sequence_effets': row['sequence_effets'],
                'sequence_zones': row['sequence_zones'],
                'service_lateralite': row['service_lateralite'],
                'service_zone': row['service_zone'],
                'faute_type': row['faute_type'],
                'faute_lateralite': row['faute_lateralite'],
                'dernier_coup': row['dernier_coup'],
                'derniere_zone': row['derniere_zone'],
                'clip_path': row['clip_path'],
                'player_A': row['player_A'],
                'player_B': row['player_B'],
                'competition': row['competition'],
                'date': row['date'] if row['date'] else None
            }
            movement = _movement_intensity(point["sequence_zones"])
            point["occupancy_zone"] = _dominant_occupancy_zone(point["sequence_zones"])
            point["movement_intensity"] = movement
            point["rally_intensity"] = _rally_intensity(point["nb_coups"], point["duree_frames"], movement)
            points.append(point)
    
    return points


def index_points(points: list[dict]):
    """Indexe les points dans Elasticsearch en bulk."""
    # Construire le body bulk NDJSON
    bulk_body = ""
    for point in points:
        doc_id = f"{point['match_id']}_{point['point_id']}"
        # Action line
        bulk_body += json.dumps({"index": {"_index": INDEX_NAME, "_id": doc_id}}) + "\n"
        # Document line
        bulk_body += json.dumps(point) + "\n"
    
    # Envoyer en bulk
    url = f"{ES_HOST}/_bulk"
    headers = {"Content-Type": "application/x-ndjson"}
    data = bulk_body.encode('utf-8')
    
    req = Request(url, data=data, headers=headers, method="POST")
    
    try:
        with urlopen(req) as response:
            result = json.loads(response.read().decode('utf-8'))
            
        errors = result.get("errors", False)
        items = result.get("items", [])
        
        success_count = sum(1 for item in items if item.get("index", {}).get("status") in [200, 201])
        print(f"✅ {success_count} points indexés")
        
        if errors:
            error_items = [item for item in items if item.get("index", {}).get("status") not in [200, 201]]
            print(f"⚠️  {len(error_items)} erreurs d'indexation")
            for item in error_items[:3]:
                print(f"   - {item}")
                
    except HTTPError as e:
        error_body = e.read().decode('utf-8')
        print(f"❌ Erreur bulk: {error_body[:500]}")


def refresh_index():
    """Rafraîchit l'index pour rendre les docs disponibles."""
    es_request("POST", f"/{INDEX_NAME}/_refresh")


def get_count() -> int:
    """Retourne le nombre de documents dans l'index."""
    result = es_request("GET", f"/{INDEX_NAME}/_count")
    return result.get("count", 0)


def main():
    parser = argparse.ArgumentParser(description="Indexe les points dans Elasticsearch")
    parser.add_argument('--delete', action='store_true', help='Supprimer et recréer l\'index')
    parser.add_argument('--csv', type=str, default='backend/data/points_index.csv',
                        help='Chemin du fichier CSV')
    args = parser.parse_args()
    
    # Trouver la racine du projet
    script_path = Path(__file__).resolve()
    project_root = script_path.parent.parent.parent
    csv_path = project_root / args.csv
    
    if not csv_path.exists():
        print(f"❌ Fichier non trouvé: {csv_path}")
        print("   Exécutez d'abord: python generate_points_index.py")
        return
    
    print(f"📁 Fichier CSV: {csv_path}")
    
    # Connexion
    if not check_connection():
        return
    
    # Création index
    create_index(delete_existing=args.delete)
    
    # Chargement et indexation
    points = load_csv(csv_path)
    print(f"📊 {len(points)} points chargés depuis le CSV")
    
    index_points(points)
    
    # Vérification
    refresh_index()
    count = get_count()
    print(f"\n🎉 Total dans l'index: {count} points")


if __name__ == '__main__':
    main()
