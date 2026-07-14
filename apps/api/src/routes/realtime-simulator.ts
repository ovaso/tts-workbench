import type { FastifyInstance } from "fastify";
import WebSocket, { type ClientOptions, type RawData } from "ws";

interface RealtimeSimulatorSocket {
  readonly readyState: number;
  on(event: "open", listener: () => void): this;
  on(event: "message", listener: (data: RawData, isBinary: boolean) => void): this;
  on(event: "close", listener: (code: number, reason: Buffer) => void): this;
  on(event: "error", listener: (error: Error) => void): this;
  send(data: string | Buffer): void;
  close(code?: number, reason?: string): void;
}

export type RealtimeSimulatorWebSocketFactory = (
  url: URL,
  options: ClientOptions
) => RealtimeSimulatorSocket;

export interface RealtimeSimulatorRouteOptions {
  webSocketFactory?: RealtimeSimulatorWebSocketFactory;
}

interface BrowserBridgeMessage {
  type: string;
  proxyUrl?: string;
  apiKey?: string;
  payload?: string;
}

// validateRealtimeSimulatorTargetUrl: 入参为用户配置的上游地址；输出仅允许 ws/wss 协议的 URL。
export function validateRealtimeSimulatorTargetUrl(target: string): URL {
  const url = new URL(target);
  if (url.protocol !== "ws:" && url.protocol !== "wss:") {
    throw new Error("代理地址只允许使用 ws:// 或 wss://");
  }
  return url;
}

// isAllowedRealtimeSimulatorOrigin: 入参为浏览器 Origin；输出是否来自本机页面，避免把调试桥接暴露给外部站点。
export function isAllowedRealtimeSimulatorOrigin(origin?: string): boolean {
  if (origin === undefined || origin.length === 0) {
    return true;
  }
  try {
    const url = new URL(origin);
    return (
      (url.protocol === "http:" || url.protocol === "https:") &&
      ["127.0.0.1", "localhost", "::1"].includes(url.hostname)
    );
  } catch {
    return false;
  }
}

// registerRealtimeSimulatorRoutes: 入参为 Fastify 实例和可选上游工厂；功能是注册独立的实时仿真桥接端点。
export async function registerRealtimeSimulatorRoutes(
  app: FastifyInstance,
  options: RealtimeSimulatorRouteOptions = {}
): Promise<void> {
  const webSocketFactory =
    options.webSocketFactory ??
    ((url: URL, clientOptions: ClientOptions) => new WebSocket(url, clientOptions));

  app.get(
    "/v1/realtime-simulator/bridge",
    { websocket: true },
    (browserSocket, request) => {
      if (!isAllowedRealtimeSimulatorOrigin(request.headers.origin)) {
        browserSocket.close(1008, "origin not allowed");
        return;
      }
      attachRealtimeSimulatorBridge(browserSocket, webSocketFactory);
    }
  );
}

// attachRealtimeSimulatorBridge: 入参为浏览器连接和上游工厂；功能是双向转发代理文本帧与二进制音频帧。
export function attachRealtimeSimulatorBridge(
  browserSocket: RealtimeSimulatorSocket,
  webSocketFactory: RealtimeSimulatorWebSocketFactory
): void {
  let upstream: RealtimeSimulatorSocket | undefined;
  let connectionStartedAt = 0;

  browserSocket.on("message", (raw, isBinary) => {
    if (isBinary) {
      sendBrowserEvent(browserSocket, "bridge_error", {
        message: "浏览器不应向代理发送二进制数据"
      });
      return;
    }

    const message = parseBrowserBridgeMessage(raw);
    if (message instanceof Error) {
      sendBrowserEvent(browserSocket, "bridge_error", {
        message: message.message
      });
      return;
    }

    if (message.type === "connect") {
      closeUpstream(upstream);
      try {
        if (typeof message.proxyUrl !== "string") {
          throw new Error("连接消息缺少 proxyUrl");
        }
        const targetUrl = validateRealtimeSimulatorTargetUrl(message.proxyUrl);
        const headers: Record<string, string> = {};
        if (typeof message.apiKey === "string" && message.apiKey.length > 0) {
          headers.Authorization = `bearer ${message.apiKey}`;
        }

        // 每次 connect 都创建新的上游连接，确保查询参数和临时 API Key 与当前表单一致。
        connectionStartedAt = Date.now();
        upstream = webSocketFactory(targetUrl, {
          headers,
          handshakeTimeout: 20_000,
          perMessageDeflate: false
        });
        bindUpstreamEvents(browserSocket, upstream, targetUrl, connectionStartedAt);
      } catch (error) {
        sendBrowserEvent(browserSocket, "bridge_error", {
          message: error instanceof Error ? error.message : "代理连接配置无效"
        });
      }
      return;
    }

    if (message.type === "proxy_text") {
      if (upstream === undefined || upstream.readyState !== WebSocket.OPEN) {
        sendBrowserEvent(browserSocket, "bridge_error", {
          message: "代理尚未连接，无法发送消息"
        });
        return;
      }
      upstream.send(message.payload ?? "");
      return;
    }

    if (message.type === "disconnect") {
      closeUpstream(upstream);
      upstream = undefined;
      return;
    }

    sendBrowserEvent(browserSocket, "bridge_error", {
      message: `不支持的桥接事件：${message.type}`
    });
  });

  browserSocket.on("close", () => {
    closeUpstream(upstream);
    upstream = undefined;
  });
}

