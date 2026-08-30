import { describe, expect, it } from "vitest";
import {
  CanvasCoordinateSystemLayer,
  CartesianCoordinateSystem,
  createCartesianAxisModel,
  getCartesianAxisChannels,
} from "../components/CartesianCoordinateSystem";
import { PolarCoordinateSystem } from "../components/PolarCoordinateSystem";
import type { CanvasLeafNode, CompositionSpec, CoordinateSystemSpec } from "../types";

function chartNode(overrides: Partial<CanvasLeafNode> = {}): CanvasLeafNode {
  return {
    kind: "leaf",
    id: "chart",
    candidateId: "builtin-template:line",
    name: "Chart",
    content: "",
    renderedContent: '<g data-mark-role="line"/>',
    viewBox: "120 45 800 400",
    contentMinX: 120,
    contentMinY: 45,
    width: 800,
    height: 400,
    x: 300,
    y: 200,
    scaleX: 1,
    scaleY: 1,
    rotation: 0,
    coordinateGuide: {
      type: "Cartesian",
      origin: { x: 192, y: 389 },
      xDirection: 1,
      yDirection: -1,
    },
    chartSpec: {
      chartType: "LineGraph",
      datasetId: "measurements",
      encodings: {
        x: { field: "observed_at", type: "temporal" },
        y: { field: "weight_kg", type: "quantitative" },
      },
      plotArea: { x: 192, y: 73, width: 700, height: 316 },
      scales: {
        x: {
          type: "utc",
          domain: ["2026-01-01T00:00:00.000Z", "2026-06-01T00:00:00.000Z"],
          range: [192, 892],
        },
        y: { type: "linear", domain: [40, 100], range: [389, 73] },
      },
      styleTokens: {
        palette: ["#2563eb"],
        axisColor: "#586474",
        textColor: "#263241",
        fontFamily: "Inter, sans-serif",
        fontSize: 12,
        lineWidth: 2,
      },
    },
    ...overrides,
  };
}

