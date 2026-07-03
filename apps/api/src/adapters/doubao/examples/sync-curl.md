# Doubao Sync TTS Example

```bash
curl -sS http://localhost:4000/v1/tts/sync \
  -H 'Content-Type: application/json' \
  -d @apps/api/src/adapters/doubao/examples/sync-request.json
```

The adapter consumes Doubao's SSE endpoint and archives the concatenated audio as a normal `tts.sync` run.
