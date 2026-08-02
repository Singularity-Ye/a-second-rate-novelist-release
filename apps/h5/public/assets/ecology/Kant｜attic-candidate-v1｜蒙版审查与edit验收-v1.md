---
asset_role: candidate-review-mask-and-edit-acceptance
project: 二流小说家
topology_v1: balcony-removed-terrace-greenery-retained
room_ids:
  - attic
  - bathroom-private
attic_candidate_status: conditional-layout-reference-not-formal-master
bathroom_status: closed-door-outside-node-only
canvas: 1536x1024
mask_semantics: white-active-node-footprint-black-protected-or-outside
provider_called: false
code_changed: false
author: Kant
---

# attic 候选 v1｜蒙版审查、坐标说明与 edit 验收

## 1. 输入与拓扑范围

本轮 v1 拓扑移除 `balcony`，保留 `terrace-greenery`；本笔记只处理 `attic` 与 `bathroom-private`。

阁楼两份输入实际为同一张 PNG：

- 剪贴板候选原图：[codex-clipboard-31cf848b-8a4c-42de-b57a-8a4cfa1facf8.png](C:/Users/Yhx06/AppData/Local/Temp/codex-clipboard-31cf848b-8a4c-42de-b57a-8a4cfa1facf8.png)
- 项目候选归档：[attic-scene-candidate-v1.webp](D:/Yhx06/Documents/仙术工坊——项目集/a-second-rate-novelist/apps/h5/public/assets/ecology/formal-scenes/attic/candidates/attic-scene-candidate-v1.webp)
- 画布：`1536×1024`
- 两份文件 SHA-256：`B74507DEA650B7B613F211D2E66DB3BDF3DADF472CCCCE8EA60548422C7481CA`

候选图保留在 `candidates/`，不升级为 `attic-scene-master-v1.png`，不登记为正式母图。

## 2. 视觉候选审查结论

### 2.1 结论

**结论：可支持“中心地板内的有限纸板人偶活动”和节点蒙版原型；暂不具备正式母图资格。**

中心地板有足够的连续木地板，可支持从中心区域靠近 `archive-shelf` 或在 `stair-entry` 外侧停留。但它不能被解释成“整间阁楼自由行走”：前景楼梯开口/栏杆切断了下方通路，两侧低矮斜屋顶和沿墙箱柜密集区都必须是禁入区。

### 2.2 审查矩阵

| 审查项 | 结果 | 说明 | 处理 |
| --- | --- | --- | --- |
| 画布与系列比例 | 通过 | 图像为 `1536×1024`，横向 3:2 | 可作为当前候选基底 |
| 三分之四空间感 | 通过 | 地板、斜屋顶和货架形成稳定的三分之四观看关系 | 后续 edit 不得改变镜头 |
| 空场景 | 通过 | 未见人物、纸板人偶或宠物 | 保持空背板合同 |
| 中心活动地板 | 条件通过 | 中心地板可站立、短距离移动；不能跨过前景楼梯开口 | 只开放中心活动区 |
| 斜屋顶低矮区 | 不可进入 | 左右两侧屋顶压低，角色会碰顶/被切出安全轮廓 | 标为 `attic-roof-low-no-entry` |
| 箱柜/书架密集区 | 不可进入 | 沿墙和边角收纳密集，不能承载角色路径 | 标为 `attic-storage-dense-no-entry` |
| `archive-shelf` | 条件通过 | 后方书架可作为查档热点，但需要选定一面稳定 shelf，减少周边竞争物 | 保留独立 mask，edit 只整理热点 |
| `stair-entry` | 条件通过 | 前景楼板开口和梯子可辨识；下方深处需要压暗/遮挡，入口前只能停留 | 保留独立 mask，edit 只修边界 |
| 正式母图资格 | 不通过 | 活动区被明显切割，节点和禁入区尚未被清楚表达 | 不改名、不移动到 master |

### 2.3 必须标为禁入的区域

