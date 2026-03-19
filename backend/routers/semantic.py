"""
Semantic Search Router - Vector-based search using embeddings.
Provides highlights mode and similar recommendations.
"""

import os
import json
import math
import numpy as np
from collections import OrderedDict
from threading import Lock
from typing import Optional, List, Dict, Any
from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel, Field

# Import the indexer
import sys
from pathlib import Path
# Add parent directory to path for imports
sys.path.insert(0, str(Path(__file__).parent.parent))

try:
    from embeddings.indexer import ElasticSearchIndexer
    HAS_INDEXER = True
except ImportError:
    HAS_INDEXER = False
    print("[WARNING] Could not import ElasticSearchIndexer")

try:
    from embeddings.embedder import PointEmbedder
    HAS_EMBEDDER = True
except ImportError:
    HAS_EMBEDDER = False
    print("[WARNING] Could not import PointEmbedder")

router = APIRouter(prefix="/api/semantic", tags=["semantic-search"])

# Singleton indexer instance (lazy initialization)
_indexer: Optional[ElasticSearchIndexer] = None
_embedder: Optional[PointEmbedder] = None
_query_embedding_cache: "OrderedDict[str, np.ndarray]" = OrderedDict()
_semantic_search_cache: "OrderedDict[str, Dict[str, Any]]" = OrderedDict()
_CACHE_LIMIT = 20
_cache_lock = Lock()
_CACHE_DIR = Path(__file__).parent.parent / ".cache"
_CACHE_FILE = _CACHE_DIR / "semantic_cache.json"


class SketchSearchPayload(BaseModel):
    zones: List[str] = Field(default_factory=list, description="Ordered zone codes like g1,m2,d3")
    effets: List[str] = Field(default_factory=list, description="Ordered effects like service,poussette,topspin")
    top_k: int = Field(default=5, ge=1, le=20)


ZONE_COORDS: Dict[str, tuple[float, float]] = {
    "g1": (0.18, 0.20),
    "m1": (0.50, 0.20),
    "d1": (0.82, 0.20),
    "g2": (0.18, 0.50),
    "m2": (0.50, 0.50),
    "d2": (0.82, 0.50),
    "g3": (0.18, 0.80),
    "m3": (0.50, 0.80),
    "d3": (0.82, 0.80),
}


def _make_cache_key(payload: Dict[str, Any]) -> str:
    return json.dumps(payload, sort_keys=True, ensure_ascii=True)


def _prune_caches_locked() -> None:
    while len(_query_embedding_cache) > _CACHE_LIMIT:
        _query_embedding_cache.popitem(last=False)
    while len(_semantic_search_cache) > _CACHE_LIMIT:
        _semantic_search_cache.popitem(last=False)


def _save_cache_to_disk_locked() -> None:
    _CACHE_DIR.mkdir(parents=True, exist_ok=True)
    payload = {
        "query_embeddings": [
            {"key": key, "value": value.tolist()}
            for key, value in _query_embedding_cache.items()
        ],
        "semantic_searches": [
            {"key": key, "value": value}
            for key, value in _semantic_search_cache.items()
        ],
    }
    with _CACHE_FILE.open("w", encoding="utf-8") as handle:
        json.dump(payload, handle)


def _load_cache_from_disk() -> None:
    if not _CACHE_FILE.exists():
        return

    try:
        with _CACHE_FILE.open("r", encoding="utf-8") as handle:
            payload = json.load(handle)
    except (OSError, json.JSONDecodeError):
        return

    with _cache_lock:
        _query_embedding_cache.clear()
        for item in payload.get("query_embeddings", []):
            key = item.get("key")
            value = item.get("value")
            if isinstance(key, str) and isinstance(value, list):
                _query_embedding_cache[key] = np.array(value, dtype=float)

        _semantic_search_cache.clear()
        for item in payload.get("semantic_searches", []):
            key = item.get("key")
            value = item.get("value")
            if isinstance(key, str) and isinstance(value, dict):
                _semantic_search_cache[key] = value

        _prune_caches_locked()


def _get_cached_embedding(cache_key: str) -> Optional[np.ndarray]:
    with _cache_lock:
        cached = _query_embedding_cache.get(cache_key)
        if cached is None:
            return None
        _query_embedding_cache.move_to_end(cache_key)
        _save_cache_to_disk_locked()
        return cached.copy()


