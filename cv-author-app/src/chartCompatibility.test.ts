import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import type { Dataset } from "./types";
import { cubeResultFromDataset } from "./cubeModel";
import {
  cubeSelectionFromState,
  evaluateSingleChartAssignment,
  evaluateSingleChartCompatibility,
  recommendSingleChartAlternatives,
  singleChartTemplateRequirements,
} from "./chartCompatibility";

function loadCase1Dataset(): Dataset {
  const lines = readFileSync(new URL("../../data/case1.csv", import.meta.url), "utf8").trim().split(/\r?\n/);
  const headers = lines[0]!.split(",");
  return {
    id: "case1",
    name: "case1.csv",
    columns: headers.map((name) => ({
      name,
      type: name === "id" || name === "person" ? "nominal" as const : name === "time" ? "temporal" as const : "quantitative" as const,
    })),
    rows: lines.slice(1).map((line) => Object.fromEntries(line.split(",").map((value, index) => [headers[index]!, value]))),
    primaryKey: ["id"],
  };
}

const case1Cube = cubeResultFromDataset(loadCase1Dataset());

const singleLineCube = cubeResultFromDataset({
  id: "single-line",
  name: "single-line.csv",
  columns: [
    { name: "time", type: "temporal" },
    { name: "value", type: "quantitative" },
  ],
  rows: [
    { time: "2026-01-01", value: "8" },
    { time: "2026-02-01", value: "11" },
    { time: "2026-03-01", value: "9" },
  ],
});

const signedCube = cubeResultFromDataset({
  id: "signed",
  name: "signed.csv",
  columns: [
    { name: "category", type: "nominal" },
    { name: "segment", type: "nominal" },
    { name: "delta", type: "quantitative" },
  ],
  rows: [
    { category: "A", segment: "Actual", delta: "8" },
    { category: "A", segment: "Plan", delta: "-3" },
    { category: "B", segment: "Actual", delta: "5" },
    { category: "B", segment: "Plan", delta: "-6" },
  ],
});

const signedSingleCube = cubeResultFromDataset({
  id: "signed-single",
  name: "signed-single.csv",
  columns: [
    { name: "category", type: "nominal" },
    { name: "delta", type: "quantitative" },
  ],
  rows: [
    { category: "A", delta: "8" },
    { category: "B", delta: "-3" },
    { category: "C", delta: "5" },
    { category: "D", delta: "-6" },
  ],
});

function withUnselectedRowId(cube: ReturnType<typeof cubeResultFromDataset>) {
  return {
    schema: {
      ...cube.schema,
      dimensions: [
        ...cube.schema.dimensions,
        {
          id: "row_id",
          label: "row_id",
          type: "nominal" as const,
          members: cube.cells.map((_, index) => ({ id: `row_${index + 1}`, label: `row_${index + 1}`, order: index })),
        },
      ],
      measures: cube.schema.measures.map((measure) => ({
        ...measure,
        grainDimensionIds: [...measure.grainDimensionIds, "row_id"],
      })),
    },
    cells: cube.cells.map((cell, index) => ({
      ...cell,
      coordinates: { ...cell.coordinates, row_id: `row_${index + 1}` },
    })),
  };
}

const hierarchyCube = cubeResultFromDataset({
  id: "hierarchy",
  name: "hierarchy.csv",
  columns: [
    { name: "id", type: "nominal" },
    { name: "parent", type: "nominal" },
    { name: "value", type: "quantitative" },
  ],
  rows: [
    { id: "root", parent: "", value: "10" },
    { id: "a", parent: "root", value: "6" },
    { id: "b", parent: "root", value: "4" },
  ],
});

const gridCube = cubeResultFromDataset({
  id: "grid",
  name: "grid.csv",
  columns: [
    { name: "x", type: "quantitative" },
    { name: "y", type: "quantitative" },
    { name: "z", type: "quantitative" },
  ],
  rows: [
    { x: "0", y: "0", z: "1" },
    { x: "0", y: "1", z: "2" },
    { x: "1", y: "0", z: "3" },
    { x: "1", y: "1", z: "4" },
  ],
});

