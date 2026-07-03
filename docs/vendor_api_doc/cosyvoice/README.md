# CosyVoice voice clone + synthesis

> 参考文档:
> - https://www.alibabacloud.com/help/zh/model-studio/voice-cloning-user-guide
> - https://help.aliyun.com/zh/model-studio/tts-model
> - https://www.alibabacloud.com/help/zh/model-studio/sound-reengraving/
> - https://help.aliyun.com/zh/isi/developer-reference/natual-tts-product-introduction

更完整的接入方式矩阵、Endpoint 区分和本地实现状态见：[ACCESS_METHODS.md](ACCESS_METHODS.md)。

## 是否支持复刻音色

阿里云百炼 CosyVoice 支持声音复刻。官方流程是：

```text
准备 10~20 秒音频样本 -> 调用 voice-enrollment 创建音色 -> 得到 voice_id -> 使用同一个 target_model 合成语音
```

注意：创建音色时传入的 `target_model` 会和返回的 `voice_id` 绑定，后续合成必须使用同一个模型。若同一段样本需要在多个模型上使用，需要分别为每个模型创建音色。

## 推荐接入路线

当前项目建议优先接入阿里云百炼 Model Studio / DashScope 这条路线，而不是旧版智能语音交互 ISI 产品线：

- 声音复刻接口：HTTP `POST /api/v1/services/audio/tts/customization`
- 音色管理模型：`voice-enrollment`
- 合成接口：当前代码使用 HTTP `POST /api/v1/services/audio/tts/SpeechSynthesizer`，接口返回 24 小时有效的音频 URL，脚本再下载到本地。
- 合成协议：CosyVoice 同一模型同时支持 WebSocket 和 HTTP；本项目的批量离线合成先用 HTTP 非流式，后续如需低延迟再扩展 WebSocket 流式。

## 模型与地域

官方文档显示 CosyVoice 复刻支持北京地域和新加坡地域，但可用模型不同：

| 地域 | endpoint 示例 | 可用 CosyVoice 模型 |
| --- | --- | --- |
| 华北 2（北京） | `https://{WorkspaceId}.cn-beijing.maas.aliyuncs.com/api/v1/services/audio/tts/customization` | `cosyvoice-v3.5-plus`, `cosyvoice-v3.5-flash`, `cosyvoice-v3-plus`, `cosyvoice-v3-flash`, `cosyvoice-v2`, `cosyvoice-v1` |
| 新加坡 | `https://{WorkspaceId}.ap-southeast-1.maas.aliyuncs.com/api/v1/services/audio/tts/customization` | `cosyvoice-v3-plus`, `cosyvoice-v3-flash` |

建议默认使用：

```text
cosyvoice-v3.5-plus
```

原因：官方把 `cosyvoice-v3.5-plus` 列为自定义音色 / 声音复刻推荐模型，并支持声音复刻、声音设计和指令控制。若更关注延迟或成本，可改用 `cosyvoice-v3.5-flash`。

## 音频样本要求

CosyVoice 对复刻样本的关键要求：

- 格式：WAV 16bit、MP3、M4A。
- 时长：推荐 10~20 秒，最长不超过 60 秒。
- 文件大小：不超过 10 MB。
- 采样率：不低于 16 kHz。
- 声道：支持单声道或双声道；双声道只处理首声道，因此要确保首声道有人声。
- 内容：至少 5 秒连续清晰朗读，无背景音乐、环境噪音或其他人声；短暂停顿不超过 2 秒。

当前仓库已有 `audio_processor/separate_dual_channel_audio.sh` 和 `audio_processor/pick_audio_by_class.sh`，接入前建议继续复用现有音频预处理流程，优先选择右声道分离后的清晰人声文件。

## 配置

根目录 `.env` 建议增加：

```ini
sourc_sample=audio_processor/separated/d908thu7i0dfhcttu310_right.wav
cloned_voice_id=sd6g_cloned_20260703_female2
corpus=corpus.txt

cosyvoice_api_key=...
cosyvoice_workspace_id=...
cosyvoice_region=cn-beijing
cosyvoice_model=cosyvoice-v3.5-plus
cosyvoice_audio_url=https://example.com/source.wav
cosyvoice_audio_format=mp3
cosyvoice_sample_rate=24000
```

兼容策略：

