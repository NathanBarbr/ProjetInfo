"""
Search router - Elasticsearch integration for point search
"""

import os
import json
import re
import logging
from collections import Counter
from difflib import SequenceMatcher
from typing import Any, Dict, Optional, List
from urllib.request import Request, urlopen
from urllib.error import URLError, HTTPError
from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel, Field
from env_loader import get_backend_env, load_backend_env

load_backend_env()

router = APIRouter(prefix="/api/search", tags=["search"])
logger = logging.getLogger(__name__)

# Elasticsearch configuration
ES_HOST = os.getenv("ELASTICSEARCH_HOST", "http://localhost:9200")
ES_INDEX = "pingpong_points"
OPENAI_API_KEY = get_backend_env("OPENAI_API_KEY", "")
OPENAI_MODEL = get_backend_env("OPENAI_MODEL", "gpt-4o-mini") or "gpt-4o-mini"


def get_openai_api_key() -> str:
    return get_backend_env("OPENAI_API_KEY", "")


def get_openai_model() -> str:
    return get_backend_env("OPENAI_MODEL", "gpt-4o-mini") or "gpt-4o-mini"


class LlmFilterPayload(BaseModel):
    match_id: Optional[str] = None
    player: Optional[str] = None
    winner: Optional[str] = None
    serveur: Optional[str] = None
    set_num: Optional[int] = Field(default=None, ge=1, le=7)
    nb_coups_min: Optional[int] = Field(default=None, ge=0)
    nb_coups_max: Optional[int] = Field(default=None, ge=0)
    duree_min: Optional[int] = Field(default=None, ge=0)
    duree_max: Optional[int] = Field(default=None, ge=0)
    effet: Optional[str] = None
    lateralite: Optional[str] = None
    faute_type: Optional[str] = None
    winning_shot: Optional[str] = None
    winning_shot_status: Optional[str] = Field(default=None, pattern="^(winner|error)$")
    zone: Optional[str] = None
    service_zone: Optional[str] = None
    service_lateralite: Optional[str] = None


class LlmSearchPlan(BaseModel):
    filters: LlmFilterPayload = Field(default_factory=LlmFilterPayload)
    sort: Optional[str] = Field(
        default=None,
        pattern="^(chronological|longest|shortest|most_shots|least_shots|winners|errors)$"
    )
    reasoning: Optional[str] = None


class LlmFilterChange(BaseModel):
    key: str
    label: str
    value: Any = None
    previous_value: Any = None
    change_type: str


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


def _split_sequence_tokens(value: Any) -> List[str]:
    if value in (None, ""):
        return []
    if isinstance(value, list):
        return [str(item).strip() for item in value if str(item).strip()]
    return [token.strip() for token in str(value).split(",") if token.strip()]


def infer_point_winner(point: Dict[str, Any]) -> str:
    player_a = str(point.get("player_A", "") or "")
    player_b = str(point.get("player_B", "") or "")
    winner = str(point.get("winner", "") or "")
    if winner in {player_a, player_b}:
        return winner

    serveur = str(point.get("serveur", "") or "")
    sequence_tokens = _split_sequence_tokens(point.get("sequence_coups", ""))
    if sequence_tokens:
        last_token = sequence_tokens[-1]
        if last_token == "serveur_point_pour" and serveur in {player_a, player_b}:
            return serveur
        if last_token == "serveur_point_contre":
            if serveur == player_a:
                return player_b
            if serveur == player_b:
                return player_a

        player_tokens = [token for token in sequence_tokens if token in {player_a, player_b}]
        if player_tokens:
            last_player = player_tokens[-1]
            faute_type = str(point.get("faute_type", "") or "")
            if faute_type == "pt_gagne":
                return last_player
            if faute_type in {"out", "filet"}:
                if last_player == player_a:
                    return player_b
                if last_player == player_b:
                    return player_a

    return winner


def extract_json_object(content: str) -> dict:
    """Extract a JSON object from a model response."""
    text = content.strip()
    if text.startswith("```"):
        lines = [line for line in text.splitlines() if not line.strip().startswith("```")]
        text = "\n".join(lines).strip()

    start = text.find("{")
    end = text.rfind("}")
    if start == -1 or end == -1 or end < start:
        raise ValueError("No JSON object found in model response")

    return json.loads(text[start:end + 1])


