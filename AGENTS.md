# AGENTS.md

## 作用

这个文件用于约束后续 agent 和协作者在本仓库中的工作方式、架构底线和实现风格。

具体里程碑、实施顺序、任务拆分放在 `PLAN.md`。不要把项目计划写进本文件。

## 项目一句话

这是一个轻量 TTS 厂商接入 Facade 项目，目标是为 TTS 合成、流式合成、音色克隆和后续 Benchmark/Arena 提供同一套稳定底层接入内核。

## 固定技术边界

- 使用 Node.js 24。
- 使用 pnpm workspace。
- 后端使用 Fastify + TypeScript, 使用 Vite 的 Vanilla 模式。
- 测试统一使用 Vitest。
- 前端使用 Vue 3 + Vite + TypeScript + Pinia + VueRouter + Vuetify。
- 前后端通信交互使用 ky 框架。
- 共享协议和类型放在 `packages/core`。
- MVP 阶段以本地文件系统作为 run archive 的事实来源。
- SQLite/MySQL 可以后续作为索引层加入，但不要替代文件系统 archive。

## ENV 宿主机环境和工具

Toolchain：

- node@24
- pnpm

优先使用本机环境。本机安装有如下工具：

- `ast-grep`：用于重构代码结构和修改代码。
- `fd`：用于查找文件。
- `ffmpeg`：用于处理音视频等多媒体内容。
- `fzf`：用于快速模糊搜索文件。
- `git-cliff`：用于总结变更日志。
- `jd`：用于对比 JSON，即 JSON diff。
- `jq`：用于格式化 JSON，或快速查找 JSON 节点、遍历 JSON。
- `ripgrep`：用于快速查找工作区文件内容。
- `sqlite`：用于操作 SQLite 数据库。
- `wrk`：用于快速生成压测内容。

其中部分工具可以配合使用，以提高效率。

## 仓库职责边界

推荐长期保持以下边界：

```txt
apps/api
  Fastify 后端、TTS Facade、Adapter Registry、厂商调用、文件 archive

apps/web
  Vue 控制台、表单、音频播放、运行记录查看、JSON 审计信息展示

packages/core
  共享类型、schema、operation、capability、adapter contract、mapping report

data
  本地 runs、voices、datasets、benchmark-runs
```

`packages/core` 只能放共享契约，不能依赖 Fastify、Vue、Node 文件系统 API 或厂商 SDK。

## 稳定内核原则

所有实现都应围绕以下内核展开：

```txt
基于 operation 的 TTS Facade
基于 Adapter 的厂商接入
由 Schema 治理的厂商扩展
由 Capability 驱动的能力发现
Plan-first 执行模式
基于 MappingReport 的审计
基于文件系统的可复现 archive
```

不要为了短期接入某个厂商绕开这些内核约束。

## Operation 约束

不要把 TTS 设计成只有一次 HTTPS 同步调用。

底层抽象必须能容纳：

- `tts.sync`：HTTP 同步合成
- `tts.stream`：WebSocket/SSE/HTTP chunk 等流式合成
- `voice.clone.create`：持久化音色克隆
- `voice.clone.instant`：带参考音频的即时音色克隆
- `voice.clone.delete`：删除克隆音色

即使某些 operation 暂时没有实现，也不要在类型和 adapter contract 上堵死未来扩展。

## Facade 约束

Facade 对上层统一，但不要把不同生命周期硬塞进同一个函数。

推荐形态：

```ts
interface TTSFacade {
  synthesizeSync(request: TTSSyncRequest): Promise<TTSSyncResult>;
  synthesizeStream(request: TTSStreamRequest): Promise<TTSStreamSession>;
  createVoiceClone(request: VoiceCloneRequest): Promise<VoiceCloneResult>;
  listVoices(query?: VoiceQuery): Promise<VoiceRecord[]>;
  getCapabilities(providerId: string): Promise<TTSCapabilities>;
}
```

同步合成、流式合成、音色克隆的生命周期不同，实现时要保持边界清楚。

## Adapter 约束

每个厂商必须通过 Adapter 接入。

Adapter 至少应遵守以下形态：

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

`plan()` 是硬要求，不要跳过。

`plan()` 必须在调用厂商前完成：

- canonical request 到 vendor request 的映射
- capability snapshot 记录
- vendor extension 应用
- ignored fields 记录
- approximations 记录
- warnings 记录

## Vendor Extension 约束

不要把所有厂商能力压成最低公分母。

平台统一字段只表达共同能力，厂商专有能力通过 vendor extension 表达：

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

模式含义必须保持稳定：

