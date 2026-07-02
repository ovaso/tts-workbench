# TTS Workbench Project Memory

## 当前项目状况和进展

- 已建立 pnpm workspace Skeleton。
- 根目录包含 `package.json`、`pnpm-workspace.yaml`、`tsconfig.base.json`、`.node-version`、`.gitignore`。
- `packages/core` 已建立共享契约层，包含 operation、request、result、capability、vendor extension、mapping report、adapter contract、error model。
- `packages/core` 已吸收 `CORE_DESIGN.md` 中适合当前阶段的能力维度：扩展音频格式、stream 偏好、voice clone consent/reference audio 元数据、细化 capability、显式 vendor feature flags、vendor model capabilities、plan-first clone/delete adapter contract。
- `apps/api` 已建立 Fastify + TypeScript 后端骨架，并按当前架构边界使用 Vite Vanilla 模式作为默认 build 工具。
- `apps/api` 已包含 mock adapter、adapter registry、TTS facade、run archive、health/provider/sync/runs routes。
- `apps/web` 已建立 Vue 3 + Vite + TypeScript + Pinia + VueRouter + Vuetify 控制台骨架。
- 前后端通信源码已统一通过 `ky` 封装，Web 不直接在业务 API client 中使用裸 `fetch`。
- `data` 目录已建立 `runs`、`voices`、`datasets`、`benchmark-runs` 占位目录。
- 已生成 `pnpm-lock.yaml`。

## 当前步骤所做内容

- 实现 mock sync TTS 最小闭环：
  - request validation
  - adapter plan
  - mapping report
  - mock wav audio generation
  - filesystem run archive
  - run detail and audio route
- Web 控制台已支持：
  - provider 列表和 capability JSON 查看
  - mock sync TTS 表单
  - vendor extension JSON 输入
  - run 列表
  - run detail 中播放 audio 和查看 request、plan、mapping report、result、vendor request、vendor response
- 已添加匹配单元测试：
  - core contract tests
  - mock adapter plan/audio tests
  - run archive file contract test
  - API route test
  - Web API client test
- 已为 core 契约补充测试，覆盖 richer audio output、stream preferences、reference audio format、plan-first clone execution、stream event lifecycle。
- Adapter capability 现在必须声明 `vendorFeatures`，用于表达厂商是否支持 HTTP TTS、流式 TTS、持久/即时音色复刻、删除复刻音色；这些是 vendor-owned facts，不由客户端请求决定，并随 adapter 实例注册进入 facade。
- Adapter capability 现在必须声明 `vendorModels`，模型同样属于 vendor：每个模型声明支持的 operation、canonical model capability（如 text/SSML、输出格式、采样率、controls、clone 限制）以及模型专属 `vendorModelFeatureSchema`。
- `TTSSyncRequest` 和 `TTSStreamRequest` 已补 `ssml?: string`；是否可用由选定 vendor model capability 决定。
- Vendor/model capability 中的支持项只是静态事实，不等于本次请求开启；只有 request 中出现的字段才视为启用。request 未配置的选项使用 vendor/model default configuration；request 配置但当前 vendor/model 不支持的字段写入 mapping report 的 ignored fields，并使用厂商默认值。
- 已新增 MiniMax adapter 初版：
  - 注册 providerId `minimax`
  - 声明 `speech-2.8-*`、`speech-2.6-*`、`speech-02-*`、`speech-01-*` vendor models
  - 声明 HTTP TTS、WebSocket TTS、持久音色复刻 capability
  - 实现 `tts.sync` plan/mapping 和真实 HTTP `/v1/t2a_v2` 执行
  - 支持 `MINIMAX_API_KEY`，测试通过 injectable fetch 避免真实网络调用
  - 支持 MiniMax vendor extension：`pronunciation_dict`、`timbre_weights`、`language_boost`、`voice_modify`、`subtitle_enable`、`subtitle_type`、`output_format`、`aigc_watermark`

## 验证结果

- `pnpm install` 成功。
- `pnpm typecheck` 通过。
- `pnpm test` 通过。
- `pnpm build` 通过。

## 缺陷和风险点

- Web 当前是 Skeleton 控制台，表单校验和错误展示仍较轻。
- Web build 阶段有 Vuetify/MDI 首包大于 500 kB 的常规提示，后续可通过图标按需加载或路由切分优化。
- Voice clone 和 streaming 目前只在 core contract/capability 中保留边界，尚未实现 route 与 mock lifecycle。
- Adapter contract 已要求 voice clone/delete consume plan，但 API facade 和 mock adapter 尚未实现 voice clone/stream 执行链路。
- Run archive 当前仍主要服务 `tts.sync`，尚未扩展到 `tts.stream` 和 `voice.clone.*` 的多步骤 vendor request/response 记录。
- MiniMax 当前只实现 HTTP sync TTS 执行；WebSocket TTS 和 voice clone 已声明 capability，但执行链路、route/archive/workflow 尚未实现。
- 当前 run archive 是本地文件系统事实来源，尚未建立索引层。

## 下一步内容或计划内容

- 继续加强 sync TTS 请求 schema 校验，可考虑引入轻量 schema 定义，但不要让 vendor 参数污染 canonical request。
- 增加 voice clone mock skeleton：
  - `POST /v1/voices/clone`
  - `GET /v1/voices`
  - `data/voices/{voiceId}.json`
- 扩展 run archive 类型和实现，使 voice clone 能保存 upload/clone/delete 等 vendor workflow steps。
- 增加 streaming contract 对应的 route skeleton，但不要急于接真实 WebSocket 厂商。
- MiniMax 下一步补 WebSocket `task_start/task_continue/task_finish` 到 `TTSStreamEvent` 的适配。
- MiniMax 下一步补 voice clone 的 `/v1/files/upload` + `/v1/voice_clone` 多步骤 workflow archive。
- MiniMax 后续可继续细化文档字段的 extension schema 校验。
- 为 Web 增加更明确的 loading/empty/error 状态和 run detail 文件下载入口。

## 推荐内容

- 后续新增真实厂商时，必须走 adapter implementation、capabilities、extension schema、plan/mapping test 或 fixture。
- 保持 API route handler 只做校验和编排，厂商专有逻辑继续放入 adapter。
- 保持 API 默认 build 使用 Vite Vanilla 模式，`tsc --noEmit` 仅作为类型检查。
- 保持前后端通信通过 `ky`，新增 API client 时复用 `apps/web/src/api/client.ts`。
