# MVP Arch Design

## Q1

我想做一个 TTS 的 工具平台, 其中不仅包含benchmark, 也包含了 Arena 对比. 这里关键的难点在于如何解决不同厂商的接入问题, 你帮我设计一下

---  

可以。这个平台的核心不要设计成“接很多 TTS API”，而要设计成一个 **TTS 评测与对战操作系统**：厂商接入只是底层适配层，真正稳定的是任务、样本、生成结果、评价、计费、权限和可复现性。

我建议整体架构分成 6 层。

**1. Provider Adapter 层**

这是解决不同厂商接入的关键。

不要让业务代码直接调用 OpenAI、ElevenLabs、Azure、Google、火山、讯飞、MiniMax、Fish Audio 等 API，而是抽象成统一接口：

```ts
interface TTSProvider {
  id: string
  name: string
  capabilities(): ProviderCapabilities

  listVoices(): Promise<Voice[]>

  synthesize(request: TTSRequest): Promise<TTSResult>

  estimateCost?(request: TTSRequest): Promise<CostEstimate>

  healthCheck(): Promise<ProviderHealth>
}
```

统一请求结构可以是：

```ts
type TTSRequest = {
  text: string
  language?: string
  voice?: string
  model?: string
  speed?: number
  pitch?: number
  emotion?: string
  style?: string
  format?: "mp3" | "wav" | "opus"
  sampleRate?: number
  seed?: number
  referenceAudioUrl?: string
  providerOptions?: Record<string, unknown>
}
```

重点是 `providerOptions`：  
通用能力进入标准字段，厂商专有能力放进扩展字段。这样既能统一 benchmark，又不会牺牲高级能力。

**2. Capability Matrix 能力矩阵**

不同厂商差异很大，不能假设它们都支持同一套参数。

每个 Provider Adapter 需要声明能力：

```ts
type ProviderCapabilities = {
  languages: string[]
  formats: string[]
  sampleRates: number[]
  supportsStreaming: boolean
  supportsVoiceClone: boolean
  supportsEmotion: boolean
  supportsSSML: boolean
  supportsSeed: boolean
  maxTextLength: number
  rateLimits: {
    rpm?: number
    concurrent?: number
  }
}
```

平台上任何一次 benchmark 或 Arena 任务，都应该先根据能力矩阵筛选可用模型。否则你会不断遇到“这个厂商不支持这个参数”的脏问题。

这里可以做一个 UI：用户创建评测任务时，选择文本、语言、风格、音频格式后，系统自动显示哪些厂商/模型可参与，哪些不可参与，以及原因。

**3. Benchmark 引擎**

Benchmark 要追求可复现。

核心对象：

```txt
Dataset
  - text samples
  - language
  - domain: news / dialogue / customer service / audiobook / game / education
  - expected style
  - metadata

Run
  - dataset version
  - provider/model/voice
  - normalized parameters
  - timestamp
  - adapter version
  - output audio
  - latency
  - cost
  - failure reason

Metric
  - objective metrics
  - human rating
  - LLM/audio judge rating
```

建议 benchmark 至少包含这些维度：

- `Latency`：首包时间、总生成时间、实时率 RTF
- `Cost`：每千字符成本、每分钟音频成本
- `Reliability`：失败率、超时率、重试次数
- `Audio Quality`：噪声、断句、音色稳定性、爆音
- `Prosody`：节奏、重音、情绪、自然度
- `Pronunciation`：多语言、数字、缩写、专有名词
- `Controllability`：语速、情绪、停顿、SSML、风格是否可控
- `Consistency`：同一输入多次生成是否稳定
- `Streaming`：是否支持流式、首包体验如何

音频文件一定要保存下来，并且每次 run 绑定完整参数快照。否则 benchmark 没法追溯。

**4. Arena 对战系统**

Arena 和 Benchmark 的目标不同。

Benchmark 是系统化测量，Arena 是偏好收集。

Arena 可以采用 blind A/B：

```txt
同一段文本
  -> 模型 A 生成音频
  -> 模型 B 生成音频
  -> 隐藏厂商名
  -> 用户选择更好的一方
  -> 可选：评价维度
```

评价维度建议拆开，不要只问“哪个好”：

- 哪个更自然？
- 哪个发音更准？
- 哪个情绪更符合？
- 哪个更适合商用？
- 哪个更像真人？
- 哪个更稳定、没有怪声？

排名算法可以用：

- 初期：Elo
- 中期：Bradley-Terry model
- 后期：分语言、分场景、分声音类型建榜

不要做一个总榜就完事。TTS 很强依赖场景，建议做多榜单：

```txt
中文客服榜
英文有声书榜
日语角色对白榜
多语言播报榜
低延迟流式榜
低成本商用榜
情绪表达榜
声音克隆榜
```

这样榜单才有产品价值。

**5. 厂商接入难点与解决方案**

真正麻烦的地方主要有这些。

**参数不统一**

解决方式：标准参数 + 扩展参数。

平台只保证标准参数可横向比较，比如 text、language、voice、speed、format。厂商独有能力不强行标准化，而是通过 `providerOptions` 暴露。

**声音体系不统一**

不同厂商 voice id、语言、风格、性别、年龄标签都不一样。

建议做一个内部 Voice Registry：

```txt
Provider Voice
  - providerVoiceId
  - provider
  - language
  - gender
  - age
  - accent
  - style tags
  - sample audio
  - license info
  - commercial allowed?
```

再做一层平台统一标签，比如：

```txt
female / male
young / adult / senior
neutral / warm / energetic / narration / customer-service
zh-CN / en-US / ja-JP
```

用户按统一标签筛选，底层映射到各厂商 voice。

**鉴权和密钥管理**

每个厂商 API key 单独存储，不能进业务数据库明文。

建议：

- 使用 KMS 或 Vault 加密
- 每个 provider 一个 credential profile
- 支持平台密钥和用户自带密钥 BYOK
- 所有调用写审计日志
- 对 key 设置 quota、rate limit、预算上限

**限流与并发**

不同厂商 rate limit 不同。

需要一个 Job Queue：

```txt
TTS Job
  -> capability check
  -> cost estimate
  -> queue
  -> provider-specific rate limiter
  -> retry policy
  -> result storage
```

建议用：

- BullMQ / Temporal / Celery / Sidekiq 任选一种
- 每个 provider 单独 worker pool
- 每个 provider 单独 concurrency limit
- 超时、重试、熔断、降级

**音频格式不统一**

所有生成结果进入平台后做标准化处理：

```txt
原始音频保存一份
标准评测音频保存一份，例如 wav / 24kHz / mono
波形、响度、时长、频谱特征预计算
```

用 FFmpeg 做统一转码、响度归一化、静音检测。

**成本计算不统一**

有的按字符，有的按 token，有的按音频秒数，有的按套餐。

平台内部统一成：

```txt
estimated_cost_usd
actual_cost_usd
cost_per_1k_chars
cost_per_audio_minute
```

每个 Adapter 负责自己的计价逻辑。

**6. 推荐的系统模块**

可以按这些服务拆：

```txt
API Gateway
  - auth
  - project/workspace
  - user quota

Provider Service
  - provider adapters
  - credential management
  - capability registry

TTS Job Service
  - async synthesis
  - queue
  - retries
  - rate limit

Audio Service
  - storage
  - transcoding
  - waveform
  - metadata extraction

Benchmark Service
  - dataset
  - run management
  - metrics
  - reports

Arena Service
  - pair generation
  - blind comparison
  - votes
  - ranking

Evaluation Service
  - human eval
  - automatic audio metrics
  - LLM/audio judge
  - annotation workflows

Admin Console
  - provider health
  - cost
  - failures
  - adapter versions
```

数据存储建议：

```txt
Postgres: 项目、任务、榜单、元数据
Object Storage: 音频文件
Redis: 队列、限流、缓存
ClickHouse/BigQuery: 大规模评测日志和分析
Vector DB 可选: 音色/音频 embedding 检索
```

**MVP 建议**

第一版不要一口气做全。

我会这样切：

1. 先接 3 个厂商，做统一 Adapter
2. 支持文本输入、批量生成、音频结果保存
3. 做一个小型 benchmark：延迟、成本、失败率、人工评分
4. 做 blind A/B Arena
5. 做基础 Elo 排名
6. 做 Provider 管理后台：key、限流、健康检查、成本

