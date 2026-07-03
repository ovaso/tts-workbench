import { mkdir, mkdtemp, readdir, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import type { VoiceClonePlan, VoiceCloneRequest, VoiceCloneResult } from "@tts-platform/core";
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

  it("lists voice clone archives without requiring an audio artifact", async () => {
    const dataRoot = await mkdtemp(path.join(os.tmpdir(), "tts-archive-clone-"));
    const archive = new FileRunArchive(dataRoot);
    const request: VoiceCloneRequest = {
      operation: "voice.clone.create",
      providerId: "mock",
      displayName: "Clone Voice",
      referenceAudio: [
        {
          uri: "mock://voice.wav"
        }
      ]
    };
    const plan: VoiceClonePlan = {
      planId: "plan_clone",
      providerId: "mock",
      adapterVersion: "0.1.0",
      operation: "voice.clone.create",
      createdAt: "2026-07-03T00:00:00.000Z",
      canonicalRequest: request,
      capabilitySnapshot: {
        providerId: "mock",
        providerName: "Mock",
        adapterVersion: "0.1.0",
        vendorFeatures: {
          supportsHttpTTS: true,
          supportsStreamingTTS: false,
          supportsPersistentVoiceClone: true,
          supportsInstantVoiceClone: false,
          supportsVoiceCloneDelete: false
        },
        vendorModels: [],
        operations: {}
      },
      vendorRequest: {
        clone: {
          voice_id: "clone_voice"
        }
      },
      mappingReport: {
        providerId: "mock",
        operation: "voice.clone.create",
        directiveMode: "prefer_vendor",
        appliedCanonicalFields: [],
        appliedVendorExtensions: [],
        ignoredFields: [],
        approximations: [],
        warnings: []
      }
    };
    const providerResult: VoiceCloneResult = {
      voice: {
        voiceId: "mock:clone_voice",
        providerId: "mock",
        providerVoiceId: "clone_voice",
        displayName: "Clone Voice",
        source: "cloned",
        createdAt: "2026-07-03T00:00:01.000Z",
        sourceOperation: "voice.clone.create"
      },
      vendorResponse: {
        voice_id: "clone_voice"
      }
    };

    await archive.writeVoiceClone({
      runId: "run_clone",
      request,
      plan,
      providerResult
    });

    const runs = await archive.listRuns();

    expect(runs).toEqual([
      expect.objectContaining({
        runId: "run_clone",
        providerId: "mock",
        operation: "voice.clone.create",
        status: "succeeded"
      })
    ]);
    expect(runs[0]?.audio).toBeUndefined();
  });

  it("uses plan metadata when listing legacy clone archives without run metadata", async () => {
    const dataRoot = await mkdtemp(path.join(os.tmpdir(), "tts-archive-legacy-clone-"));
    const runDirectory = path.join(dataRoot, "runs", "run_legacy_clone");
    const archive = new FileRunArchive(dataRoot);
    await mkdir(runDirectory, { recursive: true });
    await writeFile(
      path.join(runDirectory, "plan.json"),
      `${JSON.stringify({
        planId: "plan_legacy_clone",
        providerId: "minimax",
        adapterVersion: "0.1.0",
        operation: "voice.clone.create",
        createdAt: "2026-07-03T01:02:03.000Z",
        capabilitySnapshot: {
          providerId: "minimax",
          providerName: "MiniMax",
          adapterVersion: "0.1.0",
          vendorFeatures: {},
          vendorModels: [],
          operations: {}
        },
        vendorRequest: {},
        mappingReport: {
          providerId: "minimax",
          operation: "voice.clone.create",
          directiveMode: "prefer_vendor",
          appliedCanonicalFields: [],
          appliedVendorExtensions: [],
          ignoredFields: [],
          approximations: [],
          warnings: []
        },
        canonicalRequest: {
          operation: "voice.clone.create",
          providerId: "minimax",
          displayName: "Legacy Clone",
          referenceAudio: []
        }
      })}\n`
    );
    await writeFile(
      path.join(runDirectory, "result.json"),
      `${JSON.stringify({
        voice: {
          voiceId: "minimax:legacy_clone",
          providerId: "minimax",
          providerVoiceId: "legacy_clone",
          displayName: "Legacy Clone",
          source: "cloned",
          createdAt: "2026-07-03T01:02:04.000Z",
          sourceOperation: "voice.clone.create"
        },
        vendorResponse: {}
      })}\n`
    );

    await writeFile(path.join(runDirectory, "request.json"), "{}\n");
    await writeFile(path.join(runDirectory, "mapping-report.json"), "{}\n");
    await writeFile(path.join(runDirectory, "vendor-request.json"), "{}\n");
    await writeFile(path.join(runDirectory, "vendor-response.json"), "{}\n");

    const runs = await archive.listRuns();

    expect(runs[0]).toMatchObject({
      runId: "run_legacy_clone",
      providerId: "minimax",
      operation: "voice.clone.create",
      createdAt: "2026-07-03T01:02:03.000Z"
    });
    expect(runs[0]?.audio).toBeUndefined();
  });
});
