---
asset_role: web-gpt-edit-prompt
room_id: attic
node_id: attic.stair-entry
source_candidate: ../../candidates/attic-scene-candidate-v1.webp
mask: mask-v1.webp
canvas: 1536x1024
candidate_status: not-formal-master
provider_called: false
author: Kant
---

# stair-entry｜网页 GPT edit prompt v1

请把 `attic-scene-candidate-v1.webp` 作为附件参考图，并只对前景 `stair-entry` 节点做局部 edit。输出一张完整的 `1536×1024` 横向场景图，不输出拼图、对比图、分镜、文字说明或多视图。

保持原图的固定三分之四机位、相机高度、地板透视、斜屋顶、书架/箱柜布局、暖黄灯、冷蓝夜景、旧木地板、斑驳墙面和手绘 2.5D 纸板舞台感。不要移动楼梯口，不要新增第二个入口，不要把候选图直接宣布为正式母图。

只澄清前景楼板开口、外侧楼板边缘、栏杆/扶梁与一段可辨识的梯子结构：入口必须像真实的 attic stair-entry，外侧边缘清楚，中心活动地板在入口前形成可停留的安全停止区。楼梯内侧和下方深处必须被克制地压暗/遮挡，不能看到楼下房间、街道、人物、手脚、家具细节或第二场景。白色 mask 区只表示入口外侧接近/停止 footprint，不表示可以走入开口。

整张背景图禁止人物、纸板人偶、宠物、人体影子、手、脚、角色姿态、UI、按钮、边框、logo、水印、文字和标记线。不要把梯子画成装饰梯、断梯、悬空梯或黑洞；不要让栏杆横穿中心活动路径；不要把低矮斜屋顶和箱柜密集区改成活动区。

后续角色若需要 `climbing-ladder`，只允许作为独立透明角色层在阁楼侧短距离接触；本次 edit 不画角色，不打开下层镜头。只输出一张完整的 attic 候选 edit 结果。

严格禁止：楼下内部、开口无底深渊、门内视角、人物爬梯、从暗处伸出的手脚、重复梯子、正面立面、俯视平面图、镜头变化、鱼眼、照片级写实、霓虹高饱和风。

## 接受条件

- `stair-entry` 入口和外侧停止区清楚；
- 白色 mask 区不越过楼梯内侧和下层空间；
- 中心地板仍可支持有限短距离移动；
- 背景无人物、无文字、无 UI，且画布与镜头不变。

署名：Kant｜可见协作窗口
