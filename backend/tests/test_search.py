"""
Unit tests for the search router.
"""

import pytest
from unittest.mock import MagicMock


class TestSearchStatus:
    """Tests for search status endpoint."""
    
    def test_search_status_connected(self, client, mock_es_available, monkeypatch):
        """Test GET /api/search/status when ES is available."""
        import routers.search as search_module
        
        # Mock the count request
        def mock_es_request(method, path, body=None):
            if "_count" in path:
                return {"count": 100}
            return {"version": {"number": "8.0.0"}}
        
        monkeypatch.setattr(search_module, "es_request", mock_es_request)
        
        response = client.get("/api/search/status")
        assert response.status_code == 200
        
        data = response.json()
        assert data["elasticsearch"]["connected"] is True
        assert data["elasticsearch"]["index_info"]["exists"] is True
        assert data["elasticsearch"]["index_info"]["count"] == 100
    
    def test_search_status_disconnected(self, client, mock_es_unavailable):
        """Test GET /api/search/status when ES is unavailable."""
        response = client.get("/api/search/status")
        assert response.status_code == 200
        
        data = response.json()
        assert data["elasticsearch"]["connected"] is False


class TestSearchEndpoint:
    """Tests for main search endpoint."""
    
    def test_search_es_unavailable(self, client, mock_es_unavailable):
        """Test search endpoint when Elasticsearch is unavailable."""
        response = client.get("/api/search")
        assert response.status_code == 503
        assert "not available" in response.json()["detail"].lower()
    
    def test_search_basic(self, client, mock_es_available, monkeypatch, sample_search_result):
        """Test basic search without filters."""
        import routers.search as search_module
        
        def mock_es_request(method, path, body=None):
            return sample_search_result
        
        monkeypatch.setattr(search_module, "es_request", mock_es_request)
        
        response = client.get("/api/search?page=1&size=20")
        assert response.status_code == 200
        
        data = response.json()
        assert data["total"] == 2

    def test_llm_search_merges_parsed_and_explicit_filters(self, client, mock_es_available, monkeypatch, sample_search_result):
        """Test LLM search endpoint with parsed filters and explicit override."""
        import routers.search as search_module

        monkeypatch.setattr(search_module, "OPENAI_API_KEY", "test-key")

        def mock_resolve_llm_query(query_text):
            assert query_text == "montre moi les longs echanges"
            return search_module.LlmSearchPlan.model_validate({
                "filters": {
                    "winner": "Player A",
                    "nb_coups_min": 5
                },
                "sort": "longest",
                "reasoning": "Long exchanges imply at least 5 shots."
            }), "openai"

        def mock_es_request(method, path, body=None):
            if body and "query" in body:
                query = body["query"]
                assert {"term": {"winner": "Player B"}} in query["bool"]["filter"]
                assert any(
                    filt.get("range", {}).get("nb_coups", {}).get("gte") == 5
                    for filt in query["bool"]["filter"]
                )
            return sample_search_result

        monkeypatch.setattr(search_module, "resolve_llm_search_query", mock_resolve_llm_query)
        monkeypatch.setattr(search_module, "es_request", mock_es_request)

        response = client.get("/api/search/llm-search?q=montre%20moi%20les%20longs%20echanges&winner=Player%20B")
        assert response.status_code == 200

        data = response.json()
        assert data["mode"] == "llm"
        assert data["llm_provider"] == "openai"
        assert data["parsed_filters"]["winner"] == "Player A"
        assert data["applied_filters"]["winner"] == "Player B"
        assert data["applied_filters"]["nb_coups_min"] == 5
        assert any(change["change_type"] == "overridden_by_user" for change in data["filter_changes"])
        assert data["applied_sort"] == "longest"
        assert data["page"] == 1
        assert data["size"] == 20
        assert len(data["points"]) == 2
        assert data["points"][0]["match_id"] == "test-match"

    def test_llm_search_falls_back_to_local_parser(self, client, mock_es_available, monkeypatch, sample_search_result):
        """Test local fallback parser for LLM search when OpenAI is unavailable."""
        import routers.search as search_module

        monkeypatch.setattr(search_module, "OPENAI_API_KEY", "")

        def mock_es_request(method, path, body=None):
            if path.endswith("/_search") and body and "aggs" in body:
                return {
                    "aggregations": {
                        "matches": {"buckets": []},
                        "players_A": {"buckets": [{"key": "Player A", "doc_count": 10}]},
                        "players_B": {"buckets": [{"key": "Player B", "doc_count": 10}]},
                        "winners": {"buckets": [{"key": "Player A", "doc_count": 10}]},
                        "serveurs": {"buckets": [{"key": "Player A", "doc_count": 10}]},
                        "shots": {"buckets": [{"key": "topspin", "doc_count": 8}]},
                        "faults": {"buckets": [{"key": "filet", "doc_count": 3}]},
                        "service_zones": {"buckets": [{"key": "court", "doc_count": 3}]},
                        "service_lateralites": {"buckets": []},
                    }
                }
            return sample_search_result

        monkeypatch.setattr(search_module, "es_request", mock_es_request)

        response = client.get("/api/search/llm-search?q=montre%20moi%20les%20longs%20topspin%20de%20Player%20A%20au%20set%202")
        assert response.status_code == 200

        data = response.json()
        assert data["llm_provider"] == "local"
        assert data["parsed_filters"]["player"] == "Player A"
        assert data["parsed_filters"]["set_num"] == 2
        assert data["parsed_filters"]["nb_coups_min"] == 5
        assert data["parsed_filters"]["winning_shot"] == "topspin"
        assert any(change["change_type"] == "added_by_llm" for change in data["filter_changes"])

    def test_llm_search_local_parser_detects_exact_rally_length(self, client, mock_es_available, monkeypatch, sample_search_result):
        """Test local fallback parser handles exact rally length expressions."""
        import routers.search as search_module

        monkeypatch.setattr(search_module, "OPENAI_API_KEY", "")

        def mock_es_request(method, path, body=None):
            if path.endswith("/_search") and body and "aggs" in body:
                return {
                    "aggregations": {
                        "matches": {"buckets": []},
                        "players_A": {"buckets": [{"key": "FAN-ZHENDONG", "doc_count": 10}]},
                        "players_B": {"buckets": [{"key": "TRULS-MOREGARD", "doc_count": 10}]},
                        "winners": {"buckets": [{"key": "FAN-ZHENDONG", "doc_count": 10}]},
                        "serveurs": {"buckets": [{"key": "FAN-ZHENDONG", "doc_count": 10}]},
                        "shots": {"buckets": []},
                        "faults": {"buckets": []},
                        "service_zones": {"buckets": []},
                        "service_lateralites": {"buckets": []},
                    }
                }

            if body and "query" in body:
                filters = body["query"]["bool"]["filter"]
                assert any(
                    filt.get("range", {}).get("nb_coups", {}).get("gte") == 4
                    for filt in filters
                )
                assert any(
                    filt.get("range", {}).get("nb_coups", {}).get("lte") == 4
                    for filt in filters
                )
            return sample_search_result

        monkeypatch.setattr(search_module, "es_request", mock_es_request)

        response = client.get("/api/search/llm-search?q=fanzhendong%20qui%20gagne%20en%204%20coups")
        assert response.status_code == 200

        data = response.json()
        assert data["llm_provider"] == "local"
        assert data["parsed_filters"]["player"] == "FAN-ZHENDONG"
        assert data["parsed_filters"]["nb_coups_min"] == 4
        assert data["parsed_filters"]["nb_coups_max"] == 4

    def test_parse_llm_search_query_prompt_mentions_exact_rally_lengths(self, monkeypatch):
        """Test OpenAI prompt explicitly describes exact rally-length mapping."""
        import routers.search as search_module

        captured = {}

        class FakeClient:
            class _Chat:
                class _Completions:
                    @staticmethod
                    def create(**kwargs):
                        captured.update(kwargs)
                        message = MagicMock()
                        message.content = '{"filters": {}, "sort": null, "reasoning": null}'
                        choice = MagicMock()
                        choice.message = message
                        response = MagicMock()
                        response.choices = [choice]
                        return response

                completions = _Completions()

            chat = _Chat()

        monkeypatch.setattr(search_module, "OPENAI_API_KEY", "test-key")
        monkeypatch.setattr(search_module, "get_openai_client", lambda: FakeClient())

        search_module.parse_llm_search_query("fan zhendong qui gagne en 4 coups")

        system_prompt = captured["messages"][0]["content"]
        assert "en 4 coups" in system_prompt
        assert "set both nb_coups_min and nb_coups_max to 4" in system_prompt
    
    def test_search_with_filters(self, client, mock_es_available, monkeypatch, sample_search_result):
        """Test search with multiple filters."""
        import routers.search as search_module
        
        def mock_es_request(method, path, body=None):
            # Verify that filters are included in the query
            if body and "query" in body:
                query = body["query"]
                assert "bool" in query
            return sample_search_result
        
        monkeypatch.setattr(search_module, "es_request", mock_es_request)
        
        response = client.get(
            "/api/search?winner=Player+A&nb_coups_min=3&nb_coups_max=10&page=1"
        )
        assert response.status_code == 200
        
        data = response.json()
        assert data["total"] == 2


