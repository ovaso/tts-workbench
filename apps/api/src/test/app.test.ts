import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { FastifyInstance } from "fastify";
import type { RawData, WebSocket } from "ws";
import { buildApp } from "../app";

describe("api app", () => {
  let app: FastifyInstance;

  beforeEach(async () => {
    app = await buildApp({
      dataRoot: await mkdtemp(path.join(os.tmpdir(), "tts-api-")),
      loadEnv: false
    });
  });

  afterEach(async () => {
    await app.close();
  });

  it("returns health status", async () => {
    const response = await app.inject({
      method: "GET",
      url: "/health"
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      status: "ok",
      service: "@tts-platform/api"
    });
  });

  it("lists registered providers", async () => {
    const response = await app.inject({
      method: "GET",
      url: "/v1/providers"
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      providers: [
        {
          providerId: "mock",
          providerName: "Local Mock TTS",
          adapterVersion: "0.1.0"
        },
        {
          providerId: "minimax",
          providerName: "MiniMax",
          adapterVersion: "0.1.0"
        },
        {
          providerId: "cosyvoice",
          providerName: "CosyVoice",
          adapterVersion: "0.1.0"
        },
        {
          providerId: "doubao",
          providerName: "Doubao",
          adapterVersion: "0.1.0"
        },
        {
          providerId: "xiaomi_mimo",
          providerName: "Xiaomi MiMo",
          adapterVersion: "0.1.0"
        }
      ]
    });
  });

  it("runs sync synthesis through plan, mock execution, and archive", async () => {
    const response = await app.inject({
      method: "POST",
      url: "/v1/tts/sync",
      payload: {
        providerId: "mock",
        text: "hello",
        voice: {
          providerVoiceId: "mock-voice"
        },
        vendor: {
          mode: "prefer_vendor",
          extensions: {
            mock: {
              schemaVersion: "1.0.0",
              params: {
                toneHz: 440
              }
            }
          }
        }
      }
    });

    expect(response.statusCode).toBe(201);
    const body = response.json();
    expect(body.providerId).toBe("mock");
    expect(body.audio.fileName).toBe("audio.wav");

    const detail = await app.inject({
      method: "GET",
      url: `/v1/runs/${body.runId}`
    });

    expect(detail.statusCode).toBe(200);
    expect(detail.json().mappingReport.appliedVendorExtensions[0]).toMatchObject({
      path: "toneHz",
      value: 440
    });
  });

  it("accepts an empty voice object so adapters can use provider defaults", async () => {
    const response = await app.inject({
      method: "POST",
      url: "/v1/tts/sync",
      payload: {
        providerId: "mock",
        text: "hello",
        voice: {}
      }
    });

    expect(response.statusCode).toBe(201);
    expect(response.json().audio.fileName).toBe("audio.wav");
  });

  it("creates a stream session through the stream endpoint", async () => {
    const response = await app.inject({
      method: "POST",
      url: "/v1/tts/stream",
      payload: {
        providerId: "minimax",
        text: "hello stream",
        voice: {},
        stream: {
          protocol: "websocket"
        }
      }
    });

    expect(response.statusCode).toBe(201);
    expect(response.json()).toMatchObject({
      providerId: "minimax",
      operation: "tts.stream",
      protocol: "websocket"
    });
    expect(response.json().url).toMatch(/^\/v1\/tts\/stream\/plan_/);
  });

  it("pipes a mock stream session through the downstream websocket and archives it", async () => {
    const response = await app.inject({
      method: "POST",
      url: "/v1/tts/stream",
      payload: {
        providerId: "mock",
        text: "hello websocket",
        voice: {},
        stream: {
          protocol: "websocket",
          chunkFormat: "wav"
        },
        vendor: {
          mode: "prefer_vendor",
          extensions: {
            mock: {
              schemaVersion: "1.0.0",
              params: {
                durationMs: 220,
                toneHz: 550
              }
            }
          }
        }
      }
    });

    expect(response.statusCode).toBe(201);
    const session = response.json();
    const ws = await app.injectWS(session.url);
    const streamResult = collectWebSocketStream(ws);
    ws.send(JSON.stringify({ type: "client.ready" }));

    const received = await streamResult;
    expect(received.jsonEvents.map((event) => event.type)).toEqual([
      "session.started",
      "metadata",
      "session.completed"
    ]);
    expect(received.binaryBytes).toBeGreaterThan(44);

    const runsResponse = await app.inject({
      method: "GET",
      url: "/v1/runs"
    });
    expect(runsResponse.statusCode).toBe(200);
    const streamRun = runsResponse
      .json()
      .runs.find((run: { operation: string }) => run.operation === "tts.stream");
    expect(streamRun).toMatchObject({
      providerId: "mock",
      operation: "tts.stream",
      status: "succeeded"
    });
  });

  it("routes instant voice clone requests through the provider adapter", async () => {
    const response = await app.inject({
      method: "POST",
      url: "/v1/voice-clones/instant",
      payload: {
        providerId: "xiaomi_mimo",
        text: "instant clone",
        referenceAudio: [
          {
            uri: "data:audio/mpeg;base64,BwYF",
            format: "mp3"
          }
        ]
      }
    });

    expect(response.statusCode).toBe(500);
    expect(response.json()).toMatchObject({
      error: {
        code: "vendor_execution_failed",
        message: "Xiaomi MiMo API key is required."
      }
    });
  });

  it("lists persisted voices", async () => {
    const response = await app.inject({
      method: "GET",
      url: "/v1/voices?providerId=minimax"
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      voices: []
    });
  });

  it("registers an external provider voice in the local voice registry", async () => {
    const createResponse = await app.inject({
      method: "POST",
      url: "/v1/voices",
      payload: {
        providerId: "minimax",
        providerVoiceId: "external_voice_1",
        displayName: "External Voice",
        source: "external",
        modelId: "speech-2.8-hd",
        language: "zh-CN"
      }
    });

    expect(createResponse.statusCode).toBe(201);
    expect(createResponse.json().voice).toMatchObject({
      voiceId: "minimax:external_voice_1",
      providerId: "minimax",
      providerVoiceId: "external_voice_1",
      displayName: "External Voice",
      source: "external",
      modelId: "speech-2.8-hd",
      language: "zh-CN"
    });

    const listResponse = await app.inject({
      method: "GET",
      url: "/v1/voices?providerId=minimax"
    });

    expect(listResponse.json().voices).toHaveLength(1);
    expect(listResponse.json().voices[0].voiceId).toBe("minimax:external_voice_1");
  });

  it("filters managed voices by provider and model", async () => {
    await app.inject({
      method: "POST",
      url: "/v1/voices",
      payload: {
        providerId: "minimax",
        providerVoiceId: "voice_hd",
        displayName: "MiniMax HD Voice",
        source: "external",
        modelId: "speech-2.8-hd"
      }
    });
    await app.inject({
      method: "POST",
      url: "/v1/voices",
      payload: {
        providerId: "minimax",
        providerVoiceId: "voice_turbo",
        displayName: "MiniMax Turbo Voice",
        source: "external",
        modelId: "speech-2.8-turbo"
      }
    });
    await app.inject({
      method: "POST",
      url: "/v1/voices",
      payload: {
        providerId: "cosyvoice",
        providerVoiceId: "voice_hd",
        displayName: "CosyVoice HD Voice",
        source: "external",
        modelId: "cosyvoice-v3.5-plus"
      }
    });

    const listResponse = await app.inject({
      method: "GET",
      url: "/v1/voices?providerId=minimax&modelId=speech-2.8-hd"
    });

    expect(listResponse.statusCode).toBe(200);
    expect(listResponse.json().voices.map((voice: { voiceId: string }) => voice.voiceId)).toEqual([
      "minimax:voice_hd"
    ]);
  });

  it("deletes a managed voice from the local voice registry", async () => {
    await app.inject({
      method: "POST",
      url: "/v1/voices",
      payload: {
        providerId: "minimax",
        providerVoiceId: "external_voice_2",
        displayName: "External Voice 2",
        source: "external"
      }
    });

    const deleteResponse = await app.inject({
      method: "DELETE",
      url: `/v1/voices/${encodeURIComponent("minimax:external_voice_2")}`
    });

    expect(deleteResponse.statusCode).toBe(200);
    expect(deleteResponse.json()).toMatchObject({
      voiceId: "minimax:external_voice_2",
      providerId: "minimax",
      providerVoiceId: "external_voice_2"
    });

    const listResponse = await app.inject({
      method: "GET",
      url: "/v1/voices?providerId=minimax"
    });

    expect(listResponse.json().voices).toEqual([]);
  });

  it("allows browser CORS preflight for managed voice deletion", async () => {
    const response = await app.inject({
      method: "OPTIONS",
      url: `/v1/voices/${encodeURIComponent("minimax:external_voice_2")}`,
      headers: {
        origin: "http://localhost:5173",
        "access-control-request-method": "DELETE"
      }
    });

    expect(response.statusCode).toBe(204);
    expect(response.headers["access-control-allow-methods"]).toContain("DELETE");
  });

  it("creates bench configs with digest based deduplication", async () => {
    const payload = {
      displayName: "MiniMax baseline",
      providerId: "minimax",
      modelId: "speech-02",
      voice: {
        providerVoiceId: "voice_a"
      },
      output: {
        format: "mp3",
        sampleRateHz: 32000
      },
      controls: {
        speed: 1
      }
    };

    const createResponse = await app.inject({
      method: "POST",
      url: "/v1/bench-configs",
      payload
    });
    const duplicateResponse = await app.inject({
      method: "POST",
      url: "/v1/bench-configs",
      payload: {
        ...payload,
        displayName: "Duplicate label"
      }
    });
    const listResponse = await app.inject({
      method: "GET",
      url: "/v1/bench-configs"
    });

    expect(createResponse.statusCode).toBe(201);
    expect(duplicateResponse.statusCode).toBe(201);
    expect(duplicateResponse.json().config.configId).toBe(createResponse.json().config.configId);
    expect(listResponse.json().configs).toHaveLength(1);
  });

  it("creates corpus, config sets, and a planned benchmark plan", async () => {
    const corpusResponse = await app.inject({
      method: "POST",
      url: "/v1/corpus-items",
      payload: {
        title: "Greeting",
        text: "hello benchmark",
        language: "en-US",
        scene: "support",
        emotion: "neutral",
        styleTags: ["formal"],
        ssml: "<speak>hello benchmark</speak>"
      }
    });
    expect(corpusResponse.statusCode).toBe(201);

    const corpusSetResponse = await app.inject({
      method: "POST",
      url: "/v1/corpus-sets",
      payload: {
        name: "Smoke corpus",
        corpusItemIds: [corpusResponse.json().item.corpusItemId]
      }
    });
    expect(corpusSetResponse.statusCode).toBe(201);

    const configResponse = await app.inject({
      method: "POST",
      url: "/v1/bench-configs",
      payload: {
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
      }
    });
    expect(configResponse.statusCode).toBe(201);

    const configSetResponse = await app.inject({
      method: "POST",
      url: "/v1/bench-config-sets",
      payload: {
        name: "Baseline configs",
        configIds: [configResponse.json().config.configId]
      }
    });
    expect(configSetResponse.statusCode).toBe(201);

    const planResponse = await app.inject({
      method: "POST",
      url: "/v1/benchmark-plans",
      payload: {
        displayName: "Smoke benchmark",
        corpusSetId: corpusSetResponse.json().set.corpusSetId,
        configSetId: configSetResponse.json().set.configSetId,
        textMode: "ssml"
      }
    });
    expect(planResponse.statusCode).toBe(201);
    expect(planResponse.json().plan).toMatchObject({
      displayName: "Smoke benchmark",
      operation: "tts.sync",
      textMode: "ssml",
      status: "planned",
      summary: {
        corpusItemCount: 1,
        configCount: 1,
        totalJobs: 1
      }
    });
    expect(planResponse.json().plan.jobs[0].request).toMatchObject({
      providerId: "mock",
      text: "hello benchmark",
      ssml: "<speak>hello benchmark</speak>",
      model: "mock-model",
      voice: {
        providerVoiceId: "mock-voice"
      }
    });

    const detailResponse = await app.inject({
      method: "GET",
      url: `/v1/benchmark-plans/${planResponse.json().plan.planId}`
    });
    expect(detailResponse.statusCode).toBe(200);
    expect(detailResponse.json().planId).toBe(planResponse.json().plan.planId);
  });

  it("filters corpus items, returns corpus stats, and expands corpus sets over HTTP", async () => {
    const supportResponse = await app.inject({
      method: "POST",
      url: "/v1/corpus-items",
      payload: {
        title: "客服问候",
        text: "您好，请问有什么可以帮您？",
        language: "zh-CN",
        scene: "support",
        emotion: "neutral",
        styleTags: ["formal"],
        ssml: "<speak>您好，请问有什么可以帮您？</speak>"
      }
    });
    await app.inject({
      method: "POST",
      url: "/v1/corpus-items",
      payload: {
        title: "广告短句",
        text: "新品限时优惠。",
        language: "zh-CN",
        scene: "ad",
        emotion: "happy",
        styleTags: ["energetic"]
      }
    });

    const listResponse = await app.inject({
      method: "GET",
      url: "/v1/corpus-items?language=zh-CN&scene=support&styleTags=formal&ssmlEnabled=true"
    });
    const statsResponse = await app.inject({
      method: "GET",
      url: "/v1/corpus-stats?language=zh-CN"
    });
    const setResponse = await app.inject({
      method: "POST",
      url: "/v1/corpus-sets",
      payload: {
        name: "中文客服",
        filtersSnapshot: {
          language: "zh-CN",
          scene: "support"
        }
      }
    });
    const detailResponse = await app.inject({
      method: "GET",
      url: `/v1/corpus-sets/${setResponse.json().set.corpusSetId}`
    });

    expect(listResponse.statusCode).toBe(200);
    expect(listResponse.json().items.map((item: { corpusItemId: string }) => item.corpusItemId)).toEqual([
      supportResponse.json().item.corpusItemId
    ]);
    expect(statsResponse.statusCode).toBe(200);
    expect(statsResponse.json().stats).toMatchObject({
      itemCount: 2,
      ssmlEnabledCount: 1
    });
    expect(setResponse.statusCode).toBe(201);
    expect(setResponse.json().set.corpusItemIds).toEqual([supportResponse.json().item.corpusItemId]);
    expect(detailResponse.statusCode).toBe(200);
    expect(detailResponse.json().items[0]).toMatchObject({
      title: "客服问候",
      language: "zh-CN"
    });
  });

  it("updates and deletes corpus items over HTTP", async () => {
    const createResponse = await app.inject({
      method: "POST",
      url: "/v1/corpus-items",
      payload: {
        title: "Draft",
        text: "hello",
        language: "en-US",
        scene: "support"
      }
    });
    const itemId = createResponse.json().item.corpusItemId;

    const updateResponse = await app.inject({
      method: "PATCH",
      url: `/v1/corpus-items/${itemId}`,
      payload: {
        title: "Updated",
        scene: "",
        styleTags: ["formal"],
        ssmlEnabled: true,
        ssml: "<speak>hello</speak>"
      }
    });
    const detailResponse = await app.inject({
      method: "GET",
      url: `/v1/corpus-items/${itemId}`
    });
    const setResponse = await app.inject({
      method: "POST",
      url: "/v1/corpus-sets",
      payload: {
        name: "Referenced",
        corpusItemIds: [itemId]
      }
    });
    const blockedDeleteResponse = await app.inject({
      method: "DELETE",
      url: `/v1/corpus-items/${itemId}`
    });
    const looseResponse = await app.inject({
      method: "POST",
      url: "/v1/corpus-items",
      payload: {
        title: "Loose",
        text: "remove me",
        language: "en-US"
      }
    });
    const deleteResponse = await app.inject({
      method: "DELETE",
      url: `/v1/corpus-items/${looseResponse.json().item.corpusItemId}`
    });

    expect(updateResponse.statusCode).toBe(200);
    expect(updateResponse.json().item).toMatchObject({
      title: "Updated",
      styleTags: ["formal"],
      ssmlEnabled: true
    });
    expect(updateResponse.json().item.scene).toBeUndefined();
    expect(detailResponse.json().title).toBe("Updated");
    expect(setResponse.statusCode).toBe(201);
    expect(blockedDeleteResponse.statusCode).toBe(409);
    expect(blockedDeleteResponse.json().error.details.corpusSetIds).toEqual([setResponse.json().set.corpusSetId]);
    expect(deleteResponse.statusCode).toBe(200);
    expect(deleteResponse.json().item.title).toBe("Loose");
  });

  it("resolves local voice ids without changing the requested synthesis model", async () => {
    const dataRoot = await mkdtemp(path.join(os.tmpdir(), "tts-api-voices-"));
    await mkdir(path.join(dataRoot, "voices"), { recursive: true });
    await writeFile(
      path.join(dataRoot, "voices", "voices.json"),
      `${JSON.stringify(
        {
          voices: [
            {
              voiceId: "mock:cloned_voice",
              providerId: "mock",
              providerVoiceId: "mock-cloned-provider-voice",
              displayName: "Mock Clone",
              source: "cloned",
              modelId: "wrong-model",
              createdAt: "2026-07-03T00:00:00.000Z",
              sourceOperation: "voice.clone.create",
              clone: {
                createdAt: "2026-07-03T00:00:00.000Z"
              },
              vendorMetadata: {
                cloneResourceId: "mock-tts-v1"
              }
            }
          ]
        },
        null,
        2
      )}\n`
    );
    const voiceApp = await buildApp({
      dataRoot,
      loadEnv: false
    });

    try {
      const response = await voiceApp.inject({
        method: "POST",
        url: "/v1/tts/sync",
        payload: {
          providerId: "mock",
          text: "hello cloned voice",
          model: "mock-tts-v1",
          voice: {
            voiceId: "mock:cloned_voice"
          }
        }
      });

      expect(response.statusCode).toBe(201);
      const detail = await voiceApp.inject({
        method: "GET",
        url: `/v1/runs/${response.json().runId}`
      });
      expect(detail.json().vendorRequest.voice).toBe("mock-cloned-provider-voice");
      expect(detail.json().vendorRequest.model).toBe("mock-tts-v1");
    } finally {
      await voiceApp.close();
    }
  });

  it("rejects local voice synthesis when adapter voice compatibility mismatches the requested model", async () => {
    const dataRoot = await mkdtemp(path.join(os.tmpdir(), "tts-api-voice-compat-"));
    await mkdir(path.join(dataRoot, "voices"), { recursive: true });
    await writeFile(
      path.join(dataRoot, "voices", "voices.json"),
      `${JSON.stringify(
        {
          voices: [
            {
              voiceId: "cosyvoice:flash_voice",
              providerId: "cosyvoice",
              providerVoiceId: "flash_voice",
              displayName: "Flash Voice",
              source: "external",
              modelId: "cosyvoice-v3.5-flash",
              createdAt: "2026-07-08T00:00:00.000Z"
            }
          ]
        },
        null,
        2
      )}\n`
    );
    const voiceApp = await buildApp({
      dataRoot,
      loadEnv: false
    });

    try {
      const listResponse = await voiceApp.inject({
        method: "GET",
        url: "/v1/voices?providerId=cosyvoice"
      });
      expect(listResponse.json().voices[0].compatibility).toMatchObject({
        scope: "model",
        modelIds: ["cosyvoice-v3.5-flash"]
      });

      const response = await voiceApp.inject({
        method: "POST",
        url: "/v1/tts/stream",
        payload: {
          providerId: "cosyvoice",
          text: "hello",
          model: "cosyvoice-v3.5-plus",
          voice: {
            voiceId: "cosyvoice:flash_voice"
          }
        }
      });

      expect(response.statusCode).toBe(400);
      expect(response.json().error.message).toContain("cosyvoice-v3.5-flash");
    } finally {
      await voiceApp.close();
    }
  });

  it("normalizes legacy Doubao resource-bound voices to provider-wide compatibility", async () => {
    const dataRoot = await mkdtemp(path.join(os.tmpdir(), "tts-api-doubao-voice-compat-"));
    await mkdir(path.join(dataRoot, "voices"), { recursive: true });
    await writeFile(
      path.join(dataRoot, "voices", "voices.json"),
      `${JSON.stringify(
        {
          voices: [
            {
              voiceId: "doubao:doubao_seed-icl-2.0_S_D3lMr9g32",
              providerId: "doubao",
              providerVoiceId: "doubao_seed-icl-2.0_S_D3lMr9g32",
              displayName: "Legacy Doubao Voice",
              source: "cloned",
              createdAt: "2026-07-09T00:00:00.000Z",
              compatibility: {
                scope: "resource",
                enforced: true,
                resourceIds: ["seed-icl-2.0"],
                resourceKind: "clone_resource",
                vendorField: "resourceId",
                compatibleModelIds: ["seed-tts-2.0"]
              }
            }
          ]
        },
        null,
        2
      )}\n`
    );
    const voiceApp = await buildApp({
      dataRoot,
      loadEnv: false
    });

    try {
      const response = await voiceApp.inject({
        method: "GET",
        url: "/v1/voices?providerId=doubao"
      });

      expect(response.statusCode).toBe(200);
      expect(response.json().voices[0].compatibility).toMatchObject({
        scope: "provider",
        enforced: false,
        preferredModelIds: ["seed-tts-2.0"]
      });
    } finally {
      await voiceApp.close();
    }
  });
});

function collectWebSocketStream(ws: WebSocket): Promise<{
  jsonEvents: Array<{ type: string }>;
  binaryBytes: number;
}> {
  return new Promise((resolve, reject) => {
    const jsonEvents: Array<{ type: string }> = [];
    let binaryBytes = 0;
    const timeout = setTimeout(() => {
      reject(new Error("Timed out waiting for websocket stream completion."));
    }, 2000);

    ws.on("message", (data: RawData, isBinary: boolean) => {
      if (isBinary) {
        binaryBytes += Buffer.isBuffer(data) ? data.byteLength : Buffer.byteLength(data.toString());
        return;
      }
      const event = JSON.parse(data.toString()) as { type: string };
      jsonEvents.push(event);
    });
    ws.on("close", () => {
      clearTimeout(timeout);
      const completed = jsonEvents.some((event) => event.type === "session.completed");
      if (!completed) {
        reject(new Error("Websocket closed before session.completed."));
        return;
      }
      resolve({
        jsonEvents,
        binaryBytes
      });
    });
    ws.on("error", (error) => {
      clearTimeout(timeout);
      reject(error);
    });
  });
}
