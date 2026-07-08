# Benchmark 阶段一设计与实现说明

## 阶段一目标

阶段一只建立可复现的计划生成闭环：

```txt
Corpus Item -> Corpus Set
Bench Config -> Bench Config Set
Corpus Set x Bench Config Set -> Benchmark Plan
```

本阶段不执行 benchmark job，不采集 TTFB / RTF 等指标，不做并发，也不新增前端页面。

## 已覆盖能力

### Core 契约

- 新增语料契约：`CorpusItem`、`CorpusSet`、`CorpusItemCreateRequest`、`CorpusSetCreateRequest`。
- 扩展 benchmark 契约：`BenchConfigSet`、`BenchmarkPlan`、`BenchmarkPlanJob`、`BenchmarkPlanCreateRequest`。
- `BenchmarkPlanJob.request` 使用现有 canonical `TTSSyncRequest | TTSStreamRequest`，保持后续进入 Facade 的边界稳定。
- 第一阶段 API 只开放 `tts.sync` plan 生成，core 类型保留 `tts.stream` 扩展空间。

### API 文件系统存储

语料保存到：

```txt
data/datasets/
  corpus-items.json
  corpus-sets.json
```

合成配置和配置组合保存到：

```txt
data/bench-configs/
  configs.json
  config-sets.json
```

Benchmark plan 保存到：

```txt
data/benchmark-runs/{planId}/
  benchmark-plan.json
```

后续执行阶段可以在同一个 `benchmark-runs/{planId}` 目录继续追加：

```txt
jobs.json
metrics.json
summary.json
```

## HTTP 接口

### 语料

```txt
GET  /v1/corpus-items
POST /v1/corpus-items
GET  /v1/corpus-sets
POST /v1/corpus-sets
```

### 合成配置

已有接口保留：

```txt
GET  /v1/bench-configs
POST /v1/bench-configs
```

新增配置组合接口：

```txt
GET  /v1/bench-config-sets
POST /v1/bench-config-sets
```

### Benchmark Plan

```txt
GET  /v1/benchmark-plans
GET  /v1/benchmark-plans/{planId}
POST /v1/benchmark-plans
```

`POST /v1/benchmark-plans` 当前只支持：

```json
{
  "displayName": "Smoke benchmark",
  "corpusSetId": "corpus_set_xxx",
  "configSetId": "config_set_xxx",
  "operation": "tts.sync",
  "textMode": "text"
}
```

`textMode` 可选：

- `text`：使用语料纯文本。
- `ssml`：要求语料存在已启用的 `ssml`，并把它写入 canonical request 的 `ssml` 字段。

## 明确延后内容

- Benchmark job 执行器。
- 每个 job 到现有 `TTSFacade.synthesizeSync()` 的调度。
- 单请求指标采集：TTFB、总耗时、音频时长、RTF、大小、错误信息。
- Plan 级指标聚合。
- 中断续跑。
- `tts.stream` benchmark。
- 前端语料和 benchmark 页面。

## 下一阶段建议

第二阶段优先实现：

1. `BenchmarkRunner`：顺序执行 planned jobs，不做并发。
2. `BenchmarkRunArchive`：写入 `jobs.json`、`metrics.json`、`summary.json`。
3. 指标采集：围绕 Facade 调用记录 request start、plan 完成、vendor 开始、首包或响应完成、archive 完成。
4. Mock adapter 闭环测试：验证 plan 中每个 job 都生成普通 `data/runs/{runId}` 归档，同时 benchmark run 聚合引用这些 run。
