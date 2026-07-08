import { mkdtemp, readFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { FileCorpusRegistry, inferLengthCategory } from "../storage/corpus-registry";

describe("FileCorpusRegistry", () => {
  it("persists corpus items and corpus sets under datasets", async () => {
    const dataRoot = await mkdtemp(path.join(os.tmpdir(), "tts-corpus-"));
    const registry = new FileCorpusRegistry(dataRoot);

    const item = registry.saveItem({
      title: "Greeting",
      text: "hello",
      language: "en-US",
      scene: "support",
      emotion: "neutral",
      styleTags: ["formal", "formal", " warm "],
      ssml: "<speak>hello</speak>"
    });
    const set = registry.saveSet({
      name: "Smoke corpus",
      corpusItemIds: [item.corpusItemId, item.corpusItemId],
      filtersSnapshot: {
        language: "en-US",
        styleTags: ["formal"]
      }
    });
    const restored = new FileCorpusRegistry(dataRoot);
    const rawItems = JSON.parse(await readFile(path.join(dataRoot, "datasets", "corpus-items.json"), "utf8")) as {
      items: Array<{ corpusItemId: string }>;
    };

    expect(item.lengthCategory).toBe("short");
    expect(item.styleTags).toEqual(["formal", "warm"]);
    expect(set.corpusItemIds).toEqual([item.corpusItemId]);
    expect(rawItems.items[0]?.corpusItemId).toBe(item.corpusItemId);
    expect(restored.getItem(item.corpusItemId)?.ssmlEnabled).toBe(true);
    expect(restored.getSet(set.corpusSetId)?.corpusItemIds).toEqual([item.corpusItemId]);
  });

  it("infers stable length categories when the request omits them", () => {
    expect(inferLengthCategory("a".repeat(80))).toBe("short");
    expect(inferLengthCategory("a".repeat(81))).toBe("medium");
    expect(inferLengthCategory("a".repeat(301))).toBe("long");
  });
});