// bindUpstreamEvents: 入参为上下游连接、目标地址和起始时间；功能是注册上游生命周期与帧转发。
function bindUpstreamEvents(
  browserSocket: RealtimeSimulatorSocket,
  upstream: RealtimeSimulatorSocket,
  targetUrl: URL,
  connectionStartedAt: number
): void {
  upstream.on("open", () => {
    sendBrowserEvent(browserSocket, "bridge_open", {
      connectionLatencyMs: Date.now() - connectionStartedAt,
      target: targetUrl.toString()
    });
  });

  upstream.on("message", (payload, isBinary) => {
    if (isBinary) {
      if (browserSocket.readyState === WebSocket.OPEN) {
        browserSocket.send(rawDataToBuffer(payload));
      }
      return;
    }
    sendBrowserEvent(browserSocket, "proxy_text", {
      payload: rawDataToText(payload)
    });
  });

  upstream.on("close", (code, reason) => {
    sendBrowserEvent(browserSocket, "bridge_close", {
      code,
      reason: reason.toString()
    });
  });

  upstream.on("error", (error) => {
    sendBrowserEvent(browserSocket, "bridge_error", {
      message: error.message
    });
  });
}

// parseBrowserBridgeMessage: 入参为浏览器文本帧；输出合法桥接消息或携带原因的 Error。
function parseBrowserBridgeMessage(raw: RawData): BrowserBridgeMessage | Error {
  try {
    const parsed = JSON.parse(rawDataToText(raw)) as unknown;
    if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) {
      return new Error("桥接消息必须是 JSON 对象");
    }
    const message = parsed as Partial<BrowserBridgeMessage>;
    if (typeof message.type !== "string") {
      return new Error("桥接消息缺少 type");
    }
    return {
      type: message.type,
      ...(typeof message.proxyUrl === "string" ? { proxyUrl: message.proxyUrl } : {}),
      ...(typeof message.apiKey === "string" ? { apiKey: message.apiKey } : {}),
      ...(typeof message.payload === "string" ? { payload: message.payload } : {})
    };
  } catch (error) {
    return new Error(
      `桥接消息不是合法 JSON：${error instanceof Error ? error.message : "unknown error"}`
    );
  }
}

// sendBrowserEvent: 入参为浏览器连接、事件类型和字段；功能是安全发送桥接控制事件。
function sendBrowserEvent(
  browserSocket: RealtimeSimulatorSocket,
  type: string,
  data: object = {}
): void {
  if (browserSocket.readyState !== WebSocket.OPEN) {
    return;
  }
  browserSocket.send(JSON.stringify({ type, ...data }));
}

// closeUpstream: 入参为可选上游连接；功能是释放尚未关闭的代理连接。
function closeUpstream(upstream?: RealtimeSimulatorSocket): void {
  if (
    upstream !== undefined &&
    (upstream.readyState === WebSocket.OPEN || upstream.readyState === WebSocket.CONNECTING)
  ) {
    upstream.close(1000, "browser reconnect");
  }
}

// rawDataToText: 入参为 ws 原始帧；输出 UTF-8 文本。
function rawDataToText(raw: RawData): string {
  return rawDataToBuffer(raw).toString("utf8");
}

// rawDataToBuffer: 入参为 ws 原始帧；输出保持字节顺序的 Buffer。
function rawDataToBuffer(raw: RawData): Buffer {
  if (Array.isArray(raw)) {
    return Buffer.concat(raw);
  }
  if (raw instanceof ArrayBuffer) {
    return Buffer.from(raw);
  }
  return Buffer.from(raw.buffer, raw.byteOffset, raw.byteLength);
}
