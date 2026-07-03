import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { DoubaoTTSAdapter } from "../adapters/doubao/adapter";
import { doubaoExtensionSchema } from "../adapters/doubao/extension-schema";

describe("DoubaoTTSAdapter", () => {
  it("plans Doubao SSE TTS with canonical fields and vendor additions", async () => {
    const adapter = new DoubaoTTSAdapter();
    const plan = await adapter.plan({
      operation: "tts.sync",
      providerId: "doubao",
      text: "家长您好",
      model: "seed-icl-2.0",
      voice: {
        providerVoiceId: "doubao:custom_zh_parent"
      },
      output: {
        format: "mp3",
        sampleRateHz: 24000,
        bitrate: 64000,
        channels: 1
      },
      controls: {
        speed: 12,
        volume: 8,
        emotion: "happy",
        pitch: 1,
        style: "friendly"
      },
      vendor: {
        mode: "prefer_vendor",
        extensions: {
          doubao: {
            schemaVersion: "1.0.0",
            params: {
              uid: "unit-test",
              ttsModel: "seed-tts-2.0-expressive",
              additions: {
                enable_language_detector: true
              },
              emotionScale: 5,
              requireUsageTokens: true,
              unknown: true
            }
          }
        }
      }
    });

    expect(plan.operation).toBe("tts.sync");
    expect(plan.vendorRequest).toMatchObject({
      resourceId: "seed-icl-2.0",
      body: {
        user: {
          uid: "unit-test"
        },
        namespace: "BidirectionalTTS",
        req_params: {
          text: "家长您好",
          speaker: "custom_zh_parent",
          model: "seed-tts-2.0-expressive",
          additions: {
            enable_language_detector: true
          },
          audio_params: {
            format: "mp3",
            sample_rate: 24000,
            bit_rate: 64000,
            speech_rate: 12,
            loudness_rate: 8,
            emotion: "happy",
            emotion_scale: 5
          }
        }
      },
      requireUsageTokens: true
    });
    expect(plan.mappingReport.appliedVendorExtensions.map((extension) => extension.path)).toEqual([
      "uid",
      "ttsModel",
      "additions",
      "emotionScale",
      "requireUsageTokens"
    ]);
    expect(plan.mappingReport.ignoredFields).toEqual(
      expect.arrayContaining([
        {
          field: "output.channels",
          reason: "Doubao TTS V3 audio_params does not expose channel control."
        },
        {
          field: "controls.pitch",
          reason: "Doubao TTS V3 audio_params does not expose pitch control."
        },
        {
          field: "controls.style",
          reason: "Doubao style-like controls should be expressed through vendor.extensions.doubao.params.additions."
        },
        {
          field: "vendor.extensions.doubao.unknown",
          reason: "Doubao adapter does not support this vendor extension key or value type."
        }
      ])
    );
  });

  it("executes sync synthesis by concatenating Doubao SSE audio chunks", async () => {
    const fetchCalls: Array<{ url: string; headers: Record<string, string>; jsonBody?: unknown }> = [];
    const adapter = new DoubaoTTSAdapter({
      apiKey: "test-key",
      fetch: async (url, init) => {
        fetchCalls.push({
          url: String(url),
          headers: Object.fromEntries(new Headers(init?.headers).entries()),
          jsonBody: typeof init?.body === "string" ? JSON.parse(init.body) as unknown : undefined
        });
        return new Response(
          [
            sseBlock("352", { code: 0, message: "", data: Buffer.from([1, 2]).toString("base64") }),
            sseBlock("352", { code: 0, message: "", data: Buffer.from([3, 4]).toString("base64") }),
            sseBlock("152", { code: 20000000, message: "OK", data: null, usage: { text_words: 4 } })
          ].join(""),
          {
            status: 200,
            headers: {
              "Content-Type": "text/event-stream"
            }
          }
        );
      }
    });
    const plan = await adapter.plan({
      operation: "tts.sync",
      providerId: "doubao",
      text: "audio",
      voice: {
        providerVoiceId: "custom_zh_parent"
      },
      vendor: {
        mode: "prefer_vendor",
        extensions: {
          doubao: {
            schemaVersion: "1.0.0",
            params: {
              requireUsageTokens: true
            }
          }
        }
      }
    });
    if (plan.operation !== "tts.sync") {
      throw new Error("Expected sync plan.");
    }

    const result = await adapter.synthesizeSync(plan);

    expect(fetchCalls[0]).toMatchObject({
      url: "https://openspeech.bytedance.com/api/v3/tts/unidirectional/sse",
      jsonBody: {
        req_params: {
          text: "audio",
          speaker: "custom_zh_parent"
        }
      }
    });
    expect(fetchCalls[0]?.headers).toMatchObject({
      "content-type": "application/json",
      "x-api-key": "test-key",
      "x-api-resource-id": "seed-icl-2.0",
      "x-control-require-usage-tokens-return": "text_words"
    });
    expect([...result.audio.data]).toEqual([1, 2, 3, 4]);
    expect(result.audio.format).toBe("mp3");
    expect(result.audio.sampleRateHz).toBe(24000);
    expect(result.vendorResponse).toMatchObject({
      status: "succeeded"
    });
  });

  it("ignores blank Doubao string extensions instead of overriding defaults", async () => {
    const adapter = new DoubaoTTSAdapter();
    const plan = await adapter.plan({
      operation: "tts.sync",
      providerId: "doubao",
      text: "blank extension",
      voice: {
        providerVoiceId: "custom_zh_parent"
      },
      vendor: {
        mode: "prefer_vendor",
        extensions: {
          doubao: {
            schemaVersion: "1.0.0",
            params: {
              uid: "",
              resourceId: "",
              ttsModel: ""
            }
          }
        }
      }
    });

    expect(plan.vendorRequest).toMatchObject({
      resourceId: "seed-icl-2.0",
      body: {
        user: {
          uid: "tts_workbench"
        },
        req_params: {
          model: "seed-tts-2.0-standard"
        }
      }
    });
    expect(plan.mappingReport.appliedVendorExtensions).toEqual([]);
    expect(plan.mappingReport.ignoredFields.map((field) => field.field)).toEqual([
      "vendor.extensions.doubao.uid",
      "vendor.extensions.doubao.resourceId",
      "vendor.extensions.doubao.ttsModel"
    ]);
  });

  it("surfaces Doubao SSE error code and message", async () => {
    const adapter = new DoubaoTTSAdapter({
      apiKey: "test-key",
      fetch: async () =>
        new Response(sseBlock("153", { code: 45000000, message: "speaker permission denied", data: null }), {
          status: 200,
          headers: {
            "Content-Type": "text/event-stream"
          }
        })
    });
    const plan = await adapter.plan({
      operation: "tts.sync",
      providerId: "doubao",
      text: "bad speaker",
      voice: {
        providerVoiceId: "missing_speaker"
      }
    });
    if (plan.operation !== "tts.sync") {
      throw new Error("Expected sync plan.");
    }

    await expect(adapter.synthesizeSync(plan)).rejects.toThrow(
      "Doubao SSE event returned error code 45000000: speaker permission denied"
    );
  });

  it("streams Doubao SSE audio chunks as unified stream events", async () => {
    const adapter = new DoubaoTTSAdapter({
      apiKey: "test-key",
      fetch: async () =>
        new Response(
          [
            sseBlock("352", { code: 0, message: "", data: Buffer.from([9, 8]).toString("base64") }),
            sseBlock("351", { code: 0, message: "", data: null, sentence: { text: "done" } }),
            sseBlock("152", { code: 20000000, message: "OK", data: null })
          ].join(""),
          {
            status: 200,
            headers: {
              "Content-Type": "text/event-stream"
            }
          }
        )
    });
    const plan = await adapter.plan({
      operation: "tts.stream",
      providerId: "doubao",
      text: "stream",
      voice: {
        providerVoiceId: "custom_zh_parent"
      },
      stream: {
        protocol: "sse",
        chunkFormat: "mp3"
      }
    });
    if (plan.operation !== "tts.stream") {
      throw new Error("Expected stream plan.");
    }

    const events = [];
    for await (const event of adapter.synthesizeStream(plan)) {
      events.push(event);
    }

    expect(events.map((event) => event.type)).toEqual([
      "session.started",
      "metadata",
      "audio.chunk",
      "metadata",
      "metadata",
      "session.completed"
    ]);
    const audioEvent = events.find((event) => event.type === "audio.chunk");
    expect(audioEvent?.type === "audio.chunk" ? [...audioEvent.data] : []).toEqual([9, 8]);
  });

  it("plans and executes Doubao voice clone with local reference audio", async () => {
    const tmp = await mkdtemp(path.join(tmpdir(), "doubao-clone-"));
    const audioPath = path.join(tmp, "voice.wav");
    await writeFile(audioPath, new Uint8Array([7, 6, 5]));
    const fetchCalls: Array<{ url: string; headers: Record<string, string>; jsonBody?: Record<string, unknown> }> = [];
    const adapter = new DoubaoTTSAdapter({
      appId: "legacy-app",
      accessToken: "legacy-token",
      fetch: async (url, init) => {
        const call: { url: string; headers: Record<string, string>; jsonBody?: Record<string, unknown> } = {
          url: String(url),
          headers: Object.fromEntries(new Headers(init?.headers).entries())
        };
        if (typeof init?.body === "string") {
          call.jsonBody = JSON.parse(init.body) as Record<string, unknown>;
        }
        fetchCalls.push(call);
        return new Response(
          JSON.stringify({
            code: 0,
            message: "ok",
            speaker_id: "custom_parent_voice"
          }),
          {
            status: 200,
            headers: {
              "Content-Type": "application/json"
            }
          }
        );
      }
    });

    const plan = await adapter.plan({
      operation: "voice.clone.create",
      providerId: "doubao",
      displayName: "Parent Voice",
      referenceAudio: [
        {
          uri: "",
          path: audioPath,
          format: "wav"
        }
      ],
      language: "zh-CN",
      vendor: {
        mode: "prefer_vendor",
        extensions: {
          doubao: {
            schemaVersion: "1.0.0",
            params: {
              customSpeakerId: "custom_parent_voice",
              extraParams: {
                voice_clone_denoise_model_id: "SpeechInpaintingV2"
              }
            }
          }
        }
      }
    });
    if (plan.operation !== "voice.clone.create") {
      throw new Error("Expected voice clone plan.");
    }

    expect(plan.vendorRequest).toMatchObject({
      speaker_id: "custom_speaker_id",
      custom_speaker_id: "custom_parent_voice",
      audio: {
        data: Buffer.from([7, 6, 5]).toString("base64"),
        format: "wav"
      },
      language: 0,
      extra_params: {
        voice_clone_denoise_model_id: "SpeechInpaintingV2"
      }
    });
    const result = await adapter.createVoiceClone(plan);

    expect(fetchCalls[0]).toMatchObject({
      url: "https://openspeech.bytedance.com/api/v3/tts/voice_clone"
    });
    expect(fetchCalls[0]?.headers).toMatchObject({
      "x-api-app-key": "legacy-app",
      "x-api-access-key": "legacy-token"
    });
    expect(result.voice).toMatchObject({
      voiceId: "doubao:custom_parent_voice",
      providerId: "doubao",
      providerVoiceId: "custom_parent_voice",
      displayName: "Parent Voice",
      source: "cloned",
      modelId: "seed-icl-2.0"
    });
  });

  it("exposes Doubao vendor extension schemas", () => {
    expect(doubaoExtensionSchema("tts.sync").jsonSchema).toMatchObject({
      properties: {
        ttsModel: {
          type: "string"
        },
        additions: {
          type: "object"
        }
      }
    });
    expect(doubaoExtensionSchema("voice.clone.create").jsonSchema).toMatchObject({
      properties: {
        customSpeakerId: {
          type: "string"
        }
      }
    });
  });
});

// sseBlock: 入参为事件名和 JSON payload；输出测试用 SSE 文本块。
function sseBlock(event: string, payload: unknown): string {
  return `event: ${event}\ndata: ${JSON.stringify(payload)}\n\n`;
}