def get_openai_client():
    """Create the OpenAI client lazily."""
    api_key = get_openai_api_key()
    if not api_key:
        raise HTTPException(status_code=503, detail="OPENAI_API_KEY is not configured")

    import openai

    return openai.OpenAI(api_key=api_key)


def get_filter_label(key: str) -> str:
    labels = {
        "match_id": "Match",
        "player": "Joueur",
        "winner": "Gagnant",
        "serveur": "Serveur",
        "set_num": "Set",
        "nb_coups_min": "Coups min",
        "nb_coups_max": "Coups max",
        "duree_min": "Durée min",
        "duree_max": "Durée max",
        "effet": "Effet",
        "lateralite": "Latéralité",
        "faute_type": "Faute",
        "winning_shot": "Dernier coup",
        "winning_shot_status": "Type de point",
        "zone": "Zone",
        "service_zone": "Zone de service",
        "service_lateralite": "Main de service",
    }
    return labels.get(key, key)


def get_search_vocab() -> Dict[str, List[str]]:
    """Fetch small vocab lists from Elasticsearch for local LLM parsing fallback."""
    aggs_body = {
        "size": 0,
        "aggs": {
            "matches": {"terms": {"field": "match_id", "size": 20}},
            "players_A": {"terms": {"field": "player_A", "size": 20}},
            "players_B": {"terms": {"field": "player_B", "size": 20}},
            "winners": {"terms": {"field": "winner", "size": 20}},
            "serveurs": {"terms": {"field": "serveur", "size": 20}},
            "shots": {"terms": {"field": "dernier_coup", "size": 20}},
            "faults": {"terms": {"field": "faute_type", "size": 20}},
            "service_zones": {"terms": {"field": "service_zone", "size": 20}},
            "service_lateralites": {"terms": {"field": "service_lateralite", "size": 10}},
        }
    }
    response = es_request("POST", f"/{ES_INDEX}/_search", aggs_body)
    aggs = response.get("aggregations", {})

    players = {
        bucket["key"] for bucket in aggs.get("players_A", {}).get("buckets", [])
    } | {
        bucket["key"] for bucket in aggs.get("players_B", {}).get("buckets", [])
    }

    return {
        "matches": [bucket["key"] for bucket in aggs.get("matches", {}).get("buckets", [])],
        "players": sorted(players),
        "winners": [bucket["key"] for bucket in aggs.get("winners", {}).get("buckets", [])],
        "serveurs": [bucket["key"] for bucket in aggs.get("serveurs", {}).get("buckets", [])],
        "shots": [bucket["key"] for bucket in aggs.get("shots", {}).get("buckets", [])],
        "faults": [bucket["key"] for bucket in aggs.get("faults", {}).get("buckets", [])],
        "service_zones": [bucket["key"] for bucket in aggs.get("service_zones", {}).get("buckets", [])],
        "service_lateralites": [bucket["key"] for bucket in aggs.get("service_lateralites", {}).get("buckets", [])],
    }


def normalize_query_text(value: str) -> str:
    return " ".join(value.lower().replace("_", " ").replace("-", " ").split())


def find_best_vocab_match(query_text: str, values: List[str]) -> Optional[str]:
    normalized_query = normalize_query_text(query_text)
    best_value: Optional[str] = None
    best_score = 0.0

    for value in values:
        normalized_value = normalize_query_text(value)
        if not normalized_value:
            continue
        score = 0.0
        if normalized_value in normalized_query:
            score += 8
        if all(token in normalized_query for token in normalized_value.split()):
            score += 6
        score += SequenceMatcher(None, normalized_query, normalized_value).ratio() * 2
        if score > best_score:
            best_score = score
            best_value = value

    return best_value if best_score >= 4 else None


