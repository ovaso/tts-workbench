# 豆包声音复刻

优先查看已沉淀的 Markdown 文档：

- [声音复刻 API V3](豆包语音_声音复刻API-V3.md)
- [HTTP Chunked/SSE 单向流式 V3](豆包语音_HTTP_Chunked_SSE单向流式-V3.md)

源 PDF 保留在同目录：

- [声音复刻 PDF](豆包语音_声音复刻API-V3_1780294426.pdf)
- [合成 PDF](豆包语音_HTTP_Chunked_SSE单向流式-V3_1779705622.pdf)

## 配置

`.env` 支持新版控制台 API Key：

```dotenv
doubao_api_key=your-api-key
cloned_voice_id=custom_zh_xxx
sourc_sample=audio_processor/separated/example.wav
corpus=corpus.txt
```

也兼容旧版控制台：

```dotenv
doubao_app_id=your-app-id
doubao_access_token=your-access-token
```

默认按后付费自定义音色训练：请求体中 `speaker_id` 固定为 `custom_speaker_id`，并把 `cloned_voice_id` 作为 `custom_speaker_id`。如果使用预付费音色槽位，运行时加 `--prepaid`。

## 运行

仅注册已有音色：

```bash
python3 clone/doubao/clone_voice.py --register-existing
```

强制复刻并合成 `corpus.txt` 中的 3 段文本：

```bash
python3 run_doubao_clone_pipeline.py --force-clone --overwrite
```

使用已训练音色直接合成：

```bash
python3 run_doubao_clone_pipeline.py --overwrite
```
