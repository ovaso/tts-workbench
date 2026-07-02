import path from "node:path";
import { describe, expect, it } from "vitest";
import { defaultDataRoot } from "../storage/paths";

describe("storage paths", () => {
  it("resolves the default data root from the workspace root", () => {
    const previousCwd = process.cwd();
    try {
      process.chdir(path.resolve(previousCwd, "../.."));
      expect(defaultDataRoot()).toBe(path.join(process.cwd(), "data"));
    } finally {
      process.chdir(previousCwd);
    }
  });
});
