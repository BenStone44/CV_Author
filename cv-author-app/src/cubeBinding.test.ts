import { describe, expect, it } from "vitest";
import type { Dataset } from "./types";
import {
  beginCubeBindingDrag,
  cubeSelectionForChartFields,
  readCubeBinding,
} from "./cubeBinding";
import { cubeResultFromDataset } from "./cubeModel";

const convertedDataset: Dataset = {
  id: "converted-cube",
  name: "converted-cube.csv",
  columns: [
    { name: "person", type: "nominal" },
    { name: "date", type: "temporal" },
    { name: "component", type: "nominal" },
    { name: "weight", type: "quantitative" },
  ],
  rows: [
    { person: "P1", date: "2026-01-01", component: "water", weight: "38" },
    { person: "P1", date: "2026-01-01", component: "fat", weight: "18" },
  ],
};

describe("Cube selection projection", () => {
  it("maps semantic binding ids back to dynamic Cube fields", () => {
    const cube = cubeResultFromDataset(convertedDataset);
    const projection = cubeSelectionForChartFields(["component", "water", "weight"], cube);

    expect(projection.selected).toMatchObject({
      component: true,
      __measures__: true,
    });
    expect(projection.values.component).toEqual(["water"]);
    expect(projection.values.__measures__).toEqual(["weight"]);
    expect(projection.fields).toMatchObject({ component: "component" });
  });

  it("clears dynamic Cube checks when the chart has no matching ids", () => {
    const projection = cubeSelectionForChartFields(["unknown"], cubeResultFromDataset(convertedDataset));

    expect(Object.values(projection.selected).every((selected) => !selected)).toBe(true);
    expect(Object.values(projection.values).every((values) => values.length === 0)).toBe(true);
  });

  it("serializes a dimension member selection", () => {
    const serialized = beginCubeBindingDrag({
      kind: "dimension",
      dimensionId: "component",
      memberIds: ["water", "fat"],
      aggregation: "avg",
    });
    const transfer = { getData: () => serialized } as unknown as DataTransfer;

    expect(readCubeBinding(transfer)).toEqual({
      kind: "dimension",
      dimensionId: "component",
      memberIds: ["water", "fat"],
      aggregation: "avg",
    });
  });

  it("normalizes the legacy weight payload to a measure set", () => {
    const serialized = beginCubeBindingDrag({
      dimension: "weight",
      values: ["water", "fat"],
    });
    const transfer = { getData: () => serialized } as unknown as DataTransfer;

    expect(readCubeBinding(transfer)).toEqual({
      kind: "measure-set",
      measureIds: ["water", "fat"],
      aggregation: undefined,
    });
  });
});
