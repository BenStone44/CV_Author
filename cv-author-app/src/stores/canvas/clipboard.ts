import type { Ref } from "vue";
import type {
  Bounds,
  CanvasGroupNode,
  CanvasLeafNode,
  CanvasNode,
  Point,
} from "../../types";

export function useCanvasClipboard(context: any) {
  const {
    clipboardNodes,
    cloneCanvasNode,
    cloneChartSpec,
    clamp,
    collectNodeBounds,
    getCanvasBounds,
    getGroupAtPath,
    getSelectionScopeNodes,
    mergeBounds,
    pushCanvasHistory,
    registerChartRelationship,
    renderChartNode,
    renderSemanticNode,
    replaceSelectionScopeNodes,
    scopeSvgContent,
    selectedIds,
    setSelection,
    standaloneCoordinateSystem,
    walkCanvasNodes,
  } = context as {
    clipboardNodes: Ref<CanvasNode[]>;
    cloneCanvasNode: (node: CanvasNode) => CanvasNode;
    cloneChartSpec: (spec: CanvasNode["chartSpec"]) => CanvasNode["chartSpec"];
    clamp: (value: number, min: number, max: number) => number;
    collectNodeBounds: (node: CanvasNode) => Bounds;
    getCanvasBounds: () => Bounds;
    getGroupAtPath: () => CanvasGroupNode | null;
    getSelectionScopeNodes: () => CanvasNode[];
    mergeBounds: (current: Bounds | null, next: Bounds) => Bounds;
    pushCanvasHistory: () => void;
    registerChartRelationship: (node: CanvasNode) => void;
    renderChartNode: (node: CanvasNode) => void;
    renderSemanticNode: (node: CanvasNode) => void;
    replaceSelectionScopeNodes: (nodes: CanvasNode[]) => void;
    scopeSvgContent: (content: string, scope: string) => string;
    selectedIds: Ref<string[]>;
    setSelection: (ids: string[]) => void;
    standaloneCoordinateSystem: (node: CanvasNode) => CanvasNode["coordinateSystem"];
    walkCanvasNodes: (nodes: CanvasNode[]) => CanvasNode[];
  };
  let pasteCount = 0;

  function cloneCanvasNodeForPaste(node: CanvasNode, renderClone = true): CanvasNode {
    const nextId = crypto.randomUUID();
    const coordinateGuide = node.coordinateGuide
      ? { ...node.coordinateGuide, origin: { ...node.coordinateGuide.origin } }
      : node.coordinateGuide;
    const chartSpec = cloneChartSpec(node.chartSpec);
    if (node.kind === "leaf") {
      const clone: CanvasLeafNode = {
        ...node,
        coordinateGuide,
        coordinateSystem: null,
        compositionSpec: null,
        chartSpec,
        id: nextId,
        name: `${node.name} copy`,
        content: scopeSvgContent(node.content, nextId),
      };
      clone.coordinateSystem = standaloneCoordinateSystem(clone);
      if (renderClone && clone.llmRenderer?.status !== "ready") {
        renderChartNode(clone);
        renderSemanticNode(clone);
      }
      return clone;
    }
    const clone: CanvasGroupNode = {
      ...node,
      coordinateGuide,
      coordinateSystem: null,
      compositionSpec: null,
      chartSpec,
      id: nextId,
      name: `${node.name} copy`,
      children: node.children.map((child) => cloneCanvasNodeForPaste(child, renderClone)),
    };
    clone.coordinateSystem = standaloneCoordinateSystem(clone);
    if (renderClone && clone.llmRenderer?.status !== "ready") {
      renderChartNode(clone);
      renderSemanticNode(clone);
    }
    return clone;
  }

  function copySelectedNodes() {
    const selected = new Set(selectedIds.value);
    const copied = getSelectionScopeNodes().filter((node) => selected.has(node.id)).map((node) => cloneCanvasNode(node));
    if (copied.length === 0) return;
    clipboardNodes.value = copied;
    pasteCount = 0;
  }

  function getCanvasNodeListBounds(nodes: CanvasNode[]): Bounds | null {
    let bounds: Bounds | null = null;
    for (const node of nodes) bounds = mergeBounds(bounds, collectNodeBounds(node));
    return bounds;
  }

  function pasteClipboardNodes(point?: Point) {
    if (clipboardNodes.value.length === 0) return;
    const nextNodes = clipboardNodes.value.map((node) => cloneCanvasNodeForPaste(node));
    const bounds = getCanvasNodeListBounds(nextNodes);
    if (!bounds) return;
    pasteCount += 1;
    const editingGroup = getGroupAtPath();
    const canvasBounds = editingGroup
      ? { minX: 0, minY: 0, maxX: editingGroup.width, maxY: editingGroup.height, width: editingGroup.width, height: editingGroup.height }
      : getCanvasBounds();
    const intendedDx = point && !editingGroup ? point.x - (bounds.minX + bounds.width / 2) : pasteCount * 16;
    const intendedDy = point && !editingGroup ? point.y - (bounds.minY + bounds.height / 2) : pasteCount * 16;
    const dx = clamp(intendedDx, canvasBounds.minX - bounds.minX, canvasBounds.maxX - bounds.maxX);
    const dy = clamp(intendedDy, canvasBounds.minY - bounds.minY, canvasBounds.maxY - bounds.maxY);
    nextNodes.forEach((node) => { node.x += dx; node.y += dy; });
    pushCanvasHistory();
    replaceSelectionScopeNodes([...getSelectionScopeNodes(), ...nextNodes]);
    walkCanvasNodes(nextNodes).forEach((node) => registerChartRelationship(node));
    setSelection(nextNodes.map((node) => node.id));
  }

  return { cloneCanvasNodeForPaste, copySelectedNodes, getCanvasNodeListBounds, pasteClipboardNodes };
}
