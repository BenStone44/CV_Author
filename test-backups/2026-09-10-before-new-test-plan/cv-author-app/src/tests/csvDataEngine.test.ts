import { describe, expect, it } from "vitest";
import {
  analyzeCsvGrain,
  enumerateMinimalHittingSets,
  inferCsvPrimaryKey,
} from "../utils/csvDataEngine";
import type { Dataset } from "../types";

function fiveByFiveDataset(): Dataset {
  const measures = ["weight", "water", "fat", "muscle", "bone"];
  const rows = Array.from({ length: 5 }, (_, personIndex) =>
    Array.from({ length: 5 }, (_, timeIndex) => {
      const bmiBand = ["underweight", "normal", "overweight"][personIndex % 3]!;
      return {
        row_id: `R${personIndex}-${timeIndex}`,
        person: `P${personIndex + 1}`,
        time: `2026-01-${String(timeIndex + 1).padStart(2, "0")}`,
        tag: bmiBand,
        numeric_group: String(personIndex + 1),
        ...Object.fromEntries(measures.map((measure, measureIndex) => [
          measure,
          String(50 + personIndex * 10 + timeIndex + measureIndex),
        ])),
      };
    }),
  ).flat();
  return {
    id: "five-by-five",
    name: "five-by-five.csv",
    columns: [
      { name: "row_id", type: "nominal" },
      { name: "person", type: "nominal" },
      { name: "time", type: "temporal" },
      { name: "tag", type: "nominal" },
      { name: "numeric_group", type: "quantitative" },
      ...measures.map((name) => ({ name, type: "quantitative" as const })),
    ],
    rows,
  };
}