- `sourc_sample` 和 `source_sample` 两种键名都应支持。
- `cosyvoice_api_key` 可回退读取 `dashscope_api_key` 或环境变量 `DASHSCOPE_API_KEY`。
- `cosyvoice_model` 默认 `cosyvoice-v3.5-plus`。
- `cosyvoice_region` 默认 `cn-beijing`。
- CosyVoice 创建音色需要传可访问的音频 URL；如果只有本地文件，脚本需要先上传到可公网访问或百炼可访问的位置，再调用复刻接口。

## 创建音色请求

北京地域示例：

```bash
curl -X POST "https://${cosyvoice_workspace_id}.cn-beijing.maas.aliyuncs.com/api/v1/services/audio/tts/customization" \
  -H "Authorization: Bearer ${cosyvoice_api_key}" \
  -H "Content-Type: application/json" \
  -d '{
    "model": "voice-enrollment",
    "input": {
      "action": "create_voice",
      "target_model": "cosyvoice-v3.5-plus",
      "prefix": "sd6g_cloned_20260703_female2",
      "url": "https://example.com/source.wav"
    }
  }'
```

返回里需要保存 `voice_id`。本项目建议继续沿用其它厂商的 registry 结构，把远端 `voice_id` 登记到：

```text
cloned/cosyvoice/{model}/cloned_voices.json
```

## 合成语音

HTTP 示例：

```bash
curl -X POST "https://${cosyvoice_workspace_id}.cn-beijing.maas.aliyuncs.com/api/v1/services/audio/tts/SpeechSynthesizer" \
  -H "Authorization: Bearer ${cosyvoice_api_key}" \
  -H "Content-Type: application/json" \
  -d '{
    "model": "cosyvoice-v3.5-plus",
    "input": {
      "text": "家长您好，我们这边可以先给孩子安排一节免费的试听课。",
      "voice": "voice_id_from_create_voice",
      "format": "mp3",
      "sample_rate": 24000
    }
  }'
```

重要约束：

- `model` 必须和创建音色时的 `target_model` 完全一致。
- 北京和新加坡使用不同地域的 API Key、HTTP endpoint、WebSocket endpoint。
- 首次合成会建立 WebSocket 连接，首包延迟包含连接耗时；批量合成时可以复用同一模型和音色配置逐段调用。

## 脚本职责

已按 MiniMax / ElevenLabs 的结构补齐：

- `clone/cozyvoice/clone_voice.py`: 创建 CosyVoice 复刻音色，并把返回的 `voice_id` 登记到 `cloned/cosyvoice/{model}/cloned_voices.json`。
- `clone/cozyvoice/synthesize_voice.py`: 只负责单段文本合成和写入音频。
- `run_cosyvoice_clone_pipeline.py`: 根目录外部编排脚本，读取 `.env` 和 `corpus.txt`，必要时创建音色，并把文本分别合成为多段音频。

目录名当前为 `clone/cozyvoice`，但官方产品名是 `CosyVoice`。输出目录建议使用官方拼写：

```text
cloned/cosyvoice/{model}/
```

## 输出规范

统一输出到根目录：

```text
cloned/{vendor}/{model}/
```

CosyVoice 默认输出目录：

```text
cloned/cosyvoice/cosyvoice-v3.5-plus/
```

音频命名规则：

```text
{local_voice_id}_{original_filename}_{segment_index}.mp3
```

建议的 `local_voice_id`：

```text
cosyvoice_{model}_{voice_id}
```

例如：

```text
cosyvoice_cosyvoice_v3_5_plus_myvoice_xxx_d908thu7i0dfhcttu310_right_01.mp3
```

每段音频旁边生成同名 `.metadata.json`，整次运行生成：

```text
cloned/cosyvoice/cosyvoice-v3.5-plus/{local_voice_id}_run_metadata.json
```

## 待实现问题

- 本地音频如何转成可被百炼访问的 `url`。当前代码要求 `.env` 提供 `cosyvoice_audio_url`，可以考虑 OSS 上传、已有静态文件服务，或内部对象存储临时签名 URL。
- 是否接入音色查询 / 删除接口，用于验证 `voice_id` 是否仍然可用和清理测试音色。
- 是否需要支持 `instruction` / 指令控制，用于客服话术里的语速、情绪、播报风格控制。
- 是否同时支持 `cosyvoice-v3.5-plus` 与 `cosyvoice-v3.5-flash` 的批量对比输出。

## 合规提醒

复刻音色前应确保声音本人授权。样本应避免背景音乐、多人声、敏感内容和环境噪声；音频质量会直接影响复刻音色的相似度与自然度。CosyVoice 与 Qwen-TTS 的自定义音色配额独立，单类最多 1000 个；单个音色若过去 1 年内没有用于任何语音合成请求，可能被自动删除。
