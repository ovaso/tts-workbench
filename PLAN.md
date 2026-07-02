# 项目搭建计划

## 目标

搭建轻量 TTS 厂商接入 Facade 平台的第一个 MVP。

第一目标不是完成最终 Benchmark 或 Arena 产品，而是证明稳定内核：

```txt
request -> plan -> mapping report -> vendor/mock execution -> filesystem archive -> frontend inspection
```

## 目标技术栈

```txt
Node.js 24
pnpm workspace
TypeScript
Fastify 后端
Vue 3 + Vite 前端
Element Plus UI
packages/core 共享契约
本地文件系统 archive
Vitest 测试
```

## 目标仓库结构

```txt
tts-platform/
  package.json
  pnpm-workspace.yaml
  tsconfig.base.json
  .node-version

  apps/
    api/
      package.json
      tsconfig.json
      src/
        server.ts
        app.ts
        routes/
        facade/
        adapters/
        storage/
        utils/

    web/
      package.json
      tsconfig.json
      vite.config.ts
      src/
        main.ts
        App.vue
        router/
        api/
        pages/
        components/

  packages/
    core/
      package.json
      tsconfig.json
      src/
        index.ts
        operations.ts
        requests.ts
        results.ts
        capabilities.ts
        vendor-extension.ts
        mapping-report.ts
        adapter.ts
        errors.ts

  data/
    runs/
    voices/
    datasets/
    benchmark-runs/
```

## Phase 0：初始化 Workspace

创建 monorepo 根目录文件：

```txt
package.json
pnpm-workspace.yaml
tsconfig.base.json
.node-version
.gitignore
```

根目录 scripts：

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

Workspace packages：

```yaml
packages:
  - "apps/*"
  - "packages/*"
```

验收标准：

- `pnpm install` 成功。
- 各 package 创建完成后，`pnpm -r typecheck` 可以运行。

## Phase 1：创建 `packages/core`

先创建共享契约包。

定义内容：

- operations
- request types
- result types
- capabilities
- vendor extension model
- mapping report
- adapter contract
- error model

初始文件：

```txt
packages/core/src/operations.ts
packages/core/src/requests.ts
packages/core/src/results.ts
packages/core/src/capabilities.ts
packages/core/src/vendor-extension.ts
packages/core/src/mapping-report.ts
packages/core/src/adapter.ts
packages/core/src/errors.ts
packages/core/src/index.ts
```

Core 只导出契约，不要引入 Fastify、Vue、文件系统 API 或厂商 SDK。

验收标准：

- `@tts-platform/core` 可以 build。
- API 和 Web 都能从它导入类型。

## Phase 2：创建 `apps/api`

创建 Fastify 后端。

初始依赖：

```txt
fastify
@fastify/cors
@fastify/static
tsx
typescript
vitest
```

初始目录：

```txt
apps/api/src/
  server.ts
  app.ts
  routes/
    health.ts
    providers.ts
    synthesize.ts
    runs.ts
  facade/
    tts-facade.ts
    adapter-registry.ts
  adapters/
    mock/
      adapter.ts
      capabilities.ts
      extension-schema.ts
  storage/
    paths.ts
    run-archive.ts
    voice-registry.ts
  utils/
    ids.ts
    json.ts
```

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

验收标准：

- `pnpm dev:api` 在 `http://localhost:4000` 启动 Fastify。
- `GET /health` 返回 OK。
- `GET /v1/providers` 返回 mock provider。

## Phase 3：实现 Mock Adapter

Mock adapter 用来在接真实厂商前证明架构链路。

Mock adapter 必须实现：

- `providerId`
- `adapterVersion`
- `capabilities()`
- `extensionSchema(operation)`
- `plan(request)`
- `synthesizeSync(plan)`

Mock sync execution 可以返回静态占位音频，也可以生成一个最小 WAV。

合成流程：

```txt
POST /v1/tts/sync
  -> validate provider
  -> adapter.plan()
  -> adapter.synthesizeSync()
  -> write run archive
  -> return result
```

验收标准：

- `POST /v1/tts/sync` 使用 provider `mock` 可以成功。
- 创建新的 `data/runs/{runId}` 目录。
- run 目录包含 request、plan、mapping report、result 和 audio。

## Phase 4：实现文件系统 Run Archive

实现 archive storage。

Run 目录：

```txt
data/runs/{runId}/
  request.json
  plan.json
  mapping-report.json
  vendor-request.json
  vendor-response.json
  result.json
  audio.wav
```

