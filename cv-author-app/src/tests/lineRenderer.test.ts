import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { renderLineChart } from "../utils/lineRenderer";
import { scoreSeriesCandidates } from "../utils/seriesInference";
import type { ChartSpec, DataColumn, DataRow, Dataset } from "../types";

function loadCase1Dataset(): Dataset {
  const source = readFileSync(resolve(import.meta.dirname, "../../../data/case1.csv"), "utf8").trim();
  const [headerLine, ...lines] = source.split(/\r?\n/);
  const headers = headerLine!.split(",");
  const rows: DataRow[] = lines.map((line) => Object.fromEntries(
    line.split(",").map((value, index) => [headers[index]!, value]),
  ));
  const columns: DataColumn[] = headers.map((name) => ({
    name,
    type: name === "time" ? "temporal" : name === "id" || name === "person" ? "nominal" : "quantitative",
  }));
  return {
    id: "case1",
    name: "case1.csv",
    columns,
    rows,
    primaryKey: ["id"],
  };
}

function createChartSpec(): ChartSpec {
  return {
    chartType: "LineGraph",
    datasetId: "case1",
    encodings: {
      x: { field: "time", type: "temporal" },
      y: { field: "weight_kg", type: "quantitative" },
    },
    styleTokens: {
      palette: ["#2563eb", "#dc2626", "#16a34a", "#d97706", "#7c3aed"],
      axisColor: "#6b7280",
      textColor: "#374151",
      fontFamily: "Inter, sans-serif",
      fontSize: 11,
      lineWidth: 2,
    },
  };
}

