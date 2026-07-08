# Xiaomi MiMo V2.5 TTS

优先查看已沉淀的结构化整理：

- [MiMo-V2.5-TTS 系列整理](mimo_v2.5_tts.md)

官方文档：

- [语音合成（MiMo-V2.5-TTS 系列）](https://mimo.mi.com/docs/zh-CN/quick-start/usage-guide/audio/speech-synthesis-v2.5)

## 接入结论

Xiaomi MiMo V2.5 TTS 使用 OpenAI Chat Completions 风格接口：

```text
POST https://api.xiaomimimo.com/v1/chat/completions
```

鉴权使用请求头：

```http
api-key: ${MIMO_API_KEY}
```

项目内建议 providerId：

```text
xiaomi_mimo
```

## 模型能力摘要

| Model ID | 建议平台 operation | 音色来源 | 流式状态 | 关键限制 |
| --- | --- | --- | --- | --- |
| `mimo-v2.5-tts` | `tts.sync`, `tts.stream` | 预置音色 | 已支持低延迟流式 | 不支持音色设计和音色复刻 |
| `mimo-v2.5-tts-voicedesign` | `tts.sync`，流式仅作兼容能力 | 文本描述生成即时音色 | 兼容式流式，完成后一次返回 | 不支持唱歌、预置音色、音频样本复刻 |
| `mimo-v2.5-tts-voiceclone` | `voice.clone.instant`，也可作为专用 TTS 执行流 | 音频样本即时复刻 | 兼容式流式，完成后一次返回 | 不产生持久 voiceId，不支持音色设计 |

## 配置

根目录 `.env` 建议增加：

```dotenv
MIMO_API_KEY=your-api-key
```

如后续接入 adapter，可兼容小写历史键名：

```dotenv
xiaomi_mimo_api_key=your-api-key
mimo_api_key=your-api-key
```

## 当前实现状态

- `apps/api/src/adapters/xiaomi-mimo` 已实现 `tts.sync`、`tts.stream` 和 `voice.clone.instant`。
- `mimo-v2.5-tts` 的非流式响应读取 `choices[0].message.audio.data`。
- `mimo-v2.5-tts` 的流式响应读取 `choices[0].delta.audio.data`，并映射为平台 `audio.chunk`。
- `mimo-v2.5-tts-voicedesign` 可通过 `voiceDesignPrompt` 走 `tts.sync`。
- `mimo-v2.5-tts-voiceclone` 映射到 `voice.clone.instant`，不写入持久 voice registry。

后续如果要在 Web 上提供入口，应单独设计“即时复刻合成”表单，不要复用当前持久音色管理表格。

## 合规提醒

音色复刻必须确认声音本人授权。`mimo-v2.5-tts-voiceclone` 会把参考音频编码后放入 vendor request，真实私密样本不要提交到 git，也不要把真实 run archive 外发。