const flowCube = cubeResultFromDataset({
  id: "flow",
  name: "flow.csv",
  columns: [
    { name: "source", type: "nominal" },
    { name: "target", type: "nominal" },
    { name: "value", type: "quantitative" },
  ],
  rows: [
    { source: "A", target: "B", value: "8" },
    { source: "A", target: "C", value: "5" },
    { source: "B", target: "D", value: "3" },
  ],
});

describe("single-chart compatibility requirements", () => {
  it("covers every current concrete template with channel and data-shape metadata", () => {
    expect(singleChartTemplateRequirements).toHaveLength(26);
    expect(new Set(singleChartTemplateRequirements.map((requirement) => requirement.chartType)).size).toBe(26);
    singleChartTemplateRequirements.forEach((requirement) => {
      expect(requirement.channels.length).toBeGreaterThan(0);
      expect(requirement.channels.some((channel) => channel.required)).toBe(true);
      expect(requirement.dataShape.length).toBeGreaterThan(12);
      expect(requirement.constraints.length).toBeGreaterThan(0);
    });
  });

  it("has at least one compatible Cube selection for all 26 templates", () => {
    const fixtures: Record<string, { cube: typeof case1Cube; dimensionIds: string[]; measureIds: string[] }> = {
      LineGraph: { cube: singleLineCube, dimensionIds: ["time"], measureIds: ["value"] },
      MultiLineChart: { cube: case1Cube, dimensionIds: ["time", "person"], measureIds: ["weight_kg"] },
      ParallelCoordinatesPlot: { cube: case1Cube, dimensionIds: [], measureIds: ["weight_kg", "water_kg", "fat_kg"] },
      AreaChart: { cube: singleLineCube, dimensionIds: ["time"], measureIds: ["value"] },
      StackedAreaChart: { cube: case1Cube, dimensionIds: ["time", "person"], measureIds: ["weight_kg"] },
      Streamgraph: { cube: case1Cube, dimensionIds: ["time", "person"], measureIds: ["weight_kg"] },
      HorizonChart: { cube: case1Cube, dimensionIds: ["time", "person"], measureIds: ["weight_kg"] },
      SingleBarChart: { cube: singleLineCube, dimensionIds: ["time"], measureIds: ["value"] },
      GroupedBarChart: { cube: case1Cube, dimensionIds: ["time", "person"], measureIds: ["weight_kg"] },
      StackedBarChart: { cube: case1Cube, dimensionIds: ["time", "person"], measureIds: ["weight_kg"] },
      DivergentBarChart: { cube: signedSingleCube, dimensionIds: ["category"], measureIds: ["delta"] },
      DivergentStackedBarChart: { cube: signedCube, dimensionIds: ["category", "segment"], measureIds: ["delta"] },
      Calendar: { cube: singleLineCube, dimensionIds: ["time"], measureIds: ["value"] },
      Scatterplot: { cube: case1Cube, dimensionIds: [], measureIds: ["weight_kg", "water_kg"] },
      PieChart: { cube: case1Cube, dimensionIds: [], measureIds: ["weight_kg"] },
      DonutChart: { cube: case1Cube, dimensionIds: [], measureIds: ["weight_kg"] },
      MatrixDiagram: { cube: case1Cube, dimensionIds: ["person", "time"], measureIds: ["weight_kg"] },
      Boxplot: { cube: case1Cube, dimensionIds: [], measureIds: ["weight_kg", "water_kg"] },
      Contour: { cube: gridCube, dimensionIds: [], measureIds: ["x", "y", "z"] },
      Hexbin: { cube: case1Cube, dimensionIds: [], measureIds: ["weight_kg", "water_kg"] },
      Icicle: { cube: hierarchyCube, dimensionIds: ["id", "parent"], measureIds: ["value"] },
      Sunburst: { cube: hierarchyCube, dimensionIds: ["id", "parent"], measureIds: ["value"] },
      Treemap: { cube: hierarchyCube, dimensionIds: ["id", "parent"], measureIds: ["value"] },
      Dendrogram: { cube: hierarchyCube, dimensionIds: ["id", "parent"], measureIds: ["value"] },
      Chord: { cube: flowCube, dimensionIds: ["source", "target"], measureIds: ["value"] },
      Sankey: { cube: flowCube, dimensionIds: ["source", "target"], measureIds: ["value"] },
    };
    expect(Object.keys(fixtures)).toHaveLength(26);
    Object.entries(fixtures).forEach(([chartType, fixture]) => {
      const baseline = evaluateSingleChartCompatibility(chartType, fixture, fixture.cube);
      const withId = evaluateSingleChartCompatibility(chartType, fixture, withUnselectedRowId(fixture.cube));
      expect(baseline.status, chartType).toBe("compatible");
      expect(withId, `${chartType} changed after an unselected ID was added`).toEqual(baseline);
    });
  });

  it("converts a partial Data Cube UI selection into engine input", () => {
    expect(cubeSelectionFromState({
      selected: { person: true, time: false, __measures__: true },
      values: { person: ["Person_A", "Person_B"], time: [], __measures__: ["weight_kg"] },
      fields: { person: "person", time: "time" },
      aggregations: {},
    }, case1Cube)).toEqual({
      dimensionIds: ["person"],
      measureIds: ["weight_kg"],
      dimensionMembers: { person: ["Person_A", "Person_B"] },
    });
  });
});

