import { describe, expect, it } from "vitest";
import { hasRequiredChartEncodings } from "../utils/chartTemplates";
import {
  DEFAULT_CHART_DATASET_ID,
  createDefaultChartSpec,
  defaultChartDataset,
  renderDefaultChartSvg,
} from "../utils/defaultChartData";

const chartTypes = [
  "SingleBarChart",
  "GroupedBarChart",
  "StackedBarChart",
  "DivergentBarChart",
  "DivergentStackedBarChart",
  "LineGraph",
  "MultiLineChart",
  "AreaChart",
  "StackedAreaChart",
  "Streamgraph",
  "HorizonChart",
  "Scatterplot",
  "MatrixDiagram",
  "PieChart",
  "DonutChart",
] as const;

describe("built-in default chart data", () => {
  it("provides one reusable long-form table with stable row identities", () => {
    expect(defaultChartDataset.id).toBe(DEFAULT_CHART_DATASET_ID);
    expect(defaultChartDataset.rows).toHaveLength(18);
    expect(defaultChartDataset.primaryKey).toEqual(["column", "group"]);
    expect(new Set(defaultChartDataset.rows.map((row) => `${row.column}:${row.group}`)).size).toBe(18);
  });

  it.each(chartTypes)("provides complete bindings for %s", (chartType) => {
    const spec = createDefaultChartSpec(chartType);
    expect(spec?.datasetId).toBe(DEFAULT_CHART_DATASET_ID);
    expect(spec && hasRequiredChartEncodings(spec)).toBe(true);
  });

  it.each(chartTypes)("renders the %s template SVG from the shared data", (chartType) => {
    const svg = renderDefaultChartSvg(chartType);
    expect(svg).toContain(`data-default-dataset-id="${DEFAULT_CHART_DATASET_ID}"`);
    expect(svg).toContain("data-renderer=");
    expect(svg).not.toContain("<image");
  });

  it.each(["PieChart", "DonutChart"])("uses the shared categorical and value fields for %s", (chartType) => {
    expect(createDefaultChartSpec(chartType)).toMatchObject({
      encodings: {
        theta: { field: "value", type: "quantitative" },
        segment: { field: "column", type: "ordinal" },
      },
      dataTransforms: [{ field: "group", values: ["Alpha"] }],
    });
  });
});
