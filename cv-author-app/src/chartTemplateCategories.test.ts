import { describe, expect, it } from "vitest";
import { advancedTemplateDefinitions } from "./advancedChartCards";
import { groupChartTemplateCandidates } from "./chartTemplateCategories";
import type { SvgCandidate } from "./types";

const existing: SvgCandidate[] = ([
  ["line", "Single Line", "LineGraph", "Cartesian"],
  ["multi-line", "Multi-Line Chart", "MultiLineChart", "Cartesian"],
  ["scatter", "Scatterplot", "Scatterplot", "Cartesian"],
  ["pie", "Pie Chart", "PieChart", "Polar"],
  ["donut", "Donut", "DonutChart", "Polar"],
  ["matrix", "Matrix", "MatrixDiagram", "Cartesian"],
  ["single-bar", "Single Bar", "SingleBarChart", "Cartesian"],
  ["grouped-bar", "Grouped Bar", "GroupedBarChart", "Cartesian"],
  ["stacked-bar", "Stacked Bar", "StackedBarChart", "Cartesian"],
  ["divergent-bar", "Divergent Bar", "DivergentBarChart", "Cartesian"],
  ["divergent-stacked-bar", "Divergent Stacked Bar", "DivergentStackedBarChart", "Cartesian"],
] as Array<[string, string, string, SvgCandidate["coordinateSystem"]]>).map(([id, name, chartType, coordinateSystem]) => ({ id, name, chartType, coordinateSystem, src: "preview" }));

describe("chart template categories", () => {
  it("groups every implemented template exactly once", () => {
    const candidates = [...existing, ...advancedTemplateDefinitions];
    const categories = groupChartTemplateCandidates(candidates);
    const grouped = categories.flatMap((category) => category.candidates);
    expect(categories.map((category) => category.label)).toEqual([
      "Cartesian", "Polar", "Coordinate Free",
    ]);
    expect(grouped).toHaveLength(candidates.length);
    expect(new Set(grouped.map((candidate) => candidate.id)).size).toBe(candidates.length);
    expect(categories.find((category) => category.id === "cartesian")?.candidates).toHaveLength(16);
    expect(categories.find((category) => category.id === "polar")?.candidates).toHaveLength(2);
    expect(categories.find((category) => category.id === "coordinate-free")?.candidates).toHaveLength(8);
  });

  it("classifies future templates from their coordinate-system metadata", () => {
    const unknown: SvgCandidate = { id: "future", name: "Future", chartType: "FutureChart", coordinateSystem: "CoordinateFree", src: "preview" };
    const categories = groupChartTemplateCandidates([unknown]);
    expect(categories).toEqual([{ id: "coordinate-free", label: "Coordinate Free", candidates: [unknown] }]);
  });
});