def _store_cached_embedding(cache_key: str, embedding: np.ndarray) -> None:
    with _cache_lock:
        _query_embedding_cache[cache_key] = embedding.copy()
        _query_embedding_cache.move_to_end(cache_key)
        _prune_caches_locked()
        _save_cache_to_disk_locked()


def _get_cached_search(cache_key: str) -> Optional[Dict[str, Any]]:
    with _cache_lock:
        cached = _semantic_search_cache.get(cache_key)
        if cached is None:
            return None
        _semantic_search_cache.move_to_end(cache_key)
        _save_cache_to_disk_locked()
        return json.loads(json.dumps(cached))


def _store_cached_search(cache_key: str, payload: Dict[str, Any]) -> None:
    with _cache_lock:
        _semantic_search_cache[cache_key] = json.loads(json.dumps(payload))
        _semantic_search_cache.move_to_end(cache_key)
        _prune_caches_locked()
        _save_cache_to_disk_locked()

def get_indexer() -> ElasticSearchIndexer:
    """Get or create the ElasticSearchIndexer singleton."""
    global _indexer
    if _indexer is None:
        if not HAS_INDEXER:
            raise HTTPException(
                status_code=500,
                detail="ElasticSearchIndexer not available"
            )
        _indexer = ElasticSearchIndexer(
            host=os.getenv("ELASTICSEARCH_HOST", "http://localhost:9200")
        )
        _indexer.connect()
    return _indexer

def get_embedder() -> PointEmbedder:
    """Get or create the PointEmbedder singleton."""
    global _embedder
    if _embedder is None:
        if not HAS_EMBEDDER:
            raise HTTPException(
                status_code=500,
                detail="PointEmbedder not available"
            )
        _embedder = PointEmbedder()
        _embedder.load_model()
    return _embedder


_load_cache_from_disk()

@router.get("/status")
async def get_semantic_status():
    """
    Check semantic search status (embeddings index).
    """
    try:
        indexer = get_indexer()
        stats = indexer.get_stats()
        return {
            "available": True,
            "index": indexer.INDEX_NAME,
            "stats": stats,
            "embedder_available": HAS_EMBEDDER,
            "cache": {
                "max_entries": _CACHE_LIMIT,
                "persistent": True,
                "file": str(_CACHE_FILE),
                "query_embeddings": len(_query_embedding_cache),
                "semantic_searches": len(_semantic_search_cache),
            }
        }
    except Exception as e:
        return {
            "available": False,
            "error": str(e)
        }


def is_set_point(score_a: int, score_b: int, winner: str, player_a: str) -> bool:
    """
    Détecte si ce point est un point de fin de set.
    
    En tennis de table, un set se termine à 11 points avec au moins 2 points d'écart.
    
    Args:
        score_a: Score du joueur A APRÈS le point
        score_b: Score du joueur B APRÈS le point
        winner: Gagnant du point
        player_a: Nom du joueur A
        
    Returns:
        True si c'est un point de fin de set
    """
    # Le gagnant a marqué, donc son score après ce point doit être vérifié
    if winner == player_a:
        # Player A a gagné ce point, donc score_a est son score actuel
        return score_a >= 11 and (score_a - score_b) >= 2
    else:
        # Player B a gagné ce point
        return score_b >= 11 and (score_b - score_a) >= 2


def enrich_point_data(point: dict) -> dict:
    """
    Enrichit les données d'un point avec des informations supplémentaires.
    
    - is_set_point: True si c'est un point de fin de set
    - is_point_gagnant: True si c'est un coup gagnant (pas une faute adverse)
    """
    # Détection de fin de set
    score_a = point.get("score_A", 0) or 0
    score_b = point.get("score_B", 0) or 0
    winner = point.get("winner", "")
    player_a = point.get("player_A", "")
    
    point["is_set_point"] = is_set_point(score_a, score_b, winner, player_a)
    
    # Détection de point gagnant (coup gagnant, pas faute adverse)
    point["is_point_gagnant"] = point.get("faute_type") == "pt_gagne"
    
    return point


def _split_sequence(value: Any) -> List[str]:
    if not value:
        return []
    if isinstance(value, list):
        return [str(item).strip() for item in value if str(item).strip()]
    return [item.strip() for item in str(value).split(",") if item.strip()]


