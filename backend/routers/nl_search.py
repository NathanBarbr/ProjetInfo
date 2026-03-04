from fastapi import APIRouter, HTTPException, Query
import requests
import json

from routers.search import build_es_query, es_request, ES_INDEX

router = APIRouter(prefix="/api/nl-search", tags=["nl-search"])

OLLAMA_URL = "http://localhost:11434/api/chat"
MODEL = "mistral:7b-instruct"

ALLOWED_WINNING_SHOTS = {"topspin", "bloc", "poussette", "flip", "coupe"}
PLAYER_FIELDS = {"player", "winner", "serveur"}


def normalize_player_value(value: str | None) -> str | None:
    """Normalize player names to indexed format (e.g. TRULS-MOREGARD)."""
    if value is None:
        return None
    value = str(value).strip()
    if not value:
        return None
    return value.replace("_", "-").replace(" ", "-").upper()


def sanitize_filters(filters: dict, original_query: str) -> dict:
    """Validate and normalize LLM output to avoid false empty results."""
    expected_keys = {
        "player", "winner", "serveur", "set_num", "nb_coups_min", "nb_coups_max",
        "effet", "lateralite", "faute_type", "winning_shot", "winning_shot_status",
        "zone", "service_zone", "service_lateralite", "q"
    }

    sanitized = {k: filters.get(k) for k in expected_keys}

    for field in PLAYER_FIELDS:
        sanitized[field] = normalize_player_value(sanitized.get(field))

    winning_shot = sanitized.get("winning_shot")
    if isinstance(winning_shot, str):
        shot = winning_shot.strip().lower()
        sanitized["winning_shot"] = shot if shot in ALLOWED_WINNING_SHOTS else None
    else:
        sanitized["winning_shot"] = None

    # If user asks for "winning points", keep this broad and valid.
    if sanitized.get("faute_type") == "pt_gagne" and sanitized.get("winning_shot") is None:
        sanitized["winning_shot_status"] = "winner"

    has_structured = any(
        v is not None for k, v in sanitized.items() if k not in {"q", "winning_shot_status"}
    )
    if not has_structured and not sanitized.get("q"):
        sanitized["q"] = original_query

    return sanitized


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
- Keep player names in indexed format when possible (UPPERCASE with dashes), e.g. TRULS-MOREGARD.

SEMANTIC RULE:
If the user asks for winning points, set:
\"faute_type\": \"pt_gagne\"
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
                "format": "json",
                "stream": False
            },
            timeout=120
        )

        response.raise_for_status()

        output = response.json()["message"]["content"]
        print("LLM RAW OUTPUT:", output)

        filters = json.loads(output)

        if isinstance(filters, str):
            filters = json.loads(filters)

        if isinstance(filters, list):
            filters = filters[0] if filters else {}

        if not isinstance(filters, dict):
            raise ValueError(f"Expected dict, got {type(filters)}")

        return sanitize_filters(filters, query)

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
