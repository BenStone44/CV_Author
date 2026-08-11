import { describe, expect, it } from "vitest";
import { ref } from "vue";
import type { CanvasGroupNode, CanvasLeafNode, CanvasNode, Dataset } from "./types";
import { collectNodeSelectionBounds } from "./canvasUtils";

const storage = new Map<string, string>();
Object.defineProperty(globalThis, "localStorage", {
  configurable: true,
  value: {
    getItem: (key: string) => storage.get(key) ?? null,
    setItem: (key: string, value: string) => storage.set(key, value),
    removeItem: (key: string) => storage.delete(key),
  },
});

type WindowListener = (event: any) => void;
const listeners = new Map<string, WindowListener>();
Object.defineProperty(globalThis, "window", {
  configurable: true,
  value: {
    addEventListener: (type: string, listener: WindowListener) => listeners.set(type, listener),
    removeEventListener: (type: string, listener: WindowListener) => {
      if (listeners.get(type) === listener) listeners.delete(type);
    },
    setTimeout,
    clearTimeout,
  },
});

const { useCanvasStore } = await import("./useCanvasStore");
const { useDatasetStore } = await import("./useDatasetStore");

const layerDataset: Dataset = {
  id: "layer-dataset",
  name: "layer.csv",
  columns: [
    { name: "series", type: "nominal" },
    { name: "time", type: "temporal" },
    { name: "value", type: "quantitative" },
  ],
  rows: [
    { series: "A", time: "2026-01-01", value: "10" },
    { series: "A", time: "2026-02-01", value: "18" },
    { series: "B", time: "2026-01-01", value: "14" },
    { series: "B", time: "2026-02-01", value: "22" },
  ],
  primaryKey: ["series", "time"],
};

function leaf(id: string, x: number, y: number): CanvasLeafNode {
  return {
    kind: "leaf",
    id,
    candidateId: `test:${id}`,
    name: id,
    content: '<rect x="0" y="0" width="40" height="30" />',
    viewBox: "0 0 40 30",
    width: 40,
    height: 30,
    x,
    y,
    scaleX: 1,
    scaleY: 1,
    rotation: 0,
    contentMinX: 0,
    contentMinY: 0,
  };
}

function createNodes(): CanvasNode[] {
  const nested: CanvasGroupNode = {
    kind: "group",
    id: "nested",
    name: "nested",
    x: 100,
    y: 20,
    width: 80,
    height: 70,
    scaleX: 1,
    scaleY: 1,
    rotation: 0,
    children: [leaf("nested-child", 10, 10)],
  };
  return [
    {
      kind: "group",
      id: "root-group",
      name: "root-group",
      x: 200,
      y: 150,
      width: 240,
      height: 140,
      scaleX: 1,
      scaleY: 1,
      rotation: 0,
      children: [leaf("child", 20, 40), nested],
    },
    leaf("outside", 520, 180),
  ];
}

function lineChart(id: string, x: number, withSeries: boolean): CanvasGroupNode {
  return {
    kind: "group",
    id,
    name: id,
    x,
    y: 100,
    width: 800,
    height: 400,
    scaleX: 1,
    scaleY: 1,
    rotation: 0,
    coordinateGuide: {
      type: "Cartesian",
      origin: { x: 0, y: 400 },
      xDirection: 1,
      yDirection: -1,
    },
    chartSpec: {
      chartType: "LineGraph",
      datasetId: layerDataset.id,
      encodings: {
        x: { field: "time", type: "temporal" },
        y: { field: "value", type: "quantitative" },
      },
      series: withSeries ? { field: "series", type: "nominal" } : undefined,
    },
    children: [],
  };
}

function lineLeafChart(id: string, x: number, contentMinX: number, contentMinY: number): CanvasLeafNode {
  const group = lineChart(id, x, false);
  const { children: _children, ...node } = group;
  return {
    ...node,
    kind: "leaf",
    candidateId: `test:${id}`,
    content: '<path d="M 0 0" />',
    viewBox: `${contentMinX} ${contentMinY} 640 300`,
    width: 640,
    height: 300,
    contentMinX,
    contentMinY,
  };
}

function pointerEvent(clientX: number, clientY: number) {
  return {
    button: 0,
    clientX,
    clientY,
    shiftKey: false,
    metaKey: false,
    ctrlKey: false,
    preventDefault() {},
    stopPropagation() {},
  } as unknown as PointerEvent;
}

