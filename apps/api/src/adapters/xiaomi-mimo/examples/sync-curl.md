# Xiaomi MiMo sync TTS curl

```bash
curl -X POST "http://localhost:4000/v1/tts/sync" \
  -H "Content-Type: application/json" \
  -d @apps/api/src/adapters/xiaomi-mimo/examples/sync-request.json
```

后端进程需要配置：

```dotenv
MIMO_API_KEY=your-api-key
```
