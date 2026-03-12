"""
Generate backend/data/points_index.csv from match folders.

Primary data source:
- clip-level annotation CSVs for rally length, point duration, service and end-of-point metadata

Fallback sources:
- root evolution_score / graphe_simple CSVs for score and set context when available
- existing points_index.csv rows for legacy matches that only ship clip assets
"""

import argparse
import csv
import json
import re
from dataclasses import asdict, dataclass
from pathlib import Path
from typing import Any, Optional


FPS = 25.0
CLIP_DIR_PATTERN = re.compile(r"set_(?P<set_num>\d+)_point_(?P<point_id>\d+)$")


@dataclass
class PointData:
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
    duree_secondes: float
    frame_debut: int
    frame_fin: int
    sequence_coups: str
    sequence_lateralites: str
    sequence_effets: str
    sequence_zones: str
    service_lateralite: str = ""
    service_zone: str = ""
    faute_type: str = ""
    faute_lateralite: str = ""
    dernier_coup: str = ""
    derniere_zone: str = ""
    clip_path: str = ""
    player_A: str = ""
    player_B: str = ""
    competition: str = ""
    date: str = ""


def safe_int(value: Any, default: int = 0) -> int:
    try:
        if value in (None, ""):
            return default
        return int(float(value))
    except (TypeError, ValueError):
        return default


def safe_float(value: Any, default: float = 0.0) -> float:
    try:
        if value in (None, ""):
            return default
        return float(value)
    except (TypeError, ValueError):
        return default


def first_non_empty(*values: Any) -> str:
    for value in values:
        if value is None:
            continue
        text = str(value).strip()
        if text:
            return text
    return ""


def dedupe_preserve(items: list[str]) -> list[str]:
    seen = set()
    output: list[str] = []
    for item in items:
        if not item or item in seen:
            continue
        seen.add(item)
        output.append(item)
    return output


def parse_clip_dir_name(clip_dir: Path) -> tuple[int, int]:
    match = CLIP_DIR_PATTERN.match(clip_dir.name)
    if not match:
        raise ValueError(f"Unsupported clip directory name: {clip_dir.name}")
    return safe_int(match.group("set_num")), safe_int(match.group("point_id"))


def canonical_match_id(player_a: str, player_b: str) -> str:
    left = player_a.strip().replace(" ", "-").upper()
    right = player_b.strip().replace(" ", "-").upper()
    return f"{left}_vs_{right}"


def load_csv_rows(csv_path: Path) -> list[dict[str, str]]:
    if not csv_path.exists():
        return []
    with csv_path.open("r", encoding="utf-8") as handle:
        return list(csv.DictReader(handle))


def find_first_file(folder: Path, patterns: list[str]) -> Optional[Path]:
    for pattern in patterns:
        matches = sorted(folder.glob(pattern))
        if matches:
            return matches[0]
    return None


def resolve_game_info(match_folder: Path) -> dict[str, Any]:
    game_path = find_first_file(match_folder, ["*_game.json"])
    if not game_path:
        return {}
    with game_path.open("r", encoding="utf-8") as handle:
        return json.load(handle)


def resolve_clip_metadata(clip_dir: Path) -> dict[str, Any]:
    clip_json = clip_dir / f"{clip_dir.name}.json"
    if not clip_json.exists():
        return {}
    with clip_json.open("r", encoding="utf-8") as handle:
        return json.load(handle)


def load_existing_points(csv_path: Path) -> dict[str, dict[int, dict[str, str]]]:
    if not csv_path.exists():
        return {}

    rows_by_match: dict[str, dict[int, dict[str, str]]] = {}
    for row in load_csv_rows(csv_path):
        match_id = row.get("match_id", "")
        point_id = safe_int(row.get("point_id"))
        rows_by_match.setdefault(match_id, {})[point_id] = row
    return rows_by_match


def load_evolution_score(match_folder: Path) -> dict[int, dict[str, int | str]]:
    csv_path = find_first_file(match_folder, ["*_evolution_score.csv"])
    if not csv_path:
        return {}

    points: dict[int, dict[str, int | str]] = {}
    for idx, row in enumerate(load_csv_rows(csv_path)):
        points[idx] = {
            "frame_debut": safe_int(row.get("debut")),
            "frame_fin": safe_int(row.get("fin")),
            "score_A": safe_int(row.get("score_jA")),
            "score_B": safe_int(row.get("score_jB")),
            "set_A": safe_int(row.get("set_jA")),
            "set_B": safe_int(row.get("set_jB")),
            "winner": first_non_empty(row.get("point_pour")),
        }
    return points


