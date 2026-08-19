import { defineComponent, h, type PropType } from "vue";
import type { CanvasNode, CoordinateChannel, EncodingChannel, Point } from "../types";
import { getNodeSelectionBounds, getNodeTransform, getLeafNodeTransform } from "../utils/canvasUtils";
import { PolarCoordinateSystem } from "./PolarCoordinateSystem";

function arrowHead(end: Point, direction: Point, size: number) {
  const perpendicular = { x: -direction.y, y: direction.x };
  const wing = size * 0.58;
  const first = {
    x: end.x - direction.x * size + perpendicular.x * wing,
    y: end.y - direction.y * size + perpendicular.y * wing,
  };
  const second = {
    x: end.x - direction.x * size - perpendicular.x * wing,
    y: end.y - direction.y * size - perpendicular.y * wing,
  };
  return `M ${first.x} ${first.y} L ${end.x} ${end.y} L ${second.x} ${second.y}`;
}

function cartesianCoordinateOverlay(
  node: CanvasNode,
  viewZoom: number,
  onOriginPointerDown?: (node: CanvasNode, event: PointerEvent) => void,
  onAxisReverse?: (node: CanvasNode, axis: "x" | "y") => void,
  onAxisSelect?: (node: CanvasNode, channel: EncodingChannel, event: PointerEvent) => void,
) {
  const guide = node.coordinateGuide;
  if (guide?.type !== "Cartesian") return null;
  const minX = node.kind === "leaf" ? node.contentMinX : 0;
  const minY = node.kind === "leaf" ? node.contentMinY : 0;
  const maxX = minX + node.width;
  const maxY = minY + node.height;
  const padding = Math.max(8, Math.min(Math.max(node.width, node.height) * 0.035, 42));
  const arrowSize = Math.max(7, Math.min(Math.max(node.width, node.height) * 0.018, 18));
  const xStart = { x: minX - padding, y: guide.origin.y };
  const xEnd = { x: maxX + padding, y: guide.origin.y };
  const yStart = { x: guide.origin.x, y: minY - padding };
  const yEnd = { x: guide.origin.x, y: maxY + padding };
  const xDirection = guide.xDirection ?? 1;
  const yDirection = guide.yDirection ?? 1;
  const xArrowEnd = xDirection === 1 ? xEnd : xStart;
  const xTailEnd = xDirection === 1 ? xStart : xEnd;
  const yArrowEnd = yDirection === 1 ? yEnd : yStart;
  const yTailEnd = yDirection === 1 ? yStart : yEnd;
  const renderedScale = Math.max(Math.abs(node.scaleX), Math.abs(node.scaleY), 0.0001) * Math.max(viewZoom, 0.0001);
  const xEncoding = node.chartSpec?.encodings.x;
  const yEncoding = node.chartSpec?.encodings.y;

  const line = (className: string, start: Point, end: Point) => h("line", {
    class: ["coordinate-axis-line", className],
    x1: start.x,
    y1: start.y,
    x2: end.x,
    y2: end.y,
    "vector-effect": "non-scaling-stroke",
  });
  const reverseTarget = (axis: "x" | "y", point: Point, direction: Point) => {
    const xScreenScale = Math.max(Math.abs(node.scaleX) * Math.max(viewZoom, 0.0001), 0.0001);
    const yScreenScale = Math.max(Math.abs(node.scaleY) * Math.max(viewZoom, 0.0001), 0.0001);
    const axisScreenScale = axis === "x" ? xScreenScale : yScreenScale;
    const offset = 28 / axisScreenScale;
    const controlPoint = {
      x: point.x + direction.x * offset,
      y: point.y + direction.y * offset,
    };
    return h("g", {
      class: ["coordinate-axis-reverse-control", `coordinate-axis-reverse-control--${axis}`],
      transform: `translate(${controlPoint.x} ${controlPoint.y}) scale(${1 / xScreenScale} ${1 / yScreenScale})`,
      onPointerdown: onAxisReverse
        ? (event: PointerEvent) => {
          event.preventDefault();
          event.stopPropagation();
          onAxisReverse(node, axis);
        }
        : undefined,
    }, [
      h("title", `Reverse ${axis.toUpperCase()}-axis direction`),
      h("circle", {
        class: "coordinate-axis-reverse-hit-target",
        cx: 0,
        cy: 0,
        r: 16,
      }),
      h("circle", {
        class: "coordinate-axis-reverse-outline",
        cx: 0,
        cy: 0,
        r: 12,
        "vector-effect": "non-scaling-stroke",
      }),
      h("path", {
        class: "coordinate-axis-reverse-icon",
        d: "M -6 -4 H 5 M 2 -7 L 5 -4 L 2 -1 M 6 4 H -5 M -2 1 L -5 4 L -2 7",
        transform: axis === "y" ? "rotate(90)" : undefined,
        "vector-effect": "non-scaling-stroke",
      }),
    ]);
  };
  const axisHitTarget = (channel: EncodingChannel, start: Point, end: Point) => h("line", {
    class: ["coordinate-axis-hit-target", `coordinate-axis-hit-target--${channel}`],
    role: "button",
    "aria-label": `Bind ${channel.toUpperCase()} axis`,
    x1: start.x,
    y1: start.y,
    x2: end.x,
    y2: end.y,
    "vector-effect": "non-scaling-stroke",
    onPointerdown: onAxisSelect
      ? (event: PointerEvent) => {
        event.preventDefault();
        event.stopPropagation();
        onAxisSelect(node, channel, event);
      }
      : undefined,
  });
  const encodingLabel = (channel: EncodingChannel, field: string) => {
    const isX = channel === "x";
    const x = isX ? (minX + maxX) / 2 : guide.origin.x - 25 / renderedScale;
    const y = isX ? guide.origin.y + 25 / renderedScale : (minY + maxY) / 2;
    return h("text", {
      class: ["coordinate-axis-binding-label", `coordinate-axis-binding-label--${channel}`],
      x,
      y,
      "font-size": 12 / renderedScale,
      "text-anchor": "middle",
      "dominant-baseline": "middle",
      transform: isX ? undefined : `rotate(-90 ${x} ${y})`,
    }, field);
  };
  if (node.renderedContent) {
    return h("g", { class: "coordinate-guide coordinate-guide--cartesian coordinate-guide--semantic" }, [
      axisHitTarget("x", xStart, xEnd),
      axisHitTarget("y", yStart, yEnd),
    ]);
  }
  return h("g", { class: "coordinate-guide coordinate-guide--cartesian" }, [
    line(`coordinate-axis-line--tail coordinate-axis-line--x${xEncoding ? " coordinate-axis-line--bound" : ""}`, xTailEnd, guide.origin),
    line(`coordinate-axis-line--arrow coordinate-axis-line--x${xEncoding ? " coordinate-axis-line--bound" : ""}`, guide.origin, xArrowEnd),
    axisHitTarget("x", xStart, xEnd),
    reverseTarget("x", xArrowEnd, { x: xDirection, y: 0 }),
    h("path", {
      class: "coordinate-axis-arrowhead coordinate-axis-line--x",
      d: arrowHead(xArrowEnd, { x: xDirection, y: 0 }, arrowSize),
      "vector-effect": "non-scaling-stroke",
    }),
    line(`coordinate-axis-line--tail coordinate-axis-line--y${yEncoding ? " coordinate-axis-line--bound" : ""}`, yTailEnd, guide.origin),
    line(`coordinate-axis-line--arrow coordinate-axis-line--y${yEncoding ? " coordinate-axis-line--bound" : ""}`, guide.origin, yArrowEnd),
    axisHitTarget("y", yStart, yEnd),
    reverseTarget("y", yArrowEnd, { x: 0, y: yDirection }),
    h("path", {
      class: "coordinate-axis-arrowhead coordinate-axis-line--y",
      d: arrowHead(yArrowEnd, { x: 0, y: yDirection }, arrowSize),
      "vector-effect": "non-scaling-stroke",
    }),
    h("circle", {
      class: "coordinate-origin-hit-target",
      cx: guide.origin.x,
      cy: guide.origin.y,
      r: 18 / renderedScale,
      fill: "transparent",
      stroke: "transparent",
      "pointer-events": "all",
      style: { cursor: "grab", touchAction: "none" },
      onPointerdown: onOriginPointerDown
        ? (event: PointerEvent) => onOriginPointerDown(node, event)
        : undefined,
    }, [h("title", "Drag coordinate origin")]),
    h("rect", {
      class: "coordinate-origin-handle",
      x: guide.origin.x - 6 / renderedScale,
      y: guide.origin.y - 6 / renderedScale,
      width: 12 / renderedScale,
      height: 12 / renderedScale,
      "pointer-events": "none",
      "vector-effect": "non-scaling-stroke",
    }),
    ...(xEncoding ? [encodingLabel("x", xEncoding.field)] : []),
    ...(yEncoding ? [encodingLabel("y", yEncoding.field)] : []),
  ]);
}

