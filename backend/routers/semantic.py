"""
Semantic Search Router - Vector-based search using embeddings.
Provides highlights mode and similar recommendations.
"""

import os
import numpy as np
from typing import Optional, List
from fastapi import APIRouter, HTTPException, Query

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

HIGHLIGHT_WEIGHTS = {
    "semantic_similarity": 0.30,
    "winner_bonus": 0.30,
    "rally_length": 0.20,
    "set_point": 0.10,
    "momentum": 0.10,
}

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
            "embedder_available": HAS_EMBEDDER
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


def momentum_proxy(point: dict) -> float:
    """
    Approximate momentum pressure from score context.
    Higher when score is tight and late in set.
    """
    score_a = int(point.get("score_A", 0) or 0)
    score_b = int(point.get("score_B", 0) or 0)
    tightness = 1.0 if abs(score_a - score_b) <= 1 else (0.6 if abs(score_a - score_b) <= 2 else 0.2)
    late_set = 1.0 if max(score_a, score_b) >= 9 else (0.6 if max(score_a, score_b) >= 7 else 0.2)
    return round(0.55 * tightness + 0.45 * late_set, 3)


def compute_highlight_score(point: dict, semantic_score: float) -> float:
    """
    Weighted highlight score:
    semantic + winning point + rally length + set-point + momentum pressure.
    """
    semantic_component = semantic_score / (1.0 + abs(semantic_score))
    winner_component = 1.0 if point.get("faute_type") == "pt_gagne" else 0.0
    rally_component = min(1.0, float(point.get("nb_coups", 0) or 0) / 12.0)
    set_point_component = 1.0 if point.get("is_set_point") else 0.0
    momentum_component = momentum_proxy(point)

    score = (
        HIGHLIGHT_WEIGHTS["semantic_similarity"] * semantic_component
        + HIGHLIGHT_WEIGHTS["winner_bonus"] * winner_component
        + HIGHLIGHT_WEIGHTS["rally_length"] * rally_component
        + HIGHLIGHT_WEIGHTS["set_point"] * set_point_component
        + HIGHLIGHT_WEIGHTS["momentum"] * momentum_component
    )
    return round(score, 4)


@router.get("/highlights")
async def search_highlights(
    k: int = Query(20, ge=1, le=100, description="Number of results"),
    match_id: Optional[str] = Query(None, description="Filter by match"),
    winner: Optional[str] = Query(None, description="Filter by winner"),
    serveur: Optional[str] = Query(None, description="Filter by server"),
    set_num: Optional[int] = Query(None, description="Filter by set number")
):
    """
    Search points sorted by similarity to "beautiful points" (highlights).
    
    Highlights are defined as:
    - Points gagnants (faute_type = pt_gagne) - winning shots, not opponent errors
    - Long rallies (nb_coups >= 5)
    
    Returns points most similar to this profile, with set-ending detection.
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
        
        # Search by highlight similarity
        results = indexer.search_by_highlight_similarity(
            k=k,
            filters=filters if filters else None
        )
        
        # Format, enrich, then rerank with highlight v2 scoring.
        points = []
        for r in results:
            point = {
                "id": r.get("_id"),
                "similarity_score": r.get("_score"),
                **{k: v for k, v in r.items() if not k.startswith("_")}
            }
            # Enrich with additional computed fields
            point = enrich_point_data(point)
            point["momentum_score"] = momentum_proxy(point)
            point["highlight_score"] = compute_highlight_score(point, float(point.get("similarity_score", 0) or 0))
            points.append(point)

        points.sort(key=lambda p: p.get("highlight_score", 0), reverse=True)
        
        return {
            "total": len(points),
            "mode": "highlights",
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
    service_zone: Optional[str] = Query(None),
    occupancy_zone: Optional[str] = Query(None, description="Dominant zone occupancy: left|middle|right"),
    movement_intensity_min: Optional[int] = Query(None, ge=0, description="Minimum movement intensity"),
    rally_intensity_min: Optional[float] = Query(None, ge=0, le=1, description="Minimum rally intensity (0-1)")
):
    """
    Perform a vector search based on a text query.
    """
    try:
        indexer = get_indexer()
        embedder = get_embedder()
        
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
        if occupancy_zone: filters["occupancy_zone"] = occupancy_zone
        
        query_embedding = embedder.embed_query(q)
        
        results = indexer.hybrid_search(
            query_embedding=query_embedding,
            text_query=q,
            k=k,
            filters=filters if filters else None,
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
            point["momentum_score"] = momentum_proxy(point)
            if movement_intensity_min is not None and int(point.get("movement_intensity", 0) or 0) < movement_intensity_min:
                continue
            if rally_intensity_min is not None and float(point.get("rally_intensity", 0) or 0) < rally_intensity_min:
                continue
            points.append(point)
        
        return {
            "total": len(points),
            "page": 1,
            "size": k,
            "pages": 1,
            "mode": "semantic",
            "points": points
        }
    except Exception as e:
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=f"Semantic search error: {str(e)}")
