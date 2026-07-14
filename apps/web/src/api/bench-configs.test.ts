import { afterEach, describe, expect, it, vi } from "vitest";
import { createBenchConfigSet, listBenchConfigSets } from "./bench-configs";

const originalFetch = globalThis.fetch;

describe("bench configs api client", () => {
  afterEach(() => {
    globalThis.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  it("lists and creates benchmark config sets", async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = fetchUrl(input);
      const method = fetchMethod(input);
      if (url.endsWith("/v1/bench-config-sets") && method === "GET") {
        return jsonResponse({ sets: [configSetBody()] });
      }
      if (url.endsWith("/v1/bench-config-sets") && method === "POST") {
        return jsonResponse({ set: configSetBody() });
      }
      return jsonResponse({});
    });
    globalThis.fetch = fetchMock as typeof fetch;

    await expect(listBenchConfigSets()).resolves.toHaveLength(1);
    await expect(
      createBenchConfigSet({
        name: "Smoke configs",
        configIds: ["config_1"]
      })
    ).resolves.toMatchObject({
      configSetId: "config_set_1"
    });
  });
});

// fetchUrl: 入参为 fetch 第一个参数；输出测试断言使用的 URL 字符串。
function fetchUrl(input: RequestInfo | URL): string {
  if (input instanceof Request) {
    return input.url;
  }
  return String(input);
}

// fetchMethod: 入参为 fetch 第一个参数；输出测试断言使用的 HTTP method。
function fetchMethod(input: RequestInfo | URL): string {
  if (input instanceof Request) {
    return input.method;
  }
  return "GET";
}

// jsonResponse: 入参为响应对象；输出带 JSON content-type 的测试 Response。
function jsonResponse(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: {
      "content-type": "application/json"
    }
  });
}

// configSetBody: 无入参；输出配置组合 API 测试使用的最小响应。
function configSetBody() {
  return {
    configSetId: "config_set_1",
    digest: "config_set_1",
    name: "Smoke configs",
    configIds: ["config_1"],
    createdAt: "2026-07-09T00:00:00.000Z",
    updatedAt: "2026-07-09T00:00:00.000Z"
  };
}
