import { describe, expect, it } from "vitest";
import {
  beginCubeBindingDrag,
  cubeSelectionForChartFields,
  readCubeBinding,
} from "./cubeBinding";

describe("Cube selection projection", () => {
  it("maps the selected chart fields back to Cube checks", () => {
    expect(cubeSelectionForChartFields([
      "person",
      "time",
      "water_kg",
      "fat_kg",
    ])).toEqual({
      person: true,
      date: true,
      weight: ["water_kg", "fat_kg"],
    });
  });

  it("clears Cube checks when the chart has no matching fields", () => {
    expect(cubeSelectionForChartFields(["category", "value"])).toEqual({
      person: false,
      date: false,
      weight: [],
    });
  });

  it("preserves the aggregation selected for an unselected Cube column", () => {
    const serialized = beginCubeBindingDrag({
      dimension: "date",
      values: ["2025-01-01", "2025-02-01"],
      aggregation: "avg",
    });
    const transfer = {
      getData: () => serialized,
    } as unknown as DataTransfer;

    expect(readCubeBinding(transfer)).toEqual({
      dimension: "date",
      values: ["2025-01-01", "2025-02-01"],
      aggregation: "avg",
    });
  });
});
