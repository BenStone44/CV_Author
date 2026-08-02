import { defineComponent, h, type PropType } from "vue";
import type { CanvasNode } from "./types";
import { getNodeTransform, getLeafNodeTransform } from "./canvasUtils";

export const CanvasNodeView: any = defineComponent({
  name: "CanvasNodeView",
  props: {
    node: { type: Object as PropType<CanvasNode>, required: true },
    interactive: { type: Boolean, default: false },
    selected: { type: Boolean, default: false },
    onNodePointerDown: { type: Function as PropType<(node: CanvasNode, event: PointerEvent) => void>, default: null },
    onNodeContextMenu: { type: Function as PropType<(node: CanvasNode, event: MouseEvent) => void>, default: null },
  },
  setup(props): () => any {
    return () => {
      const NodeView = CanvasNodeView;
      const sharedProps = {
        class: ["canvas-object", props.selected ? "canvas-object--selected" : ""],
        "data-node-id": props.node.id,
        transform: props.node.kind === "leaf"
          ? getLeafNodeTransform(props.node)
          : getNodeTransform(props.node),
        "pointer-events": props.interactive ? "bounding-box" : undefined,
        onPointerdown: props.interactive && props.onNodePointerDown
          ? (event: PointerEvent) => props.onNodePointerDown!(props.node, event)
          : undefined,
        onContextmenu: props.interactive && props.onNodeContextMenu
          ? (event: MouseEvent) => props.onNodeContextMenu!(props.node, event)
          : undefined,
      };

      if (props.node.kind === "leaf") {
        return h("g", { ...sharedProps }, [
          // Keep a stable hit area for thin strokes and hollow SVG shapes.
          h("rect", {
            x: props.node.contentMinX,
            y: props.node.contentMinY,
            width: Math.max(props.node.width, 1),
            height: Math.max(props.node.height, 1),
            fill: "transparent",
            "pointer-events": "all",
            style: { pointerEvents: "all" },
          }),
          h("g", { innerHTML: props.node.content, style: { pointerEvents: "none" } }),
        ]);
      }

      return h(
        "g",
        sharedProps,
        props.node.children.map((child) =>
          h(NodeView, { key: child.id, node: child, interactive: false, selected: false }),
        ),
      );
    };
  },
});