export const CanvasNodeView: any = defineComponent({
  name: "CanvasNodeView",
  props: {
    node: { type: Object as PropType<CanvasNode>, required: true },
    interactive: { type: Boolean, default: false },
    selected: { type: Boolean, default: false },
    editingGroupPath: { type: Array as PropType<string[]>, default: () => [] },
    selectedIds: { type: Array as PropType<string[]>, default: () => [] },
    onNodePointerDown: { type: Function as PropType<(node: CanvasNode, event: PointerEvent) => void>, default: null },
    onNodeDoubleClick: { type: Function as PropType<(node: CanvasNode, event: MouseEvent) => void>, default: null },
    onNodeContextMenu: { type: Function as PropType<(node: CanvasNode, event: MouseEvent) => void>, default: null },
    onMarkPointerDown: { type: Function as PropType<(node: CanvasNode, event: PointerEvent) => void>, default: null },
    onEditingBackgroundPointerDown: { type: Function as PropType<(event: PointerEvent) => void>, default: null },
  },
  setup(props): () => any {
    return () => {
      const NodeView = CanvasNodeView;
      const markHandler = (props as any).onMarkPointerDown as ((node: CanvasNode, event: PointerEvent) => void) | null;
      const editingPath = props.editingGroupPath;
      const isEditingAncestor = props.node.kind === "group" && editingPath[0] === props.node.id;
      const isActiveEditingGroup = isEditingAncestor && editingPath.length === 1;
      const nodeInteractive = props.interactive && !isEditingAncestor;
      const sharedProps = {
        class: [
          "canvas-object",
          nodeInteractive ? "canvas-object--interactive" : "",
          isActiveEditingGroup ? "canvas-object--editing-group" : "",
          props.selected ? "canvas-object--selected" : "",
        ],
        "data-node-id": props.node.id,
        transform: props.node.kind === "leaf"
          ? getLeafNodeTransform(props.node)
          : getNodeTransform(props.node),
        "pointer-events": nodeInteractive ? "auto" : isEditingAncestor ? "none" : undefined,
        onPointerdown: nodeInteractive && props.onNodePointerDown
          ? (event: PointerEvent) => props.onNodePointerDown!(props.node, event)
          : undefined,
        onDblclick: nodeInteractive && props.onNodeDoubleClick
          ? (event: MouseEvent) => props.onNodeDoubleClick!(props.node, event)
          : undefined,
        onContextmenu: nodeInteractive && props.onNodeContextMenu
          ? (event: MouseEvent) => props.onNodeContextMenu!(props.node, event)
          : undefined,
      };

      if (props.node.kind === "leaf") {
        const hasInteractiveMarks = !!props.node.renderedContent && !!markHandler;
        const isChartPlaceholder = !!props.node.chartSpec && !props.node.renderedContent;
        const hitBounds = getNodeSelectionBounds(props.node);
        return h("g", { ...sharedProps }, [
          // Keep a stable hit area for thin strokes and hollow SVG shapes.
          h("rect", {
            x: hitBounds.minX,
            y: hitBounds.minY,
            width: hitBounds.width,
            height: hitBounds.height,
            fill: "transparent",
            class: "canvas-object-hit-target",
            "pointer-events": hasInteractiveMarks ? "none" : "all",
            style: { pointerEvents: hasInteractiveMarks ? "none" : "all" },
          }),
          ...(isChartPlaceholder ? [h("rect", {
            class: "chart-placeholder-frame",
            x: props.node.contentMinX,
            y: props.node.contentMinY,
            width: Math.max(props.node.width, 1),
            height: Math.max(props.node.height, 1),
            "vector-effect": "non-scaling-stroke",
            "pointer-events": "none",
          })] : []),
          h("g", { class: props.node.renderedContent && markHandler ? "semantic-rendered-content" : undefined, innerHTML: props.node.renderedContent ?? props.node.content, style: { pointerEvents: props.node.renderedContent && markHandler ? "all" : "none" }, onPointerdown: props.node.renderedContent && markHandler ? (event: PointerEvent) => markHandler(props.node, event) : undefined }),
        ]);
      }

      if (props.node.renderedContent && !isEditingAncestor) {
        const hitBounds = getNodeSelectionBounds(props.node);
        return h("g", sharedProps, [
          h("rect", {
            class: "canvas-object-hit-target",
            x: hitBounds.minX,
            y: hitBounds.minY,
            width: hitBounds.width,
            height: hitBounds.height,
            fill: "transparent",
            "pointer-events": markHandler ? "none" : "all",
          }),
          h("g", { class: markHandler ? "semantic-rendered-content" : undefined, innerHTML: props.node.renderedContent, style: { pointerEvents: markHandler ? "all" : "none" }, onPointerdown: markHandler ? (event: PointerEvent) => markHandler(props.node, event) : undefined }),
        ]);
      }

      return h(
        "g",
        sharedProps,
        [
          ...(isActiveEditingGroup
            ? [h("rect", {
              class: "canvas-group-edit-background",
              x: 0,
              y: 0,
              width: Math.max(props.node.width, 1),
              height: Math.max(props.node.height, 1),
              fill: "transparent",
              "pointer-events": "all",
              onPointerdown: props.onEditingBackgroundPointerDown
                ? (event: PointerEvent) => props.onEditingBackgroundPointerDown!(event)
                : undefined,
            })]
            : []),
          ...(isActiveEditingGroup
            ? [h("rect", {
              class: "canvas-group-edit-outline",
              x: 0,
              y: 0,
              width: Math.max(props.node.width, 1),
              height: Math.max(props.node.height, 1),
              "vector-effect": "non-scaling-stroke",
            })]
            : []),
          ...(nodeInteractive
            ? [h("rect", (() => {
              const hitBounds = getNodeSelectionBounds(props.node);
              return {
              class: "canvas-object-hit-target",
              x: hitBounds.minX,
              y: hitBounds.minY,
              width: hitBounds.width,
              height: hitBounds.height,
              fill: "transparent",
              "pointer-events": "all",
              };
            })())]
            : []),
          ...(!props.node.renderedContent && props.node.chartSpec
            ? [h("rect", {
              class: "chart-placeholder-frame",
              x: 0,
              y: 0,
              width: Math.max(props.node.width, 1),
              height: Math.max(props.node.height, 1),
              "vector-effect": "non-scaling-stroke",
              "pointer-events": "none",
            })]
            : []),
          ...props.node.children.map((child) =>
          h(NodeView, {
            key: child.id,
            node: child,
            interactive: isActiveEditingGroup,
            selected: props.selectedIds.includes(child.id),
            editingGroupPath: isEditingAncestor && editingPath[1] === child.id
              ? editingPath.slice(1)
              : [],
            selectedIds: props.selectedIds,
            onNodePointerDown: props.onNodePointerDown,
            onNodeDoubleClick: props.onNodeDoubleClick,
            onNodeContextMenu: props.onNodeContextMenu,
            onMarkPointerDown: props.onMarkPointerDown,
            onEditingBackgroundPointerDown: props.onEditingBackgroundPointerDown,
          }),
          ),
        ],
      );
    };
  },
});

