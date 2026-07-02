import { describe, expect, it } from "vitest";
import { MiniMaxTTSAdapter } from "../adapters/minimax/adapter";

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
});
