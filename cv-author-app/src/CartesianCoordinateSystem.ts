import { defineComponent, h, type PropType } from "vue";
import type { CanvasNode, EncodingChannel, Point } from "./types";
import { getLeafNodeTransform, getNodeTransform } from "./canvasUtils";

function arrowHead(end: Point, direction: Point, size: number) {
  const perpendicular = { x: -direction.y, y: direction.x };
  const wing = size * 0.58;
  return `M ${end.x - direction.x * size + perpendicular.x * wing} ${end.y - direction.y * size + perpendicular.y * wing} L ${end.x} ${end.y} L ${end.x - direction.x * size - perpendicular.x * wing} ${end.y - direction.y * size - perpendicular.y * wing}`;
}

export const CartesianCoordinateSystem = defineComponent({
  name: "CartesianCoordinateSystem",
  props: {
    node: { type: Object as PropType<CanvasNode>, required: true },
    viewZoom: { type: Number, default: 1 },
    onAxisSelect: { type: Function as PropType<(node: CanvasNode, channel: EncodingChannel) => void>, default: null },
    onAxisScalePointerDown: { type: Function as PropType<(node: CanvasNode, axis: "x" | "y", event: PointerEvent) => void>, default: null },
  },
  setup(props) {
    return () => {
      const guide = props.node.coordinateGuide;
      if (guide?.type !== "Cartesian") return null;
      const minX = props.node.kind === "leaf" ? props.node.contentMinX : 0;
      const minY = props.node.kind === "leaf" ? props.node.contentMinY : 0;
      const xScale = guide.xScale ?? 1;
      const yScale = guide.yScale ?? 1;
      const plot = props.node.chartSpec?.plotArea;
      const width = plot?.width ?? props.node.width * xScale;
      const height = plot?.height ?? props.node.height * yScale;
      const left = plot?.x ?? minX;
      const top = plot?.y ?? minY;
      const right = left + width;
      const bottom = top + height;
      const origin = {
        x: guide.xDirection === 1 ? left : right,
        y: guide.yDirection === -1 ? bottom : top,
      };
      const xEnd = { x: guide.xDirection === 1 ? right : left, y: origin.y };
      const yEnd = { x: origin.x, y: guide.yDirection === -1 ? top : bottom };
      const screenScale = Math.max(Math.abs(props.node.scaleX), Math.abs(props.node.scaleY), 0.0001) * Math.max(props.viewZoom, 0.0001);
      const handleRadius = 7 / screenScale;
      const arrowSize = 11 / screenScale;
      const endpoint = (axis: EncodingChannel, point: Point, direction: Point) => {
        const scaleHandlePoint = {
          x: point.x + direction.x * 18 / screenScale,
          y: point.y + direction.y * 18 / screenScale,
        };
        return h("g", { class: `cartesian-axis-endpoint cartesian-axis-endpoint--${axis}` }, [
        h("circle", {
          class: "cartesian-axis-binding-target",
          cx: point.x,
          cy: point.y,
          r: handleRadius * 1.7,
          onPointerdown: (event: PointerEvent) => {
            event.preventDefault();
            event.stopPropagation();
            props.onAxisSelect?.(props.node, axis);
          },
        }),
        h("line", {
          class: "cartesian-axis-handle-stem",
          x1: point.x,
          y1: point.y,
          x2: scaleHandlePoint.x,
          y2: scaleHandlePoint.y,
          "vector-effect": "non-scaling-stroke",
        }),
        h("circle", {
          class: "cartesian-axis-scale-handle",
          cx: scaleHandlePoint.x,
          cy: scaleHandlePoint.y,
          r: handleRadius,
          onPointerdown: (event: PointerEvent) => {
            event.preventDefault();
            event.stopPropagation();
            props.onAxisScalePointerDown?.(props.node, axis, event);
          },
        }),
        ]);
      };
      const axes = props.node.renderedContent ? [] : [
        h("line", { class: "cartesian-axis-line", x1: origin.x, y1: origin.y, x2: xEnd.x, y2: xEnd.y, "vector-effect": "non-scaling-stroke" }),
        h("path", { class: "cartesian-axis-arrow", d: arrowHead(xEnd, { x: guide.xDirection, y: 0 }, arrowSize), "vector-effect": "non-scaling-stroke" }),
        h("line", { class: "cartesian-axis-line", x1: origin.x, y1: origin.y, x2: yEnd.x, y2: yEnd.y, "vector-effect": "non-scaling-stroke" }),
        h("path", { class: "cartesian-axis-arrow", d: arrowHead(yEnd, { x: 0, y: guide.yDirection }, arrowSize), "vector-effect": "non-scaling-stroke" }),
      ];
      return h("g", {
        class: "cartesian-coordinate-system",
        transform: props.node.kind === "leaf" ? getLeafNodeTransform(props.node) : getNodeTransform(props.node),
      }, [
        ...axes,
        endpoint("x", xEnd, { x: guide.xDirection, y: 0 }),
        endpoint("y", yEnd, { x: 0, y: guide.yDirection }),
      ]);
    };
  },
});
