import { describe, expect, it } from "vitest";
import { inferColumnType } from "./useDatasetStore";

describe("CSV column type inference", () => {
  it("keeps numeric row ids nominal", () => {
    expect(inferColumnType("id", ["1", "2", "3"])).toBe("nominal");
    expect(inferColumnType("value", ["1", "2", "3"])).toBe("quantitative");
  });
});
