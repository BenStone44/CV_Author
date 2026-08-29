import type { Ref } from "vue";
import type {
  CanvasHistoryEntry,
  CanvasHistoryPositionPatch,
  CanvasHistorySnapshot,
  CanvasNode,
} from "../../types";

type CanvasHistoryOptions = {
  undoStack: Ref<CanvasHistoryEntry[]>;
  redoStack: Ref<CanvasHistoryEntry[]>;
  captureSnapshot: () => CanvasHistorySnapshot;
  restoreSnapshot: (snapshot: CanvasHistorySnapshot) => void;
  findNode: (nodeId: string) => CanvasNode | null;
  selectionNode: (nodeId: string) => CanvasNode | null;
  limit?: number;
};

export function useCanvasHistory(options: CanvasHistoryOptions) {
  const limit = options.limit ?? 50;

  function pushSnapshot(snapshot = options.captureSnapshot()) {
    options.undoStack.value.push(snapshot);
    if (options.undoStack.value.length > limit) options.undoStack.value.shift();
    options.redoStack.value = [];
  }

  function applyPositionPatch(patch: CanvasHistoryPositionPatch, direction: "before" | "after") {
    patch.changes.forEach(({ nodeId, before, after }) => {
      const node = options.findNode(nodeId);
      const position = direction === "before" ? before : after;
      if (node) {
        node.x = position.x;
        node.y = position.y;
      }
    });
  }

  function pushMovePatch(itemIds: string[], snapshots: Record<string, { x: number; y: number }>) {
    const changes = itemIds.flatMap((nodeId) => {
      const node = options.selectionNode(nodeId);
      const before = snapshots[nodeId];
      if (!node || !before || (node.x === before.x && node.y === before.y)) return [];
      return [{ nodeId, before: { ...before }, after: { x: node.x, y: node.y } }];
    });
    if (changes.length === 0) return false;
    options.undoStack.value.push({ kind: "position", changes });
    if (options.undoStack.value.length > limit) options.undoStack.value.shift();
    options.redoStack.value = [];
    return true;
  }

  function undo() {
    const entry = options.undoStack.value.pop();
    if (!entry) return;
    if ("kind" in entry) {
      if (entry.kind === "position") {
        applyPositionPatch(entry, "before");
        options.redoStack.value.push(entry);
      }
      return;
    }
    options.redoStack.value.push(options.captureSnapshot());
    options.restoreSnapshot(entry);
  }

  function redo() {
    const entry = options.redoStack.value.pop();
    if (!entry) return;
    if ("kind" in entry) {
      if (entry.kind === "position") {
        applyPositionPatch(entry, "after");
        options.undoStack.value.push(entry);
      }
      return;
    }
    options.undoStack.value.push(options.captureSnapshot());
    options.restoreSnapshot(entry);
  }

  return { pushSnapshot, pushMovePatch, undo, redo };
}
