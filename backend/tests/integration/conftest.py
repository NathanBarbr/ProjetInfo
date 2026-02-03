"""
Fixtures for integration tests.
"""

import pytest
import time
from elasticsearch import Elasticsearch
from pathlib import Path


ES_HOST = "http://localhost:9200"
ES_TEST_INDEX = "pingpong_points_test"


@pytest.fixture(scope="session")
def es_client():
    """Create a real Elasticsearch client for testing."""
    client = Elasticsearch(ES_HOST)
    
    # Wait for ES to be ready
    max_retries = 30
    for i in range(max_retries):
        try:
            if client.ping():
                break
        except Exception:
            if i == max_retries - 1:
                pytest.skip("Elasticsearch is not available")
            time.sleep(1)
    
    yield client
    client.close()


@pytest.fixture
def es_test_index(es_client):
    """Create and clean up a test index."""
    # Delete index if it exists
    if es_client.indices.exists(index=ES_TEST_INDEX):
        es_client.indices.delete(index=ES_TEST_INDEX)
    
    # Create index with mapping
    es_client.indices.create(
        index=ES_TEST_INDEX,
        body={
            "mappings": {
                "properties": {
                    "match_id": {"type": "keyword"},
                    "point_id": {"type": "integer"},
                    "set_num": {"type": "integer"},
                    "player_A": {"type": "keyword"},
                    "player_B": {"type": "keyword"},
                    "winner": {"type": "keyword"},
                    "serveur": {"type": "keyword"},
                    "nb_coups": {"type": "integer"},
                    "dernier_coup": {"type": "keyword"},
                    "faute_type": {"type": "keyword"},
                    "sequence_coups": {"type": "text"},
                    "sequence_effets": {"type": "text"},
                    "sequence_zones": {"type": "text"},
                    "service_zone": {"type": "keyword"},
                    "service_lateralite": {"type": "keyword"}
                }
            }
        }
    )
    
    yield ES_TEST_INDEX
    
    # Cleanup
    if es_client.indices.exists(index=ES_TEST_INDEX):
        es_client.indices.delete(index=ES_TEST_INDEX)


@pytest.fixture
def sample_points_data():
    """Sample points data for testing."""
    return [
        {
            "match_id": "test-match-1",
            "point_id": 1,
            "set_num": 1,
            "player_A": "Player A",
            "player_B": "Player B",
            "winner": "Player A",
            "serveur": "Player A",
            "nb_coups": 5,
            "dernier_coup": "topspin",
            "faute_type": "pt_gagne",
            "sequence_coups": "service topspin block topspin smash",
            "sequence_effets": "topspin topspin block topspin topspin",
            "sequence_zones": "d3 m1 g2 m1 d3"
        },
        {
            "match_id": "test-match-1",
            "point_id": 2,
            "set_num": 1,
            "player_A": "Player A",
            "player_B": "Player B",
            "winner": "Player B",
            "serveur": "Player B",
            "nb_coups": 3,
            "dernier_coup": "flip",
            "faute_type": "filet",
            "sequence_coups": "service flip block",
            "sequence_effets": "topspin flip block",
            "sequence_zones": "g2 d3 m1"
        },
        {
            "match_id": "test-match-1",
            "point_id": 3,
            "set_num": 2,
            "player_A": "Player A",
            "player_B": "Player B",
            "winner": "Player A",
            "serveur": "Player A",
            "nb_coups": 8,
            "dernier_coup": "topspin",
            "faute_type": "out",
            "sequence_coups": "service block topspin block topspin block topspin smash",
            "sequence_effets": "topspin block topspin block topspin block topspin topspin",
            "sequence_zones": "d3 m1 g2 m1 d3 m1 g2 d3"
        }
    ]
