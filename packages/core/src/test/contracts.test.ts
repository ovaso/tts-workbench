import { describe, expect, it } from "vitest";
import {
  TTS_OPERATIONS,
  isTTSOperation,
  type TTSAdapter,
  type TTSStreamEvent,
  type VoiceClonePlan,
  type TTSSyncRequest,
  type TTSStreamRequest,
  type VendorDirective
} from "../index";

describe("core contracts", () => {
  it("keeps the operation surface open for sync, stream, and voice clone lifecycles", () => {
    expect(TTS_OPERATIONS).toEqual([
      "tts.sync",
      "tts.stream",
      "voice.clone.create",
      "voice.clone.instant",
      "voice.clone.delete"
    ]);
    expect(isTTSOperation("tts.sync")).toBe(true);
    expect(isTTSOperation("tts.batch")).toBe(false);
  });

  it("allows vendor extensions only behind an explicit directive boundary", () => {
    const vendor: VendorDirective = {
      mode: "prefer_vendor",
      extensions: {
        mock: {
          schemaVersion: "1.0.0",
          params: {
            toneHz: 440
          }
        }
      }
    };

    const request: TTSSyncRequest = {
      operation: "tts.sync",
      providerId: "mock",
      text: "hello",
      voice: {
        providerVoiceId: "mock-voice"
      },
      output: {
        format: "wav",
        sampleRateHz: 24000
      },
      vendor
    };

    expect(request.vendor?.extensions?.mock?.params.toneHz).toBe(440);
  });

  it("requires adapters to declare vendor-owned feature flags", () => {
    const capabilities = {
      providerId: "minimax",
      providerName: "MiniMax",
      adapterVersion: "0.1.0",
      vendorFeatures: {
        supportsHttpTTS: true,
        supportsStreamingTTS: true,
        supportsPersistentVoiceClone: true,
        supportsInstantVoiceClone: false,
        supportsVoiceCloneDelete: true
      },
      operations: {
        "tts.sync": {
          operation: "tts.sync",
          supported: true,
          transportProtocols: ["https"],
          canonicalControls: {}
        },
        "tts.stream": {
          operation: "tts.stream",
          supported: true,
          transportProtocols: ["websocket"],
          canonicalControls: {}
        }
      }
    } satisfies import("../index").TTSCapabilities;

    expect(capabilities.vendorFeatures.supportsHttpTTS).toBe(true);
    expect(capabilities.operations["tts.sync"]?.transportProtocols).toEqual(["https"]);
  });

  it("models richer audio output and stream preferences without vendor-specific fields", () => {
    const request: TTSStreamRequest = {
      operation: "tts.stream",
      providerId: "minimax",
      text: "hello stream",
      voice: {
        providerVoiceId: "male-qn-qingse"
      },
      output: {
        format: "mp3",
        sampleRateHz: 32000,
        bitrate: 128000,
        channels: 1
      },
      stream: {
        protocol: "websocket",
        chunkFormat: "mp3",
        enableTimestamps: true
      }
    };

    expect(request.output?.bitrate).toBe(128000);
    expect(request.stream?.protocol).toBe("websocket");
  });

  it("keeps reference audio formats separate from synthesis output formats", () => {
    const plan = {
      operation: "voice.clone.create",
      providerId: "minimax",
      canonicalRequest: {
        operation: "voice.clone.create",
        providerId: "minimax",
        displayName: "Demo voice",
        language: "zh",
        referenceAudio: [
          {
            uri: "file:///tmp/demo.m4a",
            format: "m4a",
            durationMs: 12000,
            transcript: "sample transcript"
          }
        ],
        consent: {
          confirmed: true,
          usageScope: "internal_eval"
        }
      }
    } satisfies Partial<VoiceClonePlan>;

    expect(plan.canonicalRequest.referenceAudio[0]?.format).toBe("m4a");
    expect(plan.canonicalRequest.consent?.confirmed).toBe(true);
  });

  it("requires clone execution to consume planned requests", async () => {
    const executeClone: NonNullable<TTSAdapter["createVoiceClone"]> = async (plan) => {
      const clone = {
        createdAt: new Date(0).toISOString(),
        ...(plan.canonicalRequest.consent?.usageScope === undefined
          ? {}
          : { consentScope: plan.canonicalRequest.consent.usageScope })
      };

      return {
        voice: {
          voiceId: "local-voice",
          providerId: plan.providerId,
          providerVoiceId: "vendor-voice",
          displayName: plan.canonicalRequest.displayName,
          source: "cloned",
          createdAt: new Date(0).toISOString(),
          sourceOperation: "voice.clone.create",
          clone
        },
        vendorResponse: {}
      };
    };

    const plan: VoiceClonePlan = {
      planId: "plan_test",
      providerId: "planned-clone",
      adapterVersion: "0.0.0",
      operation: "voice.clone.create",
      createdAt: new Date(0).toISOString(),
      capabilitySnapshot: {
        providerId: "planned-clone",
        providerName: "Planned Clone",
        adapterVersion: "0.0.0",
        vendorFeatures: {
          supportsHttpTTS: false,
          supportsStreamingTTS: false,
          supportsPersistentVoiceClone: true,
          supportsInstantVoiceClone: false,
          supportsVoiceCloneDelete: false
        },
        operations: {}
      },
      canonicalRequest: {
        operation: "voice.clone.create",
        providerId: "planned-clone",
        displayName: "Demo voice",
        referenceAudio: []
      },
      vendorRequest: {},
      mappingReport: {
        providerId: "planned-clone",
        operation: "voice.clone.create",
        directiveMode: "prefer_vendor",
        appliedCanonicalFields: [],
        appliedVendorExtensions: [],
        ignoredFields: [],
        approximations: [],
        warnings: []
      }
    };

    await expect(executeClone(plan)).resolves.toMatchObject({
      voice: {
        providerVoiceId: "vendor-voice"
      }
    });
  });

  it("uses stream events that describe the facade session lifecycle", () => {
    const event: TTSStreamEvent = {
      type: "audio.chunk",
      sequence: 1,
      data: new Uint8Array([1, 2, 3]),
      format: "mp3",
      timestampMs: 20
    };

    expect(event.type).toBe("audio.chunk");
    expect(event.format).toBe("mp3");
  });
});
