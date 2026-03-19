"""
Module pour générer des embeddings à partir des données de points de tennis de table.
Utilise sentence-transformers pour créer des vecteurs sémantiques.
"""

import pandas as pd
import numpy as np
from typing import List, Dict, Any, Optional
from pathlib import Path
from collections import Counter

try:
    from sentence_transformers import SentenceTransformer
    HAS_SENTENCE_TRANSFORMERS = True
except ImportError:
    HAS_SENTENCE_TRANSFORMERS = False
    print("[WARNING] sentence-transformers non installe. Installez-le avec: pip install sentence-transformers")


class PointEmbedder:
    """
    Génère des embeddings pour les points de tennis de table.
    Transforme les données structurées en descriptions textuelles puis en vecteurs.
    """
    
    # Mapping pour rendre les données plus lisibles
    EFFECT_MAPPING = {
        "service": "service",
        "topspin": "topspin offensif",
        "block": "bloc défensif",
        "poussette": "poussette courte",
        "flip": "flip agressif",
        "coupe": "coupe coupée",
        "inconnu": ""
    }
    
    LATERALITY_MAPPING = {
        "coup_droit": "coup droit",
        "revers": "revers"
    }
    
    ZONE_MAPPING = {
        "g1": "gauche courte",
        "g2": "gauche mi-table",
        "g3": "gauche fond de table",
        "m1": "milieu court",
        "m2": "milieu mi-table", 
        "m3": "milieu fond de table",
        "d1": "droite courte",
        "d2": "droite mi-table",
        "d3": "droite fond de table"
    }
    
    FAULT_MAPPING = {
        "out": "balle sortie",
        "filet": "balle dans le filet",
        "pt_gagne": "point gagnant"
    }
    
    def __init__(self, model_name: str = "paraphrase-multilingual-MiniLM-L12-v2"):
        """
        Initialise l'embedder avec un modèle de sentence-transformers.
        
        Args:
            model_name: Nom du modèle à utiliser. Par défaut un modèle multilingue
                       compact et performant pour le français.
        """
        self.model_name = model_name
        self.model = None
        self.embedding_dim = None
        
    def load_model(self) -> None:
        """Charge le modèle de sentence-transformers."""
        if not HAS_SENTENCE_TRANSFORMERS:
            raise ImportError(
                "sentence-transformers n'est pas installé. "
                "Installez-le avec: pip install sentence-transformers"
            )
        
        print(f"Chargement du modèle '{self.model_name}'...")
        self.model = SentenceTransformer(self.model_name)
        self.embedding_dim = self.model.get_sentence_embedding_dimension()
        print(f"Modèle chargé! Dimension des embeddings: {self.embedding_dim}")
        
    def _format_sequence(self, sequence: str, mapping: Dict[str, str]) -> str:
        """Formate une séquence CSV en texte lisible."""
        if pd.isna(sequence) or not sequence:
            return ""
        
        items = [s.strip() for s in str(sequence).split(",")]
        formatted = [mapping.get(item, item) for item in items if item]
        return ", ".join(formatted)
    
    def _create_point_description(self, row: pd.Series) -> str:
        """
        Crée une description textuelle complète d'un point.
        Cette description sera ensuite convertie en embedding.
        """
        parts = []
        
        # Contexte du match
        player_a = row.get("player_A", "").replace("-", " ")
        player_b = row.get("player_B", "").replace("-", " ")
        if player_a and player_b:
            parts.append(f"Match entre {player_a} et {player_b}")
        
        # Set et score
        set_num = row.get("set_num", "")
        score_a = row.get("score_A", "")
        score_b = row.get("score_B", "")
        if set_num:
            parts.append(f"Set {set_num}, score {score_a}-{score_b}")
        
        # Serveur et gagnant
        serveur = str(row.get("serveur", "")).replace("-", " ")
        winner = str(row.get("winner", "")).replace("-", " ")
        if serveur:
            parts.append(f"Service de {serveur}")
        if winner:
            parts.append(f"Point gagné par {winner}")
        
        # Caractéristiques du point
        nb_coups = row.get("nb_coups", 0)
        if nb_coups:
            parts.append(f"Échange de {nb_coups} coups")
        
        # Type de service
        service_lat = self.LATERALITY_MAPPING.get(
            str(row.get("service_lateralite", "")), ""
        )
        service_zone = self.ZONE_MAPPING.get(
            str(row.get("service_zone", "")), ""
        )
        if service_lat or service_zone:
            parts.append(f"Service en {service_lat} zone {service_zone}")
        
        # Séquence des coups
        sequence_effets = row.get("sequence_effets", "")
        if sequence_effets and not pd.isna(sequence_effets):
            effets = self._format_sequence(sequence_effets, self.EFFECT_MAPPING)
            if effets:
                parts.append(f"Séquence d'effets: {effets}")
        
        sequence_lat = row.get("sequence_lateralites", "")
        if sequence_lat and not pd.isna(sequence_lat):
            lats = self._format_sequence(sequence_lat, self.LATERALITY_MAPPING)
            if lats:
                parts.append(f"Latéralités: {lats}")
        
        # Dernier coup (crucial pour la fin de point)
        dernier_coup = self.EFFECT_MAPPING.get(
            str(row.get("dernier_coup", "")), ""
        )
        derniere_zone = self.ZONE_MAPPING.get(
            str(row.get("derniere_zone", "")), ""
        )
        if dernier_coup:
            parts.append(f"Dernier coup: {dernier_coup}")
        if derniere_zone:
            parts.append(f"Dernière zone: {derniere_zone}")
        
        # Type de faute ou point gagnant
        faute_type = self.FAULT_MAPPING.get(
            str(row.get("faute_type", "")), ""
        )
        if faute_type:
            parts.append(f"Résultat: {faute_type}")
        
        return ". ".join(parts)
    
    def create_descriptions(self, df: pd.DataFrame) -> List[str]:
        """
        Crée des descriptions textuelles pour tous les points du DataFrame.
        
        Args:
            df: DataFrame contenant les données des points
            
        Returns:
            Liste des descriptions textuelles
        """
        descriptions = []
        for _, row in df.iterrows():
            desc = self._create_point_description(row)
            descriptions.append(desc)
        return descriptions
    
    def embed_texts(self, texts: List[str], batch_size: int = 32) -> np.ndarray:
        """
        Génère les embeddings pour une liste de textes.
        
        Args:
            texts: Liste de textes à embedder
            batch_size: Taille des batches pour le traitement
            
        Returns:
            Array numpy de shape (n_texts, embedding_dim)
        """
        if self.model is None:
            self.load_model()
            
        print(f"🔄 Génération des embeddings pour {len(texts)} textes...")
        embeddings = self.model.encode(
            texts,
            batch_size=batch_size,
            show_progress_bar=True,
            convert_to_numpy=True
        )
        print(f"✅ {len(embeddings)} embeddings générés!")
        return embeddings
    
    def embed_dataframe(
        self, 
        df: pd.DataFrame, 
        batch_size: int = 32
    ) -> tuple[List[str], np.ndarray]:
        """
        Pipeline complet: DataFrame -> descriptions -> embeddings.
        
        Args:
            df: DataFrame des points
            batch_size: Taille des batches
            
        Returns:
            Tuple (descriptions, embeddings)
        """
        descriptions = self.create_descriptions(df)
        embeddings = self.embed_texts(descriptions, batch_size)
        return descriptions, embeddings
    
    def embed_query(self, query: str) -> np.ndarray:
        """
        Génère l'embedding pour une requête de recherche.
        
        Args:
            query: Texte de la requête
            
        Returns:
            Vecteur d'embedding
        """
        if self.model is None:
            self.load_model()
            
        return self.model.encode(query, convert_to_numpy=True)


