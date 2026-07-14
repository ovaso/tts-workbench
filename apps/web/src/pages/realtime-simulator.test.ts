import { describe, expect, it } from "vitest";
import {
  buildRealtimeSimulatorParameters,
  buildRealtimeSimulatorProxyUrl,
  buildRealtimeSimulatorStartMessage,
  buildRealtimeSimulatorTextMessages,
  calculateRealtimeSimulatorPcmDurationMs,
  calculateRealtimeSimulatorRtf,
  concatenateRealtimeSimulatorAudio,
  createRealtimeSimulatorWav,
  parseRealtimeSimulatorBridgeMessage,
  realtimeSimulatorLayout,
  resolveRealtimeSimulatorPlaybackRate,
  splitRealtimeSimulatorText,
  validateRealtimeSimulatorModelConfig
} from "./realtime-simulator";

describe("realtime simulator helpers", () => {
  it("places connection and text panels side by side with a full-width timeline", () => {
    expect(realtimeSimulatorLayout()).toEqual({
      connectionColumns: 6,
      textColumns: 6,
      timelineColumns: 12
    });
  });

  it("builds the FreeSWITCH proxy URL and validates required model fields", () => {
    const proxyUrl = buildRealtimeSimulatorProxyUrl({
      endpoint: "ws://127.0.0.1:8887/api/general/tts",
      modelName: "douBaoV3Bidirection",
      modelParam: "seed-tts-1.0",
      voiceParam: "speaker-a",
      callId: "sim-1"
    });
    const parsed = new URL(proxyUrl);

    expect(parsed.searchParams.get("modelName")).toBe("douBaoV3Bidirection");
    expect(parsed.searchParams.get("voiceParam")).toBe("speaker-a");
    expect(validateRealtimeSimulatorModelConfig("douBaoV3Bidirection", "", "")).toEqual([
      "豆包 V3 双向流 必须填写模型参数",
      "豆包 V3 双向流 必须填写音色参数"
    ]);
    expect(validateRealtimeSimulatorModelConfig("lightningRealtime", "", "")).toEqual([]);
  });

  it("preserves blank lines and marks the first content chunk as sentence start", () => {
    const chunks = splitRealtimeSimulatorText("第一行\n\n第三行\n", true);
    const parameters = buildRealtimeSimulatorParameters({
      format: "pcm",
      sampleRate: 8000,
      speechRate: 1,
      voiceParam: "speaker-a"
    });
    const start = buildRealtimeSimulatorStartMessage({
      eventId: "evt-1",
      modelName: "douBaoV3Bidirection",
      callId: "sim-1",
      parameters
    });
    const tasks = buildRealtimeSimulatorTextMessages({
      chunks,
      eventId: "evt-1",
      modelName: "douBaoV3Bidirection",
      callId: "sim-1",
      parameters
    });

    expect(chunks).toEqual(["第一行", "", "第三行", ""]);
    expect(start.eventType).toBe("start_session");
    expect(tasks.map((task) => task.sentenceStart)).toEqual([1, 0, 0, 0]);
  });

  it("calculates PCM metrics and exports a standard WAV header", () => {
    expect(resolveRealtimeSimulatorPlaybackRate("minimaxRealtime", 24000)).toBe(8000);
    expect(calculateRealtimeSimulatorPcmDurationMs(16000, 8000)).toBe(1000);
    expect(calculateRealtimeSimulatorRtf(500, 1000)).toBe(0.5);

    const audio = concatenateRealtimeSimulatorAudio([
      new Uint8Array([1, 2]),
      new Uint8Array([3, 4])
    ]);
    const wav = createRealtimeSimulatorWav(audio, 8000);
    const view = new DataView(wav.buffer);

    expect(new TextDecoder().decode(wav.slice(0, 4))).toBe("RIFF");
    expect(view.getUint32(24, true)).toBe(8000);
    expect(view.getUint32(40, true)).toBe(4);
    expect([...wav.slice(44)]).toEqual([1, 2, 3, 4]);
  });

  it("parses bridge control events without trusting arbitrary JSON", () => {
    expect(
      parseRealtimeSimulatorBridgeMessage(
        JSON.stringify({ type: "bridge_open", connectionLatencyMs: 12, target: "ws://target" })
      )
    ).toEqual({ type: "bridge_open", connectionLatencyMs: 12, target: "ws://target" });
    expect(parseRealtimeSimulatorBridgeMessage("{broken")).toBeUndefined();
    expect(parseRealtimeSimulatorBridgeMessage(JSON.stringify({ type: "bridge_open" }))).toBeUndefined();
  });
});