function mouseEvent() {
  return {
    preventDefault() {},
    stopPropagation() {},
  } as unknown as MouseEvent;
}

describe("group editing scope", () => {
  it("moves and deletes group children while a reactive Nested relationship is present", () => {
    listeners.clear();
    const canvasRef = ref({
      getBoundingClientRect: () => ({ left: 0, top: 0, width: 1200, height: 800 }),
      querySelectorAll: () => [],
    } as unknown as HTMLElement);
    const store = useCanvasStore(canvasRef);
    store.relationshipStore.dispatch({ type: "clear" });
    store.relationshipStore.dispatch({
      type: "register-chart",
      chart: {
        id: "parent-chart",
        nodeId: "parent-chart",
        chartType: "Scatterplot",
        datasetId: "dataset",
        instanceKind: "canvas",
      },
    });
    store.relationshipStore.dispatch({
      type: "register-chart",
      chart: {
        id: "nested-chart",
        nodeId: null,
        chartType: "PieChart",
        datasetId: "dataset",
        instanceKind: "nested-child",
      },
    });
    store.relationshipStore.dispatch({
      type: "begin-nested",
      relationship: {
        id: "nested-relationship",
        parentChartId: "parent-chart",
        parentElementId: "point:1",
        childChartId: "nested-chart",
        relationType: "relative-position",
        parameters: store.relationshipStore.defaultRelativeParameters(),
        resolverVersion: 1,
      },
    });
    store.canvasNodes.value = createNodes();

    const root = store.canvasNodes.value[0] as CanvasGroupNode;
    store.onCanvasNodeDoubleClick(root, mouseEvent());
    expect(store.editingGroupPath.value).toEqual(["root-group"]);
    expect(store.selectedIds.value).toEqual([]);

    const child = root.children[0] as CanvasLeafNode;
    store.onCanvasNodePointerDown(child, pointerEvent(40, 60));
    listeners.get("pointermove")?.(pointerEvent(70, 80));
    listeners.get("pointerup")?.(pointerEvent(70, 80));
    expect(store.selectedIds.value).toEqual(["child"]);
    expect(child.x).toBe(50);
    expect(child.y).toBe(60);
    expect(root.children).toHaveLength(2);

    store.undoCanvasChange();
    expect(store.editingGroupPath.value).toEqual(["root-group"]);
    expect((store.canvasNodes.value[0] as CanvasGroupNode).children[0]!.x).toBe(20);
    store.redoCanvasChange();
    expect((store.canvasNodes.value[0] as CanvasGroupNode).children[0]!.x).toBe(50);

    const restoredRoot = store.canvasNodes.value[0] as CanvasGroupNode;
    const nested = restoredRoot.children[1] as CanvasGroupNode;
    store.onCanvasNodeDoubleClick(nested, mouseEvent());
    expect(store.editingGroupPath.value).toEqual(["root-group", "nested"]);
    store.exitGroupEditing();
    expect(store.editingGroupPath.value).toEqual(["root-group"]);
    expect(store.selectedIds.value).toEqual(["nested"]);

    const restoredChild = restoredRoot.children[0] as CanvasLeafNode;
    store.onCanvasNodePointerDown(restoredChild, pointerEvent(50, 60));
    listeners.get("pointerup")?.(pointerEvent(50, 60));
    store.deleteSelectedNodes();
    expect(restoredRoot.children.map((node) => node.id)).toEqual(["nested"]);
    store.undoCanvasChange();
    expect((store.canvasNodes.value[0] as CanvasGroupNode).children.map((node) => node.id)).toEqual(["child", "nested"]);
    expect(store.editingGroupPath.value).toEqual(["root-group"]);

    const outside = store.canvasNodes.value[1] as CanvasLeafNode;
    store.onCanvasNodePointerDown(outside, pointerEvent(540, 200));
    listeners.get("pointerup")?.(pointerEvent(540, 200));
    expect(store.editingGroupPath.value).toEqual([]);
    expect(store.selectedIds.value).toEqual(["outside"]);
  });
});

