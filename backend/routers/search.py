"""
Search router - Elasticsearch integration for point search
"""

import os
import json
from typing import Optional
from urllib.request import Request, urlopen
from urllib.error import URLError, HTTPError
from fastapi import APIRouter, HTTPException, Query

router = APIRouter(prefix="/api/search", tags=["search"])

# Elasticsearch configuration
ES_HOST = os.getenv("ELASTICSEARCH_HOST", "http://localhost:9200")
ES_INDEX = "pingpong_points"


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
        raise Exception(f"Cannot connect to Elasticsearch: {e}")


def check_es_connection() -> bool:
    """Check if Elasticsearch is available."""
    try:
        es_request("GET", "/")
        return True
    except Exception:
        return False


def check_index_exists() -> bool:
    """Check if the index exists."""
    try:
        es_request("GET", f"/{ES_INDEX}")
        return True
    except Exception as e:
        if "404" in str(e):
            return False
        return True


def build_es_query(
    match_id: Optional[str] = None,
    player: Optional[str] = None,
    winner: Optional[str] = None,
    serveur: Optional[str] = None,
    set_num: Optional[int] = None,
    nb_coups_min: Optional[int] = None,
    nb_coups_max: Optional[int] = None,
    effet: Optional[str] = None,
    lateralite: Optional[str] = None,
    faute_type: Optional[str] = None,
    winning_shot: Optional[str] = None,
    winning_shot_status: Optional[str] = None,
    zone: Optional[str] = None,
    service_zone: Optional[str] = None,
    service_lateralite: Optional[str] = None,
    q: Optional[str] = None
) -> dict:
    """Helper to build the Elasticsearch query dict from filters."""
    must_clauses = []
    filter_clauses = []
    
    # Filtres exacts (keyword)
    if match_id:
        filter_clauses.append({"term": {"match_id": match_id}})
    
    if player:
        filter_clauses.append({
            "bool": {
                "should": [
                    {"term": {"player_A": player}},
                    {"term": {"player_B": player}}
                ],
                "minimum_should_match": 1
            }
        })
    
    if winner:
        filter_clauses.append({"term": {"winner": winner}})
    
    if serveur:
        filter_clauses.append({"term": {"serveur": serveur}})
    
    if set_num:
        filter_clauses.append({"term": {"set_num": set_num}})
    
    if faute_type:
        filter_clauses.append({"term": {"faute_type": faute_type}})
    
    if winning_shot:
        filter_clauses.append({"term": {"dernier_coup": winning_shot}})
    
    # Logique pour winning_shot_status (winner vs error)
    if winning_shot_status == "winner":
        filter_clauses.append({"term": {"faute_type": "pt_gagne"}})
    elif winning_shot_status == "error":
        must_clauses.append({
            "bool": {
                "must_not": {"term": {"faute_type": "pt_gagne"}}
            }
        })
    
    if service_zone:
        filter_clauses.append({"term": {"service_zone": service_zone}})

    if service_lateralite:
        filter_clauses.append({"term": {"service_lateralite": service_lateralite}})
    
    # Filtres range
    if nb_coups_min is not None or nb_coups_max is not None:
        range_clause = {"range": {"nb_coups": {}}}
        if nb_coups_min is not None:
            range_clause["range"]["nb_coups"]["gte"] = nb_coups_min
        if nb_coups_max is not None:
            range_clause["range"]["nb_coups"]["lte"] = nb_coups_max
        filter_clauses.append(range_clause)
    
    # Recherche dans les séquences (match partiel)
    if effet:
        must_clauses.append({"match": {"sequence_effets": effet}})
    
    if lateralite:
        must_clauses.append({"match": {"sequence_lateralites": lateralite}})
    
    if zone:
        must_clauses.append({"match": {"sequence_zones": zone}})
    
    # Recherche textuelle générale
    if q:
        must_clauses.append({
            "multi_match": {
                "query": q,
                "fields": ["sequence_coups", "sequence_effets", "sequence_zones", "winner", "serveur"]
            }
        })
    
    # Construire la requête finale
    query = {"bool": {}}
    if must_clauses:
        query["bool"]["must"] = must_clauses
    if filter_clauses:
        query["bool"]["filter"] = filter_clauses
    
    # Si aucun filtre, match all
    if not must_clauses and not filter_clauses:
        query = {"match_all": {}}
        
    return query


