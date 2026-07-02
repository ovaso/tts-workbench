# MiniMax HTTP TTS Example

先创建本地 `.env`：

```bash
cp .env.example .env
```

然后在 `.env` 中填写：

```txt
MINIMAX_API_KEY="<your-key>"
```

实际 `.env` 文件已被 `.gitignore` 排除。启动 API：

```bash
pnpm dev:api
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
