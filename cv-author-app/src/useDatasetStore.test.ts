import { describe, expect, it } from "vitest";
import { inferColumnType } from "./useDatasetStore";

describe("CSV column type inference", () => {
  it("infers from values without using the column name", () => {
    expect(inferColumnType(["1", "2", "3"])).toBe("quantitative");
    expect(inferColumnType(["2026-01-01", "2026-02-01"])).toBe("temporal");
    expect(inferColumnType(["A", "B", "C"])).toBe("nominal");
  });
});
