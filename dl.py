import requests
from bs4 import BeautifulSoup
import os

base_url = "https://dataroom.liris.cnrs.fr/vizvid/pipeline-tt/2021_ChEuropeF_ClujNapoca/"
folder = "dataset"

skip_folders = [
    "video_en_images",
    "img",
    "img_squelette",
    "num_frame",
    "openpose_json"
]

allowed_ext = [".mp4", ".csv", ".json", ".txt"]

os.makedirs(folder, exist_ok=True)


def download_folder(url, local_path):

    r = requests.get(url)
    soup = BeautifulSoup(r.text, "html.parser")

    for link in soup.find_all("a"):

        href = link.get("href")

        if href in ["../", None]:
            continue

        # skip unwanted folders
        if any(skip in href for skip in skip_folders):
            continue

        full_url = url + href
        local_file = os.path.join(local_path, href)

        if href.endswith("/"):
            os.makedirs(local_file, exist_ok=True)
            download_folder(full_url, local_file)

        else:
            if not any(href.endswith(ext) for ext in allowed_ext):
                continue

            print("Downloading:", full_url)

            file = requests.get(full_url)

            with open(local_file, "wb") as f:
                f.write(file.content)


download_folder(base_url, folder)