export const CanvasCoordinateGuideView = defineComponent({
  name: "CanvasCoordinateGuideView",
  props: {
    node: { type: Object as PropType<CanvasNode>, required: true },
    viewZoom: { type: Number, default: 1 },
    onOriginPointerDown: {
      type: Function as PropType<(node: CanvasNode, event: PointerEvent) => void>,
      default: null,
    },
    onAxisReverse: {
      type: Function as PropType<(node: CanvasNode, axis: "x" | "y") => void>,
      default: null,
    },
    onAxisSelect: {
      type: Function as PropType<(node: CanvasNode, channel: EncodingChannel, event: PointerEvent) => void>,
      default: null,
    },
    onAxisScalePointerDown: {
      type: Function as PropType<(node: CanvasNode, axis: CoordinateChannel, event: PointerEvent) => void>,
      default: null,
    },
  },
  setup(props) {
    return () => {
      const overlay = props.node.coordinateGuide?.type === "Cartesian"
        ? cartesianCoordinateOverlay(
          props.node,
          props.viewZoom,
          props.onOriginPointerDown ?? undefined,
          props.onAxisReverse ?? undefined,
          props.onAxisSelect ?? undefined,
        )
        : h(PolarCoordinateSystem, {
          node: props.node,
          viewZoom: props.viewZoom,
          applyTransform: false,
        });
      if (!overlay) return null;
      return h(
        "g",
        {
          class: "coordinate-guide-layer",
          transform: props.node.kind === "leaf"
            ? getLeafNodeTransform(props.node)
            : getNodeTransform(props.node),
        },
        [overlay],
      );
    };
  },
});
