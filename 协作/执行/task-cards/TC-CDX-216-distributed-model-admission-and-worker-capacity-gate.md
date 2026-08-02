# TC-CDX-216｜分布式模型准入与独立 Worker 容量门

- ID: TC-CDX-216
- Title: Redis 原子 admission、独立 worker 安全门与容量阶梯证明
- CardType: IMPLEMENTATION
- ExecutorLock: CODEX
- Status: CLAIMED
- ClaimedBy: Codex｜阿灯系统层
- ClaimedAt: 2026-08-01 CST
- DependsOn: TC-CDX-214, TC-CDX-215
- IssueType: distributed-admission / worker / backpressure / capacity
- Severity: P0
- Environment: Backend、Redis、PostgreSQL、model-gateway；公司服务器 `erlx-vnext`
- Owner: 阿灯｜系统层与生态层
- TargetGate: cluster-wide admission + crash-safe lease + independent worker truth + staged load evidence
- Waiver: 本卡不启用公网、不扩旧栈、不把 synthetic worker 或聊天 SSE 冒充 provider-backed draft/trace。

## Scope

- 以 Redis Lua 原子维护 owner/request、principal、profile 与 global 四层模型并发租约。
- 租约具备 TTL 崩溃回收、token-matched 幂等释放和 Redis 故障 fail-closed；多 backend 实例共享同一容量真值。
- 审计并接通独立 creative worker 的 claim、heartbeat、lease expiry、重试和完成回投。
- 在允许真实任务前替换 synthetic-only safety policy；未满足时 worker 只能显式处理 synthetic fixture。
- 后续让正式书源/长文消费者解析 `analysis` 用户偏好，并形成 requested/actual profile 证明。
- 按 10 → 100 → 1000 阶梯执行容量、背压、恢复与成本预算；每一级独立给出 Go/No-Go。

## Do not touch

- 路线 JSON、路线编辑器、场景资产、场景交互与活动坐标。
- 小说正文、Canon、accepted mainline 或伪造作品证据。
- 旧 `erlx-hosted`、80/443、旧卷与公网 Caddy。
- 不把单进程测试、synthetic fixture、配置存在或平均吞吐写成千人生产能力。

## Acceptance

- [ ] 两个 backend 实例对同一 Redis 的 duplicate/principal/profile/global 判定一致且原子。
- [ ] 进程崩溃后租约按 TTL 回收；重复/迟到 release 不会释放后来租约。
- [ ] Redis 不可用时新模型请求稳定 fail closed，已建立 SSE 能完成清理或等待 TTL，不静默改走内存。
- [ ] shared-dev/staging 使用不同 namespace/database，不互相占用配额。
- [ ] 独立 worker 的 claim、heartbeat、lease expiry、retry、draft/trace 回投与失败恢复有 PostgreSQL 实机证据。
- [ ] 任意真实输入/模型输出都有已批准 safety policy；否则 worker 保持 synthetic-only 且产品路径不可达。
- [ ] `analysis` 正式消费者按 owner/purpose 解析 profile，并回传 requested/actual/fallback=false。
- [ ] 10/100/1000 阶梯压测分别记录 P50/P95、拒绝率、队列深度、恢复、资源和成本；未通过级别不向上宣称。

## Progress log

- 2026-08-01 — CLAIMED。Phase A 先实现 Redis 原子 admission 与多实例/TTL/fail-closed 证明；worker safety 审计并行进行，不为赶进度启用 synthetic-only worker 处理真实任务。

