可以，先把这个项目的 **稳定内核** 定义成一句话：

> 一个轻量的 TTS Vendor Facade：统一合成、流式、音色克隆三类能力的调用入口，同时保留厂商扩展、能力声明、执行计划和映射审计，用本地文件系统保存可复现运行记录。

**稳定内核边界**

第一版只做底层接入内核，不做大平台：

```txt
做：
- HTTP 同步 TTS
- WebSocket/流式 TTS 的抽象预留
- 音色克隆的抽象预留
- Vendor Adapter
- Capability 声明
- Vendor Extension Schema
- Plan / Mapping Report
- 本地文件系统 run archive
- 简单 Benchmark runner 可复用这套 Facade

不做：
- Arena
- 队列
- 对象存储
- 独立音频服务
- 复杂数据库
- 多租户权限
- 自动音频质量分析
- 大型 voice registry
```

**技术选型**

```txt
Language: TypeScript
Runtime: Node.js
API: Fastify
Schema: TypeBox + Ajv
Storage: local filesystem
DB: optional，SQLite 或 MySQL 后置
Tests: Vitest
Audio: 浏览器直接播放文件
```

第一版可以没有数据库，文件系统就是事实来源。

**核心模块**

```txt
core/
  types.ts
  facade.ts
  adapter.ts
  capabilities.ts
  extension-schema.ts
  planner.ts
  mapping-report.ts
  errors.ts

adapters/
  openai/
  azure/
  elevenlabs/
  minimax/
  volcengine/

storage/
  run-archive.ts
  voice-registry.ts

benchmark/
  dataset.ts
  runner.ts
```

**Facade 对上层暴露的接口**

不要只暴露一个万能 `synthesize()`，因为同步、流式、克隆生命周期不同。

```ts
interface TTSFacade {
  synthesizeSync(request: TTSSyncRequest): Promise<TTSSyncResult>

  synthesizeStream(request: TTSStreamRequest): Promise<TTSStreamSession>

  createVoiceClone(request: VoiceCloneRequest): Promise<VoiceCloneResult>

  listVoices(query?: VoiceQuery): Promise<VoiceRecord[]>

  getCapabilities(providerId: string): Promise<TTSCapabilities>
}
```

MVP 可以先实现 `synthesizeSync()`，其他接口先定协议和 adapter contract。

**Adapter 稳定契约**

每个厂商实现一个 Adapter：

```ts
interface TTSAdapter {
  providerId: string
  adapterVersion: string

  capabilities(): TTSCapabilities

  extensionSchema(operation: TTSOperation): object

  plan(request: TTSOperationRequest): Promise<TTSPlan>

  synthesizeSync?(plan: TTSSyncPlan): Promise<TTSSyncProviderResult>

  synthesizeStream?(plan: TTSStreamPlan): AsyncIterable<TTSStreamEvent>

  createVoiceClone?(request: VoiceCloneRequest): Promise<VoiceCloneResult>

  deleteVoiceClone?(voiceId: string): Promise<void>
}
```

这里最关键的是 `plan()`。  
真正稳定内核不是“怎么调厂商 API”，而是“调之前生成可审计执行计划”。

**Operation 模型**

```ts
type TTSOperation =
  | "tts.sync"
  | "tts.stream"
  | "voice.clone.create"
  | "voice.clone.delete"
  | "voice.clone.instant"
```

后续 Benchmark、Capability、Extension Schema 都按 operation 分开。

**统一请求模型**

```ts
type BaseTTSRequest = {
  operation: "tts.sync" | "tts.stream"

  input: {
    text: string
    language?: string
    ssml?: string
  }

  target: {
    provider: string
    model?: string
    voice?: string
  }

  controls?: {
    speed?: number
    pitch?: number
    emotion?: string
    style?: string
  }

  output?: {
    format?: "mp3" | "wav" | "pcm" | "opus"
    sampleRate?: number
    channels?: 1 | 2
  }

  vendor?: VendorDirective
}
```

流式请求额外加：

```ts
stream?: {
  protocol?: "ws" | "sse" | "http_chunk"
  chunkFormat?: "pcm" | "mp3" | "opus"
  enableTimestamps?: boolean
}
```

音色克隆使用单独请求：

```ts
type VoiceCloneRequest = {
  provider: string
  mode: "persistent" | "instant"

  name?: string
  language?: string

  referenceAudios: {
    fileId: string
    path: string
    durationMs?: number
    transcript?: string
  }[]

  consent?: {
    confirmed: boolean
    speakerName?: string
    usageScope?: "internal_eval" | "commercial" | "research"
  }

  vendor?: VendorDirective
}
```

**Vendor 扩展模型**

不要把厂商差异硬打平。统一字段只覆盖共同能力，厂商高级能力走 extension。

```ts
type VendorDirective = {
  mode?: "canonical_only" | "prefer_vendor" | "vendor_required"

  extensions?: {
    [providerId: string]: {
      schemaVersion: string
      params: Record<string, unknown>
    }
  }
}
```

