from embeddings.indexer import ElasticSearchIndexer
from routers.semantic import sketch_similarity_score


def test_sketch_similarity_prefers_matching_sequence():
    exact = sketch_similarity_score(
        query_zones=["m2", "m1", "g2"],
        query_effets=["service", "poussette", "topspin"],
        candidate_zones=["m2", "m1", "g2"],
        candidate_effets=["service", "poussette", "topspin"],
    )
    different = sketch_similarity_score(
        query_zones=["m2", "m1", "g2"],
        query_effets=["service", "poussette", "topspin"],
        candidate_zones=["d3", "d2", "d1"],
        candidate_effets=["service", "bloc", "bloc"],
    )

    assert exact > different
    assert exact > 0.95
    assert different < 0.45


def test_compute_highlight_score_supports_custom_weights():
    point = {
        "duree_secondes": 8.5,
        "nb_coups": 12,
        "faute_type": "pt_gagne",
        "dernier_coup": "topspin",
        "sequence_effets": "service,topspin,coupe",
        "sequence_lateralites": "revers,coup_droit",
        "sequence_zones": "g1,m2,d3",
        "score_A": 8,
        "score_B": 8,
        "winner": "Player A",
        "player_A": "Player A",
    }

    default_score = ElasticSearchIndexer.compute_highlight_score(point)
    pressure_only_score = ElasticSearchIndexer.compute_highlight_score(
        point,
        weights={"pressure": 100}
    )
    duration_only_score = ElasticSearchIndexer.compute_highlight_score(
        point,
        weights={"duration": 100}
    )

    assert default_score != pressure_only_score
    assert duration_only_score > pressure_only_score
    assert sum(ElasticSearchIndexer.resolve_highlight_weights({"duration": 70, "pressure": 30}).values()) == 100.0


def test_highlights_endpoint_forwards_custom_weights(client, monkeypatch):
    import routers.semantic as semantic_module

    class FakeIndexer:
        def __init__(self):
            self.calls = []

        def search_highlights(self, k=20, filters=None, weights=None):
            self.calls.append({
                "k": k,
                "filters": filters,
                "weights": weights,
            })
            return [
                {
                    "_id": "point-1",
                    "highlight_score": 91.5,
                    "match_id": "test-match",
                    "point_id": 1,
                    "player_A": "Player A",
                    "winner": "Player A",
                    "faute_type": "pt_gagne",
                    "score_A": 10,
                    "score_B": 10,
                }
            ]

        def resolve_highlight_weights(self, weights=None):
            return ElasticSearchIndexer.resolve_highlight_weights(weights)

    fake_indexer = FakeIndexer()
    monkeypatch.setattr(semantic_module, "get_indexer", lambda: fake_indexer)

    response = client.get(
        "/api/semantic/highlights"
        "?k=5"
        "&match_id=test-match"
        "&duration_weight=40"
        "&rally_depth_weight=10"
        "&effects_variety_weight=15"
        "&laterality_variety_weight=10"
        "&zone_variety_weight=10"
        "&finish_weight=10"
        "&pressure_weight=5"
    )

    assert response.status_code == 200
    data = response.json()

    assert data["mode"] == "highlights"
    assert data["applied_weights"]["duration"] == 40.0
    assert data["applied_weights"]["rally_depth"] == 10.0
    assert data["applied_weights"]["pressure"] == 5.0
    assert data["points"][0]["id"] == "point-1"
    assert fake_indexer.calls == [{
        "k": 5,
        "filters": {"match_id": "test-match"},
        "weights": {
            "duration": 40.0,
            "rally_depth": 10.0,
            "effects_variety": 15.0,
            "laterality_variety": 10.0,
            "zone_variety": 10.0,
            "finish": 10.0,
            "pressure": 5.0,
        },
    }]
