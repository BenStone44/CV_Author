import { describe, expect, it } from "vitest";
import {
  getEncodingChannelConfigs,
  getEncodingChannelConfigsForSpec,
  isEncodingColumnCompatible,
  resolvedPolarAxisRoles,
  resolvedPolarRadiusMode,
  resolvedSeriesField,
  resolveChartEncodingIssues,
  resolveChartTemplateVariant,
} from "../utils/encodingConfig";
import {
  chartTemplateContracts,
  getTemplateBindingContract,
  hasRequiredChartEncodings,
  normalizeBarChartVariant,
  normalizeChartTemplate,
  semanticSlotForChannel,
} from "../utils/chartTemplates";
import { chartEncodingSchemas, getChartEncodingSchema } from "../utils/chartEncodingSchemas";

const channels = (chartType: string) => getEncodingChannelConfigs(chartType).map((config) => config.channel);

describe("card encoding configuration", () => {
  it("keeps every built-in chart in the unified encoding schema", () => {
    const chartTypes = [
      "LineGraph", "MultiLineChart", "Scatterplot", "SingleBarChart", "GroupedBarChart",
      "StackedBarChart", "DivergentBarChart", "DivergentStackedBarChart", "PieChart",
      "DonutChart", "MatrixDiagram", "AreaChart", "StackedAreaChart", "Streamgraph",
      "HorizonChart", "ParallelCoordinatesPlot", "Icicle", "Sunburst", "Treemap",
      "Dendrogram", "Calendar", "Boxplot", "Contour", "Hexbin", "Chord", "Sankey",
    ];
    expect(Object.keys(chartEncodingSchemas)).toEqual(chartTypes);
    chartTypes.forEach((chartType) => {
      const schema = getChartEncodingSchema(chartType);
      expect(schema?.channels.length).toBeGreaterThan(0);
      expect(schema?.renderer).toBeTruthy();
    });
  });

  it("normalizes chart pipelines and variants through ordered rules", () => {
    expect(normalizeChartTemplate("Divergent_Stacked_BarChart")).toBe("bar");
    expect(normalizeChartTemplate("Heat Map")).toBe("matrix");
    expect(normalizeBarChartVariant("Divergent_Stacked_BarChart")).toBe("divergent-stacked");
    expect(normalizeBarChartVariant("GroupedBarChart")).toBe("grouped");
    expect(normalizeBarChartVariant("SingleBarChart")).toBe("single");
    expect(chartTemplateContracts.line.rendererVersion).toBe(3);
    expect(chartTemplateContracts.pie.rendererVersion).toBe(1);
  });

  it("keeps template-specific required encoding fallbacks behind one contract", () => {
    expect(hasRequiredChartEncodings({
      chartType: "PieChart",
      datasetId: "data",
      encodings: {},
      angleFields: [{ field: "value", type: "quantitative" }],
    })).toBe(true);
    expect(hasRequiredChartEncodings({
      chartType: "MatrixDiagram",
      datasetId: "data",
      encodings: {
        x: { field: "column", type: "nominal" },
        y: { field: "row", type: "nominal" },
      },
    })).toBe(true);
    expect(hasRequiredChartEncodings({
      chartType: "MatrixDiagram",
      datasetId: "data",
      encodings: {
        column: { field: "column", type: "nominal" },
        row: { field: "row", type: "nominal" },
        value: { field: "value", type: "quantitative" },
      },
    })).toBe(true);
    expect(hasRequiredChartEncodings({
      chartType: "Contour",
      datasetId: "data",
      encodings: {
        x: { field: "x", type: "quantitative" },
        y: { field: "y", type: "quantitative" },
        value: { field: "value", type: "quantitative" },
      },
    })).toBe(true);
    expect(hasRequiredChartEncodings({
      chartType: "LineGraph",
      datasetId: "data",
      encodings: { x: { field: "time", type: "temporal" } },
    })).toBe(false);
    expect(hasRequiredChartEncodings({
      chartType: "MultiLineChart",
      datasetId: "data",
      encodings: {
        x: { field: "time", type: "temporal" },
        y: { field: "value", type: "quantitative" },
      },
    })).toBe(false);
    expect(hasRequiredChartEncodings({
      chartType: "MultiLineChart",
      datasetId: "data",
      encodings: {
        x: { field: "time", type: "temporal" },
        y: { field: "value", type: "quantitative" },
      },
      series: { field: "person", type: "nominal" },
    })).toBe(true);
    expect(hasRequiredChartEncodings({
      chartType: "GroupedBarChart",
      datasetId: "data",
      encodings: {
        x: { field: "category", type: "nominal" },
        y: { field: "value", type: "quantitative" },
      },
    })).toBe(false);
    expect(hasRequiredChartEncodings({
      chartType: "StackedBarChart",
      datasetId: "data",
      encodings: {
        x: { field: "category", type: "nominal" },
        y: { field: "planned", type: "quantitative" },
      },
      valueFields: ["planned", "actual"].map((field) => ({ field, type: "quantitative" as const })),
    })).toBe(true);
    expect(hasRequiredChartEncodings({
      chartType: "StackedAreaChart",
      datasetId: "data",
      encodings: { x: { field: "time", type: "temporal" } },
      valueFields: [{ field: "weight", type: "quantitative" }],
    })).toBe(true);
    const valueFields = ["weight", "water"]
      .map((field) => ({ field, type: "quantitative" as const }));
    expect(hasRequiredChartEncodings({
      chartType: "MultiLineChart",
      datasetId: "data",
      encodings: { x: { field: "time", type: "temporal" } },
      valueFields,
    })).toBe(true);
    expect(hasRequiredChartEncodings({
      chartType: "StackedAreaChart",
      datasetId: "data",
      encodings: { x: { field: "time", type: "temporal" } },
      valueFields,
    })).toBe(true);
    expect(resolveChartEncodingIssues({
      chartType: "MultiLineChart",
      datasetId: "data",
      encodings: { x: { field: "time", type: "temporal" } },
      valueFields,
    })).toEqual([]);
  });

  it.each([
    ["LineGraph", ["x", "y", "size", "shape"]],
    ["MultiLineChart", ["x", "y", "color", "size", "shape"]],
    ["Scatterplot", ["x", "y", "color", "size", "shape"]],
    ["SingleBarChart", ["x", "y", "color", "size"]],
    ["GroupedBarChart", ["x", "y", "color", "size"]],
    ["StackedBarChart", ["x", "y", "color", "size"]],
    ["DivergentBarChart", ["x", "y", "color", "size"]],
    ["DivergentStackedBarChart", ["x", "y", "color", "size"]],
    ["PieChart", ["theta", "color", "radius"]],
    ["DonutChart", ["theta", "color", "ring", "radius"]],
    ["MatrixDiagram", ["x", "y", "color"]],
  ])("builds the %s card from its channel contract", (chartType, expected) => {
    expect(channels(chartType as string)).toEqual(expected);
  });

  it("uses Vega-Lite channel labels for every Bar variant", () => {
    const grouped = getEncodingChannelConfigs("GroupedBarChart");
    const stacked = getEncodingChannelConfigs("StackedBarChart");
    expect(grouped.find((config) => config.channel === "x")?.label).toBe("X");
    expect(grouped.find((config) => config.channel === "y")?.label).toBe("Y");
    expect(grouped.find((config) => config.channel === "color")?.label).toBe("Color");
    expect(stacked.find((config) => config.channel === "color")?.label).toBe("Color");
    expect(grouped.find((config) => config.channel === "y")?.required).toBe(true);
    expect(grouped.find((config) => config.channel === "color")?.required).toBe(true);
    expect(getEncodingChannelConfigs("SingleBarChart").find((config) => config.channel === "color")?.role).toBe("style");
    expect(grouped.find((config) => config.channel === "color")?.role).toBe("series");
    expect(grouped.find((config) => config.channel === "color")?.multiple).toBe(true);
    expect(stacked.find((config) => config.channel === "color")?.multiple).toBe(true);
  });

  it("declares measure-set and value-series slots for the Area family", () => {
    const area = getTemplateBindingContract("StackedAreaChart");
    expect(area?.slots.find((slot) => slot.id === "y")?.accepts).toContain("measure-set");
    expect(area?.slots.find((slot) => slot.id === "series")?.accepts).toContain("value-series");
  });

  it("derives type compatibility from the channel contract", () => {
    const barY = getEncodingChannelConfigs("SingleBarChart").find((config) => config.channel === "y")!;
    expect(isEncodingColumnCompatible(barY, "quantitative")).toBe(true);
    expect(isEncodingColumnCompatible(barY, "nominal")).toBe(false);
  });

  it("maps renderer channels to template semantic slots", () => {
    expect(semanticSlotForChannel("GroupedBarChart", "x")).toBe("category");
    expect(semanticSlotForChannel("GroupedBarChart", "y")).toBe("value");
    expect(semanticSlotForChannel("GroupedBarChart", "color")).toBe("group");
    expect(semanticSlotForChannel("StackedBarChart", "color")).toBe("segment");
    expect(semanticSlotForChannel("MatrixDiagram", "x")).toBe("column");
    expect(semanticSlotForChannel("MatrixDiagram", "y")).toBe("row");
    expect(semanticSlotForChannel("DonutChart", "theta")).toBe("theta");
  });

  it("exposes semantic slot requirements separately from renderer channels", () => {
    expect(getTemplateBindingContract("PieChart")?.slots).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: "theta", label: "Theta", required: true, accepts: ["measure", "measure-set"] }),
      expect.objectContaining({ id: "radius", label: "R", required: false, accepts: ["measure"] }),
      expect.objectContaining({ id: "slice", label: "Breakdown" }),
    ]));
    expect(getEncodingChannelConfigs("DonutChart").find((config) => config.channel === "theta")?.multiple).toBe(true);
  });

  it("treats single-line and multi-line as separate channel configurations", () => {
    const single = { chartType: "LineGraph", datasetId: "data", encodings: {} };
    const multi = { ...single, series: { field: "person", type: "nominal" as const } };
    const explicitMulti = { ...single, chartType: "MultiLineChart" };
    expect(resolveChartTemplateVariant(single)).toBe("line-single");
    expect(resolveChartTemplateVariant(multi)).toBe("line-multi");
    expect(resolveChartTemplateVariant(explicitMulti)).toBe("line-multi");
    expect(getEncodingChannelConfigsForSpec(single).map((config) => config.channel)).toEqual(["x", "y", "size", "shape"]);
    expect(getEncodingChannelConfigsForSpec(multi).map((config) => config.channel)).toEqual(["x", "y"]);
  });

  it("rejects one field occupying two semantic data channels", () => {
    const issues = resolveChartEncodingIssues({
      chartType: "LineGraph",
      datasetId: "data",
      encodings: {
        x: { field: "value", type: "quantitative" },
        y: { field: "value", type: "quantitative" },
      },
    });
    expect(issues).toEqual([
      expect.objectContaining({ code: "duplicate-data-field", channels: ["x", "y"], fields: ["value"] }),
    ]);
  });

  it("resolves a temporal Series source", () => {
    const spec = {
      chartType: "MultiLineChart",
      datasetId: "data",
      encodings: {
        x: { field: "index", type: "quantitative" as const },
        y: { field: "value", type: "quantitative" as const },
      },
      series: { field: "date", type: "temporal" as const },
    };
    expect(resolvedSeriesField(spec)).toBe("date");
    expect(resolveChartEncodingIssues(spec)).toEqual([]);
    expect(getEncodingChannelConfigs("MultiLineChart").find((config) => config.channel === "color")?.accepts).toContain("temporal");
  });

  it("derives the Polar R mode only from the R axis binding", () => {
    const base = { chartType: "PieChart", datasetId: "data", encodings: {} };
    expect(resolvedPolarRadiusMode(base)).toBe("static");
    expect(resolvedPolarRadiusMode({ ...base, encodings: { radius: { field: "total", type: "quantitative" } } })).toBe("mapped");
  });

  it("projects CSV theta and radius fields to Theta and R badges", () => {
    const spec = {
      chartType: "PieChart",
      datasetId: "data",
      encodings: { radius: { field: "weight", type: "quantitative" as const } },
      angleFields: ["water", "fat"]
        .map((field) => ({ field, type: "quantitative" as const })),
    };
    expect(resolvedPolarAxisRoles(spec, "water")).toEqual([{ channel: "theta", label: "Theta" }]);
    expect(resolvedPolarAxisRoles(spec, "fat")).toEqual([{ channel: "theta", label: "Theta" }]);
    expect(resolvedPolarAxisRoles(spec, "weight")).toEqual([{ channel: "radius", label: "R" }]);
  });
});