- `attic-roof-low-no-entry`：两侧斜屋顶下的低矮区域。不能放置站立、查档、爬梯或行走姿态；不要为了扩展活动区把屋顶抬高或把角色缩小到不再符合统一合同。
- `attic-storage-dense-no-entry`：沿墙的箱柜、抽屉柜、书架和密集书堆。它们可以作为背景/档案视觉锚点，但不是可踩踏、可穿越或可停靠的地面。
- `attic-stair-opening-no-entry`：楼板开口、梯子内侧和栏杆下方。角色只到外侧停止区；不进入下层，不让镜头进入开口。
- `attic-foreground-rail-no-entry`：前景栏杆/楼板边缘本身不作为移动路径，不能被人偶穿过或遮挡成错误地板。

### 2.4 重绘/局部 edit 建议

候选无需整张推翻，优先做受控局部 edit；如果网页 GPT 不能锁定局部区域，则重新生成一张同镜头候选，但仍不能批准为正式母图，直到以下条件全部满足：

1. 把中心活动地板整理成从前景到 `archive-shelf` 的连续主路径，不能用新箱柜或书堆横向切断。
2. 让 `archive-shelf` 只有一个主查档面，周边箱柜后退到背景；书脊、纸页和箱面保持无字。
3. 让 `stair-entry` 的开口边缘、外侧栏杆和梯子结构清楚，但把下方深处处理为不可透视的暗部，不展示楼下房间或可识别物件。
4. 保留两侧低矮斜屋顶和箱柜密集区作为视觉层，不把它们改造成可走区域。
5. 保持暖黄灯、冷蓝夜景、旧木地板、斑驳墙面和手绘 2.5D 纸板舞台质感；不得加入人物、纸板人偶、UI、文字或标记线。

## 3. mask-v1 坐标与语义

### 3.1 通用语义

本轮 mask PNG 采用与既有 `formal-scenes/*/masks/*/mask-v1.webp` 一致的黑底白区约定：

- **白色**：该节点本轮允许被编辑/作为交互落脚 footprint 的区域。
- **黑色**：不属于该节点的区域、保护区、禁入区或尚未允许编辑的区域。
- 蒙版不是最终运行时坐标合同；候选重绘后必须重新栅格化，不能沿用旧多边形。

### 3.2 attic mask 文件

#### `archive-shelf`

- 文件：[mask-v1.webp](D:/Yhx06/Documents/仙术工坊——项目集/a-second-rate-novelist/apps/h5/public/assets/ecology/formal-scenes/attic/masks/archive-shelf/mask-v1.webp)
- 白区语义：中心地板上、后方主 archive shelf 外侧的查档落脚/编辑 footprint。
- 候选像素多边形（仅供本候选复核）：`(415,480) → (885,480) → (1010,640) → (790,735) → (475,690)`。
- 白区不包含两侧低屋顶、沿墙箱柜密集区和前景楼梯开口；角色姿态仍需另行叠加，不能把角色画进 mask。

#### `stair-entry`

- 文件：[mask-v1.webp](D:/Yhx06/Documents/仙术工坊——项目集/a-second-rate-novelist/apps/h5/public/assets/ecology/formal-scenes/attic/masks/stair-entry/mask-v1.webp)
- 白区语义：前景楼梯开口外侧的接近/停止 footprint，不是楼梯内侧，不是下层可行走区域。
- 候选像素多边形（仅供本候选复核）：`(745,670) → (1085,655) → (1290,735) → (1100,820) → (820,790)`。
- 白区前缘必须由实际栏杆/楼板边界再次校准；楼梯开口、梯级内侧和下方空间继续保持黑色禁入。

### 3.3 bathroom-private mask 文件

当前没有浴室候选背景图，所以只准备“关闭门外节点”的保守占位 mask，不宣称有正式浴室坐标：

- 文件：[mask-v1.webp](D:/Yhx06/Documents/仙术工坊——项目集/a-second-rate-novelist/apps/h5/public/assets/ecology/formal-scenes/bathroom-private/masks/closed-door-outside/mask-v1.webp)
- 白区语义：未来浴室图中唯一允许 edit/绑定的关闭门外侧节点与门前外部阈限。
- 当前 provisional 多边形：`(990,270) → (1450,270) → (1490,730) → (960,730)`；这是安全占位，不是实际浴室布局坐标。
- 在真实 bathroom-private 背景图到位前，该 mask 不得用于 runtime、不得据此生成门内内容；如果候选门位置不同，整张 mask 重新绘制。
- 黑色区域继续表示不允许编辑的全部范围；门内永远没有可加载/可编辑的内部 layer。

