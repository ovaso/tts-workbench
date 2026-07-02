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

export async function requestJson<T>(path: string, options?: Options): Promise<T> {
  try {
    return await ky(apiUrl(path), options).json<T>();
  } catch (error) {
    if (error instanceof HTTPError) {
      const body = await error.response.text();
      throw new Error(
        body.length > 0 ? body : `请求失败，状态码 ${error.response.status}`
      );
    }
    throw error;
  }
}