def decode_graphe_simple(liste_coup: str) -> list[str]:
    sequence: list[str] = []
    for coup in str(liste_coup or "").strip().split():
        if coup in {"Gagne", "Perdu"}:
            continue
        sequence.append(coup)
    return sequence


def parse_lateralite(code: str) -> str:
    code = str(code or "")
    if "CD" in code:
        return "coup_droit"
    if code.startswith("R"):
        return "revers"
    return code


def parse_effet(code: str) -> str:
    code = str(code or "")
    effets = {
        "po": "poussette",
        "to": "topspin",
        "bl": "block",
        "fl": "flip",
        "sm": "smash",
        "lo": "lob",
    }
    for key, value in effets.items():
        if f"_{key}_" in code or code.endswith(f"_{key}"):
            return value
    if "Lateral" in code:
        return "service"
    return ""


def parse_zone(code: str) -> str:
    match = re.search(r"_([GMDH][0-9])(?:_\d+)?$", str(code or ""), re.IGNORECASE)
    if match:
        return match.group(1).lower()
    return ""


def load_graphe_simple(match_folder: Path) -> dict[int, dict[str, Any]]:
    csv_path = find_first_file(match_folder, ["*_graphe_simple.csv"])
    if not csv_path:
        return {}

    points: dict[int, dict[str, Any]] = {}
    for idx, row in enumerate(load_csv_rows(csv_path)):
        sequence = decode_graphe_simple(row.get("liste_coup", ""))
        points[idx] = {
            "serveur": first_non_empty(row.get("serveur")),
            "set_num": safe_int(row.get("numset")),
            "sequence_coups": sequence,
            "sequence_lateralites": [parse_lateralite(item) for item in sequence],
            "sequence_effets": [parse_effet(item) for item in sequence],
            "sequence_zones": [parse_zone(item) for item in sequence if parse_zone(item)],
            "nb_coups": len(sequence),
        }
    return points


def load_root_annotations(match_folder: Path) -> dict[int, list[dict[str, str]]]:
    annotation_path = find_first_file(
        match_folder,
        ["*_annotation_enrichi_new_ref.csv", "*_annotation_enrichi.csv"],
    )
    if not annotation_path:
        return {}

    grouped: dict[int, list[dict[str, str]]] = {}
    for row in load_csv_rows(annotation_path):
        point_id = safe_int(row.get("num_point"), default=-1)
        if point_id < 0:
            continue
        grouped.setdefault(point_id, []).append(row)
    return grouped


def load_clip_annotation_rows(clip_dir: Path) -> tuple[list[dict[str, str]], bool]:
    preferred = [
        clip_dir / f"{clip_dir.name}_annotation_enrichi_new_ref.csv",
        clip_dir / f"{clip_dir.name}_annotation_enrichi.csv",
        clip_dir / f"{clip_dir.name}_annotation.csv",
    ]
    for path in preferred:
        if path.exists():
            return load_csv_rows(path), path.name != f"{clip_dir.name}_annotation.csv"
    return [], False


def load_clip_event_rows(clip_dir: Path) -> list[dict[str, str]]:
    csv_path = clip_dir / f"{clip_dir.name}.csv"
    return load_csv_rows(csv_path)


def derive_sequences_from_annotations(rows: list[dict[str, str]]) -> tuple[str, str, str, str]:
    if not rows:
        return "", "", "", ""

    coups = []
    lateralites = []
    effets = []
    zones = []

    for row in rows:
        coup = first_non_empty(row.get("coup"), row.get("type_coup"))
        effet = first_non_empty(row.get("effet_coup"))
        if not effet and row.get("type_service"):
            effet = "service"
        lateralite = first_non_empty(row.get("lateralite"))
        zone = first_non_empty(row.get("zone_jeu"))

        coups.append(coup)
        lateralites.append(lateralite)
        effets.append(effet)
        zones.append(zone.lower())

    return (
        ",".join(dedupe_preserve(coups) if not any(coups) else [item for item in coups if item]),
        ",".join([item for item in lateralites if item]),
        ",".join([item for item in effets if item]),
        ",".join([item for item in zones if item]),
    )


