import { describe, expect, it } from "vitest";
import { ChartBlockTemplate } from "../chart-blocks/ChartBlockTemplate";
import { evaluateBlockComposition } from "../chart-blocks/composition";
import {
  getChartBlockSpecification,
  getChartBlockSpecifications,
  getChartBlockTemplateByChartType,
} from "../chart-blocks/registry";
import { resolveBlockSurface } from "../chart-blocks/spatial";
import type { BlockFamilyId } from "../chart-blocks/model";
import type { ChartSpec, Dataset } from "../types";
import { chartContracts } from "../utils/chartContracts";
import { geographicLayerTypes } from "../utils/geographicLayerCards";
import { coordinateTreeLeafAxis, coordinateTreeLeafValues } from "../utils/treeLayout";

const chartSpec = (chartType: string, treeDirection: "right" | "left" | "down" | "up" = "right"): ChartSpec => ({
  chartType,
  datasetId: "dataset",
  encodings: {},
  markGroups: [{
    id: "nodes",
    chartId: "chart",
    role: "node",
    memberKeys: [],
    sharedConfig: { treeDirection },
  }],
});

describe("chart block registry", () => {
  it("defines every implemented chart through an inheritable template class", () => {
    [...Object.keys(chartContracts), ...geographicLayerTypes].forEach((chartType) => {
      const template = getChartBlockTemplateByChartType(chartType);
      expect(template).toBeInstanceOf(ChartBlockTemplate);
      expect(template?.specification.chartType).toBe(chartType);
    });
  });

  it("keeps the complete 16-family vocabulary and non-exclusive membership in specifications", () => {
    const expected = new Set<BlockFamilyId>([
      "barchart", "areachart", "point", "linechart", "radar", "heatmap", "arc", "tree",
      "network", "chord", "sankey", "calendar", "boxplot", "geographic-point",
      "geographic-line", "geographic-area",
    ]);
    const actual = new Set(getChartBlockSpecifications().flatMap((specification) => specification.families));
    expect(actual).toEqual(expected);
    expect(getChartBlockSpecification("RadarChart")?.families).toEqual(["areachart", "linechart", "radar"]);
    expect(getChartBlockSpecification("Hexbin")?.families).toEqual(["point", "heatmap"]);
  });

  it("keeps role, structural-target and drop-area references internally valid", () => {
    getChartBlockSpecifications().forEach((specification) => {
      const roleIds = new Set(specification.roles.map((role) => role.id));
      const referenceIds = new Set(specification.spatialReferences.map((reference) => reference.id));
      const targetIds = new Set(specification.structuralTargets.map((target) => target.id));
      specification.spatialReferences.forEach((reference) => {
        reference.roleIds?.forEach((roleId) => expect(roleIds.has(roleId)).toBe(true));
      });
      specification.structuralTargets.forEach((target) => {
        expect(referenceIds.has(target.anchorReferenceId)).toBe(true);
        target.contextRoleIds.forEach((roleId) => expect(roleIds.has(roleId)).toBe(true));
      });
      specification.composition.dropAreas.forEach((area) => {
        area.sharedReferenceIds.forEach((referenceId) => expect(referenceIds.has(referenceId)).toBe(true));
        if (area.geometry.kind === "structural-target") expect(targetIds.has(area.geometry.targetId)).toBe(true);
      });
    });
  });

  it("resolves the Dendrogram leaf axis and only exposes concat along that axis", () => {
    const specification = getChartBlockSpecification("Dendrogram")!;
    const cases = [
      ["right", "y", "right"],
      ["left", "y", "left"],
      ["down", "x", "bottom"],
      ["up", "x", "top"],
    ] as const;
    cases.forEach(([direction, channel, boundary]) => {
      const spec = chartSpec("Dendrogram", direction);
      const surface = resolveBlockSurface(specification, spec);
      const reference = surface.references.find((candidate) => candidate.semantic === "tree-leaf");
      const concatAreas = surface.dropAreas.filter((area) => area.operation === "concat");
      expect(coordinateTreeLeafAxis(spec)).toBe(channel);
      expect(reference?.placement).toMatchObject({ channel, boundary });
      expect(concatAreas).toHaveLength(2);
      expect(concatAreas.every((area) => area.geometry.kind === "outside-edge-band")).toBe(true);
    });
    expect(specification.composition.layer.enabled).toBe(true);
  });

  it("exposes radial tree depth only for the explicit Sunburst hierarchy-depth exception", () => {
    const radial = getChartBlockSpecification("RadialDendrogram")!;
    const sunburst = getChartBlockSpecification("Sunburst")!;
    const pie = getChartBlockSpecification("PieChart")!;
    expect(radial.spatialReferences.find((reference) => reference.semantic === "hierarchy-depth"))
      .toMatchObject({ exposure: "conditional", conditionalPartnerCapability: "hierarchy-depth" });
    expect(evaluateBlockComposition(sunburst, radial, chartSpec("Sunburst"), chartSpec("RadialDendrogram"), "concat", "start"))
      .toMatchObject({ eligible: true, sharedChannels: ["radius"] });
    expect(evaluateBlockComposition(pie, radial, chartSpec("PieChart"), chartSpec("RadialDendrogram"), "concat", "start"))
      .toMatchObject({ eligible: false, reason: "PARTNER_CAPABILITY_MISSING" });
    expect(evaluateBlockComposition(pie, radial, chartSpec("PieChart"), chartSpec("RadialDendrogram"), "concat", "outer"))
      .toMatchObject({ eligible: true, sharedChannels: ["angle"] });
  });

  it("validates a complete instance against the data contract without mutating it", () => {
    const template = getChartBlockTemplateByChartType("LineGraph")!;
    const dataset: Dataset = {
      id: "dataset",
      name: "Rows",
      columns: [{ name: "category", type: "nominal" }, { name: "value", type: "quantitative" }],
      rows: [{ category: "A", value: "1" }, { category: "B", value: "2" }],
    };
    const instance = template.createInstance(dataset.id);
    instance.bindings = {
      x: [{ field: "category", declaredType: "nominal" }],
      y: [{ field: "value", declaredType: "quantitative" }],
    };
    expect(template.validate(instance, dataset)).toEqual({ status: "VALID", issues: [] });
    const invalid = { ...instance, bindings: { ...instance.bindings, y: [{ field: "category", declaredType: "nominal" as const }] } };
    expect(template.validate(invalid, dataset).status).toBe("TYPE_MISMATCH");
  });

  it("orders terminal tree values by the specification's order role and then key", () => {
    const spec = chartSpec("Dendrogram");
    spec.encodings = {
      key: { field: "id", type: "nominal" },
      parent: { field: "parent", type: "nominal" },
      category: { field: "category", type: "nominal" },
    };
    expect(coordinateTreeLeafValues(spec, [
      { id: "root", parent: "", category: "root" },
      { id: "leaf-b", parent: "root", category: "B" },
      { id: "leaf-a2", parent: "root", category: "A" },
      { id: "leaf-a1", parent: "root", category: "A" },
    ])).toEqual(["A", "B"]);
  });
});