@router.get("/status")
async def get_search_status():
    """
    Check Elasticsearch connection status.
    """
    connected = check_es_connection()
    
    index_info = None
    if connected:
        try:
            count_result = es_request("GET", f"/{ES_INDEX}/_count")
            index_info = {"exists": True, "count": count_result.get("count", 0)}
        except Exception:
            index_info = {"exists": False, "count": 0}
    
    return {
        "elasticsearch": {
            "connected": connected,
            "host": ES_HOST,
            "index": ES_INDEX,
            "index_info": index_info
        }
    }


@router.get("")
async def search_points(
    match_id: Optional[str] = Query(None, description="ID du match"),
    player: Optional[str] = Query(None, description="Nom du joueur (filtre sur player_A ou player_B)"),
    winner: Optional[str] = Query(None, description="Gagnant du point"),
    serveur: Optional[str] = Query(None, description="Serveur du point"),
    set_num: Optional[int] = Query(None, description="Numéro du set"),
    nb_coups_min: Optional[int] = Query(None, description="Nombre minimum de coups"),
    nb_coups_max: Optional[int] = Query(None, description="Nombre maximum de coups"),
    effet: Optional[str] = Query(None, description="Effet recherché (topspin, poussette, block, flip)"),
    lateralite: Optional[str] = Query(None, description="Latéralité (coup_droit, revers)"),
    faute_type: Optional[str] = Query(None, description="Type de faute (out, filet, pt_gagne)"),
    winning_shot: Optional[str] = Query(None, description="Type de coup gagnant (dernier_coup)"),
    winning_shot_status: Optional[str] = Query(None, description="Statut du dernier coup: 'winner' (point gagné), 'error' (faute), ou None"),
    zone: Optional[str] = Query(None, description="Zone de jeu (m1, g2, d3, etc.)"),
    service_zone: Optional[str] = Query(None, description="Zone de service"),
    service_lateralite: Optional[str] = Query(None, description="Latéralité du service (coup_droit, revers)"),
    q: Optional[str] = Query(None, description="Recherche textuelle dans les séquences"),
    page: int = Query(1, ge=1, description="Numéro de page"),
    size: int = Query(20, ge=1, le=100, description="Nombre de résultats par page")
):
    """
    Recherche de points avec filtres multiples.
    """
    if not check_es_connection():
        raise HTTPException(
            status_code=503,
            detail="Elasticsearch is not available. Make sure Docker is running."
        )
    
    if not check_index_exists():
        return {
            "total": 0,
            "page": page,
            "size": size,
            "pages": 0,
            "points": [],
            "message": "No data indexed yet. Run: python backend/scripts/index_to_elasticsearch.py"
        }
    
    query = build_es_query(
        match_id, player, winner, serveur, set_num, nb_coups_min, nb_coups_max,
        effet, lateralite, faute_type, winning_shot, winning_shot_status,
        zone, service_zone, service_lateralite, q
    )
    
    from_offset = (page - 1) * size
    
    search_body = {
        "query": query,
        "from": from_offset,
        "size": size,
        "sort": [{"match_id": "asc"}, {"point_id": "asc"}]
    }
    
    try:
        response = es_request("POST", f"/{ES_INDEX}/_search", search_body)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Elasticsearch error: {str(e)}")
    
    hits = response.get("hits", {})
    total = hits.get("total", {}).get("value", 0)
    points = [{"id": hit["_id"], **hit["_source"]} for hit in hits.get("hits", [])]
    
    return {
        "total": total,
        "page": page,
        "size": size,
        "pages": (total + size - 1) // size if total > 0 else 0,
        "points": points
    }


