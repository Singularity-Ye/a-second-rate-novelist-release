# 小说家角色统一形象库 v1

本目录收录用户确认可采纳的小说家角色参考图，作为后续场景化生图的统一身份/画风输入。

| 文件 | 用途 |
| --- | --- |
| `novelist-front-standing-reference-v1.webp` | 正面站立、整体身形、纸板轮廓与服装参考 |
| `novelist-motion-three-quarter-reference-v1.webp` | 侧向行动、脸部比例、动态姿态参考 |
| `novelist-writing-back-three-quarter-reference-v1.webp` | 背后三分之二、写作姿态与红发带参考 |
| `novelist-cartoon-pose-sheet-reference-v1.webp` | 多姿态总表、统一画风与圆弧底座比例参考 |

## 使用约束

- 四张图均为参考图，不是 runtime actor cutout，也不是正式场景母图。
- 三张绿色背景图保留绿色背景，仅用于身份、线稿、服装、纸板轮廓和姿态参考；不能直接当透明角色层。
- 角色核心形象：瘦削成年小说家、疲惫木讷但带卡通憨态，乱黑发、红发带、深灰补丁长袍、棕色纸板外框、浅扁圆弧底座。
- 场景生图时，身份参考与同场景 clean master 分工使用；不要把姿态总表当作场景母图。
- 目录内 WebP 均为上下文轻量副本，单张控制在 100KB 内；原始来源暂存于 `.tmp/world-lab-dev/accepted-character-sources-v1/`，未覆盖任何正式 PNG。

压缩记录见 `novelist-identity-library-v1-compression-manifest.json`。
