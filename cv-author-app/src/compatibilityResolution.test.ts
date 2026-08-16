import { describe, expect, it } from "vitest";
import { cubeResultFromDataset } from "./cubeModel";
import {
  advanceCompatibilityResolutionSession,
  backCompatibilityResolutionSession,
  compatibilityResolutionStateFromChartSpec,
  createCompatibilityResolutionSession,
  planCompatibilityResolution,
  type CompatibilityResolutionState,
} from "./compatibilityResolution";

const caseCube = cubeResultFromDataset({
  id: "resolution-case",
  name: "resolution-case.csv",
  columns: [
    { name: "person", type: "nominal" },
    { name: "time", type: "temporal" },
    { name: "weight_kg", type: "quantitative" },
    { name: "water_kg", type: "quantitative" },
  ],
  rows: [
    { person: "A", time: "2026-01", weight_kg: "80", water_kg: "45" },
    { person: "B", time: "2026-01", weight_kg: "72", water_kg: "40" },
    { person: "A", time: "2026-02", weight_kg: "79", water_kg: "44" },
    { person: "B", time: "2026-02", weight_kg: "71", water_kg: "39" },
  ],
});

function state(
  chartType: string,
  assignment: CompatibilityResolutionState["assignment"],
  selectedFieldIds = Array.from(new Set(Object.values(assignment).flatMap((fields) => fields ?? []))),
): CompatibilityResolutionState {
  return { chartType, assignment, selectedFieldIds, dimensionMembers: {}, aggregations: {}, facets: [] };
}

