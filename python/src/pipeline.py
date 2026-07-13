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
import numpy as np
import torch

sys.path.insert(0, str(Path(__file__).resolve().parent))

from models.interpolation import BlendInterpolator, load_interpolator
from models.nafnet import NAFNetDeblur
from models.realesrgan import RealESRGANUpscaler
from utils.cleanup import cleanup_work_dir
from utils.devices import get_device
from utils.duplicates import detect_duplicate_frames
from utils.errors import PipelineError
from utils.ffmpeg import get_ffmpeg_executable, get_ffprobe_executable
from utils.progress import emit_log, emit_progress


def get_video_info(input_path: Path) -> tuple[float, float]:
    """Return (fps, duration) for the input video using ffprobe."""
    ffprobe = get_ffprobe_executable()
    args = [
        ffprobe, "-v", "error",
        "-select_streams", "v:0",
        "-show_entries", "stream=r_frame_rate,nb_frames",
        "-show_entries", "format=duration",
        "-of", "default=noprint_wrappers=1",
        str(input_path),
    ]
    result = subprocess.run(args, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)
    fps = 0.0
    duration = 0.0
    frame_count = 0
    for line in result.stdout.splitlines():
        if line.startswith("r_frame_rate="):
            value = line.split("=", 1)[1]
            if "/" in value:
                num, den = value.split("/")
                fps = float(num) / float(den)
            else:
                fps = float(value)
        elif line.startswith("duration="):
            try:
                duration = float(line.split("=", 1)[1])
            except ValueError:
                pass
        elif line.startswith("nb_frames="):
            try:
                frame_count = int(line.split("=", 1)[1])
            except ValueError:
                pass

    # Fallback: if ffprobe didn't report duration, derive it from frame count and fps.
    if duration <= 0 and fps > 0 and frame_count > 0:
        duration = frame_count / fps

    return fps, duration


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


_WEIGHTS_DIR = Path(__file__).resolve().parent.parent / "weights"


def _load_upscaler(device: torch.device) -> RealESRGANUpscaler | None:
    weights = _WEIGHTS_DIR / "RealESRGAN_x4plus.pth"
    if not weights.exists():
        weights = _WEIGHTS_DIR / "RealESRGAN_x4plus_anime_6B.pth"
    if weights.exists():
        return RealESRGANUpscaler(weights, device=device)
    emit_log("Real-ESRGAN weights not found; skipping upscaling", level="warning")
    return None


def _load_deblurrer(device: torch.device) -> NAFNetDeblur | None:
    weights = _WEIGHTS_DIR / "NAFNet-GoPro-width64.pth"
    if weights.exists():
        return NAFNetDeblur(weights, device=device)
    emit_log("NAFNet weights not found; skipping deblurring", level="warning")
    return None


def _load_interpolator(model_name: str, device: torch.device):
    if model_name == "rife":
        weights = _WEIGHTS_DIR / "RIFE_v4.25_flownet.pkl"
        if weights.exists():
            return load_interpolator("rife", weights, device)
        emit_log("RIFE weights not found; using fast blending fallback for interpolation", level="warning")
        return BlendInterpolator()
    if model_name == "flavr":
        weights = _WEIGHTS_DIR / "FLAVR_2x.pth"
        if weights.exists():
            return load_interpolator("flavr", weights, device)
        emit_log("FLAVR weights not found; using fast blending fallback for interpolation", level="warning")
        return BlendInterpolator()
    return None


