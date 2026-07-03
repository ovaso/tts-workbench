# Arena 设计

## 设计目标

Arena 是用于发放语音主观评测问卷、收集偏好结果、对比不同 TTS 结果的评测层。

Arena 的主要数据源可以来自 Bench，但不能被限制为只能消费 Bench。实际使用中，平台可能暂时没有某个厂商的 adapter，或者外部已经快速生成了一批语音样本。此时 Arena 仍应允许这些外部音频按规则打包导入，并进入问卷发放流程。

因此，Arena 需要支持两类一等数据来源：

- `bench_run`：由平台内部 Benchmark 或 TTS run 产生，具备完整 adapter、plan、mapping report、vendor request、vendor response 和 archive。
- `external_import`：由外部音频包导入，可能没有本平台 adapter，但必须补齐可验证 metadata、来源声明和样本清单。

核心原则是：Arena 可以接受外部结果，但不能把外部结果伪装成 Bench 结果。

## 边界关系

```txt
TTS Facade / Adapter
  -> Run Archive
  -> Benchmark
  -> Bench-derived Arena Set
  -> Arena Questionnaire

External Audio Package
  -> Import Validation
  -> Imported Arena Set
  -> Arena Questionnaire
```

Arena 统一消费 `ArenaDataset`，但 `ArenaDataset` 内部必须保留来源差异。Bench 来源负责可复现审计，外部导入负责声明式审计。

## 数据来源类型

### Bench-derived Arena Set

Bench-derived Arena Set 来源于平台内部 run 或 benchmark run。

这类数据应至少能追溯到：

- `runId` 或 `benchmarkRunId`
- 原始 `request.json`
- `plan.json`
- `mapping-report.json`
- `vendor-request.json`
- `vendor-response.json`
- `result.json`
- 音频文件

这类样本的可信度较高，因为其生成过程经过平台 adapter、plan、mapping report 和 filesystem archive。

### Imported Arena Set

Imported Arena Set 来源于外部打包音频。

典型场景包括：

- 平台暂时没有某个厂商 adapter，但用户已经通过外部工具生成了语音。
- 某些厂商或模型只允许离线、控制台或人工方式导出音频。
- 用户希望先快速做一轮盲测，再决定是否正式接入 adapter。
- 历史音频资产需要重新进入 Arena 做主观偏好评测。

这类数据可以进入 Arena 问卷，但必须带有 `external_import` provenance。分析结果时应明确提示：样本来源由导入包声明，平台无法证明其生成链路完全可复现。

## ArenaDataset 契约草案

```ts
type ArenaDatasetSourceType = "bench_run" | "external_import";

interface ArenaDataset {
  datasetId: string;
  schemaVersion: string;
  name: string;
  description?: string;
  sourceType: ArenaDatasetSourceType;
  sourceRef?: ArenaBenchSourceRef;
  importRef?: ArenaImportRef;
  samples: ArenaSample[];
  questionnaireConfig: ArenaQuestionnaireConfig;
  audit: ArenaDatasetAudit;
}

interface ArenaBenchSourceRef {
  benchmarkRunId?: string;
  runIds: string[];
}

interface ArenaImportRef {
  importId: string;
  packageSchemaVersion: string;
  originalPackageName?: string;
  importedAt: string;
}
```

## 样本来源审计

Arena 样本必须保留 provenance，避免问卷分析阶段混淆来源。

```ts
type ArenaSampleProvenance =
  | {
      kind: "bench_run";
      runId: string;
      providerId: string;
      benchmarkRunId?: string;
      hasMappingReport: true;
      trustLevel: "archived";
    }
  | {
      kind: "external_import";
      importId: string;
      declaredProviderId?: string;
      declaredModel?: string;
      declaredVoice?: string;
      hasMappingReport: false;
      trustLevel: "declared";
    };

interface ArenaSample {
  sampleId: string;
  text: string;
  audioPath: string;
  language?: string;
  tags?: string[];
  providerLabel?: string;
  modelLabel?: string;
  voiceLabel?: string;
  provenance: ArenaSampleProvenance;
  metadata?: ArenaSampleMetadata;
}
```

`trustLevel` 建议保持稳定语义：

- `archived`：平台内部生成，具备 run archive 和 mapping report。
- `declared`：外部导入，来源和参数由导入包声明。

后续如果出现半自动导入，例如外部包同时提供厂商 request/response，也可以扩展新 trust level，但不要复用 `archived`。

## Arena Import Package

外部导入应使用显式包结构，便于校验、复制和归档。

推荐目录结构：

```txt
arena-import-package/
  manifest.json
  samples/
    sample-001/
      audio.wav
      metadata.json
    sample-002/
      audio.wav
      metadata.json
```

`manifest.json` 示例：

