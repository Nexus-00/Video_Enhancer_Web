"""Duplicate frame detection and removal."""

from __future__ import annotations

import cv2
import numpy as np
from typing import Sequence


def frame_similarity_mse(a: np.ndarray, b: np.ndarray) -> float:
    """Compute mean squared error between two frames."""
    return float(np.mean((a.astype(np.float32) - b.astype(np.float32)) ** 2))


def detect_duplicate_frames(
    frame_paths: Sequence[str], threshold: float = 10.0
) -> list[int]:
    """Return indices of frames that are duplicates of the previous frame.

    A frame is considered a duplicate if the MSE with the previous frame is
    below the threshold. Lower threshold means stricter matching.
    """
    if not frame_paths:
        return []

    duplicates: list[int] = []
    prev = cv2.imread(frame_paths[0])
    if prev is None:
        return []

    for i in range(1, len(frame_paths)):
        curr = cv2.imread(frame_paths[i])
        if curr is None:
            continue

        # Resize to same dimensions if needed
        if curr.shape != prev.shape:
            curr = cv2.resize(curr, (prev.shape[1], prev.shape[0]))

        mse = frame_similarity_mse(prev, curr)
        if mse < threshold:
            duplicates.append(i)
        else:
            prev = curr

    return duplicates
