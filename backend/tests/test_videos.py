"""
Unit tests for the videos router.
"""

import pytest
from pathlib import Path


class TestVideosRouter:
    """Tests for video-related endpoints."""
    
    def test_list_videos(self, client, mock_videos_json):
        """Test GET /api/videos - should return list of videos."""
        response = client.get("/api/videos")
        assert response.status_code == 200
        
        data = response.json()
        assert isinstance(data, list)
        assert len(data) == 2
        assert data[0]["id"] == "test-video-1"
        assert data[1]["id"] == "test-video-2"
    
    def test_get_video_metadata_success(self, client, mock_videos_json):
        """Test GET /api/videos/{video_id}/meta - should return video metadata."""
        response = client.get("/api/videos/test-video-1/meta")
        assert response.status_code == 200
        
        data = response.json()
        assert data["id"] == "test-video-1"
        assert data["title"] == "Test Match 1"
        assert data["has_clips"] is True
    
    def test_get_video_metadata_not_found(self, client, mock_videos_json):
        """Test GET /api/videos/{video_id}/meta - should return 404 for unknown video."""
        response = client.get("/api/videos/unknown-video/meta")
        assert response.status_code == 404
        assert "not found" in response.json()["detail"].lower()


class TestClipsRouter:
    """Tests for clips-related endpoints."""
    
    def test_list_clips_no_clips(self, client, mock_videos_json):
        """Test GET /api/videos/{video_id}/clips - video without clips."""
        response = client.get("/api/videos/test-video-2/clips")
        assert response.status_code == 200
        
        data = response.json()
        assert data["video_id"] == "test-video-2"
        assert data["sets"] == {}
        assert data["total_clips"] == 0


class TestHelperFunctions:
    """Tests for helper functions in the videos module."""
    
    def test_load_videos_metadata(self, mock_videos_json):
        """Test load_videos_metadata() function."""
        from routers.videos import load_videos_metadata
        
        videos = load_videos_metadata()
        assert isinstance(videos, list)
        assert len(videos) == 2
        assert videos[0]["id"] == "test-video-1"
    
    def test_get_video_path(self, mock_videos_json, monkeypatch):
        """Test get_video_path() function."""
        from routers.videos import get_video_path, VIDEOS_DIR
        
        video_path = get_video_path("test-video-2")
        assert video_path is not None
        assert video_path.name == "test_match_2.mp4"
    
    def test_get_video_path_not_found(self, mock_videos_json):
        """Test get_video_path() with non-existent video."""
        from routers.videos import get_video_path
        
        video_path = get_video_path("unknown-video")
        assert video_path is None
