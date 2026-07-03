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

  it("resolves local voice ids before planning synthesis", async () => {
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
              createdAt: "2026-07-03T00:00:00.000Z",
              sourceOperation: "voice.clone.create",
              clone: {
                createdAt: "2026-07-03T00:00:00.000Z"
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
