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
    duree_min: Optional[int] = None,
    duree_max: Optional[int] = None,
    effet: Optional[str] = None,
    lateralite: Optional[str] = None,
    faute_type: Optional[str] = None,
    winning_shot: Optional[str] = None,
    winning_shot_status: Optional[str] = None,
    zone: Optional[str] = None,
    service_zone: Optional[str] = None,
    service_lateralite: Optional[str] = None,
    occupancy_zone: Optional[str] = None,
    movement_intensity_min: Optional[int] = None,
    movement_intensity_max: Optional[int] = None,
    rally_intensity_min: Optional[float] = None,
    rally_intensity_max: Optional[float] = None,
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

    if occupancy_zone:
        filter_clauses.append({"term": {"occupancy_zone": occupancy_zone}})
    
    # Filtres range
    if nb_coups_min is not None or nb_coups_max is not None:
        range_clause = {"range": {"nb_coups": {}}}
        if nb_coups_min is not None:
            range_clause["range"]["nb_coups"]["gte"] = nb_coups_min
        if nb_coups_max is not None:
            range_clause["range"]["nb_coups"]["lte"] = nb_coups_max
        filter_clauses.append(range_clause)

    # Durée du point (en frames)
    if duree_min is not None or duree_max is not None:
        range_clause = {"range": {"duree_frames": {}}}
        if duree_min is not None:
            range_clause["range"]["duree_frames"]["gte"] = duree_min
        if duree_max is not None:
            range_clause["range"]["duree_frames"]["lte"] = duree_max
        filter_clauses.append(range_clause)

    if movement_intensity_min is not None or movement_intensity_max is not None:
        range_clause = {"range": {"movement_intensity": {}}}
        if movement_intensity_min is not None:
            range_clause["range"]["movement_intensity"]["gte"] = movement_intensity_min
        if movement_intensity_max is not None:
            range_clause["range"]["movement_intensity"]["lte"] = movement_intensity_max
        filter_clauses.append(range_clause)

    if rally_intensity_min is not None or rally_intensity_max is not None:
        range_clause = {"range": {"rally_intensity": {}}}
        if rally_intensity_min is not None:
            range_clause["range"]["rally_intensity"]["gte"] = rally_intensity_min
        if rally_intensity_max is not None:
            range_clause["range"]["rally_intensity"]["lte"] = rally_intensity_max
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
    duree_min: Optional[int] = Query(None, description="Durée minimale du point (frames)"),
    duree_max: Optional[int] = Query(None, description="Durée maximale du point (frames)"),
    effet: Optional[str] = Query(None, description="Effet recherché (topspin, poussette, block, flip)"),
    lateralite: Optional[str] = Query(None, description="Latéralité (coup_droit, revers)"),
    faute_type: Optional[str] = Query(None, description="Type de faute (out, filet, pt_gagne)"),
    winning_shot: Optional[str] = Query(None, description="Type de coup gagnant (dernier_coup)"),
    winning_shot_status: Optional[str] = Query(None, description="Statut du dernier coup: 'winner' (point gagné), 'error' (faute), ou None"),
    zone: Optional[str] = Query(None, description="Zone de jeu (m1, g2, d3, etc.)"),
    service_zone: Optional[str] = Query(None, description="Zone de service"),
    service_lateralite: Optional[str] = Query(None, description="Lateralite du service (coup_droit, revers)"),
    occupancy_zone: Optional[str] = Query(None, description="Zone d'occupation dominante (left, middle, right)"),
    movement_intensity_min: Optional[int] = Query(None, ge=0, description="Intensite de mouvement minimum"),
    movement_intensity_max: Optional[int] = Query(None, ge=0, description="Intensite de mouvement maximum"),
    rally_intensity_min: Optional[float] = Query(None, ge=0, le=1, description="Intensite de rallye minimum"),
    rally_intensity_max: Optional[float] = Query(None, ge=0, le=1, description="Intensite de rallye maximum"),
    q: Optional[str] = Query(None, description="Recherche textuelle dans les sequences"),
    sort: Optional[str] = Query("chronological", description="Ordre de tri: chronological, longest, shortest, most_shots, least_shots, winners, errors"),
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
        duree_min, duree_max,
        effet, lateralite, faute_type, winning_shot, winning_shot_status,
        zone, service_zone, service_lateralite,
        occupancy_zone, movement_intensity_min, movement_intensity_max, rally_intensity_min, rally_intensity_max,
        q
    )
    
    from_offset = (page - 1) * size

    # Build sort clauses
    sort_clauses = [{"match_id": "asc"}, {"point_id": "asc"}]
    if sort == "longest":
        sort_clauses = [{"duree_frames": {"order": "desc", "missing": "_last"}}, *sort_clauses]
    elif sort == "shortest":
        sort_clauses = [{"duree_frames": {"order": "asc", "missing": "_last"}}, *sort_clauses]
    elif sort == "most_shots":
        sort_clauses = [{"nb_coups": {"order": "desc", "missing": "_last"}}, *sort_clauses]
    elif sort == "least_shots":
        sort_clauses = [{"nb_coups": {"order": "asc", "missing": "_last"}}, *sort_clauses]
    elif sort == "winners":
        sort_clauses = [
            {
                "_script": {
                    "type": "number",
                    "order": "desc",
                    "script": {
                        "lang": "painless",
                        "source": "return doc.containsKey('faute_type') && !doc['faute_type'].empty && doc['faute_type'].value == 'pt_gagne' ? 1 : 0;"
                    }
                }
            },
            *sort_clauses
        ]
    elif sort == "errors":
        sort_clauses = [
            {
                "_script": {
                    "type": "number",
                    "order": "desc",
                    "script": {
                        "lang": "painless",
                        "source": "return doc.containsKey('faute_type') && !doc['faute_type'].empty && doc['faute_type'].value != 'pt_gagne' ? 1 : 0;"
                    }
                }
            },
            *sort_clauses
        ]

    search_body = {
        "query": query,
        "from": from_offset,
        "size": size,
        "sort": sort_clauses
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
    duree_min: Optional[int] = Query(None),
    duree_max: Optional[int] = Query(None),
    effet: Optional[str] = Query(None),
    lateralite: Optional[str] = Query(None),
    faute_type: Optional[str] = Query(None),
    winning_shot: Optional[str] = Query(None),
    winning_shot_status: Optional[str] = Query(None),
    zone: Optional[str] = Query(None),
    service_zone: Optional[str] = Query(None),
    service_lateralite: Optional[str] = Query(None),
    occupancy_zone: Optional[str] = Query(None),
    movement_intensity_min: Optional[int] = Query(None, ge=0),
    movement_intensity_max: Optional[int] = Query(None, ge=0),
    rally_intensity_min: Optional[float] = Query(None, ge=0, le=1),
    rally_intensity_max: Optional[float] = Query(None, ge=0, le=1),
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
        duree_min, duree_max,
        effet, lateralite, faute_type, winning_shot, winning_shot_status,
        zone, service_zone, service_lateralite,
        occupancy_zone, movement_intensity_min, movement_intensity_max, rally_intensity_min, rally_intensity_max,
        q
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
            "nb_coups_stats": {"stats": {"field": "nb_coups"}},
            "duree_stats": {"stats": {"field": "duree_frames"}}
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
    duree_stats = aggs.get("duree_stats", {})
    
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
        },
        "duree": {
            "min": int(duree_stats.get("min", 0)) if duree_stats.get("count", 0) > 0 else 0,
            "max": int(duree_stats.get("max", 0)) if duree_stats.get("count", 0) > 0 else 0,
            "avg": round(duree_stats.get("avg", 0), 1) if duree_stats.get("count", 0) > 0 else 0
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


@router.get("/player-serve-profile/{player_name}")
async def get_player_serve_profile(
    player_name: str,
    match_id: Optional[str] = Query(None, description="Filter by match"),
):
    """
    Returns comprehensive serving statistics for a player.
    """
    if not check_es_connection():
        raise HTTPException(status_code=503, detail="Elasticsearch is not available")

    filter_clauses = [{"term": {"serveur": player_name}}]
    if match_id:
        filter_clauses.append({"term": {"match_id": match_id}})

    search_body = {
        "size": 0,
        "query": {"bool": {"filter": filter_clauses}},
        "aggs": {
            "points_won": {"filter": {"term": {"winner": player_name}}},
            "service_zones": {"terms": {"field": "service_zone", "size": 20}},
            "service_zone_wins": {
                "terms": {"field": "service_zone", "size": 20},
                "aggs": {"won": {"filter": {"term": {"winner": player_name}}}}
            },
            "service_lateralite": {"terms": {"field": "service_lateralite", "size": 10}},
            "lateralite_wins": {
                "terms": {"field": "service_lateralite", "size": 10},
                "aggs": {"won": {"filter": {"term": {"winner": player_name}}}}
            },
            "rally_lengths": {"histogram": {"field": "nb_coups", "interval": 1, "min_doc_count": 1}},
            "avg_rally": {"avg": {"field": "nb_coups"}},
            "avg_duration": {"avg": {"field": "duree_frames"}},
            "fault_types": {"terms": {"field": "faute_type", "size": 20}},
            "last_shots": {"terms": {"field": "dernier_coup", "size": 20}},
            "by_set": {
                "terms": {"field": "set_num", "size": 10, "order": {"_key": "asc"}},
                "aggs": {
                    "won": {"filter": {"term": {"winner": player_name}}},
                    "avg_rally": {"avg": {"field": "nb_coups"}}
                }
            },
        },
    }

    try:
        response = es_request("POST", f"/{ES_INDEX}/_search", search_body)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Elasticsearch error: {str(e)}")

    aggs = response.get("aggregations", {})
    total = response.get("hits", {}).get("total", {}).get("value", 0)
    won = aggs.get("points_won", {}).get("doc_count", 0)

    zone_buckets = aggs.get("service_zones", {}).get("buckets", [])
    zone_win_buckets = aggs.get("service_zone_wins", {}).get("buckets", [])
    zone_wins_map = {b["key"]: b.get("won", {}).get("doc_count", 0) for b in zone_win_buckets}
    service_zones = []
    for b in zone_buckets:
        z, count = b["key"], b["doc_count"]
        wins = zone_wins_map.get(z, 0)
        service_zones.append({
            "zone": z, "count": count, "wins": wins,
            "win_rate": round(wins / count * 100, 1) if count > 0 else 0,
            "pct": round(count / total * 100, 1) if total > 0 else 0,
        })

    lat_buckets = aggs.get("service_lateralite", {}).get("buckets", [])
    lat_win_buckets = aggs.get("lateralite_wins", {}).get("buckets", [])
    lat_wins_map = {b["key"]: b.get("won", {}).get("doc_count", 0) for b in lat_win_buckets}
    laterality = []
    for b in lat_buckets:
        key, count = b["key"], b["doc_count"]
        wins = lat_wins_map.get(key, 0)
        laterality.append({
            "type": key, "count": count, "wins": wins,
            "win_rate": round(wins / count * 100, 1) if count > 0 else 0,
        })

    rally_buckets = aggs.get("rally_lengths", {}).get("buckets", [])
    rally_distribution = [{"shots": int(b["key"]), "count": b["doc_count"]} for b in rally_buckets]

    fault_buckets = aggs.get("fault_types", {}).get("buckets", [])
    faults = [{"type": b["key"], "count": b["doc_count"]} for b in fault_buckets]

    shot_buckets = aggs.get("last_shots", {}).get("buckets", [])
    last_shots = [{"shot": b["key"], "count": b["doc_count"]} for b in shot_buckets]

    set_buckets = aggs.get("by_set", {}).get("buckets", [])
    by_set = []
    for b in set_buckets:
        st, sc = b["doc_count"], b.get("won", {}).get("doc_count", 0)
        by_set.append({
            "set": int(b["key"]), "total": st, "won": sc,
            "win_rate": round(sc / st * 100, 1) if st > 0 else 0,
            "avg_rally": round(b.get("avg_rally", {}).get("value", 0) or 0, 1),
        })

    avg_rally = aggs.get("avg_rally", {}).get("value", 0) or 0
    avg_duration = aggs.get("avg_duration", {}).get("value", 0) or 0

    return {
        "player": player_name,
        "total_service_points": total,
        "points_won": won,
        "win_rate": round(won / total * 100, 1) if total > 0 else 0,
        "avg_rally_length": round(avg_rally, 1),
        "avg_duration_seconds": round(avg_duration / 25, 1) if avg_duration else 0,
        "service_zones": service_zones,
        "laterality": laterality,
        "rally_distribution": rally_distribution,
        "faults": faults,
        "last_shots": last_shots,
        "by_set": by_set,
    }


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


@router.get("/match-momentum/{match_id}")
async def get_match_momentum(match_id: str):
    """
    Returns all points in a match sorted chronologically with cumulative scores.
    Used for the momentum graph visualization.
    """
    if not check_es_connection():
        raise HTTPException(status_code=503, detail="Elasticsearch is not available")

    search_body = {
        "size": 500,
        "query": {"term": {"match_id": match_id}},
        "sort": [{"point_id": "asc"}],
        "_source": [
            "point_id", "set_num", "score_A", "score_B", "set_A", "set_B",
            "serveur", "winner", "player_A", "player_B",
            "nb_coups", "faute_type", "is_set_point", "is_point_gagnant"
        ]
    }

    try:
        response = es_request("POST", f"/{ES_INDEX}/_search", search_body)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

    hits = response.get("hits", {}).get("hits", [])
    points = []
    cum_a, cum_b = 0, 0

    for h in hits:
        src = h["_source"]
        player_a = src.get("player_A", "")
        player_b = src.get("player_B", "")
        winner = src.get("winner", "")

        if winner == player_a:
            cum_a += 1
        elif winner == player_b:
            cum_b += 1

        points.append({
            **src,
            "cumulative_A": cum_a,
            "cumulative_B": cum_b,
            "diff": cum_a - cum_b,  # positive = A leads
        })

    player_a = points[0]["player_A"] if points else ""
    player_b = points[0]["player_B"] if points else ""

    return {
        "match_id": match_id,
        "player_A": player_a,
        "player_B": player_b,
        "total_points": len(points),
        "points": points
    }


@router.get("/player-compare/{match_id}")
async def get_player_compare(match_id: str):
    """
    Returns head-to-head comparison stats for both players in a match.
    """
    if not check_es_connection():
        raise HTTPException(status_code=503, detail="Elasticsearch is not available")

    # First get the player names
    name_query = {
        "size": 1,
        "query": {"term": {"match_id": match_id}},
        "_source": ["player_A", "player_B"]
    }
    try:
        name_resp = es_request("POST", f"/{ES_INDEX}/_search", name_query)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

    name_hits = name_resp.get("hits", {}).get("hits", [])
    if not name_hits:
        raise HTTPException(status_code=404, detail="Match not found")

    player_a = name_hits[0]["_source"]["player_A"]
    player_b = name_hits[0]["_source"]["player_B"]

    def build_player_aggs(player_name):
        return {
            "size": 0,
            "query": {"bool": {"filter": [{"term": {"match_id": match_id}}]}},
            "aggs": {
                "total_points_won": {
                    "filter": {"term": {"winner": player_name}}
                },
                "service_points": {
                    "filter": {"term": {"serveur": player_name}},
                    "aggs": {
                        "won": {"filter": {"term": {"winner": player_name}}},
                        "avg_rally": {"avg": {"field": "nb_coups"}}
                    }
                },
                "receive_points": {
                    "filter": {"bool": {"must_not": [{"term": {"serveur": player_name}}]}},
                    "aggs": {
                        "won": {"filter": {"term": {"winner": player_name}}},
                    }
                },
                "avg_rally_when_winning": {
                    "filter": {"term": {"winner": player_name}},
                    "aggs": {"avg_coups": {"avg": {"field": "nb_coups"}}}
                },
                "winning_shots": {
                    "filter": {"term": {"winner": player_name}},
                    "aggs": {"shots": {"terms": {"field": "dernier_coup", "size": 10}}}
                },
                "faults_committed": {
                    "filter": {"bool": {"must_not": [{"term": {"winner": player_name}}]}},
                    "aggs": {"types": {"terms": {"field": "faute_type", "size": 10}}}
                },
            }
        }

    def extract_stats(response, player_name, total):
        aggs = response.get("aggregations", {})
        points_won = aggs["total_points_won"]["doc_count"]
        svc = aggs["service_points"]
        rcv = aggs["receive_points"]

        svc_total = svc["doc_count"]
        svc_won = svc["won"]["doc_count"]
        rcv_total = rcv["doc_count"]
        rcv_won = rcv["won"]["doc_count"]

        avg_rally_win = aggs["avg_rally_when_winning"].get("avg_coups", {}).get("value", 0) or 0

        winning_shots = [
            {"shot": b["key"], "count": b["doc_count"]}
            for b in aggs["winning_shots"].get("shots", {}).get("buckets", [])
        ]
        faults = [
            {"type": b["key"], "count": b["doc_count"]}
            for b in aggs["faults_committed"].get("types", {}).get("buckets", [])
        ]

        return {
            "player": player_name,
            "points_won": points_won,
            "points_lost": total - points_won,
            "win_rate": round(points_won / total * 100, 1) if total > 0 else 0,
            "service_total": svc_total,
            "service_won": svc_won,
            "service_win_rate": round(svc_won / svc_total * 100, 1) if svc_total > 0 else 0,
            "receive_total": rcv_total,
            "receive_won": rcv_won,
            "receive_win_rate": round(rcv_won / rcv_total * 100, 1) if rcv_total > 0 else 0,
            "avg_rally_length_when_winning": round(avg_rally_win, 1),
            "avg_service_rally": round(svc.get("avg_rally", {}).get("value", 0) or 0, 1),
            "winning_shots": winning_shots,
            "faults": faults,
        }

    try:
        total_resp = es_request("POST", f"/{ES_INDEX}/_search", {
            "size": 0,
            "query": {"term": {"match_id": match_id}},
        })
        total = total_resp["hits"]["total"]["value"]

        resp_a = es_request("POST", f"/{ES_INDEX}/_search", build_player_aggs(player_a))
        resp_b = es_request("POST", f"/{ES_INDEX}/_search", build_player_aggs(player_b))
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

    return {
        "match_id": match_id,
        "total_points": total,
        "player_A": extract_stats(resp_a, player_a, total),
        "player_B": extract_stats(resp_b, player_b, total),
    }



