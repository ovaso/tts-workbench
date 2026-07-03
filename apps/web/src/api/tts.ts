import type { TTSSyncRequest, TTSSyncResult, TTSStreamRequest, TTSStreamSession } from "@tts-platform/core";
import { requestJson, webSocketUrl } from "./client";

export async function synthesizeSync(request: TTSSyncRequest): Promise<TTSSyncResult> {
  return requestJson<TTSSyncResult>("/v1/tts/sync", {
    method: "POST",
    json: request
  });
}

// synthesizeStream: 入参为流式合成请求；输出后端创建的 WebSocket stream session。
export async function synthesizeStream(request: TTSStreamRequest): Promise<TTSStreamSession> {
  return requestJson<TTSStreamSession>("/v1/tts/stream", {
    method: "POST",
    json: request
  });
}

// ttsStreamSocketUrl: 入参为 stream session；输出浏览器可连接的 WebSocket URL。
export function ttsStreamSocketUrl(session: TTSStreamSession): string {
  return webSocketUrl(session.url ?? `/v1/tts/stream/${session.sessionId}/ws`);
}
