# CosyVoice 接入方式知识库

> 本文用于沉淀 CosyVoice / DashScope / 百炼 Model Studio 相关入口，避免把实时、非实时、复刻、Workspace 域名和全局 DashScope 域名混在一起。
>
> 最后核对时间：2026-07-03。
>
> 官方参考：
> - https://www.alibabacloud.com/help/zh/model-studio/voice-cloning-user-guide
> - https://help.aliyun.com/zh/model-studio/realtime-tts-user-guide
> - https://help.aliyun.com/zh/model-studio/non-realtime-tts-user-guide
> - https://help.aliyun.com/zh/model-studio/tts-model

## 总结

当前官方文档里同时存在两类入口：

1. **百炼 Workspace 域名入口**
   - 形态：`https://{WorkspaceId}.{region}.maas.aliyuncs.com/...`
   - 也有 WebSocket：`wss://{WorkspaceId}.{region}.maas.aliyuncs.com/...`
   - 当前 CosyVoice 复刻、CosyVoice 非实时合成文档主要使用这套。

2. **DashScope 全局域名入口**
   - 形态：`wss://dashscope.aliyuncs.com/api-ws/v1/realtime`
   - 更常见于新版实时 SDK / realtime 协议形态。
   - 官方 TTS 文档中，`/api-ws/v1/realtime` 在 Qwen-TTS realtime 示例里更明确；CosyVoice `tts_v2` 示例仍是 `/api-ws/v1/inference`。
   - 本地实测：CosyVoice `dashscope.audio.tts_v2.SpeechSynthesizer` 可以连 `wss://dashscope.aliyuncs.com/api-ws/v1/inference`，但连 `wss://dashscope.aliyuncs.com/api-ws/v1/realtime` 启动超时。

所以：

- 如果目标是 **复刻音色**：优先按 Workspace HTTP `customization` 接口走。
- 如果目标是 **批量离线生成 mp3/wav**：优先按 Workspace HTTP `SpeechSynthesizer` 非流式接口走。
- 如果目标是 **实时低延迟交互**：再考虑 WebSocket；CosyVoice 当前官方示例是 `tts_v2` + `/api-ws/v1/inference`，你手上的 `/realtime` 需要按具体模型和 SDK 版本再确认。

## 能力矩阵

| 场景 | 接口类型 | Endpoint 形态 | 是否需要 WorkspaceId | 当前代码支持 | 备注 |
| --- | --- | --- | --- | --- | --- |
| CosyVoice 声音复刻 | HTTP | `POST https://{WorkspaceId}.{region}.maas.aliyuncs.com/api/v1/services/audio/tts/customization` | 是 | 是 | 需要音频 URL，不直接上传本地文件 |
| CosyVoice 非实时合成 | HTTP 非流式 | `POST https://{WorkspaceId}.cn-beijing.maas.aliyuncs.com/api/v1/services/audio/tts/SpeechSynthesizer` | 是 | 是 | 返回音频 URL，有效期 24 小时 |
| CosyVoice HTTP 流式合成 | HTTP SSE | 同 `SpeechSynthesizer`，加 `X-DashScope-SSE: enable` | 是 | 否 | 逐段返回音频数据，适合边下边播 |
| CosyVoice 实时合成 | WebSocket | `wss://{WorkspaceId}.{region}.maas.aliyuncs.com/api-ws/v1/inference` | 是 | 否 | DashScope `dashscope.audio.tts_v2.SpeechSynthesizer` 示例使用这套 |
| DashScope 全局 inference | WebSocket | `wss://dashscope.aliyuncs.com/api-ws/v1/inference` | 否 | 是 | 本地已用 `cosyvoice-v3-flash` + `longanyang` 合成成功 |
| DashScope 全局 realtime | WebSocket | `wss://dashscope.aliyuncs.com/api-ws/v1/realtime` | 不确定 | 否 | 本地用 CosyVoice `tts_v2` SDK 启动超时；更像新版 realtime 协议入口 |
| Qwen-TTS 实时合成 | WebSocket | `wss://{WorkspaceId}.{region}.maas.aliyuncs.com/api-ws/v1/realtime` 或全局 realtime | 视入口而定 | 否 | 官方 Qwen-TTS realtime 示例明确使用 `/realtime` |
| Qwen-TTS 非实时合成 | HTTP | `POST https://{WorkspaceId}.{region}.maas.aliyuncs.com/api/v1/services/aigc/multimodal-generation/generation` | 是 | 否 | Qwen-TTS VC 可直接用本地文件 base64 创建音色 |