class TestQueryBuilder:
    """Tests for the build_es_query helper function."""
    
    def test_build_query_no_filters(self):
        """Test query building without any filters."""
        from routers.search import build_es_query
        
        query = build_es_query()
        assert query == {"match_all": {}}
    
    def test_build_query_with_match_id(self):
        """Test query building with match_id filter."""
        from routers.search import build_es_query
        
        query = build_es_query(match_id="test-match")
        assert "bool" in query
        assert "filter" in query["bool"]
        assert {"term": {"match_id": "test-match"}} in query["bool"]["filter"]
    
    def test_build_query_with_player(self):
        """Test query building with player filter."""
        from routers.search import build_es_query
        
        query = build_es_query(player="Player A")
        assert "bool" in query
        assert "filter" in query["bool"]
        # Should search in both player_A and player_B
        player_filter = query["bool"]["filter"][0]
        assert "bool" in player_filter
        assert "should" in player_filter["bool"]
    
    def test_build_query_with_range(self):
        """Test query building with range filters."""
        from routers.search import build_es_query
        
        query = build_es_query(nb_coups_min=3, nb_coups_max=10)
        assert "bool" in query
        assert "filter" in query["bool"]
        
        range_filter = next(f for f in query["bool"]["filter"] if "range" in f)
        assert range_filter["range"]["nb_coups"]["gte"] == 3
        assert range_filter["range"]["nb_coups"]["lte"] == 10
    
    def test_build_query_winning_shot_status(self):
        """Test query building with winning_shot_status filter."""
        from routers.search import build_es_query
        
        # Test "winner" status
        query_winner = build_es_query(winning_shot_status="winner")
        assert "bool" in query_winner
        assert {"term": {"faute_type": "pt_gagne"}} in query_winner["bool"]["filter"]
        
        # Test "error" status
        query_error = build_es_query(winning_shot_status="error")
        assert "bool" in query_error
        assert "must" in query_error["bool"]


