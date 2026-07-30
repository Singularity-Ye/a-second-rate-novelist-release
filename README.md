# 二流小说家｜公开测试快照

这是《二流小说家》房间与转生入口的最小公开测试仓库。它只包含浏览器运行所需的 H5/Pages 源码、共享合同、遥测基础包和经过白名单筛选的正式运行资产。

当前公开入口：

- `/`：玄烛转生入口
- `/room`：房间入口
- `/room/novelist`：小说家房间
- `/room/reincarnation`：显式转生入口

## 安全边界

- 仓库不包含 Obsidian Vault、本机存档、缓存、环境文件、模型密钥或上游模型地址。
- 浏览器只连接无凭据的公网房间网关；模型密钥由服务器保存。
- `apps/pages-h5/scripts/public-assets.allowlist.json` 是公开资产唯一白名单。
- 漫画与叙事结果保持项目既有的 `candidate / pending` 边界，不构成小说 Canon。

## 验证

```bash
pnpm install --frozen-lockfile --ignore-scripts --filter pages-h5... --filter h5
pnpm --filter pages-h5 test
pnpm --filter pages-h5 build
```

GitHub Pages 由 `.github/workflows/pages.yml` 自动构建。若更换房间网关，请在仓库变量 `ROOM_GATEWAY_BASE_URL` 中配置无凭据的 HTTPS 地址；不要创建任何 `NEXT_PUBLIC_*KEY*` 或 `NEXT_PUBLIC_*TOKEN*` 变量。

该仓库仅用于内部体验验证，公开可见不代表功能或美术已经完成正式发布验收。