MVP 的核心不是“支持最多厂商”，而是证明你的统一接入模型能扛住差异。

**最关键的设计原则**

这个平台的护城河不只是厂商接入，而是：

```txt
统一任务定义
+ 可复现生成记录
+ 可比较音频结果
+ 可解释评分体系
+ 场景化排行榜
+ 稳定的 Provider Adapter 生态
```

一句话总结：  
把每个 TTS 厂商都包成一个声明能力的 Adapter，把 benchmark 和 Arena 都建立在统一任务、统一音频产物、统一评价记录之上。这样厂商怎么变，你的平台核心都不乱。

## Q2

先抛开 Arena 对战系统, 其和 TTS 共享一套底层接入的 Facade. 我们先看 TTS 合成和接入部分, 也就是你提到的统一接入和厂商自扩展那一块, 因为对上层来说, 只调用一层统一门面即可, 但是问题在于, 既然要做 Benchmark 就不能完全打平差异, 需要专门留出厂商/Vendor实现里能够支持扩展的部分

---  

对，这里不能做成“最低公分母 API”。Benchmark 的价值恰恰来自：既能横向公平比较，又能暴露各厂商高级能力的上限。

我会把 Facade 设计成 **统一核心协议 + Vendor 扩展协议 + 可审计参数快照** 三层。

**核心思路**

上层永远只调一个 Facade：

```ts
tts.synthesize(request)
```

但 `request` 里不要只有统一字段，而是分成：

```ts
type TTSRequest = {
  input: TTSInput
  target: TTSTarget
  controls?: TTSControls
  output?: TTSOutputOptions

  vendor?: VendorDirective
  benchmark?: BenchmarkDirective
}
```

也就是：

```txt
统一字段：用于公平横评
厂商扩展：用于启用 Vendor 专有能力
Benchmark 指令：用于控制是否允许扩展、如何记录和比较
```

**1. Canonical Core：统一核心字段**

这些字段是平台理解的、可索引、可比较的。

```ts
type TTSInput = {
  text: string
  language?: string
  ssml?: string
}

type TTSTarget = {
  provider: string
  model?: string
  voice?: string
}

type TTSControls = {
  speed?: number
  pitch?: number
  volume?: number
  emotion?: string
  style?: string
  pauseScale?: number
  pronunciationDict?: PronunciationEntry[]
}

type TTSOutputOptions = {
  format?: "wav" | "mp3" | "opus"
  sampleRate?: number
  channels?: 1 | 2
}
```

这里的字段不是为了覆盖所有厂商，而是为了定义“平台共同语言”。

比如 `speed` 统一定义为：

```txt
1.0 = normal
0.5 = half speed
2.0 = double speed
```

但某个 Vendor 如果只支持 `rate = slow | medium | fast`，Adapter 负责映射并记录损耗。

**2. Vendor Extensions：厂商扩展字段**

厂商扩展不要放一个裸的 `Record<string, any>` 就完事。那样长期会变成不可治理的黑洞。

建议结构化成这样：

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

示例：

```ts
{
  input: {
    text: "欢迎使用我们的智能客服系统。",
    language: "zh-CN"
  },
  target: {
    provider: "azure",
    model: "tts-v2",
    voice: "zh-CN-XiaoxiaoNeural"
  },
  controls: {
    speed: 1.05,
    emotion: "friendly"
  },
  vendor: {
    mode: "prefer_vendor",
    extensions: {
      azure: {
        schemaVersion: "2026-01-01",
        params: {
          msttsExpressAs: {
            style: "cheerful",
            styledegree: 1.3
          },
          role: "YoungAdultFemale"
        }
      }
    }
  }
}
```

这样上层仍然只调用 Facade，但可以明确传入“这次我允许用 Azure 的专有能力”。

**3. 三种调用模式**

这是 benchmark 特别关键的设计。

```ts
type VendorMode =
  | "canonical_only"
  | "prefer_vendor"
  | "vendor_required"
```

含义：

**canonical_only**

只允许使用平台标准字段。

适合公平横评：

```txt
同样文本
同样语言
同样音频格式
同样速度
不启用厂商专有风格、情绪、克隆、prompt
```

如果某个字段无法映射，Adapter 必须返回 warning 或 failure，不能偷偷用私货。

**prefer_vendor**

优先使用厂商扩展，但扩展不可用时可以降级。

适合产品体验测试：

```txt
我希望尽量让每个模型发挥自己的能力
但不要求完全一致
```

**vendor_required**

必须使用指定厂商扩展。

适合测 Vendor 专有能力：

```txt
测 Azure styledegree
测 ElevenLabs stability/similarity_boost
测 OpenAI voice instructions
测某厂商的 emotion token
```

如果扩展不支持或版本不匹配，直接失败。

**4. Adapter Contract：适配器不只是 synthesize**

每个 Vendor Adapter 至少要实现这些方法：

```ts
interface TTSAdapter<TVendorParams = unknown> {
  providerId: string

  getCapabilities(): Promise<TTSCapabilities>

  getExtensionSchema(): Promise<VendorExtensionSchema>

  validate(request: TTSRequest): Promise<ValidationResult>

  plan(request: TTSRequest): Promise<SynthesisPlan<TVendorParams>>

  synthesize(plan: SynthesisPlan<TVendorParams>): Promise<TTSResult>
}
```

重点是 `plan()`。

Facade 不应该直接把 request 交给 adapter 生成，而是先生成一个可审计计划：

```ts
type SynthesisPlan<TVendorParams> = {
  provider: string
  model?: string
  voice?: string

  canonicalInput: TTSRequest

  vendorRequest: TVendorParams

  mappingReport: MappingReport

  warnings: MappingWarning[]

  estimatedCost?: CostEstimate
}
```

