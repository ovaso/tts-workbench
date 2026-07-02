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
    expect(plan.mappingReport.approximations).toEqual([
      {
        field: "output.sampleRateHz",
        requestedValue: 22050,
        actualValue: 24000,
        reason: "The requested sample rate was mapped to the nearest supported mock rate."
      }
    ]);
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
