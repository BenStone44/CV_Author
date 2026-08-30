import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { analyzeChartSpecRepairs } from "../utils/chartRepair";
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
    type: name === "time"
      ? "temporal"
      : name === "id" || name === "person"
        ? "nominal"
        : "quantitative",
  }));
  return {
    id: "case1",
    name: "case1.csv",
    columns,
    rows,
    primaryKey: ["person", "time"],
  };
}

const dataset = loadCase1Dataset();

function analyze(spec: Omit<ChartSpec, "datasetId">) {
  return analyzeChartSpecRepairs(dataset, { ...spec, datasetId: dataset.id });
}

function addedFieldSets(spec: Omit<ChartSpec, "datasetId">) {
  return analyze(spec).repairs.map((repair) => repair.addedFields);
}

describe("case1.csv chart-template compatibility and repair", () => {
  it("repairs time + weight_kg for LineGraph by adding a series field", () => {
    const spec = {
      chartType: "LineGraph",
      encodings: {
        x: { field: "time", type: "temporal" as const },
        y: { field: "weight_kg", type: "quantitative" as const },
      },
    };
    const result = analyze(spec);

    expect(result.status).toBe("DIMENSION_OVERFLOW");
    expect(result.issues).toEqual(["DIMENSION_OVERFLOW"]);
    expect(result.repairs.every((repair) => repair.binding.series?.length === 1)).toBe(true);
    expect(result.repairs.map((repair) => repair.addedFields)).toEqual([
      ["id"],
      ["person"],
    ]);
  });

  it("accepts person + time + weight_kg for MultiLineChart", () => {
    const result = analyze({
      chartType: "MultiLineChart",
      encodings: {
        x: { field: "time", type: "temporal" },
        y: { field: "weight_kg", type: "quantitative" },
      },
      series: { field: "person", type: "nominal" },
    });

    expect(result.status).toBe("VALID");
    expect(result.repairs).toEqual([expect.objectContaining({ addedFields: [] })]);
  });

  it("accepts time + weight_kg for Scatterplot without requiring a series", () => {
    const result = analyze({
      chartType: "Scatterplot",
      encodings: {
        x: { field: "time", type: "temporal" },
        y: { field: "weight_kg", type: "quantitative" },
      },
    });

    expect(result.status).toBe("VALID");
  });

  it("accepts time + weight_kg for SingleBarChart because aggregation is allowed", () => {
    const result = analyze({
      chartType: "SingleBarChart",
      encodings: {
        x: { field: "time", type: "temporal" },
        y: { field: "weight_kg", type: "quantitative" },
      },
    });

    expect(result.status).toBe("VALID");
  });

  it("repairs person + weight_kg for GroupedBarChart by adding a series", () => {
    const spec = {
      chartType: "GroupedBarChart",
      encodings: {
        x: { field: "person", type: "nominal" as const },
        y: { field: "weight_kg", type: "quantitative" as const },
      },
    };
    const result = analyze(spec);

    expect(result.status).toBe("DIMENSION_UNDERFLOW");
    expect(addedFieldSets(spec)).toEqual([
      ["id"],
      ["time"],
    ]);
    expect(result.repairs.every((repair) => repair.binding.series?.length === 1)).toBe(true);
  });

  it("accepts person + time + weight_kg for GroupedBarChart", () => {
    const result = analyze({
      chartType: "GroupedBarChart",
      encodings: {
        x: { field: "person", type: "nominal" },
        y: { field: "weight_kg", type: "quantitative" },
      },
      series: { field: "time", type: "temporal" },
    });

    expect(result.status).toBe("VALID");
  });

  it("repairs person + weight_kg for MatrixDiagram by adding a column dimension", () => {
    const spec = {
      chartType: "MatrixDiagram",
      encodings: {
        row: { field: "person", type: "nominal" as const },
        value: { field: "weight_kg", type: "quantitative" as const },
      },
    };
    const result = analyze(spec);

    expect(result.status).toBe("DIMENSION_UNDERFLOW");
    expect(addedFieldSets(spec)).toEqual([["id"], ["time"]]);
    expect(result.repairs.every((repair) => repair.binding.column?.length === 1)).toBe(true);
  });

  it("accepts person + time + weight_kg for MatrixDiagram", () => {
    const result = analyze({
      chartType: "MatrixDiagram",
      encodings: {
        row: { field: "person", type: "nominal" },
        column: { field: "time", type: "temporal" },
        value: { field: "weight_kg", type: "quantitative" },
      },
    });

    expect(result.status).toBe("VALID");
  });

  it("accepts a Pie Segment with static Theta", () => {
    const result = analyze({
      chartType: "PieChart",
      encodings: {
        segment: { field: "person", type: "nominal" as const },
      },
    });

    expect(result.status).toBe("VALID");
  });

  it("requires a Segment when only Pie Theta is bound", () => {
    const result = analyze({
      chartType: "PieChart",
      encodings: {
        angle: { field: "weight_kg", type: "quantitative" },
      },
    });

    expect(result.status).toBe("DIMENSION_UNDERFLOW");
  });

  it("repairs weight_kg-only Calendar by adding time as the date dimension", () => {
    const spec = {
      chartType: "CalendarHeatmap",
      encodings: {
        value: { field: "weight_kg", type: "quantitative" as const },
      },
    };
    const result = analyze(spec);

    expect(result.status).toBe("DIMENSION_UNDERFLOW");
    expect(addedFieldSets(spec)).toEqual([["time"]]);
    expect(result.repairs[0]?.binding.date).toEqual(["time"]);
  });

  it("reports an incompatible bound field as unresolvable by additions alone", () => {
    const result = analyze({
      chartType: "CalendarHeatmap",
      encodings: {
        date: { field: "person", type: "nominal" },
        value: { field: "weight_kg", type: "quantitative" },
      },
    });

    expect(result.status).toBe("UNRESOLVABLE");
    expect(result.issues).toContain("TYPE_MISMATCH");
    expect(result.repairs).toEqual([]);
  });

  it("accepts weight_kg + water_kg + fat_kg for ContourPlot", () => {
    const result = analyze({
      chartType: "ContourPlot",
      encodings: {
        x: { field: "weight_kg", type: "quantitative" },
        y: { field: "water_kg", type: "quantitative" },
        value: { field: "fat_kg", type: "quantitative" },
      },
    });

    expect(result.status).toBe("VALID");
  });
});
