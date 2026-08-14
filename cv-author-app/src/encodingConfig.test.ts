import { describe, expect, it } from "vitest";
import { getEncodingChannelConfigs, isEncodingColumnCompatible } from "./encodingConfig";

const channels = (chartType: string) => getEncodingChannelConfigs(chartType).map((config) => config.channel);

describe("card encoding configuration", () => {
  it.each([
    ["LineGraph", ["x", "y", "color", "size", "shape"]],
    ["Scatterplot", ["x", "y", "color", "size", "shape"]],
    ["SingleBarChart", ["x", "y", "color", "size"]],
    ["GroupedBarChart", ["x", "y", "color", "size"]],
    ["StackedBarChart", ["x", "y", "color", "size"]],
    ["DivergentBarChart", ["x", "y", "color", "size"]],
    ["DivergentStackedBarChart", ["x", "y", "color", "size"]],
    ["PieChart", ["angle", "color", "radius"]],
    ["DonutChart", ["angle", "color", "ring", "radius"]],
    ["MatrixDiagram", ["row", "column", "value", "color"]],
  ])("builds the %s card from its channel contract", (chartType, expected) => {
    expect(channels(chartType as string)).toEqual(expected);
  });

  it("uses variant-specific labels while preserving the shared Bar contract", () => {
    const grouped = getEncodingChannelConfigs("GroupedBarChart");
    const stacked = getEncodingChannelConfigs("StackedBarChart");
    expect(grouped.find((config) => config.channel === "color")?.label).toBe("Group");
    expect(stacked.find((config) => config.channel === "color")?.label).toBe("Segment");
    expect(grouped.find((config) => config.channel === "y")?.required).toBe(true);
  });

  it("derives type compatibility from the channel contract", () => {
    const barY = getEncodingChannelConfigs("SingleBarChart").find((config) => config.channel === "y")!;
    expect(isEncodingColumnCompatible(barY, "quantitative")).toBe(true);
    expect(isEncodingColumnCompatible(barY, "nominal")).toBe(false);
  });
});
