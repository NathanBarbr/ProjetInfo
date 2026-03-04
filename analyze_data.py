import json
import requests
import sys

try:
    print("Fetching data from API...")
    response = requests.get("http://localhost:8001/api/visualization/embeddings?method=pca")
    if response.status_code != 200:
        print(f"Error fetching data: {response.status_code}")
        print(response.text)
        sys.exit(1)
        
    data = response.json()
    points = data.get('points', [])
    
    print(f"Total points: {len(points)}")
    
    # Analyze fields to see what values we actually have
    fields = ['winner', 'serveur', 'set_num', 'faute_type', 'winning_shot', 'nb_coups']
    
    for field in fields:
        values = set()
        for p in points:
            val = p.get(field)
            # Add to set even if None to see if we have missing data
            values.add(str(val))
            
        print(f"Unique values for '{field}': {sorted(list(values))}")
            
except Exception as e:
    print(f"Error: {e}")
