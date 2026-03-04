from elasticsearch import Elasticsearch

es = Elasticsearch("http://localhost:9200", verify_certs=False)

try:
    count = es.count(index="tennis_points")
    print(f"Total documents: {count['count']}")
    
    # Count with embeddings
    count_embeddings = es.count(index="tennis_points", body={
        "query": {
            "exists": {
                "field": "embedding"
            }
        }
    })
    print(f"Documents with embeddings: {count_embeddings['count']}")
    
    # Search a few to see structure
    resp = es.search(index="tennis_points", size=1, _source=["match_id", "point_id"])
    print("Sample doc:", resp['hits']['hits'][0]['_source'])

except Exception as e:
    print(f"Error: {e}")
