import { describe, expect, it } from "vitest";
import { ref } from "vue";
import type { CanvasGroupNode, CanvasLeafNode, CanvasNode } from "./types";

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