三种模式固定下来：

```txt
canonical_only:
  只允许平台统一字段，适合公平 Benchmark

prefer_vendor:
  允许使用厂商扩展，不可用时降级，适合最佳效果测试

vendor_required:
  必须使用厂商扩展，不支持就失败，适合专有能力测试
```

**Capability 模型**

能力必须按 operation 声明：

```ts
type TTSCapabilities = {
  operations: {
    "tts.sync"?: {
      supported: boolean
      transports: ["https"]
      formats: string[]
      sampleRates: number[]
      maxTextChars?: number
    }

    "tts.stream"?: {
      supported: boolean
      transports: ("ws" | "sse" | "http_chunk")[]
      inputModes: ("text_once" | "text_incremental")[]
      outputChunkFormats: ("pcm" | "mp3" | "opus")[]
      supportsInterruption?: boolean
      supportsTimestamps?: boolean
    }

    "voice.clone.create"?: {
      supported: boolean
      modes: ("persistent" | "instant")[]
      minReferenceSeconds?: number
      maxReferenceSeconds?: number
      requiresTranscript?: boolean
      maxFiles?: number
    }
  }

  controls: {
    speed?: CapabilitySupport<NumericRange>
    pitch?: CapabilitySupport<NumericRange>
    emotion?: CapabilitySupport<string[]>
    style?: CapabilitySupport<string[]>
  }

  extensions: Record<TTSOperation, VendorExtensionSchema>
}
```

这样上层能知道：这个 Vendor 到底支持同步、流式、克隆里的哪些部分。

**Plan 和 Mapping Report**

每次调用必须先产出 plan：

```ts
type TTSPlan = {
  id: string
  operation: TTSOperation
  provider: string
  model?: string
  voice?: string
  adapterVersion: string

  canonicalRequest: unknown
  vendorRequest: unknown

  capabilitySnapshot: TTSCapabilities
  mappingReport: MappingReport

  estimatedCost?: {
    amount: number
    currency: string
    unit?: string
  }
}
```

映射报告固定：

```ts
type MappingReport = {
  appliedCanonicalFields: string[]
  appliedVendorExtensions: string[]

  ignoredFields: {
    path: string
    reason: string
  }[]

  approximations: {
    path: string
    requested: unknown
    applied: unknown
    reason: string
  }[]

  warnings: {
    code: string
    message: string
  }[]
}
```

Benchmark 是否可信，主要看这个报告。

**流式事件协议**

上层不直接吃厂商 WS，而是吃自己的事件协议：

```ts
type TTSStreamEvent =
  | { type: "session.started"; sessionId: string; planId: string }
  | { type: "audio.chunk"; seq: number; audio: Buffer; format: "pcm" | "mp3" | "opus"; timestampMs?: number }
  | { type: "metadata"; data: Record<string, unknown> }
  | { type: "warning"; warning: unknown }
  | { type: "session.completed"; durationMs?: number; audioPath?: string }
  | { type: "error"; error: TTSError }
```

即使底层 Vendor 是 WS、SSE、HTTP chunk，上层也只处理这套事件。

**本地文件系统 Archive**

第一版文件系统就是事实来源：

```txt
data/
  runs/
    {runId}/
      request.json
      plan.json
      mapping-report.json
      vendor-request.json
      vendor-response.json
      audio.mp3

  voices/
    {voiceId}.json

  datasets/
    zh-cn-basic-v1.json

  benchmark-runs/
    {benchmarkRunId}/
      config.json
      results.json
```

SQLite/MySQL 后面只做索引，不替代 archive。

**Voice Record**

音色统一成轻量 registry：

```ts
type VoiceRecord = {
  id: string
  provider: string
  providerVoiceId: string

  source: "vendor_builtin" | "cloned"
  name?: string
  language?: string

  clone?: {
    referenceAudioIds: string[]
    createdAt: string
    consentScope?: string
  }

  vendorMetadata?: Record<string, unknown>
}
```

**MVP 实现顺序**

```txt
Phase 1:
  tts.sync
  Adapter contract
  Vendor extension schema
  Plan + MappingReport
  本地 run archive
  接 1-2 个厂商

Phase 2:
  voice.clone.create
  本地 voices registry
  cloned voice 用于 sync TTS

Phase 3:
  tts.stream
  Facade WS proxy
  记录 first_chunk_ms、chunk_count、total_stream_ms

Phase 4:
  Benchmark runner
  支持 canonical_only / prefer_vendor / vendor_required
```

最终稳定内核就定为：

```txt
TypeScript 单体
Operation-based TTS Facade
Adapter-based Vendor 接入
Schema-governed Vendor Extension
Capability-driven feature discovery
Plan-first execution
MappingReport-based audit
Filesystem-based reproducible archive
```

这套内核小，但方向是正的。后面要不要加数据库、队列、对象存储、Arena，都可以长在它上面。