import { describe, expect, it } from "vitest";
import { chartContracts, getChartContract } from "../utils/chartContracts";

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
      if (contract.uniqueness) expect(contract.uniqueness.channels.length).toBeGreaterThan(0);
    });
  });

  it("resolves exact chart types and family fallbacks from one registry", () => {
    expect(getChartContract("LineGraph")?.uniqueness?.channels).toEqual(["x"]);
    expect(getChartContract("line-chart")?.family).toBe("line");
    expect(getChartContract("unknown-chart")).toBeNull();
  });
});
