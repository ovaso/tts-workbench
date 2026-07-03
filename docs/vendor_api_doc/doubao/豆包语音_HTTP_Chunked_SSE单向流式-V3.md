# 豆包语音 HTTP Chunked/SSE 单向流式 V3

> 源文档: `豆包语音_HTTP_Chunked_SSE单向流式-V3_1779705622.pdf`
>
> 本文是面向本仓库开发的整理版，不是逐页转写。保留 PDF 作为最终事实来源；日常开发优先看本文。

## 1. 结论速查

该文档描述的是“一次性输入完整文本，流式返回音频”的 HTTP 接口。豆包提供两种 HTTP 单向流式返回形式：

| 返回形式 | URL | 本仓库使用 |
| --- | --- | --- |
| HTTP Chunked | `https://openspeech.bytedance.com/api/v3/tts/unidirectional` | 否 |
| SSE | `https://openspeech.bytedance.com/api/v3/tts/unidirectional/sse` | 是 |

响应中的音频片段在 JSON 字段 `data` 中，以 base64 字符串返回。客户端需要逐片解码并按顺序拼接。

## 2. 与声音复刻的关系

声音复刻训练成功后，合成接口必须通过 `X-Api-Resource-Id` 选择复刻模型资源，例如：

```http
X-Api-Resource-Id: seed-icl-2.0
```

请求体里的 `req_params.speaker` 传训练得到的 `speaker_id` 或自定义音色 ID。

## 3. 接口清单

| 能力 | 方法 | URL |
| --- | --- | --- |
| HTTP Chunked 单向流式 | `POST` | `https://openspeech.bytedance.com/api/v3/tts/unidirectional` |
| HTTP SSE 单向流式 | `POST` | `https://openspeech.bytedance.com/api/v3/tts/unidirectional/sse` |

本仓库已实现：

- [synthesize_voice.py](synthesize_voice.py): SSE 合成并写音频文件
- [doubao_common.py](doubao_common.py): 鉴权、配置、输出路径
- [run_doubao_clone_pipeline.py](../../run_doubao_clone_pipeline.py): 一键复刻并合成

## 4. 鉴权

### 新版控制台

```http
Content-Type: application/json
X-Api-Key: your-api-key
X-Api-Resource-Id: seed-icl-2.0
X-Api-Request-Id: uuid
```

### 旧版控制台

注意：合成文档旧版控制台字段叫 `X-Api-App-Id`，不是声音复刻文档里的 `X-Api-App-Key`。

```http
Content-Type: application/json
X-Api-App-Id: your-app-id
X-Api-Access-Key: your-access-token
X-Api-Resource-Id: seed-icl-2.0
X-Api-Request-Id: uuid
```

可选用量 header：

```http
X-Control-Require-Usage-Tokens-Return: text_words
```

携带后，结束事件可能返回 `usage.text_words`。

响应 header 里可能包含：

| Header | 说明 |
| --- | --- |
| `Transfer-Encoding` | Chunked 接口通常是 `chunked` |
| `Content-Type` | SSE 接口通常是 `text/event-stream` |
| `X-Tt-Logid` | 服务端 log id，排查问题时应记录 |

## 5. Resource Id

`X-Api-Resource-Id` 同时决定模型效果和计费商品。

### 语音合成大模型

| Resource Id | 说明 |
| --- | --- |
| `seed-tts-2.0` | 豆包语音合成模型 2.0，只能调用合成 2.0 音色 |
| `seed-tts-1.0` | 豆包语音合成模型 1.0 字符版，只能调用合成 1.0 音色 |
| `seed-tts-1.0-concurr` | 豆包语音合成模型 1.0 并发版 |

### 声音复刻大模型

| Resource Id | 说明 |
| --- | --- |
| `seed-icl-2.0` | 声音复刻 2.0 字符版 |
| `seed-icl-1.0` | 声音复刻 1.0 字符版 |
| `seed-icl-1.0-concurr` | 声音复刻 1.0 并发版 |

本仓库默认使用 `seed-icl-2.0`。

## 6. 请求体

### 6.1 最小可用请求

