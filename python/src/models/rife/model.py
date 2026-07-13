import torch

from .ifnet import IFNet


def _convert_state_dict(state_dict):
    return {k.replace("module.", ""): v for k, v in state_dict.items()}


class RIFEModel:
    """Official RIFE HDv3 inference wrapper for CUDA/CPU PyTorch."""

    def __init__(self, weights_path: str, device: torch.device | None = None) -> None:
        self.device = device if device is not None else torch.device("cpu")
        self.flownet = IFNet().to(self.device)
        state_dict = torch.load(weights_path, map_location="cpu", weights_only=True)
        self.flownet.load_state_dict(_convert_state_dict(state_dict))
        self.flownet.eval()

    @torch.no_grad()
    def interpolate(self, img0: torch.Tensor, img1: torch.Tensor, timestep: float = 0.5, scale: float = 1.0) -> torch.Tensor:
        """img0/img1: BCHW RGB float32 [0,1]. Returns the single midpoint frame.

        The timestep parameter is accepted for API compatibility but is ignored
        because the HDv3 architecture is trained for midpoint interpolation; callers
        that need Nx interpolation should use recursive bisection.
        """
        self.flownet.eval()
        imgs = torch.cat((img0, img1), dim=1)
        scale_list = [4 / scale, 2 / scale, 1 / scale]
        flow, mask, merged = self.flownet(imgs, scale_list)
        return merged[2]