describe("CSV-native grain analysis", () => {
  it("infers an unambiguous unique field without column-name rules", () => {
    const dataset: Dataset = {
      id: "unique-key",
      name: "unique-key.csv",
      columns: [
        { name: "sequence", type: "quantitative" },
        { name: "group", type: "nominal" },
      ],
      rows: [
        { sequence: "101", group: "A" },
        { sequence: "102", group: "A" },
        { sequence: "103", group: "B" },
      ],
    };

    expect(inferCsvPrimaryKey(dataset)).toEqual(["sequence"]);
  });

  it("infers a minimal composite key across arbitrary field types", () => {
    const dataset: Dataset = {
      id: "composite-key",
      name: "composite-key.csv",
      columns: [
        { name: "group", type: "quantitative" },
        { name: "period", type: "nominal" },
        { name: "constant", type: "nominal" },
      ],
      rows: ["1", "2"].flatMap((group) => ["A", "B"].map((period) => ({
        group,
        period,
        constant: "same",
      }))),
    };

    expect(inferCsvPrimaryKey(dataset)).toEqual(["group", "period"]);
  });

  it("does not choose between structurally identical unique fields", () => {
    const dataset: Dataset = {
      id: "ambiguous-key",
      name: "ambiguous-key.csv",
      columns: [
        { name: "left", type: "nominal" },
        { name: "right", type: "quantitative" },
      ],
      rows: [
        { left: "A", right: "1" },
        { left: "B", right: "2" },
        { left: "C", right: "3" },
      ],
    };

    expect(inferCsvPrimaryKey(dataset)).toBeUndefined();
  });

  it("enumerates a complete minimal hitting-set antichain", () => {
    expect(enumerateMinimalHittingSets([
      ["A", "B"],
      ["B", "C"],
      ["A", "C"],
    ], ["A", "B", "C"])).toEqual([
      ["A", "B"],
      ["A", "C"],
      ["B", "C"],
    ]);
  });

  it("keeps every inclusion-minimal repair even when cardinalities differ", () => {
    const dataset: Dataset = {
      id: "different-cardinalities",
      name: "different-cardinalities.csv",
      columns: [
        { name: "key", type: "nominal" },
        { name: "A", type: "nominal" },
        { name: "B", type: "nominal" },
        { name: "C", type: "nominal" },
        { name: "value", type: "quantitative" },
      ],
      rows: [
        { key: "x", A: "0", B: "0", C: "0", value: "0" },
        { key: "x", A: "1", B: "1", C: "0", value: "1" },
        { key: "x", A: "1", B: "0", C: "1", value: "1" },
      ],
    };

    const result = analyzeCsvGrain(dataset, ["key"], ["value"]);

    expect(result.status).toBe("conflict");
    expect(result.conflictPairCount).toBe(2);
    expect(result.distinguishingFieldSets).toEqual([["A", "B"], ["A", "C"]]);
    expect(result.minimalFieldSets).toEqual([["A"], ["B", "C"]]);
    expect(result.candidates.map((candidate) => candidate.fields)).toEqual([["A"], ["B", "C"]]);
  });

  it("treats row identifiers exactly like every other distinguishing field", () => {
    const dataset = fiveByFiveDataset();
    const measures = ["weight", "water", "fat", "muscle", "bone"];
    const result = analyzeCsvGrain(dataset, ["time"], measures);

    expect(result.status).toBe("conflict");
    expect(result.baseline.valueObservationCount).toBe(125);
    expect(result.baseline.maximumMultiplicity).toBe(5);
    expect(result.candidates.map((candidate) => candidate.fields)).toEqual([
      ["numeric_group"],
      ["person"],
      ["row_id"],
    ]);
  });

  it("does not require nominal typing for a useful grouping field", () => {
    const result = analyzeCsvGrain(
      fiveByFiveDataset(),
      ["time"],
      ["weight"],
      { candidateFields: ["numeric_group"] },
    );

    expect(result.candidates[0]).toMatchObject({
      fields: ["numeric_group"],
      exact: true,
    });
  });

  it("ignores duplicate rows whose values do not conflict", () => {
    const dataset: Dataset = {
      id: "same-values",
      name: "same-values.csv",
      columns: [
        { name: "person", type: "nominal" },
        { name: "time", type: "temporal" },
        { name: "value", type: "quantitative" },
      ],
      rows: ["A", "B"].flatMap((person) => ["T1", "T2"].map((time) => ({ person, time, value: "10" }))),
    };
    const result = analyzeCsvGrain(dataset, ["time"], ["value"]);

    expect(result.status).toBe("unique");
    expect(result.baseline.extraObservationCount).toBe(2);
    expect(result.baseline.conflictingValueExcess).toBe(0);
    expect(result.conflictPairCount).toBe(0);
    expect(result.minimalFieldSets).toEqual([[]]);
    expect(result.candidates).toEqual([]);
  });

  it("finds a composite repair when no single field resolves every conflict", () => {
    const dataset: Dataset = {
      id: "composite",
      name: "composite.csv",
      columns: [
        { name: "key", type: "nominal" },
        { name: "left", type: "nominal" },
        { name: "right", type: "nominal" },
        { name: "value", type: "quantitative" },
      ],
      rows: [
        { key: "x", left: "0", right: "0", value: "0" },
        { key: "x", left: "0", right: "1", value: "1" },
        { key: "x", left: "1", right: "0", value: "1" },
        { key: "x", left: "1", right: "1", value: "0" },
      ],
    };
    const result = analyzeCsvGrain(dataset, ["key"], ["value"], { maxCombinationSize: 1 });

    expect(result.candidates).toEqual([expect.objectContaining({ fields: ["left", "right"], exact: true })]);
  });

  it("keeps structurally equivalent identity and classification fields ambiguous", () => {
    const dataset: Dataset = {
      id: "ambiguous-categories",
      name: "ambiguous-categories.csv",
      columns: [
        { name: "entity", type: "nominal" },
        { name: "band", type: "nominal" },
        { name: "time", type: "temporal" },
        { name: "value", type: "quantitative" },
      ],
      rows: ["A", "B", "C"].flatMap((entity, entityIndex) =>
        ["T1", "T2"].map((time, timeIndex) => ({
          entity,
          band: ["low", "medium", "high"][entityIndex]!,
          time,
          value: String(entityIndex + timeIndex),
        })),
      ),
    };

    const result = analyzeCsvGrain(dataset, ["time"], ["value"]);

    expect(result.ambiguous).toBe(true);
    expect(result.topCandidateFields).toEqual([["band"], ["entity"]]);
  });

  it("finds a repeated grain field among 125 candidate columns", () => {
    const rows = Array.from({ length: 5 }, (_, entityIndex) =>
      Array.from({ length: 5 }, (_, timeIndex) => ({
        entity: `E${entityIndex}`,
        time: `T${timeIndex}`,
        value: String(entityIndex * 10 + timeIndex),
        ...Object.fromEntries(Array.from({ length: 124 }, (__, fieldIndex) => [
          `attribute_${fieldIndex}`,
          String((entityIndex + fieldIndex) % 2),
        ])),
      })),
    ).flat();
    const dataset: Dataset = {
      id: "many-columns",
      name: "many-columns.csv",
      columns: [
        { name: "entity", type: "nominal" },
        { name: "time", type: "temporal" },
        { name: "value", type: "quantitative" },
        ...Array.from({ length: 124 }, (_, index) => ({
          name: `attribute_${index}`,
          type: "nominal" as const,
        })),
      ],
      rows,
    };

    const result = analyzeCsvGrain(dataset, ["time"], ["value"], { candidateLimit: 125 });

    expect(result.candidates).toEqual([expect.objectContaining({ fields: ["entity"], exact: true })]);
  });

  it("returns no solution when a conflict pair is identical on every candidate field", () => {
    const dataset: Dataset = {
      id: "unresolvable",
      name: "unresolvable.csv",
      columns: [
        { name: "key", type: "nominal" },
        { name: "A", type: "nominal" },
        { name: "B", type: "nominal" },
        { name: "value", type: "quantitative" },
      ],
      rows: [
        { key: "x", A: "1", B: "2", value: "10" },
        { key: "x", A: "1", B: "2", value: "20" },
      ],
    };

    const result = analyzeCsvGrain(dataset, ["key"], ["value"]);

    expect(result.status).toBe("unresolvable");
    expect(result.distinguishingFieldSets).toEqual([[]]);
    expect(result.candidates).toEqual([]);
  });

  it("returns insufficient data instead of guessing around missing bindings", () => {
    const result = analyzeCsvGrain(fiveByFiveDataset(), ["unknown"], ["weight"]);

    expect(result.status).toBe("insufficient-data");
    expect(result.candidates).toEqual([]);
    expect(result.warnings[0]).toContain("unknown");
  });
});
