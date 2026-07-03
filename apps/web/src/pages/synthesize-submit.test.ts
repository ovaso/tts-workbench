import { describe, expect, it } from "vitest";
import { voiceInputValue } from "./synthesize-submit";

describe("synthesize submit helpers", () => {
  it("normalizes typed, selected, and cleared voice input values", () => {
    expect(voiceInputValue("  provider_voice  ")).toBe("provider_voice");
    expect(voiceInputValue({ title: "Cloned Voice", value: "minimax:cloned_voice" })).toBe(
      "minimax:cloned_voice"
    );
    expect(voiceInputValue(null)).toBe("");
  });
});