## 4. 网页 GPT edit prompt 文件

以下 prompt 都要求把对应候选图作为附件输入。它们只做局部 edit，不调用本机 provider；浴室 prompt 特别要求整张背景无人物。

### 4.1 archive-shelf

- 文件：[Kant｜archive-shelf｜网页GPT-edit-prompt-v1.md](D:/Yhx06/Documents/仙术工坊——项目集/a-second-rate-novelist/apps/h5/public/assets/ecology/formal-scenes/attic/masks/archive-shelf/Kant｜archive-shelf｜网页GPT-edit-prompt-v1.md)
- edit 范围：只整理一个主归档 shelf、保持中心活动地板，禁止新增人物/文字/家具迷宫。

### 4.2 stair-entry

- 文件：[Kant｜stair-entry｜网页GPT-edit-prompt-v1.md](D:/Yhx06/Documents/仙术工坊——项目集/a-second-rate-novelist/apps/h5/public/assets/ecology/formal-scenes/attic/masks/stair-entry/Kant｜stair-entry｜网页GPT-edit-prompt-v1.md)
- edit 范围：只澄清前景楼梯入口、外侧栏杆和不可透视暗部；角色只能停在外侧，不能进入楼下。

### 4.3 bathroom-private closed-door outside

- 文件：[Kant｜closed-door-outside｜网页GPT-edit-prompt-v1.md](D:/Yhx06/Documents/仙术工坊——项目集/a-second-rate-novelist/apps/h5/public/assets/ecology/formal-scenes/bathroom-private/masks/closed-door-outside/Kant｜closed-door-outside｜网页GPT-edit-prompt-v1.md)
- edit 范围：只允许关闭门、外侧门框、把手、门外地板节点；整图禁止人物、浴室内部、透光、轮廓和卫浴设施。

## 5. 统一验收

### attic 候选转正式母图前

- [ ] 仍为 `1536×1024`、固定三分之四机位，地板透视和暖黄/冷蓝关系未漂移。
- [ ] 中心活动地板可支持至少一段连续短距离移动，并能到达 `archive-shelf` 外侧或 `stair-entry` 停止区。
- [ ] 低矮斜屋顶、箱柜密集区、楼梯开口内侧全部未被标成活动 footprint。
- [ ] `archive-shelf` 只有一个稳定主节点，书架/箱面无可读文字，周边不堵住活动地板。
- [ ] `stair-entry` 入口可辨识但下方不可透视，外侧停止边界清楚，没有楼下第二场景。
- [ ] 背景不含人物、纸板人偶、宠物、人体影子、UI、文字或水印。
- [ ] 通过以上项目后才允许从 `candidate` 更名为 `master`；当前候选仍是 `NO-GO/FOR-FORMAL-MASTER`。

### bathroom-private 关闭门外节点前

- [ ] 整图只出现关闭的实心浴室门外节点；没有人物、纸板人偶或宠物。
- [ ] 没有浴缸、马桶、洗手池、淋浴、镜子、玻璃、浴帘、毛巾、衣物、药品、个人物品或室内光。
- [ ] 没有开门、半开门、门缝透光、门后轮廓、蒸汽、湿脚印、偷窥视角或“黑屏后进入内部”的转场。
- [ ] 敲门、等待、离场和离场后线索均属于外部业务/独立叠加层，不烘焙进浴室背景。
- [ ] 背景图和 mask 均不生成/加载任何 `bathroom-interior` fallback；没有候选图前不填写正式坐标。

## 6. 当前决定

- `attic-scene-candidate-v1.webp`：**保留为候选布局参考，不批准为正式母图**。
- `archive-shelf` / `stair-entry`：**mask-v1 与 edit prompt 已准备，可用于受控局部修订**。
- `bathroom-private`：**只准备 closed-door 门外节点的保守 mask 与 edit prompt；无人物、无内部**。
- `balcony`：**不进入当前 v1 拓扑；`terrace-greenery` 保留**。
- 本轮：未调用 provider，未修改代码，未修改 `motion-demo`。

署名：Kant｜可见协作窗口
