import { describe, expect, it, vi } from "vitest";
import {
  createPolarCoordinateSystemModel,
  polarAngleSpanFromPoint,
  PolarCoordinateSystem,
} from "../components/PolarCoordinateSystem";
import { CanvasNodeView } from "../components/CanvasNodeView";
import type { CanvasLeafNode } from "../types";
import { getPolarOccupiedGeometry } from "../utils/canvasUtils";

function polarNode(overrides: Partial<CanvasLeafNode> = {}): CanvasLeafNode {
  return {
    kind: "leaf",
    id: "pie",
    candidateId: "builtin-template:pie",
    name: "Pie Chart",
    content: "",
    viewBox: "10 20 200 160",
    contentMinX: 10,
    contentMinY: 20,
    width: 200,
    height: 160,
    x: 300,
    y: 200,
    scaleX: 2,
    scaleY: 2,
    rotation: 0,
    coordinateGuide: {
      type: "Polar",
      origin: { x: 110, y: 100 },
      radiusScale: 1.5,
      ringScale: 1,
    },
    ...overrides,
  };
}

describe("independent Polar coordinate system component", () => {
  it("derives its geometry from the node bounds and guide", () => {
    const model = createPolarCoordinateSystemModel(polarNode(), 0.5)!;

    expect(model).toMatchObject({
      origin: { x: 110, y: 100 },
      radius: 166,
      angleSpan: 360,
      upperAngle: 0,
      radiusEnd: { x: 276, y: 100 },
      upperRadiusEnd: { x: 276, y: 100 },
      lowerControlArcPath: `M 276 100 A 166 166 0 0 1 ${110 + Math.cos(Math.PI / 12) * 166} ${100 + Math.sin(Math.PI / 12) * 166}`,
      renderedScale: 1,
    });
    const upperArcValues = model.upperControlArcPath.match(/-?\d+(?:\.\d+)?/g)?.map(Number) ?? [];
    expect(upperArcValues).toHaveLength(9);
    expect(upperArcValues[0]).toBeCloseTo(110 + Math.cos(Math.PI / 12) * 166);
    expect(upperArcValues[1]).toBeCloseTo(100 - Math.sin(Math.PI / 12) * 166);
    expect(upperArcValues.at(-2)).toBe(276);
    expect(upperArcValues.at(-1)).toBe(100);
  });

  it("fits the coordinate guide to the rendered outer ring", () => {
    const node = polarNode({
      renderedContent: '<path data-mark-role="arc"/>',
      chartSpec: {
        chartType: "PieChart",
        datasetId: "measurements",
        encodings: { theta: { field: "value", type: "quantitative" } },
        plotArea: { x: 30, y: 20, width: 160, height: 160 },
        polarArea: { startAngle: 0, angleSpan: 360, innerRadius: 0, outerRadius: 80 },
      },
    });

    expect(createPolarCoordinateSystemModel(node, 0.5)?.radius).toBe(88);
  });

  it("fits a radial member's coordinate guide to its selection ring", () => {
    const node = polarNode({
      id: "inner-ring",
      renderedContent: '<path data-mark-role="arc"/>',
      coordinateGuide: {
        type: "Polar",
        origin: { x: 110, y: 100 },
        innerRadiusRatio: 0,
        outerRadiusRatio: 0.5,
      },
      compositionSpec: {
        id: "composition:radial",
        type: "concat",
        direction: "radial",
        members: [
          { nodeId: "inner-ring", sourceNodeId: "inner-ring", sharedChannels: ["angle"] },
          { nodeId: "outer-ring", sourceNodeId: "outer-ring", sharedChannels: ["angle"] },
        ],
        sharedChannels: ["angle"],
      },
      chartSpec: {
        chartType: "PieChart",
        datasetId: "measurements",
        encodings: { theta: { field: "value", type: "quantitative" } },
        plotArea: { x: 30, y: 20, width: 160, height: 160 },
        polarArea: { startAngle: 0, angleSpan: 360, innerRadius: 0, outerRadius: 40 },
      },
    });

    expect(createPolarCoordinateSystemModel(node, 0.5)?.radius).toBe(48);
  });

  it("renders overlapping boundary rays with separate 15-degree control arcs", () => {
    const node = polarNode();
    const render = (PolarCoordinateSystem as any).setup({
      node,
      viewZoom: 0.5,
      applyTransform: false,
    });
    const coordinateSystem = render();
    const classes = (child: any) => Array.isArray(child.props.class)
      ? child.props.class
      : String(child.props.class ?? "").split(" ");

    expect(coordinateSystem.props.class).toContain("polar-coordinate-system");
    expect(coordinateSystem.props.transform).toBeUndefined();
    expect(coordinateSystem.children).toHaveLength(7);

    const radiusAxes = coordinateSystem.children.filter((child: any) =>
      classes(child).includes("polar-coordinate-radius-axis"),
    );
    expect(radiusAxes).toHaveLength(2);
    expect(radiusAxes[0].props).toMatchObject({
      x1: 110,
      y1: 100,
      x2: 276,
      y2: 100,
    });
    expect(radiusAxes[1].props).toMatchObject({
      x1: radiusAxes[0].props.x1,
      y1: radiusAxes[0].props.y1,
      x2: radiusAxes[0].props.x2,
      y2: radiusAxes[0].props.y2,
    });

    const angleAxes = coordinateSystem.children.filter((child: any) =>
      classes(child).includes("polar-coordinate-angle-axis"),
    );
    expect(angleAxes).toHaveLength(2);
    expect(angleAxes.every((axis: any) => axis.type === "path")).toBe(true);

    const labels = coordinateSystem.children.filter((child: any) => child.type === "text");
    expect(labels).toHaveLength(0);

    const control = coordinateSystem.children.find((child: any) =>
      classes(child).includes("polar-coordinate-angle-control"),
    );
    expect(control.props["aria-valuenow"]).toBe(360);
    expect(control.props.transform).toBe("translate(276 100) scale(1)");
  });

  it("subtracts an upper counter-clockwise rotation from the 360-degree range", () => {
    const origin = { x: 100, y: 100 };
    expect(polarAngleSpanFromPoint(origin, { x: 200, y: 100 })).toBe(360);
    expect(polarAngleSpanFromPoint(origin, { x: 100, y: 0 })).toBe(270);
    expect(polarAngleSpanFromPoint(origin, { x: 0, y: 100 })).toBe(180);

    const node = polarNode({
      coordinateGuide: {
        type: "Polar",
        origin,
        radiusScale: 1,
        angleSpan: 300,
      },
    });
    const model = createPolarCoordinateSystemModel(node)!;
    expect(model.upperAngle).toBe(60);
    expect(model.radius).toBe(120);
    expect(model.upperRadiusEnd.x).toBeCloseTo(160);
    expect(model.upperRadiusEnd.y).toBeCloseTo(100 - Math.sqrt(3) * 60);
  });

  it("starts angle rotation from the upper ray and isolates the pointer event", () => {
    const node = polarNode();
    const onAnglePointerDown = vi.fn();
    const render = (PolarCoordinateSystem as any).setup({
      node,
      viewZoom: 1,
      applyTransform: false,
      onAnglePointerDown,
    });
    const coordinateSystem = render();
    const control = coordinateSystem.children.find((child: any) =>
      String(child.props.class ?? "").includes("polar-coordinate-angle-control"),
    );
    const event = {
      preventDefault: vi.fn(),
      stopPropagation: vi.fn(),
    } as unknown as PointerEvent;

    control.props.onPointerdown(event);

    expect(event.preventDefault).toHaveBeenCalledOnce();
    expect(event.stopPropagation).toHaveBeenCalledOnce();
    expect(onAnglePointerDown).toHaveBeenCalledWith(node, event);
  });

  it("uses the persisted chart radius when positioning polar controls", () => {
    const node = polarNode({
      coordinateGuide: {
        type: "Polar",
        origin: { x: 110, y: 100 },
        radius: 64,
      },
    });

    expect(createPolarCoordinateSystemModel(node)?.radius).toBe(68);
  });

  it("does not render for a non-Polar guide", () => {
    const node = polarNode({
      coordinateGuide: {
        type: "Cartesian",
        origin: { x: 10, y: 20 },
        xDirection: 1,
        yDirection: -1,
      },
    });
    const render = (PolarCoordinateSystem as any).setup({
      node,
      viewZoom: 1,
      applyTransform: true,
    });

    expect(render()).toBeNull();
  });

  it("uses the occupied angular and radial ranges for the polar hit target", () => {
    const node = polarNode({
      renderedContent: '<path data-mark-role="arc"/>',
      coordinateGuide: {
        type: "Polar",
        origin: { x: 110, y: 100 },
        angleOffset: 90,
        angleSpan: 90,
        innerRadiusRatio: 0.5,
        outerRadiusRatio: 1,
      },
      chartSpec: {
        chartType: "PieChart",
        datasetId: "measurements",
        encodings: { theta: { field: "value", type: "quantitative" } },
        plotArea: { x: 30, y: 20, width: 160, height: 160 },
        polarArea: { startAngle: 90, angleSpan: 90, innerRadius: 40, outerRadius: 80 },
      },
    });

    const geometry = getPolarOccupiedGeometry(node)!;
    expect(geometry).toMatchObject({
      startAngle: 90,
      endAngle: 180,
      innerRadius: 40,
      outerRadius: 80,
    });
    expect(geometry.bounds.minX).toBe(30);
    expect(geometry.bounds.minY).toBeCloseTo(100);
    expect(geometry.bounds.maxX).toBeCloseTo(110);
    expect(geometry.bounds.maxY).toBe(180);
  });

  it("renders a sector or annulus path instead of a frame-sized polar hit rectangle", () => {
    const node = polarNode({
      renderedContent: '<path data-mark-role="arc"/>',
      coordinateGuide: {
        type: "Polar",
        origin: { x: 110, y: 100 },
        angleOffset: 0,
        angleSpan: 120,
        innerRadiusRatio: 0.5,
        outerRadiusRatio: 1,
      },
      chartSpec: {
        chartType: "PieChart",
        datasetId: "measurements",
        encodings: { theta: { field: "value", type: "quantitative" } },
        plotArea: { x: 30, y: 20, width: 160, height: 160 },
        polarArea: { startAngle: 0, angleSpan: 120, innerRadius: 40, outerRadius: 80 },
      },
    });
    const render = (CanvasNodeView as any).setup({
      node,
      interactive: true,
      selected: false,
      editingGroupPath: [],
      editingChartId: null,
      draggingNodeId: null,
      selectedIds: [],
      nestedPlacements: [],
      nestedRenderedChildIds: new Set<string>(),
      onNodePointerDown: vi.fn(),
      onNodeDoubleClick: null,
      onNodeContextMenu: null,
      onMarkPointerDown: null,
      onEditingBackgroundPointerDown: null,
    });

    const hitTarget = render().children[0];
    expect(hitTarget.type).toBe("path");
    expect(hitTarget.props.d).toContain(" A 80 80 ");
    expect(hitTarget.props.d).toContain(" A 40 40 ");
    expect(hitTarget.props["fill-rule"]).toBe("evenodd");
    expect(hitTarget.props["data-hit-target-shape"]).toBe("polar");
  });

  it("uses the Polar chart contract when a migrated node has no coordinate guide", () => {
    const node = polarNode({
      renderedContent: '<path data-mark-role="arc"/>',
      coordinateGuide: null,
      chartSpec: {
        chartType: "DonutChart",
        datasetId: "measurements",
        encodings: { theta: { field: "value", type: "quantitative" } },
        plotArea: { x: 84, y: 24, width: 152, height: 152 },
        polarArea: { startAngle: 0, angleSpan: 360, innerRadius: 38, outerRadius: 76 },
      },
    });
    const render = (CanvasNodeView as any).setup({
      node,
      interactive: true,
      selected: false,
      editingGroupPath: [],
      editingChartId: null,
      draggingNodeId: null,
      selectedIds: [],
      nestedPlacements: [],
      nestedRenderedChildIds: new Set<string>(),
      onNodePointerDown: vi.fn(),
      onNodeDoubleClick: null,
      onNodeContextMenu: null,
      onMarkPointerDown: null,
      onEditingBackgroundPointerDown: null,
    });

    const hitTarget = render().children[0];
    expect(hitTarget.type).toBe("path");
    expect(hitTarget.props.d).toContain(" A 76 76 ");
    expect(hitTarget.props.d).toContain(" A 38 38 ");
    expect(hitTarget.props["data-hit-target-shape"]).toBe("polar");
  });

  it("recovers an annular hit target from a migrated radial concat", () => {
    const node = polarNode({
      id: "outer-ring",
      renderedContent: '<path data-mark-role="arc"/>',
      coordinateGuide: null,
      coordinateSystem: {
        id: "coordinate:radial",
        type: "Polar",
        ownerNodeId: "inner-ring",
        members: [
          { nodeId: "inner-ring", channels: ["angle", "radius"] },
          { nodeId: "outer-ring", channels: ["angle", "radius"] },
        ],
        sharedChannels: ["angle"],
      },
      compositionSpec: {
        id: "composition:radial",
        type: "concat",
        direction: "radial",
        polarAngleSpan: 120,
        members: [
          { nodeId: "inner-ring", sourceNodeId: "inner-ring", sharedChannels: ["angle"] },
          { nodeId: "outer-ring", sourceNodeId: "outer-ring", sharedChannels: ["angle"] },
        ],
        sharedChannels: ["angle"],
      },
      chartSpec: {
        chartType: "PieChart",
        datasetId: "measurements",
        encodings: { theta: { field: "value", type: "quantitative" } },
        plotArea: { x: 84, y: 24, width: 152, height: 152 },
      },
    });

    const geometry = getPolarOccupiedGeometry(node)!;
    expect(geometry.innerRadius).toBe(38);
    expect(geometry.outerRadius).toBe(76);
    expect(geometry.angleSpan).toBe(120);
    expect(geometry.path).toContain(" A 76 76 ");
    expect(geometry.path).toContain(" A 38 38 ");
  });
});
