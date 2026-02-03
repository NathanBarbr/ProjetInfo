"""
Pytest configuration and shared fixtures.
"""

import json
import pytest
from pathlib import Path
from fastapi.testclient import TestClient
from main import app


@pytest.fixture
def client():
    """Create a test client for the FastAPI app."""
    return TestClient(app)


@pytest.fixture
def sample_videos_metadata():
    """Sample videos metadata for testing."""
    return [
        {
            "id": "test-video-1",
            "title": "Test Match 1",
            "filename": "test_match_1.mp4",
            "has_clips": True,
            "match_folder": "test-match-folder",
            "thumbnail": "test_thumbnail.jpg"
        },
        {
            "id": "test-video-2",
            "title": "Test Match 2",
            "filename": "test_match_2.mp4",
            "has_clips": False
        }
    ]


@pytest.fixture
def mock_videos_json(tmp_path, sample_videos_metadata, monkeypatch):
    """Create a temporary videos.json file for testing."""
    videos_dir = tmp_path / "videos"
    videos_dir.mkdir()
    
    videos_json = videos_dir / "videos.json"
    with open(videos_json, "w", encoding="utf-8") as f:
        json.dump(sample_videos_metadata, f)
    
    # Patch the VIDEOS_JSON path in the videos module
    import routers.videos as videos_module
    monkeypatch.setattr(videos_module, "VIDEOS_JSON", videos_json)
    monkeypatch.setattr(videos_module, "VIDEOS_DIR", videos_dir)
    
    return videos_json


@pytest.fixture
def sample_search_result():
    """Sample Elasticsearch search result."""
    return {
        "hits": {
            "total": {"value": 2},
            "hits": [
                {
                    "_id": "test-match_1",
                    "_source": {
                        "match_id": "test-match",
                        "point_id": 1,
                        "set_num": 1,
                        "player_A": "Player A",
                        "player_B": "Player B",
                        "winner": "Player A",
                        "serveur": "Player A",
                        "nb_coups": 5,
                        "dernier_coup": "topspin",
                        "faute_type": "pt_gagne"
                    }
                },
                {
                    "_id": "test-match_2",
                    "_source": {
                        "match_id": "test-match",
                        "point_id": 2,
                        "set_num": 1,
                        "player_A": "Player A",
                        "player_B": "Player B",
                        "winner": "Player B",
                        "serveur": "Player B",
                        "nb_coups": 3,
                        "dernier_coup": "flip",
                        "faute_type": "filet"
                    }
                }
            ]
        }
    }


@pytest.fixture
def mock_es_available(monkeypatch):
    """Mock Elasticsearch as available."""
    import routers.search as search_module
    
    def mock_check_connection():
        return True
    
    def mock_check_index():
        return True
    
    monkeypatch.setattr(search_module, "check_es_connection", mock_check_connection)
    monkeypatch.setattr(search_module, "check_index_exists", mock_check_index)


@pytest.fixture
def mock_es_unavailable(monkeypatch):
    """Mock Elasticsearch as unavailable."""
    import routers.search as search_module
    
    def mock_check_connection():
        return False
    
    monkeypatch.setattr(search_module, "check_es_connection", mock_check_connection)
