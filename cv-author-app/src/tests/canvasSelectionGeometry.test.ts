import { describe, expect, it, vi } from "vitest";
import { CanvasNodeView } from "../components/CanvasNodeView";
import type { CanvasGroupNode, CanvasLeafNode } from "../types";
import { nodeLocalBoundsFrame, nodeLocalBoundsInCanvas } from "../utils/canvasUtils";

function rotatedNode(): CanvasGroupNode {
  return {
    kind: "group",
    id: "rotated-offset-selection",
    name: "Rotated offset selection",
    x: 100,
    y: 100,
    width: 800,
    height: 400,
    scaleX: 1,
    scaleY: 1,
    rotation: 90,
    children: [],
  };
}

describe("canvas selection geometry", () => {
  it("keeps a composite occupancy anchor separate from descendant hit targets", () => {
    const child: CanvasLeafNode = {
      kind: "leaf",
      id: "facet-cell",
      candidateId: "test:facet-cell",
      name: "Facet cell",
      content: '<rect x="0" y="0" width="80" height="40" />',
      viewBox: "0 0 80 40",
      contentMinX: 0,
      contentMinY: 0,
      x: 10,
      y: 20,
      width: 80,
      height: 40,
      scaleX: 1,
      scaleY: 1,
      rotation: 0,
    };
    const parent: CanvasGroupNode = {
      ...rotatedNode(),
      id: "facet-root",
      rotation: 0,
      children: [child],
    };
    const render = (CanvasNodeView as any).setup({
      node: parent,
      embedded: false,
      interactive: true,
      selected: false,
      editingGroupPath: [],
      editingChartId: null,
      draggingNodeId: null,
      selectedIds: [],
      nestedPlacements: [],
      nestedRenderedChildIds: new Set<string>(),
      onNodePointerDown: vi.fn(),
      onNodeContextMenu: null,
      onMarkPointerDown: null,
      onEditingBackgroundPointerDown: null,
    });

    const root = render();
    const anchor = root.children.find((item: any) =>
      item.props?.["data-selection-occupancy-node-id"] === parent.id);
    expect(anchor.props["data-selection-occupancy-composite"]).toBe("true");
    expect(anchor.children).toEqual([]);
    expect(root.children.some((item: any) => item.props?.node?.id === child.id)).toBe(true);
  });

  it("rotates an offset occupied box around the node frame center", () => {
    const node = rotatedNode();
    const occupied = {
      minX: 0,
      minY: 0,
      maxX: 100,
      maxY: 50,
      width: 100,
      height: 50,
    };

    const canvasBounds = nodeLocalBoundsInCanvas(node, occupied);
    expect(canvasBounds.minX).toBeCloseTo(650);
    expect(canvasBounds.minY).toBeCloseTo(-100);
    expect(canvasBounds.maxX).toBeCloseTo(700);
    expect(canvasBounds.maxY).toBeCloseTo(0);
    expect(canvasBounds.width).toBeCloseTo(50);
    expect(canvasBounds.height).toBeCloseTo(100);

    const frame = nodeLocalBoundsFrame(node, occupied);
    expect(frame.x).toBeCloseTo(625);
    expect(frame.y).toBeCloseTo(-75);
    expect(frame).toMatchObject({ width: 100, height: 50, rotation: 90 });
  });
});
