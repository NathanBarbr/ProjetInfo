"""
Script de génération de l'index des points pour Elasticsearch.

Ce script parcourt les dossiers de matchs et génère un fichier points_index.csv
qui agrège les informations de chaque point à partir des CSV sources :
- _evolution_score.csv : timestamps, scores, gagnant du point
- _graphe_simple.csv : séquence de coups encodée
- _annotation_enrichi.csv : détails de chaque coup
- _game.json : métadonnées du match

Usage:
    python generate_points_index.py                    # Traite tous les matchs
    python generate_points_index.py --match FAN-ZHENDONG_vs_TRULS-MOREGARD  # Un seul match
"""

import csv
import json
import re
from pathlib import Path
from dataclasses import dataclass, field, asdict
from typing import Optional
import argparse


@dataclass
class PointData:
    """Représente les données agrégées d'un point."""
    match_id: str
    point_id: int
    set_num: int
    score_A: int
    score_B: int
    set_A: int
    set_B: int
    serveur: str
    winner: str
    nb_coups: int
    duree_frames: int
    frame_debut: int
    frame_fin: int
    
    # Séquence de coups
    sequence_coups: str  # Ex: "service,poussette,topspin"
    sequence_lateralites: str  # Ex: "coup_droit,revers,coup_droit"
    sequence_effets: str  # Ex: "lat_droit,poussette,topspin"
    sequence_zones: str  # Ex: "m1,d3,g2"
    
    # Infos sur le service
    service_lateralite: str = ""
    service_zone: str = ""
    
    # Infos sur la fin du point
    faute_type: str = ""  # out, filet, etc.
    faute_lateralite: str = ""
    dernier_coup: str = ""
    derniere_zone: str = ""
    
    # Lien vidéo
    clip_path: str = ""
    
    # Métadonnées match
    player_A: str = ""
    player_B: str = ""
    competition: str = ""
    date: str = ""


def decode_graphe_simple(liste_coup: str) -> dict:
    """
    Décode la séquence de coups du graphe_simple.csv
    Ex: "Lateral_Droit_CD_M1 CD_D_po_D3_2 R_A_to_G3_4 Perdu"
    """
    coups = liste_coup.strip().split()
    result = {
        'nb_coups': 0,
        'sequence': [],
        'gagne': False
    }
    
    for coup in coups:
        if coup in ['Gagne', 'Perdu']:
            result['gagne'] = coup == 'Gagne'
            continue
            
        # Parse le coup
        # Format: [Lateral_]?[CD|R]_[D|A|I]_[effect]_[zone]_[num]
        result['nb_coups'] += 1
        result['sequence'].append(coup)
    
    return result


def parse_lateralite(code: str) -> str:
    """Convertit CD/R en coup_droit/revers."""
    if 'CD' in code:
        return 'coup_droit'
    elif code.startswith('R'):
        return 'revers'
    return code


def parse_effet(code: str) -> str:
    """Extrait l'effet du code coup."""
    effets = {
        'po': 'poussette',
        'to': 'topspin',
        'bl': 'block',
        'fl': 'flip',
        'sm': 'smash',
        'lo': 'lob'
    }
    for key, val in effets.items():
        if f'_{key}_' in code or code.endswith(f'_{key}'):
            return val
    if 'Lateral' in code:
        return 'service'
    return 'inconnu'


def parse_zone(code: str) -> str:
    """Extrait la zone du code coup (ex: M1, G2, D3)."""
    # Cherche le pattern zone (lettre + chiffre) à la fin ou avant le numéro
    match = re.search(r'_([GMDH][0-9])(?:_\d+)?$', code, re.IGNORECASE)
    if match:
        return match.group(1).lower()
    return ""


