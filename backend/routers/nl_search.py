from fastapi import APIRouter, HTTPException, Query
import requests
import json

from routers.search import build_es_query, es_request, ES_INDEX

router = APIRouter(prefix="/api/nl-search", tags=["nl-search"])

OLLAMA_URL = "http://localhost:11434/api/chat"
MODEL = "mistral:7b-instruct"   # recommandé pour structured output


# ==============================
# LLM PARSER
# ==============================

def parse_nl_query(query: str) -> dict:
    """
    Convert a natural language query into structured Elasticsearch filters.
    Uses Ollama chat endpoint for better JSON reliability.
    """

    try:
        response = requests.post(
            OLLAMA_URL,
            json={
                "model": MODEL,
                "messages": [
                    {
                        "role": "system",
                        "content": """
You extract structured filters from table tennis search queries.

STRICT RULES:
- Return ONLY valid JSON.
- Never return text.
- Never return a list.
- Do not invent fields.
- Use null when unknown.

NORMALIZATION:
- Replace dashes with spaces in player names.
- Use proper capitalization (Example: Hugo Calderano).

SEMANTIC RULE:
If the user asks for winning points, set:
"faute_type": "pt_gagne"
"""
                    },
                    {
                        "role": "user",
                        "content": f"""
Extract filters from this query:

{query}

Return EXACTLY this JSON structure:

{{
  "player": null,
  "winner": null,
  "serveur": null,
  "set_num": null,
  "nb_coups_min": null,
  "nb_coups_max": null,
  "effet": null,
  "lateralite": null,
  "faute_type": null,
  "winning_shot": null,
  "winning_shot_status": null,
  "zone": null,
  "service_zone": null,
  "service_lateralite": null,
  "q": null
}}
"""
                    }
                ],
                "temperature": 0,
                "format": "json",   # 🔥 FORCE JSON
                "stream": False
            },
            timeout=120
        )

        response.raise_for_status()

        output = response.json()["message"]["content"]

        # 🔥 LOG TEMPORAIRE (très utile en dev)
        print("LLM RAW OUTPUT:", output)

        filters = json.loads(output)

        # ==============================
        # SAFETY GUARDS
        # ==============================

        if isinstance(filters, str):
            filters = json.loads(filters)

        if isinstance(filters, list):
            filters = filters[0] if filters else {}

        if not isinstance(filters, dict):
            raise ValueError(f"Expected dict, got {type(filters)}")

        # 🔥 fallback intelligent
        if all(v is None for v in filters.values()):
            filters["q"] = query

        return filters

    except json.JSONDecodeError:
        raise ValueError(f"Ollama returned invalid JSON:\n{output}")

    except requests.RequestException as e:
        raise ValueError(f"Cannot connect to Ollama: {str(e)}")


# ==============================
# ROUTER
# ==============================

@router.get("")
async def nl_search(query: str = Query(..., description="Natural language query")):
    """
    Natural language search endpoint.
    Converts user query -> filters -> Elasticsearch.
    """

    try:
        filters = parse_nl_query(query)

        # 🔥 construit la query ES avec ton builder existant
        es_query = build_es_query(**filters)

        response = es_request(
            "POST",
            f"/{ES_INDEX}/_search",
            {
                "query": es_query,
                "size": 20
            }
        )

        hits = response.get("hits", {})
        total = hits.get("total", {}).get("value", 0)

        points = [
            {"id": hit["_id"], **hit["_source"]}
            for hit in hits.get("hits", [])
        ]

        return {
            "query": query,
            "interpreted_filters": filters,
            "total": total,
            "points": points
        }

    except ValueError as e:
        raise HTTPException(status_code=500, detail=str(e))

    except Exception as e:
        raise HTTPException(status_code=500, detail=f"NL search error: {str(e)}")