def compute_point_timing(annotation_rows: list[dict[str, str]], event_rows: list[dict[str, str]]) -> tuple[int, int]:
    starts = [safe_int(row.get("debut"), default=-1) for row in annotation_rows if row.get("debut") not in (None, "")]
    ends = [safe_int(row.get("fin"), default=-1) for row in annotation_rows if row.get("fin") not in (None, "")]
    if starts and ends:
        return min(starts), max(ends)

    frames = [safe_int(row.get("frameId"), default=-1) for row in event_rows if row.get("frameId") not in (None, "")]
    frames = [frame for frame in frames if frame >= 0]
    if frames:
        return min(frames), max(frames)

    return 0, 0


def compute_nb_coups(annotation_rows: list[dict[str, str]], graphe_row: Optional[dict[str, Any]]) -> int:
    nb_coup_values = [safe_int(row.get("nb_coup"), default=-1) for row in annotation_rows]
    nb_coup_values = [value for value in nb_coup_values if value >= 0]
    if nb_coup_values:
        return max(nb_coup_values)

    num_coup_values = [safe_int(row.get("num_coup"), default=-1) for row in annotation_rows]
    num_coup_values = [value for value in num_coup_values if value >= 0]
    if num_coup_values:
        return max(num_coup_values)

    if annotation_rows:
        return len(annotation_rows)

    if graphe_row:
        return safe_int(graphe_row.get("nb_coups"))

    return 0


def get_clip_path(match_folder: Path, clip_dir: Path) -> str:
    clip_path = clip_dir / f"{clip_dir.name}.mp4"
    if clip_path.exists():
        return f"clips/{clip_dir.name}/{clip_dir.name}.mp4"
    return ""


