import { describe, expect, it } from "vitest";
import {
  deleteVoiceConfirmationText,
  modelInputValue,
  sourceColor,
  sourceLabel,
  voiceManagementActionLabels
} from "./voice-management";

describe("voice management helpers", () => {
  it("maps voice sources to reader-facing labels", () => {
    expect(sourceLabel("external")).toBe("外部控制台");
    expect(sourceLabel("vendor_builtin")).toBe("厂商内置");
    expect(sourceLabel("cloned")).toBe("复刻生成");
  });

  it("maps voice sources to material chip colors", () => {
    expect(sourceColor("external")).toBe("indigo");
    expect(sourceColor("vendor_builtin")).toBe("teal");
    expect(sourceColor("cloned")).toBe("primary");
  });

  it("builds the managed voice delete confirmation text", () => {
    expect(deleteVoiceConfirmationText({ displayName: "External Voice" })).toBe(
      "确认移除音色「External Voice」吗？"
    );
  });

  it("keeps the primary management actions list-first", () => {
    expect(voiceManagementActionLabels()).toEqual({
      register: "登记音色",
      clone: "参考音频创建"
    });
  });

  it("normalizes manual model input values", () => {
    expect(modelInputValue(" speech-2.8-hd ")).toBe("speech-2.8-hd");
    expect(modelInputValue({ title: "Speech HD", value: "speech-2.8-hd" })).toBe("speech-2.8-hd");
    expect(modelInputValue(null)).toBe("");
  });
});
