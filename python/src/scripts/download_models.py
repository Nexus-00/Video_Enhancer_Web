"""Download pretrained model weights for offline inference."""

from __future__ import annotations

import argparse
import json
import os
from pathlib import Path
from typing import Callable

import requests


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
        "url": "https://huggingface.co/nyanko7/nafnet-models/resolve/main/NAFNet-GoPro-width64.pth",
        "filename": "NAFNet-GoPro-width64.pth",
    },
    "RIFE_v4.25": {
        # RIFE v4.25 flownet.pkl weights mirrored on HuggingFace.
        # Original source: Practical-RIFE release (Google Drive/Baidu).
        "url": "https://huggingface.co/LeonJoe13/Sonic/resolve/main/RIFE/flownet.pkl",
        "filename": "RIFE_v4.25_flownet.pkl",
    },
    "FLAVR_2x": {
        # FLAVR pretrained weights are hosted on Google Drive; this is a placeholder.
        # Download the 2x model manually from the FLAVR repo and place it in python/weights/FLAVR_2x.pth
        "url": "",
        "filename": "FLAVR_2x.pth",
    },
}


def emit(event: dict) -> None:
    """Emit a JSON line that the web server can forward to the browser."""
    print(json.dumps(event), flush=True)


def download_file(url: str, dest: Path, on_progress: Callable[[int, int], None] | None = None, timeout: int = 300) -> None:
    """Download a file, calling on_progress(chunks_downloaded, total_chunks)."""
    dest.parent.mkdir(parents=True, exist_ok=True)
    response = requests.get(url, stream=True, timeout=timeout)
    response.raise_for_status()

    total = int(response.headers.get("content-length", 0))
    chunk_size = 8192
    downloaded = 0
    with open(dest, "wb") as f:
        for chunk in response.iter_content(chunk_size=chunk_size):
            if chunk:
                f.write(chunk)
                downloaded += len(chunk)
                if on_progress:
                    on_progress(downloaded, total)
    if on_progress:
        on_progress(downloaded, total or downloaded)


def download_all(force: bool = False) -> None:
    """Download all default models, emitting progress events as JSON lines."""
    WEIGHTS_DIR.mkdir(parents=True, exist_ok=True)
    items = list(MODELS.items())
    total = len(items)

    emit({"type": "start", "total": total})

    for index, (key, info) in enumerate(items):
        dest = WEIGHTS_DIR / info["filename"]
        emit({"type": "model", "index": index, "name": key, "status": "pending", "total": total})

        if dest.exists() and not force:
            emit({
                "type": "model",
                "index": index,
                "name": key,
                "status": "skipped",
                "message": "already exists",
                "total": total,
                "percent": 100,
                "overall": int(round((index + 1) / total * 100)),
            })
            continue

        if not info["url"]:
            emit({
                "type": "model",
                "index": index,
                "name": key,
                "status": "skipped",
                "message": "no automatic download URL; please download it manually",
                "total": total,
                "percent": 0,
                "overall": int(round((index + 1) / total * 100)),
            })
            continue

        emit({
            "type": "model",
            "index": index,
            "name": key,
            "status": "downloading",
            "total": total,
            "percent": 0,
        })

        try:
            def on_progress(downloaded: int, total_bytes: int) -> None:
                percent = (downloaded / total_bytes * 100) if total_bytes else 0
                overall = ((index + percent / 100) / total) * 100
                emit({
                    "type": "progress",
                    "index": index,
                    "name": key,
                    "percent": round(percent, 2),
                    "downloaded": downloaded,
                    "total": total_bytes,
                    "overall": round(overall, 2),
                })

            download_file(info["url"], dest, on_progress=on_progress)
            emit({
                "type": "model",
                "index": index,
                "name": key,
                "status": "done",
                "total": total,
                "percent": 100,
                "overall": int(round((index + 1) / total * 100)),
            })
        except Exception as exc:
            emit({
                "type": "model",
                "index": index,
                "name": key,
                "status": "error",
                "message": str(exc),
                "total": total,
                "overall": int(round((index + 1) / total * 100)),
            })

    emit({"type": "done", "total": total})


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Download model weights")
    parser.add_argument("--force", action="store_true", help="Redownload existing files")
    args = parser.parse_args()
    download_all(force=args.force)
