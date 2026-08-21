import { describe, expect, it } from "vitest";
import { resolveSemanticMarkMatch } from "../utils/chartSelection";

describe("chart selection hierarchy", () => {
  it.each(["GroupedBarChart", "StackedBarChart", "DivergentStackedBarChart"])(
    "treats one category in %s as an enterable item",
    (chartType) => {
      expect(resolveSemanticMarkMatch(chartType, "item", {
        role: "bar",
        categoryKey: "Q1",
        seriesKey: "Revenue",
      })).toEqual({ mode: "category", canEnter: true });
    },
  );

  it("treats a single bar as the terminal item", () => {
    expect(resolveSemanticMarkMatch("SingleBarChart", "item", {
      role: "bar",
      categoryKey: "Q1",
    })).toEqual({ mode: "mark", canEnter: false });
  });

  it("selects one segment after entering a composite bar item", () => {
    expect(resolveSemanticMarkMatch("StackedBarChart", "part", {
      role: "bar",
      categoryKey: "Q1",
      seriesKey: "Revenue",
    })).toEqual({ mode: "mark", canEnter: false });
  });
});
