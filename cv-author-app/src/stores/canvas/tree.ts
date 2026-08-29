import type { Ref } from "vue";
import type {
  CanvasGroupNode,
  CanvasNode,
  ChartRelationshipState,
  NestedRelationship,
  RelativeNestedParameters,
} from "../../types";

type CanvasTreeOptions = {
  canvasNodes: Ref<CanvasNode[]>;
  editingGroupPath: Ref<string[]>;
  relationships: Ref<ChartRelationshipState>;
};

export function useCanvasTree(options: CanvasTreeOptions) {
  function getRootNode(nodeId: string) {
    return options.canvasNodes.value.find((node) => node.id === nodeId) ?? null;
  }

  function findCanvasNode(nodeId: string, nodes = options.canvasNodes.value): CanvasNode | null {
    for (const node of nodes) {
      if (node.id === nodeId) return node;
      if (node.kind === "group") {
        const nested = findCanvasNode(nodeId, node.children);
        if (nested) return nested;
      }
    }
    return null;
  }

  function walkCanvasNodes(nodes = options.canvasNodes.value): CanvasNode[] {
    return nodes.flatMap((node) => [node, ...(node.kind === "group" ? walkCanvasNodes(node.children) : [])]);
  }

  function parentGroupIdForNode(
    nodeId: string,
    nodes = options.canvasNodes.value,
    parentGroupId?: string,
  ): string | undefined {
    for (const node of nodes) {
      if (node.id === nodeId) return parentGroupId;
      if (node.kind !== "group") continue;
      const nestedParentId = parentGroupIdForNode(nodeId, node.children, node.id);
      if (nestedParentId !== undefined) return nestedParentId;
    }
    return undefined;
  }

  function getGroupsAtPath(path = options.editingGroupPath.value): CanvasGroupNode[] {
    let nodes = options.canvasNodes.value;
    const groups: CanvasGroupNode[] = [];
    for (const id of path) {
      const node = nodes.find((candidate) => candidate.id === id);
      if (!node || node.kind !== "group") return [];
      groups.push(node);
      nodes = node.children;
    }
    return groups;
  }

  function getGroupAtPath(path = options.editingGroupPath.value): CanvasGroupNode | null {
    return getGroupsAtPath(path).at(-1) ?? null;
  }

  function getSelectionScopeNodes() {
    return getGroupAtPath()?.children ?? options.canvasNodes.value;
  }

  function getSelectionNode(nodeId: string) {
    return getSelectionScopeNodes().find((node) => node.id === nodeId) ?? null;
  }

  function nestedSelectionRelationships(selectionId: string): NestedRelationship[] {
    const relationships = Object.values(options.relationships.value.nestedRelationships)
      .filter((relationship) => relationship.status === "active");
    const units = new Map<string, NestedRelationship[]>();
    relationships.forEach((relationship) => {
      const parameters = relationship.parameters as Partial<RelativeNestedParameters>;
      const key = parameters.batchId ?? relationship.id;
      const members = units.get(key) ?? [];
      members.push(relationship);
      units.set(key, members);
    });
    for (const [key, members] of units) {
      if (`nested-unit:${key}` === selectionId) return members;
    }
    return [];
  }

  function topLevelSelectionNodeId(nodeId: string) {
    let current = nodeId;
    const seen = new Set<string>();
    while (!seen.has(current)) {
      seen.add(current);
      const parent = Object.values(options.relationships.value.nestedRelationships).find((relationship) =>
        relationship.status === "active" && relationship.childChartId === current,
      )?.parentChartId;
      if (!parent) break;
      current = parent;
    }
    return current;
  }

  return {
    getRootNode,
    findCanvasNode,
    walkCanvasNodes,
    parentGroupIdForNode,
    getGroupsAtPath,
    getGroupAtPath,
    getSelectionScopeNodes,
    getSelectionNode,
    nestedSelectionRelationships,
    topLevelSelectionNodeId,
  };
}
