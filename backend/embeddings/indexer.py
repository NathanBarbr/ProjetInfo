"""
Module pour indexer les embeddings dans Elasticsearch.
Supporte la recherche hybride (filtres + similarité vectorielle).
"""

import json
from typing import List, Dict, Any, Optional
import pandas as pd
import numpy as np
from pathlib import Path

try:
    from elasticsearch import Elasticsearch
    from elasticsearch.helpers import bulk
    HAS_ELASTICSEARCH = True
except ImportError:
    HAS_ELASTICSEARCH = False
    print("[WARNING] elasticsearch non installe. Installez-le avec: pip install elasticsearch")


class ElasticSearchIndexer:
    """
    Gère l'indexation et la recherche vectorielle dans Elasticsearch.
    """
    
    INDEX_NAME = "tennis_points"
    
    def __init__(
        self, 
        host: str = "http://localhost:9200",
        embedding_dim: int = 384  # Dimension pour MiniLM
    ):
        """
        Initialise la connexion à Elasticsearch.
        
        Args:
            host: URL de l'instance Elasticsearch
            embedding_dim: Dimension des vecteurs d'embedding
        """
        self.host = host
        self.embedding_dim = embedding_dim
        self.client = None
        
    def connect(self) -> bool:
        """
        Établit la connexion à Elasticsearch.
        
        Returns:
            True si la connexion est réussie
        """
        if not HAS_ELASTICSEARCH:
            raise ImportError(
                "elasticsearch n'est pas installé. "
                "Installez-le avec: pip install elasticsearch"
            )
        
        print(f"🔄 Connexion à Elasticsearch ({self.host})...")
        
        try:
            self.client = Elasticsearch(
                self.host,
                verify_certs=False,
                request_timeout=30
            )
            
            if self.client.ping():
                info = self.client.info()
                print(f"✅ Connecté à Elasticsearch {info['version']['number']}")
                return True
            else:
                print("❌ Ping échoué - Elasticsearch ne répond pas")
                return False
                
        except Exception as e:
            print(f"❌ Erreur de connexion: {e}")
            print(f"   Vérifiez que Elasticsearch est lancé sur {self.host}")
            return False
    
    def create_index(self, delete_existing: bool = False) -> None:
        """
        Crée l'index Elasticsearch avec le mapping pour les vecteurs.
        
        Args:
            delete_existing: Si True, supprime l'index existant
        """
        if self.client is None:
            self.connect()
            
        # Suppression si demandé
        if delete_existing and self.client.indices.exists(index=self.INDEX_NAME):
            print(f"🗑️ Suppression de l'index existant '{self.INDEX_NAME}'...")
            self.client.indices.delete(index=self.INDEX_NAME)
        
        # Vérifier si l'index existe déjà
        if self.client.indices.exists(index=self.INDEX_NAME):
            print(f"ℹ️ L'index '{self.INDEX_NAME}' existe déjà")
            return
        
        # Mapping avec dense_vector pour la recherche vectorielle
        mapping = {
            "settings": {
                "number_of_shards": 1,
                "number_of_replicas": 0
            },
            "mappings": {
                "properties": {
                    # Champs textuels pour filtres et recherche full-text
                    "match_id": {"type": "keyword"},
                    "point_id": {"type": "integer"},
                    "set_num": {"type": "integer"},
                    "score_A": {"type": "integer"},
                    "score_B": {"type": "integer"},
                    "serveur": {"type": "keyword"},
                    "winner": {"type": "keyword"},
                    "nb_coups": {"type": "integer"},
                    "player_A": {"type": "keyword"},
                    "player_B": {"type": "keyword"},
                    "competition": {"type": "keyword"},
                    "date": {"type": "date", "format": "yyyy-MM-dd||epoch_millis"},
                    
                    # Séquences (pour recherche full-text)
                    "sequence_coups": {"type": "text"},
                    "sequence_effets": {"type": "text"},
                    "sequence_lateralites": {"type": "text"},
                    "sequence_zones": {"type": "text"},
                    
                    # Caractéristiques du service
                    "service_lateralite": {"type": "keyword"},
                    "service_zone": {"type": "keyword"},
                    
                    # Fin de point
                    "faute_type": {"type": "keyword"},
                    "faute_lateralite": {"type": "keyword"},
                    "dernier_coup": {"type": "keyword"},
                    "derniere_zone": {"type": "keyword"},
                    
                    # Clip vidéo
                    "clip_path": {"type": "keyword"},
                    
                    # Description textuelle générée
                    "description": {"type": "text", "analyzer": "french"},
                    
                    # Vecteur d'embedding pour recherche par similarité
                    "embedding": {
                        "type": "dense_vector",
                        "dims": self.embedding_dim,
                        "index": True,
                        "similarity": "cosine"
                    }
                }
            }
        }
        
        print(f"📦 Création de l'index '{self.INDEX_NAME}'...")
        self.client.indices.create(index=self.INDEX_NAME, body=mapping)
        print(f"✅ Index '{self.INDEX_NAME}' créé avec succès!")
    
    def index_points(
        self,
        df: pd.DataFrame,
        descriptions: List[str],
        embeddings: np.ndarray,
        batch_size: int = 100
    ) -> int:
        """
        Indexe les points avec leurs embeddings dans Elasticsearch.
        
        Args:
            df: DataFrame des points
            descriptions: Descriptions textuelles générées
            embeddings: Vecteurs d'embedding
            batch_size: Taille des batches pour l'indexation
            
        Returns:
            Nombre de documents indexés
        """
        if self.client is None:
            self.connect()
        
        def generate_actions():
            for idx, (_, row) in enumerate(df.iterrows()):
                doc = row.to_dict()
                
                # Ajouter la description et l'embedding
                doc["description"] = descriptions[idx]
                doc["embedding"] = embeddings[idx].tolist()
                
                # Nettoyer les valeurs NaN (attention aux arrays numpy)
                def clean_value(v):
                    if isinstance(v, np.ndarray):
                        return v  # Les arrays sont déjà propres
                    try:
                        return v if pd.notna(v) else None
                    except (ValueError, TypeError):
                        return v
                
                doc = {k: clean_value(v) for k, v in doc.items()}
                
                yield {
                    "_index": self.INDEX_NAME,
                    "_id": f"{doc.get('match_id', 'unknown')}_{doc.get('point_id', idx)}",
                    "_source": doc
                }
        
        print(f"🔄 Indexation de {len(df)} points...")
        success, errors = bulk(
            self.client,
            generate_actions(),
            chunk_size=batch_size,
            raise_on_error=False
        )
        
        if errors:
            print(f"⚠️ {len(errors)} erreurs lors de l'indexation")
            for error in errors[:5]:
                print(f"   - {error}")
        
        print(f"✅ {success} documents indexés avec succès!")
        return success
    
    def search_similar(
        self,
        query_embedding: np.ndarray,
        k: int = 10,
        filters: Optional[Dict[str, Any]] = None
    ) -> List[Dict[str, Any]]:
        """
        Recherche les points les plus similaires par embedding.
        
        Args:
            query_embedding: Vecteur d'embedding de la requête
            k: Nombre de résultats à retourner
            filters: Filtres optionnels (serveur, winner, etc.)
            
        Returns:
            Liste des points similaires avec leurs scores
        """
        if self.client is None:
            self.connect()
        
        # Construction de la requête kNN
        knn_query = {
            "field": "embedding",
            "query_vector": query_embedding.tolist(),
            "k": k,
            "num_candidates": k * 10  # Plus de candidats pour meilleure précision
        }
        
        # Ajout des filtres si présents
        if filters:
            filter_clauses = []
            for field, value in filters.items():
                if value is not None:
                    if isinstance(value, list):
                        filter_clauses.append({"terms": {field: value}})
                    else:
                        filter_clauses.append({"term": {field: value}})
            
            if filter_clauses:
                knn_query["filter"] = {"bool": {"must": filter_clauses}}
        
        # Exécution de la recherche
        response = self.client.search(
            index=self.INDEX_NAME,
            knn=knn_query,
            size=k,
            source_excludes=["embedding"]  # Ne pas retourner les embeddings volumineux
        )
        
        # Formatage des résultats
        results = []
        for hit in response["hits"]["hits"]:
            result = hit["_source"]
            result["_score"] = hit["_score"]
            result["_id"] = hit["_id"]
            results.append(result)
        
        return results
    
    def hybrid_search(
        self,
        query_embedding: np.ndarray,
        text_query: Optional[str] = None,
        k: int = 10,
        filters: Optional[Dict[str, Any]] = None,
        vector_weight: float = 0.7
    ) -> List[Dict[str, Any]]:
        """
        Recherche hybride combinant similarité vectorielle et full-text.
        
        Args:
            query_embedding: Vecteur d'embedding
            text_query: Requête textuelle optionnelle
            k: Nombre de résultats
            filters: Filtres optionnels
            vector_weight: Poids de la recherche vectorielle (0-1)
            
        Returns:
            Liste des résultats combinés
        """
        if self.client is None:
            self.connect()
        
        # Partie kNN
        knn_query = {
            "field": "embedding",
            "query_vector": query_embedding.tolist(),
            "k": k,
            "num_candidates": k * 10,
            "boost": vector_weight
        }
        
        # Partie textuelle
        query_body = {"bool": {"should": []}}
        
        if text_query:
            query_body["bool"]["should"].append({
                "multi_match": {
                    "query": text_query,
                    "fields": ["description", "sequence_effets", "sequence_coups"],
                    "boost": 1 - vector_weight
                }
            })
        
        # Filtres
        if filters:
            filter_clauses = []
            for field, value in filters.items():
                if value is not None:
                    if isinstance(value, list):
                        filter_clauses.append({"terms": {field: value}})
                    else:
                        filter_clauses.append({"term": {field: value}})
            
            if filter_clauses:
                query_body["bool"]["filter"] = filter_clauses
                knn_query["filter"] = {"bool": {"must": filter_clauses}}
        
        # Exécution
        response = self.client.search(
            index=self.INDEX_NAME,
            knn=knn_query,
            query=query_body if query_body["bool"]["should"] else None,
            size=k,
            source_excludes=["embedding"]
        )
        
        results = []
        for hit in response["hits"]["hits"]:
            result = hit["_source"]
            result["_score"] = hit["_score"]
            result["_id"] = hit["_id"]
            results.append(result)
        
        return results
    
    def get_stats(self) -> Dict[str, Any]:
        """Retourne des statistiques sur l'index."""
        if self.client is None:
            self.connect()
            
        if not self.client.indices.exists(index=self.INDEX_NAME):
            return {"exists": False}
        
        stats = self.client.indices.stats(index=self.INDEX_NAME)
        count = self.client.count(index=self.INDEX_NAME)
        
        return {
            "exists": True,
            "doc_count": count["count"],
            "size_bytes": stats["indices"][self.INDEX_NAME]["total"]["store"]["size_in_bytes"]
        }
    
    def get_highlight_embedding(self) -> Optional[np.ndarray]:
        """
        Calcule l'embedding de référence pour les "beaux points" (highlights).
        
        Un "beau point" est défini comme:
        - faute_type = "pt_gagne" (point gagnant, pas une faute)
        - nb_coups >= 8 (rallye long)
        
        Returns:
            L'embedding moyen des beaux points, ou None si aucun trouvé
        """
        if self.client is None:
            self.connect()
        
        # Rechercher les "beaux points"
        query = {
            "bool": {
                "must": [
                    {"term": {"faute_type": "pt_gagne"}},
                    {"range": {"nb_coups": {"gte": 8}}}
                ]
            }
        }
        
        response = self.client.search(
            index=self.INDEX_NAME,
            query=query,
            size=50,  # Prendre les 50 meilleurs pour calculer la moyenne
            _source=["embedding"]
        )
        
        hits = response["hits"]["hits"]
        if not hits:
            return None
        
        # Calculer la moyenne des embeddings
        embeddings = [np.array(hit["_source"]["embedding"]) for hit in hits]
        avg_embedding = np.mean(embeddings, axis=0)
        
        return avg_embedding
    
    def get_documents_embeddings(self, doc_ids: List[str]) -> List[np.ndarray]:
        """
        Récupère les embeddings pour une liste d'IDs de documents.
        
        Args:
            doc_ids: Liste d'IDs de documents
            
        Returns:
            Liste des embeddings correspondants
        """
        if self.client is None:
            self.connect()
        
        if not doc_ids:
            return []
        
        response = self.client.mget(
            index=self.INDEX_NAME,
            ids=doc_ids,
            _source=["embedding"]
        )
        
        embeddings = []
        for doc in response["docs"]:
            if doc.get("found") and "embedding" in doc.get("_source", {}):
                embeddings.append(np.array(doc["_source"]["embedding"]))
        
        return embeddings
    
    def search_similar_excluding(
        self,
        query_embedding: np.ndarray,
        exclude_ids: List[str],
        k: int = 6,
        filters: Optional[Dict[str, Any]] = None
    ) -> List[Dict[str, Any]]:
        """
        Recherche les points similaires en excluant certains IDs.
        
        Utile pour les recommandations "vous pourriez aimer" après filtrage.
        
        Args:
            query_embedding: Vecteur d'embedding de référence
            exclude_ids: IDs à exclure des résultats
            k: Nombre de résultats à retourner
            filters: Filtres optionnels
            
        Returns:
            Liste des points similaires (sans ceux exclus)
        """
        if self.client is None:
            self.connect()
        
        # Construction de la requête kNN avec exclusion
        knn_query = {
            "field": "embedding",
            "query_vector": query_embedding.tolist(),
            "k": k + len(exclude_ids),  # Demander plus pour compenser les exclusions
            "num_candidates": (k + len(exclude_ids)) * 10
        }
        
        # Filtre d'exclusion
        filter_clauses = []
        if exclude_ids:
            filter_clauses.append({"bool": {"must_not": {"ids": {"values": exclude_ids}}}})
        
        # Ajout des filtres additionnels si présents
        if filters:
            for field, value in filters.items():
                if value is not None:
                    if isinstance(value, list):
                        filter_clauses.append({"terms": {field: value}})
                    else:
                        filter_clauses.append({"term": {field: value}})
        
        if filter_clauses:
            knn_query["filter"] = {"bool": {"must": filter_clauses}}
        
        # Exécution de la recherche
        response = self.client.search(
            index=self.INDEX_NAME,
            knn=knn_query,
            size=k,
            source_excludes=["embedding"]
        )
        
        # Formatage des résultats
        results = []
        for hit in response["hits"]["hits"]:
            result = hit["_source"]
            result["_score"] = hit["_score"]
            result["_id"] = hit["_id"]
            results.append(result)
        
        return results
    
    def search_by_highlight_similarity(
        self,
        k: int = 20,
        filters: Optional[Dict[str, Any]] = None
    ) -> List[Dict[str, Any]]:
        """
        Recherche les points triés par similarité aux "beaux points".
        
        Args:
            k: Nombre de résultats
            filters: Filtres optionnels
            
        Returns:
            Points triés par similarité au profil "highlight"
        """
        # Obtenir l'embedding de référence des highlights
        highlight_embedding = self.get_highlight_embedding()
        
        if highlight_embedding is None:
            # Fallback: retourner une recherche normale
            return self.search_similar(
                np.zeros(self.embedding_dim),
                k=k,
                filters=filters
            )
        
        return self.search_similar(
            highlight_embedding,
            k=k,
            filters=filters
        )


if __name__ == "__main__":
    # Test de connexion
    indexer = ElasticSearchIndexer()
    
    try:
        if indexer.connect():
            stats = indexer.get_stats()
            print(f"\n📊 Stats de l'index: {stats}")
    except Exception as e:
        print(f"❌ Erreur: {e}")
        print("\n💡 Assurez-vous qu'Elasticsearch est lancé:")
        print("   docker compose up -d elasticsearch")