describe("case1.csv compatibility cases", () => {
  it("exposes the row id as a nominal Cube dimension", () => {
    const idDimension = case1Cube.schema.dimensions.find((dimension) => dimension.id === "id");

    expect(idDimension?.type).toBe("nominal");
    expect(idDimension?.members).toHaveLength(40);
    expect(case1Cube.schema.measures.some((measure) => measure.id === "id")).toBe(false);
  });

  it("rejects time and weight for Single Line when each time has multiple people", () => {
    const result = evaluateSingleChartCompatibility("LineGraph", {
      dimensionIds: ["time"],
      measureIds: ["weight_kg"],
    }, case1Cube);
    expect(result.status).toBe("incompatible");
    expect(result.assignment.x?.map((field) => field.id)).toEqual(["time"]);
    expect(result.assignment.y?.map((field) => field.id)).toEqual(["weight_kg"]);
    expect(result.issues.map((issue) => issue.code)).toContain("duplicate-x");
  });

  it("requires person as Series before the Case 1 Multi-Line Chart is complete", () => {
    const result = evaluateSingleChartCompatibility("MultiLineChart", {
      dimensionIds: ["time"],
      measureIds: ["weight_kg"],
    }, case1Cube);
    expect(result.status).toBe("incomplete");
    expect(result.missingChannels.map((missing) => missing.channel)).toEqual(["color"]);
    expect(result.missingChannels[0]?.candidateFieldIds).toEqual([]);
  });

  it("accepts time, person, and weight as a Case 1 Multi-Line Chart", () => {
    const selection = { dimensionIds: ["time", "person"], measureIds: ["weight_kg"] };
    const result = evaluateSingleChartCompatibility("MultiLineChart", selection, case1Cube);
    expect(result.status).toBe("compatible");
    expect(result.assignment.x?.map((field) => field.id)).toEqual(["time"]);
    expect(result.assignment.color?.map((field) => field.id)).toEqual(["person"]);
    expect(result.assignment.y?.map((field) => field.id)).toEqual(["weight_kg"]);
    expect(recommendSingleChartAlternatives("LineGraph", {
      dimensionIds: ["time"],
      measureIds: ["weight_kg"],
    }, case1Cube)[0]).toMatchObject({ chartType: "MultiLineChart", status: "incomplete" });
  });

  it("marks Grouped Bar incomplete without a group dimension and recommends Single Bar", () => {
    const selection = { dimensionIds: ["time"], measureIds: ["weight_kg"] };
    const result = evaluateSingleChartCompatibility("GroupedBarChart", selection, case1Cube);
    expect(result.status).toBe("incomplete");
    expect(result.missingChannels.map((missing) => missing.channel)).toEqual(["color"]);
    expect(result.missingChannels[0]?.candidateFieldIds).toEqual([]);
    expect(recommendSingleChartAlternatives("GroupedBarChart", selection, case1Cube)
      .every((alternative) => alternative.compatibility.assignment.color?.[0]?.id !== "person")).toBe(true);
  });

  it("rejects an all-positive measure for Divergent Bar and recommends Single Bar", () => {
    const selection = { dimensionIds: ["time"], measureIds: ["value"] };
    const result = evaluateSingleChartCompatibility("DivergentBarChart", selection, singleLineCube);
    expect(result.status).toBe("incompatible");
    expect(result.issues.map((issue) => issue.code)).toContain("unsigned-measure");
    expect(recommendSingleChartAlternatives("DivergentBarChart", selection, singleLineCube)[0]).toMatchObject({
      chartType: "SingleBarChart",
      status: "compatible",
    });
  });

  it("evaluates signed values only inside the selected dimension members", () => {
    const cube = cubeResultFromDataset({
      id: "member-filtered-sign",
      name: "member-filtered-sign.csv",
      columns: [
        { name: "group", type: "nominal" },
        { name: "delta", type: "quantitative" },
      ],
      rows: [
        { group: "positive", delta: "5" },
        { group: "positive", delta: "8" },
        { group: "negative", delta: "-3" },
        { group: "negative", delta: "-7" },
      ],
    });
    const result = evaluateSingleChartCompatibility("DivergentBarChart", {
      dimensionIds: ["group"],
      measureIds: ["delta"],
      dimensionMembers: { group: ["positive"] },
    }, cube);
    expect(result.status).toBe("incompatible");
    expect(result.issues.map((issue) => issue.code)).toContain("unsigned-measure");
  });

  it("accepts person x time with weight as a Matrix cell value", () => {
    const result = evaluateSingleChartCompatibility("MatrixDiagram", {
      dimensionIds: ["person", "time"],
      measureIds: ["weight_kg"],
    }, case1Cube);
    expect(result.status).toBe("compatible");
    expect([result.assignment.row?.[0]?.id, result.assignment.column?.[0]?.id]).toEqual(expect.arrayContaining(["person", "time"]));
    expect(result.assignment.value?.[0]?.id).toBe("weight_kg");
  });

  it("accepts three measures as Parallel Coordinates numeric dimensions", () => {
    const result = evaluateSingleChartCompatibility("ParallelCoordinatesPlot", {
      dimensionIds: [],
      measureIds: ["weight_kg", "water_kg", "fat_kg"],
    }, case1Cube);
    expect(result.status).toBe("compatible");
    expect(result.assignment.dimensions?.map((field) => field.id)).toEqual(["weight_kg", "water_kg", "fat_kg"]);
  });

  it("rejects three correlated measures as a Contour grid and recommends Hexbin", () => {
    const selection = { dimensionIds: [], measureIds: ["weight_kg", "water_kg", "fat_kg"] };
    const result = evaluateSingleChartCompatibility("Contour", selection, case1Cube);
    expect(result.status).toBe("incompatible");
    expect(result.issues.map((issue) => issue.code)).toContain("irregular-grid");
    expect(recommendSingleChartAlternatives("Contour", selection, case1Cube)[0]).toMatchObject({
      chartType: "Hexbin",
      status: "compatible",
    });
  });

  it("marks Calendar incomplete when only person and weight are selected", () => {
    const result = evaluateSingleChartCompatibility("Calendar", {
      dimensionIds: ["person"],
      measureIds: ["weight_kg"],
    }, case1Cube);
    expect(result.status).toBe("incomplete");
    expect(result.missingChannels.map((missing) => missing.channel)).toContain("date");
    expect(result.missingChannels.find((missing) => missing.channel === "date")?.candidateFieldIds).toEqual([]);
  });

  it("rejects person and time as a hierarchy adjacency list", () => {
    const result = evaluateSingleChartCompatibility("Sunburst", {
      dimensionIds: ["person", "time"],
      measureIds: ["weight_kg"],
    }, case1Cube);
    expect(result.status).toBe("incompatible");
    expect(result.issues.map((issue) => issue.code)).toContain("invalid-hierarchy");
  });
});

