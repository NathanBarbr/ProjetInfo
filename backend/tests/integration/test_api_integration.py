"""
Integration tests for API endpoints with real services.
These tests verify the full API flow with actual file system and database interactions.

Run with: pytest tests/integration/test_api_integration.py -v -m integration
"""

import pytest
from fastapi.testclient import TestClient
from pathlib import Path
import json


pytestmark = pytest.mark.integration


@pytest.fixture
def client():
    """Create test client for the API."""
    from main import app
    return TestClient(app)


class TestVideosAPIIntegration:
    """Integration tests for videos API."""
    
    def test_list_videos_endpoint(self, client):
        """Test that /api/videos returns actual video data."""
        response = client.get("/api/videos")
        assert response.status_code == 200
        
        data = response.json()
        assert isinstance(data, list)
        # Should have at least one video configured
        if len(data) > 0:
            video = data[0]
            assert "id" in video
            assert "title" in video
    
    def test_get_video_metadata(self, client):
        """Test retrieving metadata for a specific video."""
        # First get list of videos
        response = client.get("/api/videos")
        videos = response.json()
        
        if len(videos) > 0:
            video_id = videos[0]["id"]
            
            # Get metadata for first video
            response = client.get(f"/api/videos/{video_id}/meta")
            assert response.status_code == 200
            
            meta = response.json()
            assert meta["id"] == video_id
    
    def test_video_streaming_headers(self, client):
        """Test that video streaming sets correct headers."""
        # Get a video ID
        response = client.get("/api/videos")
        videos = response.json()
        
        if len(videos) > 0:
            video_id = videos[0]["id"]
            
            # Try to stream video
            response = client.get(
                f"/api/videos/{video_id}",
                headers={"Range": "bytes=0-1023"}
            )
            
            # Should either work (206) or not find the file (404)
            assert response.status_code in [206, 404]
            
            if response.status_code == 206:
                assert "Content-Range" in response.headers
                assert "Accept-Ranges" in response.headers


class TestClipsAPIIntegration:
    """Integration tests for clips API."""
    
    def test_list_clips_for_video(self, client):
        """Test listing clips for a video."""
        # Get videos
        response = client.get("/api/videos")
        videos = response.json()
        
        # Find a video with clips
        video_with_clips = next(
            (v for v in videos if v.get("has_clips")), 
            None
        )
        
        if video_with_clips:
            video_id = video_with_clips["id"]
            
            response = client.get(f"/api/videos/{video_id}/clips")
            assert response.status_code == 200
            
            data = response.json()
            assert "video_id" in data
            assert "sets" in data
            assert "total_clips" in data
            
            # If there are clips, verify structure
            if data["total_clips"] > 0:
                assert len(data["sets"]) > 0


class TestSearchAPIIntegration:
    """Integration tests for search API with real Elasticsearch."""
    
    def test_search_status(self, client):
        """Test search status endpoint."""
        response = client.get("/api/search/status")
        assert response.status_code == 200
        
        data = response.json()
        assert "elasticsearch" in data
        assert "connected" in data["elasticsearch"]
    
    def test_search_without_elasticsearch(self, client):
        """Test search behavior when ES might not be available."""
        response = client.get("/api/search?page=1&size=10")
        
        # Should either work (200) or indicate ES is unavailable (503)
        assert response.status_code in [200, 503]
    
    def test_search_stats(self, client):
        """Test stats endpoint."""
        response = client.get("/api/search/stats")
        
        # Should either work or indicate ES unavailable
        assert response.status_code in [200, 503]
        
        if response.status_code == 200:
            data = response.json()
            assert "total_points" in data


class TestChatAPIIntegration:
    """Integration tests for chat API."""
    
    def test_chat_status(self, client):
        """Test chat status endpoint."""
        response = client.get("/api/chat/status")
        assert response.status_code == 200
        
        data = response.json()
        assert "openai_configured" in data
        assert "elasticsearch_connected" in data
        assert "ready" in data
    
    def test_chat_message(self, client):
        """Test sending a chat message."""
        response = client.post(
            "/api/chat",
            json={
                "message": "Trouve-moi des topspins",
                "history": []
            }
        )
        
        assert response.status_code == 200
        
        data = response.json()
        assert "response" in data
        assert "points" in data
        assert isinstance(data["response"], str)
        assert isinstance(data["points"], list)
    
    def test_chat_empty_message(self, client):
        """Test that empty messages are rejected."""
        response = client.post(
            "/api/chat",
            json={"message": "", "history": []}
        )
        
        assert response.status_code == 400


class TestHealthCheck:
    """Test application health check."""
    
    def test_root_endpoint(self, client):
        """Test the root health check endpoint."""
        response = client.get("/")
        assert response.status_code == 200
        
        data = response.json()
        assert data["status"] == "ok"
