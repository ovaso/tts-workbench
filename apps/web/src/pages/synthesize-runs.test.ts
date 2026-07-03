import { describe, expect, it } from "vitest";
import type { ArchivedRunSummary } from "@tts-platform/core";
import { runAudioTitle, syncSynthesisRuns } from "./synthesize-runs";

const syncRun: ArchivedRunSummary = {
  runId: "run_sync",
  providerId: "minimax",
  operation: "tts.sync",
  status: "succeeded",
  createdAt: "2026-07-03T00:00:00.000Z",
  audio: {
    fileName: "audio.mp3",
    format: "mp3",
    sampleRateHz: 32000,
    byteLength: 100
  },
  archive: {
    runPath: "data/runs/run_sync",
    files: []
  }
};

const cloneRun: ArchivedRunSummary = {
  runId: "run_clone",
  providerId: "minimax",
  operation: "voice.clone.create",
  status: "succeeded",
  createdAt: "2026-07-03T00:01:00.000Z",
  archive: {
    runPath: "data/runs/run_clone",
    files: []
  }
};

describe("synthesize runs helpers", () => {
  it("keeps only sync synthesis runs for the synthesize page", () => {
    expect(syncSynthesisRuns([cloneRun, syncRun])).toEqual([syncRun]);
  });

  it("formats audio metadata for run rows", () => {
    expect(runAudioTitle(syncRun)).toBe("mp3 · 32000 Hz");
    expect(runAudioTitle(cloneRun)).toBe("无音频文件");
  });
});
