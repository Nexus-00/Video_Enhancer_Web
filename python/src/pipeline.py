"""Main Python processing pipeline for AI Video Enhancer."""

from __future__ import annotations

import argparse
import base64
import shutil
import subprocess
import sys
import time
from pathlib import Path
from typing import Sequence

import cv2

sys.path.insert(0, str(Path(__file__).resolve().parent))

from utils.devices import get_device
from utils.duplicates import detect_duplicate_frames
from utils.ffmpeg import get_ffmpeg_executable
from utils.progress import emit_log, emit_progress


def extract_frames(input_path: Path, output_dir: Path) -> list[Path]:
    emit_progress("extracting", message="Extracting frames...")
    output_dir.mkdir(parents=True, exist_ok=True)
    ffmpeg = get_ffmpeg_executable()
    args = [
        ffmpeg, "-y", "-i", str(input_path),
        "-vsync", "vfr", "-q:v", "1",
        str(output_dir / "%08d.png"),
    ]
    subprocess.run(args, check=True, stdout=subprocess.PIPE, stderr=subprocess.PIPE)
    frames = sorted(output_dir.glob("*.png"))
    emit_log(f"Extracted {len(frames)} frames")
    return frames


def encode_video(frames: Sequence[Path], output_path: Path, fps: float, audio_source: Path | None = None) -> None:
    emit_progress("encoding", message="Encoding final video...")
    output_path.parent.mkdir(parents=True, exist_ok=True)
    ffmpeg = get_ffmpeg_executable()
    input_pattern = str(frames[0].parent / "%08d.png")
    args = [ffmpeg, "-y", "-framerate", str(fps), "-i", input_pattern]
    if audio_source is not None:
        args.extend(["-i", str(audio_source), "-c:a", "aac", "-b:a", "192k"])
    else:
        args.extend(["-an"])
    args.extend(["-c:v", "libx264", "-pix_fmt", "yuv420p", "-crf", "18", "-preset", "medium", str(output_path)])
    subprocess.run(args, check=True, stdout=subprocess.PIPE, stderr=subprocess.PIPE)
    emit_log(f"Encoded {output_path}")


def copy_audio(input_path: Path, temp_dir: Path) -> Path | None:
    ffmpeg = get_ffmpeg_executable()
    audio_path = temp_dir / "audio.aac"
    try:
        subprocess.run(
            [ffmpeg, "-y", "-i", str(input_path), "-vn", "-c:a", "copy", str(audio_path)],
            check=True, stdout=subprocess.PIPE, stderr=subprocess.PIPE,
        )
        return audio_path
    except Exception:
        return None


def process_frames(frames: list[Path], output_dir: Path) -> list[Path]:
    output_dir.mkdir(parents=True, exist_ok=True)
    total = len(frames)
    for i, frame in enumerate(frames):
        shutil.copy(frame, output_dir / frame.name)
        if total > 20 and (i + 1) % (total // 20) == 0:
            emit_progress("enhancing", progress=(i + 1) / total, current_frame=i + 1, total_frames=total,
                          message="Enhancing frames (placeholder)...")
    return sorted(output_dir.glob("*.png"))


def interpolate_frames(frames: list[Path], output_dir: Path, multiplier: int) -> list[Path]:
    output_dir.mkdir(parents=True, exist_ok=True)
    total = len(frames)
    for i, frame in enumerate(frames):
        shutil.copy(frame, output_dir / frame.name)
        if i < total - 1:
            for j in range(1, multiplier):
                shutil.copy(frame, output_dir / f"{frame.stem}_{j}{frame.suffix}")
    return sorted(output_dir.glob("*.png"))


def preview_frame(frame_path: Path, max_size: int = 320) -> str:
    img = cv2.imread(str(frame_path))
    if img is None:
        return ""
    h, w = img.shape[:2]
    if max(h, w) > max_size:
        scale = max_size / max(h, w)
        img = cv2.resize(img, (int(w * scale), int(h * scale)))
    _, buf = cv2.imencode(".jpg", img, [int(cv2.IMWRITE_JPEG_QUALITY), 75])
    return base64.b64encode(buf).decode("utf-8")



def run_pipeline(args: argparse.Namespace) -> None:
    input_path = Path(args.input)
    output_path = Path(args.output)
    work_dir = Path(args.work_dir)
    work_dir.mkdir(parents=True, exist_ok=True)

    emit_log(f"Starting pipeline on device: {get_device(args.device)}")
    emit_log(f"Input: {input_path}")
    emit_log(f"Output: {output_path}")

    frames_dir = work_dir / "frames"
    frames = extract_frames(input_path, frames_dir)
    total = len(frames)
    emit_progress("extracted", current_frame=total, total_frames=total)

    active_frames = frames
    if args.remove_duplicates:
        emit_progress("deduping", message="Detecting duplicate frames...")
        dupes = detect_duplicate_frames([str(f) for f in frames], threshold=args.duplicate_threshold)
        emit_log(f"Found {len(dupes)} duplicate frames")
        active_frames = [f for i, f in enumerate(frames) if i not in dupes]
        emit_progress("deduped", current_frame=len(active_frames), total_frames=total)

    enhanced_dir = work_dir / "enhanced"
    enhanced = process_frames(active_frames, enhanced_dir)

    if args.interpolate > 1:
        interpolated_dir = work_dir / "interpolated"
        enhanced = interpolate_frames(enhanced, interpolated_dir, args.interpolate)

    audio_source = copy_audio(input_path, work_dir)
    out_fps = args.target_fps * args.interpolate if args.interpolate > 1 else args.target_fps
    if out_fps <= 0:
        out_fps = 30.0

    if enhanced:
        preview = preview_frame(enhanced[-1])
        emit_progress("encoding", progress=0.95, current_frame=len(enhanced), total_frames=len(enhanced),
                      preview_base64=preview)

    encode_video(enhanced, output_path, out_fps, audio_source=audio_source)
    emit_progress("completed", progress=1.0, message="Done")


def main() -> None:
    parser = argparse.ArgumentParser(description="AI Video Enhancer pipeline")
    parser.add_argument("--input", required=True)
    parser.add_argument("--output", required=True)
    parser.add_argument("--work-dir", required=True)
    parser.add_argument("--device", default="cpu")
    parser.add_argument("--target-fps", type=float, default=30.0)
    parser.add_argument("--interpolate", type=int, default=1)
    parser.add_argument("--upscale", action="store_true")
    parser.add_argument("--deblur", action="store_true")
    parser.add_argument("--remove-duplicates", action="store_true")
    parser.add_argument("--duplicate-threshold", type=float, default=10.0)
    args = parser.parse_args()

    start = time.time()
    try:
        run_pipeline(args)
        emit_log(f"Pipeline finished in {time.time() - start:.1f}s")
    except Exception as exc:
        emit_log(str(exc), level="error")
        sys.exit(1)


if __name__ == "__main__":
    main()
