"""Download pretrained model weights for offline inference."""

from __future__ import annotations

import argparse
import os
from pathlib import Path

import requests
from tqdm import tqdm


WEIGHTS_DIR = Path(__file__).resolve().parent.parent.parent / "weights"

MODELS = {
    "RealESRGAN_x4plus": {
        "url": "https://github.com/xinntao/Real-ESRGAN/releases/download/v0.1.0/RealESRGAN_x4plus.pth",
        "filename": "RealESRGAN_x4plus.pth",
    },
    "RealESRGAN_x4plus_anime_6B": {
        "url": "https://github.com/xinntao/Real-ESRGAN/releases/download/v0.2.2.4/RealESRGAN_x4plus_anime_6B.pth",
        "filename": "RealESRGAN_x4plus_anime_6B.pth",
    },
    "NAFNet-GoPro-width64": {
        "url": "https://github.com/megvii-research/NAFNet/releases/download/v0.1/NAFNet-GoPro-width64.pth",
        "filename": "NAFNet-GoPro-width64.pth",
    },
    "RIFE_v4.25": {
        "url": "https://github.com/hzwer/Practical-RIFE/releases/download/v4.25/flownet.pkl",
        "filename": "RIFE_v4.25_flownet.pkl",
    },
}


def download_file(url: str, dest: Path) -> None:
    """Download a file with a progress bar."""
    dest.parent.mkdir(parents=True, exist_ok=True)
    if dest.exists():
        print(f"[skip] {dest.name} already exists.")
        return

    print(f"[download] {url} -> {dest}")
    try:
        response = requests.get(url, stream=True, timeout=60)
        response.raise_for_status()

        total = int(response.headers.get("content-length", 0))
        with open(dest, "wb") as f, tqdm(
            total=total, unit="B", unit_scale=True, desc=dest.name
        ) as bar:
            for chunk in response.iter_content(chunk_size=8192):
                if chunk:
                    f.write(chunk)
                    bar.update(len(chunk))
    except Exception as exc:
        print(f"[warn] Failed to download {dest.name}: {exc}")


def download_all(force: bool = False) -> None:
    """Download all default models."""
    WEIGHTS_DIR.mkdir(parents=True, exist_ok=True)
    for key, info in MODELS.items():
        dest = WEIGHTS_DIR / info["filename"]
        if force and dest.exists():
            dest.unlink()
        download_file(info["url"], dest)
    print("[done] Model download pass finished.")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Download model weights")
    parser.add_argument("--force", action="store_true", help="Redownload existing files")
    args = parser.parse_args()
    download_all(force=args.force)
