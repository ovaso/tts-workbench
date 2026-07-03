# 豆包语音声音复刻 API V3

> 源文档: `豆包语音_声音复刻API-V3_1780294426.pdf`
>
> 本文是面向本仓库开发的整理版，不是逐页转写。保留 PDF 作为最终事实来源；日常开发优先看本文。

## 1. 结论速查

V3 训练出的音色可以同时用于声音复刻 1.0、声音复刻 2.0、豆包端到端实时语音模型等多个模型产品。V1 训练接口已停止迭代，不建议继续接入。

豆包声音复刻分两类：

| 类型 | 使用方式 | 本仓库默认 |
| --- | --- | --- |
| 预付费音色 | 先在控制台下单音色槽位，接口里直接传 `speaker_id=S_...` | 否 |
| 后付费自定义音色 | 接口里传 `speaker_id=custom_speaker_id`，再传 `custom_speaker_id=自定义音色名` | 是 |

后付费模式下，试听不收音色槽位费；一旦用该音色进行语音合成，就会收取音色槽位费用。脚本默认按后付费模式运行，预付费请加 `--prepaid`。

## 2. 接口清单

| 能力 | 方法 | URL |
| --- | --- | --- |
| 训练/复刻音色 | `POST` | `https://openspeech.bytedance.com/api/v3/tts/voice_clone` |
| 查询音色状态 | `POST` | `https://openspeech.bytedance.com/api/v3/tts/get_voice` |
| 升级复刻音色 | `POST` | `https://openspeech.bytedance.com/api/v3/tts/upgrade_voice` |

本仓库已实现：

- [clone_voice.py](clone_voice.py): 复刻与状态查询
- [doubao_common.py](doubao_common.py): 配置、鉴权、registry、输出路径
- [run_doubao_clone_pipeline.py](../../run_doubao_clone_pipeline.py): 一键复刻并合成

## 3. 鉴权

### 新版控制台

复刻、查询、升级都使用同一组 header：

```http
Content-Type: application/json
X-Api-Key: your-api-key
X-Api-Request-Id: uuid
```

### 旧版控制台

注意：声音复刻文档旧版控制台字段叫 `X-Api-App-Key`，不是合成文档里的 `X-Api-App-Id`。

```http
Content-Type: application/json
X-Api-App-Key: your-app-id
X-Api-Access-Key: your-access-token
X-Api-Request-Id: uuid
```

服务端响应 header 里可能包含 `X-Tt-Logid`，排查问题时应记录。

## 4. 配置映射

本仓库 `.env` 支持以下写法：

```dotenv
doubao_api_key=your-api-key
doubao_app_id=your-app-id
doubao_access_token=your-access-token

sourc_sample=audio_processor/separated/example.wav
cloned_voice_id=custom_zh_xxx
corpus=corpus.txt
```

兼容历史键名：

- `source_sample` 或 `sourc_sample`
- `doubao_access-token` 会被规范化为 `doubao_access_token`
- `cloned_voice_id` 会作为豆包 `speaker_id` 或 `custom_speaker_id`

## 5. 训练接口 `voice_clone`

### 5.1 后付费自定义音色请求

这是本仓库默认模式：

```json
{
  "speaker_id": "custom_speaker_id",
  "custom_speaker_id": "custom_zh_xxx",
  "audio": {
    "data": "base64编码后的音频",
    "format": "wav"
  },
  "language": 0,
  "extra_params": {
    "voice_clone_denoise_model_id": ""
  }
}
```

`custom_speaker_id` 命名约束：

- 长度范围 `[8, 256]`
- 首字符必须是英文字母
- 仅允许数字、字母、`-`、`_`
- 首位和末位不可是 `-` 或 `_`
- 同一账号下不能与已有 ID 重复
- 不能与官方精品音色命名冲突，例如 `S_`、`ICL_`、`MIX_`、`DiT_`、`BV`、语言前缀、`*_bigtts` 等官方命名模式

### 5.2 预付费音色槽位请求

```json
{
  "speaker_id": "S_*******",
  "audio": {
    "data": "base64编码后的音频",
    "format": "wav"
  },
  "language": 0,
  "extra_params": {
    "voice_clone_denoise_model_id": ""
  }
}
```

### 5.3 请求字段

