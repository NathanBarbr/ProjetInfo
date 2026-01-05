"""
Search router - Elasticsearch integration for point search
"""

import os
from typing import Optional, List
from pathlib import Path
from fastapi import APIRouter, HTTPException, Query, UploadFile, File
from elasticsearch import Elasticsearch
import pandas as pd
import json

router = APIRouter(prefix="/api/search", tags=["search"])

# Elasticsearch configuration
ES_HOST = os.getenv("ELASTICSEARCH_HOST", "http://localhost:9200")
ES_INDEX = "pingpong_points"

# Lazy connection to Elasticsearch
_es_client = None


def get_es_client() -> Elasticsearch:
    """Get or create Elasticsearch client."""
    global _es_client
    if _es_client is None:
        _es_client = Elasticsearch(ES_HOST)
    return _es_client


def check_es_connection() -> bool:
    """Check if Elasticsearch is available."""
    try:
        es = get_es_client()
        return es.ping()
    except Exception:
        return False


# Index mapping for points data
POINTS_MAPPING = {
    "mappings": {
        "properties": {
            "video_id": {"type": "keyword"},
            "set_number": {"type": "integer"},
            "point_number": {"type": "integer"},
            "clip_id": {"type": "keyword"},
            "winner": {"type": "keyword"},
            "score": {"type": "text"},
            "description": {"type": "text", "analyzer": "standard"},
            "tags": {"type": "keyword"},
            "duration_seconds": {"type": "float"},
            # Add more fields as needed based on the CSV structure
        }
    }
}


@router.get("/status")
async def get_search_status():
    """
    Check Elasticsearch connection status.
    """
    connected = check_es_connection()
    return {
        "elasticsearch": {
            "connected": connected,
            "host": ES_HOST,
            "index": ES_INDEX
        }
    }


@router.post("/index")
async def index_csv(file: UploadFile = File(...)):
    """
    Index a CSV file containing points data.
    The CSV should have columns matching the index mapping.
    """
    if not check_es_connection():
        raise HTTPException(
            status_code=503,
            detail="Elasticsearch is not available. Make sure Docker is running."
        )
    
    if not file.filename.endswith('.csv'):
        raise HTTPException(
            status_code=400,
            detail="File must be a CSV"
        )
    
    try:
        # Read CSV
        content = await file.read()
        df = pd.read_csv(pd.io.common.BytesIO(content))
        
        es = get_es_client()
        
        # Create index if it doesn't exist
        if not es.indices.exists(index=ES_INDEX):
            es.indices.create(index=ES_INDEX, body=POINTS_MAPPING)
        
        # Index documents
        indexed_count = 0
        for _, row in df.iterrows():
            doc = row.to_dict()
            # Convert NaN to None
            doc = {k: (None if pd.isna(v) else v) for k, v in doc.items()}
            
            es.index(index=ES_INDEX, document=doc)
            indexed_count += 1
        
        # Refresh index
        es.indices.refresh(index=ES_INDEX)
        
        return {
            "success": True,
            "indexed_count": indexed_count,
            "columns": list(df.columns)
        }
        
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"Error indexing CSV: {str(e)}"
        )


@router.get("")
async def search_points(
    q: str = Query(default="", description="Search query"),
    video_id: Optional[str] = Query(default=None, description="Filter by video"),
    set_number: Optional[int] = Query(default=None, description="Filter by set"),
    winner: Optional[str] = Query(default=None, description="Filter by point winner"),
    page: int = Query(default=1, ge=1, description="Page number"),
    size: int = Query(default=20, ge=1, le=100, description="Results per page"),
):
    """
    Search for points with filters.
    """
    if not check_es_connection():
        raise HTTPException(
            status_code=503,
            detail="Elasticsearch is not available"
        )
    
    es = get_es_client()
    
    # Check if index exists
    if not es.indices.exists(index=ES_INDEX):
        return {
            "results": [],
            "total": 0,
            "page": page,
            "size": size,
            "message": "No data indexed yet. Upload a CSV first."
        }
    
    # Build query
    must_clauses = []
    filter_clauses = []
    
    # Full-text search
    if q:
        must_clauses.append({
            "multi_match": {
                "query": q,
                "fields": ["description", "tags", "score", "winner"],
                "fuzziness": "AUTO"
            }
        })
    
    # Filters
    if video_id:
        filter_clauses.append({"term": {"video_id": video_id}})
    if set_number:
        filter_clauses.append({"term": {"set_number": set_number}})
    if winner:
        filter_clauses.append({"term": {"winner": winner}})
    
    # Build final query
    if must_clauses or filter_clauses:
        query = {
            "bool": {
                "must": must_clauses if must_clauses else [{"match_all": {}}],
                "filter": filter_clauses
            }
        }
    else:
        query = {"match_all": {}}
    
    # Execute search
    from_offset = (page - 1) * size
    
    try:
        response = es.search(
            index=ES_INDEX,
            query=query,
            from_=from_offset,
            size=size,
            sort=[
                {"set_number": "asc"},
                {"point_number": "asc"}
            ]
        )
        
        hits = response["hits"]["hits"]
        total = response["hits"]["total"]["value"]
        
        results = [
            {
                "id": hit["_id"],
                **hit["_source"]
            }
            for hit in hits
        ]
        
        return {
            "results": results,
            "total": total,
            "page": page,
            "size": size,
            "pages": (total + size - 1) // size
        }
        
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"Search error: {str(e)}"
        )


@router.delete("/index")
async def clear_index():
    """
    Clear all indexed data (for re-indexing).
    """
    if not check_es_connection():
        raise HTTPException(
            status_code=503,
            detail="Elasticsearch is not available"
        )
    
    es = get_es_client()
    
    try:
        if es.indices.exists(index=ES_INDEX):
            es.indices.delete(index=ES_INDEX)
        return {"success": True, "message": "Index cleared"}
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"Error clearing index: {str(e)}"
        )