规则：

- JSON 使用可读格式。
- 第一个里程碑不要依赖数据库。
- 保存足够信息，让一次 run 可以被复现或审计。

验收标准：

- run detail route 可以读取 archive 文件。
- audio route 可以返回音频文件。
- run 不存在时返回清晰错误。

## Phase 5：创建 `apps/web`

创建 Vue 3 + Vite + TypeScript 前端。

推荐 UI 库：

```txt
Element Plus
```

初始目录：

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

环境变量：

```txt
VITE_API_BASE_URL=http://localhost:4000
```

验收标准：

- `pnpm dev:web` 在 `http://localhost:5173` 启动 Vite。
- Web 能调用 `GET /v1/providers`。
- Web 能展示 mock provider。

## Phase 6：前端合成闭环

实现第一个可用控制台流程。

`SynthesizePage` 支持：

- 文本输入
- provider 选择
- model 输入
- voice 输入
- vendor mode 选择
- vendor extension JSON 编辑
- 提交按钮
- 展示创建的 run ID
- 跳转 run detail

`RunDetailPage` 展示：

- audio player
- request JSON
- plan JSON
- mapping report JSON
- result JSON

验收标准：

- 用户能从 Web UI 提交一次 mock TTS 请求。
- 用户能打开 run detail 页面。
- 用户能播放生成音频。
- 用户能查看 plan 和 mapping report。

## Phase 7：增加最小测试

使用 Vitest。

Core 测试：

- operation 常量和类型可以编译
- sample request fixtures 可以编译

API 测试：

- mock adapter 可以创建 plan
- mapping report 包含 applied canonical fields
- run archive 写入预期文件
- `POST /v1/tts/sync` 返回合法 result

验收标准：

- `pnpm test` 通过。
- `pnpm typecheck` 通过。

## Phase 8：增加第一个真实厂商

只有 mock 流程完整后，才接第一个真实厂商。

每个真实厂商 adapter 必须包含：

```txt
apps/api/src/adapters/{vendor}/
  adapter.ts
  capabilities.ts
  extension-schema.ts
  examples/
```

必须实现：

- `capabilities()`
- `extensionSchema("tts.sync")`
- `plan()`
- `synthesizeSync()`

必须保存的 archive artifacts：

- `vendor-request.json`
- `vendor-response.json`
- audio file
- mapping report

验收标准：

- 真实厂商可以走同一个 `/v1/tts/sync` 路由。
- 厂商专有参数通过 `VendorDirective.extensions` 进入。
- Plan 和 mapping report 能解释实际发送了什么。

## Phase 9：Voice Clone 骨架

先增加协议和 mock 实现，再接真实克隆厂商。

路由：

```txt
POST /v1/voices/clone
GET  /v1/voices
GET  /v1/voices/:voiceId
```

Archive：

```txt
data/voices/{voiceId}.json
```

验收标准：

- mock adapter 可以创建 cloned voice record。
- sync TTS 可以引用本地 `voiceId`。

## Phase 10：Streaming 骨架

在 sync 和 clone 稳定后，再增加 stream contracts 和 route skeleton。

可选路由：

```txt
GET /v1/tts/stream/ws
```

不要急着接真实厂商 WebSocket。

验收标准：

- core 有 stream event contracts。
- adapter contract 支持 `synthesizeStream`。
- 后端可以在不改动 sync TTS contract 的情况下增加 stream route。

## 建议时间线

Day 1：

- workspace 初始化
- `packages/core`
- API health route
- mock provider registry

Day 2：

- mock sync plan
- run archive
- `/v1/tts/sync`
- `/v1/runs`

Day 3：

- Vue app
- synthesize page
- runs page
- run detail page

Day 4：

- tests
- 打磨 plan 和 mapping report
- provider capabilities 页面

Day 5：

- 第一个真实 vendor adapter

## 第一里程碑验收清单

- `pnpm dev` 能启动 API 和 Web。
- API 运行在 `http://localhost:4000`。
- Web 运行在 `http://localhost:5173`。
- Web 能列出 providers。
- Web 能提交 mock sync TTS 请求。
- API 创建 `data/runs/{runId}`。
- Archive 包含 request、plan、mapping report、result、vendor request、vendor response 和 audio。
- Web 能播放 run audio。
- Web 能查看 request、plan、mapping report 和 result。
- `packages/core` 被 API 和 Web 同时使用。
- `pnpm typecheck` 通过。
- `pnpm test` 通过。

