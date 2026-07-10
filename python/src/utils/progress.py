"""Progress reporting utilities."""

from __future__ import annotations

import json
import sys
from typing import Any


def emit_progress(
    stage: str,
    progress: float = 0.0,
    current_frame: int | None = None,
    total_frames: int | None = None,
    eta_seconds: int | None = None,
    message: str | None = None,
    preview_base64: str | None = None,
    extra: dict[str, Any] | None = None,
) -> None:
    """Emit a single JSON progress line to stdout for Bun to consume."""
    payload = {
        "type": "progress",
        "stage": stage,
        "progress": progress,
        "currentFrame": current_frame,
        "totalFrames": total_frames,
        "etaSeconds": eta_seconds,
        "message": message,
        "previewBase64": preview_base64,
    }
    if extra:
        payload.update(extra)

    print(json.dumps(payload), flush=True)


def emit_log(message: str, level: str = "info") -> None:
    """Emit a log line."""
    print(json.dumps({"type": "log", "level": level, "message": message}), flush=True)
