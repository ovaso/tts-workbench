import { describe, expect, it } from "vitest";
import {
  TTS_OPERATIONS,
  isTTSOperation,
  type TTSSyncRequest,
  type VendorDirective
} from "../index";

describe("core contracts", () => {
  it("keeps the operation surface open for sync, stream, and voice clone lifecycles", () => {
    expect(TTS_OPERATIONS).toEqual([
      "tts.sync",
      "tts.stream",
      "voice.clone.create",
      "voice.clone.instant",
      "voice.clone.delete"
    ]);
    expect(isTTSOperation("tts.sync")).toBe(true);
    expect(isTTSOperation("tts.batch")).toBe(false);
  });

  it("allows vendor extensions only behind an explicit directive boundary", () => {
    const vendor: VendorDirective = {
      mode: "prefer_vendor",
      extensions: {
        mock: {
          schemaVersion: "1.0.0",
          params: {
            toneHz: 440
          }
        }
      }
    };

    const request: TTSSyncRequest = {
      operation: "tts.sync",
      providerId: "mock",
      text: "hello",
      voice: {
        providerVoiceId: "mock-voice"
      },
      output: {
        format: "wav",
        sampleRateHz: 24000
      },
      vendor
    };

    expect(request.vendor?.extensions?.mock?.params.toneHz).toBe(440);
  });
});