def canonicalize_filter_value(key: str, value: Any, vocab: Dict[str, List[str]]) -> Any:
    if value in (None, ""):
        return value

    text_value = str(value).strip()
    if not text_value:
        return value

    if key == "player":
        return find_best_vocab_match(text_value, vocab.get("players", [])) or text_value
    if key == "winner":
        return (
            find_best_vocab_match(text_value, vocab.get("winners", []))
            or find_best_vocab_match(text_value, vocab.get("players", []))
            or text_value
        )
    if key == "serveur":
        return (
            find_best_vocab_match(text_value, vocab.get("serveurs", []))
            or find_best_vocab_match(text_value, vocab.get("players", []))
            or text_value
        )
    if key == "winning_shot":
        return find_best_vocab_match(text_value, vocab.get("shots", [])) or text_value
    if key == "faute_type":
        return find_best_vocab_match(text_value, vocab.get("faults", [])) or text_value
    if key == "service_zone":
        return find_best_vocab_match(text_value, vocab.get("service_zones", [])) or text_value
    if key == "service_lateralite":
        return find_best_vocab_match(text_value, vocab.get("service_lateralites", [])) or text_value
    if key == "match_id":
        return find_best_vocab_match(text_value, vocab.get("matches", [])) or text_value

    if key in {"winning_shot_status", "lateralite", "service_lateralite", "effet", "zone"}:
        return text_value.lower()

    return value


def canonicalize_filters(filters: Dict[str, Any], vocab: Dict[str, List[str]]) -> Dict[str, Any]:
    return {
        key: canonicalize_filter_value(key, value, vocab)
        for key, value in filters.items()
    }


def parse_local_search_query(query_text: str, vocab: Dict[str, List[str]]) -> LlmSearchPlan:
    """Fallback deterministic parser when OpenAI is unavailable or fails."""
    logger.debug("LLM local fallback parser invoked for query=%r", query_text)
    text = normalize_query_text(query_text)
    filters: Dict[str, Any] = {}
    reasons: List[str] = []

    match_set = re.search(r"\b(?:set|manche)\s*(\d+)\b", text)
    if match_set:
        filters["set_num"] = int(match_set.group(1))
        reasons.append(f"set {match_set.group(1)}")

    match_shots_min = re.search(r"\b(?:at least|minimum|min|au moins)\s*(\d+)\s*(?:shots|coups)\b", text)
    if match_shots_min:
        filters["nb_coups_min"] = int(match_shots_min.group(1))
        reasons.append(f"{match_shots_min.group(1)} coups minimum")

    match_shots_max = re.search(r"\b(?:at most|maximum|max|au plus)\s*(\d+)\s*(?:shots|coups)\b", text)
    if match_shots_max:
        filters["nb_coups_max"] = int(match_shots_max.group(1))
        reasons.append(f"{match_shots_max.group(1)} coups maximum")

    match_shots_exact = re.search(
        r"\b(?:en|with|in|exactement|exactly)?\s*(\d+)\s*(?:shots|coups|echange|echanges|échange|échanges)\b",
        text
    )
    if match_shots_exact and "nb_coups_min" not in filters and "nb_coups_max" not in filters:
        exact_shots = int(match_shots_exact.group(1))
        filters["nb_coups_min"] = exact_shots
        filters["nb_coups_max"] = exact_shots
        reasons.append(f"{exact_shots} coups")

    if any(term in text for term in ["long rally", "long rallies", "long exchange", "long exchanges", "long point", "long points", "long échange", "long echange", "échange long", "echanges longs", "échanges longs"]):
        filters.setdefault("nb_coups_min", 5)
        reasons.append("échange long")

    if any(term in text for term in ["short rally", "short exchange", "quick point", "service winner", "ace", "échange court", "echange court"]):
        filters.setdefault("nb_coups_max", 3)
        reasons.append("échange court")

    if any(term in text for term in ["winner", "winning point", "point gagnant", "points gagnants"]):
        filters["winning_shot_status"] = "winner"
        reasons.append("point gagnant")

    if any(term in text for term in ["error", "fault", "faute", "mistake", "forced error", "unforced error"]):
        filters["winning_shot_status"] = "error"
        reasons.append("fin sur faute")

    if any(term in text for term in ["backhand", "revers", "reverss"]):
        filters["lateralite"] = "revers"
        reasons.append("revers")
    elif any(term in text for term in ["forehand", "coup droit"]):
        filters["lateralite"] = "coup_droit"
        reasons.append("coup droit")

    if any(term in text for term in ["service backhand", "serve revers", "service revers"]):
        filters["service_lateralite"] = "revers"
        reasons.append("service revers")
    elif any(term in text for term in ["service forehand", "serve coup droit", "service coup droit"]):
        filters["service_lateralite"] = "coup_droit"
        reasons.append("service coup droit")

    player_match = find_best_vocab_match(text, vocab.get("players", []))
    match_match = find_best_vocab_match(text, vocab.get("matches", []))
    shot_match = find_best_vocab_match(text, vocab.get("shots", []))
    fault_match = find_best_vocab_match(text, vocab.get("faults", []))
    zone_match = find_best_vocab_match(text, vocab.get("service_zones", []))

    if player_match:
        if any(term in text for term in ["server", "serveur", "serving", "on serve", "au service"]):
            filters["serveur"] = player_match
            reasons.append(f"serveur {player_match}")
        elif any(term in text for term in ["winner", "gagné par", "won by", "victoire", "points gagnés par", "points gagnes par"]):
            filters["winner"] = player_match
            reasons.append(f"gagnant {player_match}")
        else:
            filters["player"] = player_match
            reasons.append(f"joueur {player_match}")

    if match_match:
        filters["match_id"] = match_match
        reasons.append(f"match {match_match}")

    if shot_match:
        filters["winning_shot"] = shot_match
        reasons.append(f"dernier coup {shot_match}")

    if fault_match and filters.get("winning_shot_status") != "winner":
        filters["faute_type"] = fault_match
        reasons.append(f"faute {fault_match}")

    if zone_match:
        filters["service_zone"] = zone_match
        reasons.append(f"zone de service {zone_match}")

    sort = None
    if any(term in text for term in ["longest", "plus long", "plus longs", "les plus longs"]):
        sort = "longest"
    elif any(term in text for term in ["shortest", "plus court", "plus courts", "les plus courts"]):
        sort = "shortest"
    elif any(term in text for term in ["most shots", "most rallies", "plus de coups"]):
        sort = "most_shots"
    elif any(term in text for term in ["least shots", "moins de coups"]):
        sort = "least_shots"
    elif filters.get("winning_shot_status") == "winner":
        sort = "winners"
    elif filters.get("winning_shot_status") == "error":
        sort = "errors"

    reasoning = "Interprétation locale: " + ", ".join(reasons) if reasons else "Interprétation locale sans filtre explicite."
    logger.debug(
        "LLM local fallback parser result query=%r filters=%s sort=%s reasoning=%r",
        query_text,
        filters,
        sort,
        reasoning,
    )
    return LlmSearchPlan.model_validate({
        "filters": filters,
        "sort": sort,
        "reasoning": reasoning
    })


