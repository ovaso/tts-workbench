import { describe, expect, it } from "vitest";
import { audioContentType } from "../routes/runs";

describe("runs routes", () => {
  it("returns browser-playable content types for archived audio", () => {
    expect(audioContentType("audio.wav")).toBe("audio/wav");
    expect(audioContentType("audio.mp3")).toBe("audio/mpeg");
    expect(audioContentType("audio.ogg")).toBe("audio/ogg");
    expect(audioContentType("audio.flac")).toBe("audio/flac");
    expect(audioContentType("audio.pcm")).toBe("audio/L16");
  });
});
