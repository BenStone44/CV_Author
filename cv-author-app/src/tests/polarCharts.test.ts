import { describe, expect, it } from "vitest";
import type { ChartSpec, Dataset } from "../types";
import { getChartContract } from "../utils/chartContracts";
import { CSV_MEASURE_VALUE_FIELD, materializeCsvValueSeries } from "../utils/chartDataPipeline";
import { renderDefaultChartSvg } from "../utils/defaultChartData";
import { renderDeterministicChart } from "../utils/semanticRenderer";
import { semanticSlotForChannel } from "../utils/chartTemplates";

const dataset: Dataset = {
  id: "polar-bars",
  name: "polar-bars.csv",
  columns: [
    { name: "category", type: "nominal" },
    { name: "series", type: "nominal" },
    { name: "value", type: "quantitative" },
  ],
  rows: [
    { category: "A", series: "One", value: "4" },
    { category: "A", series: "Two", value: "6" },
    { category: "B", series: "One", value: "3" },
    { category: "B", series: "Two", value: "5" },
  ],
  primaryKey: ["category", "series"],
};

const guide = {
  type: "Polar" as const,
  origin: { x: 160, y: 160 },
  angleOffset: 0,
  angleSpan: 360,
};

function render(chartType: string, stacked = false) {
  const circular = chartType.startsWith("Circular");
  const circularStacked = chartType === "CircularStackedBarChart";
  return renderDeterministicChart({
    chartId: chartType,
    width: 320,
    height: 320,
    minX: 0,
    minY: 0,
    coordinateGuide: guide,
    chartSpec: {
      chartType,
      datasetId: dataset.id,
      encodings: {
        ...(circularStacked
          ? {
            theta: { field: "value", type: "quantitative" as const },
            radius: { field: "category", type: "nominal" as const },
          }
          : circular
            ? {
              segment: { field: "category", type: "nominal" as const },
              theta: { field: "value", type: "quantitative" as const },
            }
            : {
              segment: { field: "category", type: "nominal" as const },
              radius: { field: "value", type: "quantitative" as const },
            }),
        ...(stacked ? { color: { field: "series", type: "nominal" as const } } : {}),
      },
      ...(stacked
        ? {
          series: { field: "series", type: "nominal" as const },
          seriesFields: [{ field: "series", type: "nominal" as const }],
        }
        : {}),
    },
    dataset,
  });
}

