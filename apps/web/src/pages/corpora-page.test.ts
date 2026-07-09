import { describe, expect, it } from "vitest";
import type { CorpusItem, CorpusSet, CorpusStats } from "@tts-platform/core";
import {
  corpusCreateRequestFromForm,
  corpusFacetItems,
  corpusFilterSnapshotChips,
  corpusFilterSnapshotFromForm,
  corpusItemFormFromItem,
  corpusLengthCategoryLabel,
  corpusQueryFromForm,
  corpusSetItemCountLabel,
  corpusSetSourceLabel,
  corpusSsmlLabel,
  corpusStatsMetricItems,
  corpusTagItems,
  emptyCorpusFilterForm,
  emptyCorpusItemForm,
  splitCorpusTags
} from "./corpora-page";

const item: CorpusItem = {
  corpusItemId: "corpus_item_1",
  title: "客服问候",
  text: "您好，请问有什么可以帮您？",
  language: "zh-CN",
  scene: "support",
  emotion: "neutral",
  lengthCategory: "short",
  styleTags: ["formal", "warm"],
  ssml: "<speak>您好，请问有什么可以帮您？</speak>",
  ssmlEnabled: true,
  createdAt: "2026-07-09T00:00:00.000Z",
  updatedAt: "2026-07-09T00:00:00.000Z"
};

describe("corpora page helpers", () => {
  it("builds compact corpus queries and snapshots from filter forms", () => {
    const form = emptyCorpusFilterForm();
    form.search = " 客服 ";
    form.language = "zh-CN";
    form.lengthCategory = "short";
    form.styleTags = ["formal"];
    form.ssmlEnabled = "enabled";

    expect(corpusQueryFromForm(form)).toEqual({
      search: "客服",
      language: "zh-CN",
      lengthCategory: "short",
      styleTags: ["formal"],
      ssmlEnabled: true
    });
    expect(corpusFilterSnapshotFromForm(form)).toEqual(corpusQueryFromForm(form));
  });

  it("normalizes create requests and tags", () => {
    const form = emptyCorpusItemForm();
    form.title = " 客服问候 ";
    form.text = " 您好 ";
    form.language = " zh-CN ";
    form.scene = " support ";
    form.styleTagsText = "formal，warm,formal\ncalm";
    form.ssmlEnabled = true;
    form.ssml = " <speak>您好</speak> ";

    expect(splitCorpusTags(form.styleTagsText)).toEqual(["formal", "warm", "calm"]);
    expect(corpusCreateRequestFromForm(form)).toMatchObject({
      title: "客服问候",
      text: "您好",
      language: "zh-CN",
      scene: "support",
      styleTags: ["formal", "warm", "calm"],
      ssmlEnabled: true,
      ssml: "<speak>您好</speak>"
    });
  });

  it("builds edit forms from existing corpus items", () => {
    expect(corpusItemFormFromItem(item)).toMatchObject({
      title: "客服问候",
      text: "您好，请问有什么可以帮您？",
      language: "zh-CN",
      scene: "support",
      emotion: "neutral",
      lengthCategory: "short",
      styleTagsText: "formal, warm",
      ssmlEnabled: true,
      ssml: "<speak>您好，请问有什么可以帮您？</speak>",
      notes: ""
    });
  });

  it("formats table labels and facet candidates", () => {
    const set: CorpusSet = {
      corpusSetId: "corpus_set_1",
      name: "中文客服",
      corpusItemIds: ["corpus_item_1"],
      filtersSnapshot: {
        language: "zh-CN"
      },
      createdAt: item.createdAt,
      updatedAt: item.updatedAt
    };

    expect(corpusLengthCategoryLabel("short")).toBe("短");
    expect(corpusSsmlLabel(item)).toBe("已启用");
    expect(corpusSetSourceLabel(set)).toBe("筛选快照");
    expect(corpusSetItemCountLabel(set)).toBe("1 条");
    expect(corpusFilterSnapshotChips(set.filtersSnapshot)).toEqual(["语言 zh-CN"]);
    expect(corpusFacetItems([item], "language")).toEqual(["zh-CN"]);
    expect(corpusTagItems([item])).toEqual(["formal", "warm"]);
  });

  it("summarizes corpus stats for the metric strip", () => {
    const stats: CorpusStats = {
      itemCount: 2,
      setCount: 1,
      ssmlEnabledCount: 1,
      byLanguage: [
        {
          value: "zh-CN",
          count: 2
        }
      ],
      byScene: [],
      byEmotion: [],
      byLengthCategory: [],
      byStyleTag: []
    };

    expect(corpusStatsMetricItems(stats).map((metric) => metric.value)).toEqual(["2", "1", "1", "1"]);
  });
});