def parse_llm_search_query(query_text: str) -> LlmSearchPlan:
    """Convert a natural-language query into deterministic filters."""
    model = get_openai_model()
    logger.debug("LLM parse requested query=%r model=%s", query_text, model)
    client = get_openai_client()

    system_prompt = """
You convert a French or English ping-pong search request into deterministic search filters.

Return only one JSON object with this shape:
{
  "filters": {
    "match_id": string|null,
    "player": string|null,
    "winner": string|null,
    "serveur": string|null,
    "set_num": integer|null,
    "nb_coups_min": integer|null,
    "nb_coups_max": integer|null,
    "duree_min": integer|null,
    "duree_max": integer|null,
    "effet": string|null,
    "lateralite": string|null,
    "faute_type": string|null,
    "winning_shot": string|null,
    "winning_shot_status": "winner"|"error"|null,
    "zone": string|null,
    "service_zone": string|null,
    "service_lateralite": string|null
  },
  "sort": "chronological"|"longest"|"shortest"|"most_shots"|"least_shots"|"winners"|"errors"|null,
  "reasoning": string|null
}

Rules:
- Do not invent values.
- Use null when the request does not clearly specify a filter.
- "long exchange", "rally", "long point" usually means nb_coups_min around 5 or more.
- If the user asks for an exact rally length like "en 4 coups", "4 coups", "4 echanges", "4 exchanges", or "exactly 4 shots", set both nb_coups_min and nb_coups_max to 4.
- If the user asks for "au moins 4 coups" / "at least 4 shots", set nb_coups_min to 4 only.
- If the user asks for "au plus 4 coups" / "at most 4 shots", set nb_coups_max to 4 only.
- Durations must be returned in frames, assuming 25 frames per second.
- "winner"/"winning point" means faute_type = "pt_gagne" or winning_shot_status = "winner" if relevant.
- Return valid JSON only, no markdown.
""".strip()

    response = client.chat.completions.create(
        model=model,
        temperature=0,
        messages=[
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": query_text.strip()},
        ],
    )

    content = response.choices[0].message.content or "{}"
    logger.debug("LLM raw response query=%r content=%r", query_text, content)
    payload = extract_json_object(content)
    logger.debug("LLM extracted payload query=%r payload=%s", query_text, payload)
    plan = LlmSearchPlan.model_validate(payload)
    logger.debug(
        "LLM validated plan query=%r filters=%s sort=%s reasoning=%r",
        query_text,
        plan.filters.model_dump(),
        plan.sort,
        plan.reasoning,
    )
    return plan