def _enhance_frames(frames: list[Path], output_dir: Path, upscale_scale: int, deblur: bool, device: torch.device) -> list[Path]:
    output_dir.mkdir(parents=True, exist_ok=True)
    upscaler = _load_upscaler(device) if upscale_scale > 1 else None
    deblurrer = _load_deblurrer(device) if deblur else None

    total = len(frames)
    out_paths: list[Path] = []
    for i, frame in enumerate(frames):
        img = cv2.imread(str(frame))
        if img is None:
            raise PipelineError(f"Failed to read frame {frame}")

        if deblurrer is not None:
            try:
                img = deblurrer.deblur(img)
            except Exception as exc:
                emit_log(f"Deblur failed on frame {i}: {exc}", level="warning")

        if upscaler is not None:
            try:
                img = upscaler.upscale(img)
                if upscale_scale == 2:
                    h, w = img.shape[:2]
                    img = cv2.resize(img, (w // 2, h // 2), interpolation=cv2.INTER_AREA)
            except Exception as exc:
                emit_log(f"Upscale failed on frame {i}: {exc}", level="warning")

        out_path = output_dir / frame.name
        cv2.imwrite(str(out_path), img)
        out_paths.append(out_path)

        if total > 20 and (i + 1) % (total // 20) == 0:
            emit_progress(
                "enhancing",
                progress=(i + 1) / total,
                current_frame=i + 1,
                total_frames=total,
                message="Enhancing frames...",
            )

    return out_paths


def _interpolate_frames(frames: list[Path], output_dir: Path, multiplier: int, model_name: str, device: torch.device) -> list[Path]:
    output_dir.mkdir(parents=True, exist_ok=True)
    if multiplier <= 1:
        return frames

    interpolator = _load_interpolator(model_name, device)
    if interpolator is None:
        return frames

    loaded = [cv2.imread(str(f)) for f in frames]
    loaded = [img for img in loaded if img is not None]
    if len(loaded) < 2:
        return frames

    # Apply interpolation recursively to achieve the requested multiplier.
    current = loaded
    current_multiplier = 1
    while current_multiplier < multiplier:
        if len(current) < 4 and model_name == "flavr":
            emit_log("FLAVR requires 4 frames; stopping interpolation early", level="warning")
            break
        current = interpolator.interpolate_sequence(current, n_outputs=1)
        current_multiplier *= 2

    out_paths: list[Path] = []
    for idx, img in enumerate(current):
        out_path = output_dir / f"{idx + 1:08d}.png"
        cv2.imwrite(str(out_path), img)
        out_paths.append(out_path)

    return out_paths


def _adjust_frame_count(frames: list[Path], target_count: int, output_dir: Path) -> list[Path]:
    """Duplicate or drop frames uniformly and write them sequentially to output_dir."""
    output_dir.mkdir(parents=True, exist_ok=True)
    if len(frames) == target_count or target_count <= 0:
        # Still re-write with sequential names to keep the directory clean.
        for idx, frame in enumerate(frames):
            out_path = output_dir / f"{idx + 1:08d}.png"
            shutil.copy2(frame, out_path)
        return [output_dir / f"{i + 1:08d}.png" for i in range(len(frames))]

    if len(frames) < target_count:
        # Duplicate frames
        ratio = target_count / len(frames)
        adjusted = [frames[int(i / ratio)] for i in range(target_count)]
    else:
        # Drop frames
        ratio = len(frames) / target_count
        adjusted = [frames[int(i * ratio)] for i in range(target_count)]

    for idx, frame in enumerate(adjusted):
        out_path = output_dir / f"{idx + 1:08d}.png"
        shutil.copy2(frame, out_path)

    return [output_dir / f"{i + 1:08d}.png" for i in range(target_count)]


def run_pipeline(args: argparse.Namespace) -> None:
    input_path = Path(args.input)
    output_path = Path(args.output)
    work_dir = Path(args.work_dir)
    work_dir.mkdir(parents=True, exist_ok=True)

    device = get_device(args.device)
    emit_log(f"Starting pipeline on device: {device}")
    emit_log(f"Input: {input_path}")
    emit_log(f"Output: {output_path}")

    try:
        input_fps, input_duration = get_video_info(input_path)
        emit_log(f"Input FPS: {input_fps:.3f}, duration: {input_duration:.3f}s")

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
        enhanced = _enhance_frames(active_frames, enhanced_dir, args.upscale_scale, args.deblur, device)

        if args.interpolate > 1:
            interpolated_dir = work_dir / "interpolated"
            model_name = getattr(args, "interpolation_model", "rife")
            enhanced = _interpolate_frames(enhanced, interpolated_dir, args.interpolate, model_name, device)

        # Preserve the original duration: output_frame_count = input_duration * target_fps.
        # Use the extracted frame count as a sanity-check fallback.
        out_fps = args.target_fps
        if out_fps <= 0:
            out_fps = 30.0

        if input_duration > 0 and input_fps > 0:
            target_frame_count = int(round(input_duration * out_fps))
            emit_log(f"Target frame count for duration preservation: {target_frame_count}")
            final_frames_dir = work_dir / "final_frames"
            enhanced = _adjust_frame_count(enhanced, target_frame_count, final_frames_dir)
        else:
            emit_log("Could not determine input duration; using target FPS without frame adjustment", level="warning")

        audio_source = copy_audio(input_path, work_dir)

        if enhanced:
            preview = preview_frame(enhanced[-1])
            emit_progress(
                "encoding",
                progress=0.95,
                current_frame=len(enhanced),
                total_frames=len(enhanced),
                preview_base64=preview,
            )

        encode_video(enhanced, output_path, out_fps, audio_source=audio_source)
        emit_progress("completed", progress=1.0, message="Done")
    except Exception as exc:
        raise PipelineError(f"Pipeline failed: {exc}") from exc
    finally:
        cleanup_work_dir(work_dir, keep_frames=False)


def main() -> None:
    parser = argparse.ArgumentParser(description="AI Video Enhancer pipeline")
    parser.add_argument("--input", required=True)
    parser.add_argument("--output", required=True)
    parser.add_argument("--work-dir", required=True)
    parser.add_argument("--device", default="cpu")
    parser.add_argument("--target-fps", type=float, default=30.0)
    parser.add_argument("--interpolate", type=int, default=1)
    parser.add_argument("--interpolation-model", default="rife")
    parser.add_argument("--upscale-scale", type=int, default=1)
    parser.add_argument("--deblur", action="store_true")
    parser.add_argument("--remove-duplicates", action="store_true")
    parser.add_argument("--duplicate-threshold", type=float, default=10.0)
    args = parser.parse_args()

    start = time.time()
    try:
        run_pipeline(args)
        emit_log(f"Pipeline finished in {time.time() - start:.1f}s")
    except PipelineError as exc:
        emit_log(str(exc), level="error")
        sys.exit(1)
    except Exception as exc:
        emit_log(f"Unexpected error: {exc}", level="error")
        sys.exit(1)


if __name__ == "__main__":
    main()
