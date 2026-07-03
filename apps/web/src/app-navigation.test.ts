import { describe, expect, it } from "vitest";
import { appNavItems } from "./app-navigation";

describe("app navigation", () => {
  it("labels synthesize as quick synthesis in the left drawer", () => {
    expect(appNavItems()).toContainEqual({
      title: "快速合成",
      icon: "mdi-waveform",
      to: "/synthesize"
    });
  });

  it("includes benches in the left drawer", () => {
    expect(appNavItems()).toContainEqual({
      title: "Benches",
      icon: "mdi-chart-box-outline",
      to: "/benches"
    });
  });

  it("includes corpora in the left drawer", () => {
    expect(appNavItems()).toContainEqual({
      title: "语料库",
      icon: "mdi-book-open-page-variant-outline",
      to: "/corpora"
    });
  });

  it("includes arena blind test in the left drawer", () => {
    expect(appNavItems()).toContainEqual({
      title: "Arena",
      icon: "mdi-scale-balance",
      to: "/arena"
    });
  });
});
