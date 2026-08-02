#!/usr/bin/env python3
"""Convert connected chroma-green backgrounds to transparent PNGs.

This is a small deterministic helper for the green-screen actor previews used by
the geometry test. It only keys green pixels connected to the image border, so a
green detail inside a future prop is not removed accidentally. Sources are never
overwritten.
"""

from __future__ import annotations

import argparse
from collections import deque
from pathlib import Path

from PIL import Image


IMAGE_SUFFIXES = {".png", ".jpg", ".jpeg", ".webp", ".bmp", ".tif", ".tiff"}


def green_candidate(rgb: tuple[int, int, int], dominance: int, minimum_green: int) -> bool:
    red, green, blue = rgb
    return green >= minimum_green and green - max(red, blue) >= dominance


def connected_green_mask(image: Image.Image, dominance: int, minimum_green: int) -> list[bool]:
    rgb = image.convert("RGB")
    width, height = rgb.size
    pixels = list(rgb.getdata())
    candidates = [green_candidate(pixel, dominance, minimum_green) for pixel in pixels]
    keyed = [False] * len(pixels)
    queue: deque[tuple[int, int]] = deque()

    def enqueue(x: int, y: int) -> None:
        index = y * width + x
        if candidates[index] and not keyed[index]:
            keyed[index] = True
            queue.append((x, y))

    for x in range(width):
        enqueue(x, 0)
        enqueue(x, height - 1)
    for y in range(height):
        enqueue(0, y)
        enqueue(width - 1, y)

    while queue:
        x, y = queue.popleft()
        for next_x, next_y in ((x - 1, y), (x + 1, y), (x, y - 1), (x, y + 1)):
            if 0 <= next_x < width and 0 <= next_y < height:
                enqueue(next_x, next_y)
    return keyed


def make_transparent(image: Image.Image, dominance: int, minimum_green: int) -> Image.Image:
    rgba = image.convert("RGBA")
    pixels = list(rgba.getdata())
    keyed = connected_green_mask(rgba, dominance, minimum_green)
    output: list[tuple[int, int, int, int]] = []

    for index, (red, green, blue, alpha) in enumerate(pixels):
        if keyed[index]:
            output.append((red, green, blue, 0))
            continue

        # Give anti-aliased green fringe a soft alpha instead of leaving a neon
        # halo around the cardboard contour. The dark outline and paper colors
        # have little green dominance and remain opaque.
        green_excess = green - max(red, blue)
        if green_excess > 8:
            alpha_scale = max(0.0, min(1.0, 1.0 - (green_excess - 8) / 55.0))
            alpha = round(alpha * alpha_scale)
        output.append((red, green, blue, alpha))

    result = Image.new("RGBA", rgba.size)
    result.putdata(output)
    return result


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--input", required=True, type=Path)
    parser.add_argument("--output-dir", required=True, type=Path)
    parser.add_argument("--dominance", type=int, default=55)
    parser.add_argument("--minimum-green", type=int, default=120)
    args = parser.parse_args()

    source = args.input.resolve()
    if not source.is_dir():
        raise SystemExit(f"Input directory does not exist: {source}")
    files = sorted(path for path in source.rglob("*") if path.is_file() and path.suffix.lower() in IMAGE_SUFFIXES)
    if not files:
        raise SystemExit("No supported image files found")

    output_root = args.output_dir.resolve()
    output_root.mkdir(parents=True, exist_ok=True)
    for source_file in files:
        relative = source_file.relative_to(source)
        output_file = output_root / relative.with_suffix(".png")
        output_file.parent.mkdir(parents=True, exist_ok=True)
        with Image.open(source_file) as opened:
            keyed = make_transparent(opened, args.dominance, args.minimum_green)
            keyed.save(output_file, format="PNG", optimize=True, compress_level=9)
        print(f"{source_file.name} -> {output_file.name}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
