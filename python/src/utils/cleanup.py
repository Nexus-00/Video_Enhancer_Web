"""Cleanup utilities for temporary processing directories."""

from __future__ import annotations

import shutil
from pathlib import Path


def cleanup_work_dir(work_dir: Path, keep_frames: bool = False) -> None:
    """Remove temporary processing artifacts, optionally keeping extracted frames."""
    if not work_dir.exists():
        return
    for item in work_dir.iterdir():
        if keep_frames and item.name == "frames":
            continue
        try:
            if item.is_dir():
                shutil.rmtree(item, ignore_errors=True)
            else:
                item.unlink(missing_ok=True)
        except Exception:
            pass
