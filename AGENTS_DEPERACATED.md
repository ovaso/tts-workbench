# AGENTS.md

## 项目定位

这个仓库用于搭建一个轻量的 TTS 厂商接入门面，以及面向 Benchmark 的工具平台底座。

第一阶段不是做一个大而全的云平台，而是先做一个小而稳定的内核。这个内核需要做到：

- 通过统一 Facade 调用不同 TTS 厂商
- 支持厂商专有扩展参数，但不把厂商差异强行抹平
- 在真正调用厂商之前，生成可审计的执行计划
- 将完整运行产物保存到本地文件系统
- 让未来 Benchmark 和 Arena 都复用同一套 TTS 接入层

## ENV 宿主机环境和工具

Toolchain:
- node@24
- pnpm

优先使用本机环境, 本机安装有如下工具
- ast-grep 用于重构代码结构和修改代码
- fd 用于查找文件
- ffmpeg 用于处理音视频等多媒体内容
- fzf 用于快速模糊搜索文件
- gitcliff 用于总结变更日志
- jd 对比json时使用, jsondiff
- jq 用来将json格式化, 或快速查找json节点或遍历json
- ripgrep 用来快速查找工作区文件内容
- sqlite 用来操作 sqlite 数据库
- wrk 用来快速生成压测内容

其中部分工具可配合使用, 效果更好.

## 当前技术决策

使用 TypeScript monorepo：

```txt
Node.js 24
pnpm workspace
Fastify 后端
Vue 3 + Vite 前端
共享 packages/core
本地文件系统 archive
SQLite/MySQL 后续可选
```

推荐工作区结构：

```txt
tts-platform/
  apps/
    api/
      Fastify 后端

    web/
      Vue 3 + Vite 前端

  packages/
    core/
      共享类型、schema、operation contract、adapter contract

  data/
    runs/
    voices/
    datasets/
    benchmark-runs/
```

## 稳定内核

稳定内核定义为：

```txt
基于 operation 的 TTS Facade
基于 Adapter 的厂商接入
由 Schema 治理的厂商扩展
由 Capability 驱动的能力发现
Plan-first 执行模式
基于 MappingReport 的审计
基于文件系统的可复现 archive
```

第一阶段要保持这个内核小而清晰。不要在第一个里程碑加入队列、对象存储、独立音频服务、多租户权限系统或复杂数据库。

## MVP 范围

- `tts.sync`：HTTP 同步 TTS
- `tts.stream`：先定义协议和 adapter contract，具体实现后置
- `voice.clone.create`：先定义协议和 adapter contract，尽早做 mock 实现
- 厂商 adapter contract
- provider capabilities
- vendor extension schema
- synthesis plan
- mapping report
- 文件系统 run archive
- mock adapter
- 简单 Vue 控制台
- 后续增加基础 benchmark runner

## MVP 不做的事情

- Arena 对战系统
- 任务队列
- Temporal workflow
- 对象存储
- 独立音频处理服务
- 自动客观音频指标
- 复杂 voice registry
- 复杂账号、项目、多租户权限
- 大型可观测性栈
- 生产部署架构

## Core 包职责

`packages/core` 只放共享契约。

它不应该依赖 Fastify、Vue、Node 文件系统 API 或任何厂商 SDK。

建议文件：

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

重要导出概念：

- `TTSOperation`
- `TTSSyncRequest`
- `TTSStreamRequest`
- `VoiceCloneRequest`
- `VendorDirective`
- `TTSCapabilities`
- `VendorExtensionSchema`
- `TTSPlan`
- `MappingReport`
- `TTSAdapter`
- `TTSStreamEvent`
- `TTSError`

## Operation 模型

能力和 schema 都要按 operation 组织。

```ts
type TTSOperation =
  | "tts.sync"
  | "tts.stream"
  | "voice.clone.create"
  | "voice.clone.delete"
  | "voice.clone.instant";
```

不要把系统设计成“所有 TTS 都只是一次 HTTPS 同步调用”。真实厂商可能提供：

- HTTP 同步合成
- WebSocket/SSE/HTTP chunk 流式合成
- 持久化音色克隆
- 带参考音频的即时音色克隆

## Facade 形态

Facade 应该针对不同生命周期暴露不同方法：

```ts
interface TTSFacade {
  synthesizeSync(request: TTSSyncRequest): Promise<TTSSyncResult>;

  synthesizeStream(request: TTSStreamRequest): Promise<TTSStreamSession>;

  createVoiceClone(request: VoiceCloneRequest): Promise<VoiceCloneResult>;

  listVoices(query?: VoiceQuery): Promise<VoiceRecord[]>;

  getCapabilities(providerId: string): Promise<TTSCapabilities>;
}
```

MVP 可以先只实现 `synthesizeSync`，但契约要保持和 stream、voice clone 兼容。

## Adapter 契约

每个厂商 adapter 都应该实现同一套稳定形态：

