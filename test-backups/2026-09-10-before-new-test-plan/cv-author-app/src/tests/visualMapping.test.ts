import { describe, expect, it } from "vitest";
import {
  isCategoricalColorMapping,
  isLinearColorMapping,
  isSeriesStyleMapping,
  interpolateLinearColor,
  interpolateLinearSize,
  mapColorValue,
  mapSizeValue,
  visualDomain,
} from "../utils/visualMapping";

describe("visual mapping", () => {
  const colorMapping = {
    type: "linear" as const,
    stops: [
      { offset: 0, color: "#000000" },
      { offset: 0.5, color: "#ff0000" },
      { offset: 1, color: "#ffffff" },
    ],
  };
  const sizeMapping = {
    type: "linear" as const,
    stops: [
      { offset: 0, size: 2 },
      { offset: 0.25, size: 8 },
      { offset: 1, size: 20 },
    ],
  };

  it("interpolates independently within each color segment", () => {
    expect(interpolateLinearColor(colorMapping, 0.25)).toBe("#800000");
    expect(interpolateLinearColor(colorMapping, 0.75)).toBe("#ff8080");
    expect(mapColorValue(25, [0, 100], colorMapping)).toBe("#800000");
  });

  it("uses an explicit color domain when stop values are configured outside the data domain", () => {
    const configured = { ...colorMapping, domain: [-100, 100] as [number, number] };
    expect(isLinearColorMapping(configured)).toBe(true);
    expect(mapColorValue(0, [0, 50], configured)).toBe("#800000");
  });

  it("interpolates multi-stop pixel sizes and clamps outside the domain", () => {
    expect(interpolateLinearSize(sizeMapping, 0.125)).toBe(5);
    expect(interpolateLinearSize(sizeMapping, 0.625)).toBe(14);
    expect(mapSizeValue(-10, [0, 100], sizeMapping)).toBe(2);
    expect(mapSizeValue(120, [0, 100], sizeMapping)).toBe(20);
  });

  it("derives quantitative and temporal domains", () => {
    expect(visualDomain([{ value: "4" }, { value: "12" }], { field: "value", type: "quantitative" })).toEqual([4, 12]);
    expect(visualDomain([{ date: "2026-01-01" }, { date: "2026-01-03" }], { field: "date", type: "temporal" }))
      .toEqual([Date.parse("2026-01-01"), Date.parse("2026-01-03")]);
  });

  it("recognizes categorical member color mappings", () => {
    expect(isCategoricalColorMapping({ type: "categorical", values: { Person_A: "#00aa66" } })).toBe(true);
    expect(isCategoricalColorMapping({ type: "categorical", values: [] })).toBe(false);
    expect(isCategoricalColorMapping(colorMapping)).toBe(false);
  });

  it("recognizes per-series visual style mappings", () => {
    expect(isSeriesStyleMapping({
      type: "series-style",
      values: { Person_A: { color: "#00aa66", strokeWidth: 4, shape: "dashed" } },
    })).toBe(true);
    expect(isSeriesStyleMapping({ type: "series-style", values: [] })).toBe(false);
  });
});