`mappingReport` 很重要：

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
}
```

这能解决 Benchmark 里的一个核心问题：  
不是所有结果都能简单比较，你要知道每个厂商到底吃进去了什么参数。

**5. 能力声明要分成 Canonical 和 Extension**

不要只声明“支持 emotion”。要声明支持到什么粒度。

```ts
type TTSCapabilities = {
  canonical: {
    languages: string[]
    formats: string[]
    sampleRates: number[]
    controls: {
      speed: CapabilitySupport<NumericRange>
      pitch: CapabilitySupport<NumericRange>
      emotion: CapabilitySupport<string[]>
      style: CapabilitySupport<string[]>
      ssml: CapabilitySupport<SSMLSupport>
    }
  }

  extensions: {
    schemaVersion: string
    jsonSchema: object
    examples: object[]
  }

  limits: {
    maxTextChars: number
    maxRequestBytes?: number
    rpm?: number
    concurrency?: number
  }
}
```

`CapabilitySupport` 可以这样：

```ts
type CapabilitySupport<T> = {
  supported: boolean
  native: boolean
  values?: T
  mapping?: "exact" | "approximate" | "lossy" | "unsupported"
}
```

例如 Azure 的 style/emotion 可能是 native；另一个厂商可能只能近似映射。

**6. Benchmark 如何使用这套设计**

Benchmark 任务不要只保存一个 `request`，而是保存：

```txt
canonical_request
vendor_extension
synthesis_plan
mapping_report
raw_vendor_request
raw_vendor_response_metadata
audio_original_url
audio_normalized_url
adapter_version
capability_snapshot
```

这样才能回答这些问题：

```txt
这个结果是否公平？
有没有启用厂商专有能力？
速度参数有没有被近似？
emotion 有没有被忽略？
该厂商当时能力声明是什么？
这个 adapter 版本是否影响结果？
```

建议 Benchmark 分三类：

**A. Fair Benchmark**

```txt
vendor.mode = canonical_only
只测共同能力
排行榜强调公平
```

**B. Best Effort Benchmark**

```txt
vendor.mode = prefer_vendor
每个厂商可以使用推荐扩展
排行榜强调“产品可达到的最好效果”
```

**C. Feature Benchmark**

```txt
vendor.mode = vendor_required
专门测某个厂商专有能力
不强行横向比较，只做能力展示和纵向比较
```

这三类一定要分开，否则榜单会变脏。

**7. Vendor 扩展不要让前端硬编码**

每个 Adapter 暴露自己的 Extension Schema：

```ts
type VendorExtensionSchema = {
  providerId: string
  schemaVersion: string
  jsonSchema: object
  uiSchema?: object
  examples?: object[]
}
```

前端可以根据 schema 动态渲染高级参数表单。  
这样新增厂商时，不需要改前端核心逻辑。

例如 ElevenLabs：

```json
{
  "type": "object",
  "properties": {
    "stability": {
      "type": "number",
      "minimum": 0,
      "maximum": 1
    },
    "similarity_boost": {
      "type": "number",
      "minimum": 0,
      "maximum": 1
    },
    "style": {
      "type": "number",
      "minimum": 0,
      "maximum": 1
    },
    "use_speaker_boost": {
      "type": "boolean"
    }
  }
}
```

**8. Facade 内部流程**

```txt
1. 接收 TTSRequest
2. 读取 provider adapter
3. 读取当前 capability snapshot
4. 校验 canonical 字段
5. 校验 vendor extension schema
6. 生成 synthesis plan
7. 根据 benchmark mode 判断是否允许 approximation / ignored field
8. 执行 synthesize
9. 保存原始音频
10. 标准化音频
11. 保存 mapping report、raw metadata、cost、latency
12. 返回统一 TTSResult
```

返回结果也要统一：

```ts
type TTSResult = {
  id: string
  provider: string
  model?: string
  voice?: string

  audio: {
    originalUrl: string
    normalizedUrl?: string
    format: string
    durationMs?: number
    sampleRate?: number
  }

  usage?: {
    inputChars?: number
    billedUnits?: number
    estimatedCostUsd?: number
  }

  timing: {
    queuedMs?: number
    firstByteMs?: number
    totalMs: number
  }

  plan: SynthesisPlanSummary
  warnings: MappingWarning[]
}
```

**9. 一个关键原则：Facade 统一“流程”，不统一“能力上限”**

这句话很重要。

Facade 应该统一的是：

```txt
调用方式
任务生命周期
参数校验
能力发现
扩展声明
结果格式
审计记录
错误模型
成本/延迟记录
```

Facade 不应该强行统一的是：

```txt
所有情绪类型
所有风格参数
所有音色控制
所有 prompt/control 语义
所有克隆能力
所有厂商私有模型参数
```

否则你会把强厂商的能力削平，最后 benchmark 也失真。

我建议你的底层接入抽象叫：

```txt
TTS Facade
  -> Canonical API
  -> Vendor Extension API
  -> Capability Registry
  -> Planning & Audit Layer
  -> Provider Adapter
```

真正的核心不是 `synthesize()`，而是 `plan()` 和 `mappingReport`。  
有了这两个，平台既能做公平 benchmark，也能做厂商能力上限测试。

## Q3

所以我怎么看怎么觉得这套抽象模型适合脚本语言, 尤其是js/ts, python, 因为其对象(json), 结构体或元组之类的, 很容易扩展

---  

是的，你这个判断很准：这套 **Facade + vendor extension + schema** 的模型天然更适合 JS/TS、Python 这类“JSON 一等公民”的生态。

但这里要分清两件事：

```txt
协议层适合动态/半动态结构
工程实现不一定必须是弱类型
```

我反而会建议：**协议用 JSON Schema，核心服务用 TypeScript 或 Python，性能/音频处理模块可以用 Go/Rust 做旁路服务。**

**为什么 JS/TS、Python 特别合适**

因为 TTS 接入的本质不是高性能计算，而是：

```txt
组装请求
校验参数
适配厂商 SDK/API
处理 JSON/HTTP
记录 metadata
生成 mapping report
管理扩展字段
```

这些事情都围绕 JSON 展开。

比如厂商扩展：

```json
{
  "provider": "elevenlabs",
  "extensions": {
    "elevenlabs": {
      "schemaVersion": "v1",
      "params": {
        "stability": 0.6,
        "similarity_boost": 0.8,
        "use_speaker_boost": true
      }
    }
  }
}
```

在 TS/Python 里很好表达。  
但如果用 Java/Go/Rust，一开始就会遇到一个尴尬点：每个 Vendor 都有自己的参数结构，要么疯狂定义 DTO，要么到处塞 `Map<String, Object>`，最后类型系统帮不上太多忙。

**TypeScript 是我最推荐的主语言**

如果你要做平台，我会优先选 TypeScript。

原因是它刚好卡在中间：

```txt
足够灵活：天然处理 JSON
足够有类型：核心协议可维护
生态适合：Node 后端、前端、JSON Schema、SDK 接入都顺
```

比如核心类型可以强约束：

```ts
type TTSRequest<TVendorParams = unknown> = {
  input: TTSInput
  target: TTSTarget
  controls?: TTSControls
  output?: TTSOutputOptions
  vendor?: VendorDirective<TVendorParams>
  benchmark?: BenchmarkDirective
}
```

每个 Adapter 又可以保留自己的强类型：

```ts
type ElevenLabsParams = {
  stability?: number
  similarity_boost?: number
  style?: number
  use_speaker_boost?: boolean
}

class ElevenLabsAdapter implements TTSAdapter<ElevenLabsParams> {
  plan(request: TTSRequest<ElevenLabsParams>) {
    // 这里可以拿到 typed vendor params
  }
}
```

也就是说：  
**Facade 对外是统一 JSON 协议，Adapter 内部可以是强类型实现。**

这是 TS 很舒服的地方。

**Python 也很适合，但治理要更用力**

Python 的优势是：

```txt
接 API 快
写 adapter 快
音频分析生态强
ML/评测生态强
Pydantic 很适合做 schema 校验
```

可以这样：

```py
class TTSRequest(BaseModel):
    input: TTSInput
    target: TTSTarget
    controls: TTSControls | None = None
    output: TTSOutputOptions | None = None
    vendor: VendorDirective | None = None
```

Vendor 扩展可以用：

```py
class ElevenLabsParams(BaseModel):
    stability: float | None = Field(default=None, ge=0, le=1)
    similarity_boost: float | None = Field(default=None, ge=0, le=1)
    use_speaker_boost: bool | None = None
```

Python 的问题是，当团队变大后，如果没有严格 Pydantic、mypy、lint、contract test，很容易变成“大家都能传一点奇怪东西进去”。

所以 Python 更适合：

```txt
评测服务
音频分析服务
离线 benchmark pipeline
ML/audio judge
快速接新厂商
```

**不太建议一开始用 Go/Rust/Java 做主 Facade**

不是不能做，是摩擦会比较大。

因为你的难点不是 CPU、内存或并发极限，而是：

```txt
协议演化
扩展字段
厂商差异
schema 校验
request/response metadata
灰度接入
快速迭代 adapter
```

Go/Rust 可以做得很稳，但代价是每次加 vendor 扩展都更重。  
Java/Kotlin 如果团队强，也可以，但要接受比较多 DTO、Jackson、多态反序列化、泛型擦除之类的复杂度。

**一个现实可落地的技术组合**

我会这样分：

```txt
TypeScript / Node.js
  - TTS Facade
  - Provider Adapter
  - Capability Registry
  - API Gateway
  - Benchmark Orchestrator
  - Admin UI schema rendering

Python
  - Audio normalization
  - Objective metrics
  - ASR-based pronunciation checks
  - MOS prediction
  - offline evaluation notebooks

FFmpeg
  - transcoding
  - loudness normalization
  - waveform generation

Postgres
  - request / plan / result / benchmark metadata

Object Storage
  - raw audio
  - normalized audio

Redis / BullMQ 或 Temporal
  - queue
  - retry
  - rate limit
