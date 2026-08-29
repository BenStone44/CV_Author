import type { Ref } from "vue";
import type {
  CanvasNode,
  ChartRelationshipState,
  NestedRelationship,
} from "../../types";

type CanvasSelectionOptions = {
  selectedIds: Ref<string[]>;
  editingCompositionId: Ref<string | null>;
  rotationInputVisible: Ref<boolean>;
  polarAngleInputVisible: Ref<boolean>;
  relationships: Ref<ChartRelationshipState>;
  selectionScopeNodes: () => CanvasNode[];
  selectionNode: (nodeId: string) => CanvasNode | null;
  nestedRelationships: (selectionId: string) => NestedRelationship[];
  topLevelNodeId: (nodeId: string) => string;
};

export function useCanvasSelection(options: CanvasSelectionOptions) {
  function scopedCompositionMemberIds(node: CanvasNode) {
    const composition = node.compositionSpec;
    if (!composition || options.editingCompositionId.value === composition.id) return [node.id];
    if (composition.type === "concat") return [node.id];
    const members = new Set(composition.members.map((member) => member.nodeId));
    const memberIds = options.selectionScopeNodes()
      .filter((candidate) => members.has(candidate.id))
      .map((candidate) => candidate.id);
    return memberIds.length > 0 ? memberIds : [node.id];
  }

  function normalizeSelection(ids: string[]) {
    const normalized = new Set<string>();
    const nodes = options.selectionScopeNodes();
    ids.forEach((id) => {
      const node = nodes.find((candidate) => candidate.id === id);
      if (!node) {
        const nestedRelationship = id.startsWith("nested-unit:")
          ? options.nestedRelationships(id)[0]
          : Object.values(options.relationships.value.nestedRelationships).find((relationship) =>
            relationship.status === "active" && relationship.childChartId === id,
          );
        if (nestedRelationship) {
          const parentId = options.topLevelNodeId(nestedRelationship.parentChartId);
          if (nodes.some((candidate) => candidate.id === parentId)) normalized.add(parentId);
        }
        return;
      }
      const topLevelId = options.topLevelNodeId(node.id);
      const topLevelNode = nodes.find((candidate) => candidate.id === topLevelId) ?? node;
      scopedCompositionMemberIds(topLevelNode).forEach((memberId) => normalized.add(memberId));
    });
    return nodes.filter((node) => normalized.has(node.id)).map((node) => node.id);
  }

  function setSelection(ids: string[]) {
    const nextSelection = normalizeSelection(ids);
    if (nextSelection.length !== options.selectedIds.value.length
      || nextSelection.some((id, index) => id !== options.selectedIds.value[index])) {
      options.selectedIds.value = nextSelection;
    }
    if (options.selectedIds.value.length === 0) {
      options.rotationInputVisible.value = false;
      options.polarAngleInputVisible.value = false;
    }
    if (!options.selectedIds.value.some((id) => options.selectionNode(id)?.coordinateGuide?.type === "Polar")) {
      options.polarAngleInputVisible.value = false;
    }
  }

  function toggleSelection(ids: string[]) {
    const targetIds = normalizeSelection(ids);
    const selected = new Set(options.selectedIds.value);
    if (targetIds.every((id) => selected.has(id))) {
      options.selectedIds.value = options.selectedIds.value.filter((id) => !targetIds.includes(id));
      return;
    }
    setSelection([...options.selectedIds.value, ...targetIds]);
  }

  return { scopedCompositionMemberIds, normalizeSelection, setSelection, toggleSelection };
}
