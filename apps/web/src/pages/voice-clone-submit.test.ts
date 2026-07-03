import { describe, expect, it } from "vitest";
import { fileToDataUrl, referenceAudioFormat, selectedReferenceFile } from "./voice-clone-submit";

describe("voice clone submit helpers", () => {
  it("selects the first reference file from Vuetify file input values", () => {
    const first = new File(["a"], "first.mp3", { type: "audio/mpeg" });
    const second = new File(["b"], "second.wav", { type: "audio/wav" });

    expect(selectedReferenceFile(first)).toBe(first);
    expect(selectedReferenceFile([first, second])).toBe(first);
    expect(selectedReferenceFile(null)).toBeUndefined();
  });

  it("detects MiniMax-supported reference audio formats", () => {
    expect(referenceAudioFormat(new File(["a"], "voice.mp3", { type: "" }))).toBe("mp3");
    expect(referenceAudioFormat(new File(["a"], "voice.m4a", { type: "" }))).toBe("m4a");
    expect(referenceAudioFormat(new File(["a"], "voice.wav", { type: "" }))).toBe("wav");
    expect(referenceAudioFormat(new File(["a"], "voice.bin", { type: "audio/mpeg" }))).toBe("mp3");
  });

  it("converts a local reference file into a data URL for the JSON clone route", async () => {
    const file = new File([new Uint8Array([1, 2, 3])], "voice.mp3", {
      type: "audio/mpeg"
    });

    await expect(fileToDataUrl(file)).resolves.toBe("data:audio/mpeg;base64,AQID");
  });
});
