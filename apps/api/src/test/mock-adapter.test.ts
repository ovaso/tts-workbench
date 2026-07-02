import { describe, expect, it } from "vitest";
import { MockTTSAdapter } from "../adapters/mock/adapter";

describe("MockTTSAdapter", () => {
  it("plans a sync request with canonical fields and vendor extensions in the mapping report", async () => {
    const adapter = new MockTTSAdapter();
    const plan = await adapter.plan({
      operation: "tts.sync",
      providerId: "mock",
      text: "Hello from the mock adapter",
      voice: {
        providerVoiceId: "mock-voice",
        language: "en"
      },
      output: {
        format: "wav",
        sampleRateHz: 22050
      },
      controls: {
        speed: 1.1,
        volume: 0.8
      },
      vendor: {
        mode: "prefer_vendor",
        extensions: {
          mock: {
            schemaVersion: "1.0.0",
            params: {
              toneHz: 550
            }
          }
        }
      }
    });

    expect(plan.operation).toBe("tts.sync");
    expect(plan.vendorRequest.toneHz).toBe(550);
    expect(plan.mappingReport.appliedCanonicalFields.map((field) => field.field)).toContain("text");
    expect(plan.mappingReport.appliedVendorExtensions).toEqual([
      {
        providerId: "mock",
        schemaVersion: "1.0.0",
        path: "toneHz",
        value: 550
      }
    ]);
    expect(plan.mappingReport.approximations).toEqual([]);
    expect(plan.mappingReport.ignoredFields).toEqual([
      {
        field: "output.sampleRateHz",
        reason: "Model 'mock-tts-v1' does not support sample rate '22050'. The vendor default is used."
      },
      {
        field: "controls.volume",
        reason: "The mock adapter records this control but does not alter waveform gain."
      }
    ]);
    expect(plan.vendorRequest.sampleRateHz).toBe(24000);
  });

  it("emits a wav provider result for a sync plan", async () => {
    const adapter = new MockTTSAdapter();
    const plan = await adapter.plan({
      operation: "tts.sync",
      providerId: "mock",
      text: "audio",
      voice: {
        providerVoiceId: "mock-voice"
      }
    });
    const result = await adapter.synthesizeSync?.(plan);

    expect(result?.audio.format).toBe("wav");
    expect(result?.audio.data.byteLength).toBeGreaterThan(44);
    expect(result?.vendorResponse.sampleRateHz).toBe(24000);
  });
});