| 字段 | 类型 | 必填 | 说明 |
| --- | --- | --- | --- |
| `speaker_id` | string | 是 | 预付费传真实 `S_...`；后付费固定传 `custom_speaker_id` |
| `custom_speaker_id` | string | 后付费必填 | 客户自定义音色代号 |
| `audio.data` | string | 是 | 音频二进制内容的 base64 |
| `audio.format` | string | 是 | 音频格式，如 `wav`、`mp3`、`m4a`、`pcm` |
| `language` | int | 建议传 | 语种枚举，中文为 `0` |
| `extra_params` | object | 否 | 复刻增强、降噪、质量检测等参数 |

### 5.4 语种枚举

| 值 | 语种 |
| --- | --- |
| `0` | 中文，默认 |
| `1` | 英文 |
| `2` | 日语 |
| `3` | 西班牙语 |
| `4` | 印尼语 |
| `5` | 葡萄牙语 |
| `6` | 德语 |
| `7` | 法语 |
| `8` | 韩语 |

### 5.5 `extra_params`

| 字段 | 类型 | 默认 | 说明 |
| --- | --- | --- | --- |
| `voice_clone_denoise_model_id` | string | `""` | 人声美化/降噪模型。空值默认使用 `SpeechInpaintingV2`；可选 `SpeechInpaintingV2`、`VocalDiffusionV2`、`VocalDiffusionV2_44k` |
| `voice_clone_enable_mss` | bool | `false` | 是否使用音源分离去除背景音 |
| `enable_crop_by_asr` | bool | `false` | 用 ASR 辅助截断，减少单字发音被截断 |
| `enable_check_prompt_text_quality` | bool | 未开启 | 是否开启 ASR 文本质量检测，会降低成功率 |
| `enable_check_audio_quality` | bool | 未开启 | 是否开启音频质量检测，会降低成功率 |
| `enable_audio_denoise` | bool | 未开启 | 是否开启音频降噪 |
| `denoise_max_snr_thresh` | int | `50` | 降噪检测阈值，需配合音频降噪使用 |
| `reject_min_snr_thresh` | float | `5` | 信噪比低于该值时拒绝复刻，会降低成功率 |

本仓库默认只传：

```json
{
  "voice_clone_denoise_model_id": ""
}
```

## 6. 查询接口 `get_voice`

### 6.1 请求

预付费：

```json
{
  "speaker_id": "S_*******"
}
```

后付费：

```json
{
  "speaker_id": "custom_speaker_id",
  "custom_speaker_id": "custom_zh_xxx"
}
```

实际脚本当前用 `speaker_id` 查询已训练音色；如遇到后付费查询不匹配，应改成同时传 `speaker_id=custom_speaker_id` 与 `custom_speaker_id`。

查询返回里的 `available_training_times` 表示该音色剩余训练次数，可用来判断音色槽位还能复刻/重训多少次。本仓库可直接运行：

```bash
python3 clone/doubao/clone_voice.py --query-status
```

如果是预付费 `S_...` 音色槽位：

```bash
python3 clone/doubao/clone_voice.py --query-status --prepaid
```

### 6.2 状态

| status | 名称 | 说明 |
| --- | --- | --- |
| `0` | NotFound | 未找到 |
| `1` | Training | 训练中 |
| `2` | Success | 训练成功，可以调用 TTS |
| `3` | Failed | 训练失败 |
| `4` | Active | 可用，可以调用 TTS |

### 6.3 返回示例

```json
{
  "available_training_times": 15,
  "create_time": 1772026663000,
  "language": 0,
  "speaker_id": "S_*******",
  "speaker_status": [
    {
      "demo_audio": "https://x.bytespeech.com/S_*******",
      "model_type": 1
    },
    {
      "demo_audio": "https://x.bytespeech.com/S_*******",
      "model_type": 4
    }
  ],
  "status": 2
}
```

`demo_audio` 在成功状态时返回，有效期约一小时，需要的话应及时下载。

### 6.4 `model_type`

| model_type | 含义 |
| --- | --- |
| `1` | 声音复刻 ICL V1 效果 |
| `2` | 声音复刻 DiT 标准版效果，偏音色，不还原用户风格 |
| `3` | 声音复刻 DiT 还原版效果，还原口音、语速等风格 |
| `4` | 声音复刻 ICL V2 效果 |
| `5` | 声音复刻 ICL V3 效果 |