def load_csv_data(csv_path: str) -> pd.DataFrame:
    def _parse_zones(sequence_zones: Any) -> List[str]:
        if sequence_zones is None:
            return []
        raw = str(sequence_zones).strip()
        if not raw:
            return []
        return [z.strip().lower() for z in raw.split(",") if z.strip()]

    def _normalize_zone(zone: str) -> Optional[str]:
        if not zone:
            return None
        if zone in {"left", "middle", "right"}:
            return zone
        first = zone[0]
        if first == "g":
            return "left"
        if first == "m":
            return "middle"
        if first == "d":
            return "right"
        return None

    def _dominant_occupancy_zone(sequence_zones: Any) -> str:
        zones = [_normalize_zone(z) for z in _parse_zones(sequence_zones)]
        zones = [z for z in zones if z]
        if not zones:
            return "unknown"
        return Counter(zones).most_common(1)[0][0]

    def _movement_intensity(sequence_zones: Any) -> int:
        zones = [_normalize_zone(z) for z in _parse_zones(sequence_zones)]
        zones = [z for z in zones if z]
        if len(zones) < 2:
            return 0
        transitions = 0
        prev = zones[0]
        for z in zones[1:]:
            if z != prev:
                transitions += 1
            prev = z
        return transitions

    def _rally_intensity(nb_coups: int, movement: int) -> float:
        # 0..1 score mixing rally length and spatial movement.
        rally_component = min(1.0, max(0, int(nb_coups)) / 15.0)
        movement_component = min(1.0, max(0, int(movement)) / 8.0)
        return round((0.7 * rally_component) + (0.3 * movement_component), 4)

    """
    Charge et prépare les données du CSV.
    
    Args:
        csv_path: Chemin vers le fichier CSV
        
    Returns:
        DataFrame avec les données nettoyées
    """
    df = pd.read_csv(csv_path)
    
    # Nettoyage basique
    df = df.fillna("")
    
    # Conversion des colonnes numériques
    numeric_cols = ["set_num", "score_A", "score_B", "nb_coups", "point_id"]
    for col in numeric_cols:
        if col in df.columns:
            df[col] = pd.to_numeric(df[col], errors="coerce").fillna(0).astype(int)

    # Derived content-based features used by semantic/search/visualization.
    if "sequence_zones" in df.columns:
        df["occupancy_zone"] = df["sequence_zones"].apply(_dominant_occupancy_zone)
        df["movement_intensity"] = df["sequence_zones"].apply(_movement_intensity).astype(int)
    else:
        df["occupancy_zone"] = "unknown"
        df["movement_intensity"] = 0

    df["rally_intensity"] = df.apply(
        lambda row: _rally_intensity(row.get("nb_coups", 0), row.get("movement_intensity", 0)),
        axis=1
    )
    
    return df


if __name__ == "__main__":
    # Test du module
    import os
    
    csv_path = os.path.join(os.path.dirname(__file__), "..", "data", "points_index.csv")
    
    print("📂 Chargement des données...")
    df = load_csv_data(csv_path)
    print(f"   {len(df)} points chargés")
    
    print("\n🔧 Initialisation de l'embedder...")
    embedder = PointEmbedder()
    
    print("\n📝 Création des descriptions...")
    descriptions = embedder.create_descriptions(df)
    
    print("\n📄 Exemple de description:")
    print("-" * 50)
    print(descriptions[0])
    print("-" * 50)
    
    print("\n🧮 Génération des embeddings...")
    embeddings = embedder.embed_texts(descriptions[:5])  # Test avec 5 premiers
    print(f"   Shape des embeddings: {embeddings.shape}")

