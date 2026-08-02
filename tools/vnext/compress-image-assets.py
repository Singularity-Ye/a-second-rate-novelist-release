#!/usr/bin/env python3
"""Create lightweight, non-destructive image references for image-gen work.

The source files are never modified. Visual references are written as WebP;
mask/alpha/hitbox files stay lossless PNG so their binary geometry is intact.
"""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path
from typing import Any

try:
    from PIL import Image, ImageOps
except ImportError as exc:  # pragma: no cover - exercised by the CLI only
    raise SystemExit("Pillow is required: python -m pip install Pillow") from exc


IMAGE_SUFFIXES = {".png", ".jpg", ".jpeg", ".webp", ".bmp", ".tif", ".tiff"}
LOSSLESS_MARKERS = ("mask", "alpha", "hitbox", "overlay")


def is_lossless_asset(path: Path) -> bool:
    lowered = path.as_posix().lower()
    return any(marker in lowered for marker in LOSSLESS_MARKERS)


def has_alpha(image: Image.Image) -> bool:
    return "A" in image.getbands() or (image.mode == "P" and "transparency" in image.info)


def resized(image: Image.Image, max_edge: int | None) -> Image.Image:
    if not max_edge or max(image.size) <= max_edge:
        return image
    width, height = image.size
    scale = max_edge / max(width, height)
    target = (max(1, round(width * scale)), max(1, round(height * scale)))
    return image.resize(target, Image.Resampling.LANCZOS)


def save_webp(
    image: Image.Image,
    output: Path,
    quality: int,
    max_kb: int | None,
    min_edge: int,
) -> tuple[int, Image.Image]:
    output.parent.mkdir(parents=True, exist_ok=True)
    current = image
    while True:
        attempts = [quality, max(40, quality - 8), max(32, quality - 16), 28]
        for candidate in dict.fromkeys(attempts):
            current.save(output, format="WEBP", quality=candidate, method=6, exact=True)
            if max_kb is None or output.stat().st_size <= max_kb * 1024:
                return candidate, current
        if min(current.size) <= min_edge:
            return attempts[-1], current
        width, height = current.size
        scale = 0.9
        current = current.resize(
            (max(1, round(width * scale)), max(1, round(height * scale))),
            Image.Resampling.LANCZOS,
        )


def save_png(image: Image.Image, output: Path) -> int:
    output.parent.mkdir(parents=True, exist_ok=True)
    image.save(output, format="PNG", optimize=True, compress_level=9)
    return 0


def source_files(input_path: Path) -> tuple[Path, list[Path]]:
    if input_path.is_file():
        return input_path.parent, [input_path]
    if input_path.is_dir():
        return input_path, sorted(path for path in input_path.rglob("*") if path.is_file() and path.suffix.lower() in IMAGE_SUFFIXES)
    raise SystemExit(f"Input path does not exist: {input_path}")


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--input", required=True, type=Path, help="One image or a directory to scan recursively")
    parser.add_argument("--output-dir", required=True, type=Path, help="Separate output directory; sources are never overwritten")
    parser.add_argument("--max-edge", type=int, default=1774, help="Maximum pixel edge for visual references (default: 1774)")
    parser.add_argument("--quality", type=int, default=72, help="Initial WebP quality (default: 72)")
    parser.add_argument("--max-kb", type=int, default=100, help="Try to keep each visual reference below this size (default: 100)")
    parser.add_argument("--min-edge", type=int, default=256, help="Do not downscale a visual reference below this short edge (default: 256)")
    args = parser.parse_args()
    if not 1 <= args.quality <= 100 or args.max_edge < 1 or args.max_kb < 1 or args.min_edge < 1:
        parser.error("quality must be 1..100; max-edge, min-edge, and max-kb must be positive")

    root, files = source_files(args.input.resolve())
    if not files:
        raise SystemExit("No supported image files found")

    output_root = args.output_dir.resolve()
    output_root.mkdir(parents=True, exist_ok=True)
    records: list[dict[str, Any]] = []
    for source in files:
        relative = source.relative_to(root)
        lossless = is_lossless_asset(source)
        output = output_root / relative.with_suffix(".png" if lossless else ".webp")
        with Image.open(source) as opened:
            image = ImageOps.exif_transpose(opened)
            image.load()
            alpha = has_alpha(image)
            image = resized(image, args.max_edge)
            if lossless:
                prepared = image.convert("RGBA" if alpha else "L" if image.mode == "L" else "RGB")
                encoder_quality = save_png(prepared, output)
                format_name = "PNG"
            else:
                prepared = image.convert("RGBA" if alpha else "RGB")
                encoder_quality, prepared = save_webp(prepared, output, args.quality, args.max_kb, args.min_edge)
                format_name = "WEBP"
            records.append(
                {
                    "source": str(source),
                    "output": str(output),
                    "format": format_name,
                    "width": prepared.width,
                    "height": prepared.height,
                    "alpha": alpha,
                    "bytes": output.stat().st_size,
                    "encoderQuality": encoder_quality,
                    "losslessGeometry": lossless,
                }
            )

    manifest = {
        "tool": "tools/vnext/compress-image-assets.py",
        "defaults": {"maxEdge": args.max_edge, "minEdge": args.min_edge, "quality": args.quality, "maxKb": args.max_kb},
        "sourceRoot": str(root),
        "outputRoot": str(output_root),
        "assets": records,
    }
    (output_root / "compression-manifest.json").write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    visual = [record for record in records if record["format"] == "WEBP"]
    total_bytes = sum(record["bytes"] for record in records)
    print(json.dumps({"count": len(records), "visualWebP": len(visual), "totalBytes": total_bytes, "manifest": str(output_root / "compression-manifest.json")}, ensure_ascii=False))
    return 0


if __name__ == "__main__":
    sys.exit(main())
