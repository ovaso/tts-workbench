import { describe, expect, it } from "vitest";
import type { RawData } from "ws";
import {
  attachRealtimeSimulatorBridge,
  isAllowedRealtimeSimulatorOrigin,
  validateRealtimeSimulatorTargetUrl,
  type RealtimeSimulatorWebSocketFactory
} from "../routes/realtime-simulator";

describe("realtime simulator bridge", () => {
  it("accepts websocket targets and rejects http targets", () => {
    expect(validateRealtimeSimulatorTargetUrl("ws://127.0.0.1:8887/api/general/tts").protocol).toBe(
      "ws:"
    );
    expect(validateRealtimeSimulatorTargetUrl("wss://example.com/tts").protocol).toBe("wss:");
    expect(() => validateRealtimeSimulatorTargetUrl("http://127.0.0.1:8887/tts")).toThrow(
      "只允许使用"
    );
  });

  it("only accepts local browser origins", () => {
    expect(isAllowedRealtimeSimulatorOrigin("http://localhost:5173")).toBe(true);
    expect(isAllowedRealtimeSimulatorOrigin("http://127.0.0.1:5173")).toBe(true);
    expect(isAllowedRealtimeSimulatorOrigin("https://evil.example")).toBe(false);
  });

  it("adds the transient bearer token and forwards text and binary frames", () => {
    const browser = new FakeSocket();
    const upstream = new FakeSocket();
    let authorization = "";
    const factory: RealtimeSimulatorWebSocketFactory = (_url, options) => {
      authorization = String(options.headers?.Authorization ?? "");
      return upstream;
    };

    attachRealtimeSimulatorBridge(browser, factory);
    browser.emitMessage(
      JSON.stringify({
        type: "connect",
        proxyUrl: "ws://127.0.0.1:8887/api/general/tts",
        apiKey: "secret"
      })
    );
    upstream.emitOpen();
    browser.emitMessage(JSON.stringify({ type: "proxy_text", payload: "{\"eventType\":\"start_session\"}" }));
    upstream.emitMessage("{\"eventType\":\"session_started\"}");
    upstream.emitMessage(Buffer.from([1, 2, 3]), true);

    expect(authorization).toBe("bearer secret");
    expect(upstream.sent).toContain("{\"eventType\":\"start_session\"}");
    expect(browser.sent.some((frame) => typeof frame === "string" && frame.includes("bridge_open"))).toBe(true);
    expect(browser.sent.some((frame) => typeof frame === "string" && frame.includes("proxy_text"))).toBe(true);
    expect(browser.sent).toContainEqual(Buffer.from([1, 2, 3]));
  });
});

type SocketListener = (...arguments_: never[]) => void;

class FakeSocket {
  readyState = 1;
  readonly sent: Array<string | Buffer> = [];
  private readonly listeners = new Map<string, SocketListener[]>();

  // on: 入参为事件名和监听器；功能是登记可控 WebSocket 测试替身的回调。
  on(event: string, listener: SocketListener): this {
    const listeners = this.listeners.get(event) ?? [];
    listeners.push(listener);
    this.listeners.set(event, listeners);
    return this;
  }

  // send: 入参为文本或二进制帧；功能是记录桥接实际发送的数据。
  send(data: string | Buffer): void {
    this.sent.push(data);
  }

  // close: 入参为关闭码和原因；功能是把测试替身标记为已关闭。
  close(): void {
    this.readyState = 3;
  }

  // emitOpen: 无入参；功能是触发上游连接成功事件。
  emitOpen(): void {
    this.emit("open");
  }

  // emitMessage: 入参为帧内容和是否二进制；功能是模拟 WebSocket 收到消息。
  emitMessage(data: string | Buffer, isBinary = false): void {
    const raw = typeof data === "string" ? Buffer.from(data) : data;
    this.emit("message", raw as RawData, isBinary);
  }

  // emit: 入参为事件名和事件参数；功能是同步触发指定监听器。
  private emit(event: string, ...arguments_: unknown[]): void {
    for (const listener of this.listeners.get(event) ?? []) {
      Reflect.apply(listener, this, arguments_);
    }
  }
}