```json
{
  "schemaVersion": "1.0",
  "datasetName": "external-elevenlabs-zh-test",
  "description": "外部生成的 ElevenLabs 中文测试音频，用于 Arena 盲测。",
  "sourceType": "external_import",
  "provider": {
    "declaredProviderId": "elevenlabs",
    "displayName": "ElevenLabs",
    "adapterAvailable": false
  },
  "generationContext": {
    "textSetName": "zh-emotion-v1",
    "language": "zh-CN",
    "declaredModel": "unknown",
    "declaredVoice": "unknown"
  },
  "samples": [
    {
      "sampleId": "sample-001",
      "text": "你好，欢迎来到语音评测。",
      "audioPath": "samples/sample-001/audio.wav",
      "metadataPath": "samples/sample-001/metadata.json",
      "tags": ["neutral", "short"]
    }
  ],
  "audit": {
    "createdBy": "external-user",
    "createdAt": "2026-07-03T00:00:00.000Z",
    "notes": "Audio generated outside platform."
  }
}
```

`samples/{sampleId}/metadata.json` 示例：

```json
{
  "sampleId": "sample-001",
  "declaredProviderId": "elevenlabs",
  "declaredModel": "unknown",
  "declaredVoice": "unknown",
  "declaredFormat": "wav",
  "declaredSampleRate": 44100,
  "generationNotes": "Generated from external console.",
  "licenseNotes": "User declares the audio is allowed for internal evaluation."
}
```

## 导入校验

导入流程应至少校验：

- `manifest.json` 可解析，且 `schemaVersion` 受支持。
- `sourceType` 必须是 `external_import`。
- 每个 `sampleId` 唯一。
- 每个 `audioPath` 存在，且文件格式在允许范围内。
- 每个样本必须包含评测文本 `text`。
- `metadataPath` 如果声明则必须存在且可解析。
- 包内路径必须是相对路径，不能越过包根目录。
- provider/model/voice 等外部字段只能作为 declared metadata，不得写入内部 adapter 事实。

校验通过后，API 应生成 `importId`，并把导入结果归档到本地文件系统。

推荐 archive 结构：

```txt
data/arena-imports/{importId}/
  manifest.json
  normalized-dataset.json
  validation-report.json
  samples/
    sample-001/
      audio.wav
      metadata.json
```

`normalized-dataset.json` 是平台内部可直接消费的 `ArenaDataset`。`validation-report.json` 记录导入警告、忽略字段和文件检查结果。

## 问卷发放

Arena 问卷不应关心样本来自 Bench 还是外部导入。问卷只消费规范化后的 `ArenaDataset.samples`。

问卷配置可以包含：

- 题型：AB 偏好、MOS 评分、多维评分、排序题。
- 是否盲测：隐藏 provider/model/voice label。
- 样本随机化规则。
- 每个问卷包含的样本数量。
- 重复样本和一致性检查配置。
- 受访者分组或发放批次。

外部导入样本参与盲测时，前端仍应避免泄露 declared provider 信息。分析和导出阶段则应恢复 provenance，用于解释结果可信度。

## 结果分析注意事项

Arena 分析结果必须能按来源过滤或分组：

- 全部样本
- 仅 Bench-derived 样本
- 仅 Imported 样本
- 按 declared provider 分组
- 按 trust level 分组

当结果包含外部导入样本时，报告中应提示：

```txt
部分样本来自 external_import，其生成参数由导入包声明，平台没有对应 adapter plan 和 mapping report。
```

这条提示不是错误，而是审计边界。

## 后端职责

后端负责：

- Arena import package 校验。
- `importId` 生成。
- 导入包归档。
- 生成 `normalized-dataset.json`。
- 维护 `ArenaDataset`、问卷配置和答卷结果。
- 提供音频文件服务。
- 在分析结果中保留 provenance 和 trust level。

后端不能把 external import 当作 provider adapter 真实能力，也不能为其伪造 mapping report。

## 前端职责

前端可以负责：

- 上传或选择本地 Arena import package。
- 展示导入校验结果。
- 展示 imported dataset 样本列表。
- 创建问卷配置。
- 发放问卷和收集答卷。
- 在分析视图中展示 provenance、trust level 和审计提示。

前端不能负责：

- 推断外部样本真实生成参数。
- 把 declared provider 写成 adapter capability。
- 伪造 Bench run 或 mapping report。

## 与 Adapter 接入的关系

External import 是 Arena 的补充入口，不是替代 adapter 接入。

如果某个外部厂商经过 Arena 验证后值得长期使用，后续仍应按真实厂商底线接入：

- adapter implementation
- capabilities
- extension schema
- examples
- plan/mapping 测试或 fixture
- vendor Contract 文档

接入 adapter 后，新生成的样本应走 Bench-derived 或 run archive 路径。历史 external import 样本仍保留原 provenance，不做身份升级。

## MVP 建议

Arena MVP 可以先实现以下闭环：

1. 定义 `ArenaDataset` 和 `ArenaSampleProvenance` 类型。
2. 支持从已有 run archive 生成 Bench-derived ArenaDataset。
3. 支持 `arena-import-package` 目录导入。
4. 校验并归档到 `data/arena-imports/{importId}`。
5. 生成 `normalized-dataset.json`。
6. 前端展示 dataset 样本和来源标签。
7. 支持基础 AB 偏好问卷。
8. 导出结果时保留 provenance 和 trust level。

不要在 MVP 阶段引入复杂队列、对象存储或大型权限系统。文件系统 archive 仍应作为事实来源。
