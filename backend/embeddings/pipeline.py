"""
Pipeline complet pour embedder le CSV et l'indexer dans Elasticsearch.
Script autonome qui peut être exécuté directement.
"""

import os
import sys
import argparse
from pathlib import Path

# Ajouter le répertoire parent au path
sys.path.insert(0, str(Path(__file__).parent.parent))

from embeddings.embedder import PointEmbedder, load_csv_data
from embeddings.indexer import ElasticSearchIndexer


def run_embedding_pipeline(
    csv_path: str,
    es_host: str = "http://localhost:9200",
    model_name: str = "paraphrase-multilingual-MiniLM-L12-v2",
    recreate_index: bool = False,
    batch_size: int = 32
) -> dict:
    """
    Exécute le pipeline complet d'embedding et d'indexation.
    
    Args:
        csv_path: Chemin vers le fichier CSV
        es_host: URL d'Elasticsearch
        model_name: Nom du modèle sentence-transformers
        recreate_index: Si True, recrée l'index depuis zéro
        batch_size: Taille des batches
        
    Returns:
        Dictionnaire avec les statistiques du pipeline
    """
    stats = {}
    
    # 1. Charger les données
    print("\n" + "=" * 60)
    print("📂 ÉTAPE 1: Chargement des données CSV")
    print("=" * 60)
    
    df = load_csv_data(csv_path)
    stats["total_points"] = len(df)
    print(f"   ✅ {len(df)} points chargés depuis {csv_path}")
    
    # 2. Créer les embeddings
    print("\n" + "=" * 60)
    print("🧮 ÉTAPE 2: Génération des embeddings")
    print("=" * 60)
    
    embedder = PointEmbedder(model_name=model_name)
    descriptions, embeddings = embedder.embed_dataframe(df, batch_size=batch_size)
    
    stats["embedding_dim"] = embeddings.shape[1]
    stats["model"] = model_name
    print(f"   ✅ Embeddings générés: shape = {embeddings.shape}")
    
    # 3. Indexer dans Elasticsearch
    print("\n" + "=" * 60)
    print("📦 ÉTAPE 3: Indexation dans Elasticsearch")
    print("=" * 60)
    
    indexer = ElasticSearchIndexer(
        host=es_host,
        embedding_dim=embeddings.shape[1]
    )
    
    if not indexer.connect():
        raise ConnectionError("Impossible de se connecter à Elasticsearch")
    
    indexer.create_index(delete_existing=recreate_index)
    indexed = indexer.index_points(df, descriptions, embeddings, batch_size=100)
    
    stats["indexed_docs"] = indexed
    stats["es_stats"] = indexer.get_stats()
    
    # Résumé
    print("\n" + "=" * 60)
    print("📊 RÉSUMÉ DU PIPELINE")
    print("=" * 60)
    print(f"   Points traités:     {stats['total_points']}")
    print(f"   Documents indexés:  {stats['indexed_docs']}")
    print(f"   Dimension embeddings: {stats['embedding_dim']}")
    print(f"   Modèle utilisé:     {stats['model']}")
    print("=" * 60)
    
    return stats


def test_search(
    query: str,
    es_host: str = "http://localhost:9200",
    model_name: str = "paraphrase-multilingual-MiniLM-L12-v2",
    k: int = 5,
    filters: dict = None
) -> list:
    """
    Teste la recherche par similarité.
    
    Args:
        query: Texte de la requête
        es_host: URL d'Elasticsearch
        model_name: Nom du modèle
        k: Nombre de résultats
        filters: Filtres optionnels
        
    Returns:
        Liste des résultats
    """
    print(f"\n🔍 Recherche: '{query}'")
    if filters:
        print(f"   Filtres: {filters}")
    
    # Générer l'embedding de la requête
    embedder = PointEmbedder(model_name=model_name)
    query_embedding = embedder.embed_query(query)
    
    # Rechercher
    indexer = ElasticSearchIndexer(host=es_host)
    indexer.connect()
    
    results = indexer.search_similar(
        query_embedding=query_embedding,
        k=k,
        filters=filters
    )
    
    print(f"\n📋 {len(results)} résultats trouvés:")
    print("-" * 60)
    
    for i, result in enumerate(results, 1):
        score = result.get("_score", 0)
        match_id = result.get("match_id", "?")
        point_id = result.get("point_id", "?")
        desc = result.get("description", "")[:100]
        winner = result.get("winner", "?")
        
        print(f"\n{i}. Score: {score:.4f}")
        print(f"   Match: {match_id}, Point: {point_id}")
        print(f"   Gagnant: {winner}")
        print(f"   {desc}...")
    
    return results


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Pipeline d'embedding pour tennis de table")
    
    subparsers = parser.add_subparsers(dest="command", help="Commandes disponibles")
    
    # Sous-commande: index
    index_parser = subparsers.add_parser("index", help="Indexer le CSV")
    index_parser.add_argument(
        "--csv", 
        default="data/points_index.csv",
        help="Chemin vers le fichier CSV"
    )
    index_parser.add_argument(
        "--es-host",
        default="http://localhost:9200",
        help="URL d'Elasticsearch"
    )
    index_parser.add_argument(
        "--model",
        default="paraphrase-multilingual-MiniLM-L12-v2",
        help="Modèle sentence-transformers"
    )
    index_parser.add_argument(
        "--recreate",
        action="store_true",
        help="Recréer l'index depuis zéro"
    )
    
    # Sous-commande: search
    search_parser = subparsers.add_parser("search", help="Rechercher des points")
    search_parser.add_argument("query", help="Texte de recherche")
    search_parser.add_argument(
        "--es-host",
        default="http://localhost:9200",
        help="URL d'Elasticsearch"
    )
    search_parser.add_argument("-k", type=int, default=5, help="Nombre de résultats")
    search_parser.add_argument("--winner", help="Filtrer par gagnant")
    search_parser.add_argument("--serveur", help="Filtrer par serveur")
    
    args = parser.parse_args()
    
    if args.command == "index":
        # Résoudre le chemin du CSV
        csv_path = args.csv
        if not os.path.isabs(csv_path):
            csv_path = os.path.join(os.path.dirname(__file__), "..", csv_path)
        
        run_embedding_pipeline(
            csv_path=csv_path,
            es_host=args.es_host,
            model_name=args.model,
            recreate_index=args.recreate
        )
        
    elif args.command == "search":
        filters = {}
        if hasattr(args, "winner") and args.winner:
            filters["winner"] = args.winner
        if hasattr(args, "serveur") and args.serveur:
            filters["serveur"] = args.serveur
            
        test_search(
            query=args.query,
            es_host=args.es_host,
            k=args.k,
            filters=filters if filters else None
        )
        
    else:
        parser.print_help()