def _zone_distance(left: str, right: str) -> float:
    if left == right:
        return 0.0

    left_coord = ZONE_COORDS.get(left)
    right_coord = ZONE_COORDS.get(right)
    if left_coord is None or right_coord is None:
        return 1.0

    dx = left_coord[0] - right_coord[0]
    dy = left_coord[1] - right_coord[1]
    return min(1.0, math.sqrt(dx * dx + dy * dy) / math.sqrt(2.0))


def _effect_distance(left: str, right: str) -> float:
    if not left and not right:
        return 0.0
    if left == right:
        return 0.0
    if not left or not right:
        return 0.65
    return 1.0


def sketch_sequence_distance(
    query_zones: List[str],
    query_effets: List[str],
    candidate_zones: List[str],
    candidate_effets: List[str],
) -> float:
    query_len = len(query_zones)
    candidate_len = len(candidate_zones)
    if query_len == 0 or candidate_len == 0:
        return float(max(query_len, candidate_len))

    dp = [[0.0] * (candidate_len + 1) for _ in range(query_len + 1)]
    for i in range(1, query_len + 1):
        dp[i][0] = float(i)
    for j in range(1, candidate_len + 1):
        dp[0][j] = float(j)

    for i in range(1, query_len + 1):
        for j in range(1, candidate_len + 1):
            zone_cost = _zone_distance(query_zones[i - 1], candidate_zones[j - 1])
            effect_cost = _effect_distance(
                query_effets[i - 1] if i - 1 < len(query_effets) else "",
                candidate_effets[j - 1] if j - 1 < len(candidate_effets) else "",
            )
            substitute_cost = 0.7 * zone_cost + 0.3 * effect_cost
            dp[i][j] = min(
                dp[i - 1][j] + 0.9,
                dp[i][j - 1] + 0.9,
                dp[i - 1][j - 1] + substitute_cost,
            )

    return dp[query_len][candidate_len]


def sketch_similarity_score(
    query_zones: List[str],
    query_effets: List[str],
    candidate_zones: List[str],
    candidate_effets: List[str],
) -> float:
    normalizer = max(len(query_zones), len(candidate_zones), 1)
    distance = sketch_sequence_distance(
        query_zones=query_zones,
        query_effets=query_effets,
        candidate_zones=candidate_zones,
        candidate_effets=candidate_effets,
    )
    similarity = max(0.0, 1.0 - (distance / normalizer))
    length_penalty = abs(len(query_zones) - len(candidate_zones)) / normalizer
    return max(0.0, similarity - 0.1 * length_penalty)


@router.get("/highlights")
async def search_highlights(
    k: int = Query(20, ge=1, le=100, description="Number of results"),
    match_id: Optional[str] = Query(None, description="Filter by match"),
    winner: Optional[str] = Query(None, description="Filter by winner"),
    serveur: Optional[str] = Query(None, description="Filter by server"),
    set_num: Optional[int] = Query(None, description="Filter by set number"),
    duration_weight: Optional[float] = Query(None, ge=0, description="Weight for point duration"),
    rally_depth_weight: Optional[float] = Query(None, ge=0, description="Weight for rally depth"),
    effects_variety_weight: Optional[float] = Query(None, ge=0, description="Weight for effects variety"),
    laterality_variety_weight: Optional[float] = Query(None, ge=0, description="Weight for laterality variety"),
    zone_variety_weight: Optional[float] = Query(None, ge=0, description="Weight for zone variety"),
    finish_weight: Optional[float] = Query(None, ge=0, description="Weight for point finish quality"),
    pressure_weight: Optional[float] = Query(None, ge=0, description="Weight for score pressure")
):
    """
    Search highlights using an explicit score built from rally quality.

    The score prioritizes rally duration, sequence variety, finish quality,
    and score pressure instead of relying only on shot count.
    """
    try:
        indexer = get_indexer()
        
        # Build filters dict
        filters = {}
        if match_id:
            filters["match_id"] = match_id
        if winner:
            filters["winner"] = winner
        if serveur:
            filters["serveur"] = serveur
        if set_num:
            filters["set_num"] = set_num

        highlight_weights = {
            "duration": duration_weight,
            "rally_depth": rally_depth_weight,
            "effects_variety": effects_variety_weight,
            "laterality_variety": laterality_variety_weight,
            "zone_variety": zone_variety_weight,
            "finish": finish_weight,
            "pressure": pressure_weight,
        }
        highlight_weights = {
            key: value for key, value in highlight_weights.items() if value is not None
        }

        # Search by explicit highlight score
        results = indexer.search_highlights(
            k=k,
            filters=filters if filters else None,
            weights=highlight_weights if highlight_weights else None
        )
        
        # Format and enrich results
        points = []
        for r in results:
            point = {
                "id": r.get("_id"),
                "highlight_score": r.get("highlight_score", r.get("_score")),
                **{k: v for k, v in r.items() if not k.startswith("_")}
            }
            # Enrich with additional computed fields
            point = enrich_point_data(point)
            points.append(point)
        
        return {
            "total": len(points),
            "mode": "highlights",
            "applied_weights": indexer.resolve_highlight_weights(highlight_weights),
            "points": points
        }
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Semantic search error: {str(e)}")


