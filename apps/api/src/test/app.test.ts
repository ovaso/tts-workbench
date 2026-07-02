import { mkdtemp } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { FastifyInstance } from "fastify";
import { buildApp } from "../app";

describe("api app", () => {
  let app: FastifyInstance;

  beforeEach(async () => {
    app = await buildApp({
      dataRoot: await mkdtemp(path.join(os.tmpdir(), "tts-api-"))
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
});