## 7. 升级接口 `upgrade_voice`

升级接口用于将旧复刻音色升级为支持统一管理的音色。请求与查询接口类似，以 `speaker_id` 标识目标音色；返回结构也与查询状态类似。

当前仓库尚未实现升级脚本。除非需要迁移历史 V1 音色，否则日常 pipeline 不需要调用。

## 8. 错误码

错误码分类：

- `4xxxxxxx`: 客户端参数、素材、权限、配额等问题
- `5xxxxxxx`: 服务端或下游依赖异常，通常可重试

常见错误：

| code | message | 常见原因 | 处理建议 |
| --- | --- | --- | --- |
| `45001001` | 请求参数有误 | 参数缺失、格式错误、枚举值不合法 | 检查必填字段、base64、`speaker_id`、`language` |
| `45001101` | 音频上传失败 | 上传失败、超时、网络问题 | 重试，检查网络与音频大小 |
| `45001102` | ASR 转写失败 | 音频质量差、无法识别人声 | 换更清晰音频，提高人声占比 |
| `45001104` | 声纹检测未通过 | 触发敏感声纹、黑名单或相似度策略 | 更换音频或说话人 |
| `45001105` | 获取音频数据失败 | base64 解码失败、音频为空、URL 不可访问 | 检查 `audio.data` |
| `45001107` | SpeakerID 未找到 | `speaker_id` 不存在或已删除 | 确认 ID，必要时重新创建 |
| `45001108` | 音频转码失败 | 格式不支持、音频损坏 | 换格式或重新导出音频 |
| `45001109` | WER 检测错误 | WER 服务异常或 prompt 不匹配 | 检查 prompt 音频与文本 |
| `45001110` | 音色删除失败 | 删除流程失败或资源不存在 | 确认 ID 后重试 |
| `45001112` | SNR 检测错误 | SNR 检测服务异常或音频问题 | 换高信噪比音频 |
| `45001113` | 降噪失败 | 降噪服务异常或参数不支持 | 关闭降噪或换模型 |
| `45001114` | 音频质量较差 | 噪声大、人声弱 | 换音频 |
| `45001122` | ASR 未检测到人声 | 无人声或人声太弱 | 换含清晰人声的音频 |
| `45001123` | 达到上传次数上限 | 音色训练次数耗尽 | 更换还有训练次数的 `speaker_id` |
| `45001124` | ASR 文本审核拒绝 | ASR 文本触发审核 | 更换音频内容 |
| `45001125` | demo 文本审核拒绝 | demo 文本触发审核 | 调整文本 |
| `45001126` | demo 文本长度错误 | demo 文本太短或太长 | 调整长度 |
| `45001127` | prompt 音频审核拒绝 | 音频触发审核 | 更换合规素材 |
| `45001128` | prompt 音频文本审核拒绝 | 音频对应文本触发审核 | 更换音频或文本 |
| `55001301` - `55001306` | 数据库/TOS 异常 | 服务端依赖异常 | 稍后重试 |
| `55001307` | 音色克隆失败 | 下游复刻服务失败或超时 | 重试；若持续失败则换音频 |

## 9. V1 到 V3 迁移

| V1 字段 | V3 字段 | 说明 |
| --- | --- | --- |
| `audios` | `audio` | V1 是数组但只支持一个音频；V3 改为单对象 |
| `audios[].audio_bytes` | `audio.data` | 二进制音频需要 base64 |
| `audios[].audio_format` | `audio.format` | 格式字段含义不变 |
| `model_type` | 不再使用 | V3 不建议继续指定 V1 的 `model_type=2/3` |
| `extra_params` | `extra_params` object | V1 是 JSON string；V3 是 object |

音色训练成功后，需要调用大模型语音合成 V3 接口才能把文本合成为音频。参见 [HTTP Chunked/SSE 单向流式 V3](豆包语音_HTTP_Chunked_SSE单向流式-V3.md)。

## 10. 本仓库命令

注册已有音色：

```bash
python3 clone/doubao/clone_voice.py --register-existing
```

强制复刻并合成 `corpus.txt`：

```bash
python3 run_doubao_clone_pipeline.py --force-clone --overwrite
```

使用预付费音色槽位：

```bash
python3 run_doubao_clone_pipeline.py --force-clone --overwrite --prepaid
```
