# MiniMax HTTP TTS Example

先启动 API：

```bash
MINIMAX_API_KEY="<your-key>" pnpm dev:api
```

发送 facade 请求：

```bash
curl -s \
  -X POST http://localhost:4000/v1/tts/sync \
  -H "Content-Type: application/json" \
  --data @apps/api/src/adapters/minimax/examples/sync-request.json
```

请求完成后，结果会写入：

```txt
data/runs/{runId}/
  request.json
  plan.json
  mapping-report.json
  vendor-request.json
  vendor-response.json
  result.json
  audio.mp3
```