```json
{
  "user": {
    "uid": "12345"
  },
  "namespace": "BidirectionalTTS",
  "req_params": {
    "text": "明朝开国皇帝朱元璋也称这本书为万物之根",
    "speaker": "custom_zh_xxx",
    "audio_params": {
      "format": "mp3",
      "sample_rate": 24000
    }
  }
}
```

### 6.2 顶层字段

| 字段 | 类型 | 必填 | 说明 |
| --- | --- | --- | --- |
| `user` | object | 是 | 用户信息 |
| `user.uid` | string | 建议传 | 用户唯一标识；本仓库默认 `fast_clone` |
| `namespace` | string | 否 | 请求方法，文档示例为 `BidirectionalTTS` |
| `req_params` | object | 是 | 合成参数 |

### 6.3 `req_params`

| 字段 | 类型 | 必填 | 说明 |
| --- | --- | --- | --- |
| `text` | string | `text`/`ssml` 二选一 | 输入文本 |
| `ssml` | string | `text`/`ssml` 二选一 | SSML 文本；优先级高于 `text`。部分 2.0 复刻音色不支持字幕返回 |
| `speaker` | string | 是 | 发音人/音色 ID。复刻音色传 `S_...` 或自定义音色 ID |
| `model` | string | 否 | 仅对声音复刻 2.0 生效 |
| `audio_params` | object | 是 | 音频参数 |
| `additions` | json string/object | 否 | 高级参数，如 markdown 过滤、语种检测、停顿等 |
| `mix_speaker` | object | 否 | 混音参数，仅适用部分 1.0 音色 |

### 6.4 `req_params.model`

仅对声音复刻 2.0 生效：

| 值 | 说明 |
| --- | --- |
| `seed-tts-2.0-standard` | 标准版，延时更优；不支持语音指令 QA 和 COT 标签，传入会被过滤 |
| `seed-tts-2.0-expressive` | 表现力增强版；支持语音指令 QA 和 COT 标签，但效果可能有随机性 |

不传时默认 `seed-tts-2.0-standard`。本仓库默认传 `seed-tts-2.0-standard`。

## 7. 音频参数 `audio_params`

| 字段 | 类型 | 默认 | 说明 |
| --- | --- | --- | --- |
| `format` | string | `mp3` | 可选 `mp3`、`ogg_opus`、`pcm`。流式场景不建议传 `wav`，会多次返回 wav header |
| `sample_rate` | number | `24000` | 可选 `8000`、`16000`、`22050`、`24000`、`32000`、`44100`、`48000` |
| `bit_rate` | number | 按格式默认 | MP3 可传 `16000`、`32000` 等；默认范围 64k-160k |
| `emotion` | string | 无 | 设置情感，仅部分音色支持 |
| `emotion_scale` | number | `4` | 情绪值，范围 `1`-`5` |
| `speech_rate` | number | `0` | 语速，范围 `[-50, 100]`；`100` 约 2 倍速，`-50` 约 0.5 倍速 |
| `loudness_rate` | number | `0` | 音量，范围 `[-50, 100]`；mix 音色暂不支持 |
| `enable_timestamp` | bool | `false` | 返回字/词时间戳，仅 TTS 1.0 支持 |
| `enable_subtitle` | bool | `false` | 返回字幕，TTS 2.0/ICL 2.0 生效 |

## 8. 常用 additions

`additions` 在文档中是用户自定义参数，部分 SDK/示例会以 JSON string 形式传入。脚本暂未暴露这些参数。

| 字段 | 类型 | 默认 | 说明 |
| --- | --- | --- | --- |
| `silence_duration` | number | `0` | 句尾增加静音，范围 `0`-`30000ms` |
| `enable_language_detector` | bool | `false` | 自动识别语种 |
| `disable_markdown_filter` | bool | `false` | `true` 时解析并过滤 Markdown；`false` 时可能读出星号等符号 |
| `enable_latex_tn` | bool | `false` | LaTeX 公式文本归一化相关 |
| `use_cache` | bool | 未整理 | 控制缓存能力，需结合具体业务谨慎开启 |

## 9. 混音 `mix_speaker`

混音能力仅适用部分“豆包语音合成模型 1.0”音色。使用混音时：

- `req_params.speaker` 需要设为 `custom_mix_bigtts`
- 最多支持 3 个音色混音
- `mix_factor` 之和必须等于 `1`
- 声音复刻大模型音色支持使用 `S_` 开头 speaker id，或查询接口获取的 `icl_` speaker id；不支持 `DiT_` 或 `saturn_` 开头 speaker id