@router.get("/similar")
async def search_similar(
    reference_ids: str = Query(..., description="Comma-separated list of reference document IDs"),
    exclude_ids: Optional[str] = Query(None, description="Comma-separated list of IDs to exclude"),
    k: int = Query(6, ge=1, le=20, description="Number of recommendations")
):
    """
    Find points similar to the reference points, excluding specified IDs.
    
    Used for "You might also like..." recommendations after filtering.
    
    Args:
        reference_ids: IDs of points to use as reference for similarity
        exclude_ids: IDs to exclude from results (e.g., already shown points)
        k: Number of recommendations to return
    """
    try:
        indexer = get_indexer()
        
        # Parse IDs
        ref_ids = [id.strip() for id in reference_ids.split(",") if id.strip()]
        excl_ids = []
        if exclude_ids:
            excl_ids = [id.strip() for id in exclude_ids.split(",") if id.strip()]
        
        if not ref_ids:
            raise HTTPException(status_code=400, detail="No reference IDs provided")
        
        # Get embeddings for reference documents
        embeddings = indexer.get_documents_embeddings(ref_ids)
        
        if not embeddings:
            raise HTTPException(status_code=404, detail="No embeddings found for reference IDs")
        
        # Calculate average embedding
        avg_embedding = np.mean(embeddings, axis=0)
        
        # Search for similar, excluding specified IDs
        results = indexer.search_similar_excluding(
            query_embedding=avg_embedding,
            exclude_ids=excl_ids,
            k=k
        )
        
        # Format results
        recommendations = []
        for r in results:
            point = {
                "id": r.get("_id"),
                "similarity_score": r.get("_score"),
                **{k: v for k, v in r.items() if not k.startswith("_")}
            }
            recommendations.append(point)
        
        return {
            "total": len(recommendations),
            "reference_count": len(ref_ids),
            "recommendations": recommendations
        }
        
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Similar search error: {str(e)}")


@router.get("/point/{doc_id}/similar")
async def get_point_similar(
    doc_id: str,
    k: int = Query(6, ge=1, le=20, description="Number of similar points")
):
    """
    Find points similar to a specific point.
    
    Useful for "More like this" functionality.
    """
    try:
        indexer = get_indexer()
        
        # Get embedding for the document
        embeddings = indexer.get_documents_embeddings([doc_id])
        
        if not embeddings:
            raise HTTPException(status_code=404, detail=f"Document not found: {doc_id}")
        
        # Search for similar, excluding the original
        results = indexer.search_similar_excluding(
            query_embedding=embeddings[0],
            exclude_ids=[doc_id],
            k=k
        )
        
        # Format results
        similar_points = []
        for r in results:
            point = {
                "id": r.get("_id"),
                "similarity_score": r.get("_score"),
                **{k: v for k, v in r.items() if not k.startswith("_")}
            }
            similar_points.append(point)
        
        return {
            "reference_id": doc_id,
            "similar": similar_points
        }
        
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error finding similar points: {str(e)}")

