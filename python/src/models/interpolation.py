"""Frame interpolation wrappers for RIFE and FLAVR."""

from __future__ import annotations

from pathlib import Path

import cv2
import numpy as np
import torch
import torch.nn.functional as F
import torchvision.transforms.functional as TF

from .flavr import UNet_3D_3D
from .rife import RIFEModel


class Interpolator:
    """Common interface for frame interpolation models."""

    def interpolate_pair(self, img0: np.ndarray, img1: np.ndarray, timestep: float = 0.5) -> np.ndarray:
        raise NotImplementedError

    def interpolate_sequence(self, frames: list[np.ndarray], n_outputs: int = 1) -> list[np.ndarray]:
        raise NotImplementedError


def _to_tensor(img: np.ndarray) -> torch.Tensor:
    """HWC BGR uint8 -> CHW RGB float [0,1]."""
    img = img[:, :, ::-1].astype(np.float32) / 255.0
    return torch.from_numpy(img).permute(2, 0, 1)


def _to_numpy(tensor: torch.Tensor, bgr: bool = True) -> np.ndarray:
    """CHW RGB float [0,1] -> HWC BGR uint8."""
    img = tensor.clamp(0, 1).permute(1, 2, 0).cpu().numpy()
    img = (img * 255.0).astype(np.uint8)
    if bgr:
        img = img[:, :, ::-1]
    return img


def _pad_to_multiple(img: torch.Tensor, multiple: int = 32) -> tuple[torch.Tensor, tuple[int, int, int, int]]:
    """Pad a BCHW tensor so H and W are multiples of `multiple`. Returns (padded, padding)."""
    _, _, h, w = img.shape
    pad_h = (multiple - h % multiple) % multiple
    pad_w = (multiple - w % multiple) % multiple
    padding = (0, pad_w, 0, pad_h)  # left, right, top, bottom
    return F.pad(img, padding), padding


class RIFEInterpolator(Interpolator):
    """RIFE HDv3 midpoint interpolator (official Practical-RIFE architecture)."""

    def __init__(self, weights_path: str | Path, device: torch.device | None = None) -> None:
        self.device = device if device is not None else torch.device("cpu")
        if self.device.type == "cuda":
            torch.backends.cudnn.enabled = True
            torch.backends.cudnn.benchmark = True
        self.model = RIFEModel(str(weights_path), device=self.device)

    def interpolate_pair(self, img0: np.ndarray, img1: np.ndarray, timestep: float = 0.5) -> np.ndarray:
        t0 = _to_tensor(img0).unsqueeze(0).to(self.device)
        t1 = _to_tensor(img1).unsqueeze(0).to(self.device)
        _, _, orig_h, orig_w = t0.shape
        # RIFE/IFNet expects spatial dimensions divisible by 32; pad then crop.
        t0, _ = _pad_to_multiple(t0, multiple=32)
        t1, _ = _pad_to_multiple(t1, multiple=32)
        with torch.no_grad():
            mid = self.model.interpolate(t0, t1, timestep=timestep, scale=1.0)
        mid = mid[:, :, :orig_h, :orig_w]
        return _to_numpy(mid.squeeze(0))

    def interpolate_sequence(self, frames: list[np.ndarray], n_outputs: int = 1) -> list[np.ndarray]:
        if n_outputs != 1:
            raise ValueError("RIFE only supports single midpoint interpolation; use recursive application for Nx.")
        output = [frames[0]]
        for i in range(len(frames) - 1):
            mid = self.interpolate_pair(frames[i], frames[i + 1], timestep=0.5)
            output.append(mid)
            output.append(frames[i + 1])
        return output


class FLAVRInterpolator(Interpolator):
    def __init__(self, weights_path: str | Path, device: torch.device | None = None) -> None:
        self.device = device if device is not None else torch.device("cpu")
        self.model = UNet_3D_3D("unet_18", n_inputs=4, n_outputs=1, joinType="concat", upmode="transpose")
        state_dict = torch.load(str(weights_path), map_location="cpu", weights_only=True)
        if "state_dict" in state_dict:
            state_dict = {k.partition("module.")[-1]: v for k, v in state_dict["state_dict"].items()}
        self.model.load_state_dict(state_dict)
        self.model.to(self.device)
        self.model.eval()

    def interpolate_pair(self, img0: np.ndarray, img1: np.ndarray, timestep: float = 0.5) -> np.ndarray:
        raise NotImplementedError("FLAVR requires a 4-frame window; use interpolate_sequence.")

    def interpolate_sequence(self, frames: list[np.ndarray], n_outputs: int = 1) -> list[np.ndarray]:
        if len(frames) < 4:
            raise ValueError("FLAVR requires at least 4 frames")
        n_outputs = max(1, n_outputs)
        tensors = [_to_tensor(f) for f in frames]
        video = torch.stack(tensors, dim=1).to(self.device)  # C,T,H,W
        h, w = video.shape[2], video.shape[3]
        pad_h = (8 - h % 8) % 8
        pad_w = (8 - w % 8) % 8
        video = torch.nn.functional.pad(video, (0, pad_w, 0, pad_h))

        outputs = [frames[0], frames[1]]
        with torch.no_grad():
            for i in range(len(frames) - 3):
                window = [video[:, i + j, :, :].unsqueeze(0) for j in range(4)]
                out = self.model(window)
                for j in range(n_outputs):
                    mid = _to_numpy(out[j].squeeze(0)[:, :h, :w])
                    outputs.append(mid)
                outputs.append(frames[i + 2])
            if len(frames) > 3:
                outputs.append(frames[-1])
        return outputs


class BlendInterpolator(Interpolator):
    """Fast CPU fallback that blends adjacent frames."""

    def interpolate_pair(self, img0: np.ndarray, img1: np.ndarray, timestep: float = 0.5) -> np.ndarray:
        return cv2.addWeighted(img0, 1 - timestep, img1, timestep, 0)

    def interpolate_sequence(self, frames: list[np.ndarray], n_outputs: int = 1) -> list[np.ndarray]:
        if len(frames) < 2:
            return frames
        output = [frames[0]]
        for i in range(len(frames) - 1):
            for j in range(1, n_outputs + 1):
                t = j / (n_outputs + 1)
                output.append(self.interpolate_pair(frames[i], frames[i + 1], t))
            output.append(frames[i + 1])
        return output


def load_interpolator(model_name: str, weights_path: str | Path, device: torch.device | None = None) -> Interpolator:
    if model_name == "rife":
        return RIFEInterpolator(weights_path, device)
    if model_name == "flavr":
        return FLAVRInterpolator(weights_path, device)
    raise ValueError(f"Unknown interpolation model: {model_name}")