def resolve_llm_search_query(query_text: str) -> tuple[LlmSearchPlan, str]:
    """Resolve the query with OpenAI only; raise if unavailable or failing."""
    model = get_openai_model()
    if not get_openai_api_key():
        logger.error("LLM resolve aborted because OPENAI_API_KEY is not configured query=%r", query_text)
        raise HTTPException(status_code=503, detail="OpenAI is not configured for LLM search")

    try:
        logger.debug("LLM resolve attempting OpenAI query=%r model=%s", query_text, model)
        plan = parse_llm_search_query(query_text)
        logger.debug("LLM resolve using OpenAI query=%r", query_text)
        return plan, "openai"
    except HTTPException:
        raise
    except Exception as exc:
        logger.error(
            "LLM resolve failed with OpenAI query=%r model=%s error_type=%s",
            query_text,
            model,
            type(exc).__name__,
        )
        raise HTTPException(status_code=502, detail=f"OpenAI parsing failed: {type(exc).__name__}")


def execute_search(query: dict, sort: str, page: int, size: int) -> dict:
    """Execute an Elasticsearch search and format the shared response shape."""
    from_offset = (page - 1) * size

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

    response = es_request("POST", f"/{ES_INDEX}/_search", search_body)
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


def compact_filters(filters: Dict[str, Any]) -> Dict[str, Any]:
    """Remove unset values from a filter dict."""
    return {
        key: value
        for key, value in filters.items()
        if value is not None and value != ""
    }


def build_filter_changes(parsed_filters: Dict[str, Any], explicit_filters: Dict[str, Any]) -> List[Dict[str, Any]]:
    changes: List[Dict[str, Any]] = []
    all_keys = sorted(set(parsed_filters.keys()) | set(explicit_filters.keys()))

    for key in all_keys:
        parsed_value = parsed_filters.get(key)
        explicit_value = explicit_filters.get(key)
        label = get_filter_label(key)

        if key in parsed_filters and key not in explicit_filters:
            changes.append(LlmFilterChange(
                key=key,
                label=label,
                value=parsed_value,
                previous_value=None,
                change_type="added_by_llm"
            ).model_dump())
        elif key in parsed_filters and key in explicit_filters:
            if parsed_value == explicit_value:
                changes.append(LlmFilterChange(
                    key=key,
                    label=label,
                    value=explicit_value,
                    previous_value=parsed_value,
                    change_type="confirmed_by_user"
                ).model_dump())
            else:
                changes.append(LlmFilterChange(
                    key=key,
                    label=label,
                    value=explicit_value,
                    previous_value=parsed_value,
                    change_type="overridden_by_user"
                ).model_dump())

    return changes


def normalize_suggestion_text(value: str) -> str:
    """Normalize a suggestion for loose matching."""
    return " ".join(value.lower().replace("_", " ").replace("-", " ").split())


def score_suggestion(query_text: str, suggestion: str) -> float:
    """Rank suggestions with prefix, token, substring and fuzzy matching."""
    normalized_query = normalize_suggestion_text(query_text)
    normalized_suggestion = normalize_suggestion_text(suggestion)

    if not normalized_query:
        return 0.0

    score = 0.0
    if normalized_suggestion.startswith(normalized_query):
        score += 10

    suggestion_tokens = normalized_suggestion.split()
    query_tokens = normalized_query.split()

    if suggestion_tokens and query_tokens:
        if any(token.startswith(query_tokens[0]) for token in suggestion_tokens):
            score += 6
        token_hits = sum(1 for token in query_tokens if token in normalized_suggestion)
        score += token_hits * 3

    if normalized_query in normalized_suggestion:
        score += 4

    score += SequenceMatcher(None, normalized_query, normalized_suggestion).ratio() * 2
    return score


