"""
Chat router - RAG chatbot for point search using OpenAI
"""

import os
from typing import Optional, List
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from elasticsearch import Elasticsearch
from env_loader import get_backend_env, load_backend_env

load_backend_env()

router = APIRouter(prefix="/api/chat", tags=["chat"])

# Configuration
OPENAI_API_KEY = get_backend_env("OPENAI_API_KEY", "")
ES_HOST = os.getenv("ELASTICSEARCH_HOST", "http://localhost:9200")
ES_INDEX = "pingpong_points"


def get_openai_api_key() -> str:
    return get_backend_env("OPENAI_API_KEY", "")


class ChatMessage(BaseModel):
    role: str  # "user" or "assistant"
    content: str


class ChatRequest(BaseModel):
    message: str
    history: List[ChatMessage] = []


class PointResult(BaseModel):
    clip_id: str
    video_id: str
    set_number: int
    point_number: int
    description: str
    score: float


class ChatResponse(BaseModel):
    response: str
    points: List[dict] = []


def get_es_client() -> Elasticsearch:
    """Get Elasticsearch client."""
    return Elasticsearch(ES_HOST)


def search_points_by_description(query: str, limit: int = 5) -> List[dict]:
    """
    Search for points matching the description using Elasticsearch.
    """
    try:
        es = get_es_client()
        
        if not es.ping():
            return []
        
        if not es.indices.exists(index=ES_INDEX):
            return []
        
        # Full-text search
        response = es.search(
            index=ES_INDEX,
            query={
                "multi_match": {
                    "query": query,
                    "fields": ["description", "tags", "winner", "score"],
                    "fuzziness": "AUTO"
                }
            },
            size=limit
        )
        
        hits = response["hits"]["hits"]
        results = []
        for hit in hits:
            source = hit["_source"]
            results.append({
                "clip_id": source.get("clip_id", f"set_{source.get('set_number', 0)}_point_{source.get('point_number', 0)}"),
                "video_id": source.get("video_id", "fan-zhendong-vs-moregard"),
                "set_number": source.get("set_number", 0),
                "point_number": source.get("point_number", 0),
                "description": source.get("description", ""),
                "winner": source.get("winner", ""),
                "relevance_score": hit["_score"]
            })
        
        return results
        
    except Exception as e:
        print(f"Search error: {e}")
        return []


def generate_ai_response(message: str, history: List[ChatMessage], points: List[dict]) -> str:
    """
    Generate a response using OpenAI API with RAG context.
    """
    api_key = get_openai_api_key()
    if not api_key:
        # Fallback response without AI
        if points:
            point_texts = [
                f"• Set {p['set_number']}, Point {p['point_number']}: {p.get('description', 'No description')}"
                for p in points[:3]
            ]
            return f"J'ai trouvé {len(points)} point(s) correspondant à ta recherche:\n\n" + "\n".join(point_texts) + "\n\nClique sur un point pour le voir !"
        else:
            return "Je n'ai pas trouvé de points correspondant à ta description. Essaie avec d'autres mots-clés !"
    
    try:
        import openai
        
        client = openai.OpenAI(api_key=api_key)
        
        # Build context from found points
        context = ""
        if points:
            context = "Points trouvés dans la base:\n"
            for p in points:
                context += f"- Set {p['set_number']}, Point {p['point_number']}: {p.get('description', '')} (gagnant: {p.get('winner', 'N/A')})\n"
        
        # System prompt
        system_prompt = """Tu es un assistant spécialisé dans l'analyse de matchs de ping-pong. 
Tu aides les utilisateurs à trouver des points spécifiques dans les matchs.
Quand tu trouves des points, présente-les de manière concise et invite l'utilisateur à cliquer pour les voir.
Réponds toujours en français et sois amical."""
        
        # Build messages
        messages = [{"role": "system", "content": system_prompt}]
        
        # Add history
        for msg in history[-5:]:  # Keep last 5 messages for context
            messages.append({"role": msg.role, "content": msg.content})
        
        # Add current message with context
        user_message = message
        if context:
            user_message = f"{message}\n\nContexte (points trouvés):\n{context}"
        
        messages.append({"role": "user", "content": user_message})
        
        # Call OpenAI
        response = client.chat.completions.create(
            model="gpt-3.5-turbo",
            messages=messages,
            max_tokens=500,
            temperature=0.7
        )
        
        return response.choices[0].message.content
        
    except Exception:
        print("OpenAI error: request failed")
        # Fallback
        if points:
            return f"J'ai trouvé {len(points)} point(s) ! Clique dessus pour les voir."
        return "Désolé, je n'ai pas pu traiter ta demande. Réessaie !"


@router.post("", response_model=ChatResponse)
async def chat(request: ChatRequest):
    """
    Process a chat message and return AI response with matching points.
    """
    message = request.message.strip()
    
    if not message:
        raise HTTPException(status_code=400, detail="Message cannot be empty")
    
    # Search for relevant points
    points = search_points_by_description(message)
    
    # Generate AI response
    response = generate_ai_response(message, request.history, points)
    
    return ChatResponse(
        response=response,
        points=points
    )


@router.get("/status")
async def chat_status():
    """
    Check chat service status.
    """
    has_openai = bool(get_openai_api_key())
    
    # Check ES
    try:
        es = get_es_client()
        es_connected = es.ping()
    except:
        es_connected = False
    
    return {
        "openai_configured": has_openai,
        "elasticsearch_connected": es_connected,
        "ready": es_connected  # Can work without OpenAI (fallback mode)
    }
