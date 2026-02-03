"""
Integration tests for Elasticsearch functionality.
These tests require a running Elasticsearch instance.

Run with: pytest tests/integration/test_elasticsearch_integration.py -v -m integration
Skip with: pytest tests/ -v -m "not integration"
"""

import pytest
import time
from elasticsearch import Elasticsearch


pytestmark = pytest.mark.integration  # Mark all tests in this file as integration


class TestElasticsearchConnection:
    """Test Elasticsearch connectivity."""
    
    def test_es_connection(self, es_client):
        """Test that we can connect to Elasticsearch."""
        assert es_client.ping()
        info = es_client.info()
        assert "version" in info
    
    def test_es_cluster_health(self, es_client):
        """Test cluster health."""
        health = es_client.cluster.health()
        assert health["status"] in ["green", "yellow", "red"]


class TestElasticsearchIndexing:
    """Test indexing operations."""
    
    def test_index_creation(self, es_client, es_test_index):
        """Test that test index is created."""
        assert es_client.indices.exists(index=es_test_index)
    
    def test_index_single_document(self, es_client, es_test_index, sample_points_data):
        """Test indexing a single document."""
        doc = sample_points_data[0]
        doc_id = f"{doc['match_id']}_{doc['point_id']}"
        
        # Index document
        result = es_client.index(
            index=es_test_index,
            id=doc_id,
            body=doc
        )
        
        assert result["result"] in ["created", "updated"]
        
        # Refresh index to make document searchable
        es_client.indices.refresh(index=es_test_index)
        
        # Retrieve document
        retrieved = es_client.get(index=es_test_index, id=doc_id)
        assert retrieved["found"]
        assert retrieved["_source"]["match_id"] == doc["match_id"]
    
    def test_bulk_indexing(self, es_client, es_test_index, sample_points_data):
        """Test bulk indexing multiple documents."""
        from elasticsearch.helpers import bulk
        
        # Prepare bulk actions
        actions = []
        for doc in sample_points_data:
            actions.append({
                "_index": es_test_index,
                "_id": f"{doc['match_id']}_{doc['point_id']}",
                "_source": doc
            })
        
        # Bulk index
        success, failed = bulk(es_client, actions)
        assert success == len(sample_points_data)
        assert failed == 0
        
        # Refresh and count
        es_client.indices.refresh(index=es_test_index)
        count = es_client.count(index=es_test_index)
        assert count["count"] == len(sample_points_data)


class TestElasticsearchSearch:
    """Test search functionality."""
    
    @pytest.fixture(autouse=True)
    def setup_data(self, es_client, es_test_index, sample_points_data):
        """Index sample data before each test."""
        from elasticsearch.helpers import bulk
        
        actions = [
            {
                "_index": es_test_index,
                "_id": f"{doc['match_id']}_{doc['point_id']}",
                "_source": doc
            }
            for doc in sample_points_data
        ]
        
        bulk(es_client, actions)
        es_client.indices.refresh(index=es_test_index)
    
    def test_match_all_query(self, es_client, es_test_index):
        """Test basic match_all query."""
        result = es_client.search(
            index=es_test_index,
            body={"query": {"match_all": {}}}
        )
        
        assert result["hits"]["total"]["value"] == 3
    
    def test_term_query(self, es_client, es_test_index):
        """Test exact term query."""
        result = es_client.search(
            index=es_test_index,
            body={
                "query": {
                    "term": {"winner": "Player A"}
                }
            }
        )
        
        assert result["hits"]["total"]["value"] == 2
        for hit in result["hits"]["hits"]:
            assert hit["_source"]["winner"] == "Player A"
    
    def test_range_query(self, es_client, es_test_index):
        """Test range query for nb_coups."""
        result = es_client.search(
            index=es_test_index,
            body={
                "query": {
                    "range": {
                        "nb_coups": {"gte": 5, "lte": 10}
                    }
                }
            }
        )
        
        assert result["hits"]["total"]["value"] == 2
        for hit in result["hits"]["hits"]:
            assert 5 <= hit["_source"]["nb_coups"] <= 10
    
    def test_match_query(self, es_client, es_test_index):
        """Test full-text match query."""
        result = es_client.search(
            index=es_test_index,
            body={
                "query": {
                    "match": {"sequence_coups": "topspin"}
                }
            }
        )
        
        assert result["hits"]["total"]["value"] >= 1
    
    def test_bool_query(self, es_client, es_test_index):
        """Test boolean query with multiple conditions."""
        result = es_client.search(
            index=es_test_index,
            body={
                "query": {
                    "bool": {
                        "must": [
                            {"term": {"winner": "Player A"}},
                            {"range": {"nb_coups": {"gte": 5}}}
                        ]
                    }
                }
            }
        )
        
        assert result["hits"]["total"]["value"] == 2


class TestElasticsearchAggregations:
    """Test aggregations functionality."""
    
    @pytest.fixture(autouse=True)
    def setup_data(self, es_client, es_test_index, sample_points_data):
        """Index sample data before each test."""
        from elasticsearch.helpers import bulk
        
        actions = [
            {
                "_index": es_test_index,
                "_id": f"{doc['match_id']}_{doc['point_id']}",
                "_source": doc
            }
            for doc in sample_points_data
        ]
        
        bulk(es_client, actions)
        es_client.indices.refresh(index=es_test_index)
    
    def test_terms_aggregation(self, es_client, es_test_index):
        """Test terms aggregation for winners."""
        result = es_client.search(
            index=es_test_index,
            body={
                "size": 0,
                "aggs": {
                    "winners": {
                        "terms": {"field": "winner"}
                    }
                }
            }
        )
        
        agg = result["aggregations"]["winners"]
        buckets = agg["buckets"]
        
        assert len(buckets) == 2
        player_a_bucket = next(b for b in buckets if b["key"] == "Player A")
        assert player_a_bucket["doc_count"] == 2
    
    def test_stats_aggregation(self, es_client, es_test_index):
        """Test stats aggregation for nb_coups."""
        result = es_client.search(
            index=es_test_index,
            body={
                "size": 0,
                "aggs": {
                    "coups_stats": {
                        "stats": {"field": "nb_coups"}
                    }
                }
            }
        )
        
        stats = result["aggregations"]["coups_stats"]
        assert stats["count"] == 3
        assert stats["min"] == 3
        assert stats["max"] == 8
        assert stats["avg"] > 0
