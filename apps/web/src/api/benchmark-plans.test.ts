import { afterEach, describe, expect, it, vi } from "vitest";
import { createBenchmarkPlan, getBenchmarkPlan, listBenchmarkPlans, runBenchmarkPlan } from "./benchmark-plans";

const originalFetch = globalThis.fetch;

describe("benchmark plans api client", () => {
  afterEach(() => {
    globalThis.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  it("lists, creates, reads, and runs benchmark plans", async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = fetchUrl(input);
      const method = fetchMethod(input);
      if (url.endsWith("/v1/benchmark-plans") && method === "GET") {
        return jsonResponse({ plans: [planBody("plan_1", "planned")] });
      }
      if (url.endsWith("/v1/benchmark-plans") && method === "POST") {
        return jsonResponse({ plan: planBody("plan_2", "planned") });
      }
      if (url.endsWith("/v1/benchmark-plans/plan_1") && method === "GET") {
        return jsonResponse(planBody("plan_1", "planned"));
      }
      if (url.endsWith("/v1/benchmark-plans/plan_1/run") && method === "POST") {
        return jsonResponse(planBody("plan_1", "succeeded"));
      }
      return jsonResponse({});
    });
    globalThis.fetch = fetchMock as typeof fetch;

    await expect(listBenchmarkPlans()).resolves.toHaveLength(1);
    await expect(
      createBenchmarkPlan({
        displayName: "Smoke",
        corpusSetId: "corpus_set_1",
        configSetId: "config_set_1"
      })
    ).resolves.toMatchObject({ planId: "plan_2" });
    await expect(getBenchmarkPlan("plan_1")).resolves.toMatchObject({ planId: "plan_1" });
    await expect(runBenchmarkPlan("plan_1")).resolves.toMatchObject({ status: "succeeded" });
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

// planBody: 入参为 plan id 和状态；输出 Benchmark plan API 测试使用的最小响应。
function planBody(planId: string, status: "planned" | "succeeded") {
  return {
    planId,
    displayName: "Smoke",
    corpusSetId: "corpus_set_1",
    configSetId: "config_set_1",
    operation: "tts.sync",
    textMode: "text",
    status,
    createdAt: "2026-07-09T00:00:00.000Z",
    updatedAt: "2026-07-09T00:00:00.000Z",
    jobs: [],
    summary: {
      corpusItemCount: 1,
      configCount: 1,
      totalJobs: 1,
      succeededJobs: status === "succeeded" ? 1 : 0,
      failedJobs: 0
    },
    archive: {
      runPath: `data/benchmark-runs/${planId}`,
      files: ["benchmark-plan.json"]
    }
  };
}
