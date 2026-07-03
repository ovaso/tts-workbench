import { afterEach, describe, expect, it, vi } from "vitest";
import { apiUrl, errorMessageFromResponseBody, requestJson, webSocketUrl } from "./client";

const originalFetch = globalThis.fetch;

describe("api client", () => {
  afterEach(() => {
    globalThis.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  it("joins api base urls and paths predictably", () => {
    expect(apiUrl("/v1/providers", "http://localhost:4000/")).toBe(
      "http://localhost:4000/v1/providers"
    );
    expect(apiUrl("v1/runs", "http://localhost:4000")).toBe("http://localhost:4000/v1/runs");
    expect(webSocketUrl("/v1/tts/stream/session/ws", "http://localhost:4000")).toBe(
      "ws://localhost:4000/v1/tts/stream/session/ws"
    );
  });

  it("requests JSON through the shared ky wrapper", async () => {
    const fetchMock = vi.fn(async () => {
      return new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: {
          "content-type": "application/json"
        }
      });
    });
    globalThis.fetch = fetchMock as typeof fetch;

    const response = await requestJson<{ ok: boolean }>("/v1/test", {
      method: "POST",
      json: {
        hello: "ky"
      }
    });

    expect(response).toEqual({ ok: true });
    expect(fetchMock).toHaveBeenCalledOnce();
  });

  it("translates standard backend error payloads before they reach the UI", () => {
    const message = errorMessageFromResponseBody(
      JSON.stringify({
        error: {
          code: "vendor_execution_failed",
          message:
            "CosyVoice synthesis requires COSYVOICE_WORKSPACE_ID because HTTP synthesis and voice clone use the Model Studio Workspace endpoint. If you only need WebSocket synthesis without WorkspaceId, use tts.stream with wss://dashscope.aliyuncs.com/api-ws/v1/inference."
        }
      }),
      400
    );

    expect(message).toBe(
      "CosyVoice 合成需要配置 COSYVOICE_WORKSPACE_ID，因为 HTTP 合成和音色克隆使用阿里云百炼 Model Studio 的 Workspace 接口。如果只是想在没有 WorkspaceId 的情况下使用 WebSocket 合成，请使用流式合成，并配置 wss://dashscope.aliyuncs.com/api-ws/v1/inference。"
    );
  });
});
