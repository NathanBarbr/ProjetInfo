"""
Unit tests for the chat router.
"""

import pytest
from unittest.mock import MagicMock, patch


class TestChatStatus:
    """Tests for chat status endpoint."""
    
    def test_chat_status_basic(self, client):
        """Test GET /api/chat/status."""
        response = client.get("/api/chat/status")
        assert response.status_code == 200
        
        data = response.json()
        assert "openai_configured" in data
        assert "elasticsearch_connected" in data
        assert "ready" in data
        assert isinstance(data["openai_configured"], bool)


class TestChatEndpoint:
    """Tests for main chat endpoint."""
    
    def test_chat_empty_message(self, client):
        """Test chat endpoint with empty message."""
        response = client.post("/api/chat", json={"message": "", "history": []})
        assert response.status_code == 400
        assert "empty" in response.json()["detail"].lower()
    
    def test_chat_basic_message(self, client, monkeypatch):
        """Test chat endpoint with basic message."""
        import routers.chat as chat_module
        
        # Mock search_points_by_description
        def mock_search(query, limit=5):
            return []
        
        # Mock generate_ai_response
        def mock_generate(message, history, points):
            return "Ceci est une réponse de test"
        
        monkeypatch.setattr(chat_module, "search_points_by_description", mock_search)
        monkeypatch.setattr(chat_module, "generate_ai_response", mock_generate)
        
        response = client.post(
            "/api/chat",
            json={"message": "Trouve-moi des topspins", "history": []}
        )
        assert response.status_code == 200
        
        data = response.json()
        assert "response" in data
        assert "points" in data
        assert data["response"] == "Ceci est une réponse de test"
    
    def test_chat_with_results(self, client, monkeypatch):
        """Test chat endpoint when points are found."""
        import routers.chat as chat_module
        
        mock_points = [
            {
                "clip_id": "set_1_point_1",
                "video_id": "test-video",
                "set_number": 1,
                "point_number": 1,
                "description": "Topspin gagnant",
                "winner": "Player A",
                "relevance_score": 2.5
            }
        ]
        
        def mock_search(query, limit=5):
            return mock_points
        
        def mock_generate(message, history, points):
            return f"J'ai trouvé {len(points)} point(s)"
        
        monkeypatch.setattr(chat_module, "search_points_by_description", mock_search)
        monkeypatch.setattr(chat_module, "generate_ai_response", mock_generate)
        
        response = client.post(
            "/api/chat",
            json={"message": "Trouve-moi des topspins", "history": []}
        )
        assert response.status_code == 200
        
        data = response.json()
        assert len(data["points"]) == 1
        assert data["points"][0]["clip_id"] == "set_1_point_1"


class TestHelperFunctions:
    """Tests for helper functions."""
    
    def test_generate_ai_response_no_api_key(self, monkeypatch):
        """Test AI response generation without API key (fallback)."""
        from routers.chat import generate_ai_response, ChatMessage
        
        # Ensure no API key
        monkeypatch.setenv("OPENAI_API_KEY", "")
        
        points = [
            {"set_number": 1, "point_number": 1, "description": "Test point"}
        ]
        
        response = generate_ai_response("test message", [], points)
        assert "trouvé" in response.lower()
        assert len(points) > 0
    
    def test_generate_ai_response_no_points(self, monkeypatch):
        """Test AI response generation with no matching points."""
        from routers.chat import generate_ai_response
        
        monkeypatch.setenv("OPENAI_API_KEY", "")
        
        response = generate_ai_response("test message", [], [])
        assert "pas trouvé" in response.lower() or "n'ai pas" in response.lower()
