---
asset_role: web-gpt-edit-prompt
room_id: bathroom-private
node_id: bathroom-private.door.outside
target_master: pending-bathroom-clean-master-1774x887.png
mask: closed-door-outside/mask-v2.webp
canvas: 1774x887
provider_called: false
author: Kant
status: pending-user-greenlight
---

# closed-door-outside｜网页 GPT edit prompt v2

浴室节点暂缓开发。待主窗口提供或批准 `bathroom-private` 的 clean 门外母图后，才将其作为唯一 edit target，并只使用 `closed-door-outside/mask-v2.webp` 这一张蒙版。输出严格 `1774×887` 的门外状态图，不输出浴室内部、拼图、对比图、分镜或人物动作。

画面只允许住宅公共动线一侧的一扇完全关闭、实心、不透明的浴室门、外侧门框、外侧把手、门外旧木地板和斑驳墙面。门缝只能是中性的实体阴影，不能透光、透视、反射或显示轮廓。门内永远不是待补画的空白区，而是永久隐私边界。

硬门禁：绝不出现浴室内部、马桶、浴缸、洗手池、淋浴、花洒、镜子、玻璃、浴帘、瓷砖内部、毛巾、衣物、洗漱用品、药品、蒸汽、湿脚印、个人物品、门内灯光、门牌、文字、UI、logo、水印。clean 背景绝不烘焙人物；敲门、等待、离场、离场后外部线索由业务层/独立透明层处理。

状态规则：`occupied-locked` 只能敲门或等待；`transition-exiting` 只播放门外转场；`vacant-unlocked` 只开放门外可观察节点；`relocked` 恢复关闭门。`unlocked` 不等于浴室内部开放。任何状态都不创建 `bathroom-no-interior-layer`。

验收：`floorPlane=outside-corridor-floor`；`safeZone=door-outside-threshold`；`contactPoint=exterior-handle/knock-point`；`occlusion=opaque-door-leaf+frame`；无人物、无内部、无门缝透光。当前不生成 PNG，不写入正式母图路径。

署名：Kant｜可见协作窗口
