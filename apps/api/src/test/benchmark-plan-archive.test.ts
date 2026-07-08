import { mkdtemp, readFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { FileBenchmarkPlanArchive } from "../storage/benchmark-plan-archive";
import { FileBenchConfigRegistry } from "../storage/bench-config-registry";
import { FileCorpusRegistry } from "../storage/corpus-registry";

describe("FileBenchmarkPlanArchive", () => {
  it("expands corpus sets and config sets into planned sync jobs", async () => {
    const dataRoot = await mkdtemp(path.join(os.tmpdir(), "tts-benchmark-plan-"));
    const corpus = new FileCorpusRegistry(dataRoot);
    const configs = new FileBenchConfigRegistry(dataRoot);
    const archive = new FileBenchmarkPlanArchive(corpus, configs, dataRoot);
    const item = corpus.saveItem({
      title: "Greeting",
      text: "hello",
      language: "en-US",
      ssml: "<speak>hello</speak>"
    });
    const corpusSet = corpus.saveSet({
      name: "Smoke corpus",
      corpusItemIds: [item.corpusItemId]
    });
    const config = configs.save({
      displayName: "Mock baseline",
      providerId: "mock",
      modelId: "mock-model",
      voice: {
        providerVoiceId: "mock-voice"
      },
      output: {
        format: "wav",
        sampleRateHz: 24000
      },
      controls: {
        speed: 1
      }
    });
    const configSet = configs.saveSet({
      name: "Baseline configs",
      configIds: [config.configId]
    });

    const plan = await archive.createPlan({
      displayName: "Smoke plan",
      corpusSetId: corpusSet.corpusSetId,
      configSetId: configSet.configSetId,
      textMode: "ssml"
    });
    const rawPlan = JSON.parse(
      await readFile(path.join(dataRoot, "benchmark-runs", plan.planId, "benchmark-plan.json"), "utf8")
    ) as { planId: string };

    expect(plan.summary).toEqual({
      corpusItemCount: 1,
      configCount: 1,
      totalJobs: 1
    });
    expect(plan.jobs[0]?.request).toMatchObject({
      operation: "tts.sync",
      providerId: "mock",
      text: "hello",
      ssml: "<speak>hello</speak>",
      model: "mock-model",
      voice: {
        providerVoiceId: "mock-voice"
      },
      output: {
        format: "wav",
        sampleRateHz: 24000
      },
      controls: {
        speed: 1
      }
    });
    expect(rawPlan.planId).toBe(plan.planId);
    await expect(archive.readPlan(plan.planId)).resolves.toMatchObject({
      planId: plan.planId,
      status: "planned"
    });
  });
});