## 1. CosyVoice 声音复刻

用途：用 10~20 秒目标音频创建一个 `voice_id`。

官方要点：

- `url` 必须是服务端可访问的音频 URL。
- `target_model` 会和返回的 `voice_id` 绑定。
- 绑定后不能跨模型使用；同一音频要用于多个模型，需要分别创建音色。
- CosyVoice 北京地域支持 v3.5 / v3 / v2 / v1；新加坡地域仅支持 v3 系列。

北京地域：

```bash
curl -X POST "https://${cosyvoice_workspace_id}.cn-beijing.maas.aliyuncs.com/api/v1/services/audio/tts/customization" \
  -H "Authorization: Bearer ${cosyvoice_api_key}" \
  -H "Content-Type: application/json" \
  -d '{
    "model": "voice-enrollment",
    "input": {
      "action": "create_voice",
      "target_model": "cosyvoice-v3.5-plus",
      "prefix": "myvoice",
      "url": "https://example.com/source.wav"
    }
  }'
```

新加坡地域：

```bash
curl -X POST "https://${cosyvoice_workspace_id}.ap-southeast-1.maas.aliyuncs.com/api/v1/services/audio/tts/customization" \
  -H "Authorization: Bearer ${cosyvoice_api_key}" \
  -H "Content-Type: application/json" \
  -d '{
    "model": "voice-enrollment",
    "input": {
      "action": "create_voice",
      "target_model": "cosyvoice-v3-plus",
      "prefix": "myvoice",
      "url": "https://example.com/source.wav"
    }
  }'
```

本项目脚本：

```bash
python3 clone/cozyvoice/clone_voice.py
```

必要 `.env`：

```ini
cosyvoice_api_key=...
cosyvoice_workspace_id=...
cosyvoice_region=cn-beijing
cosyvoice_model=cosyvoice-v3.5-plus
cosyvoice_audio_url=https://example.com/source.wav
```

## 2. CosyVoice 非实时 HTTP 合成

用途：批量文本生成音频文件，适合当前 `corpus.txt -> 多段 mp3` 的离线任务。

官方要点：

- CosyVoice 非实时语音合成仅北京地域可用。
- 非流式响应中包含音频 URL，有效期 24 小时。
- 使用复刻音色时，`model` 必须等于创建音色时的 `target_model`。

非流式示例：

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

HTTP SSE 流式示例：

```bash
curl -X POST "https://${cosyvoice_workspace_id}.cn-beijing.maas.aliyuncs.com/api/v1/services/audio/tts/SpeechSynthesizer" \
  -H "Authorization: Bearer ${cosyvoice_api_key}" \
  -H "Content-Type: application/json" \
  -H "X-DashScope-SSE: enable" \
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

本项目脚本：

```bash
python3 clone/cozyvoice/synthesize_voice.py \
  --voice-id voice_id_from_create_voice \
  --text "家长您好，我们这边可以先给孩子安排一节免费的试听课。" \
  --output test.mp3
```

完整 pipeline：

```bash
python3 run_cosyvoice_clone_pipeline.py --force-clone --overwrite
```

## 3. CosyVoice WebSocket / SDK 实时合成

用途：低延迟合成、实时播报、交互式场景。

官方 CosyVoice `tts_v2` 示例使用：

```text
wss://{WorkspaceId}.cn-beijing.maas.aliyuncs.com/api-ws/v1/inference
wss://{WorkspaceId}.ap-southeast-1.maas.aliyuncs.com/api-ws/v1/inference
```

Python SDK 形态：

```python
import os
import dashscope
from dashscope.audio.tts_v2 import SpeechSynthesizer