def build_point_data(
    match_folder: Path,
    clip_dir: Path,
    match_id: str,
    game_info: dict[str, Any],
    evolution_row: Optional[dict[str, Any]],
    graphe_row: Optional[dict[str, Any]],
    root_annotation_rows: list[dict[str, str]],
    legacy_row: Optional[dict[str, str]],
) -> PointData:
    set_num, point_id = parse_clip_dir_name(clip_dir)

    clip_annotation_rows, clip_has_enriched = load_clip_annotation_rows(clip_dir)
    event_rows = load_clip_event_rows(clip_dir)
    preferred_rows = clip_annotation_rows if clip_has_enriched or not root_annotation_rows else root_annotation_rows
    timing_rows = clip_annotation_rows or preferred_rows
    source_rows = preferred_rows or clip_annotation_rows

    frame_debut, frame_fin = compute_point_timing(timing_rows, event_rows)
    if frame_debut == 0 and frame_fin == 0 and evolution_row:
        frame_debut = safe_int(evolution_row.get("frame_debut"))
        frame_fin = safe_int(evolution_row.get("frame_fin"))
    if frame_fin < frame_debut:
        frame_debut, frame_fin = frame_fin, frame_debut

    duree_frames = max(0, frame_fin - frame_debut)
    duree_secondes = round(duree_frames / FPS, 2) if duree_frames else 0.0

    first_row = source_rows[0] if source_rows else {}
    last_row = source_rows[-1] if source_rows else {}
    clip_meta = resolve_clip_metadata(clip_dir)
    clip_players = clip_meta.get("metadata", {}) if isinstance(clip_meta.get("metadata"), dict) else {}

    sequence_coups, sequence_lateralites, sequence_effets, sequence_zones = derive_sequences_from_annotations(source_rows)
    if not sequence_effets and graphe_row:
        sequence_coups = ",".join(graphe_row.get("sequence_coups", []))
        sequence_lateralites = ",".join(graphe_row.get("sequence_lateralites", []))
        sequence_effets = ",".join(graphe_row.get("sequence_effets", []))
        sequence_zones = ",".join(graphe_row.get("sequence_zones", []))
    elif legacy_row and not sequence_effets:
        sequence_coups = legacy_row.get("sequence_coups", "")
        sequence_lateralites = legacy_row.get("sequence_lateralites", "")
        sequence_effets = legacy_row.get("sequence_effets", "")
        sequence_zones = legacy_row.get("sequence_zones", "")

    player_a = first_non_empty(
        game_info.get("playerA"),
        clip_players.get("playerA"),
        legacy_row.get("player_A") if legacy_row else "",
    )
    player_b = first_non_empty(
        game_info.get("playerB"),
        clip_players.get("playerB"),
        legacy_row.get("player_B") if legacy_row else "",
    )

    score_a = safe_int(evolution_row.get("score_A") if evolution_row else None, safe_int(legacy_row.get("score_A") if legacy_row else None))
    score_b = safe_int(evolution_row.get("score_B") if evolution_row else None, safe_int(legacy_row.get("score_B") if legacy_row else None))
    set_a = safe_int(evolution_row.get("set_A") if evolution_row else None, safe_int(legacy_row.get("set_A") if legacy_row else None))
    set_b = safe_int(evolution_row.get("set_B") if evolution_row else None, safe_int(legacy_row.get("set_B") if legacy_row else None))

    final_set_num = safe_int(
        first_non_empty(first_row.get("set"), graphe_row.get("set_num") if graphe_row else "", set_num),
        set_num
    )
    winner = first_non_empty(
        last_row.get("winner"),
        evolution_row.get("winner") if evolution_row else "",
        legacy_row.get("winner") if legacy_row else "",
    )
    serveur = first_non_empty(
        first_row.get("serveur"),
        first_row.get("nom"),
        graphe_row.get("serveur") if graphe_row else "",
        legacy_row.get("serveur") if legacy_row else "",
    )

    service_lateralite = first_non_empty(
        first_row.get("service_lateralite"),
        first_row.get("lateralite"),
        legacy_row.get("service_lateralite") if legacy_row else "",
    )
    service_zone = first_non_empty(
        first_row.get("service_zone"),
        first_row.get("zone_jeu"),
        legacy_row.get("service_zone") if legacy_row else "",
    ).lower()
    faute_type = first_non_empty(
        last_row.get("faute_du_point"),
        last_row.get("faute"),
        legacy_row.get("faute_type") if legacy_row else "",
    )
    faute_lateralite = first_non_empty(
        last_row.get("faute_lateralite"),
        legacy_row.get("faute_lateralite") if legacy_row else "",
    )
    dernier_coup = first_non_empty(
        last_row.get("effet_coup"),
        last_row.get("type_coup"),
        last_row.get("coup"),
        legacy_row.get("dernier_coup") if legacy_row else "",
    )
    derniere_zone = first_non_empty(
        last_row.get("derniere_zone"),
        last_row.get("valeur_derniere_zone"),
        last_row.get("zone_jeu"),
        legacy_row.get("derniere_zone") if legacy_row else "",
    ).lower()

    nb_coups = compute_nb_coups(source_rows, graphe_row)
    if nb_coups == 0 and legacy_row:
        nb_coups = safe_int(legacy_row.get("nb_coups"))

    competition = first_non_empty(
        game_info.get("competition"),
        game_info.get("epreuve"),
        clip_players.get("competition"),
        legacy_row.get("competition") if legacy_row else "",
    )
    date = first_non_empty(
        game_info.get("date"),
        clip_players.get("date"),
        legacy_row.get("date") if legacy_row else "",
    )

    return PointData(
        match_id=match_id,
        point_id=point_id,
        set_num=final_set_num,
        score_A=score_a,
        score_B=score_b,
        set_A=set_a,
        set_B=set_b,
        serveur=serveur,
        winner=winner,
        nb_coups=nb_coups,
        duree_frames=duree_frames,
        duree_secondes=duree_secondes,
        frame_debut=frame_debut,
        frame_fin=frame_fin,
        sequence_coups=sequence_coups,
        sequence_lateralites=sequence_lateralites,
        sequence_effets=sequence_effets,
        sequence_zones=sequence_zones,
        service_lateralite=service_lateralite,
        service_zone=service_zone,
        faute_type=faute_type,
        faute_lateralite=faute_lateralite,
        dernier_coup=dernier_coup,
        derniere_zone=derniere_zone,
        clip_path=get_clip_path(match_folder, clip_dir),
        player_A=player_a,
        player_B=player_b,
        competition=competition,
        date=date,
    )


