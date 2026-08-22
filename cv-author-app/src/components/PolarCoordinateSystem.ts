import { defineComponent, h, type PropType } from "vue";
import { getLeafNodeTransform, getNodeTransform } from "../utils/canvasUtils";
import type { CanvasNode, CoordinateChannel, Point } from "../types";

export type PolarCoordinateSystemModel = {
  origin: Point;
  radius: number;
  angleSpan: number;
  upperAngle: number;
  radiusEnd: Point;
  radiusControlPoint: Point;
  upperRadiusEnd: Point;
  radiusLabel: Point;
  thetaLabel: Point;
  upperControlArcPath: string;
  lowerControlArcPath: string;
  renderedScale: number;
};

export function normalizePolarAngleSpan(value: number | undefined) {
  if (!Number.isFinite(value)) return 360;
  return Math.max(1, Math.min(value!, 360));
}

export function polarAngleSpanFromPoint(origin: Point, point: Point) {
  const radians = Math.atan2(origin.y - point.y, point.x - origin.x);
  const counterClockwiseDegrees = (radians * 180 / Math.PI + 360) % 360;
  return counterClockwiseDegrees < 0.001
    ? 360
    : Math.max(1, Math.min(360 - counterClockwiseDegrees, 360));
}

function pointAtAngle(origin: Point, radius: number, degrees: number): Point {
  const radians = degrees * Math.PI / 180;
  return {
    x: origin.x + Math.cos(radians) * radius,
    y: origin.y - Math.sin(radians) * radius,
  };
}

function arcPath(origin: Point, radius: number, startDegrees: number, endDegrees: number) {
  const start = pointAtAngle(origin, radius, startDegrees);
  const end = pointAtAngle(origin, radius, endDegrees);
  const sweep = endDegrees < startDegrees ? 1 : 0;
  return `M ${start.x} ${start.y} A ${radius} ${radius} 0 0 ${sweep} ${end.x} ${end.y}`;
}

export function createPolarCoordinateSystemModel(
  node: CanvasNode,
  viewZoom = 1,
): PolarCoordinateSystemModel | null {
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
  const padding = Math.max(
    8,
    Math.min(Math.max(node.width, node.height) * 0.035, 42),
  );

  const radius = (contentRadius + padding) * (guide.radiusScale ?? 1);
  const angleSpan = normalizePolarAngleSpan(guide.angleSpan);
  const upperAngle = 360 - angleSpan;
  const renderedScale = Math.max(
    Math.abs(node.scaleX),
    Math.abs(node.scaleY),
    0.0001,
  ) * Math.max(viewZoom, 0.0001);
  const radiusEnd = {
    x: guide.origin.x + radius,
    y: guide.origin.y,
  };
  const radiusControlPoint = {
    x: radiusEnd.x + 18 / renderedScale,
    y: radiusEnd.y,
  };
  const upperRadiusEnd = pointAtAngle(guide.origin, radius, upperAngle);
  const thetaLabel = pointAtAngle(guide.origin, radius + 18, angleSpan >= 359.999 ? 315 : angleSpan / 2);
  return {
    origin: guide.origin,
    radius,
    angleSpan,
    upperAngle,
    radiusEnd,
    upperRadiusEnd,
    radiusLabel: { x: guide.origin.x + radius * 0.52, y: guide.origin.y - 10 },
    thetaLabel,
    upperControlArcPath: arcPath(guide.origin, radius, upperAngle + 15, upperAngle),
    lowerControlArcPath: arcPath(guide.origin, radius, 0, -15),
    radiusControlPoint,
    renderedScale,
  };
}