dashscope.api_key = os.environ["DASHSCOPE_API_KEY"]
dashscope.base_websocket_api_url = (
    "wss://{WorkspaceId}.cn-beijing.maas.aliyuncs.com/api-ws/v1/inference"
)

synthesizer = SpeechSynthesizer(
    model="cosyvoice-v3.5-plus",
    voice="voice_id_from_create_voice",
)
audio = synthesizer.call("家长您好，我们这边可以先给孩子安排一节免费的试听课。")

with open("output.mp3", "wb") as f:
    f.write(audio)
```

注意：

- 当前项目没有实现这条路径。
- 本地环境如果没有 `dashscope` 包，需要安装 SDK。
- 对批量离线输出，HTTP 非实时更简单；对实时首包延迟，WebSocket 更合适。

## 4. DashScope 全局 realtime 入口

你手里的 endpoint：

```text
wss://dashscope.aliyuncs.com/api-ws/v1/realtime
```

当前结论：

- 这不是官方 CosyVoice 非实时入口。
- 这也不是官方 CosyVoice `tts_v2` 示例里的 Workspace `/inference` 入口。
- 它更像新版 DashScope realtime 协议的全局入口，可能用于 Qwen realtime 或新版统一 realtime SDK。
- 本地实测：`dashscope.audio.tts_v2.SpeechSynthesizer` 使用该 endpoint 时 5 秒内启动失败。

在没有进一步 API 文档或 SDK 示例前，不建议把它直接套到当前 CosyVoice 复刻/离线生成脚本里。

如果要验证它是否可用于 CosyVoice，需要补一份最小 realtime 探针：

1. 明确模型名是否支持 realtime endpoint。
2. 明确鉴权 header / subprotocol。
3. 明确 session 创建事件格式。
4. 明确音频输出事件字段和编码。

## 4.1 DashScope 全局 inference 入口

本地已验证：

```text
wss://dashscope.aliyuncs.com/api-ws/v1/inference
```

测试命令：

```bash
uv run --with dashscope python3 clone/cozyvoice/synthesize_voice_ws.py \
  --model cosyvoice-v3-flash \
  --voice-id longanyang \
  --endpoint wss://dashscope.aliyuncs.com/api-ws/v1/inference \
  --text "家长您好，我们这边可以先给孩子安排一节免费的试听课。" \
  --output ws_global_inference_longanyang_test.mp3
```

测试结果：

```text
cloned/cosyvoice/cosyvoice-v3-flash/ws_global_inference_longanyang_test.mp3
```

metadata：

```text
request_id: 1ad364c5bca64efcb340f1d7fe9ca014
first_package_delay_ms: 443.34326171875
```

这说明：如果只是看 CosyVoice WS 合成效果，可以先用 `wss://dashscope.aliyuncs.com/api-ws/v1/inference`，不必强依赖 Workspace 域名。但声音复刻仍需要先通过创建音色接口拿到 `voice_id`，或使用已有系统音色 / 已有复刻音色 ID。

## 5. Qwen-TTS 相关入口

Qwen-TTS 和 CosyVoice 经常出现在同一批文档里，但接口细节不同。

Qwen-TTS 声音复刻：

- 创建音色模型通常是 `qwen-voice-enrollment`。
- 支持本地音频 base64 data URI，不一定必须公网 URL。
- 合成时可用 HTTP 非实时或 WebSocket realtime，具体看模型是否带 realtime 后缀。

Qwen-TTS realtime 示例使用：

```text
wss://{WorkspaceId}.cn-beijing.maas.aliyuncs.com/api-ws/v1/realtime
```

或者在新版 SDK 场景可能使用全局：

```text
wss://dashscope.aliyuncs.com/api-ws/v1/realtime
```

如果后续要接 Qwen-TTS，建议单独建 `clone/qwen` 的复刻和合成 pipeline，不要混入 CosyVoice 脚本。

## 6. 推荐实现顺序

当前仓库建议按以下顺序推进：

