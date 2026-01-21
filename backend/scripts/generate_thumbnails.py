import os
import subprocess
from pathlib import Path
import argparse

def generate_thumbnails(video_root_path: Path):
    """
    Parcourt tous les sous-dossiers de clips et génère un thumbnail.jpg s'il manque.
    """
    if not video_root_path.exists():
        print(f"❌ Le dossier {video_root_path} n'existe pas.")
        return

    print(f"🔍 Recherche de clips dans : {video_root_path}")
    
    count_generated = 0
    count_skipped = 0
    count_errors = 0

    # On cherche récursivement les dossiers de clips
    # Structure attendue : video_folder/clips/set_X_point_Y/set_X_point_Y.mp4
    for root, dirs, files in os.walk(video_root_path):
        for dir_name in dirs:
            # On s'intéresse aux dossiers de points (ex: set_1_point_4)
            if "point_" in dir_name:
                clip_dir = Path(root) / dir_name
                clip_name = dir_name  # ex: set_1_point_4
                
                mp4_path = clip_dir / f"{clip_name}.mp4"
                jpg_path = clip_dir / f"{clip_name}.jpg"
                
                if mp4_path.exists():
                    if not jpg_path.exists():
                        print(f"📸 Génération thumbnail pour {clip_name}...")
                        try:
                            # Commande ffmpeg pour extraire une frame à 00:00:00 (ou milieu)
                            # -ss 00:00:00 -i input.mp4 -vframes 1 -q:v 2 output.jpg
                            cmd = [
                                "ffmpeg",
                                "-y",             # Overwrite
                                "-ss", "00:00:00", # Timestamp (début)
                                "-i", str(mp4_path),
                                "-vframes", "1",
                                "-q:v", "2",      # Qualité JPG (2-31, 2 est très bon)
                                str(jpg_path)
                            ]
                            
                            # Exécuter ffmpeg silencieusement
                            subprocess.run(cmd, check=True, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
                            count_generated += 1
                        except subprocess.CalledProcessError:
                            print(f"❌ Erreur ffmpeg pour {clip_name}")
                            count_errors += 1
                        except FileNotFoundError:
                            print("❌ ffmpeg n'est pas installé ou n'est pas dans le PATH.")
                            return
                    else:
                        count_skipped += 1
    
    print("\n=== Résumé ===")
    print(f"✅ Générés : {count_generated}")
    print(f"⏭️  Ignorés (existaient déjà) : {count_skipped}")
    if count_errors > 0:
        print(f"❌ Erreurs : {count_errors}")

if __name__ == "__main__":
    # Point de départ : backend/videos
    # On remonte d'un niveau depuis scripts/
    project_root = Path(__file__).resolve().parent.parent.parent
    videos_root = project_root / "backend" / "videos"
    
    print(f"📂 Racine des vidéos : {videos_root}")
    generate_thumbnails(videos_root)
