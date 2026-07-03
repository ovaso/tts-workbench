import { describe, expect, it } from "vitest";
import {
  CosyVoiceTTSAdapter,
  type CosyVoiceWebSocketFactory,
  type CosyVoiceWebSocketLike
} from "../adapters/cosyvoice/adapter";
import { cosyVoiceExtensionSchema } from "../adapters/cosyvoice/extension-schema";

describe("CosyVoiceTTSAdapter", () => {
  it("plans CosyVoice sync TTS with canonical fields and vendor instruction", async () => {
    const adapter = new CosyVoiceTTSAdapter();
    const plan = await adapter.plan({
      operation: "tts.sync",
      providerId: "cosyvoice",
      text: "家长您好",
      model: "cosyvoice-v3.5-plus",
      voice: {
        providerVoiceId: "cosyvoice:voice_abc"
      },
      output: {
        format: "mp3",
        sampleRateHz: 24000,
        bitrate: 128000,
        channels: 1
      },
      controls: {
        volume: 55,
        speed: 1.1,
        pitch: 0.9,
        style: "friendly"
      },
      vendor: {
        mode: "prefer_vendor",
        extensions: {
          cosyvoice: {
            schemaVersion: "1.0.0",
            params: {
              instruction: "用亲切自然的语气朗读。",
              unknown: true
            }
          }
        }
      }
    });

    expect(plan.operation).toBe("tts.sync");
    expect(plan.vendorRequest).toMatchObject({
      model: "cosyvoice-v3.5-plus",
      stream: false,
      input: {
        text: "家长您好",
        voice: "voice_abc",
        format: "mp3",
        sample_rate: 24000,
        volume: 55,
        rate: 1.1,
        pitch: 0.9,
        instruction: "用亲切自然的语气朗读。"
      }
    });
    expect(plan.mappingReport.appliedVendorExtensions.map((extension) => extension.path)).toEqual([
      "instruction"
    ]);
    expect(plan.mappingReport.ignoredFields).toEqual(
      expect.arrayContaining([
        {
          field: "output.bitrate",
          reason: "CosyVoice HTTP SpeechSynthesizer does not expose bitrate control."
        },
        {
          field: "output.channels",
          reason: "CosyVoice HTTP SpeechSynthesizer does not expose channel control."
        },
        {
          field: "controls.style",
          reason: "CosyVoice style control should be expressed through vendor.extensions.cosyvoice.params.instruction."
        },
        {
          field: "vendor.extensions.cosyvoice.unknown",
          reason: "CosyVoice adapter does not support this vendor extension key."
        }
      ])
    );
  });

  it("requires an explicit voice id because CosyVoice v3.5 has no default system voice", async () => {
    const adapter = new CosyVoiceTTSAdapter();
    await expect(
      adapter.plan({
        operation: "tts.sync",
        providerId: "cosyvoice",
        text: "missing voice",
        voice: {}
      })
    ).rejects.toThrow("CosyVoice requires voice.voiceId/providerVoiceId");
  });

  it("executes HTTP sync synthesis and downloads the returned audio URL", async () => {
    const fetchCalls: Array<{ url: string; jsonBody?: unknown }> = [];
    const adapter = new CosyVoiceTTSAdapter({
      apiKey: "test-key",
      workspaceId: "workspace123",
      fetch: async (url, init) => {
        const call: { url: string; jsonBody?: unknown } = {
          url: String(url)
        };
        if (typeof init?.body === "string") {
          call.jsonBody = JSON.parse(init.body) as unknown;
        }
        fetchCalls.push(call);

        if (String(url) === "https://audio.example.com/out.mp3") {
          return new Response(new Uint8Array([1, 2, 3, 4]), {
            status: 200,
            headers: {
              "Content-Type": "audio/mpeg"
            }
          });
        }

        return new Response(
          JSON.stringify({
            output: {
              audio: {
                url: "https://audio.example.com/out.mp3"
              }
            },
            request_id: "req_123"
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
      providerId: "cosyvoice",
      text: "audio",
      voice: {
        providerVoiceId: "voice_abc"
      }
    });
    if (plan.operation !== "tts.sync") {
      throw new Error("Expected sync plan.");
    }

    const result = await adapter.synthesizeSync(plan);

    expect(fetchCalls[0]).toMatchObject({
      url: "https://workspace123.cn-beijing.maas.aliyuncs.com/api/v1/services/audio/tts/SpeechSynthesizer",
      jsonBody: {
        model: "cosyvoice-v3.5-plus",
        input: {
          text: "audio",
          voice: "voice_abc"
        }
      }
    });
    expect(fetchCalls[1]?.url).toBe("https://audio.example.com/out.mp3");
    expect([...result.audio.data]).toEqual([1, 2, 3, 4]);
    expect(result.audio.format).toBe("mp3");
    expect(result.audio.sampleRateHz).toBe(24000);
    expect(result.vendorResponse.request_id).toBe("req_123");
  });

  it("plans and executes CosyVoice voice clone with an HTTP reference URL", async () => {
    const fetchCalls: Array<{ url: string; jsonBody?: unknown }> = [];
    const adapter = new CosyVoiceTTSAdapter({
      apiKey: "test-key",
      workspaceId: "workspace123",
      fetch: async (url, init) => {
        const call: { url: string; jsonBody?: unknown } = {
          url: String(url)
        };
        if (typeof init?.body === "string") {
          call.jsonBody = JSON.parse(init.body) as unknown;
        }
        fetchCalls.push(call);
        return new Response(
          JSON.stringify({
            output: {
              voice_id: "voice_created"
            }
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
      providerId: "cosyvoice",
      displayName: "Customer Service Voice",
      referenceAudio: [
        {
          uri: "https://example.com/source.wav",
          format: "wav"
        }
      ],
      vendor: {
        mode: "prefer_vendor",
        extensions: {
          cosyvoice: {
            schemaVersion: "1.0.0",
            params: {
              prefix: "custom_prefix"
            }
          }
        }
      }
    });
    if (plan.operation !== "voice.clone.create") {
      throw new Error("Expected voice clone plan.");
    }

    expect(plan.vendorRequest).toMatchObject({
      model: "voice-enrollment",
      input: {
        action: "create_voice",
        target_model: "cosyvoice-v3.5-plus",
        prefix: "custom_prefix",
        url: "https://example.com/source.wav"
      }
    });
    const result = await adapter.createVoiceClone(plan);

    expect(fetchCalls[0]).toMatchObject({
      url: "https://workspace123.cn-beijing.maas.aliyuncs.com/api/v1/services/audio/tts/customization"
    });
    expect(result.voice).toMatchObject({
      voiceId: "cosyvoice:voice_created",
      providerId: "cosyvoice",
      providerVoiceId: "voice_created",
      displayName: "Customer Service Voice",
      source: "cloned",
      modelId: "cosyvoice-v3.5-plus"
    });
  });

  it("rejects voice clone reference audio that is not an HTTP URL", async () => {
    const adapter = new CosyVoiceTTSAdapter();
    await expect(
      adapter.plan({
        operation: "voice.clone.create",
        providerId: "cosyvoice",
        displayName: "Local Voice",
        referenceAudio: [
          {
            uri: "file:///tmp/source.wav",
            format: "wav"
          }
        ]
      })
    ).rejects.toThrow("CosyVoice voice clone requires referenceAudio[0].uri to be an HTTP URL.");
  });

  it("streams through the injectable CosyVoice upstream WebSocket transport", async () => {
    const sentFrames: Array<{ header?: { action?: string }; payload?: unknown }> = [];
    let capturedUrl = "";
    let capturedHeaders: Record<string, string> = {};
    const factory: CosyVoiceWebSocketFactory = (url, options) => {
      capturedUrl = url;
      capturedHeaders = options.headers;
      return new FakeCosyVoiceSocket(sentFrames);
    };
    const adapter = new CosyVoiceTTSAdapter({
      apiKey: "test-key",
      workspaceId: "workspace123",
      webSocketFactory: factory
    });
    const plan = await adapter.plan({
      operation: "tts.stream",
      providerId: "cosyvoice",
      text: "stream me",
      voice: {
        providerVoiceId: "voice_stream"
      },
      stream: {
        protocol: "websocket",
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

    expect(plan.vendorRequest).toMatchObject({
      stream: true,
      wsEndpoint: "wss://__workspace_id__.cn-beijing.maas.aliyuncs.com/api-ws/v1/inference/",
      wsTask: {
        header: {
          action: "run-task",
          streaming: "duplex"
        }
      }
    });
    expect(capturedUrl).toBe("wss://workspace123.cn-beijing.maas.aliyuncs.com/api-ws/v1/inference/");
    expect(capturedHeaders).toMatchObject({
      Authorization: "bearer test-key",
      "X-DashScope-DataInspection": "enable"
    });
    expect(sentFrames.map((frame) => frame.header?.action)).toEqual([
      "run-task",
      "continue-task",
      "finish-task"
    ]);
    expect(sentFrames[1]).toMatchObject({
      payload: {
        input: {
          text: "stream me"
        }
      }
    });
    expect(events.map((event) => event.type)).toEqual([
      "session.started",
      "metadata",
      "metadata",
      "metadata",
      "metadata",
      "audio.chunk",
      "metadata",
      "session.completed"
    ]);
    const audioEvent = events.find((event) => event.type === "audio.chunk");
    expect(audioEvent?.type === "audio.chunk" ? [...audioEvent.data] : []).toEqual([9, 8, 7]);
  });

  it("streams through the DashScope global inference endpoint without a workspace id", async () => {
    const sentFrames: Array<{ header?: { action?: string }; payload?: unknown }> = [];
    let capturedUrl = "";
    const adapter = new CosyVoiceTTSAdapter({
      apiKey: "test-key",
      webSocketFactory: (url) => {
        capturedUrl = url;
        return new FakeCosyVoiceSocket(sentFrames);
      }
    });
    const plan = await adapter.plan({
      operation: "tts.stream",
      providerId: "cosyvoice",
      text: "global endpoint",
      voice: {
        providerVoiceId: "voice_stream"
      }
    });
    if (plan.operation !== "tts.stream") {
      throw new Error("Expected stream plan.");
    }

    const events = [];
    for await (const event of adapter.synthesizeStream(plan)) {
      events.push(event.type);
    }

    expect(plan.vendorRequest.wsEndpoint).toBe("wss://dashscope.aliyuncs.com/api-ws/v1/inference");
    expect(capturedUrl).toBe("wss://dashscope.aliyuncs.com/api-ws/v1/inference");
    expect(sentFrames.map((frame) => frame.header?.action)).toEqual([
      "run-task",
      "continue-task",
      "finish-task"
    ]);
    expect(events).toContain("audio.chunk");
    expect(events).toContain("session.completed");
  });

  it("normalizes the DashScope realtime endpoint to inference before sending CosyVoice task frames", async () => {
    const sentFrames: Array<{ header?: { action?: string }; payload?: unknown }> = [];
    let capturedUrl = "";
    const adapter = new CosyVoiceTTSAdapter({
      apiKey: "test-key",
      streamEndpoint: "wss://dashscope.aliyuncs.com/api-ws/v1/realtime",
      webSocketFactory: (url) => {
        capturedUrl = url;
        return new FakeCosyVoiceSocket(sentFrames);
      }
    });
    const plan = await adapter.plan({
      operation: "tts.stream",
      providerId: "cosyvoice",
      text: "wrong endpoint",
      voice: {
        providerVoiceId: "voice_stream"
      }
    });
    if (plan.operation !== "tts.stream") {
      throw new Error("Expected stream plan.");
    }

    expect(plan.vendorRequest.wsEndpoint).toBe("wss://dashscope.aliyuncs.com/api-ws/v1/inference");
    expect(plan.mappingReport.warnings).toContain(
      "DashScope /api-ws/v1/realtime uses a different realtime protocol. The adapter normalized this endpoint to /api-ws/v1/inference for CosyVoice task frames."
    );
    const events = [];
    for await (const event of adapter.synthesizeStream(plan)) {
      events.push(event.type);
    }

    expect(capturedUrl).toBe("wss://dashscope.aliyuncs.com/api-ws/v1/inference");
    expect(sentFrames.map((frame) => frame.header?.action)).toEqual([
      "run-task",
      "continue-task",
      "finish-task"
    ]);
    expect(events).toContain("session.completed");
  });

  it("exposes CosyVoice vendor extension schemas", () => {
    expect(cosyVoiceExtensionSchema("tts.sync").jsonSchema).toMatchObject({
      properties: {
        instruction: {
          type: "string"
        }
      }
    });
    expect(cosyVoiceExtensionSchema("voice.clone.create").jsonSchema).toMatchObject({
      properties: {
        prefix: {
          type: "string"
        }
      }
    });
  });
});

type FakeSocketListener = (...args: never[]) => void;

class FakeCosyVoiceSocket implements CosyVoiceWebSocketLike {
  private readonly listeners = new Map<string, FakeSocketListener[]>();

  constructor(private readonly sentFrames: Array<{ header?: { action?: string }; payload?: unknown }>) {
    queueMicrotask(() => {
      this.emit("open");
    });
  }

  // on: 入参为事件名和监听器；功能是登记 fake WebSocket 事件监听器。
  on(event: "open" | "message" | "error" | "close", listener: FakeSocketListener): void {
    const listeners = this.listeners.get(event) ?? [];
    listeners.push(listener);
    this.listeners.set(event, listeners);
  }

  // send: 入参为 JSON 字符串；功能是模拟 CosyVoice 上游根据 action 返回事件和音频。
  send(data: string): void {
    const frame = JSON.parse(data) as { header?: { action?: string }; payload?: unknown };
    this.sentFrames.push(frame);
    if (frame.header?.action === "run-task") {
      queueMicrotask(() => {
        this.emitText({
          header: {
            event: "task-started"
          }
        });
      });
    }
    if (frame.header?.action === "continue-task") {
      queueMicrotask(() => {
        this.emit("message", Buffer.from([9, 8, 7]), true);
      });
    }
    if (frame.header?.action === "finish-task") {
      queueMicrotask(() => {
        this.emitText({
          header: {
            event: "task-finished"
          }
        });
      });
    }
  }

  // close: 入参为关闭码和原因；功能是模拟上游连接关闭。
  close(code = 1000, reason = "closed"): void {
    queueMicrotask(() => {
      this.emit("close", code, Buffer.from(reason));
    });
  }

  private emitText(payload: unknown): void {
    this.emit("message", Buffer.from(JSON.stringify(payload)), false);
  }

  private emit(event: string, ...args: unknown[]): void {
    for (const listener of this.listeners.get(event) ?? []) {
      (listener as (...items: unknown[]) => void)(...args);
    }
  }
}