describe("basic Polar charts", () => {
  it("declares Circular Stacked Bar like Stacked Bar on Polar axes", () => {
    const channels = getChartContract("CircularStackedBarChart")?.channels;
    expect(channels).toEqual([
      expect.objectContaining({ channel: "theta", label: "Theta", role: "measure", required: true }),
      expect.objectContaining({ channel: "radius", label: "R", role: "dimension", required: true }),
      expect.objectContaining({ channel: "color", role: "series", semanticLabel: "Segment item", required: true }),
      expect.objectContaining({ channel: "size", role: "style", required: false }),
    ]);
    expect(semanticSlotForChannel("CircularStackedBarChart", "theta")).toBe("value");
    expect(semanticSlotForChannel("CircularStackedBarChart", "radius")).toBe("category");
    expect(semanticSlotForChannel("CircularStackedBarChart", "color")).toBe("segment");
  });

  it.each([
    "RadialBarChart",
    "RadialStackedBarChart",
    "RadialRectBarChart",
    "RadialRectStackedBarChart",
    "CircularBarChart",
    "CircularStackedBarChart",
    "RadarChart",
  ])("registers and previews %s", (chartType) => {
    expect(getChartContract(chartType)?.coordinateSystem).toBe("Polar");
    expect(renderDefaultChartSvg(chartType)).toContain("<svg");
  });

  it("renders sector and straight-edged radial bars from one radial layout", () => {
    const sector = render("RadialBarChart");
    const rectangle = render("RadialRectBarChart");

    expect(sector.content).toContain('data-polar-orientation="radial"');
    expect(sector.content).toContain('data-bar-shape="sector"');
    expect(sector.content.match(/data-mark-role="bar"/g)).toHaveLength(2);
    expect(rectangle.content).toContain('data-bar-shape="rectangle"');
    expect(rectangle.content.match(/data-mark-role="bar"/g)).toHaveLength(2);
    expect(rectangle.content).toMatch(/d="M[^A]+Z"/);
  });

  it.each(["RadialStackedBarChart", "RadialRectStackedBarChart"])("stacks %s along radius", (chartType) => {
    const result = render(chartType, true);
    expect(result.content).toContain('data-bar-variant="stacked"');
    expect(result.content).toContain('data-category-key="A"');
    expect(result.content).toContain('data-stack-start="4" data-stack-end="10"');
  });

  it("keeps circular bars angular while radial stacks grow along R", () => {
    const single = render("CircularBarChart");
    const stacked = render("CircularStackedBarChart", true);

    expect(single.content).toContain('data-polar-orientation="angular"');
    expect(single.content).toContain('data-bar-variant="single"');
    expect(stacked.content).toContain('data-polar-orientation="angular"');
    expect(stacked.content).toContain('data-category-field="category"');
    expect(stacked.content).toContain('data-value-field="value"');
    expect(stacked.content).toContain('data-stack-start="4" data-stack-end="10"');
    expect(stacked.polarArea?.startAngle).toBe(0);
  });

  it("clips every Circular Stacked Bar facet to its owning node angle band", () => {
    const result = renderDeterministicChart({
      chartId: "node-band-stacked-bars",
      width: 400,
      height: 400,
      minX: 0,
      minY: 0,
      coordinateGuide: { ...guide, origin: { x: 200, y: 200 } },
      chartSpec: {
        chartType: "CircularStackedBarChart",
        datasetId: dataset.id,
        encodings: {
          theta: { field: "value", type: "quantitative" },
          radius: { field: "category", type: "nominal" },
          color: { field: "series", type: "nominal" },
        },
        series: { field: "series", type: "nominal" },
        seriesFields: [{ field: "series", type: "nominal" }],
      },
      dataset,
      polarFacetCell: {
        startAngle: 37,
        angleSpan: 42,
        innerRadiusRatio: 0.46,
        outerRadiusRatio: 1,
        columnValue: "North",
      },
    });

    expect(result.content).toContain('data-angle-start="37"');
    expect(result.content).toContain('data-angle-span="42"');
    expect(result.content.match(/data-stack-start="0"/g)).toHaveLength(2);
    expect(result.content).toContain('data-category-key="A" data-series-key="Two"');
    expect(result.content).toContain('data-stack-start="4" data-stack-end="10"');
    expect(result.polarArea).toMatchObject({
      startAngle: 37,
      angleSpan: 42,
    });
    expect(result.polarArea?.innerRadius).toBeCloseTo(69.92);
    expect(result.polarArea?.outerRadius).toBeCloseTo(152);
  });

  it.each([
    ["RadialStackedBarChart", "radius"],
    ["CircularStackedBarChart", "theta"],
  ] as const)("materializes wide measure series onto the %s value axis", (chartType, valueChannel) => {
    const wideDataset: Dataset = {
      ...dataset,
      columns: [...dataset.columns, { name: "target", type: "quantitative" }],
      rows: dataset.rows.map((row) => ({ ...row, target: String(Number(row.value) + 2) })),
    };
    const prepared = materializeCsvValueSeries(wideDataset, {
      chartType,
      datasetId: wideDataset.id,
      encodings: {
        ...(chartType === "CircularStackedBarChart"
          ? { radius: { field: "category", type: "nominal" as const } }
          : { segment: { field: "category", type: "nominal" as const } }),
        [valueChannel]: { field: "value", type: "quantitative" },
      },
      valueFields: [
        { field: "value", type: "quantitative" },
        { field: "target", type: "quantitative" },
      ],
    });

    expect(prepared.chartSpec.encodings[valueChannel]?.field).toBe(CSV_MEASURE_VALUE_FIELD);
    expect(prepared.chartSpec.series?.field).toBe("__csv_measure__");
    const result = renderDeterministicChart({
      chartId: `wide-${chartType}`,
      width: 320,
      height: 320,
      minX: 0,
      minY: 0,
      coordinateGuide: guide,
      chartSpec: prepared.chartSpec,
      dataset: prepared.dataset,
    });
    expect(result.content).toContain('data-bar-variant="stacked"');
    expect(result.content.match(/data-mark-role="bar"/g)).toHaveLength(4);
  });

  it("renders a smooth, translucent, closed radar area with Polar axes", () => {
    const radarDataset: Dataset = {
      ...dataset,
      rows: [
        ...dataset.rows,
        { category: "C", series: "One", value: "5" },
        { category: "C", series: "Two", value: "2" },
      ],
    };
    const result = renderDeterministicChart({
      chartId: "radar",
      width: 320,
      height: 320,
      minX: 0,
      minY: 0,
      coordinateGuide: guide,
      chartSpec: {
        chartType: "RadarChart",
        datasetId: dataset.id,
        encodings: {
          theta: { field: "category", type: "nominal" },
          radius: { field: "value", type: "quantitative" },
          color: { field: "series", type: "nominal" },
        },
        series: { field: "series", type: "nominal" },
      },
      dataset: radarDataset,
    });

    expect(result.content).toContain('data-chart-type="radar"');
    expect(result.content.match(/data-mark-role="area"/g)).toHaveLength(2);
    expect(result.content).toContain('data-curve="catmull-rom-closed"');
    expect(result.content).toContain('fill-opacity="0.28"');
    expect(result.content).toContain('stroke-linecap="round"');
    expect(result.content).toMatch(/data-mark-role="area"[^>]+d="[^"]+C[^"]+Z"/);
    expect(result.content.match(/data-mark-role="radar-axis"/g)).toHaveLength(3);
  });

  it("maps a line facet cell into a real donut sector", () => {
    const lineSpec: ChartSpec = {
      chartType: "LineGraph",
      datasetId: dataset.id,
      encodings: {
        x: { field: "category", type: "nominal" },
        y: { field: "value", type: "quantitative" },
      },
    };
    const result = renderDeterministicChart({
      chartId: "polar-line-facet",
      width: 400,
      height: 400,
      minX: 0,
      minY: 0,
      coordinateGuide: { ...guide, origin: { x: 200, y: 200 } },
      chartSpec: lineSpec,
      dataset,
      polarFacetCell: {
        startAngle: 90,
        angleSpan: 60,
        innerRadiusRatio: 0.2,
        outerRadiusRatio: 1,
        columnValue: "Facet B",
      },
    });

    expect(result.content).toContain('data-chart-type="polar-facet-line"');
    expect(result.content).toContain('data-mark-role="facet-cell-frame"');
    expect(result.content).toContain('data-mark-role="line"');
    expect(result.polarArea).toMatchObject({ startAngle: 90, angleSpan: 60 });
  });
});
