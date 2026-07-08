# Benchmark 与语料库需求整理

## 目标

当前分支目标是新增两块能力：

1. **语料库 Corpus**
   用于管理可复用的 TTS 测试文本，并给每条语料打上结构化标注。

2. **Benchmark**
   基于一组语料和一组 TTS 合成配置，生成可执行 plan，由 workbench 执行后产出合成结果和指标报告。

## 核心概念

### 语料记录 Corpus Item

一条语料至少包含：

- `id`
- `title` 或 `name`
- `text`
- `language`
- `scene`：标定场景，比如客服、旁白、播客、教育、广告等。
- `emotion`：情绪，比如 neutral、happy、sad、angry、calm 等。
- `lengthCategory`：短、中、长。
- `styleTags`：情感或风格标签，比如温柔、正式、激昂、自然等。
- `notes`
- `createdAt` / `updatedAt`

关于 SSML，建议不要直接替代原始文本，而是作为语料的一个可选变体保存：

```txt
CorpusItem
  text: 原始纯文本
  ssml?: 可选 SSML 文本
  ssmlEnabled?: 是否允许作为 SSML 用例
```

这样 benchmark 里既可以做公平的纯文本比较，也可以测试厂商 SSML 能力。两者需要可区分。

### 语料组合 Corpus Set

Benchmark 不直接绑定零散语料，而是绑定一组语料组合。

```txt
CorpusSet
  id
  name
  description
  corpusItemIds[]
  filtersSnapshot?
```

语料组合可以手动选择，也可以后续支持按标签筛选生成。

### 合成配置 Synthesis Config

一条配置代表一次独立的 TTS 参数组合。只要厂商、模型、音色、语速、音量等任一参数变化，就应该形成另一条独立配置。

```txt
SynthesisConfig
  id
  providerId
  model
  voiceId
  format
  sampleRate
  speed
  volume
  pitch?
  language?
  vendorDirective?
```

厂商专有参数仍然走现有的 `VendorDirective.extensions`，不要污染 canonical request。

### 配置组合 Config Set

Benchmark 绑定一组配置：

```txt
SynthesisConfigSet
  id
  name
  configIds[]
```

### Benchmark Plan

Benchmark plan 由语料组合和配置组合生成。

本质是：

```txt
BenchmarkPlan = CorpusSet x SynthesisConfigSet
```

也就是每条语料和每条合成配置形成一个待执行请求。

```txt
BenchmarkPlan
  id
  corpusSetId
  configSetId
  jobs[]
```

每个 job 对应一次真实 TTS 请求：

```txt
BenchmarkJob
  id
  corpusItemId
  synthesisConfigId
  operation: "tts.sync" | "tts.stream"
  request
  status
```

## 执行流程

建议流程是：

```txt
选择语料 -> 形成语料组合
选择或创建合成配置 -> 形成配置组合
生成 BenchmarkPlan
Workbench 执行 plan
每个 job 走现有 Facade / Adapter / plan / mapping report / archive 流程
聚合所有 job 的结果和指标
输出 BenchmarkRun
```

每个 job 仍然必须落到现有 run archive：

```txt
data/runs/{runId}/
  request.json
  plan.json
  mapping-report.json
  vendor-request.json
  vendor-response.json
  result.json
  audio.*
```

Benchmark 自己可以额外保存聚合层：

```txt
data/benchmark-runs/{benchmarkRunId}/
  benchmark-plan.json
  jobs.json
  summary.json
  metrics.json
```

## 指标范围

这次需求明确不包含并发，所以先做单请求指标和计划级聚合指标。

单个请求建议记录：

- `requestStartAt`
- `planCreatedAt`
- `vendorRequestStartAt`
- `firstByteAt` / `firstAudioChunkAt`
- `vendorResponseEndAt`
- `archiveCompletedAt`
- `planningLatencyMs`
- `ttfbMs`：首包延迟。
- `synthesisWallTimeMs`：厂商合成耗时。
- `totalLatencyMs`：从请求开始到完成归档。
- `audioDurationMs`
- `realTimeFactor`：合成耗时 / 音频时长。
- `audioSizeBytes`
- `status`
- `errorCode?`
- `errorMessage?`

Plan 级别聚合：

- total jobs
- success count
- failed count
- average / p50 / p95 TTFB
- average / p50 / p95 total latency
- average real-time factor
- per provider summary
- per model summary
- per voice summary
- per corpus length category summary

## SSML 建议

SSML 应该进入语料库，但要作为可选测试维度处理。

建议规则：

- 语料永远保留 `text`。
- SSML 作为 `ssml` 字段或独立 variant。
- Benchmark config 或 plan job 决定使用 `text` 还是 `ssml`。
- 如果 provider 不支持 SSML，plan 阶段要产生 warning 或直接失败，取决于模式。
- SSML 能力应该体现在 capability 里。

## 前端需求

前端只做控制台和查看器：

- 语料列表
- 新增/编辑语料
- 标签、场景、情绪、长度筛选
- SSML 编辑/预览
- 创建语料组合
- 创建合成配置
- 创建 benchmark plan
- 执行 benchmark plan
- 查看 benchmark run
- 查看每个 job 的音频、request、plan、mapping report、metrics、error

## 后端需求

后端负责：

- corpus archive
- corpus set archive
- synthesis config archive
- benchmark plan 生成
- benchmark run 执行
- job 到现有 TTS facade 的转换
- 指标采集
- benchmark 结果聚合
- archive 写入

厂商逻辑仍然必须留在 adapter，不要写进 benchmark runner。

## 需要进一步确认的问题

1. SSML 是每条语料最多一个，还是允许多个 SSML variant？
2. Benchmark plan 默认执行 `tts.sync`，还是同时支持 `tts.stream`？
3. 指标里的首包延迟，对同步 HTTP 返回完整音频的厂商，是按 HTTP first byte 计，还是只能退化为 response latency？
4. 语料长度分类是用户手填，还是根据字符数自动计算？
5. Benchmark run 是否允许中断后继续跑，还是 MVP 只支持一次完整执行？

## MVP 建议

MVP 先做：

- 纯文本 + 可选单个 SSML。
- 同步合成。
- 无并发。
- 文件系统 archive。
- mock adapter 闭环。
- 基础指标聚合。

这样不会破坏现有 Facade / Adapter / Archive 内核，后续再扩展 stream、SSML variants 和并发压测。