@router.get("/search")
async def text_semantic_search(
    q: str = Query(..., description="Text query to embed"),
    k: int = Query(20, ge=1, le=100, description="Number of results"),
    match_id: Optional[str] = Query(None),
    winner: Optional[str] = Query(None),
    serveur: Optional[str] = Query(None),
    set_num: Optional[int] = Query(None),
    faute_type: Optional[str] = Query(None),
    winning_shot: Optional[str] = Query(None),
    service_lateralite: Optional[str] = Query(None),
    service_zone: Optional[str] = Query(None)
):
    """
    Perform a vector search based on a text query.
    """
    try:
        indexer = get_indexer()

        # Build filters dict
        filters = {}
        if match_id: filters["match_id"] = match_id
        if winner: filters["winner"] = winner
        if serveur: filters["serveur"] = serveur
        if set_num: filters["set_num"] = set_num
        if faute_type: filters["faute_type"] = faute_type
        if winning_shot: filters["dernier_coup"] = winning_shot
        if service_lateralite: filters["service_lateralite"] = service_lateralite
        if service_zone: filters["service_zone"] = service_zone

        normalized_filters = filters if filters else None
        search_cache_key = _make_cache_key({
            "q": q.strip(),
            "k": k,
            "filters": normalized_filters or {}
        })
        cached_response = _get_cached_search(search_cache_key)
        if cached_response is not None:
            cached_response["cache_hit"] = True
            return cached_response

        embedder = get_embedder()
        embedding_cache_key = _make_cache_key({"q": q.strip()})
        query_embedding = _get_cached_embedding(embedding_cache_key)
        if query_embedding is None:
            query_embedding = embedder.embed_query(q)
            _store_cached_embedding(embedding_cache_key, query_embedding)

        results = indexer.hybrid_search(
            query_embedding=query_embedding,
            text_query=q,
            k=k,
            filters=normalized_filters,
            vector_weight=0.7 # Combine text and vector similarity
        )
        
        # Format and enrich results
        points = []
        for r in results:
            point = {
                "id": r.get("_id"),
                "similarity_score": r.get("_score"),
                **{k: v for k, v in r.items() if not k.startswith("_")}
            }
            # Enrich with additional computed fields
            point = enrich_point_data(point)
            points.append(point)
        
        response_payload = {
            "total": len(points),
            "page": 1,
            "size": k,
            "pages": 1,
            "mode": "semantic",
            "points": points,
            "cache_hit": False
        }
        _store_cached_search(search_cache_key, response_payload)
        return response_payload
    except Exception as e:
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=f"Semantic search error: {str(e)}")


@router.post("/sketch-search")
async def sketch_search(payload: SketchSearchPayload):
    """
    Find the closest indexed point to a user-drawn trajectory.
    """
    query_zones = _split_sequence(payload.zones)
    query_effets = _split_sequence(payload.effets)

    if not query_zones:
        raise HTTPException(status_code=400, detail="At least one zone is required")

    try:
        indexer = get_indexer()
        total_docs = indexer.client.count(index=indexer.INDEX_NAME).get("count", 0)
        fetch_size = min(max(total_docs, 1), 5000)
        response = indexer.client.search(
            index=indexer.INDEX_NAME,
            size=fetch_size,
            query={"match_all": {}},
            _source=[
                "match_id",
                "point_id",
                "clip_path",
                "winner",
                "serveur",
                "player_A",
                "player_B",
                "sequence_zones",
                "sequence_effets",
                "description",
                "faute_type",
                "nb_coups",
                "score_A",
                "score_B",
            ],
        )

        matches: List[Dict[str, Any]] = []
        for hit in response.get("hits", {}).get("hits", []):
            source = hit.get("_source", {})
            candidate_zones = _split_sequence(source.get("sequence_zones"))
            if not candidate_zones:
                continue

            candidate_effets = _split_sequence(source.get("sequence_effets"))
            similarity = sketch_similarity_score(
                query_zones=query_zones,
                query_effets=query_effets,
                candidate_zones=candidate_zones,
                candidate_effets=candidate_effets,
            )

            point = {
                "id": hit.get("_id"),
                "similarity_score": round(similarity, 4),
                **source,
            }
            matches.append(enrich_point_data(point))

        matches.sort(
            key=lambda item: (
                -float(item.get("similarity_score", 0.0)),
                abs(len(_split_sequence(item.get("sequence_zones"))) - len(query_zones)),
                str(item.get("match_id", "")),
                int(item.get("point_id", 0) or 0),
            )
        )
        top_matches = matches[: payload.top_k]

        return {
            "query": {
                "zones": query_zones,
                "effets": query_effets,
            },
            "total_candidates": len(matches),
            "best_match": top_matches[0] if top_matches else None,
            "matches": top_matches,
        }
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Sketch search error: {str(e)}")
