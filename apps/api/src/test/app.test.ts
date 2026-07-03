import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { FastifyInstance } from "fastify";
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