describe("compatibility-constrained resolution planning", () => {
  it("does not repair a selected-data conflict with unselected global dimensions", () => {
    const plan = planCompatibilityResolution(
      state("LineGraph", { x: ["time"], y: ["weight_kg"] }),
      caseCube,
    );

    expect(plan.compatibility.status).toBe("incompatible");
    expect(plan.compatibility.issues.map((issue) => issue.code)).toContain("duplicate-x");
    expect(plan.actions.map((action) => action.id)).not.toContain("aggregate:person:avg");
    expect(plan.actions.map((action) => action.id)).not.toContain("facet:person");
    expect(plan.actions).toContainEqual(expect.objectContaining({
      id: "template:MultiLineChart",
      viable: true,
      terminalStatus: "compatible",
    }));
  });

  it("looks ahead through either required-channel order for Grouped Bar", () => {
    const initial = state("GroupedBarChart", { x: ["time"] }, ["time", "weight_kg", "person"]);
    const plan = planCompatibilityResolution(initial, caseCube, { alternativeLimit: 0 });
    expect(plan.compatibility.status).toBe("incomplete");
    expect(plan.actions).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: "bind:y:weight_kg", viable: true }),
      expect.objectContaining({ id: "bind:color:person", viable: true }),
    ]));

    let valueFirst = createCompatibilityResolutionSession(initial, caseCube, { alternativeLimit: 0 });
    valueFirst = advanceCompatibilityResolutionSession(valueFirst, "bind:y:weight_kg", caseCube, { alternativeLimit: 0 });
    expect(valueFirst.current.compatibility.status).toBe("incomplete");
    valueFirst = advanceCompatibilityResolutionSession(valueFirst, "bind:color:person", caseCube, { alternativeLimit: 0 });
    expect(valueFirst.current.compatibility.status).toBe("compatible");

    let groupFirst = createCompatibilityResolutionSession(initial, caseCube, { alternativeLimit: 0 });
    groupFirst = advanceCompatibilityResolutionSession(groupFirst, "bind:color:person", caseCube, { alternativeLimit: 0 });
    groupFirst = advanceCompatibilityResolutionSession(groupFirst, "bind:y:weight_kg", caseCube, { alternativeLimit: 0 });
    expect(groupFirst.current.compatibility.status).toBe("compatible");
  });

  it("prunes a locally type-valid field whose members make the final chart invalid", () => {
    const cube = cubeResultFromDataset({
      id: "dead-branch",
      name: "dead-branch.csv",
      columns: [
        { name: "category", type: "nominal" },
        { name: "constant_group", type: "nominal" },
        { name: "real_group", type: "nominal" },
        { name: "value", type: "quantitative" },
      ],
      rows: [
        { category: "A", constant_group: "all", real_group: "one", value: "2" },
        { category: "A", constant_group: "all", real_group: "two", value: "3" },
        { category: "B", constant_group: "all", real_group: "one", value: "4" },
        { category: "B", constant_group: "all", real_group: "two", value: "5" },
      ],
    });
    const plan = planCompatibilityResolution(
      state("GroupedBarChart", { x: ["category"], y: ["value"] }, [
        "category",
        "value",
        "constant_group",
        "real_group",
      ]),
      cube,
      { alternativeLimit: 0 },
    );

    expect(plan.actions.map((action) => action.id)).toContain("bind:color:real_group");
    expect(plan.actions.map((action) => action.id)).not.toContain("bind:color:constant_group");
    expect(plan.rejectedActions).toContainEqual(expect.objectContaining({
      id: "bind:color:constant_group",
      viable: false,
      issues: expect.arrayContaining([expect.objectContaining({ code: "insufficient-members" })]),
    }));
  });

  it("restores the exact previous state when the user backs up and changes branch", () => {
    const initial = state("GroupedBarChart", { x: ["time"] }, ["time", "weight_kg", "water_kg", "person"]);
    let session = createCompatibilityResolutionSession(initial, caseCube, { alternativeLimit: 0 });
    session = advanceCompatibilityResolutionSession(session, "bind:y:weight_kg", caseCube, { alternativeLimit: 0 });
    session = advanceCompatibilityResolutionSession(session, "bind:color:person", caseCube, { alternativeLimit: 0 });
    expect(session.current.terminal).toBe(true);

    session = backCompatibilityResolutionSession(session, caseCube, { alternativeLimit: 0 });
    expect(session.current.state.assignment).toEqual({ x: ["time"], y: ["weight_kg"] });
    session = backCompatibilityResolutionSession(session, caseCube, { alternativeLimit: 0 });
    expect(session.current.state).toEqual(initial);
    session = advanceCompatibilityResolutionSession(session, "bind:color:person", caseCube, { alternativeLimit: 0 });
    session = advanceCompatibilityResolutionSession(session, "bind:y:water_kg", caseCube, { alternativeLimit: 0 });
    expect(session.current.compatibility.status).toBe("compatible");
  });

  it("extracts Multi-Line Series as an explicit compatibility channel", () => {
    expect(compatibilityResolutionStateFromChartSpec({
      chartType: "MultiLineChart",
      datasetId: "resolution-case",
      encodings: {
        x: { field: "time", type: "temporal" },
        y: { field: "weight_kg", type: "quantitative" },
      },
      series: { field: "person", type: "nominal" },
      seriesFields: [{ field: "person", type: "nominal" }],
    }).assignment).toEqual({ x: ["time"], y: ["weight_kg"], color: ["person"] });
  });

  it("checks a measure set through derived value and measure-identity channels", () => {
    const cube = cubeResultFromDataset({
      id: "wide-series",
      name: "wide-series.csv",
      columns: [
        { name: "time", type: "temporal" },
        { name: "weight", type: "quantitative" },
        { name: "water", type: "quantitative" },
        { name: "fat", type: "quantitative" },
        { name: "muscle", type: "quantitative" },
      ],
      rows: [
        { time: "2026-01", weight: "80", water: "45", fat: "18", muscle: "32" },
        { time: "2026-02", weight: "79", water: "44", fat: "17", muscle: "33" },
      ],
    });
    const spec = {
      chartType: "StackedAreaChart",
      datasetId: "wide-series",
      encodings: { x: { field: "time", type: "temporal" as const } },
      cubeBinding: {
        version: 1 as const,
        sourceId: "cube:wide-series",
        slots: {
          x: { kind: "dimension" as const, dimensionId: "time" },
          y: { kind: "measure-set" as const, measureIds: ["weight", "water", "fat", "muscle"] },
          series: { kind: "value-series" as const, valueSlot: "y" as const },
        },
      },
    };
    const state = compatibilityResolutionStateFromChartSpec(spec);
    expect(state.assignment).toEqual({
      x: ["time"],
      y: ["__cube_value__"],
      color: ["__cube_measure__"],
    });
    expect(state.derivedValueSeries?.measureIds).toEqual(["weight", "water", "fat", "muscle"]);
    expect(planCompatibilityResolution(state, cube).compatibility.status).toBe("compatible");
  });
});
