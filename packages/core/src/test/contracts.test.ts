import { describe, expect, it } from "vitest";
import {
  TTS_OPERATIONS,
  isTTSOperation,
  type BenchmarkPlan,
  type BenchConfigSet,
  type CorpusItem,
  type TTSAdapter,
  type TTSStreamEvent,
  type VoiceCloneInstantPlan,
  type VoiceClonePlan,
  type TTSSyncRequest,
  type TTSStreamRequest,
  type VendorDirective,
  type VoiceRecord,
  type TTSCapabilities
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

  it("models corpus items, config sets, and planned benchmark jobs without execution state", () => {
    const item: CorpusItem = {
      corpusItemId: "corpus_item_1",
      title: "客服问候",
      text: "您好，请问有什么可以帮您？",
      language: "zh-CN",
      scene: "customer_service",
      emotion: "neutral",
      lengthCategory: "short",
      styleTags: ["formal"],
      ssml: "<speak>您好，请问有什么可以帮您？</speak>",
      ssmlEnabled: true,
      createdAt: new Date(0).toISOString(),
      updatedAt: new Date(0).toISOString()
    };
    const configSet: BenchConfigSet = {
      configSetId: "bench_config_set_1",
      digest: "digest",
      name: "baseline",
      configIds: ["config_1"],
      createdAt: item.createdAt,
      updatedAt: item.updatedAt
    };
    const plan: BenchmarkPlan = {
      planId: "plan_1",
      displayName: "baseline plan",
      corpusSetId: "corpus_set_1",
      configSetId: configSet.configSetId,
      operation: "tts.sync",
      textMode: "ssml",
      status: "planned",
      createdAt: item.createdAt,
      updatedAt: item.updatedAt,
      jobs: [
        {
          jobId: "job_0001",
          corpusItemId: item.corpusItemId,
          configId: "config_1",
          operation: "tts.sync",
          textMode: "ssml",
          status: "planned",
          request: {
            operation: "tts.sync",
            providerId: "mock",
            text: item.text,
            ssml: "<speak>您好，请问有什么可以帮您？</speak>",
            voice: {}
          }
        }
      ],
      summary: {
        corpusItemCount: 1,
        configCount: 1,
        totalJobs: 1
      },
      archive: {
        runPath: "data/benchmark-runs/plan_1",
        files: ["benchmark-plan.json"]
      }
    };

    expect(plan.jobs[0]?.request.operation).toBe("tts.sync");
    expect(plan.jobs[0]?.request.ssml).toContain("speak");
    expect(plan.summary.totalJobs).toBe(1);
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
      vendorModels: [
        {
          modelId: "speech-2.8-hd",
          displayName: "speech-2.8-hd",
          defaultForOperations: ["tts.sync", "tts.stream", "voice.clone.create"],
          canonicalCapabilities: {
            supportsText: true,
            supportsSSML: false,
            supportedOperations: ["tts.sync", "tts.stream", "voice.clone.create"],
            outputFormats: ["mp3", "wav", "flac"],
            outputChunkFormats: ["mp3"],
            sampleRatesHz: [16000, 24000, 32000],
            maxTextChars: 10000,
            canonicalControls: {
              speed: {
                support: "supported",
                min: 0.5,
                max: 2
              },
              emotion: {
                support: "supported",
                values: ["happy", "sad", "angry"]
              }
            }
          },
          vendorModelFeatureSchema: {
            schemaVersion: "1.0.0",
            title: "MiniMax speech model features",
            jsonSchema: {
              type: "object",
              properties: {
                language_boost: {
                  type: "string"
                },
                pronunciation_dict: {
                  type: "object"
                }
              }
            }
          }
        }
      ],
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
    expect(capabilities.vendorModels[0]?.canonicalCapabilities.supportsSSML).toBe(false);
    expect(capabilities.operations["tts.sync"]?.transportProtocols).toEqual(["https"]);
  });

  it("models richer audio output and stream preferences without vendor-specific fields", () => {
    const request: TTSStreamRequest = {
      operation: "tts.stream",
      providerId: "minimax",
      text: "hello stream",
      ssml: "<speak>hello stream</speak>",
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
    expect(request.ssml).toContain("speak");
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

  it("models voice compatibility separately from legacy modelId", () => {
    const voice: VoiceRecord = {
      voiceId: "cosyvoice:voice_flash",
      providerId: "cosyvoice",
      providerVoiceId: "voice_flash",
      displayName: "Flash voice",
      source: "cloned",
      modelId: "cosyvoice-v3.5-flash",
      createdWithModelId: "cosyvoice-v3.5-flash",
      preferredModelId: "cosyvoice-v3.5-flash",
      compatibility: {
        scope: "model",
        enforced: true,
        modelIds: ["cosyvoice-v3.5-flash"]
      },
      createdAt: new Date(0).toISOString()
    };
    const capabilities: TTSCapabilities = {
      providerId: "cosyvoice",
      providerName: "CosyVoice",
      adapterVersion: "0.0.0",
      voiceCompatibilityPolicy: {
        kind: "same_model",
        enforcedBy: "vendor"
      },
      vendorFeatures: {
        supportsHttpTTS: true,
        supportsStreamingTTS: true,
        supportsPersistentVoiceClone: true,
        supportsInstantVoiceClone: false,
        supportsVoiceCloneDelete: false
      },
      vendorModels: [],
      operations: {}
    };

    expect(voice.compatibility?.scope).toBe("model");
    expect(capabilities.voiceCompatibilityPolicy?.kind).toBe("same_model");
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
        vendorModels: [],
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

  it("requires instant clone execution to return generated audio from a planned request", async () => {
    const executeInstantClone: NonNullable<TTSAdapter["createInstantVoiceClone"]> = async (_plan) => ({
      audio: {
        data: new Uint8Array([1, 2, 3]),
        format: "wav",
        sampleRateHz: 24000
      },
      vendorResponse: {
        status: "ok"
      }
    });

    const plan: VoiceCloneInstantPlan = {
      planId: "plan_instant",
      providerId: "instant-clone",
      adapterVersion: "0.0.0",
      operation: "voice.clone.instant",
      createdAt: new Date(0).toISOString(),
      capabilitySnapshot: {
        providerId: "instant-clone",
        providerName: "Instant Clone",
        adapterVersion: "0.0.0",
        vendorFeatures: {
          supportsHttpTTS: true,
          supportsStreamingTTS: false,
          supportsPersistentVoiceClone: false,
          supportsInstantVoiceClone: true,
          supportsVoiceCloneDelete: false
        },
        vendorModels: [],
        operations: {}
      },
      canonicalRequest: {
        operation: "voice.clone.instant",
        providerId: "instant-clone",
        text: "hello",
        referenceAudio: [
          {
            uri: "data:audio/mpeg;base64,AQID"
          }
        ]
      },
      vendorRequest: {},
      mappingReport: {
        providerId: "instant-clone",
        operation: "voice.clone.instant",
        directiveMode: "prefer_vendor",
        appliedCanonicalFields: [],
        appliedVendorExtensions: [],
        ignoredFields: [],
        approximations: [],
        warnings: []
      }
    };

    await expect(executeInstantClone(plan)).resolves.toMatchObject({
      audio: {
        format: "wav",
        sampleRateHz: 24000
      }
    });
  });
});
