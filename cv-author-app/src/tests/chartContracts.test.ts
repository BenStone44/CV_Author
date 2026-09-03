import { describe, expect, it } from "vitest";
import {
  chartContracts,
  getChartContract,
  groupedScalarDimensionFields,
  resolveChartDataMode,
} from "../utils/chartContracts";

describe("chart contracts", () => {
  it("defines analytical capacity and aggregation for every implemented chart", () => {
    Object.values(chartContracts).forEach((contract) => {
      expect(contract.requiredChannels).toEqual(
        contract.channels.filter((channel) => channel.required).map((channel) => channel.channel),
      );
      expect(contract.dimensions.min).toBeLessThanOrEqual(contract.dimensions.max);
      expect(contract.measures.min).toBeLessThanOrEqual(contract.measures.max);
      expect(contract.roles.length).toBeGreaterThan(0);
      expect(typeof contract.aggregation.allowed).toBe("boolean");
      expect(contract.uniqueness).toBeUndefined();
    });
  });

  it("resolves exact chart types and family fallbacks from one registry", () => {
    expect(getChartContract("LineGraph")?.dataMode).toBe("grouped-scalar");
    expect(getChartContract("line-chart")?.family).toBe("line");
    expect(getChartContract("unknown-chart")).toBeNull();
  });

  it("resolves the scatter grain from bound field types", () => {
    const grouped = {
      chartType: "Scatterplot",
      datasetId: "dataset",
      encodings: {
        x: { field: "row", type: "nominal" as const },
        y: { field: "column", type: "ordinal" as const },
      },
    };
    const records = {
      ...grouped,
      encodings: { ...grouped.encodings, y: { field: "value", type: "quantitative" as const } },
    };

    expect(resolveChartDataMode(grouped)).toBe("grouped-scalar");
    expect(groupedScalarDimensionFields(grouped)).toEqual(["row", "column"]);
    expect(resolveChartDataMode(records)).toBe("record");
    expect(groupedScalarDimensionFields(records)).toEqual([]);
  });
});
