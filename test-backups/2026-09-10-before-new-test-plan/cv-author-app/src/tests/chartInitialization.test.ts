import { describe, expect, it } from "vitest";
import { createUnboundChartSpec } from "../stores/useCanvasStore";
import { createDefaultChartSpec } from "../utils/defaultChartData";

describe("new chart initialization", () => {
  it("leaves Cartesian channels unbound until fields are dropped", () => {
    expect(createUnboundChartSpec("LineGraph", "dataset:case1")).toEqual({
      chartType: "LineGraph",
      templateId: "line",
      datasetId: "dataset:case1",
      encodings: {},
    });
  });

  it("does not pre-bind a Polar angle channel", () => {
    expect(createUnboundChartSpec("PieChart", "dataset:case1")).toEqual({
      chartType: "PieChart",
      templateId: "pie",
      datasetId: "dataset:case1",
      encodings: {},
    });
  });

  it("initializes Bar variants with the shared Bar template contract", () => {
    expect(createUnboundChartSpec("DivergentStackedBarChart", "dataset:case1")).toEqual({
      chartType: "DivergentStackedBarChart",
      templateId: "bar",
      datasetId: "dataset:case1",
      encodings: {},
    });
  });

  it("keeps the selected dataset as the chart source when using default bindings", () => {
    const spec = createDefaultChartSpec("LineGraph");
    expect(spec).toMatchObject({
      datasetId: "builtin:default-cartesian-data",
      encodings: {
        x: { field: "column" },
        y: { field: "value" },
      },
    });
    expect({ ...spec, datasetId: "dataset:selected" }).toMatchObject({
      datasetId: "dataset:selected",
      encodings: spec?.encodings,
    });
  });
});
