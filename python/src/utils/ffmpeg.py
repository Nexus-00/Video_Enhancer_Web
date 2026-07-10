"""FFmpeg discovery and path helpers."""

from __future__ import annotations

import shutil


def get_ffmpeg_executable() -> str:
    """Return the path to an ffmpeg executable.

    Prefer imageio-ffmpeg's bundled binary, then fall back to PATH.
    """
    try:
        import imageio_ffmpeg

        return imageio_ffmpeg.get_ffmpeg_exe()
    except Exception:
        pass

    ffmpeg = shutil.which("ffmpeg")
    if ffmpeg:
        return ffmpeg

    raise RuntimeError(
        "ffmpeg not found. Install imageio-ffmpeg or add ffmpeg to PATH."
    )


def get_ffprobe_executable() -> str:
    """Return the path to an ffprobe executable.

    imageio-ffmpeg currently only bundles ffmpeg, so we prefer a system
    ffprobe and fall back to replacing 'ffmpeg' in the ffmpeg path.
    """
    ffprobe = shutil.which("ffprobe")
    if ffprobe:
        return ffprobe

    try:
        import imageio_ffmpeg

        ffmpeg = imageio_ffmpeg.get_ffmpeg_exe()
        return ffmpeg.replace("ffmpeg", "ffprobe")
    except Exception:
        pass

    raise RuntimeError("ffprobe not found. Add ffmpeg to PATH.")
