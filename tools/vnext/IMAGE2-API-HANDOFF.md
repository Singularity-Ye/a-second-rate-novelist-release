# image2 本机生图 API 固定入口

所有本机 image2 生图任务统一走 H5 代理入口；智能体不需要 API key，也不要直接访问 4317。

## 固定地址

```text
提交任务：POST http://127.0.0.1:3000/api/vnext/world-lab/images/jobs
查询任务：GET  http://127.0.0.1:3000/api/vnext/world-lab/images/jobs/<jobId>
下载 PNG：GET  http://127.0.0.1:3000/api/vnext/world-lab/images/jobs/<jobId>/asset
```

4000 是后端直连备用入口；4317 是内部上游路由，不属于智能体调用入口。

## 请求体

```json
{
  "requestId": "<uuid>",
  "prompt": "<当前动作或场景的完整提示词>",
  "size": "1536x1024",
  "quality": "low",
  "referenceImage": {
    "fileName": "clean-master.webp",
    "dataUrl": "data:image/webp;base64,<base64>"
  },
  "mask": {
    "fileName": "action-mask.png",
    "dataUrl": "data:image/png;base64,<base64>"
  }
}
```

`referenceImage` 和 `mask` 可选；有 mask 时必须有 referenceImage。没有参考图时删除这两个字段。输入图优先使用 100KB 以内的 WebP；mask/alpha 使用无损 PNG。请求体上限 32MB，但不要把上限当作目标。

## PowerShell 最小流程

```powershell
$base = "http://127.0.0.1:3000/api/vnext/world-lab/images"
$payload = @{
  requestId = [guid]::NewGuid().ToString()
  prompt = "<prompt>"
  size = "1536x1024"
  quality = "low"
} | ConvertTo-Json -Compress

$job = Invoke-RestMethod "$base/jobs" -Method Post -ContentType "application/json" -Body $payload
do {
  Start-Sleep -Seconds 5
  $state = Invoke-RestMethod "$base/jobs/$($job.jobId)"
} while ($state.status -in @("queued", "running"))

if ($state.status -ne "succeeded") { throw "$($state.errorCode)" }
Invoke-WebRequest "$base/jobs/$($job.jobId)/asset" -OutFile ".tmp/world-lab-dev/imagegen-tests/$($job.jobId).png"
```

## 参考图编码

```powershell
$bytes = [IO.File]::ReadAllBytes($referencePath)
$dataUrl = "data:image/webp;base64," + [Convert]::ToBase64String($bytes)
```

把 `$dataUrl` 放入 `referenceImage.dataUrl`；不要把原始大 PNG 直接粘贴进智能体消息。后端会负责调用 `company-router / gpt-image-2`、持久化 job 和返回 PNG。

## 交接规则

- 只报告 `jobId`、状态、压缩后的输出路径和验收结果。
- 不回显 API key，不索取 API key，不改 `motion-demo`。
- 生图完成后立即运行 `tools/vnext/compress-image-assets.py`；WebP 作为上下文预览，正式 PNG 另行归档。
- asset 端点已修复为真实二进制 PNG 返回；若返回 `409 image_not_ready`，继续轮询，不要重复提交同一 job。
