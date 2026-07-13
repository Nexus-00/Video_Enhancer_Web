"""Real-ESRGAN inference wrapper.

This module implements a minimal RRDBNet that can load the official
Real-ESRGAN PyTorch weights without requiring the heavy `realesrgan`/`basicsr`
package chain.
"""

from __future__ import annotations

from pathlib import Path

import numpy as np
import torch
import torch.nn as nn
import torch.nn.functional as F


class ResidualDenseBlock(nn.Module):
    """Residual Dense Block used in RRDB."""

    def __init__(self, num_feat: int = 64, num_grow_ch: int = 32) -> None:
        super().__init__()
        self.conv1 = nn.Conv2d(num_feat, num_grow_ch, 3, 1, 1)
        self.conv2 = nn.Conv2d(num_feat + num_grow_ch, num_grow_ch, 3, 1, 1)
        self.conv3 = nn.Conv2d(num_feat + 2 * num_grow_ch, num_grow_ch, 3, 1, 1)
        self.conv4 = nn.Conv2d(num_feat + 3 * num_grow_ch, num_grow_ch, 3, 1, 1)
        self.conv5 = nn.Conv2d(num_feat + 4 * num_grow_ch, num_feat, 3, 1, 1)
        self.lrelu = nn.LeakyReLU(negative_slope=0.2, inplace=True)

    def forward(self, x: torch.Tensor) -> torch.Tensor:
        x1 = self.lrelu(self.conv1(x))
        x2 = self.lrelu(self.conv2(torch.cat([x, x1], dim=1)))
        x3 = self.lrelu(self.conv3(torch.cat([x, x1, x2], dim=1)))
        x4 = self.lrelu(self.conv4(torch.cat([x, x1, x2, x3], dim=1)))
        x5 = self.conv5(torch.cat([x, x1, x2, x3, x4], dim=1))
        return x5 * 0.2 + x


class RRDB(nn.Module):
    """Residual in Residual Dense Block."""

    def __init__(self, num_feat: int, num_grow_ch: int = 32) -> None:
        super().__init__()
        self.rdb1 = ResidualDenseBlock(num_feat, num_grow_ch)
        self.rdb2 = ResidualDenseBlock(num_feat, num_grow_ch)
        self.rdb3 = ResidualDenseBlock(num_feat, num_grow_ch)

    def forward(self, x: torch.Tensor) -> torch.Tensor:
        out = self.rdb1(x)
        out = self.rdb2(out)
        out = self.rdb3(out)
        return out * 0.2 + x


class RRDBNet(nn.Module):
    """Real-ESRGAN generator network (RRDBNet)."""

    def __init__(
        self,
        num_in_ch: int = 3,
        num_out_ch: int = 3,
        scale: int = 4,
        num_feat: int = 64,
        num_block: int = 23,
        num_grow_ch: int = 32,
    ) -> None:
        super().__init__()
        self.scale = scale
        self.conv_first = nn.Conv2d(num_in_ch, num_feat, 3, 1, 1)
        self.body = nn.ModuleList([RRDB(num_feat, num_grow_ch) for _ in range(num_block)])
        self.conv_body = nn.Conv2d(num_feat, num_feat, 3, 1, 1)

        # Upsampling modules for 4x (2x then 2x)
        if scale >= 2:
            self.conv_up1 = nn.Conv2d(num_feat, num_feat, 3, 1, 1)
        if scale >= 4:
            self.conv_up2 = nn.Conv2d(num_feat, num_feat, 3, 1, 1)
        if scale == 8:
            self.conv_up3 = nn.Conv2d(num_feat, num_feat, 3, 1, 1)

        self.conv_hr = nn.Conv2d(num_feat, num_feat, 3, 1, 1)
        self.conv_last = nn.Conv2d(num_feat, num_out_ch, 3, 1, 1)
        self.lrelu = nn.LeakyReLU(negative_slope=0.2, inplace=True)

    def forward(self, x: torch.Tensor) -> torch.Tensor:
        feat = self.conv_first(x)
        body_feat = feat
        for block in self.body:
            body_feat = block(body_feat)
        body_feat = self.conv_body(body_feat)
        feat = feat + body_feat

        if self.scale >= 2:
            feat = self.lrelu(self.conv_up1(F.interpolate(feat, scale_factor=2, mode="nearest")))
        if self.scale >= 4:
            feat = self.lrelu(self.conv_up2(F.interpolate(feat, scale_factor=2, mode="nearest")))
        if self.scale >= 8:
            feat = self.lrelu(self.conv_up3(F.interpolate(feat, scale_factor=2, mode="nearest")))

        out = self.conv_last(self.lrelu(self.conv_hr(feat)))
        return out


class RealESRGANUpscaler:
    """Upscale a single RGB image with Real-ESRGAN."""

    def __init__(self, weights_path: str | Path, device: torch.device | None = None) -> None:
        self.device = device if device is not None else torch.device("cpu")
        weights_path = Path(weights_path)
        self._name = weights_path.name

        if "anime_6B" in self._name:
            num_block = 6
        elif "x4plus" in self._name:
            num_block = 23
        else:
            num_block = 23

        self.model = RRDBNet(num_in_ch=3, num_out_ch=3, scale=4, num_feat=64, num_block=num_block, num_grow_ch=32)
        state_dict = torch.load(weights_path, map_location="cpu", weights_only=True)
        if "params_ema" in state_dict:
            state_dict = state_dict["params_ema"]
        elif "params" in state_dict:
            state_dict = state_dict["params"]
        self.model.load_state_dict(state_dict)
        self.model.to(self.device)
        self.model.eval()

    def _preprocess(self, img: np.ndarray) -> torch.Tensor:
        """img: HWC uint8 BGR -> CHW float32 RGB normalized."""
        img = img[:, :, ::-1].astype(np.float32) / 255.0
        tensor = torch.from_numpy(img).permute(2, 0, 1).unsqueeze(0)
        return tensor.to(self.device)

    def _postprocess(self, tensor: torch.Tensor) -> np.ndarray:
        """tensor: BCHW float32 -> HWC uint8 BGR."""
        img = tensor.squeeze(0).permute(1, 2, 0).clamp(0, 1).cpu().numpy()
        img = (img * 255.0).astype(np.uint8)
        return img[:, :, ::-1]

    @torch.no_grad()
    def upscale(self, img: np.ndarray) -> np.ndarray:
        input_tensor = self._preprocess(img)
        output_tensor = self.model(input_tensor)
        return self._postprocess(output_tensor)

    @torch.no_grad()
    def upscale_tiled(self, img: np.ndarray, tile_size: int = 256) -> np.ndarray:
        """Tile-based inference to keep GPU memory bounded."""
        input_tensor = self._preprocess(img)
        _, _, h, w = input_tensor.shape
        output_h, output_w = h * 4, w * 4
        output = torch.zeros(1, 3, output_h, output_w, device=self.device)

        tile_in = tile_size
        tile_out = tile_size * 4
        overlap = 8

        for y in range(0, h, tile_in - overlap):
            for x in range(0, w, tile_in - overlap):
                y_end = min(y + tile_in, h)
                x_end = min(x + tile_in, w)
                y_out = y * 4
                x_out = x * 4
                y_end_out = y_end * 4
                x_end_out = x_end * 4
                tile = input_tensor[:, :, y:y_end, x:x_end]
                output[:, :, y_out:y_end_out, x_out:x_end_out] = self.model(tile)

        return self._postprocess(output)
