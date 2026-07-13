"""NAFNet inference wrapper.

Minimal standalone implementation of the NAFNet architecture from
"Simple Baselines for Image Restoration" (Chen et al., 2022).
"""

from __future__ import annotations

from pathlib import Path

import numpy as np
import torch
import torch.nn as nn
import torch.nn.functional as F


class LayerNorm2d(nn.Module):
    """LayerNorm applied per channel (common in restoration backbones)."""

    def __init__(self, dim: int) -> None:
        super().__init__()
        self.weight = nn.Parameter(torch.ones(dim))
        self.bias = nn.Parameter(torch.zeros(dim))

    def forward(self, x: torch.Tensor) -> torch.Tensor:
        mean = x.mean(dim=1, keepdim=True)
        var = (x - mean).pow(2).mean(dim=1, keepdim=True)
        x = (x - mean) / torch.sqrt(var + 1e-6)
        x = self.weight[:, None, None] * x + self.bias[:, None, None]
        return x


class SimpleGate(nn.Module):
    def forward(self, x: torch.Tensor) -> torch.Tensor:
        x1, x2 = x.chunk(2, dim=1)
        return x1 * x2


class NAFBlock(nn.Module):
    def __init__(self, c: int, dw_expand: int = 2, ffn_expand: int = 2, dropout_rate: float = 0.0) -> None:
        super().__init__()
        dw_channel = c * dw_expand
        self.conv1 = nn.Conv2d(c, dw_channel, 1, padding=0, stride=1, bias=True)
        self.conv2 = nn.Conv2d(dw_channel, dw_channel, 3, padding=1, stride=1, groups=dw_channel, bias=True)
        self.conv3 = nn.Conv2d(dw_channel // 2, c, 1, padding=0, stride=1, bias=True)
        self.sca = nn.Sequential(
            nn.AdaptiveAvgPool2d(1),
            nn.Conv2d(dw_channel // 2, dw_channel // 2, 1, padding=0, stride=1, bias=True),
        )
        self.sg = SimpleGate()
        ffn_channel = ffn_expand * c
        self.conv4 = nn.Conv2d(c, ffn_channel, 1, padding=0, stride=1, bias=True)
        self.conv5 = nn.Conv2d(ffn_channel // 2, c, 1, padding=0, stride=1, bias=True)
        self.norm1 = LayerNorm2d(c)
        self.norm2 = LayerNorm2d(c)
        self.dropout1 = nn.Dropout(dropout_rate) if dropout_rate > 0 else nn.Identity()
        self.dropout2 = nn.Dropout(dropout_rate) if dropout_rate > 0 else nn.Identity()
        self.beta = nn.Parameter(torch.zeros((1, c, 1, 1)), requires_grad=True)
        self.gamma = nn.Parameter(torch.zeros((1, c, 1, 1)), requires_grad=True)

    def forward(self, inp: torch.Tensor) -> torch.Tensor:
        x = self.norm1(inp)
        x = self.conv1(x)
        x = self.conv2(x)
        x = self.sg(x)
        x = x * self.sca(x)
        x = self.conv3(x)
        x = self.dropout1(x)
        y = inp + x * self.beta
        x = self.conv4(self.norm2(y))
        x = self.sg(x)
        x = self.conv5(x)
        x = self.dropout2(x)
        return y + x * self.gamma


class NAFNet(nn.Module):
    def __init__(
        self,
        img_channel: int = 3,
        width: int = 64,
        middle_blk_num: int = 12,
        enc_blk_nums: list[int] | None = None,
        dec_blk_nums: list[int] | None = None,
    ) -> None:
        super().__init__()
        enc_blk_nums = enc_blk_nums or [2, 2, 4, 8]
        dec_blk_nums = dec_blk_nums or [2, 2, 2, 2]

        self.intro = nn.Conv2d(img_channel, width, 3, padding=1, stride=1, bias=True)
        self.ending = nn.Conv2d(width, img_channel, 3, padding=1, stride=1, bias=True)

        self.encoders = nn.ModuleList()
        self.decoders = nn.ModuleList()
        self.middle_blks = nn.Sequential(*[NAFBlock(width * 2 ** len(enc_blk_nums)) for _ in range(middle_blk_num)])
        self.ups = nn.ModuleList()
        self.downs = nn.ModuleList()

        chan = width
        for num in enc_blk_nums:
            self.encoders.append(nn.Sequential(*[NAFBlock(chan) for _ in range(num)]))
            self.downs.append(nn.Conv2d(chan, chan * 2, 2, 2))
            chan *= 2

        for num in dec_blk_nums:
            self.ups.append(nn.Sequential(nn.Conv2d(chan, chan * 2, 1, bias=False), nn.PixelShuffle(2)))
            chan //= 2
            self.decoders.append(nn.Sequential(*[NAFBlock(chan) for _ in range(num)]))

        self.padder_size = 2 ** len(self.encoders)

    def forward(self, inp: torch.Tensor) -> torch.Tensor:
        _, _, h, w = inp.shape
        inp = self._check_image_size(inp)
        x = self.intro(inp)

        encs = []
        for encoder, down in zip(self.encoders, self.downs):
            x = encoder(x)
            encs.append(x)
            x = down(x)

        x = self.middle_blks(x)

        for decoder, up, enc_skip in zip(self.decoders, self.ups, encs[::-1]):
            x = up(x)
            x = x + enc_skip
            x = decoder(x)

        x = self.ending(x)
        x = x + inp
        return x[:, :, :h, :w]

    def _check_image_size(self, x: torch.Tensor) -> torch.Tensor:
        _, _, h, w = x.size()
        mod_pad_h = (self.padder_size - h % self.padder_size) % self.padder_size
        mod_pad_w = (self.padder_size - w % self.padder_size) % self.padder_size
        return F.pad(x, (0, mod_pad_w, 0, mod_pad_h))


class NAFNetDeblur:
    """Deblur a single RGB image with NAFNet (GoPro width-64 model)."""

    def __init__(self, weights_path: str | Path, device: torch.device | None = None) -> None:
        self.device = device if device is not None else torch.device("cpu")
        weights_path = Path(weights_path)

        self.model = NAFNet(
            img_channel=3,
            width=64,
            middle_blk_num=1,
            enc_blk_nums=[1, 1, 1, 28],
            dec_blk_nums=[1, 1, 1, 1],
        )
        state_dict = torch.load(weights_path, map_location="cpu", weights_only=True)
        if "params" in state_dict:
            state_dict = state_dict["params"]
        self.model.load_state_dict(state_dict)
        self.model.to(self.device)
        self.model.eval()

    def _preprocess(self, img: np.ndarray) -> torch.Tensor:
        img = img[:, :, ::-1].astype(np.float32) / 255.0
        tensor = torch.from_numpy(img).permute(2, 0, 1).unsqueeze(0)
        return tensor.to(self.device)

    def _postprocess(self, tensor: torch.Tensor) -> np.ndarray:
        img = tensor.squeeze(0).permute(1, 2, 0).clamp(0, 1).cpu().numpy()
        img = (img * 255.0).astype(np.uint8)
        return img[:, :, ::-1]

    @torch.no_grad()
    def deblur(self, img: np.ndarray) -> np.ndarray:
        input_tensor = self._preprocess(img)
        output_tensor = self.model(input_tensor)
        return self._postprocess(output_tensor)

    @torch.no_grad()
    def deblur_tiled(self, img: np.ndarray, tile_size: int = 512) -> np.ndarray:
        input_tensor = self._preprocess(img)
        _, _, h, w = input_tensor.shape
        output = torch.zeros_like(input_tensor)
        overlap = 16

        for y in range(0, h, tile_size - overlap):
            for x in range(0, w, tile_size - overlap):
                y_end = min(y + tile_size, h)
                x_end = min(x + tile_size, w)
                tile = input_tensor[:, :, y:y_end, x:x_end]
                output[:, :, y:y_end, x:x_end] = self.model(tile)

        return self._postprocess(output)