describe("selected-data-only relationship constraints", () => {
  it("uses X -> Y rather than raw duplicate row keys for Single Line", () => {
    const duplicateRows = cubeResultFromDataset({
      id: "duplicate-observations",
      name: "duplicate-observations.csv",
      columns: [
        { name: "time", type: "temporal" },
        { name: "value", type: "quantitative" },
      ],
      rows: [
        { time: "2026-01-01", value: "8" },
        { time: "2026-01-01", value: "8" },
        { time: "2026-02-01", value: "9" },
      ],
    });
    const conflictingRows = cubeResultFromDataset({
      id: "conflicting-observations",
      name: "conflicting-observations.csv",
      columns: [
        { name: "time", type: "temporal" },
        { name: "value", type: "quantitative" },
      ],
      rows: [
        { time: "2026-01-01", value: "8" },
        { time: "2026-01-01", value: "10" },
        { time: "2026-02-01", value: "9" },
      ],
    });
    const selection = { dimensionIds: ["time"], measureIds: ["value"] };

    expect(evaluateSingleChartCompatibility("LineGraph", selection, duplicateRows).status).toBe("compatible");
    const conflict = evaluateSingleChartCompatibility("LineGraph", selection, conflictingRows);
    expect(conflict.status).toBe("incompatible");
    expect(conflict.issues.map((issue) => issue.code)).toContain("duplicate-x");
  });

  it("keeps a 5 x 12 x 5 selected projection unchanged after an unselected nominal ID is added", () => {
    const rows = Array.from({ length: 5 }, (_, personIndex) =>
      Array.from({ length: 12 }, (_, monthIndex) =>
        Array.from({ length: 5 }, (_, weightIndex) => ({
          person: `P${personIndex + 1}`,
          month: `2026-${String(monthIndex + 1).padStart(2, "0")}-01`,
          weight_type: `W${weightIndex + 1}`,
          weight: String(50 + personIndex * 100 + monthIndex * 10 + weightIndex),
        })),
      ),
    ).flat(2);
    const cube = cubeResultFromDataset({
      id: "five-by-twelve-by-five",
      name: "five-by-twelve-by-five.csv",
      columns: [
        { name: "person", type: "nominal" },
        { name: "month", type: "temporal" },
        { name: "weight_type", type: "nominal" },
        { name: "weight", type: "quantitative" },
      ],
      rows,
    });
    const cubeWithId = withUnselectedRowId(cube);
    const selection = { dimensionIds: ["month"], measureIds: ["weight"] };

    const baseline = evaluateSingleChartCompatibility("MultiLineChart", selection, cube);
    const afterId = evaluateSingleChartCompatibility("MultiLineChart", selection, cubeWithId);
    expect(afterId).toEqual(baseline);
    expect(baseline.status).toBe("incomplete");
    expect(baseline.missingChannels[0]?.candidateFieldIds).toEqual([]);

    const personSeries = evaluateSingleChartCompatibility("MultiLineChart", {
      dimensionIds: ["month", "person"],
      measureIds: ["weight"],
    }, cubeWithId);
    expect(personSeries.status).toBe("incompatible");
    expect(personSeries.issues.map((issue) => issue.code)).toContain("duplicate-x-series");

    const rowIdSeries = evaluateSingleChartAssignment("MultiLineChart", {
      x: ["month"],
      y: ["weight"],
      color: ["row_id"],
    }, cubeWithId);
    expect(rowIdSeries.status).toBe("incompatible");
    expect(rowIdSeries.issues.map((issue) => issue.code)).toContain("insufficient-series-points");
  });

  it("evaluates relationship constraints after applying selected member filters", () => {
    const unfiltered = evaluateSingleChartCompatibility("LineGraph", {
      dimensionIds: ["time"],
      measureIds: ["weight_kg"],
    }, case1Cube);
    const onePerson = evaluateSingleChartCompatibility("LineGraph", {
      dimensionIds: ["time"],
      measureIds: ["weight_kg"],
      dimensionMembers: { person: ["Person_A"] },
    }, case1Cube);

    expect(unfiltered.status).toBe("incompatible");
    expect(onePerson.status).toBe("compatible");
  });
});
