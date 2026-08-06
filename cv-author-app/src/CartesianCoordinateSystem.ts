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
    onAxisSelect: { type: Function as PropType<(node: CanvasNode, channel: EncodingChannel, event: PointerEvent) => void>, default: null },
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
      const arrowSize = 11 / screenScale;
      const endpoint = (axis: EncodingChannel, point: Point, direction: Point) => {
        const scaleHandlePoint = {
          x: point.x + direction.x * 18 / screenScale,
          y: point.y + direction.y * 18 / screenScale,
        };
        return h("g", { class: `cartesian-axis-endpoint cartesian-axis-endpoint--${axis}` }, [
        h("line", {
          class: "cartesian-axis-handle-stem",
          x1: point.x,
          y1: point.y,
          x2: scaleHandlePoint.x,
          y2: scaleHandlePoint.y,
          "vector-effect": "non-scaling-stroke",
        }),
        h("rect", {
          class: "cartesian-axis-scale-handle",
          x: scaleHandlePoint.x - 5 / screenScale,
          y: scaleHandlePoint.y - 5 / screenScale,
          width: 10 / screenScale,
          height: 10 / screenScale,
          rx: 1.5 / screenScale,
          onPointerdown: (event: PointerEvent) => {
            event.preventDefault();
            event.stopPropagation();
            props.onAxisScalePointerDown?.(props.node, axis, event);
          },
        }),
        ]);
      };
      const configControl = (axis: EncodingChannel, end: Point) => {
        const midpoint = { x: (origin.x + end.x) / 2, y: (origin.y + end.y) / 2 };
        const offset = axis === "x"
          ? { x: 0, y: guide.yDirection * 18 / screenScale }
          : { x: guide.xDirection * 18 / screenScale, y: 0 };
        return h("g", {
          class: ["cartesian-axis-config-control", `cartesian-axis-config-control--${axis}`],
          transform: `translate(${midpoint.x + offset.x} ${midpoint.y + offset.y}) scale(${1 / screenScale})`,
          role: "button",
          "aria-label": `Configure ${axis.toUpperCase()} axis`,
          onPointerdown: (event: PointerEvent) => {
            event.preventDefault();
            event.stopPropagation();
            props.onAxisSelect?.(props.node, axis, event);
          },
        }, [
          h("title", `Configure ${axis.toUpperCase()} axis`),
          h("rect", { class: "cartesian-axis-config-button", x: -12, y: -12, width: 24, height: 24, rx: 4 }),
          h("path", {
            class: "cartesian-axis-config-icon",
            d: "M -6 -5 H 6 M -6 0 H 6 M -6 5 H 6 M -2 -8 V -2 M 3 -3 V 3 M -3 2 V 8",
            "vector-effect": "non-scaling-stroke",
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
        configControl("x", xEnd),
        configControl("y", yEnd),
        endpoint("x", xEnd, { x: guide.xDirection, y: 0 }),
        endpoint("y", yEnd, { x: 0, y: guide.yDirection }),
      ]);
    };
  },
});
