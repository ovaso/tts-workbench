import { describe, expect, it } from "vitest";
import { canPlayInlineAudio, downloadOnlyMessageForAudioFormat } from "./audio-playback";

describe("audio playback helpers", () => {
  it("only treats mp3 and unknown legacy format as inline playable", () => {
    expect(canPlayInlineAudio("mp3")).toBe(true);
    expect(canPlayInlineAudio(undefined)).toBe(true);
    expect(canPlayInlineAudio("wav")).toBe(false);
    expect(canPlayInlineAudio("flac")).toBe(false);
    expect(canPlayInlineAudio("pcm")).toBe(false);
    expect(canPlayInlineAudio("ogg")).toBe(false);
  });

  it("explains why wav is download-only", () => {
    expect(downloadOnlyMessageForAudioFormat("wav")).toContain("WAV 已归档");
    expect(downloadOnlyMessageForAudioFormat("wav")).toContain("mp3");
  });
});