export const PolarCoordinateSystem = defineComponent({
  name: "PolarCoordinateSystem",
  props: {
    node: { type: Object as PropType<CanvasNode>, required: true },
    viewZoom: { type: Number, default: 1 },
    applyTransform: { type: Boolean, default: true },
    showAxis: { type: Boolean, default: true },
    interactive: { type: Boolean, default: true },
    onAnglePointerDown: {
      type: Function as PropType<(node: CanvasNode, event: PointerEvent) => void>,
      default: null,
    },
    onAxisScalePointerDown: {
      type: Function as PropType<(node: CanvasNode, axis: CoordinateChannel, event: PointerEvent) => void>,
      default: null,
    },
  },
  setup(props) {
    return () => {
      const model = createPolarCoordinateSystemModel(props.node, props.viewZoom);
      if (!model) return null;

      const transform = props.applyTransform
        ? props.node.kind === "leaf"
          ? getLeafNodeTransform(props.node)
          : getNodeTransform(props.node)
        : undefined;

      return h("g", {
        class: [
          "coordinate-guide-layer",
          "coordinate-guide",
          "coordinate-guide--polar",
          "polar-coordinate-system",
          props.interactive ? "polar-coordinate-system--interactive" : "polar-coordinate-system--static",
        ],
        transform,
        "pointer-events": "none",
      }, [
        ...(props.showAxis ? [
          h("line", {
            class: ["polar-coordinate-radius-axis", "polar-coordinate-radius-axis--lower"],
            x1: model.origin.x,
            y1: model.origin.y,
            x2: model.radiusEnd.x,
            y2: model.radiusEnd.y,
            "vector-effect": "non-scaling-stroke",
          }),
          h("line", {
            class: ["polar-coordinate-radius-axis", "polar-coordinate-radius-axis--upper"],
            x1: model.origin.x,
            y1: model.origin.y,
            x2: model.upperRadiusEnd.x,
            y2: model.upperRadiusEnd.y,
            "vector-effect": "non-scaling-stroke",
          }),
          h("path", {
            class: ["polar-coordinate-angle-axis", "polar-coordinate-angle-axis--upper"],
            d: model.upperControlArcPath,
            "vector-effect": "non-scaling-stroke",
          }),
          h("path", {
            class: ["polar-coordinate-angle-axis", "polar-coordinate-angle-axis--lower"],
            d: model.lowerControlArcPath,
            "vector-effect": "non-scaling-stroke",
          }),
        ] : []),
        ...(props.interactive ? [h("line", {
          class: "polar-coordinate-radius-handle-stem",
          x1: model.radiusEnd.x,
          y1: model.radiusEnd.y,
          x2: model.radiusControlPoint.x,
          y2: model.radiusControlPoint.y,
          "vector-effect": "non-scaling-stroke",
        }), h("g", {
          class: "polar-coordinate-radius-control",
          transform: `translate(${model.radiusControlPoint.x} ${model.radiusControlPoint.y}) scale(${1 / model.renderedScale})`,
          "pointer-events": "all",
          role: "slider",
          "aria-label": "Adjust polar radius",
          onPointerdown: (event: PointerEvent) => {
            event.preventDefault();
            event.stopPropagation();
            props.onAxisScalePointerDown?.(props.node, "radius", event);
          },
        }, [
          h("title", "Adjust polar radius"),
          h("circle", { class: "polar-coordinate-radius-hit-target", cx: 0, cy: 0, r: 16 }),
          h("circle", { class: "polar-coordinate-radius-handle", cx: 0, cy: 0, r: 7 }),
        ])] : []),
        ...(props.interactive ? [h("g", {
          class: "polar-coordinate-angle-control",
          transform: `translate(${model.upperRadiusEnd.x} ${model.upperRadiusEnd.y}) scale(${1 / model.renderedScale})`,
          "pointer-events": "all",
          role: "slider",
          "aria-label": "Adjust polar angle range",
          "aria-valuemin": 1,
          "aria-valuemax": 360,
          "aria-valuenow": model.angleSpan,
          onPointerdown: props.onAnglePointerDown
            ? (event: PointerEvent) => {
              event.preventDefault();
              event.stopPropagation();
              props.onAnglePointerDown?.(props.node, event);
            }
            : undefined,
        }, [
          h("title", `${Math.round(model.angleSpan)}°`),
          h("circle", { class: "polar-coordinate-angle-hit-target", cx: 0, cy: 0, r: 16 }),
          h("circle", { class: "polar-coordinate-angle-handle", cx: 0, cy: 0, r: 7 }),
        ]),
        ] : []),
      ]);
    };
  },
});