def load_evolution_score(match_folder: Path) -> list[dict]:
    """Charge le fichier evolution_score.csv."""
    csv_path = match_folder / f"{match_folder.name}_evolution_score.csv"
    if not csv_path.exists():
        return []
    
    points = []
    with open(csv_path, 'r', encoding='utf-8') as f:
        reader = csv.DictReader(f)
        for row in reader:
            points.append({
                'frame_debut': int(row['debut']),
                'frame_fin': int(row['fin']),
                'score_A': int(row['score_jA']),
                'score_B': int(row['score_jB']),
                'set_A': int(row['set_jA']),
                'set_B': int(row['set_jB']),
                'winner': row['point_pour']
            })
    return points


def load_graphe_simple(match_folder: Path) -> list[dict]:
    """Charge le fichier graphe_simple.csv."""
    csv_path = match_folder / f"{match_folder.name}_graphe_simple.csv"
    if not csv_path.exists():
        return []
    
    points = []
    with open(csv_path, 'r', encoding='utf-8') as f:
        reader = csv.DictReader(f)
        for row in reader:
            decoded = decode_graphe_simple(row['liste_coup'])
            points.append({
                'serveur': row['serveur'],
                'set_num': int(row['numset']),
                'sequence': decoded['sequence'],
                'nb_coups': decoded['nb_coups'],
                'gagne': decoded['gagne']
            })
    return points


def load_annotation_enrichi(match_folder: Path) -> dict[int, list[dict]]:
    """Charge le fichier annotation_enrichi.csv et groupe par num_point."""
    csv_path = match_folder / f"{match_folder.name}_annotation_enrichi.csv"
    if not csv_path.exists():
        return {}
    
    points = {}
    with open(csv_path, 'r', encoding='utf-8') as f:
        reader = csv.DictReader(f)
        for row in reader:
            num_point = int(row.get('num_point', 0))
            if num_point not in points:
                points[num_point] = []
            points[num_point].append(row)
    
    return points


def load_game_info(match_folder: Path) -> dict:
    """Charge les métadonnées du match depuis _game.json."""
    json_path = match_folder / f"{match_folder.name}_game.json"
    if not json_path.exists():
        return {}
    
    with open(json_path, 'r', encoding='utf-8') as f:
        return json.load(f)


def get_clip_path(match_folder: Path, set_num: int, point_id: int) -> str:
    """Retourne le chemin du clip vidéo pour un point donné."""
    clip_name = f"set_{set_num}_point_{point_id}"
    clip_path = match_folder / "clips" / clip_name / f"{clip_name}.mp4"
    if clip_path.exists():
        return f"clips/{clip_name}/{clip_name}.mp4"
    return ""


def generate_points_index(match_folder: Path) -> list[PointData]:
    """Génère l'index des points pour un match donné."""
    match_id = match_folder.name
    print(f"  Traitement de {match_id}...")
    
    # Charger les données sources
    evolution = load_evolution_score(match_folder)
    graphe = load_graphe_simple(match_folder)
    annotations = load_annotation_enrichi(match_folder)
    game_info = load_game_info(match_folder)
    
    if not evolution:
        print(f"    ⚠️ Pas de données evolution_score pour {match_id}")
        return []
    
    points_data = []
    
    for i, (ev, gr) in enumerate(zip(evolution, graphe)):
        # Récupérer les annotations pour ce point
        point_annots = annotations.get(i, [])
        
        # Extraire les séquences depuis graphe_simple
        sequences = gr['sequence']
        lateralites = [parse_lateralite(s) for s in sequences]
        effets = [parse_effet(s) for s in sequences]
        zones = [parse_zone(s) for s in sequences]
        
        # Infos depuis l'annotation enrichie (premier coup = service)
        service_lat = ""
        service_zone = ""
        faute_type = ""
        faute_lat = ""
        dernier_coup = ""
        derniere_zone = ""
        
        if point_annots:
            first_annot = point_annots[0]
            last_annot = point_annots[-1]
            
            service_lat = first_annot.get('service_lateralite', '')
            service_zone = first_annot.get('service_zone', '')
            faute_type = last_annot.get('faute_du_point', '')
            faute_lat = last_annot.get('faute_lateralite', '')
            derniere_zone = last_annot.get('derniere_zone', '')
            dernier_coup = last_annot.get('effet_coup', '')
        
        # Créer l'objet PointData
        point = PointData(
            match_id=match_id,
            point_id=i,
            set_num=gr['set_num'],
            score_A=ev['score_A'],
            score_B=ev['score_B'],
            set_A=ev['set_A'],
            set_B=ev['set_B'],
            serveur=gr['serveur'],
            winner=ev['winner'],
            nb_coups=gr['nb_coups'],
            duree_frames=ev['frame_fin'] - ev['frame_debut'],
            frame_debut=ev['frame_debut'],
            frame_fin=ev['frame_fin'],
            sequence_coups=','.join(sequences),
            sequence_lateralites=','.join(lateralites),
            sequence_effets=','.join(effets),
            sequence_zones=','.join([z for z in zones if z]),
            service_lateralite=service_lat,
            service_zone=service_zone,
            faute_type=faute_type,
            faute_lateralite=faute_lat,
            dernier_coup=dernier_coup,
            derniere_zone=derniere_zone,
            clip_path=get_clip_path(match_folder, gr['set_num'], i),
            player_A=game_info.get('playerA', ''),
            player_B=game_info.get('playerB', ''),
            competition=game_info.get('competition', ''),
            date=game_info.get('date', '')
        )
        
        points_data.append(point)
    
    print(f"    ✅ {len(points_data)} points générés")
    return points_data


