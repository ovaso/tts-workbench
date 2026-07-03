# CosyVoice Sync TTS Example

```bash
curl -X POST "http://localhost:3000/v1/tts/sync" \
  -H "Content-Type: application/json" \
  -d @apps/api/src/adapters/cosyvoice/examples/sync-request.json
```

环境变量：

```ini
COSYVOICE_API_KEY=...
COSYVOICE_WORKSPACE_ID=...
COSYVOICE_REGION=cn-beijing
```

`COSYVOICE_API_KEY` 可以回退使用 `DASHSCOPE_API_KEY`。`voice.providerVoiceId` 必须是已通过 CosyVoice 声音复刻或声音设计得到的音色 ID。