@router.get("/stats")
async def get_search_stats(
    match_id: Optional[str] = Query(None),
    player: Optional[str] = Query(None),
    winner: Optional[str] = Query(None),
    serveur: Optional[str] = Query(None),
    set_num: Optional[int] = Query(None),
    nb_coups_min: Optional[int] = Query(None),
    nb_coups_max: Optional[int] = Query(None),
    effet: Optional[str] = Query(None),
    lateralite: Optional[str] = Query(None),
    faute_type: Optional[str] = Query(None),
    winning_shot: Optional[str] = Query(None),
    winning_shot_status: Optional[str] = Query(None),
    zone: Optional[str] = Query(None),
    service_zone: Optional[str] = Query(None),
    service_lateralite: Optional[str] = Query(None),
    q: Optional[str] = Query(None)
):
    """
    Retourne des statistiques globales FILTRÉES.
    Les stats s'adaptent dynamiquement aux filtres appliqués.
    """
    if not check_es_connection():
        raise HTTPException(status_code=503, detail="Elasticsearch is not available")
    
    if not check_index_exists():
        return {"total_points": 0, "message": "No data indexed"}
    
    # On construit la même requête que pour la recherche
    query = build_es_query(
        match_id, player, winner, serveur, set_num, nb_coups_min, nb_coups_max,
        effet, lateralite, faute_type, winning_shot, winning_shot_status,
        zone, service_zone, service_lateralite, q
    )
    
    aggs_body = {
        "size": 0,
        "query": query,  # Applique les filtres aux aggrégations !
        "aggs": {
            "matches": {"terms": {"field": "match_id", "size": 100}},
            "players_A": {"terms": {"field": "player_A", "size": 50}},
            "players_B": {"terms": {"field": "player_B", "size": 50}},
            "winners": {"terms": {"field": "winner", "size": 50}},
            "serveurs": {"terms": {"field": "serveur", "size": 50}},
            "sets": {"terms": {"field": "set_num", "size": 10}},
            "fautes": {"terms": {"field": "faute_type", "size": 20}},
            "winning_shots": {"terms": {"field": "dernier_coup", "size": 20}},
            "service_zones": {"terms": {"field": "service_zone", "size": 20}},
            "service_lateralites": {"terms": {"field": "service_lateralite", "size": 10}},
            "nb_coups_stats": {"stats": {"field": "nb_coups"}}
        }
    }
    
    try:
        response = es_request("POST", f"/{ES_INDEX}/_search", aggs_body)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Elasticsearch error: {str(e)}")
    
    aggs = response.get("aggregations", {})
    total = response.get("hits", {}).get("total", {}).get("value", 0)
    
    players = set()
    for bucket in aggs.get("players_A", {}).get("buckets", []):
        players.add(bucket["key"])
    for bucket in aggs.get("players_B", {}).get("buckets", []):
        players.add(bucket["key"])
    
    nb_coups_stats = aggs.get("nb_coups_stats", {})
    
    return {
        "total_points": total,
        "matches": [{"id": b["key"], "count": b["doc_count"]} for b in aggs.get("matches", {}).get("buckets", [])],
        "players": sorted(list(players)),
        "winners": [b["key"] for b in aggs.get("winners", {}).get("buckets", [])],
        "serveurs": [b["key"] for b in aggs.get("serveurs", {}).get("buckets", [])],
        "sets": sorted([b["key"] for b in aggs.get("sets", {}).get("buckets", [])]),
        "fautes": [b["key"] for b in aggs.get("fautes", {}).get("buckets", [])],
        "winning_shots": [b["key"] for b in aggs.get("winning_shots", {}).get("buckets", [])],
        "service_zones": [b["key"] for b in aggs.get("service_zones", {}).get("buckets", [])],
        "service_lateralites": [b["key"] for b in aggs.get("service_lateralites", {}).get("buckets", [])],
        "nb_coups": {
            "min": int(nb_coups_stats.get("min", 0)) if nb_coups_stats.get("count", 0) > 0 else 0,
            "max": int(nb_coups_stats.get("max", 0)) if nb_coups_stats.get("count", 0) > 0 else 0,
            "avg": round(nb_coups_stats.get("avg", 0), 1) if nb_coups_stats.get("count", 0) > 0 else 0
        }
    }


@router.get("/point/{match_id}/{point_id}")
async def get_point_detail(match_id: str, point_id: int):
    """
    Retourne les détails d'un point spécifique.
    """
    if not check_es_connection():
        raise HTTPException(status_code=503, detail="Elasticsearch is not available")
    
    doc_id = f"{match_id}_{point_id}"
    
    try:
        response = es_request("GET", f"/{ES_INDEX}/_doc/{doc_id}")
        if response.get("found") == False:
            raise HTTPException(status_code=404, detail=f"Point not found: {doc_id}")
        return {"id": response["_id"], **response["_source"]}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=404, detail=f"Point not found: {doc_id}")


@router.delete("/index")
async def clear_index():
    """
    Clear all indexed data (for re-indexing).
    """
    if not check_es_connection():
        raise HTTPException(status_code=503, detail="Elasticsearch is not available")
    
    try:
        es_request("DELETE", f"/{ES_INDEX}")
        return {"success": True, "message": "Index cleared"}
    except Exception as e:
        if "404" in str(e):
            return {"success": True, "message": "Index did not exist"}
        raise HTTPException(status_code=500, detail=f"Error clearing index: {str(e)}")