describe("Case 1 deterministic line chart", () => {
  it("keeps both a business dimension and row identifier as valid series repairs", () => {
    const candidates = scoreSeriesCandidates(loadCase1Dataset(), createChartSpec());
    const person = candidates.find((candidate) => candidate.field === "person");
    const rowId = candidates.find((candidate) => candidate.field === "id");

    expect(person).toMatchObject({
      field: "person",
      groupCount: 5,
      averageGroupSize: 8,
      coverage: 1,
      xUniqueness: 1,
    });
    expect(rowId).toMatchObject({
      field: "id",
      groupCount: 40,
      averageGroupSize: 1,
      coverage: 1,
      xUniqueness: 1,
    });
    expect(person?.score).toBe(rowId?.score);
  });

  it("renders five series with eight time-ordered rows each", () => {
    const dataset = loadCase1Dataset();
    const chartSpec = {
      ...createChartSpec(),
      series: { field: "person", type: "nominal" as const },
    };
    const result = renderLineChart({
      chartId: "case1-line",
      width: 800,
      height: 400,
      minX: 0,
      minY: 0,
      coordinateGuide: {
        type: "Cartesian",
        origin: { x: 0, y: 400 },
        xDirection: 1,
        yDirection: -1,
      },
      chartSpec,
      dataset,
    });

    expect(result.content.match(/data-mark-role="line"/g)).toHaveLength(5);
    expect(result.content.match(/data-point-count="8"/g)).toHaveLength(5);
    expect(result.content).toContain('data-series-key="Person_A"');
    expect(result.content).toContain('data-series-key="Person_E"');
    expect(result.content).toContain('stroke-width="2.5"');
    expect(result.content).toContain('style="stroke: #2563eb; stroke-width: 2.5px;');
    expect(result.content).not.toContain("NaN");
    expect(result.scales.x.domain).toEqual([
      "2025-01-01T00:00:00.000Z",
      "2025-08-01T00:00:00.000Z",
    ]);
  });

  it("applies configured colors to individual series members", () => {
    const dataset = loadCase1Dataset();
    const result = renderLineChart({
      chartId: "member-color-line",
      width: 800,
      height: 400,
      minX: 0,
      minY: 0,
      coordinateGuide: { type: "Cartesian", origin: { x: 0, y: 400 }, xDirection: 1, yDirection: -1 },
      chartSpec: {
        ...createChartSpec(),
        series: { field: "person", type: "nominal" },
        markGroups: [{
          id: "mark-group:member-color-line:line",
          chartId: "member-color-line",
          role: "line",
          memberKeys: [],
          sharedConfig: {
            seriesColorMapping: {
              type: "categorical",
              values: { Person_A: "#00aa66" },
            },
          },
        }],
      },
      dataset,
    });

    const personA = result.content.match(/<g[^>]*data-series-key="Person_A"[\s\S]*?<\/g>/)?.[0] ?? "";
    expect(personA).toContain('stroke="#00aa66"');
    expect(result.content).toContain('data-series-key="Person_B"');
    expect(result.content).toContain('stroke="#e11d48"');
  });

  it("applies color, width, and line style from the multi-line Series config", () => {
    const dataset = loadCase1Dataset();
    const result = renderLineChart({
      chartId: "member-style-line",
      width: 800,
      height: 400,
      minX: 0,
      minY: 0,
      coordinateGuide: { type: "Cartesian", origin: { x: 0, y: 400 }, xDirection: 1, yDirection: -1 },
      chartSpec: {
        ...createChartSpec(),
        series: { field: "person", type: "nominal" },
        markGroups: [{
          id: "mark-group:member-style-line:line",
          chartId: "member-style-line",
          role: "line",
          memberKeys: [],
          sharedConfig: {
            seriesStyleMapping: {
              type: "series-style",
              values: {
                Person_A: { color: "#00aa66", strokeWidth: 5, shape: "dashed" },
              },
            },
          },
        }],
      },
      dataset,
    });

    const personA = result.content.match(/<g[^>]*data-series-key="Person_A"[\s\S]*?<\/g>/)?.[0] ?? "";
    expect(personA).toContain('data-line-style="dashed"');
    expect(personA).toContain('stroke="#00aa66"');
    expect(personA).toContain('stroke-width="5"');
    expect(personA).toContain('stroke-dasharray="15 10"');
  });

  it("uses a nominal color encoding as the line series field", () => {
    const dataset = loadCase1Dataset();
    const result = renderLineChart({
      chartId: "color-series-line",
      width: 800,
      height: 400,
      minX: 0,
      minY: 0,
      coordinateGuide: {
        type: "Cartesian",
        origin: { x: 0, y: 400 },
        xDirection: 1,
        yDirection: -1,
      },
      chartSpec: {
        ...createChartSpec(),
        encodings: {
          ...createChartSpec().encodings,
          color: { field: "person", type: "nominal" },
        },
      },
      dataset,
    });

    expect(result.content.match(/data-mark-role="line"/g)).toHaveLength(5);
    expect(result.content).toContain('data-series-key="Person_A"');
  });

  it("combines multiple chart-upgrade dimensions into multiline groups", () => {
    const dataset: Dataset = {
      id: "multi-dimension-line",
      name: "multi-dimension-line.csv",
      columns: [
        { name: "person", type: "nominal" },
        { name: "region", type: "nominal" },
        { name: "time", type: "temporal" },
        { name: "weight_kg", type: "quantitative" },
      ],
      rows: ["A", "B"].flatMap((person) => ["East", "West"].flatMap((region) => [
        { person, region, time: "2025-01-01", weight_kg: "80" },
        { person, region, time: "2025-02-01", weight_kg: "85" },
      ])),
    };
    const result = renderLineChart({
      chartId: "multi-dimension-line",
      width: 800,
      height: 400,
      minX: 0,
      minY: 0,
      coordinateGuide: { type: "Cartesian", origin: { x: 0, y: 400 }, xDirection: 1, yDirection: -1 },
      chartSpec: {
        ...createChartSpec(),
        datasetId: dataset.id,
        series: { field: "person", type: "nominal" },
        seriesFields: [
          { field: "person", type: "nominal" },
          { field: "region", type: "nominal" },
        ],
      },
      dataset,
    });

    expect(result.content.match(/data-mark-role="line"/g)).toHaveLength(4);
    expect(result.content).toContain('data-series-key="A / East"');
    expect(result.content).toContain('data-series-key="B / West"');
  });

  it("renders a single line when no series field is configured", () => {
    const result = renderLineChart({
      chartId: "case1-single-line",
      width: 800,
      height: 400,
      minX: 0,
      minY: 0,
      coordinateGuide: {
        type: "Cartesian",
        origin: { x: 0, y: 400 },
        xDirection: 1,
        yDirection: -1,
      },
      chartSpec: createChartSpec(),
      dataset: loadCase1Dataset(),
    });

    expect(result.content.match(/data-mark-role="line"/g)).toHaveLength(1);
    expect(result.content).toContain('data-point-count="8"');
    expect(result.content).not.toContain("data-mark-role=\"legend\"><g");
  });

  it("aggregates repeated X values with the configured operation", () => {
    const dataset: Dataset = {
      id: "monthly-weight",
      name: "monthly-weight.csv",
      columns: [
        { name: "person", type: "nominal" },
        { name: "time", type: "temporal" },
        { name: "weight_kg", type: "quantitative" },
      ],
      rows: [
        { person: "A", time: "2025-01-01", weight_kg: "80" },
        { person: "B", time: "2025-01-01", weight_kg: "100" },
        { person: "A", time: "2025-02-01", weight_kg: "90" },
        { person: "B", time: "2025-02-01", weight_kg: "110" },
      ],
      primaryKey: ["person", "time"],
    };
    const render = (operation: "sum" | "avg") => renderLineChart({
      chartId: `monthly-${operation}`,
      width: 800,
      height: 400,
      minX: 0,
      minY: 0,
      coordinateGuide: {
        type: "Cartesian",
        origin: { x: 0, y: 400 },
        xDirection: 1,
        yDirection: -1,
      },
      chartSpec: {
        ...createChartSpec(),
        datasetId: dataset.id,
        aggregations: { y: operation },
      },
      dataset,
    });

    const average = render("avg");
    const sum = render("sum");
    expect(average.content).toContain('data-point-count="2"');
    expect(average.scales.y.domain).toEqual([88, 102]);
    expect(sum.content).toContain('data-point-count="2"');
    expect(sum.scales.y.domain).toEqual([175, 205]);
  });

  it("renders nominal fields on both axes with point scales", () => {
    const dataset: Dataset = {
      id: "categorical",
      name: "categorical.csv",
      columns: [
        { name: "stage", type: "nominal" },
        { name: "band", type: "nominal" },
      ],
      rows: [
        { stage: "Plan", band: "Low" },
        { stage: "Build", band: "High" },
        { stage: "Ship", band: "Medium" },
      ],
    };
    const result = renderLineChart({
      chartId: "categorical-line",
      width: 800,
      height: 400,
      minX: 0,
      minY: 0,
      coordinateGuide: {
        type: "Cartesian",
        origin: { x: 0, y: 400 },
        xDirection: 1,
        yDirection: -1,
      },
      chartSpec: {
        chartType: "LineGraph",
        datasetId: dataset.id,
        encodings: {
          x: { field: "stage", type: "nominal" },
          y: { field: "band", type: "nominal" },
        },
      },
      dataset,
    });

    expect(result.scales.x).toMatchObject({ type: "point", domain: ["Plan", "Build", "Ship"] });
    expect(result.scales.y).toMatchObject({ type: "point", domain: ["Low", "High", "Medium"] });
    expect(result.content).not.toContain("<text");
    expect(result.content).not.toContain('data-mark-role="x-axis"');
    expect(result.content).not.toContain('data-mark-role="y-axis"');
  });

  it("applies independent Cartesian axis scale values to the plot area", () => {
    const result = renderLineChart({
      chartId: "scaled-line",
      width: 800,
      height: 400,
      minX: 0,
      minY: 0,
      coordinateGuide: {
        type: "Cartesian",
        origin: { x: 0, y: 400 },
        xDirection: 1,
        yDirection: -1,
        xScale: 0.5,
        yScale: 0.75,
      },
      chartSpec: createChartSpec(),
      dataset: loadCase1Dataset(),
    });

    const unscaledWidth = result.plotArea.width / 0.5;
    const unscaledHeight = result.plotArea.height / 0.75;
    expect(unscaledWidth / unscaledHeight).toBeCloseTo(4 / 3);
    expect(result.plotArea.width).toBeCloseTo((316 * 4 / 3) * 0.5);
    expect(result.plotArea.height).toBeCloseTo(316 * 0.75);
    expect(result.plotArea.y).toBeCloseTo(28 + 316 - 316 * 0.75);
  });

  it("renders line marks against a shared layer layout without another axis", () => {
    const dataset = loadCase1Dataset();
    const owner = renderLineChart({
      chartId: "layer-owner",
      width: 800,
      height: 400,
      minX: 0,
      minY: 0,
      coordinateGuide: {
        type: "Cartesian",
        origin: { x: 0, y: 400 },
        xDirection: 1,
        yDirection: -1,
      },
      chartSpec: {
        ...createChartSpec(),
        series: { field: "person", type: "nominal" },
      },
      dataset,
    });
    const member = renderLineChart({
      chartId: "layer-member",
      width: 800,
      height: 400,
      minX: 0,
      minY: 0,
      coordinateGuide: {
        type: "Cartesian",
        origin: { x: 0, y: 400 },
        xDirection: 1,
        yDirection: -1,
      },
      chartSpec: createChartSpec(),
      dataset,
      sharedPlotArea: owner.plotArea,
      sharedScales: owner.scales,
    });

    expect(member.content).toContain('data-renderer="deterministic-line-marks@3"');
    expect(owner.content).not.toContain("<text");
    expect(owner.content).not.toContain('data-mark-role="x-axis"');
    expect(owner.content).not.toContain('data-mark-role="y-axis"');
    expect(member.content).not.toContain('data-mark-role="x-axis"');
    expect(member.content).not.toContain('data-mark-role="y-axis"');
    expect(member.plotArea).toEqual(owner.plotArea);
    expect(member.scales).toEqual(owner.scales);
  });
});