def collect_autocomplete_suggestions(query_text: str, buckets_payload: dict, limit: int) -> list[str]:
    """Build a short ranked list of autocomplete suggestions."""
    suggestions: list[str] = []
    seen: set[str] = set()

    def add(value: Optional[str]) -> None:
        if not value:
            return
        cleaned = " ".join(str(value).replace("_", " ").split())
        dedupe_key = cleaned.lower()
        if dedupe_key in seen:
            return
        seen.add(dedupe_key)
        suggestions.append(cleaned)

    base_suggestions = [
        "long rally",
        "short rally",
        "winning points",
        "service winner",
        "topspin winner",
        "backhand rally",
        "forehand winner",
        "points under pressure",
        "best highlights",
        "fast exchange",
    ]
    for item in base_suggestions:
        add(item)

    aggs = buckets_payload.get("aggregations", {})
    for bucket in aggs.get("winners", {}).get("buckets", []):
        player_name = bucket.get("key")
        add(player_name)
        add(f"winning points {player_name}")
        add(f"service points {player_name}")

    for bucket in aggs.get("serveurs", {}).get("buckets", []):
        player_name = bucket.get("key")
        add(f"services {player_name}")

    for bucket in aggs.get("winning_shots", {}).get("buckets", []):
        shot = str(bucket.get("key", "")).replace("_", " ")
        add(shot)
        add(f"{shot} winner")

    for bucket in aggs.get("fautes", {}).get("buckets", []):
        fault = str(bucket.get("key", "")).replace("_", " ")
        add(fault)
        add(f"points ending with {fault}")

    for bucket in aggs.get("service_zones", {}).get("buckets", []):
        zone = bucket.get("key")
        add(f"service zone {zone}")

    ranked = sorted(
        suggestions,
        key=lambda suggestion: score_suggestion(query_text, suggestion),
        reverse=True
    )

    if not normalize_suggestion_text(query_text):
        return ranked[:limit]

    filtered = [item for item in ranked if score_suggestion(query_text, item) > 1.5]
    return filtered[:limit]


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

    # Durée du point (en frames)
    if duree_min is not None or duree_max is not None:
        range_clause = {"range": {"duree_frames": {}}}
        if duree_min is not None:
            range_clause["range"]["duree_frames"]["gte"] = duree_min
        if duree_max is not None:
            range_clause["range"]["duree_frames"]["lte"] = duree_max
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
        },
        "llm": {
            "available": bool(get_openai_api_key()),
            "provider": "openai" if get_openai_api_key() else None,
            "model": get_openai_model() if get_openai_api_key() else None
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
    service_lateralite: Optional[str] = Query(None, description="Latéralité du service (coup_droit, revers)"),
    q: Optional[str] = Query(None, description="Recherche textuelle dans les séquences"),
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
        zone, service_zone, service_lateralite, q
    )
    
    try:
        return execute_search(query=query, sort=sort, page=page, size=size)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Elasticsearch error: {str(e)}")


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


@router.get("/suggestions")
async def get_search_suggestions(
    q: str = Query("", description="Partial query used for autocomplete"),
    limit: int = Query(8, ge=1, le=15, description="Maximum number of suggestions")
):
    """
    Return lightweight autocomplete suggestions for the search bar.
    """
    if not check_es_connection():
        raise HTTPException(status_code=503, detail="Elasticsearch is not available")

    if not check_index_exists():
        return {"query": q, "suggestions": []}

    aggs_body = {
        "size": 0,
        "aggs": {
            "winners": {"terms": {"field": "winner", "size": 6}},
            "serveurs": {"terms": {"field": "serveur", "size": 6}},
            "winning_shots": {"terms": {"field": "dernier_coup", "size": 6}},
            "fautes": {"terms": {"field": "faute_type", "size": 6}},
            "service_zones": {"terms": {"field": "service_zone", "size": 6}},
        }
    }

    try:
        response = es_request("POST", f"/{ES_INDEX}/_search", aggs_body)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Elasticsearch error: {str(e)}")

    suggestions = collect_autocomplete_suggestions(q, response, limit)
    return {
        "query": q,
        "suggestions": suggestions
    }


