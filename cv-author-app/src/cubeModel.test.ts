import { describe, expect, it } from "vitest";
import type { Dataset } from "./types";
import {
  bindCubeSourceToSlot,
  cloneCubeChartBinding,
  compileCubeValueSeries,
  createMeasureBreakdownBinding,
  createMeasureSetBinding,
  cubeDimensionStyleKey,
  cubeMeasureStyleKey,
  cubeResultFromDataset,
  summarizeCubeBinding,
  unbindCubeSlot,
  withCubeSeriesColor,
} from "./cubeModel";

describe("Cube result semantic binding", () => {
  it("binds one measure to selected members of a breakdown dimension", () => {
    const dataset: Dataset = {
      id: "body-composition",
      name: "body-composition.csv",
      columns: [
        { name: "person", type: "nominal" },
        { name: "date", type: "temporal" },
        { name: "component", type: "nominal" },
        { name: "weight", type: "quantitative" },
      ],
      rows: [
        { person: "P1", date: "2026-01-01", component: "water", weight: "38" },
        { person: "P1", date: "2026-01-01", component: "fat", weight: "18" },
        { person: "P2", date: "2026-01-01", component: "water", weight: "40" },
        { person: "P2", date: "2026-01-01", component: "fat", weight: "16" },
      ],
    };
    const cube = cubeResultFromDataset(dataset);
    const binding = createMeasureBreakdownBinding(cube, "weight", "component", ["water", "fat"]);
    const compiled = compileCubeValueSeries(cube, binding);

    expect(cube.schema.dimensions.map((dimension) => dimension.id)).toEqual(["person", "date", "component"]);
    expect(cube.schema.measures.map((measure) => measure.id)).toEqual(["weight"]);
    expect(compiled.errors).toEqual([]);
    expect(compiled.rows).toEqual([
      {
        seriesKey: "water",
        styleKey: cubeDimensionStyleKey("component", "water"),
        value: 78,
        measureId: "weight",
        dimensionId: "component",
        memberId: "water",
        sourceCount: 2,
      },
      {
        seriesKey: "fat",
        styleKey: cubeDimensionStyleKey("component", "fat"),
        value: 34,
        measureId: "weight",
        dimensionId: "component",
        memberId: "fat",
        sourceCount: 2,
      },
    ]);
  });

  it("normalizes a measure set to one value series", () => {
    const dataset: Dataset = {
      id: "finance",
      name: "finance.csv",
      columns: [
        { name: "region", type: "nominal" },
        { name: "revenue", type: "quantitative" },
        { name: "cost", type: "quantitative" },
        { name: "profit", type: "quantitative" },
      ],
      rows: [
        { region: "East", revenue: "120", cost: "90", profit: "30" },
        { region: "West", revenue: "100", cost: "80", profit: "20" },
      ],
    };
    const cube = cubeResultFromDataset(dataset);
    const binding = createMeasureSetBinding(cube, ["revenue", "profit"]);
    const compiled = compileCubeValueSeries(cube, binding);

    expect(compiled.errors).toEqual([]);
    expect(compiled.rows.map(({ seriesKey, styleKey, value }) => ({ seriesKey, styleKey, value }))).toEqual([
      { seriesKey: "revenue", styleKey: cubeMeasureStyleKey("revenue"), value: 220 },
      { seriesKey: "profit", styleKey: cubeMeasureStyleKey("profit"), value: 50 },
    ]);
  });

  it("keeps member colors stable when a binding is cloned", () => {
    const cube = cubeResultFromDataset({
      id: "colors",
      name: "colors.csv",
      columns: [{ name: "component", type: "nominal" }, { name: "weight", type: "quantitative" }],
      rows: [{ component: "water", weight: "38" }],
    });
    const styleKey = cubeDimensionStyleKey("component", "water");
    const binding = withCubeSeriesColor(
      createMeasureBreakdownBinding(cube, "weight", "component"),
      styleKey,
      "#3b82f6",
    );
    const clone = cloneCubeChartBinding(binding)!;

    clone.visualMappings!.color!.memberStyles![styleKey]!.color = "#ef4444";
    expect(binding.visualMappings?.color?.memberStyles?.[styleKey]?.color).toBe("#3b82f6");
  });

  it("persists semantic Cartesian slots independently from renderer encodings", () => {
    const cube = cubeResultFromDataset({
      id: "sales",
      name: "sales.csv",
      columns: [
        { name: "month", type: "temporal" },
        { name: "region", type: "nominal" },
        { name: "revenue", type: "quantitative" },
      ],
      rows: [
        { month: "2026-01", region: "East", revenue: "120" },
        { month: "2026-02", region: "West", revenue: "140" },
      ],
    });
    const withCategory = bindCubeSourceToSlot(cube, undefined, "category", {
      kind: "dimension",
      dimensionId: "region",
      memberIds: ["East", "West"],
    });
    const binding = bindCubeSourceToSlot(cube, withCategory, "value", {
      kind: "measure-set",
      measureIds: ["revenue"],
    }, "sum");

    expect(binding.slots.category).toEqual({
      kind: "dimension",
      dimensionId: "region",
      memberIds: ["East", "West"],
    });
    expect(binding.slots.value).toEqual({ kind: "measure", measureId: "revenue" });
    expect(binding.aggregation).toEqual({ revenue: "sum" });
    expect(binding.unresolvedDimensions).toEqual([{ dimensionId: "month", policy: "rollup" }]);
    expect(summarizeCubeBinding(cube, binding, "bar")).toBe("revenue, by region: East, West");

    const cleared = unbindCubeSlot(cube, binding, "category");
    expect(cleared?.slots.category).toBeUndefined();
    expect(cleared?.unresolvedDimensions).toEqual([
      { dimensionId: "month", policy: "rollup" },
      { dimensionId: "region", policy: "rollup" },
    ]);
  });

  it("removes aggregation metadata when its measure source is replaced or unbound", () => {
    const cube = cubeResultFromDataset({
      id: "measure-replacement",
      name: "measure-replacement.csv",
      columns: [
        { name: "group", type: "nominal" },
        { name: "revenue", type: "quantitative" },
        { name: "profit", type: "quantitative" },
      ],
      rows: [{ group: "A", revenue: "10", profit: "4" }],
    });
    const revenue = bindCubeSourceToSlot(cube, undefined, "value", {
      kind: "measure",
      measureId: "revenue",
    }, "sum");
    const profit = bindCubeSourceToSlot(cube, revenue, "value", {
      kind: "measure",
      measureId: "profit",
    }, "avg");

    expect(profit.aggregation).toEqual({ profit: "avg" });
    expect(unbindCubeSlot(cube, profit, "value")?.aggregation).toBeUndefined();
  });

  it("uses a supplied converted Cube result as the authoritative input", () => {
    const supplied = {
      schema: {
        version: 1 as const,
        id: "converted-input",
        dimensions: [{
          id: "component",
          label: "Component",
          type: "nominal" as const,
          members: [{ id: "water", label: "Water" }],
        }],
        measures: [{
          id: "weight",
          label: "Weight",
          grainDimensionIds: ["component"],
          aggregation: { default: "sum" as const, additivity: "additive" as const },
        }],
      },
      cells: [{ coordinates: { component: "water" }, values: { weight: 38 } }],
    };
    const dataset: Dataset = {
      id: "converted",
      name: "converted",
      columns: [],
      rows: [],
      cubeResult: supplied,
    };

    expect(cubeResultFromDataset(dataset)).toBe(supplied);
  });

  it("rejects sum across multiple cells for a non-additive measure", () => {
    const cube = cubeResultFromDataset({
      id: "inventory",
      name: "inventory",
      columns: [
        { name: "month", type: "temporal" },
        { name: "balance", type: "quantitative" },
      ],
      rows: [
        { month: "2026-01", balance: "12" },
        { month: "2026-02", balance: "15" },
      ],
    });
    cube.schema.measures[0]!.aggregation = { default: "sum", additivity: "non-additive" };
    const compiled = compileCubeValueSeries(cube, createMeasureSetBinding(cube, ["balance"]));

    expect(compiled.rows).toEqual([]);
    expect(compiled.errors).toEqual(["balance is non-additive and cannot be summed across 2 cells."]);
  });
});
