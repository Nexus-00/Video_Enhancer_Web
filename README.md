# AI Video Enhancer

A full-stack web app for AI video enhancement: upload a video, upscale resolution, deblur, and increase frame rate via interpolation. Includes duplicate-frame removal and GPU/CPU selection.

## Tech Stack

- **Frontend:** Bun + TypeScript + TanStack Start + React + Tailwind CSS
- **Backend:** Bun runtime + SQLite + Python worker for ML/FFmpeg processing
- **ML/Video:** Python 3.12 + OpenCV + ffmpeg (via `imageio-ffmpeg`) + optional Real-ESRGAN / NAFNet / Practical-RIFE

## Requirements

- [Bun](https://bun.sh/)
- [uv](https://docs.astral.sh/uv/)
- Windows / Linux / macOS (GPU detection depends on platform)

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

## Usage

1. Drop or select a video on the home page.
2. Choose processing options:
   - Target device (auto-detected GPUs + CPU)
   - Target FPS and interpolation multiplier
   - Upscale / Deblur / Remove duplicate frames
3. Click **Start processing**.
4. Watch the progress bar and live stage updates.
5. When complete, play or download the enhanced video.
6. (Optional) Click **Download models** to fetch pretrained ML weights on demand.

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