```ts
interface TTSAdapter {
  providerId: string;
  adapterVersion: string;

  capabilities(): TTSCapabilities;

  extensionSchema(operation: TTSOperation): object;

  plan(request: TTSOperationRequest): Promise<TTSPlan>;

  synthesizeSync?(plan: TTSSyncPlan): Promise<TTSSyncProviderResult>;

  synthesizeStream?(plan: TTSStreamPlan): AsyncIterable<TTSStreamEvent>;

  createVoiceClone?(request: VoiceCloneRequest): Promise<VoiceCloneResult>;

  deleteVoiceClone?(voiceId: string): Promise<void>;
}
```

最重要的方法是 `plan()`，不要跳过。

`plan()` 必须把平台请求转换成厂商请求，并在执行前产出可审计的 mapping report。

## Vendor Extension 模型

不要把所有厂商压缩成最低公分母。

平台统一字段用于描述共同能力，厂商扩展用于描述厂商专有能力。

```ts
type VendorDirective = {
  mode?: "canonical_only" | "prefer_vendor" | "vendor_required";

  extensions?: {
    [providerId: string]: {
      schemaVersion: string;
      params: Record<string, unknown>;
    };
  };
};
```

模式含义：

- `canonical_only`：只使用平台统一字段，适合公平 Benchmark。
- `prefer_vendor`：允许厂商扩展，不可用时可降级，适合探索产品实际最佳效果。
- `vendor_required`：必须使用厂商扩展，不支持就失败，适合测试厂商专有能力。

每个 adapter 应该按 operation 暴露 extension schema。之后前端可以根据这些 schema 渲染高级参数编辑器。

## Planning 与审计

每次执行都必须产出 plan：

```ts
type TTSPlan = {
  id: string;
  operation: TTSOperation;
  provider: string;
  model?: string;
  voice?: string;
  adapterVersion: string;

  canonicalRequest: unknown;
  vendorRequest: unknown;

  capabilitySnapshot: TTSCapabilities;
  mappingReport: MappingReport;

  estimatedCost?: {
    amount: number;
    currency: string;
    unit?: string;
  };
};
```

Mapping report 至少包含：

- 已应用的 canonical 字段
- 已应用的 vendor extension
- 被忽略字段及原因
- 被近似映射字段、请求值、实际值及原因
- warnings

Benchmark 是否可信，主要取决于这份报告。

## 文件系统 Archive

MVP 阶段，文件系统就是事实来源。

推荐 run archive：

```txt
data/runs/{runId}/
  request.json
  plan.json
  mapping-report.json
  vendor-request.json
  vendor-response.json
  result.json
  audio.mp3
```

Archive 文件尽量保持人类可读。

如果后续加入 SQLite/MySQL，它只作为文件系统 archive 的索引，不替代 archive 本身。

## 前端指导

使用 Vue 3 + Vite + TypeScript。

MVP 推荐 UI 库：Element Plus。

初始页面：

- Providers
- Synthesize
- Runs
- Run Detail

前端职责：

- 调用 Fastify API
- 展示 provider capabilities
- 渲染合成表单
- 支持 vendor extension JSON 编辑
- 播放生成音频
- 展示 request、plan、result、mapping report

不要把厂商执行逻辑放到前端。

## 后端指导

使用 Fastify + TypeScript。

初始路由：

```txt
GET  /health
GET  /v1/providers
GET  /v1/providers/:providerId/capabilities
POST /v1/tts/sync
GET  /v1/runs
GET  /v1/runs/:runId
GET  /v1/runs/:runId/audio
```

后端职责：

- adapter registry
- request validation
- operation planning
- vendor execution
- 文件系统 archive
- 提供生成音频文件访问

## 先做 Mock Adapter

在接真实厂商前，必须先实现 mock adapter。

Mock adapter 用于验证：

```txt
request -> plan -> mappingReport -> synthesize -> archive -> 前端查看
```

它不应该依赖外部 API key。

它可以返回固定占位音频，也可以生成一个简单本地 WAV。

## 开发实践

- 从 workspace 根目录工作。
- 优先使用小而明确的模块，避免过早抽象。
- `packages/core` 不要引入应用层依赖。
- 厂商专有行为必须留在 adapter 内。
- 不要让 `Record<string, unknown>` 到处扩散，只在 vendor extension 边界使用。
- 新增厂商时，必须同时提供 capabilities、extension schema、examples、adapter implementation 和 mapping tests。
- 每次合成都要保存完整 run artifacts。
- 在稳定内核被证明之前，不要增加额外基础设施。

## 第一个真实厂商规则

Mock adapter 跑通后，再增加第一个真实厂商。

真实厂商 adapter 至少包含：

```txt
adapter.ts
capabilities.ts
extension-schema.ts
examples/
tests/
```

第一个真实厂商至少实现：

- `capabilities()`
- `extensionSchema("tts.sync")`
- `plan()`
- `synthesizeSync()`

## 第一里程碑验收标准

- `pnpm dev` 能同时启动 API 和 Web。
- Web 能选择 mock provider。
- Web 能提交一次 sync TTS 请求。
- API 能创建 `data/runs/{runId}`。
- run archive 包含 request、plan、mapping report、result 和 audio。
- Web 能播放音频。
- Web 能查看 request、plan 和 mapping report。
- `packages/core` 同时被 `apps/api` 和 `apps/web` 引用。

