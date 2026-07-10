"""Device detection for PyTorch inference."""

from __future__ import annotations

import shutil


def _nvidia_gpus() -> list[dict]:
    """Detect NVIDIA GPUs using nvidia-smi if available."""
    gpus: list[dict] = []
    if shutil.which("nvidia-smi") is None:
        return gpus
    try:
        import subprocess

        output = subprocess.check_output(
            ["nvidia-smi", "--query-gpu=index,name", "--format=csv,noheader"],
            text=True,
            stderr=subprocess.PIPE,
        )
        for line in output.strip().splitlines():
            if not line.strip():
                continue
            parts = [p.strip() for p in line.split(",", 1)]
            if len(parts) == 2:
                idx, name = parts
                gpus.append({"id": f"cuda:{idx}", "name": name, "type": "cuda"})
    except Exception:
        pass
    return gpus


def list_devices() -> list[dict]:
    """Return available compute devices."""
    devices: list[dict] = _nvidia_gpus()

    try:
        import torch

        if torch.cuda.is_available():
            for i in range(torch.cuda.device_count()):
                devices.append(
                    {
                        "id": f"cuda:{i}",
                        "name": torch.cuda.get_device_name(i),
                        "type": "cuda",
                    }
                )

        if torch.backends.mps.is_available():
            devices.append({"id": "mps", "name": "Apple Metal (MPS)", "type": "mps"})
    except ImportError:
        pass

    devices.append({"id": "cpu", "name": "CPU", "type": "cpu"})

    # Deduplicate by id
    seen = set()
    unique = []
    for d in devices:
        if d["id"] not in seen:
            seen.add(d["id"])
            unique.append(d)
    return unique


def get_device(device_id: str | None = None):
    """Resolve a device string to a device identifier, falling back safely."""
    try:
        import torch

        if device_id is None or device_id == "cpu":
            return torch.device("cpu")
        if device_id.startswith("cuda:"):
            idx = int(device_id.split(":")[1])
            if torch.cuda.is_available() and idx < torch.cuda.device_count():
                return torch.device(device_id)
            return torch.device("cpu")
        if device_id == "mps" and torch.backends.mps.is_available():
            return torch.device("mps")
        return torch.device("cpu")
    except ImportError:
        return device_id or "cpu"
