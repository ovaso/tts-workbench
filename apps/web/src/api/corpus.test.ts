import { afterEach, describe, expect, it, vi } from "vitest";
import {
  createCorpusItem,
  createCorpusSet,
  deleteCorpusItem,
  getCorpusItem,
  getCorpusSet,
  getCorpusStats,
  listCorpusItems,
  listCorpusSets,
  updateCorpusItem
} from "./corpus";

const originalFetch = globalThis.fetch;

describe("corpus api client", () => {
  afterEach(() => {
    globalThis.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  it("serializes corpus query parameters for list and stats requests", async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = fetchUrl(input);
      return new Response(
        JSON.stringify(url.includes("/v1/corpus-stats") ? { stats: emptyStats() } : { items: [] }),
        {
          status: 200,
          headers: {
            "content-type": "application/json"
          }
        }
      );
    });
    globalThis.fetch = fetchMock as typeof fetch;

    await listCorpusItems({
      language: "zh-CN",
      styleTags: ["formal", "warm"],
      ssmlEnabled: true
    });
    await getCorpusStats({
      search: "客服"
    });

    expect(fetchUrl(fetchMock.mock.calls[0]?.[0])).toContain(
      "/v1/corpus-items?language=zh-CN&styleTags=formal%2Cwarm&ssmlEnabled=true"
    );
    expect(fetchUrl(fetchMock.mock.calls[1]?.[0])).toContain("/v1/corpus-stats?search=%E5%AE%A2%E6%9C%8D");
  });

  it("posts corpus items and sets through the shared client", async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = fetchUrl(input);
      const method = fetchMethod(input);
      if (url.includes("/v1/corpus-items")) {
        return jsonResponse({
          item: {
            corpusItemId: "corpus_item_1",
            title: "客服问候"
          }
        });
      }
      if (url.includes("/v1/corpus-sets/corpus_set_1")) {
        return jsonResponse({
          corpusSetId: "corpus_set_1",
          items: []
        });
      }
      if (url.includes("/v1/corpus-sets") && method === "POST") {
        return jsonResponse({
          set: {
            corpusSetId: "corpus_set_1",
            name: "中文客服",
            corpusItemIds: ["corpus_item_1"]
          }
        });
      }
      return jsonResponse({
        sets: []
      });
    });
    globalThis.fetch = fetchMock as typeof fetch;

    await expect(
      createCorpusItem({
        title: "客服问候",
        text: "您好",
        language: "zh-CN"
      })
    ).resolves.toMatchObject({
      corpusItemId: "corpus_item_1"
    });
    await expect(
      createCorpusSet({
        name: "中文客服",
        corpusItemIds: ["corpus_item_1"]
      })
    ).resolves.toMatchObject({
      corpusSetId: "corpus_set_1"
    });
    await expect(getCorpusSet("corpus_set_1")).resolves.toMatchObject({
      corpusSetId: "corpus_set_1"
    });
    await expect(listCorpusSets()).resolves.toEqual([]);
  });

  it("gets, updates, and deletes corpus items through item endpoints", async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = fetchUrl(input);
      const method = fetchMethod(input);
      if (url.includes("/v1/corpus-items/corpus_item_1") && method === "GET") {
        return jsonResponse({
          corpusItemId: "corpus_item_1",
          title: "客服问候"
        });
      }
      if (url.includes("/v1/corpus-items/corpus_item_1") && method === "PATCH") {
        return jsonResponse({
          item: {
            corpusItemId: "corpus_item_1",
            title: "客服问候更新"
          }
        });
      }
      if (url.includes("/v1/corpus-items/corpus_item_1") && method === "DELETE") {
        return jsonResponse({
          item: {
            corpusItemId: "corpus_item_1",
            title: "客服问候更新"
          }
        });
      }
      return jsonResponse({});
    });
    globalThis.fetch = fetchMock as typeof fetch;

    await expect(getCorpusItem("corpus_item_1")).resolves.toMatchObject({
      corpusItemId: "corpus_item_1"
    });
    await expect(
      updateCorpusItem("corpus_item_1", {
        title: "客服问候更新"
      })
    ).resolves.toMatchObject({
      title: "客服问候更新"
    });
    await expect(deleteCorpusItem("corpus_item_1")).resolves.toMatchObject({
      corpusItemId: "corpus_item_1"
    });
    expect(fetchMethod(fetchMock.mock.calls[1]?.[0] as RequestInfo)).toBe("PATCH");
    expect(fetchMethod(fetchMock.mock.calls[2]?.[0] as RequestInfo)).toBe("DELETE");
  });
});

// fetchUrl: 入参为 fetch 第一个参数；输出测试断言使用的 URL 字符串。
function fetchUrl(input: RequestInfo | URL | undefined): string {
  if (input instanceof Request) {
    return input.url;
  }
  return input === undefined ? "" : String(input);
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

// emptyStats: 无入参；输出语料 API 测试使用的空统计对象。
function emptyStats() {
  return {
    itemCount: 0,
    setCount: 0,
    ssmlEnabledCount: 0,
    byLanguage: [],
    byScene: [],
    byEmotion: [],
    byLengthCategory: [],
    byStyleTag: []
  };
}
