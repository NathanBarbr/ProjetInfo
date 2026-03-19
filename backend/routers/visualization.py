"""
Router pour la visualisation des embeddings.
Gère la réduction de dimension (PCA/t-SNE) pour l'affichage frontend.
"""

from fastapi import APIRouter, HTTPException, Query
from typing import List, Dict, Any, Optional
import numpy as np
import time
from sklearn.decomposition import PCA
# On pourrait utiliser TSNE aussi, mais c'est plus lent
# from sklearn.manifold import TSNE

from embeddings.indexer import ElasticSearchIndexer

router = APIRouter(prefix="/api/visualization", tags=["visualization"])
indexer = ElasticSearchIndexer()

from routers.search import build_es_query

CACHE_DURATION = 3600  # 1 heure
_cache = {
    "data": None,
    "timestamp": 0
}

@router.get("/embeddings")
async def get_embeddings_visualization(
    refresh: bool = False,
    method: str = Query("pca", regex="^(pca)$")
):
    """
    Récupère TOUS les points projetés en 2D pour la visualisation.
    Le filtrage se fera côté client pour maintenir la projection stable.
    """
    global _cache
    
    current_time = time.time()
    
    # Cache invalide si refresh=True ou timeout
    # On ne cache plus par filtre vu qu'on renvoie tout
    cache_valid = (
        not refresh and 
        _cache["data"] and 
        (current_time - _cache["timestamp"] < CACHE_DURATION)
    )
    
    if cache_valid:
        return _cache["data"]
    
    try:
        # 1. Récupérer TOUS les points (avec limite haute)
        if indexer.client is None:
            indexer.connect()
            
        response = indexer.client.search(
            index=indexer.INDEX_NAME,
            query={"match_all": {}}, # On récupère tout
            size=10000, 
            _source=[
                "embedding", 
                "match_id", "point_id", "video_id", # Keys
                "faute_type", "winner", "nb_coups", "score_A", "score_B", # Stats
                "description", "clip_path", # Content
                "serveur", "set_num", "winning_shot", "return_shot", # Filters
                "service_zone", "derniere_zone", "occupancy_zone", "movement_intensity", "rally_intensity"
            ]
        )
        
        hits = response["hits"]["hits"]
        points = []
        for hit in hits:
            if "embedding" in hit["_source"]:
                pt = hit["_source"]
                pt["_id"] = hit["_id"]
                points.append(pt)
        
        if not points:
            return {"points": [], "message": "No data found"}
            
        # 3. Préparer les données pour scikit-learn
        embeddings = []
        metadata = []
        
        for p in points:
            embeddings.append(p["embedding"])
            # On retire l'embedding des métadonnées
            meta = {k: v for k, v in p.items() if k != "embedding"}
            metadata.append(meta)
            
        X = np.array(embeddings)
        
        # 4. Réduction de dimension (PCA)
        # Si moins de 3 points, le PCA 3D peut être instable ou inutile
        if len(embeddings) < 3:
             result_points = []
             for i, meta in enumerate(metadata):
                 result_points.append({**meta, "x": 0, "y": 0, "z": 0})
        else:
            pca = PCA(n_components=3)
            X_3d = pca.fit_transform(X)
            
            result_points = []
            for i, coord in enumerate(X_3d):
                result_points.append({
                    **metadata[i],
                    "x": float(coord[0]),
                    "y": float(coord[1]),
                    "z": float(coord[2]),
                })
            
        response_data = {
            "points": result_points,
            "total": len(result_points),
            "generated_at": current_time
        }
        
        # Mettre en cache
        _cache["data"] = response_data
        _cache["timestamp"] = current_time
        
        return response_data
        
    except Exception as e:
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=f"Error generating visualization: {str(e)}")


@router.get("/zone-occupancy")
async def get_zone_occupancy(
    match_id: Optional[str] = Query(None, description="Filter by match"),
    set_num: Optional[int] = Query(None, description="Filter by set"),
    winner: Optional[str] = Query(None, description="Filter by winner"),
    serveur: Optional[str] = Query(None, description="Filter by server")
):
    """
    Aggregate zone occupation signals per player and set.
    Uses service_zone, derniere_zone and occupancy_zone.
    """
    try:
        if indexer.client is None:
            indexer.connect()

        filter_clauses = []
        if match_id:
            filter_clauses.append({"term": {"match_id": match_id}})
        if set_num is not None:
            filter_clauses.append({"term": {"set_num": set_num}})
        if winner:
            filter_clauses.append({"term": {"winner": winner}})
        if serveur:
            filter_clauses.append({"term": {"serveur": serveur}})

        query = {"bool": {"filter": filter_clauses}} if filter_clauses else {"match_all": {}}

        body = {
            "size": 0,
            "query": query,
            "aggs": {
                "players": {
                    "terms": {"field": "winner", "size": 20},
                    "aggs": {
                        "service_zones": {"terms": {"field": "service_zone", "size": 20}},
                        "end_zones": {"terms": {"field": "derniere_zone", "size": 20}},
                        "occupancy_zones": {"terms": {"field": "occupancy_zone", "size": 10}},
                        "sets": {"terms": {"field": "set_num", "size": 10, "order": {"_key": "asc"}}}
                    }
                }
            }
        }

        response = indexer.client.search(index=indexer.INDEX_NAME, body=body)
        buckets = response.get("aggregations", {}).get("players", {}).get("buckets", [])

        players = []
        for b in buckets:
            players.append({
                "player": b.get("key"),
                "total_points": b.get("doc_count", 0),
                "service_zones": [{"zone": z["key"], "count": z["doc_count"]} for z in b.get("service_zones", {}).get("buckets", [])],
                "end_zones": [{"zone": z["key"], "count": z["doc_count"]} for z in b.get("end_zones", {}).get("buckets", [])],
                "occupancy_zones": [{"zone": z["key"], "count": z["doc_count"]} for z in b.get("occupancy_zones", {}).get("buckets", [])],
                "sets": [{"set": int(s["key"]), "count": s["doc_count"]} for s in b.get("sets", {}).get("buckets", [])]
            })

        return {
            "match_id": match_id,
            "set_num": set_num,
            "winner": winner,
            "serveur": serveur,
            "players": players
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error generating zone occupancy: {str(e)}")