1. **CosyVoice Workspace HTTP 复刻**
   - 先解决 `cosyvoice_workspace_id` 和 `cosyvoice_audio_url`。
   - 产出并登记远端 `voice_id`。

2. **CosyVoice Workspace HTTP 非实时合成**
   - 用返回的音频 URL 下载 mp3。
   - 适配当前 `corpus.txt` 多段批量生成。

3. **CosyVoice HTTP SSE 流式合成**
   - 适合边生成边播放或减少等待。
   - 仍然复用 Workspace HTTP endpoint。

4. **CosyVoice WebSocket tts_v2**
   - 适合低延迟场景。
   - 需要引入 DashScope SDK 或手写 WebSocket 协议。

5. **DashScope 全局 realtime 探针**
   - 只在拿到明确 SDK / API 事件格式后做。
   - 不作为当前批量离线生成的主路径。

## 7. 本项目当前支持情况

已实现：

- `clone/cozyvoice/clone_voice.py`
  - Workspace HTTP `customization`
  - 创建 CosyVoice 复刻音色
  - 写入 `cloned/cosyvoice/{model}/cloned_voices.json`

- `clone/cozyvoice/synthesize_voice.py`
  - Workspace HTTP `SpeechSynthesizer`
  - 非流式合成
  - 下载返回的音频 URL 到本地文件

- `clone/cozyvoice/synthesize_voice_ws.py`
  - DashScope SDK / WebSocket 合成
  - 可配置 `dashscope_realtime_endpoint` 或 `cosyvoice_realtime_endpoint`
  - 需要已有 `cosyvoice_voice_id` 或 registry 里的远端音色 ID
  - 本地已验证全局 `wss://dashscope.aliyuncs.com/api-ws/v1/inference`

- `run_cosyvoice_clone_pipeline.py`
  - 从 `.env` 和 `corpus.txt` 编排复刻与多段合成

尚未实现：

- 自动上传本地音频并生成 `cosyvoice_audio_url`
- HTTP SSE 流式合成
- 手写 WebSocket `/api-ws/v1/inference` 协议
- 手写全局 `/api-ws/v1/realtime` 协议
- CosyVoice WebSocket 复刻。当前未发现 WS 复刻入口，仍按 HTTP `customization` 创建音色。
- Qwen-TTS 独立 pipeline

## 8. 配置字段建议

通用：

```ini
sourc_sample=audio_processor/audiomass-output.mp3
cloned_voice_id=sd6g_cloned_20260703_female2
corpus=corpus.txt
```

CosyVoice Workspace HTTP：

```ini
cosyvoice_api_key=...
cosyvoice_workspace_id=...
cosyvoice_region=cn-beijing
cosyvoice_model=cosyvoice-v3.5-plus
cosyvoice_audio_url=https://example.com/source.wav
cosyvoice_audio_format=mp3
cosyvoice_sample_rate=24000
```

CosyVoice 已有音色：

```ini
cosyvoice_voice_id=voice_id_from_create_voice
```

全局 realtime 探针保留字段：

```ini
dashscope_realtime_endpoint=wss://dashscope.aliyuncs.com/api-ws/v1/realtime
```

这个字段会被 `clone/cozyvoice/synthesize_voice_ws.py` 使用。注意：如果 endpoint 协议和 `dashscope.audio.tts_v2.SpeechSynthesizer` 不匹配，SDK 调用仍可能失败。

## 9. 常见误区

- `wss://dashscope.aliyuncs.com/api-ws/v1/realtime` 不是 CosyVoice 非实时接口。
- CosyVoice 非实时合成当前官方文档只写北京地域。
- CosyVoice 复刻样本当前官方示例要求可访问 URL，不是本地文件路径。
- CosyVoice `voice_id` 和 `target_model` 绑定，不能拿 `cosyvoice-v3-plus` 创建的音色去跑 `cosyvoice-v3.5-plus`。
- Qwen-TTS 的 `qwen-voice-enrollment` 和 CosyVoice 的 `voice-enrollment` 不要混用。