- `canonical_only`：只使用平台统一字段，适合公平 Benchmark。
- `prefer_vendor`：允许厂商扩展，不可用时可降级，适合探索实际最佳效果。
- `vendor_required`：必须使用厂商扩展，不支持就失败，适合测试厂商专有能力。

`Record<string, unknown>` 只允许出现在 vendor extension 这类明确边界处，不要扩散到核心业务对象里。

## Capability 约束

能力声明必须按 operation 组织。

不要只声明“支持 TTS”这种粗粒度能力。至少要区分：

- 是否支持同步合成
- 是否支持流式合成
- 流式传输协议
- 支持的输出格式
- 支持的 sample rate
- 是否支持音色克隆
- 音色克隆是 persistent 还是 instant
- 是否需要 transcript
- canonical controls 的支持情况
- vendor extension schema

## MappingReport 约束

每次真实或 mock 执行都必须生成 mapping report。

Mapping report 至少包含：

- 已应用的 canonical 字段
- 已应用的 vendor extension
- 被忽略字段及原因
- 被近似映射字段、请求值、实际值及原因
- warnings

Benchmark 结果是否可信，主要依赖这份报告。

## 文件系统 Archive 约束

MVP 阶段，文件系统是事实来源。

每次合成至少保存：

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

要求：

- JSON 尽量保持可读格式。
- 不要只保存最终音频。
- 不要丢弃 vendor request 和 vendor response。
- 不要让数据库成为唯一事实来源。

## 前端约束

前端只做控制台和查看器，不做厂商执行逻辑。

前端可以负责：

- provider/capability 展示
- TTS 合成表单
- vendor extension JSON 编辑
- 音频播放
- run 列表
- run detail
- request、plan、mapping report、result 的 JSON 展示

前端不能负责：

- 厂商鉴权
- 厂商 API 调用
- adapter plan
- run archive 写入

## 后端约束

后端负责所有执行链路：

- adapter registry
- request validation
- operation planning
- vendor execution
- run archive
- audio file serving

不要把厂商专有逻辑写进 route handler。厂商专有逻辑必须进入对应 adapter。

## Mock Adapter 约束

在接真实厂商前，必须保留一个可用的 mock adapter。

Mock adapter 不依赖外部 API key，用来验证：

```txt
request -> plan -> mappingReport -> synthesize -> archive -> 前端查看
```

后续改动如果破坏 mock 闭环，视为破坏基础内核。

## 禁止过早引入的东西

除非用户明确要求或当前任务确实需要，不要主动引入：

- 队列系统
- Temporal
- 对象存储
- 独立音频处理服务
- 大型权限系统
- 大型观测系统
- 微服务拆分
- 复杂数据库建模
- 云部署脚手架

这些可以后续增长，但不属于稳定内核的第一层。

## 新增真实厂商的底线

新增真实厂商时，不要只写一个 API 调用函数。

至少需要包含：

- adapter implementation
- capabilities
- extension schema
- examples
- plan/mapping 相关测试或 fixture

真实厂商调用必须经过相同的 Facade、plan、mapping report 和 archive 流程。

同时, 按照文档, 生成一份完整的厂商接口文档, 如 `Contract.md`, 内部分章节, HTTP 则列出完整 contract. json, 假如是 ws, 则画出 mermaid 时序图和帧内容格式等.

## 修改原则

- 优先保持核心契约稳定。
- 优先修改共享类型，再同步修改 API 和 Web。
- 不要让某个厂商的特殊参数污染 canonical request。
- 不要为了 UI 方便削弱 adapter contract。
- 不要为了快速跑通跳过 archive 和 mapping report。
- 小步提交、可验证、可回滚。
- 修改或添加, 必须添加注释, 简单方法添加方法签名(出入参, 方法功能), 复杂方法另加逐行注释, 要求为全中文。
- 每次修改, 必须建立与之匹配的单元测试。
- 项目根目录下建立 memory 目录, 用于记录项目记忆, 其内容包括, 当前项目状况和进展, 当前步骤所做内容, 缺陷和风险点, 下一步内容或计划内容, 推荐内容。Memory 按照日期进行命名, 同一天内, 则按顺序往文件下方追加, 隔天则创建新的文件. 内容规则按照 “Memory 的构建规则” 章节构建和整理

## Memory 的构建规则

不要所有的都杂糅到一起, 当在同一天时, 按规则, Memory 都记录在同一天的文件里. 但是需要按照一次一划分. 即按照二级标题划分, 二级标题下方首先是三级标题, 三级标题下方, 追加总结的提问和更改方向. 随后再一个三级标题, 此处则是 “当前项目状况和进展, 当前步骤所做内容, 缺陷和风险点, 下一步内容或计划内容, 推荐内容” 这几个细分记忆