class TestStatsEndpoint:
    """Tests for stats endpoint."""
    
    def test_stats_basic(self, client, mock_es_available, monkeypatch):
        """Test GET /api/search/stats."""
        import routers.search as search_module
        
        mock_response = {
            "hits": {"total": {"value": 100}},
            "aggregations": {
                "matches": {"buckets": [{"key": "match-1", "doc_count": 50}]},
                "players_A": {"buckets": [{"key": "Player A", "doc_count": 50}]},
                "players_B": {"buckets": [{"key": "Player B", "doc_count": 50}]},
                "winners": {"buckets": []},
                "serveurs": {"buckets": []},
                "sets": {"buckets": []},
                "fautes": {"buckets": []},
                "winning_shots": {"buckets": []},
                "service_zones": {"buckets": []},
                "service_lateralites": {"buckets": []},
                "nb_coups_stats": {"count": 100, "min": 1, "max": 20, "avg": 5.5}
            }
        }
        
        def mock_es_request(method, path, body=None):
            return mock_response
        
        monkeypatch.setattr(search_module, "es_request", mock_es_request)
        
        response = client.get("/api/search/stats")
        assert response.status_code == 200
        
        data = response.json()
        assert data["total_points"] == 100
        assert "Player A" in data["players"]
        assert "Player B" in data["players"]
        assert data["nb_coups"]["min"] == 1
        assert data["nb_coups"]["max"] == 20


class TestSuggestionsEndpoint:
    """Tests for autocomplete suggestions endpoint."""

    def test_suggestions_endpoint_returns_ranked_items(self, client, mock_es_available, monkeypatch):
        import routers.search as search_module

        mock_response = {
            "aggregations": {
                "winners": {"buckets": [{"key": "FELIX-LEBRUN", "doc_count": 10}]},
                "serveurs": {"buckets": [{"key": "FAN-ZHENDONG", "doc_count": 8}]},
                "winning_shots": {"buckets": [{"key": "topspin", "doc_count": 12}]},
                "fautes": {"buckets": [{"key": "filet", "doc_count": 4}]},
                "service_zones": {"buckets": [{"key": "court", "doc_count": 5}]},
            }
        }

        def mock_es_request(method, path, body=None):
            return mock_response

        monkeypatch.setattr(search_module, "es_request", mock_es_request)

        response = client.get("/api/search/suggestions?q=top")
        assert response.status_code == 200

        data = response.json()
        assert data["query"] == "top"
        assert len(data["suggestions"]) > 0
        assert any("topspin" in suggestion.lower() for suggestion in data["suggestions"])