describe("generic Layer composition", () => {
  it("layers line and point marks under one inherited coordinate system", () => {
    const canvasRef = ref({
      getBoundingClientRect: () => ({ left: 0, top: 0, width: 1800, height: 1000 }),
      querySelectorAll: () => [],
    } as unknown as HTMLElement);
    const store = useCanvasStore(canvasRef);
    store.relationshipStore.dispatch({ type: "clear" });
    useDatasetStore().datasets.value = [layerDataset];
    const memberChart = lineLeafChart("member", 1000, 120, 45);
    memberChart.chartSpec = {
      ...memberChart.chartSpec!,
      chartType: "Scatterplot",
      encodings: {
        ...memberChart.chartSpec!.encodings,
        x: { field: "series", type: "nominal" },
      },
    };
    store.canvasNodes.value = [lineChart("owner", 100, true), memberChart];
    store.selectedIds.value = ["owner", "member"];

    expect(store.executeComposition("layer")).toBe(true);
    expect(store.canvasNodes.value).toHaveLength(2);
    expect(store.canvasNodes.value.every((node) => node.compositionSpec?.type === "layer")).toBe(true);

    const owner = store.canvasNodes.value.find((node) => node.coordinateSystem?.ownerNodeId === node.id)!;
    const member = store.canvasNodes.value.find((node) => node.id !== owner.id)!;
    expect(owner.renderedContent).not.toContain('data-mark-role="x-axis"');
    expect(owner.renderedContent).not.toContain('data-mark-role="y-axis"');
    expect(owner.renderedContent).not.toContain("<text");
    expect(member.renderedContent).not.toContain('data-mark-role="x-axis"');
    expect(member.renderedContent).not.toContain('data-mark-role="y-axis"');
    expect(member.renderedContent).not.toContain("<text");
    expect(owner.renderedContent).toContain('data-mark-role="line"');
    expect(member.renderedContent).toContain('data-mark-role="point"');
    expect(owner.coordinateSystem?.ownerNodeId).toBe(owner.id);
    expect(member.chartSpec?.encodings.x).toEqual(owner.chartSpec?.encodings.x);
    expect(member.chartSpec?.encodings.y).toEqual(owner.chartSpec?.encodings.y);
    expect(member.chartSpec?.plotArea?.x).toBe((owner.chartSpec?.plotArea?.x ?? 0) + 120);
    expect(member.chartSpec?.plotArea?.y).toBe((owner.chartSpec?.plotArea?.y ?? 0) + 45);
    expect(member.chartSpec?.scales?.x?.range).toEqual(owner.chartSpec?.scales?.x?.range.map((value) => value + 120));
    expect(member.chartSpec?.scales?.y?.range).toEqual(owner.chartSpec?.scales?.y?.range.map((value) => value + 45));
    expect(collectNodeSelectionBounds(member)).toEqual(collectNodeSelectionBounds(owner));
    expect(store.selectionBounds.value).toEqual(collectNodeSelectionBounds(owner));
    expect(member.x).toBe(owner.x);
    expect(member.y).toBe(owner.y);

    const startOwner = { x: owner.x, y: owner.y };
    const startMember = { x: member.x, y: member.y };
    store.onCanvasNodePointerDown(member, pointerEvent(400, 300));
    listeners.get("pointermove")?.(pointerEvent(480, 360));
    listeners.get("pointerup")?.(pointerEvent(480, 360));

    expect(owner.x).toBe(startOwner.x + 80);
    expect(owner.y).toBe(startOwner.y + 60);
    expect(member.x).toBe(startMember.x + 80);
    expect(member.y).toBe(startMember.y + 60);
    expect(owner.coordinateSystem?.ownerNodeId).toBe(owner.id);
    expect(member.compositionSpec?.type).toBe("layer");

    const beforeUnrestrictedDrag = { ownerX: owner.x, memberX: member.x };
    store.onCanvasNodePointerDown(member, pointerEvent(400, 300));
    listeners.get("pointermove")?.(pointerEvent(-1000, 300));
    listeners.get("pointerup")?.(pointerEvent(-1000, 300));
    expect(owner.x).toBe(beforeUnrestrictedDrag.ownerX - 1400);
    expect(member.x).toBe(beforeUnrestrictedDrag.memberX - 1400);

    store.reverseCoordinateAxis(member, "x");
    expect(owner.coordinateGuide?.type === "Cartesian" && owner.coordinateGuide.xDirection).toBe(-1);
    expect(member.coordinateGuide?.type === "Cartesian" && member.coordinateGuide.xDirection).toBe(-1);
    expect(member.chartSpec?.scales?.x?.range).toEqual(
      owner.chartSpec?.scales?.x?.range.map((value) => value + 120),
    );
  });
});
