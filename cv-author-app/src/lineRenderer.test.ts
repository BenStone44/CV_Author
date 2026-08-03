import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { renderLineChart } from "./lineRenderer";
import { scoreSeriesCandidates } from "./seriesInference";
import type { ChartSpec, DataColumn, DataRow, Dataset } from "./types";

function loadCase1Dataset(): Dataset {
  const source = readFileSync(resolve(import.meta.dirname, "../../case1.csv"), "utf8").trim();
  const [headerLine, ...lines] = source.split(/\r?\n/);
  const headers = headerLine!.split(",");
  const rows: DataRow[] = lines.map((line) => Object.fromEntries(
    line.split(",").map((value, index) => [headers[index]!, value]),
  ));
  const columns: DataColumn[] = headers.map((name) => ({
    name,
    type: name === "time" ? "temporal" : name === "person" ? "nominal" : "quantitative",
  }));
  return {
    id: "case1",
    name: "case1.csv",
    columns,
    rows,
    primaryKey: ["person", "time"],
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
  it("ranks person as the stable series field", () => {
    const candidates = scoreSeriesCandidates(loadCase1Dataset(), createChartSpec());

    expect(candidates[0]).toMatchObject({
      field: "person",
      groupCount: 5,
      averageGroupSize: 8,
      coverage: 1,
      xUniqueness: 1,
    });
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

    expect(result.content.match(/data-mark-role="series"/g)).toHaveLength(5);
    expect(result.content.match(/data-point-count="8"/g)).toHaveLength(5);
    expect(result.content).toContain('data-series-key="Person_A"');
    expect(result.content).toContain('data-series-key="Person_E"');
    expect(result.content).not.toContain("NaN");
    expect(result.scales.x.domain).toEqual([
      "2025-01-01T00:00:00.000Z",
      "2025-08-01T00:00:00.000Z",
    ]);
  });
});
