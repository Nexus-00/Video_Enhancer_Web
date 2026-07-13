# AI Video Enhancer

A full-stack web app for AI video enhancement: upload a video, upscale resolution, deblur, increase frame rate via interpolation, and remove duplicate frames. Supports GPU/CPU selection, live preview, and real-time SSE progress updates.

## Tech Stack

- **Frontend:** Bun + TypeScript + TanStack Start + React + Tailwind CSS
- **Backend:** Node/Bun runtime + SQLite + Python worker for ML/FFmpeg processing
- **ML/Video:** Python 3.12 + OpenCV + PyTorch + ffmpeg (via `imageio-ffmpeg`) + Real-ESRGAN / NAFNet / RIFE / FLAVR

## Requirements

- [Bun](https://bun.sh/)
- [uv](https://docs.astral.sh/uv/)
- Windows / Linux / macOS (GPU detection depends on platform)
- For NVIDIA GPU support: install a CUDA-enabled PyTorch build (see below)

## Quick Start

```bash
# One command: setup + launch dev server
bun run dev
```

Then open http://localhost:3000 (or the port Vite picks).

### Step-by-Step

```bash
# Install dependencies, set up Python environment, initialize DB
bun run scripts/setup.ts

# Start the TanStack Start dev server
bun run web:dev
```

### Production server

```bash
cd web
bun run build
node .output/server/index.mjs
```

### GPU (CUDA) support

By default `uv` may install a CPU-only PyTorch build. To use an NVIDIA GPU, install the CUDA wheel. For the 1080 Ti / RTX 3050 in this project, CUDA 12.6 is compatible:

```bash
cd python
uv pip install torch torchvision --index-url https://download.pytorch.org/whl/cu126
uv lock
```

Then restart the server and verify with **Download models** → the device list should show your CUDA GPUs.

## Usage

1. Drop or select a video on the home page.
2. Choose processing options:
   - Target device (auto-detected GPUs + CPU)
   - Target FPS (30 / 60 / 90 / 120)
   - Upscale scale (None / 2× / 4×) and interpolation multiplier (None / 2× / 4×), now controlled independently
   - Interpolation model (RIFE or FLAVR)
   - Deblur / Remove duplicate frames
3. Click **Start processing**.
4. The output video is encoded at the chosen **Target FPS**, and the total duration is preserved by matching the output frame count to the original length (frames are duplicated or dropped as needed).
5. Watch the progress bar, live stage updates, and live frame preview.
6. The **Jobs** panel on the right shows all jobs (pending, running, completed, failed, cancelled) and lets you cancel running or pending jobs.
7. When complete, play or download the enhanced video.
8. (Optional) Click **Download models** to fetch pretrained ML weights on demand. Real-ESRGAN and NAFNet download automatically; RIFE and FLAVR require placing compatible weights in `python/weights` (see `python/src/scripts/download_models.py`).

## Project Structure

```
AI_Video_Enhancer/
├── web/               # TanStack Start React app
├── python/            # Python ML worker + pipeline
├── scripts/           # Orchestration scripts
├── data/              # SQLite DB, uploads, processing, outputs
└── PLAN.md            # Detailed plan and status
```

## Notes

- The first `bun run dev` will set up the Python environment automatically.
- ML models are downloaded manually from the UI (not during setup) to avoid long first-time installs.
- See `PLAN.md` for architecture details and future phases.