class TestPointDetail:
    """Tests for point detail endpoint."""
    
    def test_get_point_detail_success(self, client, mock_es_available, monkeypatch):
        """Test GET /api/search/point/{match_id}/{point_id}."""
        import routers.search as search_module
        
        def mock_es_request(method, path, body=None):
            return {
                "found": True,
                "_id": "test-match_1",
                "_source": {
                    "match_id": "test-match",
                    "point_id": 1,
                    "winner": "Player A"
                }
            }
        
        monkeypatch.setattr(search_module, "es_request", mock_es_request)
        
        response = client.get("/api/search/point/test-match/1")
        assert response.status_code == 200
        
        data = response.json()
        assert data["match_id"] == "test-match"
        assert data["point_id"] == 1
    
    def test_get_point_detail_not_found(self, client, mock_es_available, monkeypatch):
        """Test point detail endpoint when point is not found."""
        import routers.search as search_module
        
        def mock_es_request(method, path, body=None):
            return {"found": False}
        
        monkeypatch.setattr(search_module, "es_request", mock_es_request)
        
        response = client.get("/api/search/point/unknown-match/999")
        assert response.status_code == 404


class TestMomentumEndpoint:
    """Tests for match momentum endpoint."""

    def test_infer_point_winner_from_sequence(self):
        import routers.search as search_module

        assert search_module.infer_point_winner({
            "player_A": "Player A",
            "player_B": "Player B",
            "serveur": "Player A",
            "winner": "",
            "sequence_coups": "Player A,Player B,serveur_point_pour",
            "faute_type": "out",
        }) == "Player A"

        assert search_module.infer_point_winner({
            "player_A": "Player A",
            "player_B": "Player B",
            "serveur": "Player B",
            "winner": "",
            "sequence_coups": "Player B,Player A,serveur_point_contre",
            "faute_type": "pt_gagne",
        }) == "Player A"

    def test_match_momentum_reconstructs_winner_and_score_when_missing(self, client, mock_es_available, monkeypatch):
        import routers.search as search_module

        def mock_es_request(method, path, body=None):
            assert path == "/pingpong_points/_search"
            return {
                "hits": {
                    "hits": [
                        {
                            "_source": {
                                "point_id": 0,
                                "set_num": 1,
                                "score_A": 0,
                                "score_B": 0,
                                "serveur": "Player A",
                                "winner": "",
                                "sequence_coups": "Player A,Player B,serveur_point_pour",
                                "faute_type": "out",
                                "player_A": "Player A",
                                "player_B": "Player B",
                            }
                        },
                        {
                            "_source": {
                                "point_id": 1,
                                "set_num": 1,
                                "score_A": 0,
                                "score_B": 0,
                                "serveur": "Player B",
                                "winner": "",
                                "sequence_coups": "Player B,Player A,serveur_point_contre",
                                "faute_type": "pt_gagne",
                                "player_A": "Player A",
                                "player_B": "Player B",
                            }
                        },
                        {
                            "_source": {
                                "point_id": 2,
                                "set_num": 2,
                                "score_A": 0,
                                "score_B": 0,
                                "serveur": "Player B",
                                "winner": "",
                                "sequence_coups": "Player B,serveur_point_pour",
                                "faute_type": "out",
                                "player_A": "Player A",
                                "player_B": "Player B",
                            }
                        },
                    ]
                }
            }

        monkeypatch.setattr(search_module, "es_request", mock_es_request)

        response = client.get("/api/search/match-momentum/test-match")
        assert response.status_code == 200

        data = response.json()
        assert data["total_points"] == 3
        assert data["points"][0]["winner"] == "Player A"
        assert data["points"][0]["score_A"] == 0
        assert data["points"][0]["score_B"] == 0
        assert data["points"][0]["diff"] == 1
        assert data["points"][1]["winner"] == "Player A"
        assert data["points"][1]["score_A"] == 1
        assert data["points"][1]["score_B"] == 0
        assert data["points"][1]["diff"] == 2
        assert data["points"][2]["winner"] == "Player B"
        assert data["points"][2]["score_A"] == 0
        assert data["points"][2]["score_B"] == 0
        assert data["points"][2]["diff"] == 1
