import { afterEach, describe, expect, it, vi } from "vitest";
import { apiUrl, requestJson } from "./client";

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
});
