import { describe, expect, it } from "vitest";
import { formatLocalDateTime } from "./time";

describe("formatLocalDateTime", () => {
  it("formats UTC archive timestamps in Asia/Shanghai time", () => {
    expect(formatLocalDateTime("2026-07-02T18:00:00.000Z")).toBe("2026/07/03 02:00:00");
  });
});