def resolve_match_id(match_folder: Path, game_info: dict[str, Any], legacy_rows: dict[str, dict[int, dict[str, str]]]) -> str:
    folder_name = match_folder.name
    if folder_name in legacy_rows:
        return folder_name
    if "_vs_" in folder_name:
        return folder_name

    player_a = first_non_empty(game_info.get("playerA"))
    player_b = first_non_empty(game_info.get("playerB"))
    if player_a and player_b:
        return canonical_match_id(player_a, player_b)

    for clip_dir in sorted((match_folder / "clips").iterdir()):
        if not clip_dir.is_dir():
            continue
        clip_meta = resolve_clip_metadata(clip_dir).get("metadata", {})
        if isinstance(clip_meta, dict):
            player_a = first_non_empty(clip_meta.get("playerA"))
            player_b = first_non_empty(clip_meta.get("playerB"))
            if player_a and player_b:
                return canonical_match_id(player_a, player_b)

    if "-vs-" in folder_name:
        left, right = folder_name.split("-vs-", 1)
        return canonical_match_id(left, right)

    return folder_name.upper()


def find_match_folders(videos_root: Path) -> list[Path]:
    matches = []
    for folder in sorted(videos_root.iterdir()):
        if not folder.is_dir():
            continue
        if (folder / "clips").exists():
            matches.append(folder)
    return matches


def generate_points_index(match_folder: Path, legacy_rows: dict[str, dict[int, dict[str, str]]]) -> list[PointData]:
    print(f"  Processing {match_folder.name}...")
    game_info = resolve_game_info(match_folder)
    match_id = resolve_match_id(match_folder, game_info, legacy_rows)
    evolution = load_evolution_score(match_folder)
    graphe = load_graphe_simple(match_folder)
    root_annotations = load_root_annotations(match_folder)
    legacy_match_rows = legacy_rows.get(match_id, {})

    clip_dirs = [
        clip_dir
        for clip_dir in (match_folder / "clips").iterdir()
        if clip_dir.is_dir() and CLIP_DIR_PATTERN.match(clip_dir.name)
    ]
    clip_dirs.sort(key=lambda path: parse_clip_dir_name(path)[1])

    points: list[PointData] = []
    for clip_dir in clip_dirs:
        _, point_id = parse_clip_dir_name(clip_dir)
        point = build_point_data(
            match_folder=match_folder,
            clip_dir=clip_dir,
            match_id=match_id,
            game_info=game_info,
            evolution_row=evolution.get(point_id),
            graphe_row=graphe.get(point_id),
            root_annotation_rows=root_annotations.get(point_id, []),
            legacy_row=legacy_match_rows.get(point_id),
        )
        points.append(point)

    print(f"    OK {len(points)} points")
    return points


def save_points_index(points: list[PointData], output_path: Path) -> None:
    if not points:
        print("No points to save")
        return

    output_path.parent.mkdir(parents=True, exist_ok=True)
    points = sorted(points, key=lambda point: (point.match_id, point.point_id))

    with output_path.open("w", newline="", encoding="utf-8") as handle:
        fieldnames = list(asdict(points[0]).keys())
        writer = csv.DictWriter(handle, fieldnames=fieldnames)
        writer.writeheader()
        for point in points:
            writer.writerow(asdict(point))

    print(f"\nSaved index: {output_path}")
    print(f"Total points: {len(points)}")


def main() -> None:
    parser = argparse.ArgumentParser(description="Generate points_index.csv")
    parser.add_argument("--match", type=str, help="Process one match folder inside backend/videos")
    parser.add_argument("--output", type=str, default="backend/data/points_index.csv", help="Output CSV path")
    args = parser.parse_args()

    script_path = Path(__file__).resolve()
    project_root = script_path.parent.parent.parent
    videos_root = project_root / "backend" / "videos"
    output_path = project_root / args.output
    legacy_rows = load_existing_points(output_path)

    if args.match:
        match_folder = videos_root / args.match
        if not match_folder.exists():
            raise SystemExit(f"Match folder not found: {match_folder}")
        match_folders = [match_folder]
    else:
        match_folders = find_match_folders(videos_root)

    print(f"Project root: {project_root}")
    print(f"Match folders found: {len(match_folders)}")
    for folder in match_folders:
        print(f" - {folder.name}")

    all_points: list[PointData] = []
    for match_folder in match_folders:
        all_points.extend(generate_points_index(match_folder, legacy_rows))

    save_points_index(all_points, output_path)


if __name__ == "__main__":
    main()
