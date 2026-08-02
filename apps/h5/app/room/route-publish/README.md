# 路线发布边界

此目录是 3001 路线编辑器与 3000 正式房间之间唯一有效的发布边界。

```text
3001 当前浏览器草稿
  → route-draft.adapter.ts（纯转换，不写回草稿）
  → route-parity-validator.ts（错误阻断、漂移仅提示）
  → canonical-route.repository.ts（显式确认后覆盖唯一当前版）
  → published/<scene>.formal-route-snapshot.v1.json
  → formal-route-runtime.ts
  → 3000
```

约束：

- “保存本地草稿”只写当前端口的 localStorage，不发布。
- “发布到正式版”必须二次确认，只写 `sources/` 与 `published/` 中对应场景的当前文件。
- 不生成 v1/v2 历史草稿，不从旧草稿自动回滚。
- 发布器不得改坐标、镜像、事件或路线顺序；语义锚点只用于衔接与校验。
- `portal` 是场景出入口，`interaction` 是场景内动作点，`waypoint` 只负责途中移动、朝向与遮挡。
- `anchorKey` 是物理点身份。反向或复用路线即使拥有独立节点 ID，只要落在同一物理位置，就应共享该键。

`geometry-test/route-publish.*` 是早期原型兼容代码，正式页面、API 与 3000 均不得再导入它们。

## 正式版如何理解路线

`formal-route-graph.ts` 在正式快照加载完成后构建有向路网：

- 每一条发布路线都是一条有方向的边，正向与反向路线不会互相覆盖。
- 边的用途由端点语义判定：`scene-transition`、`scene-entry`、`scene-interaction`、`scene-exit` 或 `waypoint-walk`。
- 跨场景旅行只消费这个图，不再从中文路线名猜测方向；路线名只负责展示。
- `routeEdge(sceneId, routeId)` 会把编辑器产生的别名路线解析回同一条已发布物理边。
- 场景内的入口/出口串接也消费同一张图；编辑器新增路线后，正式版不会再维护第二份本地 BFS。

## 生活层如何消费路线

`novelist/life-activities.ts` 为有明确生活行为的活动声明 `routeIntent`：它描述路线用途、携带物和抵达策略。`life-route-runtime.ts` 在发起意图时把这些字段复制到 `LifeIntent`，并在测试/发布边界检查活动契约是否与正式路网一致。

因此“端热汤去餐桌”和“拿空碗回料理台”虽然都属于餐厨互动，仍然是两个不同的生活意图；前者携带 `bowl-full` 并启动吃饭，后者携带 `bowl-empty` 并只到达停住，不会由到达动作自动再次盛汤。

正式房间的路线目录也显示边的用途。若生活意图与已发布边的用途不一致，运行时会停在当前状态并给出提示，不会用错误的路线继续推进。

生活运行时还维护轻量携带物库存：活动结算才会改变库存，旧快照没有库存字段时按空库存兼容恢复。当前餐厨链路使用 `bowl-full → bowl-empty`，路线出发前会检查所需物品。
