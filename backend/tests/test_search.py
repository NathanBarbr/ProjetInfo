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
        assert data["page"] == 1
        assert data["size"] == 20
        assert len(data["points"]) == 2
        assert data["points"][0]["match_id"] == "test-match"
    
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