```

如果用 TypeScript，队列选 BullMQ 很顺。  
如果你希望 workflow 强一致、可重试、可观测性更好，选 Temporal。

**关键是把扩展性放在协议，不是语言魔法里**

无论用什么语言，我建议把 Vendor 扩展能力沉淀成这几个 artifact：

```txt
adapter implementation
extension JSON Schema
capability declaration
mapping tests
golden request examples
contract tests
```

每接一个厂商，都必须交付：

```txt
1. capabilities.json
2. extension.schema.json
3. examples/*.json
4. adapter implementation
5. mapping snapshot tests
```

这样不会因为用了动态语言就变成随意扩展。

**推荐结论**

如果你现在从 0 到 1 做：

```txt
主服务：TypeScript
评测/音频分析：Python
协议：JSON Schema
Adapter 扩展：每个 vendor 一个 typed params + schema
队列：BullMQ 起步，后期可换 Temporal
```

最重要的设计不是“语言很灵活”，而是：

```txt
Facade 层保持稳定
Vendor 扩展层允许变化
Schema 层负责治理变化
Plan/MappingReport 负责记录变化
Contract Test 负责防止变化悄悄破坏 Benchmark
```

所以你的直觉没错：这套抽象确实更适合 TS/Python。  
但要想做成平台，不能只靠动态结构的便利，必须用 schema、capability、contract test 把“可扩展”变成“可治理”。

## Q4

那你给我一套实现的技术架构选型

---  

可以，我建议这套平台先按 **TypeScript 主服务 + Python 音频/评测服务 + JSON Schema 协议治理** 来做。核心目标是：接厂商快、扩展不乱、Benchmark 可复现。

**推荐总架构**

```txt
Frontend/Admin
  Next.js + React + shadcn/ui

API / TTS Facade
  TypeScript + Fastify
  Zod / TypeBox + Ajv
  OpenAPI

Provider Adapter Runtime
  TypeScript
  每个 vendor 一个 package
  每个 vendor 暴露 capabilities + extension schema + planner + executor

Job / Workflow
  MVP: BullMQ + Redis
  中后期: Temporal

Storage
  Postgres: 元数据、任务、计划、结果、能力快照
  S3/R2/MinIO: 原始音频、标准化音频、波形文件
  Redis: 队列、限流、短缓存

Audio/Eval Service
  Python + FastAPI
  FFmpeg
  librosa / soundfile / pyloudnorm
  后续接 ASR、MOS、pronunciation eval

Observability
  OpenTelemetry
  Prometheus + Grafana
  Sentry
  structured logs
```

官方资料上，Fastify 当前文档强调其 TypeScript 支持和 JSON Schema 路由能力，适合做这个 Facade API；Ajv 是成熟的 JSON Schema validator；BullMQ 是 Redis 上的 Node.js 队列，支持并发、重试、延迟任务、定时任务；Temporal 的 TypeScript SDK 适合后期把复杂 Benchmark workflow 做成可恢复、可追踪的长流程。参考：[Fastify docs](https://fastify.dev/docs/latest/)、[Ajv docs](https://ajv.js.org/)、[BullMQ docs](https://docs.bullmq.io/)、[Temporal TS docs](https://docs.temporal.io/develop/typescript)。

**主语言选型**

我会把 **TypeScript 作为控制面和接入层主语言**。

原因很直接：

```txt
TTS 厂商接入本质是 JSON/HTTP/SDK orchestration
vendor extension 天然是 JSON schema
前端可以复用 schema 动态生成高级参数表单
adapter 可以保留强类型
比 Python 更适合长期工程治理
比 Go/Rust 更适合快速扩展厂商参数
```

Python 不做主 Facade，而是做音频和评测服务。这样边界干净：

```txt
TypeScript: 请求、能力、适配、任务、审计、Benchmark 编排
Python: 音频处理、指标计算、模型评测、离线分析
```

**后端框架**

推荐：

```txt
Fastify > NestJS > Express
```

我的首选是 **Fastify**。

原因：

```txt
轻
快
TypeScript 友好
原生契合 JSON Schema
适合做清晰的 Facade API
```

NestJS 更适合大团队、强规范、企业后端，但会更重。你这个项目的核心不在 MVC/DI，而在 adapter contract 和 schema governance，所以 Fastify 更舒服。

**协议与校验**

核心协议建议这样定：

```txt
Canonical TTS schema: 平台统一请求
Vendor extension schema: 每个厂商自己的扩展参数
Capability schema: 每个厂商能力声明
Synthesis plan schema: 每次调用实际执行计划
Mapping report schema: 参数映射和损耗记录
```

工具选型：

```txt
TypeBox 或 Zod: 写 TS 类型
Ajv: 运行时 JSON Schema 校验
OpenAPI: 对外 API 文档
```

如果你更看重 JSON Schema 原生能力，选 **TypeBox + Ajv**。  
如果你更看重开发体验，选 **Zod**，再导出 OpenAPI/JSON Schema。

我个人建议：

```txt
核心协议: TypeBox + Ajv
业务 DTO: Zod 可选
```

因为 vendor extension schema 最终要给前端、后端、测试、文档共同使用，JSON Schema 是更稳定的中间语言。

**Adapter 组织方式**

代码结构可以这样：

```txt
packages/
  tts-core/
    request.ts
    result.ts
    capability.ts
    plan.ts
    mapping-report.ts

  tts-facade/
    facade.ts
    provider-registry.ts
    planner.ts
    validator.ts

  adapters/
    openai/
      adapter.ts
      capabilities.json
      extension.schema.json
      examples/
      tests/

    azure/
    elevenlabs/
    minimax/
    volcengine/
```

每个 adapter 必须实现：

```ts
interface TTSAdapter<TVendorParams = unknown> {
  providerId: string
  adapterVersion: string

  getCapabilities(): Promise<TTSCapabilities>
  getExtensionSchema(): Promise<VendorExtensionSchema>

  validate(request: TTSRequest): Promise<ValidationResult>
  plan(request: TTSRequest): Promise<SynthesisPlan<TVendorParams>>
  synthesize(plan: SynthesisPlan<TVendorParams>): Promise<TTSProviderResult>
}
```

这套里面最重要的是 `plan()`，不是 `synthesize()`。

`plan()` 负责把平台请求变成厂商请求，并产出：

```txt
raw vendor request
applied canonical fields
applied vendor extensions
ignored fields
approximated fields
warnings
capability snapshot
adapter version
estimated cost
```

Benchmark 后面可信不可信，全靠这里。

**异步任务选型**

MVP 阶段：

```txt
BullMQ + Redis
```

足够了，尤其适合：

```txt
批量 TTS
每个 vendor 独立队列
并发限制
失败重试
超时
速率限制
任务状态查询
```

但要把业务抽象写成 workflow-like，不要把逻辑散在 worker 里。

后期如果出现这些需求，再上 Temporal：

```txt
一次 Benchmark 跑几小时/几天
需要暂停、恢复、补跑
多步骤状态必须可靠
跨服务重试很复杂
任务可观测性要求高
```

所以路线是：

```txt
0-1: BullMQ
规模化 Benchmark: Temporal
```

**数据库选型**

推荐：

```txt
Postgres
```

核心表：

```txt
providers
provider_capability_snapshots
provider_credentials
voices
tts_requests
synthesis_plans
tts_jobs
tts_results
audio_assets
benchmark_runs
benchmark_items
mapping_reports
cost_records
```

JSON 字段用 `jsonb` 存这些：

```txt
canonical_request
vendor_extension
raw_vendor_request
raw_vendor_response_metadata
mapping_report
capability_snapshot
```

为什么不是 MongoDB？  
因为你还有任务状态、Benchmark run、用户、项目、成本、榜单、审计，这些关系型建模很多。Postgres + jsonb 正好吃下两边。

**音频存储**

不要把音频塞数据库。

用：

```txt
S3 / Cloudflare R2 / MinIO
```

保存两份：

```txt
original_audio: 厂商原始返回
normalized_audio: 平台标准化版本
```

标准化建议：

```txt
wav
mono
24kHz 或 48kHz
响度归一化
去除异常首尾静音可选
```

但注意：Benchmark 要同时保留原始音频和标准化音频。原始音频用于审计，标准化音频用于统一评测。

**Python 音频服务**

建议单独服务：

```txt
audio-service
  FastAPI
  FFmpeg
  librosa
  soundfile
  pyloudnorm
```

提供接口：

```txt
POST /normalize
POST /analyze
POST /waveform
POST /objective-metrics
POST /asr-check
```

返回：

```txt
duration
sample_rate
channels
loudness
silence_ratio
clipping
snr estimate
waveform peaks
spectrogram metadata
```

不要把这些都塞进 Node worker。Node 负责 orchestration，Python 负责音频能力。

**凭证和安全**

MVP：

```txt
Postgres 存 encrypted credential
envelope encryption
每个 provider credential profile
```

生产：

```txt
AWS KMS / GCP KMS / Vault
```

鉴权模式要支持两种：

```txt
platform-managed key
BYOK: 用户自己的 vendor key
```

每次调用记录：

```txt
credential_profile_id
provider
project_id
estimated_cost
actual_usage
request hash
```

不要记录明文 key，不要把 key 注入日志。

**观测与审计**

必须从第一天做：

```txt
request_id
job_id
benchmark_run_id
provider
adapter_version
capability_snapshot_id
latency
first_byte_ms
total_ms
retry_count
error_type
cost_estimate
```

错误模型统一：

```txt
ValidationError
CapabilityError
VendorAuthError
VendorRateLimitError
VendorTimeoutError
VendorBadResponseError
AudioProcessingError
InternalError
```

这样以后 Benchmark 报告才能解释“为什么这个厂商失败率高”。

**部署选型**

MVP 最简单：

```txt
Docker Compose
  api
  worker
  audio-service
  postgres
  redis
  minio
```

生产：

```txt
Kubernetes / ECS / Fly.io Machines / Render private services
```

如果你们团队不想太早上 K8s，我建议：

```txt
API + Worker: ECS/Fargate 或 Render
Postgres: managed
Redis: managed
Object Storage: S3/R2
Audio Service: container service
```

**最终推荐栈**

我的明确建议是：

```txt
Frontend: Next.js + React + shadcn/ui
API: TypeScript + Fastify
Schema: TypeBox + Ajv + OpenAPI
Adapter: TypeScript monorepo packages
Queue: BullMQ + Redis
Workflow later: Temporal
DB: Postgres + jsonb
Object Storage: S3/R2/MinIO
Audio Service: Python + FastAPI + FFmpeg
Observability: OpenTelemetry + Prometheus/Grafana + Sentry
Deployment MVP: Docker Compose
Deployment Prod: managed Postgres/Redis + container services
```

这套架构的核心好处是：**Facade 稳定，Vendor 能扩展，Benchmark 可审计，后续 Arena 也能复用同一套合成底座**。

## Q5

你这做的有点大而全了, 我刚开始肯定用不着这么大而全, 存储直接文件系统, 不需要队列, 数据库甚至可选sqlite或者简单接入mysql, audio则全都是音频文件或者靠浏览器播放, 不需要什么音频服务等等

---  

对，你这个判断更适合第一版。前面那套是“平台化终局架构”，但你现在真正需要的是 **可快速接厂商、能跑 Benchmark、可追溯参数** 的轻量核心。

我会把 MVP 收敛成这样：

```txt
单体 TypeScript 服务
本地文件系统存音频和 JSON 元数据
SQLite 起步，可切 MySQL
无队列
无独立 audio service
无对象存储
无复杂 workflow
```

**MVP 技术选型**

```txt
Runtime: Node.js + TypeScript
Web/API: Fastify
Schema: TypeBox + Ajv
DB: SQLite，后续可换 MySQL
ORM/Query: Drizzle
Storage: local filesystem
Adapter: TypeScript classes
Frontend: 先可选，管理台可以后置
Audio: 浏览器直接播放生成文件
```

如果你希望更简单：

```txt
Node.js + TypeScript
Fastify
SQLite
本地 files/
```

就够了。

**目录结构**

```txt
tts-benchmark/
  src/
    server.ts

    core/
      types.ts
      facade.ts
      registry.ts
      validator.ts
      planner.ts
      errors.ts

    adapters/
      openai/
        adapter.ts
        capabilities.json
        extension.schema.json
        examples.json

      azure/
        adapter.ts
        capabilities.json
        extension.schema.json

      elevenlabs/
        adapter.ts
        capabilities.json
        extension.schema.json

    storage/
      file-store.ts
      metadata-store.ts

    benchmark/
      runner.ts
      dataset.ts
      report.ts

    routes/
      synthesize.ts
      providers.ts
      benchmark.ts
      files.ts

  data/
    audio/
      original/
      normalized/
    runs/
    datasets/
    reports/

  tts.db
```

第一版甚至可以不做 `normalized/`，先只保留厂商原始音频。

**核心链路**

```txt
POST /v1/tts/synthesize
  -> validate canonical request
  -> validate vendor extension
  -> adapter.plan()
  -> adapter.synthesize()
  -> save audio file
  -> save metadata
  -> return audio url + plan + mapping report
```

这就是第一版最重要的闭环。

**统一请求仍然保留**

不要因为 MVP 简化就去掉核心抽象。请求可以保留这个形态：

```ts
type TTSRequest = {
  input: {
    text: string
    language?: string
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
    format?: "mp3" | "wav"
    sampleRate?: number
  }

  vendor?: {
    mode?: "canonical_only" | "prefer_vendor" | "vendor_required"
    extensions?: Record<string, {
      schemaVersion: string
      params: Record<string, unknown>
    }>
  }
}
```

重点是别省掉：

```txt
vendor.mode
extensions
plan
mappingReport
```

这几个是以后 Benchmark 不变脏的根。

**Adapter 接口可以先很小**

```ts
interface TTSAdapter {
  providerId: string
  adapterVersion: string

  capabilities(): TTSCapabilities
  extensionSchema(): object

  plan(request: TTSRequest): Promise<SynthesisPlan>
  synthesize(plan: SynthesisPlan): Promise<SynthesisOutput>
}
```

不用一开始搞 healthCheck、estimateCost、streaming、voice registry。  
但 `plan()` 必须有。

**本地文件存储设计**

生成一次 TTS，落盘：

```txt
data/runs/{runId}/
  request.json
  plan.json
  mapping-report.json
  vendor-request.json
  vendor-response.json
  audio.mp3
```

这样你甚至可以先不依赖数据库。

如果要 SQLite，就只存索引：

```txt
runs
  id
  provider
  model
  voice
  text_hash
  status
  audio_path
  created_at
  latency_ms

run_metadata
  run_id
  request_json
  plan_json
  mapping_report_json
  vendor_request_json
  vendor_response_json
```

文件系统是真相来源，SQLite 做查询索引。这个对 MVP 很舒服。

**Benchmark 第一版**

第一版 Benchmark 不需要复杂系统。

一个 dataset 文件就行：

```json
{
  "id": "zh-cn-basic-v1",
  "items": [
    {
      "id": "001",
      "text": "欢迎使用智能语音服务。",
      "language": "zh-CN",
      "tags": ["customer-service"]
    }
  ]
}
```

一个 benchmark 配置：

```json
{
  "id": "basic-fair-run",
  "dataset": "zh-cn-basic-v1",
  "targets": [
    {
      "provider": "openai",
      "model": "tts-1",
      "voice": "alloy"
    },
    {
      "provider": "elevenlabs",
      "model": "eleven_multilingual_v2",
      "voice": "xxx"
    }
  ],
  "vendorMode": "canonical_only",
  "output": {
    "format": "mp3"
  }
}
```

Runner 就是一个简单循环：

```txt
for item in dataset:
  for target in targets:
    call facade.synthesize()
    save result
```

不需要队列。最多做一个并发参数：

```txt
concurrency = 1 | 2 | 4
```

默认先 `1`，保证可控。

**Web UI 也可以极简**

第一版只需要三个页面：

```txt
1. Providers
   查看厂商、capabilities、extension schema

2. Synthesize
   输入文本、选择 provider/model/voice、填写 vendor extension JSON、生成音频

3. Runs
   查看历史记录、播放音频、查看 request/plan/mapping report
```

Benchmark 页面可以后置，先用 CLI 跑都行。

**MVP 不做这些**

我建议明确不做：

```txt
不做队列
不做 Temporal
不做对象存储
不做独立 audio service
不做自动音频质量分析
不做复杂用户权限
不做云端多租户
不做实时 streaming
不做 voice registry 大系统
```

这些都可以长出来，但现在别让它们拖慢抽象验证。

**第一版真正要做扎实的东西**

只做 5 件事：

```txt
1. Facade 请求协议
2. Adapter contract
3. Vendor extension schema 校验
4. Synthesis plan + mapping report
5. 文件系统保存完整调用记录和音频
```

这五个做好，你的底座就稳。

**我建议的最小落地栈**

```txt
TypeScript
Fastify
TypeBox + Ajv
Drizzle + SQLite，可选
Local filesystem
pnpm workspace，可选
Vitest
```

如果再极简一点：

```txt
TypeScript
Fastify
Ajv
Local filesystem
Vitest
```

数据库都可以第二步再加。

一句话：  
先做一个 **“单体 Facade + Adapter 插件 + 本地 run archive”**。它小，但结构别歪。等你确认 3-5 个厂商能被这套模型舒服接住，再补数据库、队列、对象存储和评测服务。

## Q6

模型需要再改一下, 上边说的是 TTS 模型, 但是也只是HTTPSync方式, 其实还有流式模型, 使用ws协议. 而且除了 TTS合成, 大部分时候, 还有音色克隆的请求.

---  

对，这个补充很关键。原来的模型把 `synthesize()` 默认成了 **HTTP 同步合成**，但真实 TTS 平台底层至少有三类能力：

```txt
1. HTTP Sync TTS: 一次请求，一次返回完整音频
2. Streaming TTS: WebSocket / SSE / HTTP chunk，边生成边返回
3. Voice Clone: 上传/引用音频，创建或临时使用音色
```

所以抽象要从“一个 TTS 合成接口”改成 **TTS Capability Facade**，下面分多个 operation。

**新的核心抽象**

不要让 Adapter 只有一个 `synthesize()`，而是这样：

```ts
interface TTSAdapter {
  providerId: string
  adapterVersion: string

  capabilities(): TTSCapabilities
  extensionSchema(operation: TTSOperation): object

  plan(request: TTSRequest): Promise<TTSPlan>

  synthesizeSync?(plan: TTSSyncPlan): Promise<TTSSyncResult>

  synthesizeStream?(plan: TTSStreamPlan): AsyncIterable<TTSStreamEvent>

  createVoiceClone?(request: VoiceCloneRequest): Promise<VoiceCloneResult>

  deleteVoiceClone?(voiceId: string): Promise<void>
}
```

核心变化是：  
**Facade 统一 operation 生命周期，不假设所有 TTS 都是 HTTP sync。**

**Operation 类型**

```ts
type TTSOperation =
  | "tts.sync"
  | "tts.stream"
  | "voice.clone.create"
  | "voice.clone.delete"
  | "voice.clone.instant"
```

这里建议把音色克隆分成两种：

```txt
persistent clone:
  先创建 voice，拿到 voiceId，后续合成复用

instant clone:
  合成请求里带 reference audio，不持久创建 voice
```

很多厂商会在这两种模式上差异很大。

**TTS 请求需要加 mode**

```ts
type TTSRequest = {
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

  stream?: {
    protocol?: "ws" | "sse" | "http_chunk"
    chunkFormat?: "pcm" | "mp3" | "opus"
    enableTimestamps?: boolean
  }

  voiceClone?: {
    mode?: "none" | "instant" | "persistent"
    voiceId?: string
    referenceAudioIds?: string[]
  }

  vendor?: VendorDirective
}
```

这样上层仍然只打 Facade，但可以明确声明：

```txt
我要同步合成
我要流式合成
我要使用已有克隆音色
我要带参考音频即时克隆
```

**Facade 层接口可以分开**

对上层暴露不要只有一个方法，建议这样：

```ts
interface TTSFacade {
  synthesize(request: TTSSyncRequest): Promise<TTSSyncResult>

  stream(request: TTSStreamRequest): Promise<TTSStreamSession>

  createVoiceClone(request: VoiceCloneRequest): Promise<VoiceCloneResult>

  listVoices(query: VoiceQuery): Promise<Voice[]>

  getCapabilities(providerId: string): Promise<TTSCapabilities>
}
```

为什么不用一个万能 `execute()`？  
因为同步返回、流式会话、克隆任务的生命周期不同。Facade 可以统一底层治理，但对上层 API 最好保持语义清楚。

**流式模型怎么抽象**

流式不要直接暴露 vendor WebSocket。你应该让 Facade 做一层代理：

```txt
Client
  -> your TTS Facade WS
    -> Vendor WS / streaming HTTP
      -> audio chunks
```

你自己的 WS 事件格式固定：

```ts
type TTSStreamEvent =
  | {
      type: "session.started"
      sessionId: string
      planId: string
    }
  | {
      type: "audio.chunk"
      seq: number
      audio: Buffer
      format: "pcm" | "mp3" | "opus"
      timestampMs?: number
    }
  | {
      type: "metadata"
      data: Record<string, unknown>
    }
  | {
      type: "warning"
      warning: MappingWarning
    }
  | {
      type: "session.completed"
      durationMs?: number
      audioPath?: string
    }
  | {
      type: "error"
      error: TTSError
    }
```

这样即使 Vendor A 用 WS、Vendor B 用 SSE、Vendor C 用 HTTP chunk，上层也只处理你自己的事件协议。

**流式 Benchmark 要单独记录指标**

同步 TTS 主要看：

```txt
total_latency_ms
audio_duration_ms
cost
success/failure
```

流式 TTS 要多记录：

```txt
connect_latency_ms
first_audio_chunk_ms
chunk_count
avg_chunk_interval_ms
max_chunk_gap_ms
stream_completion_ms
realtime_factor
interruption_support
```

尤其是 `first_audio_chunk_ms`，这是流式 TTS 的核心体验指标。

**Voice Clone 单独建模**

音色克隆不要塞进普通 `voice` 字段里。它是一个资源生命周期。

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

结果：

```ts
type VoiceCloneResult = {
  id: string
  provider: string
  providerVoiceId?: string
  mode: "persistent" | "instant"

  status: "ready" | "processing" | "failed"

  voice?: {
    id: string
    displayName?: string
    language?: string
  }

  plan: VoiceClonePlan
  mappingReport: MappingReport
  rawVendorResponse?: unknown
}
```

MVP 可以先只支持 `persistent`，但协议里最好留好 `instant`。

**Voice Registry 要轻量加上**

即使 MVP 不做复杂 voice registry，也建议有一张/一个 JSON 索引：

```txt
data/voices/{voiceId}.json
```

内容：

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

这样 TTS 合成里 `target.voice` 可以统一引用平台自己的 `voiceId`，再由 Adapter 映射到厂商 voice id。

**Capabilities 也要升级**

能力声明要按 operation 拆：

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

这样 Benchmark 创建任务时可以判断：

```txt
这个 provider 能不能同步
能不能流式
流式走什么协议
支不支持克隆
克隆需要几秒参考音频
是否需要 transcript
```

**MVP 实现顺序**

我建议这样切：

```txt
Phase 1:
  HTTP Sync TTS
  plan + mappingReport
  文件系统保存 run

Phase 2:
  Voice Clone persistent
  本地 voice registry
  cloned voice 用于 sync TTS

Phase 3:
  Streaming TTS
  Facade WS proxy
  记录 first_chunk_ms / chunk intervals

Phase 4:
  Benchmark runner 支持 sync + stream 两种 benchmark
```

别一开始同时做 WS 和克隆，否则底层抽象还没稳定就会变复杂。

**一句话改造**

原来的抽象是：

```txt
TTSAdapter.synthesize(request)
```

现在应该升级成：

```txt
TTSFacade
  - synthesizeSync()
  - synthesizeStream()
  - createVoiceClone()
  - listVoices()

Adapter
  - operation-based capabilities
  - operation-based extension schema
  - operation-based plan
  - sync executor / stream executor / clone executor
```

这样你的 Facade 仍然统一，但不会把 HTTP 同步、WebSocket 流式、音色克隆这三种生命周期硬塞进一个函数里。

## Q7

按照上述对话内容, 总结一下, 把这个稳定内核先定下来

---  

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

## Q8

要不要选next作为主框架呢? next同时负责前端和后端吗?

---  

我不建议一开始把 **Next.js 选成主后端框架**。更推荐：

```txt
Next.js: 前端 / 管理台 / Demo UI
Fastify: TTS Facade API / Adapter Runtime / Benchmark Runner
```

也就是 **Next 负责界面，Fastify 负责真正的 TTS 内核**。

**为什么不让 Next 同时做前后端**

Next 可以写 API Routes / Server Actions，但你的后端不是普通 CRUD，而是：

```txt
厂商 Adapter 管理
HTTP 同步 TTS
未来 WebSocket/流式 TTS
音色克隆
本地文件写入
Benchmark runner
长耗时请求
vendor extension schema 校验
plan / mapping report archive
```

这些更像一个服务型 runtime，而不是页面框架的附属 API。

尤其是流式 TTS 和 WebSocket。Next 能做一些 streaming，但如果你要代理 Vendor WS、管理 session、转发音频 chunk、记录 first chunk latency，Fastify/原生 Node 服务会清楚很多。

**推荐架构**

```txt
apps/
  web/
    Next.js
    - provider 列表
    - synthesize 页面
    - run 详情
    - benchmark 配置页
    - 播放音频

  api/
    Fastify
    - TTS Facade
    - Adapter Registry
    - Capability API
    - Sync TTS
    - Stream WS proxy
    - Voice clone
    - File archive
```

共享类型放在：

```txt
packages/
  core/
    types
    schemas
    adapter contract
```

这样前后端都用同一套协议。

**Next 可以承担什么**

Next 很适合做：

```txt
1. 管理台 UI
2. 动态表单，根据 vendor extension schema 渲染高级参数
3. 音频播放和结果对比
4. Benchmark 结果展示
5. 本地开发时作为一个漂亮的控制台
```

Next 不应该承担：

```txt
1. Vendor Adapter 执行
2. 长时间音频合成调用
3. WebSocket streaming proxy
4. 文件 archive 核心逻辑
5. Benchmark runner
```

**MVP 可以更简单吗**

可以。第一版如果你想极简，有两种路线。

**路线 A：纯 Fastify，暂时不做 Next**

```txt
Fastify API
Fastify 静态页面或 Swagger/简单 HTML
本地 files
CLI benchmark
```

优点是最短路径验证内核。  
缺点是 UI 弱一点。

**路线 B：Next + Fastify monorepo**

```txt
Next 做前端
Fastify 做 API
共享 packages/core
```

这是我更推荐的正式 MVP。

**不推荐路线 C：Next 全包**

```txt
Next pages/app
Next API routes
Server Actions
本地文件
adapter runtime
benchmark runner
stream proxy
```

它前期看起来省一个服务，但后面会卡在 runtime 边界、WS、长任务、文件访问、部署形态上。你这个项目的核心是 TTS runtime，不是网站。

**具体选型**

```txt
pnpm workspace
apps/web: Next.js
apps/api: Fastify
packages/core: TypeScript types + JSON schemas + adapter contracts
data/: 本地 run archive
```

开发时：

```txt
Next dev: localhost:3000
Fastify dev: localhost:4000
```

Next 通过 API 调 Fastify：

```txt
NEXT_PUBLIC_API_BASE_URL=http://localhost:4000
```

生产时也保持两个进程，简单清楚。

**结论**

选 Next，但不要让 Next 当主框架。

我的建议是：

```txt
主内核框架: Fastify
主 UI 框架: Next.js
共享协议: packages/core
```

这样你既能快速做出可用界面，又不会把 TTS Facade、流式代理和厂商接入塞进一个页面框架里。

## Q9

那你说的我其实不如使用 fastify + vue 呢, 因为我对vue熟悉点

---  

对，那就直接用 **Fastify + Vue**，完全合理，而且我觉得对你这个项目更顺手。

Next 的主要价值是 React 生态、SSR、全栈页面路由。但你这个工具平台不是内容站，也不依赖 SSR，核心是一个 **TTS 控制台 + API Runtime**。如果你更熟 Vue，那 Vue 会更快、更稳。

我建议：

```txt
前端: Vue 3 + Vite + TypeScript
UI: Element Plus 或 Naive UI
后端: Fastify + TypeScript
共享协议: packages/core
存储: local filesystem
数据库: 先不加，后续 SQLite/MySQL 可选
```

**推荐结构**

```txt
tts-platform/
  apps/
    api/
      src/
        server.ts
        routes/
        facade/
        adapters/
        storage/

    web/
      src/
        pages/
        components/
        api/
        stores/

  packages/
    core/
      src/
        types.ts
        schemas.ts
        operations.ts
        capabilities.ts
        mapping-report.ts

  data/
    runs/
    voices/
    datasets/
```

**Vue 前端负责**

```txt
Provider 列表
Capabilities 查看
TTS 合成表单
Vendor extension JSON/schema 表单
音频播放
Run 记录详情
Plan / MappingReport 展示
后续 Benchmark 配置
```

**Fastify 后端负责**

```txt
TTS Facade
Vendor Adapter
HTTP Sync TTS
未来 WS Streaming Proxy
Voice Clone
本地文件 archive
Benchmark runner
```

**为什么 Vue 这里没问题**

这个产品不需要 Next 的核心能力：

```txt
不需要 SSR
不需要 SEO
不需要 App Router
不需要 Server Actions
不需要边缘渲染
```

反而更需要：

```txt
清晰的表单
JSON 参数编辑
音频播放
运行记录表格
可视化查看 plan / mapping report
```

这些 Vue + Element Plus/Naive UI 都很合适。

**UI 库建议**

如果你想快：

```txt
Element Plus
```

优点是后台系统感强，表单、表格、弹窗、Tabs、Upload 都现成。

如果你想更现代一点：

```txt
Naive UI
```

风格更清爽，TypeScript 体验也不错。

我会选：

```txt
Vue 3 + Vite + TypeScript + Element Plus
```

因为这个工具平台偏管理台，Element Plus 足够直接。

**最终建议**

定成：

```txt
Fastify + Vue 3 + Vite + TypeScript + Element Plus
```

后端和前端分两个 app，不做“全栈框架绑死”：

```txt
apps/api: Fastify
apps/web: Vue
packages/core: 共享类型和 schema
```

这比 Next 全包更贴合你的熟悉度，也更贴合这个项目的真实形态。

## Q10

那么我这样, 使用 node@24 + pnpm, 使用 pnpm 的workspace, 分别建立前后端项目, 这样codex工作在工作区最外层, 能同时编写控制前后端.

---  

对，这个工作方式很合适，而且很适合让 Codex 在 monorepo 根目录协作。

我建议就定成：

```txt
Node.js 24
pnpm workspace
apps/api: Fastify + TypeScript
apps/web: Vue 3 + Vite + TypeScript + Element Plus
packages/core: 共享类型、schema、adapter contract
data/: 本地运行产物
```

**推荐目录**

```txt
tts-platform/
  package.json
  pnpm-workspace.yaml
  tsconfig.base.json

  apps/
    api/
      package.json
      src/
        server.ts
        routes/
        facade/
        adapters/
        storage/

    web/
      package.json
      src/
        main.ts
        App.vue
        pages/
        components/
        api/

  packages/
    core/
      package.json
      src/
        index.ts
        operations.ts
        requests.ts
        results.ts
        capabilities.ts
        adapter.ts
        mapping-report.ts
        vendor-extension.ts

  data/
    runs/
    voices/
    datasets/
    benchmark-runs/
```

**根目录 package.json**

```json
{
  "name": "tts-platform",
  "private": true,
  "type": "module",
  "packageManager": "pnpm@latest",
  "scripts": {
    "dev": "pnpm -r --parallel dev",
    "dev:api": "pnpm --filter @tts-platform/api dev",
    "dev:web": "pnpm --filter @tts-platform/web dev",
    "build": "pnpm -r build",
    "test": "pnpm -r test",
    "typecheck": "pnpm -r typecheck"
  }
}
```

**pnpm-workspace.yaml**

```yaml
packages:
  - "apps/*"
  - "packages/*"
```

**包命名**

```txt
@tts-platform/core
@tts-platform/api
@tts-platform/web
```

前后端都依赖 core：

```txt
apps/api -> packages/core
apps/web -> packages/core
```

这样协议不会散。

**开发端口**

```txt
api: http://localhost:4000
web: http://localhost:5173
```

Vue 通过环境变量访问 API：

```txt
VITE_API_BASE_URL=http://localhost:4000
```

**Codex 工作方式**

Codex 在 monorepo 根目录最舒服，因为它可以同时改：

```txt
packages/core 的协议
apps/api 的实现
apps/web 的表单和展示
data 的样例 dataset
```

这比前后端分两个仓库好很多。你要改一个字段，比如 `vendor.mode`，Codex 可以一次性更新：

```txt
core type
api validation
adapter plan
web form
run detail view
tests
```

**MVP 初始化顺序**

```txt
1. 初始化 pnpm workspace
2. 建 packages/core，先放稳定内核类型
3. 建 apps/api，Fastify health + providers + synthesize sync
4. 建 apps/web，Vue 管理台骨架
5. 做一个 mock adapter，先不接真实厂商
6. 文件系统保存 run archive
7. 前端能输入文本、选择 mock provider、播放返回音频或查看 run
8. 再接真实 vendor
```

**一个小建议**

第一版一定先做 `mock adapter`。  
它不依赖外部 API key，但能验证：

```txt
request -> plan -> mappingReport -> synthesize -> archive -> web 展示
```

这个闭环跑通后，再接 OpenAI / Azure / ElevenLabs 这类真实厂商。

结论：  
你这个方案就是我会选的落地形态。**Node 24 + pnpm workspace + Fastify + Vue + shared core**，小而稳，Codex 也能在根目录高效一起写前后端。

## Q11

给我生成一个搭建项目的 plan

---  

下面是一套 **从 0 搭建 MVP 项目** 的 plan，按你定下来的技术栈：`Node 24 + pnpm workspace + Fastify + Vue 3 + packages/core + 文件系统 archive`。

**目标形态**

```txt
tts-platform/
  apps/api        Fastify 后端，负责 TTS Facade、Adapter、文件 archive
  apps/web        Vue 3 + Vite 前端，负责控制台
  packages/core   共享类型、schema、adapter contract
  data/           本地 runs / voices / datasets / benchmark-runs
```

**Phase 0: 项目初始化**

1. 创建 monorepo 根目录。
2. 初始化 `package.json`、`pnpm-workspace.yaml`、`tsconfig.base.json`。
3. 固定 Node 版本：`.nvmrc` 或 `.node-version` 写 `24`。
4. 配置根 scripts：

```json
{
  "scripts": {
    "dev": "pnpm -r --parallel dev",
    "dev:api": "pnpm --filter @tts-platform/api dev",
    "dev:web": "pnpm --filter @tts-platform/web dev",
    "build": "pnpm -r build",
    "typecheck": "pnpm -r typecheck",
    "test": "pnpm -r test"
  }
}
```

**Phase 1: 建立 packages/core**

先把稳定内核协议放在 `packages/core`。

文件建议：

```txt
packages/core/src/
  index.ts
  operations.ts
  requests.ts
  results.ts
  capabilities.ts
  vendor-extension.ts
  mapping-report.ts
  adapter.ts
  errors.ts
```

需要定义：

```txt
TTSOperation
TTSSyncRequest
TTSStreamRequest
VoiceCloneRequest
VendorDirective
TTSCapabilities
VendorExtensionSchema
TTSPlan
MappingReport
TTSAdapter
TTSStreamEvent
TTSError
```

这一层只放类型、schema、常量，不依赖 Fastify/Vue。

**Phase 2: 建立 apps/api**

使用 Fastify + TypeScript。

后端目录：

```txt
apps/api/src/
  server.ts
  app.ts

  routes/
    health.ts
    providers.ts
    synthesize.ts
    runs.ts
    voices.ts

  facade/
    tts-facade.ts
    adapter-registry.ts
    request-validator.ts

  adapters/
    mock/
      adapter.ts
      capabilities.ts
      extension-schema.ts

  storage/
    run-archive.ts
    voice-registry.ts
    paths.ts

  utils/
    ids.ts
    json.ts
```

先实现这些 API：

```txt
GET  /health
GET  /v1/providers
GET  /v1/providers/:providerId/capabilities
POST /v1/tts/sync
GET  /v1/runs
GET  /v1/runs/:runId
GET  /v1/runs/:runId/audio
```

第一版先接 `mock adapter`，不接真实厂商。

**Phase 3: 实现 Mock Adapter 闭环**

Mock Adapter 的目标不是生成真实 TTS，而是验证架构链路。

`POST /v1/tts/sync` 流程：

```txt
1. 接收 TTSSyncRequest
2. 校验 provider = mock
3. adapter.plan(request)
4. 生成 TTSPlan + MappingReport
5. adapter.synthesizeSync(plan)
6. 写入 data/runs/{runId}/
7. 返回 result
```

落盘结构：

```txt
data/runs/{runId}/
  request.json
  plan.json
  mapping-report.json
  vendor-request.json
  vendor-response.json
  result.json
  audio.wav 或 audio.mp3
```

Mock 音频可以先用一个固定静音 wav，或者直接返回占位文件。

**Phase 4: 建立 apps/web**

使用 Vue 3 + Vite + TypeScript + Element Plus。

前端目录：

```txt
apps/web/src/
  main.ts
  App.vue

  router/
    index.ts

  api/
    client.ts
    providers.ts
    tts.ts
    runs.ts

  pages/
    ProvidersPage.vue
    SynthesizePage.vue
    RunsPage.vue
    RunDetailPage.vue

  components/
    JsonViewer.vue
    AudioPlayer.vue
    ProviderSelector.vue
    VendorExtensionEditor.vue
```

页面优先级：

```txt
1. SynthesizePage
   输入文本、选择 provider、选择 vendor mode、提交合成

2. RunsPage
   查看历史 run

3. RunDetailPage
   播放音频、查看 request / plan / mapping report

4. ProvidersPage
   查看 capabilities 和 extension schema
```

**Phase 5: 前后端联调**

联调目标：

```txt
1. 前端能请求 GET /v1/providers
2. 前端能提交 POST /v1/tts/sync
3. 后端能生成 run archive
4. 前端能跳转 run detail
5. 前端能播放 /v1/runs/:runId/audio
6. 前端能展示 plan 和 mapping report
```

开发端口：

```txt
api: http://localhost:4000
web: http://localhost:5173
```

前端环境变量：

```txt
VITE_API_BASE_URL=http://localhost:4000
```

**Phase 6: 加入测试**

先写少量关键测试，不追求覆盖率漂亮。

`packages/core`：

```txt
类型导出测试
schema fixture 测试
```

`apps/api`：

```txt
mock adapter plan 测试
mapping report 测试
run archive 写入测试
POST /v1/tts/sync 集成测试
```

工具：

```txt
Vitest
```

**Phase 7: 接第一个真实 Vendor**

等 mock 闭环稳定后再接真实厂商。

第一个真实 Adapter 交付物固定为：

```txt
adapters/{vendor}/
  adapter.ts
  capabilities.ts
  extension-schema.ts
  examples/
```

必须实现：

```txt
capabilities()
extensionSchema("tts.sync")
plan()
synthesizeSync()
```

并且每次调用保存：

```txt
vendor-request.json
vendor-response.json
audio file
mapping-report.json
```

**Phase 8: 增加 Voice Clone 协议骨架**

先不接真实克隆，也可以先加 UI 和接口骨架：

```txt
POST /v1/voices/clone
GET  /v1/voices
GET  /v1/voices/:voiceId
```

文件：

```txt
data/voices/{voiceId}.json
```

先让 mock adapter 支持创建一个 cloned voice record。

**Phase 9: 增加 Streaming 协议骨架**

这一步后置。

先定义：

```txt
GET /v1/tts/stream/ws
```

但 MVP 可以只保留类型和 adapter contract，不急着接真实 WS。

**推荐实施顺序**

```txt
Day 1:
  monorepo + core 类型 + api health + mock adapter

Day 2:
  run archive + /v1/tts/sync + /v1/runs

Day 3:
  Vue 控制台 + 合成页面 + run detail

Day 4:
  测试 + 整理 mapping report + provider capabilities 页面

Day 5:
  接第一个真实 vendor
```

**第一版验收标准**

```txt
1. pnpm dev 能同时启动 api 和 web
2. web 能选择 mock provider 发起一次 sync TTS
3. api 能生成 data/runs/{runId}
4. run 目录包含 request / plan / mapping-report / result / audio
5. web 能播放音频并查看完整审计信息
6. core 类型被 api 和 web 同时引用
```

这个 plan 的关键不是先做多强，而是先把 **request -> plan -> synthesize -> archive -> inspect** 这个内核闭环跑通。

## Q12 

不, 先给我一个 AGENTS.md 再给我一个 Plan 都要markdown文件

---  