import { describe, expect, it } from "vitest";
import { advancedTemplateDefinitions } from "../utils/advancedChartCards";
import { groupChartTemplateCandidates } from "../utils/chartTemplateCategories";
import type { SvgCandidate } from "../types";

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
  it("groups every implemented template by family exactly once", () => {
    const candidates = [...existing, ...advancedTemplateDefinitions];
    const categories = groupChartTemplateCandidates(candidates);
    const grouped = categories.flatMap((category) => category.candidates);
    expect(categories.map((category) => category.label)).toEqual([
      "Bar chart",
      "Line chart",
      "Area chart",
      "Point",
      "Heatmap",
      "Arc",
      "Chord",
      "Sankey",
      "Tree",
      "Calendar",
      "Boxplot",
    ]);
    expect(grouped).toHaveLength(candidates.length);
    expect(new Set(grouped.map((candidate) => candidate.id)).size).toBe(candidates.length);
    expect(categories.find((category) => category.id === "barchart")?.candidates).toHaveLength(6);
    expect(categories.find((category) => category.id === "linechart")?.candidates).toHaveLength(3);
    expect(categories.find((category) => category.id === "areachart")?.candidates).toHaveLength(4);
    expect(categories.find((category) => category.id === "heatmap")?.candidates.map((candidate) => candidate.chartType)).toEqual([
      "MatrixDiagram",
      "Contour",
      "Hexbin",
    ]);
    expect(categories.find((category) => category.id === "arc")?.candidates).toHaveLength(2);
    expect(categories.find((category) => category.id === "tree")?.candidates.map((candidate) => candidate.chartType)).toEqual([
      "Sunburst",
      "Icicle",
      "Treemap",
      "Dendrogram",
      "RadialDendrogram",
    ]);
  });

  it("keeps unknown templates in an Other family", () => {
    const unknown: SvgCandidate = { id: "future", name: "Future", chartType: "FutureChart", coordinateSystem: "CoordinateFree", src: "preview" };
    const categories = groupChartTemplateCandidates([unknown]);
    expect(categories).toEqual([{ id: "other", label: "Other", candidates: [unknown] }]);
  });

  it("groups candidates by chart type rather than coordinate system", () => {
    const candidate: SvgCandidate = {
      id: "future-bar",
      name: "Future bar",
      chartType: "GroupedBarChart",
      coordinateSystem: "Polar",
      src: "preview",
    };
    const categories = groupChartTemplateCandidates([candidate]);
    expect(categories).toEqual([{ id: "barchart", label: "Bar chart", candidates: [candidate] }]);
  });

  it("groups parallel coordinates with line charts", () => {
    const parallel = advancedTemplateDefinitions.find((candidate) => candidate.chartType === "ParallelCoordinatesPlot")!;

    expect(groupChartTemplateCandidates([parallel])).toEqual([{
      id: "linechart",
      label: "Line chart",
      candidates: [parallel],
    }]);
  });

  it("places geographic template families after non-geographic families", () => {
    const geographic: SvgCandidate[] = [
      { id: "geo-point", name: "Geo point", chartType: "ScatterplotLayer", coordinateSystem: "Geographic", layerType: "ScatterplotLayer", src: "preview" },
      { id: "geo-line", name: "Geo line", chartType: "ArcLayer", coordinateSystem: "Geographic", layerType: "ArcLayer", src: "preview" },
      { id: "geo-area", name: "Geo area", chartType: "GeoJsonLayer", coordinateSystem: "Geographic", layerType: "GeoJsonLayer", src: "preview" },
    ];

    expect(groupChartTemplateCandidates([...existing, ...geographic]).map((category) => category.id).slice(-3)).toEqual([
      "geographic-point",
      "geographic-line",
      "geographic-area",
    ]);
  });
});