@router.get("/llm-search")
async def llm_search_points(
    q: str = Query(..., description="Natural language query to interpret with the LLM"),
    match_id: Optional[str] = Query(None, description="ID du match"),
    player: Optional[str] = Query(None, description="Nom du joueur"),
    winner: Optional[str] = Query(None, description="Gagnant du point"),
    serveur: Optional[str] = Query(None, description="Serveur du point"),
    set_num: Optional[int] = Query(None, description="Numéro du set"),
    nb_coups_min: Optional[int] = Query(None, description="Nombre minimum de coups"),
    nb_coups_max: Optional[int] = Query(None, description="Nombre maximum de coups"),
    duree_min: Optional[int] = Query(None, description="Durée minimale du point (frames)"),
    duree_max: Optional[int] = Query(None, description="Durée maximale du point (frames)"),
    effet: Optional[str] = Query(None, description="Effet recherché"),
    lateralite: Optional[str] = Query(None, description="Latéralité"),
    faute_type: Optional[str] = Query(None, description="Type de faute"),
    winning_shot: Optional[str] = Query(None, description="Type de coup gagnant"),
    winning_shot_status: Optional[str] = Query(None, description="winner ou error"),
    zone: Optional[str] = Query(None, description="Zone de jeu"),
    service_zone: Optional[str] = Query(None, description="Zone de service"),
    service_lateralite: Optional[str] = Query(None, description="Latéralité du service"),
    sort: Optional[str] = Query(None, description="Ordre de tri explicite"),
    page: int = Query(1, ge=1, description="Numéro de page"),
    size: int = Query(20, ge=1, le=100, description="Nombre de résultats par page")
):
    """
    Use an LLM to convert a natural-language query into deterministic filters,
    then run the standard Elasticsearch search.
    """
    logger.debug(
        "LLM search request q=%r page=%s size=%s explicit_sort=%r explicit_filters=%s",
        q,
        page,
        size,
        sort,
        compact_filters({
            "match_id": match_id,
            "player": player,
            "winner": winner,
            "serveur": serveur,
            "set_num": set_num,
            "nb_coups_min": nb_coups_min,
            "nb_coups_max": nb_coups_max,
            "duree_min": duree_min,
            "duree_max": duree_max,
            "effet": effet,
            "lateralite": lateralite,
            "faute_type": faute_type,
            "winning_shot": winning_shot,
            "winning_shot_status": winning_shot_status,
            "zone": zone,
            "service_zone": service_zone,
            "service_lateralite": service_lateralite,
        }),
    )
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
            "applied_filters": {},
            "message": "No data indexed yet. Run: python backend/scripts/index_to_elasticsearch.py"
        }

    try:
        plan, llm_provider = resolve_llm_search_query(q)
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"LLM parsing error: {str(e)}")

    explicit_filters = compact_filters({
        "match_id": match_id,
        "player": player,
        "winner": winner,
        "serveur": serveur,
        "set_num": set_num,
        "nb_coups_min": nb_coups_min,
        "nb_coups_max": nb_coups_max,
        "duree_min": duree_min,
        "duree_max": duree_max,
        "effet": effet,
        "lateralite": lateralite,
        "faute_type": faute_type,
        "winning_shot": winning_shot,
        "winning_shot_status": winning_shot_status,
        "zone": zone,
        "service_zone": service_zone,
        "service_lateralite": service_lateralite,
    })
    vocab = get_search_vocab()
    parsed_filters = canonicalize_filters(compact_filters(plan.filters.model_dump()), vocab)
    applied_filters = {**parsed_filters, **explicit_filters}
    applied_sort = sort or plan.sort or "chronological"
    filter_changes = build_filter_changes(parsed_filters, explicit_filters)
    logger.debug(
        "LLM search parsed q=%r provider=%s parsed_filters=%s explicit_filters=%s applied_filters=%s applied_sort=%s",
        q,
        llm_provider,
        parsed_filters,
        explicit_filters,
        applied_filters,
        applied_sort,
    )

    query_body = build_es_query(**applied_filters)

    try:
        result = execute_search(query=query_body, sort=applied_sort, page=page, size=size)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Elasticsearch error: {str(e)}")

    result["mode"] = "llm"
    result["llm_provider"] = llm_provider
    result["parsed_filters"] = parsed_filters
    result["explicit_filters"] = explicit_filters
    result["applied_filters"] = applied_filters
    result["filter_changes"] = filter_changes
    result["applied_sort"] = applied_sort
    result["llm_explanation"] = plan.reasoning
    result["original_query"] = q
    return result


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
        "sort": [{"set_num": "asc"}, {"point_id": "asc"}],
        "_source": [
            "point_id", "set_num", "score_A", "score_B", "set_A", "set_B",
            "serveur", "winner", "player_A", "player_B",
            "nb_coups", "faute_type", "is_set_point", "is_point_gagnant",
            "sequence_coups"
        ]
    }

    try:
        response = es_request("POST", f"/{ES_INDEX}/_search", search_body)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

    hits = response.get("hits", {}).get("hits", [])
    points = []
    cum_a, cum_b = 0, 0
    set_score_a, set_score_b = 0, 0
    current_set = None
    has_real_scores = any(
        (hit.get("_source", {}).get("score_A") or 0) != 0
        or (hit.get("_source", {}).get("score_B") or 0) != 0
        for hit in hits
    )

    for h in hits:
        src = dict(h["_source"])
        player_a = src.get("player_A", "")
        player_b = src.get("player_B", "")
        winner = infer_point_winner(src)
        set_num = src.get("set_num")

        if set_num != current_set:
            current_set = set_num
            set_score_a, set_score_b = 0, 0

        if not has_real_scores:
            src["score_A"] = set_score_a
            src["score_B"] = set_score_b

        src["winner"] = winner

        if winner == player_a:
            cum_a += 1
            set_score_a += 1
        elif winner == player_b:
            cum_b += 1
            set_score_b += 1

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

    points_query = {
        "size": 500,
        "query": {"term": {"match_id": match_id}},
        "sort": [{"set_num": "asc"}, {"point_id": "asc"}],
        "_source": [
            "player_A", "player_B", "winner", "serveur",
            "nb_coups", "dernier_coup", "faute_type", "sequence_coups"
        ],
    }

    try:
        points_resp = es_request("POST", f"/{ES_INDEX}/_search", points_query)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

    points = [hit.get("_source", {}) for hit in points_resp.get("hits", {}).get("hits", [])]
    total = len(points)

    def compute_stats(player_name: str):
        points_won = 0
        service_total = 0
        service_won = 0
        receive_total = 0
        receive_won = 0
        winning_rally_total = 0
        service_rally_total = 0
        winning_shots: Counter[str] = Counter()
        faults: Counter[str] = Counter()

        for point in points:
            winner = infer_point_winner(point)
            serveur = str(point.get("serveur", "") or "")
            nb_coups = int(point.get("nb_coups", 0) or 0)
            dernier_coup = str(point.get("dernier_coup", "") or "")
            faute_type = str(point.get("faute_type", "") or "")

            if serveur == player_name:
                service_total += 1
                service_rally_total += nb_coups
                if winner == player_name:
                    service_won += 1
            else:
                receive_total += 1
                if winner == player_name:
                    receive_won += 1

            if winner == player_name:
                points_won += 1
                winning_rally_total += nb_coups
                if dernier_coup:
                    winning_shots[dernier_coup] += 1
            elif faute_type:
                faults[faute_type] += 1

        return {
            "player": player_name,
            "points_won": points_won,
            "points_lost": total - points_won,
            "win_rate": round(points_won / total * 100, 1) if total > 0 else 0,
            "service_total": service_total,
            "service_won": service_won,
            "service_win_rate": round(service_won / service_total * 100, 1) if service_total > 0 else 0,
            "receive_total": receive_total,
            "receive_won": receive_won,
            "receive_win_rate": round(receive_won / receive_total * 100, 1) if receive_total > 0 else 0,
            "avg_rally_length_when_winning": round(winning_rally_total / points_won, 1) if points_won > 0 else 0,
            "avg_service_rally": round(service_rally_total / service_total, 1) if service_total > 0 else 0,
            "winning_shots": [{"shot": shot, "count": count} for shot, count in winning_shots.most_common(10)],
            "faults": [{"type": fault_type, "count": count} for fault_type, count in faults.most_common(10)],
        }

    return {
        "match_id": match_id,
        "total_points": total,
        "player_A": compute_stats(player_a),
        "player_B": compute_stats(player_b),
    }

