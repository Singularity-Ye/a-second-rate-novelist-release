# reference-pack-kb-v2

轻量生图参考包。v1 保留不动；本包由 `tools/vnext/compress-image-assets.py`
重新压缩，19 张图全部控制在 100KB 以内，总大小约 1.31MB。

- 视觉图：WebP，保留透明角色 alpha；最长边默认 1774px。
- mask / alpha / hitbox / overlay：若出现则使用无损 PNG，不能为了字节数做有损压缩。
- 正式母图和 runtime PNG 不被覆盖、不被删除。
- 交给 image-gen 时优先单张 clean master + 单张角色身份参考，不要把整个目录一次性上传。
- `compression-manifest.json` 记录源文件、输出文件、尺寸、alpha 与字节数。

推荐来源：

- `scenes/study/study-scene-master-2x1-formal-v1.webp`
- `scenes/dining-kitchen/dining-kitchen-scene-master-2x1-v1.webp`
- `scenes/attic/attic-clean-master-v1.webp`
- `characters/novelist/novelist-paper-doll-concept-v1.webp`
- `characters/novelist/novelist-back-three-quarter-v1.webp`
- `maps/home-map-v1.webp`