示例：

```json
{
  "user": {
    "uid": "12345"
  },
  "req_params": {
    "text": "明朝开国皇帝朱元璋也称这本书为万物之根",
    "speaker": "custom_mix_bigtts",
    "audio_params": {
      "format": "mp3",
      "sample_rate": 24000
    },
    "mix_speaker": {
      "speakers": [
        {
          "source_speaker": "zh_male_bvlazysheep",
          "mix_factor": 0.3
        },
        {
          "source_speaker": "BV120_streaming",
          "mix_factor": 0.3
        },
        {
          "source_speaker": "zh_male_ahu_conversation_wvae_bigtts",
          "mix_factor": 0.4
        }
      ]
    }
  }
}
```

本仓库暂未实现混音。

## 10. Chunked 响应

音频片段：

```json
{
  "code": 0,
  "message": "",
  "data": "base64音频片段"
}
```

文本/时间戳片段：

```json
{
  "code": 0,
  "message": "",
  "data": null,
  "sentence": {
    "text": "其他人。",
    "words": [
      {
        "word": "其",
        "startTime": 0.205,
        "endTime": 0.315,
        "confidence": 0.8531248
      }
    ]
  }
}
```

合成结束：

```json
{
  "code": 20000000,
  "message": "ok",
  "data": null,
  "usage": {
    "text_words": 10
  }
}
```

`usage` 默认不存在，只有请求 header 携带用量返回控制标记后才会出现。

## 11. SSE 响应

SSE 接口请求体与 Chunked 相同，header 也相同，只是 URL 改为 `/unidirectional/sse`。

常见事件：

| event | 名称 | 说明 |
| --- | --- | --- |
| `352` | TTSResponse | 合成内容，通常包含 base64 音频 |
| `351` | TTSSentenceEnd | 句子处理结束，可能包含 `sentence` |
| `151` | SessionCancel | 会话取消 |
| `152` | SessionFinish | 会话结束 |
| `153` | SessionFailed | 会话失败 |

示例：

```text
event: 352
data: {"code":0,"message":"","data":"base64音频片段"}

event: 351
data: {"code":0,"message":"","data":null,"sentence":{"phonemes":[],"text":"音频文件能够正常播放。","words":[]}}

event: 152
data: {"code":20000000,"message":"OK","data":null,"usage":{"text_words":11}}
```

限制：该接口只支持按 SSE 格式返回数据，不支持 SSE 的重连、断点续传等常规能力。

## 12. 错误码

| code | message | 说明 | 处理建议 |
| --- | --- | --- | --- |
| `20000000` | `ok` | 音频合成结束的成功状态码 | 正常结束 |
| `40402003` | `TTSExceededTextLimit: exceed max limit` | 文本长度超限 | 拆分文本 |
| `45000000` | `speaker permission denied: get resource id: access denied` | 音色未授权或 speaker/resource id 错误 | 检查 `speaker` 与 `X-Api-Resource-Id` 是否匹配 |
| `45000000` | `quota exceeded for types: concurrency` | 并发限流 | 降低并发或重试 |
| `55000000` | 服务端 error | 服务端通用错误 | 稍后重试，记录 `X-Tt-Logid` |

## 13. 本仓库实现注意点

当前实现位于 [synthesize_voice.py](synthesize_voice.py)：

- 使用 SSE URL: `/api/v3/tts/unidirectional/sse`
- 旧版控制台合成鉴权使用 `X-Api-App-Id`
- 默认 `X-Api-Resource-Id=seed-icl-2.0`
- 默认 `req_params.model=seed-tts-2.0-standard`
- 默认输出 `mp3`、`sample_rate=24000`
- 收到 `event=352` 且 `data` 非空时，base64 解码并拼接到输出文件
- 收到 `code` 不在 `0`、`20000000`、`null` 时视为失败

运行示例：

```bash
python3 clone/doubao/synthesize_voice.py \
  --text "家长您好，我们这边可以先给孩子安排一节免费的试听课。" \
  --output demo.mp3
```

通过 pipeline 使用：

```bash
python3 run_doubao_clone_pipeline.py --overwrite
```
