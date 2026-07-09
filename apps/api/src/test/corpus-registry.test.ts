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

  it("filters items, computes stats, and expands filter-backed corpus sets", async () => {
    const dataRoot = await mkdtemp(path.join(os.tmpdir(), "tts-corpus-filter-"));
    const registry = new FileCorpusRegistry(dataRoot);

    const support = registry.saveItem({
      title: "客服问候",
      text: "您好，请问有什么可以帮您？",
      language: "zh-CN",
      scene: "support",
      emotion: "neutral",
      styleTags: ["formal", "warm"],
      ssml: "<speak>您好，请问有什么可以帮您？</speak>"
    });
    registry.saveItem({
      title: "广告短句",
      text: "新品限时优惠。",
      language: "zh-CN",
      scene: "ad",
      emotion: "happy",
      styleTags: ["energetic"]
    });
    registry.saveItem({
      title: "Support greeting",
      text: "How may I help you today?",
      language: "en-US",
      scene: "support",
      emotion: "neutral",
      styleTags: ["formal"]
    });

    const filtered = registry.listItems({
      search: "客服",
      language: "zh-CN",
      scene: "support",
      styleTags: ["formal"],
      ssmlEnabled: true
    });
    const stats = registry.stats({
      language: "zh-CN"
    });
    const set = registry.saveSet({
      name: "中文客服",
      filtersSnapshot: {
        language: "zh-CN",
        scene: "support"
      }
    });

    expect(filtered.map((item) => item.corpusItemId)).toEqual([support.corpusItemId]);
    expect(stats).toMatchObject({
      itemCount: 2,
      setCount: 0,
      ssmlEnabledCount: 1,
      byLanguage: [
        {
          value: "zh-CN",
          count: 2
        }
      ]
    });
    expect(stats.byScene).toEqual([
      {
        value: "ad",
        count: 1
      },
      {
        value: "support",
        count: 1
      }
    ]);
    expect(set.corpusItemIds).toEqual([support.corpusItemId]);
    expect(set.filtersSnapshot).toEqual({
      language: "zh-CN",
      scene: "support"
    });
    expect(registry.getExpandedSet(set.corpusSetId)?.items.map((item) => item.title)).toEqual(["客服问候"]);
    expect(registry.stats().setCount).toBe(1);
  });

  it("updates corpus items and protects referenced items from deletion", async () => {
    const dataRoot = await mkdtemp(path.join(os.tmpdir(), "tts-corpus-mutate-"));
    const registry = new FileCorpusRegistry(dataRoot);
    const draft = registry.saveItem({
      title: "Draft",
      text: "hello",
      language: "en-US",
      scene: "support",
      notes: "old note"
    });

    const updated = registry.updateItem(draft.corpusItemId, {
      title: "Updated",
      text: "hello updated",
      language: "en-US",
      scene: "",
      styleTags: ["formal"],
      ssmlEnabled: true,
      ssml: "<speak>hello updated</speak>",
      notes: ""
    });

    expect(updated).toMatchObject({
      corpusItemId: draft.corpusItemId,
      title: "Updated",
      text: "hello updated",
      styleTags: ["formal"],
      ssmlEnabled: true,
      ssml: "<speak>hello updated</speak>"
    });
    expect(updated.scene).toBeUndefined();
    expect(updated.notes).toBeUndefined();

    const set = registry.saveSet({
      name: "Referenced",
      corpusItemIds: [draft.corpusItemId]
    });
    expect(() => registry.deleteItem(draft.corpusItemId)).toThrow(/referenced/);

    const loose = registry.saveItem({
      title: "Loose",
      text: "remove me",
      language: "en-US"
    });
    expect(registry.deleteItem(loose.corpusItemId).title).toBe("Loose");
    expect(registry.getItem(loose.corpusItemId)).toBeUndefined();
    expect(registry.getSet(set.corpusSetId)?.corpusItemIds).toEqual([draft.corpusItemId]);
  });
});
