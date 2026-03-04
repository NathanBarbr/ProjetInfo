import requests
import json

try:
    response = requests.get("http://localhost:8001/api/visualization/embeddings?method=pca")
    if response.status_code == 200:
        data = response.json()
        points = data.get('points', [])
        if points:
            print(f"Sample point clip_path: {points[0].get('clip_path')}")
            print(f"Sample point video_id: {points[0].get('video_id')}")
            print(f"Sample point match_id: {points[0].get('match_id')}")
            
            # Find one with a value if the first is empty
            for p in points[:10]:
                if p.get('clip_path'):
                    print(f"Another example: {p.get('clip_path')}")
                    break
    else:
        print("Failed to fetch")
except Exception as e:
    print(e)
