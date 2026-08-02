# Image-gen lightweight defaults

This is the shared post-processing contract for lightweight scene-generation tasks.

The built-in `image_gen` response does not expose a hard byte-size control to the
calling agent. A prompt can ask for a compact preview, but it cannot guarantee a
KB-sized file. Therefore every generated image must be compressed immediately
after generation, before it is copied into a handoff or used as a later reference.

Run from the repository root:

```powershell
python tools/vnext/compress-image-assets.py `
  --input <generated-file-or-directory> `
  --output-dir .tmp/world-lab-dev/imagegen-compressed/<scene>/<job> `
  --max-edge 1774 `
  --quality 72 `
  --max-kb 100
```

The PowerShell wrapper is equivalent:

```powershell
.\tools\vnext\compress-image-assets.ps1 `
  -InputPath <generated-file-or-directory> `
  -OutputDirectory .tmp/world-lab-dev/imagegen-compressed/<scene>/<job>
```

Rules:

- Visual references become WebP, normally at q72, with a 1774px maximum edge, and a 100KB target.
- If quality reduction is still above the target, the tool downsizes the reference proportionally until it fits or reaches a 256px short-edge floor. This is only for context/reference copies, never formal masters.
- Transparent visual references keep alpha in WebP.
- Paths containing `mask`, `alpha`, `hitbox`, or `overlay` remain lossless PNG.
- The source image is never overwritten or deleted.
- `compression-manifest.json` records source, output, dimensions, alpha, and byte size.
- Handoff messages report only the compressed path and manifest; do not attach the raw image again.
- This is a context/reference package, not a replacement for formal PNG or runtime assets.

For model inputs, use at most one clean master and one identity reference, preferably
from `apps/h5/public/assets/ecology/reference-pack-kb-v1`.
