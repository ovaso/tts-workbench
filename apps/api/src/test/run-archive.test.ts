import { mkdtemp, readdir } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { MockTTSAdapter } from "../adapters/mock/adapter";
import { FileRunArchive } from "../storage/run-archive";

describe("FileRunArchive", () => {
  it("writes the full sync run archive contract", async () => {
    const dataRoot = await mkdtemp(path.join(os.tmpdir(), "tts-archive-"));
    const archive = new FileRunArchive(dataRoot);
    const adapter = new MockTTSAdapter();
    const request = {
      operation: "tts.sync",
      providerId: "mock",
      text: "archive me",
      voice: {
        providerVoiceId: "mock-voice"
      }
    } as const;
    const plan = await adapter.plan(request);
    const providerResult = await adapter.synthesizeSync?.(plan);

    if (providerResult === undefined) {
      throw new Error("Expected mock adapter to synthesize sync audio.");
    }

    const result = await archive.writeRun({
      runId: "run_test",
      request,
      plan,
      providerResult
    });

    const files = await readdir(path.join(dataRoot, "runs", "run_test"));

    expect(result.audio.fileName).toBe("audio.wav");
    expect(files.sort()).toEqual([
      "audio.wav",
      "mapping-report.json",
      "plan.json",
      "request.json",
      "result.json",
      "vendor-request.json",
      "vendor-response.json"
    ]);
  });
});
