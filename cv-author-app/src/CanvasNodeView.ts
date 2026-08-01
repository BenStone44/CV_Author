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
        return h("g", { ...sharedProps, innerHTML: props.node.content });
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
