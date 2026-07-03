import ky, { HTTPError, type Options } from "ky";

export const DEFAULT_API_BASE_URL = "http://localhost:4000";

export function apiBaseUrl(): string {
  const env = (import.meta as ImportMeta & { env?: ImportMetaEnv }).env;
  return env?.VITE_API_BASE_URL ?? DEFAULT_API_BASE_URL;
}

export function apiUrl(path: string, baseUrl = apiBaseUrl()): string {
  const normalizedPath = path.startsWith("/") ? path : `/${path}`;
  return `${baseUrl.replace(/\/$/, "")}${normalizedPath}`;
}

// webSocketUrl: 入参为 API path；输出与当前 API base 对应的 WebSocket URL。
export function webSocketUrl(path: string, baseUrl = apiBaseUrl()): string {
  return apiUrl(path, baseUrl).replace(/^http/, "ws");
}

export async function requestJson<T>(path: string, options?: Options): Promise<T> {
  try {
    return await ky(apiUrl(path), options).json<T>();
  } catch (error) {
    if (error instanceof HTTPError) {
      const body = await error.response.text();
      throw new Error(errorMessageFromResponseBody(body, error.response.status));
    }
    throw error;
  }
}

// errorMessageFromResponseBody: 入参为 HTTP 错误响应正文和状态码；输出 UI 可直接展示的中文错误。
export function errorMessageFromResponseBody(body: string, status: number): string {
  if (body.length === 0) {
    return `请求失败，状态码 ${status}`;
  }
  const parsed = parseErrorBody(body);
  if (parsed === undefined) {
    return body;
  }
  return translateApiError(parsed.code, parsed.message);
}

// parseErrorBody: 入参为响应正文字符串；输出后端标准 error 对象中的 code/message。
function parseErrorBody(body: string): { code: string; message: string } | undefined {
  try {
    const parsed = JSON.parse(body) as unknown;
    if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) {
      return undefined;
    }
    const error = (parsed as { error?: unknown }).error;
    if (error === null || typeof error !== "object" || Array.isArray(error)) {
      return undefined;
    }
    const code = (error as { code?: unknown }).code;
    const message = (error as { message?: unknown }).message;
    return typeof code === "string" && typeof message === "string" ? { code, message } : undefined;
  } catch {
    return undefined;
  }
}

// translateApiError: 入参为后端错误 code/message；输出面向 UI 的中文错误文案。
function translateApiError(code: string, message: string): string {
  if (message.includes("requires COSYVOICE_WORKSPACE_ID")) {
    return "CosyVoice 合成需要配置 COSYVOICE_WORKSPACE_ID，因为 HTTP 合成和音色克隆使用阿里云百炼 Model Studio 的 Workspace 接口。如果只是想在没有 WorkspaceId 的情况下使用 WebSocket 合成，请使用流式合成，并配置 wss://dashscope.aliyuncs.com/api-ws/v1/inference。";
  }
  if (message.includes("requires COSYVOICE_API_KEY or DASHSCOPE_API_KEY")) {
    return "CosyVoice 调用需要配置 COSYVOICE_API_KEY 或 DASHSCOPE_API_KEY。";
  }
  if (message.includes("requires voice.voiceId/providerVoiceId")) {
    return "CosyVoice 需要填写音色 ID。v3.5 模型没有默认系统音色，请选择已登记/复刻的音色，或输入厂商音色 ID。";
  }
  return code.length > 0 ? `${message}` : message;
}
