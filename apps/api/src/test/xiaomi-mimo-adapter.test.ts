import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { XiaomiMiMoTTSAdapter } from "../adapters/xiaomi-mimo/adapter";
import { xiaomiMiMoExtensionSchema } from "../adapters/xiaomi-mimo/extension-schema";

describe("XiaomiMiMoTTSAdapter", () => {
  it("declares instant-only compatibility for the voice clone operation", () => {
    const adapter = new XiaomiMiMoTTSAdapter();
    const capabilities = adapter.capabilities();
    const cloneModel = capabilities.vendorModels.find((candidate) => candidate.modelId === "mimo-v2.5-tts-voiceclone");

    expect(capabilities.voiceCompatibilityPolicy?.kind).toBe("instant_only");
    expect(cloneModel?.voiceCompatibilityPolicy?.kind).toBe("instant_only");
    expect(capabilities.operations["voice.clone.instant"]?.voiceClone?.resultCompatibility?.kind).toBe("instant_only");
    expect(cloneModel?.canonicalCapabilities.supportedOperations).toEqual(["voice.clone.instant"]);
  });

  it("plans sync TTS with Chat Completions messages and vendor style controls", async () => {
    const adapter = new XiaomiMiMoTTSAdapter();
    const plan = await adapter.plan({
      operation: "tts.sync",
      providerId: "xiaomi_mimo",
      text: "hello",
      model: "mimo-v2.5-tts",
      voice: {
        providerVoiceId: "xiaomi_mimo:Chloe"
      },
      output: {
        format: "wav",
        sampleRateHz: 24000,
        bitrate: 128000,
        channels: 2
      },
      controls: {
        emotion: "happy",
        speed: 1.2
      },
      vendor: {
        mode: "prefer_vendor",
        extensions: {
          xiaomi_mimo: {
            schemaVersion: "1.0.0",
            params: {
              stylePrompt: "Bright and upbeat.",
              assistantPrefix: "(开心)",
              unknown: true
            }
          }
        }
      }
    });

    expect(plan.operation).toBe("tts.sync");
    expect(plan.vendorRequest).toMatchObject({
      body: {
        model: "mimo-v2.5-tts",
        messages: [
          {
            role: "user",
            content: "Use happy emotion.\nSpeak faster than normal.\nBright and upbeat."
          },
          {
            role: "assistant",
            content: "(开心)hello"
          }
        ],
        audio: {
          format: "wav",
          voice: "Chloe"
        }
      },
      outputFormat: "wav",
      sampleRateHz: 24000
    });
    expect(plan.mappingReport.appliedVendorExtensions.map((extension) => extension.path)).toEqual([
      "stylePrompt",
      "assistantPrefix"
    ]);
    expect(plan.mappingReport.approximations.map((item) => item.field)).toEqual([
      "controls.emotion",
      "controls.speed"
    ]);
    expect(plan.mappingReport.ignoredFields).toEqual(
      expect.arrayContaining([
        {
          field: "output.bitrate",
          reason: "Xiaomi MiMo Chat Completions TTS does not expose bitrate control."
        },
        {
          field: "output.channels",
          reason: "Xiaomi MiMo stream examples are mono; unsupported channel counts use mono output."
        },
        {
          field: "vendor.extensions.xiaomi_mimo.unknown",
          reason: "Xiaomi MiMo adapter does not support this vendor extension key or value type."
        }
      ])
    );
  });

  it("executes sync TTS through injectable fetch and decodes base64 audio", async () => {
    const fetchCalls: Array<{ url: string; headers: Record<string, string>; body?: unknown }> = [];
    const adapter = new XiaomiMiMoTTSAdapter({
      apiKey: "test-key",
      fetch: async (url, init) => {
        fetchCalls.push({
          url: String(url),
          headers: Object.fromEntries(new Headers(init?.headers).entries()),
          body: typeof init?.body === "string" ? JSON.parse(init.body) as unknown : undefined
        });
        return new Response(
          JSON.stringify({
            choices: [
              {
                message: {
                  audio: {
                    data: Buffer.from([1, 2, 3]).toString("base64")
                  }
                }
              }
            ]
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
      operation: "tts.sync",
      providerId: "xiaomi_mimo",
      text: "audio",
      voice: {}
    });
    if (plan.operation !== "tts.sync") {
      throw new Error("Expected sync plan.");
    }

    const result = await adapter.synthesizeSync(plan);

    expect(fetchCalls[0]).toMatchObject({
      url: "https://api.xiaomimimo.com/v1/chat/completions",
      headers: {
        "api-key": "test-key",
        "content-type": "application/json"
      }
    });
    expect(result.audio.format).toBe("wav");
    expect(result.audio.sampleRateHz).toBe(24000);
    expect([...result.audio.data]).toEqual([1, 2, 3]);
  });

  it("streams OpenAI-compatible audio deltas as platform audio chunks", async () => {
    const adapter = new XiaomiMiMoTTSAdapter({
      apiKey: "test-key",
      fetch: async () =>
        new Response(
          [
            sseBlock({
              choices: [
                {
                  delta: {
                    audio: {
                      data: Buffer.from([9, 8]).toString("base64")
                    }
                  }
                }
              ]
            }),
            "data: [DONE]\n\n"
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
      providerId: "xiaomi_mimo",
      text: "stream",
      voice: {
        providerVoiceId: "Chloe"
      },
      stream: {
        protocol: "sse",
        chunkFormat: "pcm"
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
      "session.completed"
    ]);
    const audioEvent = events.find((event) => event.type === "audio.chunk");
    expect(audioEvent?.type === "audio.chunk" ? [...audioEvent.data] : []).toEqual([9, 8]);
  });

  it("plans and executes instant voice clone from a local reference audio file", async () => {
    const tmp = await mkdtemp(path.join(tmpdir(), "mimo-clone-"));
    const audioPath = path.join(tmp, "reference.mp3");
    await writeFile(audioPath, new Uint8Array([7, 6, 5]));
    const fetchCalls: Array<{ body?: { audio?: { voice?: string } } }> = [];
    const adapter = new XiaomiMiMoTTSAdapter({
      apiKey: "test-key",
      fetch: async (_url, init) => {
        const call: { body?: { audio?: { voice?: string } } } = {};
        if (typeof init?.body === "string") {
          call.body = JSON.parse(init.body) as { audio?: { voice?: string } };
        }
        fetchCalls.push(call);
        return new Response(
          JSON.stringify({
            choices: [
              {
                message: {
                  audio: {
                    data: Buffer.from([4, 3, 2, 1]).toString("base64")
                  }
                }
              }
            ]
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
      operation: "voice.clone.instant",
      providerId: "xiaomi_mimo",
      text: "clone text",
      referenceAudio: [
        {
          uri: `file://${audioPath}`,
          format: "mp3"
        }
      ],
      vendor: {
        mode: "prefer_vendor",
        extensions: {
          xiaomi_mimo: {
            schemaVersion: "1.0.0",
            params: {
              stylePrompt: "Use the same cadence."
            }
          }
        }
      }
    });
    if (plan.operation !== "voice.clone.instant") {
      throw new Error("Expected instant clone plan.");
    }

    expect(plan.vendorRequest).toMatchObject({
      body: {
        model: "mimo-v2.5-tts-voiceclone",
        audio: {
          format: "wav",
          voice: "data:audio/mpeg;base64,BwYF"
        }
      },
      outputFormat: "wav"
    });
    const result = await adapter.createInstantVoiceClone(plan);

    expect(fetchCalls[0]?.body?.audio?.voice).toBe("data:audio/mpeg;base64,BwYF");
    expect(result.audio.format).toBe("wav");
    expect([...result.audio.data]).toEqual([4, 3, 2, 1]);
  });

  it("exposes Xiaomi MiMo vendor extension schemas", () => {
    expect(xiaomiMiMoExtensionSchema("tts.sync").jsonSchema).toMatchObject({
      properties: {
        stylePrompt: {
          type: "string"
        },
        voiceDesignPrompt: {
          type: "string"
        }
      }
    });
    expect(xiaomiMiMoExtensionSchema("voice.clone.instant").jsonSchema).toMatchObject({
      properties: {
        stylePrompt: {
          type: "string"
        }
      }
    });
  });
});

function sseBlock(payload: unknown): string {
  return `data: ${JSON.stringify(payload)}\n\n`;
}
