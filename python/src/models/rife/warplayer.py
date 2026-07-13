import torch

_BACKWARP_TEN_GRID = {}


def warp(tenInput, tenFlow):
    k = (str(tenFlow.device), str(tenFlow.size()))
    if k not in _BACKWARP_TEN_GRID:
        device = tenFlow.device
        tenHorizontal = (
            torch.linspace(-1.0, 1.0, tenFlow.shape[3], device=device)
            .view(1, 1, 1, tenFlow.shape[3])
            .expand(tenFlow.shape[0], -1, tenFlow.shape[2], -1)
        )
        tenVertical = (
            torch.linspace(-1.0, 1.0, tenFlow.shape[2], device=device)
            .view(1, 1, tenFlow.shape[2], 1)
            .expand(tenFlow.shape[0], -1, -1, tenFlow.shape[3])
        )
        _BACKWARP_TEN_GRID[k] = torch.cat([tenHorizontal, tenVertical], dim=1)

    tenFlow = torch.cat(
        [
            tenFlow[:, 0:1, :, :] / ((tenInput.shape[3] - 1.0) / 2.0),
            tenFlow[:, 1:2, :, :] / ((tenInput.shape[2] - 1.0) / 2.0),
        ],
        dim=1,
    )
    g = (_BACKWARP_TEN_GRID[k] + tenFlow).permute(0, 2, 3, 1)
    return torch.nn.functional.grid_sample(
        input=tenInput, grid=g, mode="bilinear", padding_mode="border", align_corners=True
    )