describe("independent Cartesian axis component", () => {
  it("derives axis geometry and all text styling from the chart plot area", () => {
    const node = chartNode();
    const model = createCartesianAxisModel(node)!;

    expect(model).toMatchObject({
      left: 192,
      top: 73,
      right: 892,
      bottom: 389,
      origin: { x: 192, y: 389 },
      xEnd: { x: 892, y: 389 },
      yEnd: { x: 192, y: 73 },
      xTitle: "",
      yTitle: "",
      fontFamily: "Inter, sans-serif",
      fontSize: 9,
      axisColor: "#586474",
      textColor: "#263241",
    });
    expect(model.xTicks.every((tick) => tick.position >= model.left && tick.position <= model.right)).toBe(true);
    expect(model.yTicks.every((tick) => tick.position >= model.top && tick.position <= model.bottom)).toBe(true);
    expect(model.xTicks.some((tick) => /^2026-0[1-6]$/.test(tick.label))).toBe(true);
    expect(model.yTicks.every((tick) => Number.isFinite(Number(tick.label.replaceAll(",", ""))))).toBe(true);

    const render = (CartesianCoordinateSystem as any).setup({
      node,
      viewZoom: 1,
      channels: ["x", "y"],
      showAxis: true,
      interactive: false,
      applyTransform: false,
    });
    const axisGroup = render();
    expect(axisGroup.props["font-family"]).toBe(model.fontFamily);
    expect(axisGroup.props["font-size"]).toBe(model.fontSize);
    expect(axisGroup.props.fill).toBe(model.textColor);
    expect(axisGroup.children.filter((child: any) => child.type === "text")).not.toHaveLength(0);

    const scaledModel = createCartesianAxisModel(chartNode({ scaleX: 2, scaleY: 2 }))!;
    expect(scaledModel.fontSize).toBe(4.5);

    const stretchedNode = chartNode({ scaleX: 2, scaleY: 1 });
    const stretchedRender = (CartesianCoordinateSystem as any).setup({
      node: stretchedNode,
      viewZoom: 1,
      channels: ["x", "y"],
      showAxis: true,
      interactive: false,
      applyTransform: false,
    });
    const stretchedLabels = stretchedRender().children.filter(
      (child: any) => child.props?.class === "cartesian-axis-tick-label",
    );
    expect(stretchedLabels.length).toBeGreaterThan(0);
    expect(stretchedLabels.every((label: any) => label.props.transform.includes("scale(1 2)"))).toBe(true);
  });

  it("uses the same model for categorical axes without renderer-owned labels", () => {
    const node = chartNode({
      chartSpec: {
        chartType: "Scatterplot",
        datasetId: "stages",
        encodings: {
          x: { field: "stage", type: "nominal" },
          y: { field: "band", type: "nominal" },
        },
        plotArea: { x: 192, y: 73, width: 700, height: 316 },
        scales: {
          x: { type: "point", domain: ["Plan", "Build", "Ship"], range: [192, 892] },
          y: { type: "point", domain: ["Low", "Medium", "High"], range: [389, 73] },
        },
      },
    });
    const model = createCartesianAxisModel(node)!;

    expect(model.xTicks.map((tick) => tick.label)).toEqual(["Plan", "Build", "Ship"]);
    expect(model.yTicks.map((tick) => tick.label)).toEqual(["Low", "Medium", "High"]);
    expect(node.renderedContent).not.toContain("<text");
  });

  it.each([
    ["right", "y", { x: 892, y: 389 }],
    ["left", "y", { x: 192, y: 389 }],
    ["down", "x", { x: 192, y: 389 }],
    ["up", "x", { x: 192, y: 73 }],
  ] as const)("exposes only the %s tree's %s leaf axis", (direction, leafAxis, origin) => {
    const node = chartNode({
      chartSpec: {
        ...chartNode().chartSpec!,
        chartType: "Dendrogram",
        encodings: {
          key: { field: "id", type: "nominal" },
          parent: { field: "parent", type: "nominal" },
          category: { field: "leaf", type: "nominal" },
        },
        markGroups: [{
          id: "tree-nodes",
          chartId: "chart",
          role: "node",
          memberKeys: [],
          sharedConfig: { treeDirection: direction },
        }],
      },
    });

    expect(getCartesianAxisChannels(node, "static")).toEqual([leafAxis]);
    expect(getCartesianAxisChannels(node, "interactive")).toEqual([leafAxis]);
    expect(createCartesianAxisModel(node)?.origin).toEqual(origin);
  });

  it("renders directly from ChartSpec axis checkbox values", () => {
    const node = chartNode({
      chartSpec: {
        ...chartNode().chartSpec!,
        axes: {
          x: { visible: false, labelsVisible: false },
        },
      },
    });
    const render = () => (CartesianCoordinateSystem as any).setup({
      node,
      viewZoom: 1,
      channels: ["x"],
      showAxis: true,
      interactive: false,
      applyTransform: false,
    })();

    expect(render().children).toHaveLength(0);
    node.chartSpec = {
      ...node.chartSpec!,
      axes: {
        ...node.chartSpec!.axes,
        x: {
          ...node.chartSpec!.axes?.x,
          visible: true,
          labelsVisible: true,
        },
      },
    };
    const visibleAxis = render();
    expect(visibleAxis.children.some((child: any) => child.props?.class === "cartesian-axis-domain")).toBe(true);
    expect(visibleAxis.children.some((child: any) => child.props?.class === "cartesian-axis-tick-label")).toBe(true);
  });

  it("uses the shared Cartesian component for Matrix axes", () => {
    const node = chartNode({
      candidateId: "builtin-template:matrix",
      chartSpec: {
        chartType: "MatrixDiagram",
        datasetId: "matrix-data",
        encodings: {
          x: { field: "month", type: "nominal" },
          y: { field: "region", type: "nominal" },
          column: { field: "month", type: "nominal" },
          row: { field: "region", type: "nominal" },
        },
        plotArea: { x: 192, y: 73, width: 700, height: 316 },
        scales: {
          x: { type: "point", domain: ["Jan", "Feb"], range: [192, 892] },
          y: { type: "point", domain: ["North", "South"], range: [389, 73] },
        },
      },
    });

    const model = createCartesianAxisModel(node)!;
    expect(model.xTicks.map((tick) => tick.label)).toEqual(["Jan", "Feb"]);
    expect(model.yTicks.map((tick) => tick.label)).toEqual(["North", "South"]);
    expect(model.xTitle).toBe("");
    expect(model.yTitle).toBe("");
  });

  it("uses the shared Cartesian component for Bar axes", () => {
    const node = chartNode({
      candidateId: "builtin-template:grouped-bar",
      chartSpec: {
        chartType: "GroupedBarChart",
        datasetId: "bar-data",
        encodings: {
          x: { field: "quarter", type: "nominal" },
          y: { field: "revenue", type: "quantitative" },
          color: { field: "region", type: "nominal" },
        },
        plotArea: { x: 192, y: 73, width: 700, height: 316 },
        scales: {
          x: { type: "point", domain: ["Q1", "Q2", "Q3"], range: [192, 892] },
          y: { type: "linear", domain: [0, 120], range: [389, 73] },
        },
      },
    });

    const model = createCartesianAxisModel(node)!;
    expect(model.xTicks.map((tick) => tick.label)).toEqual(["Q1", "Q2", "Q3"]);
    expect(model.yTicks.length).toBeGreaterThan(0);
    expect(model.xTitle).toBe("");
    expect(model.yTitle).toBe("");
  });

  it("renders an independent static coordinate axis for every facet cell", () => {
    const first = chartNode({ id: "facet-a", name: "Facet A" });
    const second = chartNode({ id: "facet-b", name: "Facet B", x: 1104 });
    const compositionSpec: CompositionSpec = {
      id: "composition:facet",
      type: "facet",
      sharedChannels: [],
      facetField: "region",
      facetValues: ["North", "South"],
      members: [first, second].map((node) => ({
        nodeId: node.id,
        sourceNodeId: first.id,
        sharedChannels: [],
      })),
    };
    [first, second].forEach((node) => {
      node.compositionSpec = compositionSpec;
      node.coordinateSystem = {
        id: `coordinate:${node.id}`,
        type: "Cartesian",
        ownerNodeId: node.id,
        members: [{ nodeId: node.id, channels: ["x", "y"] }],
        sharedChannels: [],
      };
    });

    [first, second].forEach((node) => {
      expect(getCartesianAxisChannels(node, "static")).toEqual(["x", "y"]);
      const layer = (CanvasCoordinateSystemLayer as any).setup({ node })();
      expect(layer.children).toHaveLength(1);
      expect(layer.children[0].type).toBe(CartesianCoordinateSystem);
    });
  });

  it("renders one static axis component and no Layer axis configuration controls", () => {
    const owner = chartNode();
    const member = chartNode({ id: "points", name: "Points" });
    const coordinateSystem: CoordinateSystemSpec = {
      id: "coordinate:layer",
      type: "Cartesian",
      ownerNodeId: owner.id,
      members: [
        { nodeId: owner.id, channels: ["x", "y"] },
        { nodeId: member.id, channels: ["x", "y"] },
      ],
      sharedChannels: ["x", "y"],
    };
    const compositionSpec: CompositionSpec = {
      id: "composition:layer",
      type: "layer",
      sharedChannels: ["x", "y"],
      members: [owner, member].map((node) => ({
        nodeId: node.id,
        sourceNodeId: node.id,
        sharedChannels: ["x", "y"],
      })),
    };
    owner.coordinateSystem = coordinateSystem;
    member.coordinateSystem = coordinateSystem;
    owner.compositionSpec = compositionSpec;
    member.compositionSpec = compositionSpec;

    expect(createCartesianAxisModel(owner)).toMatchObject({ xTitle: "", yTitle: "" });
    expect(getCartesianAxisChannels(owner, "static")).toEqual(["x", "y"]);
    expect(getCartesianAxisChannels(member, "static")).toEqual([]);
    expect(getCartesianAxisChannels(owner, "interactive")).toEqual([]);
    expect(getCartesianAxisChannels(member, "interactive")).toEqual([]);

    const ownerLayer = (CanvasCoordinateSystemLayer as any).setup({ node: owner })();
    const memberLayer = (CanvasCoordinateSystemLayer as any).setup({ node: member })();
    expect(ownerLayer.children).toHaveLength(1);
    expect(ownerLayer.children[0].type).toBe(CartesianCoordinateSystem);
    expect(memberLayer).toBeNull();

    const editingMemberLayer = (CanvasCoordinateSystemLayer as any).setup({
      node: member,
      draggingNodeId: null,
      editingCompositionId: compositionSpec.id,
      hiddenNodeIds: new Set<string>(),
      allowHiddenNodeId: null,
    })();
    expect(editingMemberLayer.children).toHaveLength(1);
    expect(editingMemberLayer.children[0].type).toBe(CartesianCoordinateSystem);
  });

  it("keeps enabled Polar axes in the static layer after deselection", () => {
    const node = chartNode({
      coordinateGuide: {
        type: "Polar",
        origin: { x: 520, y: 245 },
        showThetaLine: true,
        showRadiusLine: true,
      },
      chartSpec: {
        chartType: "PieChart",
        datasetId: "measurements",
        encodings: { theta: { field: "value", type: "quantitative" } },
      },
    });
    const layer = (CanvasCoordinateSystemLayer as any).setup({ node })();

    expect(layer.children).toHaveLength(1);
    expect(layer.children[0].type).toBe(PolarCoordinateSystem);
    expect(layer.children[0].props).toMatchObject({
      showAxis: true,
      interactive: false,
      applyTransform: false,
    });

    if (node.coordinateGuide?.type !== "Polar") throw new Error("Expected a Polar guide.");
    node.coordinateGuide = {
      ...node.coordinateGuide,
      showThetaLine: false,
      showRadiusLine: false,
    };
    expect((CanvasCoordinateSystemLayer as any).setup({ node })()).toBeNull();
  });
});
