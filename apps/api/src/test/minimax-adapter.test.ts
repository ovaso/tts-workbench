import { describe, expect, it } from "vitest";
import { MiniMaxTTSAdapter } from "../adapters/minimax/adapter";
import { minimaxExtensionSchema } from "../adapters/minimax/extension-schema";

describe("MiniMaxTTSAdapter", () => {
  it("plans MiniMax sync TTS with canonical fields, defaults, and vendor extensions", async () => {
    const adapter = new MiniMaxTTSAdapter();
    const plan = await adapter.plan({
      operation: "tts.sync",
      providerId: "minimax",
      text: "今天是不是很开心呀(laughs)，当然了！",
      model: "speech-2.8-hd",
      voice: {
        providerVoiceId: "male-qn-qingse",
        language: "zh"
      },
      output: {
        format: "mp3",
        sampleRateHz: 32000,
        bitrate: 128000,
        channels: 1
      },
      controls: {
        speed: 1,
        volume: 1,
        pitch: 0,
        emotion: "happy",
        style: "narration"
      },
      vendor: {
        mode: "prefer_vendor",
        extensions: {
          minimax: {
            schemaVersion: "1.0.0",
            params: {
              language_boost: "Chinese",
              subtitle_enable: false,
              output_format: "hex",
              unknown_feature: true
            }
          }
        }
      }
    });

    expect(plan.operation).toBe("tts.sync");
    expect(plan.vendorRequest).toMatchObject({
      model: "speech-2.8-hd",
      stream: false,
      voice_setting: {
        voice_id: "male-qn-qingse",
        speed: 1,
        vol: 1,
        pitch: 0,
        emotion: "happy"
      },
      audio_setting: {
        sample_rate: 32000,
        bitrate: 128000,
        format: "mp3",
        channel: 1
      },
      language_boost: "Chinese",
      subtitle_enable: false,
      output_format: "hex"
    });
    expect(plan.mappingReport.appliedVendorExtensions.map((extension) => extension.path)).toEqual([
      "language_boost",
      "subtitle_enable",
      "output_format"
    ]);
    expect(plan.mappingReport.ignoredFields).toEqual(
      expect.arrayContaining([
        {
          field: "controls.style",
          reason: "MiniMax model 'speech-2.8-hd' does not expose canonical style control."
        },
        {
          field: "vendor.extensions.minimax.unknown_feature",
          reason: "MiniMax adapter does not support this vendor extension key."
        }
      ])
    );
  });

  it("executes sync synthesis through injectable fetch and decodes hex audio", async () => {
    const adapter = new MiniMaxTTSAdapter({
      apiKey: "test-key",
      fetch: async (_url, _init) =>
        new Response(
          JSON.stringify({
            data: {
              audio: "00010203",
              status: 2
            },
            extra_info: {
              audio_sample_rate: 32000,
              audio_format: "mp3"
            },
            trace_id: "trace_test",
            base_resp: {
              status_code: 0,
              status_msg: "success"
            }
          }),
          {
            status: 200,
            headers: {
              "Content-Type": "application/json"
            }
          }
        )
    });

    const plan = await adapter.plan({
      operation: "tts.sync",
      providerId: "minimax",
      text: "audio",
      voice: {
        providerVoiceId: "male-qn-qingse"
      }
    });
    expect(plan.operation).toBe("tts.sync");
    if (plan.operation !== "tts.sync") {
      throw new Error("Expected sync plan.");
    }
    const result = await adapter.synthesizeSync(plan);

    expect(result.audio.format).toBe("mp3");
    expect(result.audio.sampleRateHz).toBe(32000);
    expect([...result.audio.data]).toEqual([0, 1, 2, 3]);
    expect(result.vendorResponse.trace_id).toBe("trace_test");
  });

  it("uses the model default voice when request voice is empty", async () => {
    const adapter = new MiniMaxTTSAdapter();
    const plan = await adapter.plan({
      operation: "tts.sync",
      providerId: "minimax",
      text: "default voice",
      voice: {}
    });

    expect(plan.vendorRequest).toMatchObject({
      voice_setting: {
        voice_id: "Chinese (Mandarin)_Gentleman"
      }
    });
    expect(plan.mappingReport.appliedCanonicalFields.map((field) => field.field)).not.toContain("voice");
  });

  it("normalizes a local MiniMax voice id before sending the vendor request", async () => {
    const adapter = new MiniMaxTTSAdapter();
    const plan = await adapter.plan({
      operation: "tts.sync",
      providerId: "minimax",
      text: "local voice",
      voice: {
        providerVoiceId: "minimax:cloned_voice"
      }
    });

    expect(plan.vendorRequest).toMatchObject({
      voice_setting: {
        voice_id: "cloned_voice"
      }
    });
  });

  it("exposes only user-editable MiniMax voice clone extras through the vendor extension schema", () => {
    const schema = minimaxExtensionSchema("voice.clone.create").jsonSchema;

    expect(schema).toMatchObject({
      properties: {
        clone_prompt: {
          type: "object",
          properties: {
            prompt_text: {
              type: "string"
            }
          }
        },
        text: {
          type: "string"
        }
      }
    });
    expect(Object.keys((schema.properties ?? {}) as Record<string, unknown>)).not.toContain("file_id");
    expect(Object.keys((schema.properties ?? {}) as Record<string, unknown>)).not.toContain("voice_id");
    expect(Object.keys((schema.properties ?? {}) as Record<string, unknown>)).not.toContain("model");
  });

  it("plans voice clone and ignores upload-derived vendor extension fields", async () => {
    const adapter = new MiniMaxTTSAdapter();
    const plan = await adapter.plan({
      operation: "voice.clone.create",
      providerId: "minimax",
      displayName: "demo voice",
      model: "speech-2.8-hd",
      referenceAudio: [
        {
          uri: "https://example.com/audio.mp3",
          fileId: "file_existing"
        }
      ],
      vendor: {
        mode: "prefer_vendor",
        extensions: {
          minimax: {
            schemaVersion: "1.0.0",
            params: {
              clone_prompt: {
                prompt_audio: "should_be_ignored",
                prompt_text: "sample words"
              },
              text: "preview text"
            }
          }
        }
      }
    });

    expect(plan.operation).toBe("voice.clone.create");
    expect(plan.vendorRequest).toMatchObject({
      clone: {
        file_id: "file_existing",
        voice_id: "demo_voice",
        model: "speech-2.8-hd",
        clone_prompt: {
          prompt_text: "sample words"
        },
        text: "preview text"
      }
    });
    expect(plan.mappingReport.ignoredFields).toContainEqual({
      field: "vendor.extensions.minimax.clone_prompt.prompt_audio",
      reason: "MiniMax adapter fills this clone_prompt field from uploaded files or does not support it."
    });
  });

  it("ignores MiniMax vendor extension values that do not match the schema", async () => {
    const adapter = new MiniMaxTTSAdapter();
    const plan = await adapter.plan({
      operation: "tts.sync",
      providerId: "minimax",
      text: "schema validation",
      voice: {},
      vendor: {
        mode: "prefer_vendor",
        extensions: {
          minimax: {
            schemaVersion: "1.0.0",
            params: {
              subtitle_enable: "yes",
              output_format: "binary"
            }
          }
        }
      }
    });

    expect(plan.vendorRequest).not.toHaveProperty("subtitle_enable");
    expect(plan.vendorRequest).not.toHaveProperty("output_format");
    expect(plan.mappingReport.ignoredFields).toEqual(
      expect.arrayContaining([
        {
          field: "vendor.extensions.minimax.subtitle_enable",
          reason: "MiniMax vendor extension value does not match the declared schema."
        },
        {
          field: "vendor.extensions.minimax.output_format",
          reason: "MiniMax vendor extension value does not match the declared schema."
        }
      ])
    );
  });

  it("executes voice clone with an existing uploaded file id", async () => {
    const fetchCalls: string[] = [];
    const adapter = new MiniMaxTTSAdapter({
      apiKey: "test-key",
      fetch: async (url) => {
        fetchCalls.push(String(url));
        return new Response(
          JSON.stringify({
            data: {
              voice_id: "cloned_voice"
            },
            base_resp: {
              status_code: 0,
              status_msg: "success"
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
      providerId: "minimax",
      displayName: "Cloned Voice",
      referenceAudio: [
        {
          uri: "",
          fileId: "file_existing"
        }
      ]
    });
    if (plan.operation !== "voice.clone.create") {
      throw new Error("Expected voice clone plan.");
    }

    const result = await adapter.createVoiceClone(plan);

    expect(fetchCalls).toEqual(["https://api.minimaxi.com/v1/voice_clone"]);
    expect(result.voice.providerVoiceId).toBe("cloned_voice");
    expect(result.voice.clone?.referenceAudioIds).toEqual(["file_existing"]);
  });

  it("uploads reference audio before voice clone when file id is missing", async () => {
    const fetchCalls: Array<{ url: string; bodyType?: string; purpose?: string; jsonBody?: unknown }> = [];
    const adapter = new MiniMaxTTSAdapter({
      apiKey: "test-key",
      fetch: async (url, init) => {
        const body = init?.body;
        const call: { url: string; bodyType?: string; purpose?: string; jsonBody?: unknown } = {
          url: String(url),
          bodyType: body instanceof FormData ? "form-data" : typeof body
        };
        if (body instanceof FormData) {
          call.purpose = String(body.get("purpose"));
        }
        if (typeof body === "string") {
          call.jsonBody = JSON.parse(body) as unknown;
        }
        fetchCalls.push(call);

        if (String(url).startsWith("data:")) {
          return new Response(new Uint8Array([1, 2, 3]), {
            status: 200,
            headers: {
              "Content-Type": "audio/mpeg"
            }
          });
        }

        if (String(url).endsWith("/v1/files/upload")) {
          return new Response(
            JSON.stringify({
              file: {
                file_id: 415715405590927
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

        return new Response(
          JSON.stringify({
            data: {
              voice_id: "cloned_from_upload"
            },
            base_resp: {
              status_code: 0,
              status_msg: "success"
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
      providerId: "minimax",
      displayName: "Uploaded Voice",
      referenceAudio: [
        {
          uri: "data:audio/mpeg;base64,AQID",
          format: "mp3"
        }
      ]
    });
    if (plan.operation !== "voice.clone.create") {
      throw new Error("Expected voice clone plan.");
    }

    const result = await adapter.createVoiceClone(plan);

    expect(fetchCalls.map((call) => call.url)).toEqual([
      "data:audio/mpeg;base64,AQID",
      "https://api.minimaxi.com/v1/files/upload",
      "https://api.minimaxi.com/v1/voice_clone"
    ]);
    expect(fetchCalls[1]).toMatchObject({
      bodyType: "form-data",
      purpose: "voice_clone"
    });
    expect(fetchCalls[2]?.jsonBody).toMatchObject({
      file_id: 415715405590927,
      voice_id: "Uploaded_Voice"
    });
    expect(result.voice.providerVoiceId).toBe("cloned_from_upload");
    expect(result.voice.clone?.referenceAudioIds).toEqual(["415715405590927"]);
  });

  it("treats non-zero MiniMax voice clone base_resp as a failed clone", async () => {
    const adapter = new MiniMaxTTSAdapter({
      apiKey: "test-key",
      fetch: async () =>
        new Response(
          JSON.stringify({
            input_sensitive: false,
            demo_audio: "",
            base_resp: {
              status_code: 2013,
              status_msg: "invalid params"
            }
          }),
          {
            status: 200,
            headers: {
              "Content-Type": "application/json"
            }
          }
        )
    });

    const plan = await adapter.plan({
      operation: "voice.clone.create",
      providerId: "minimax",
      displayName: "Valid Voice",
      referenceAudio: [
        {
          uri: "",
          fileId: "415715405590927"
        }
      ]
    });
    if (plan.operation !== "voice.clone.create") {
      throw new Error("Expected voice clone plan.");
    }

    await expect(adapter.createVoiceClone(plan)).rejects.toThrow("MiniMax voice clone returned an error.");
  });

  it("plans stream synthesis and emits stream lifecycle events", async () => {
    const adapter = new MiniMaxTTSAdapter();
    const plan = await adapter.plan({
      operation: "tts.stream",
      providerId: "minimax",
      text: "stream me",
      voice: {}
    });
    if (plan.operation !== "tts.stream") {
      throw new Error("Expected stream plan.");
    }

    const events = [];
    for await (const event of adapter.synthesizeStream(plan)) {
      events.push(event.type);
    }

    expect(plan.vendorRequest.stream).toBe(true);
    expect(events).toEqual(["session.started", "metadata", "session.completed"]);
  });
});
