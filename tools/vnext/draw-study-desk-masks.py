"""Draw the study desk geometry masks from one audited 2:1 polygon set.

These masks are preview-only QA inputs. They intentionally separate the desk
top from the drawer/front facade and never include the chair, wastebasket or
rug. The JSON geometry remains the source of the depth-edge rule.
"""

from __future__ import annotations

import argparse
from pathlib import Path

from PIL import Image, ImageDraw


CANVAS = (1774, 887)
DESK_TOP = [(806, 382), (1115, 454), (1085, 511), (808, 431)]
DESK_FRONT = [(900, 461), (1085, 511), (1076, 612), (899, 564)]


def draw_mask(points: list[tuple[int, int]], output: Path) -> None:
    image = Image.new("L", CANVAS, 0)
    ImageDraw.Draw(image).polygon(points, fill=255)
    output.parent.mkdir(parents=True, exist_ok=True)
    image.save(output, format="PNG", optimize=True)


def draw_preview(scene_master: Path, output: Path) -> None:
    scene = Image.open(scene_master).convert("RGBA")
    overlay = Image.new("RGBA", CANVAS, (0, 0, 0, 0))
    draw = ImageDraw.Draw(overlay)
    draw.polygon(DESK_TOP, fill=(255, 190, 50, 105), outline=(255, 245, 120, 235), width=5)
    draw.polygon(DESK_FRONT, fill=(50, 190, 255, 115), outline=(90, 235, 255, 240), width=5)
    draw.line([(808, 431), (1085, 511)], fill=(255, 245, 160, 245), width=5)
    preview = Image.alpha_composite(scene, overlay).convert("RGB")
    output.parent.mkdir(parents=True, exist_ok=True)
    preview.save(output, format="WEBP", quality=82, method=6)


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--output-dir", type=Path, required=True)
    parser.add_argument("--scene-master", type=Path)
    parser.add_argument("--preview-output", type=Path)
    args = parser.parse_args()

    draw_mask(DESK_TOP, args.output_dir / "desk-top-surface-mask-2x1-v1.png")
    draw_mask(DESK_FRONT, args.output_dir / "desk-front-facade-mask-2x1-v1.png")
    if args.scene_master and args.preview_output:
        draw_preview(args.scene_master, args.preview_output)


if __name__ == "__main__":
    main()