def find_match_folders(project_root: Path) -> list[Path]:
    """Trouve tous les dossiers de matchs dans le projet."""
    matches = []
    
    # Pattern: *_vs_*/*_vs_* (dossier contenant les CSV)
    for folder in project_root.iterdir():
        if folder.is_dir() and '_vs_' in folder.name:
            inner = folder / folder.name
            if inner.exists():
                matches.append(inner)
    
    return matches


def save_points_index(points: list[PointData], output_path: Path):
    """Sauvegarde l'index des points dans un CSV."""
    if not points:
        print("⚠️ Aucun point à sauvegarder")
        return
    
    output_path.parent.mkdir(parents=True, exist_ok=True)
    
    with open(output_path, 'w', newline='', encoding='utf-8') as f:
        fieldnames = list(asdict(points[0]).keys())
        writer = csv.DictWriter(f, fieldnames=fieldnames)
        writer.writeheader()
        for point in points:
            writer.writerow(asdict(point))
    
    print(f"\n✅ Index sauvegardé: {output_path}")
    print(f"   Total: {len(points)} points")


def main():
    parser = argparse.ArgumentParser(description="Génère l'index des points pour Elasticsearch")
    parser.add_argument('--match', type=str, help='Traiter un seul match (nom du dossier)')
    parser.add_argument('--output', type=str, default='backend/data/points_index.csv', 
                        help='Chemin du fichier de sortie')
    args = parser.parse_args()
    
    # Trouver la racine du projet
    script_path = Path(__file__).resolve()
    project_root = script_path.parent.parent.parent  # backend/scripts -> backend -> project
    
    print(f"📁 Racine du projet: {project_root}")
    
    # Trouver les matchs à traiter
    if args.match:
        match_folder = project_root / args.match / args.match
        if not match_folder.exists():
            print(f"❌ Dossier non trouvé: {match_folder}")
            return
        match_folders = [match_folder]
    else:
        match_folders = find_match_folders(project_root)
    
    if not match_folders:
        print("❌ Aucun dossier de match trouvé")
        return
    
    print(f"\n🏓 {len(match_folders)} match(s) à traiter:")
    for mf in match_folders:
        print(f"   - {mf.name}")
    
    # Générer l'index pour chaque match
    all_points = []
    for match_folder in match_folders:
        points = generate_points_index(match_folder)
        all_points.extend(points)
    
    # Sauvegarder le résultat
    output_path = project_root / args.output
    save_points_index(all_points, output_path)


if __name__ == '__main__':
    main()
