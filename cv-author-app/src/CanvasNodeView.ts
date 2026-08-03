import { defineComponent, h, type PropType } from "vue";
import type { CanvasNode, EncodingChannel, Point } from "./types";
import { getNodeTransform, getLeafNodeTransform } from "./canvasUtils";

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
  onAxisSelect?: (node: CanvasNode, channel: EncodingChannel) => void,
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
        onAxisSelect(node, channel);
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

function polarCoordinateOverlay(node: CanvasNode, viewZoom: number) {
  const guide = node.coordinateGuide;
  if (guide?.type !== "Polar") return null;
  const minX = node.kind === "leaf" ? node.contentMinX : 0;
  const minY = node.kind === "leaf" ? node.contentMinY : 0;
  const contentRadius = Math.max(
    guide.origin.x - minX,
    minX + node.width - guide.origin.x,
    guide.origin.y - minY,
    minY + node.height - guide.origin.y,
  );
  const padding = Math.max(8, Math.min(Math.max(node.width, node.height) * 0.035, 42));
  const radius = contentRadius + padding;
  const renderedScale = Math.max(Math.abs(node.scaleX), Math.abs(node.scaleY), 0.0001) * Math.max(viewZoom, 0.0001);
  const spokes = [0, Math.PI / 4, Math.PI / 2, Math.PI * 3 / 4].map((angle) => {
    const dx = Math.cos(angle) * radius;
    const dy = Math.sin(angle) * radius;
    return h("line", {
      class: "polar-coordinate-spoke",
      x1: guide.origin.x - dx,
      y1: guide.origin.y - dy,
      x2: guide.origin.x + dx,
      y2: guide.origin.y + dy,
      "vector-effect": "non-scaling-stroke",
    });
  });
  const rings = [1 / 3, 2 / 3, 1].map((ratio) => h("circle", {
    class: "polar-coordinate-ring",
    cx: guide.origin.x,
    cy: guide.origin.y,
    r: radius * ratio,
    "vector-effect": "non-scaling-stroke",
  }));
  return h("g", { class: "coordinate-guide coordinate-guide--polar", "pointer-events": "none" }, [
    ...rings,
    ...spokes,
    h("rect", {
      class: "polar-coordinate-origin",
      x: guide.origin.x - 5 / renderedScale,
      y: guide.origin.y - 5 / renderedScale,
      width: 10 / renderedScale,
      height: 10 / renderedScale,
      "vector-effect": "non-scaling-stroke",
    }),
  ]);
}

export const CanvasNodeView: any = defineComponent({
  name: "CanvasNodeView",
  props: {
    node: { type: Object as PropType<CanvasNode>, required: true },
    interactive: { type: Boolean, default: false },
    selected: { type: Boolean, default: false },
    onNodePointerDown: { type: Function as PropType<(node: CanvasNode, event: PointerEvent) => void>, default: null },
    onNodeContextMenu: { type: Function as PropType<(node: CanvasNode, event: MouseEvent) => void>, default: null },
    onMarkPointerDown: { type: Function as PropType<(node: CanvasNode, event: PointerEvent) => void>, default: null },
  },
  setup(props): () => any {
    return () => {
      const NodeView = CanvasNodeView;
      const markHandler = (props as any).onMarkPointerDown as ((node: CanvasNode, event: PointerEvent) => void) | null;
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
            "pointer-events": markHandler ? "none" : "all",
            style: { pointerEvents: markHandler ? "none" : "all" },
          }),
          h("g", { class: props.node.renderedContent && markHandler ? "semantic-rendered-content" : undefined, innerHTML: props.node.renderedContent ?? props.node.content, style: { pointerEvents: props.node.renderedContent && markHandler ? "all" : "none" }, onPointerdown: props.node.renderedContent && markHandler ? (event: PointerEvent) => markHandler(props.node, event) : undefined }),
        ]);
      }

      if (props.node.renderedContent) {
        return h("g", sharedProps, [
          h("rect", {
            x: 0,
            y: 0,
            width: Math.max(props.node.width, 1),
            height: Math.max(props.node.height, 1),
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
          ...props.node.children.map((child) =>
          h(NodeView, { key: child.id, node: child, interactive: false, selected: false }),
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
      type: Function as PropType<(node: CanvasNode, channel: EncodingChannel) => void>,
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
        : polarCoordinateOverlay(props.node, props.viewZoom);
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
