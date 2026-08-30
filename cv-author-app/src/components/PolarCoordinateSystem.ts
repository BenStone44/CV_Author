import { defineComponent, h, type PropType } from "vue";
import {
  getLeafNodeTransform,
  getNodeTransform,
  getPolarOccupiedGeometry,
} from "../utils/canvasUtils";
import type { CanvasNode, CoordinateChannel, Point } from "../types";
import { chartAxisVisible } from "../utils/chartAxes";

const POLAR_CONTROL_RADIUS_GAP = 4;
const POLAR_RADIAL_TICK_RATIOS = [0.25, 0.5, 0.75, 1] as const;

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
  angleControlArcPath: string;
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
  const largeArc = Math.abs(endDegrees - startDegrees) > 180 ? 1 : 0;
  const sweep = endDegrees < startDegrees ? 1 : 0;
  return `M ${start.x} ${start.y} A ${radius} ${radius} 0 ${largeArc} ${sweep} ${end.x} ${end.y}`;
}

function radialGridPath(origin: Point, radius: number, angleSpan: number) {
  if (angleSpan < 359.999) return arcPath(origin, radius, 0, -angleSpan);
  return `M ${origin.x + radius} ${origin.y} A ${radius} ${radius} 0 1 1 ${origin.x - radius} ${origin.y} A ${radius} ${radius} 0 1 1 ${origin.x + radius} ${origin.y}`;
}

export function createPolarCoordinateSystemModel(
  node: CanvasNode,
  viewZoom = 1,
  useCompositeRadius = true,
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
  const renderedScale = Math.max(
    Math.abs(node.scaleX),
    Math.abs(node.scaleY),
    0.0001,
  ) * Math.max(viewZoom, 0.0001);

  // Guide-only template nodes use the legacy control radius until a chart
  // spec exists, while their canvas hit target can still be circular.
  const occupiedGeometry = node.chartSpec ? getPolarOccupiedGeometry(node) : null;
  const compositeRadius = useCompositeRadius
    && (node.compositionSpec?.type === "layer" || node.compositionSpec?.type === "concat")
    ? node.compositionSpec.polarOuterRadius
      ?? (node.coordinateSystem?.type === "Polar" ? node.coordinateSystem.polarOuterRadius : undefined)
    : undefined;
  const chartRadius = Number.isFinite(compositeRadius) && compositeRadius! > 0
    ? compositeRadius!
    : Number.isFinite(guide.radius) && guide.radius! > 0
      ? guide.radius!
      : occupiedGeometry
        ? occupiedGeometry.outerRadius
        : (contentRadius + padding) * (guide.radiusScale ?? 1);
  const controlGap = occupiedGeometry || (Number.isFinite(guide.radius) && guide.radius! > 0)
    ? POLAR_CONTROL_RADIUS_GAP * 2
    : POLAR_CONTROL_RADIUS_GAP;
  const radius = chartRadius + controlGap / renderedScale;
  const angleSpan = normalizePolarAngleSpan(guide.angleSpan);
  const upperAngle = 360 - angleSpan;
  const radiusEnd = {
    x: guide.origin.x + radius,
    y: guide.origin.y,
  };
  const radiusControlPoint = {
    x: radiusEnd.x + 22 / renderedScale,
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
    angleControlArcPath: arcPath(guide.origin, radius, upperAngle + 15, upperAngle),
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
    useCompositeRadius: { type: Boolean, default: true },
    scaleChannels: { type: Array as PropType<CoordinateChannel[]>, default: () => ["angle", "radius"] },
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
      const model = createPolarCoordinateSystemModel(props.node, props.viewZoom, props.useCompositeRadius);
      if (!model) return null;
      const interactive = props.interactive ?? true;
      const scaleChannels = props.scaleChannels ?? ["angle", "radius"];
      const radialScaleAxis = scaleChannels.includes("radius")
        ? "radius"
        : scaleChannels.includes("ring") ? "ring" : null;
      const showRadiusControl = radialScaleAxis !== null;
      const showAngleControl = scaleChannels.includes("angle");
      const guide = props.node.coordinateGuide;
      const showThetaLine = guide?.type === "Polar" && chartAxisVisible(props.node.chartSpec, guide, "theta");
      const showRadiusLine = guide?.type === "Polar" && chartAxisVisible(props.node.chartSpec, guide, "radius");
      const beginAngleDrag = props.onAnglePointerDown
        ? (event: PointerEvent) => {
          event.preventDefault();
          event.stopPropagation();
          props.onAnglePointerDown?.(props.node, event);
        }
        : undefined;
      const radialTicks = POLAR_RADIAL_TICK_RATIOS.map((ratio) => ({
        ratio,
        radius: model.radius * ratio,
      }));
      const tickHalfLength = 3.5 / model.renderedScale;

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
          interactive ? "polar-coordinate-system--interactive" : "polar-coordinate-system--static",
        ],
        transform,
        "pointer-events": "none",
      }, [
        ...(props.showAxis && showRadiusLine ? [h("line", {
          class: "polar-coordinate-axis polar-coordinate-axis--radius",
          x1: guide!.origin.x,
          y1: guide!.origin.y,
          x2: model.radiusEnd.x,
          y2: model.radiusEnd.y,
          fill: "none",
          "vector-effect": "non-scaling-stroke",
        }), ...radialTicks.map((tick) => h("line", {
          class: "polar-coordinate-axis-tick polar-coordinate-axis-tick--radius",
          x1: guide!.origin.x + tick.radius,
          y1: guide!.origin.y - tickHalfLength,
          x2: guide!.origin.x + tick.radius,
          y2: guide!.origin.y + tickHalfLength,
          fill: "none",
          "data-radius-ratio": tick.ratio,
          "vector-effect": "non-scaling-stroke",
        }))] : []),
        ...(props.showAxis && showThetaLine ? radialTicks.map((tick) => h("path", {
          class: "polar-coordinate-grid-ring",
          d: radialGridPath(guide!.origin, tick.radius, model.angleSpan),
          fill: "none",
          "data-radius-ratio": tick.ratio,
          "vector-effect": "non-scaling-stroke",
        })) : []),
        ...(interactive && showAngleControl ? [
          h("line", {
            class: "polar-coordinate-control-ray",
            x1: guide!.origin.x,
            y1: guide!.origin.y,
            x2: model.radiusEnd.x,
            y2: model.radiusEnd.y,
          }),
          h("path", {
            class: [
              "polar-coordinate-control-arc",
              "polar-coordinate-control-arc--upper",
              beginAngleDrag ? "polar-coordinate-control-arc--interactive" : null,
            ],
            d: model.upperControlArcPath,
            onPointerdown: beginAngleDrag,
          }),
          h("path", {
            class: "polar-coordinate-control-arc polar-coordinate-control-arc--lower",
            d: model.lowerControlArcPath,
          }),
        ] : []),
        ...(interactive && showRadiusControl ? [h("line", {
          class: "polar-coordinate-radius-drag-target",
          x1: guide!.origin.x,
          y1: guide!.origin.y,
          x2: model.radiusEnd.x,
          y2: model.radiusEnd.y,
          fill: "none",
          stroke: "transparent",
          "stroke-width": 14,
          "pointer-events": "stroke",
          onPointerdown: (event: PointerEvent) => {
            event.preventDefault();
            event.stopPropagation();
            props.onAxisScalePointerDown?.(props.node, radialScaleAxis, event);
          },
        })] : []),
        ...(interactive && showAngleControl && beginAngleDrag ? [h("path", {
          class: "polar-coordinate-angle-drag-target",
          d: model.angleControlArcPath,
          fill: "none",
          stroke: "transparent",
          "stroke-width": 18,
          "pointer-events": "stroke",
          onPointerdown: beginAngleDrag,
        })] : []),
        ...(interactive && showRadiusControl ? [h("g", {
          class: "polar-coordinate-radius-control",
          transform: `translate(${model.radiusControlPoint.x} ${model.radiusControlPoint.y}) scale(${1 / model.renderedScale})`,
          "pointer-events": "all",
          role: "slider",
          "aria-label": radialScaleAxis === "ring" ? "Adjust polar ring scale" : "Adjust polar radius",
          onPointerdown: (event: PointerEvent) => {
            event.preventDefault();
            event.stopPropagation();
            props.onAxisScalePointerDown?.(props.node, radialScaleAxis, event);
          },
        }, [
          h("title", radialScaleAxis === "ring" ? "Adjust polar ring scale" : "Adjust polar radius"),
          h("circle", { class: "polar-coordinate-radius-hit-target", cx: 0, cy: 0, r: 10 }),
          h("circle", { class: "polar-coordinate-radius-handle", cx: 0, cy: 0, r: 7 }),
        ])] : []),
        ...(interactive && showAngleControl ? [h("g", {
          class: "polar-coordinate-angle-control",
          transform: `translate(${model.upperRadiusEnd.x} ${model.upperRadiusEnd.y}) scale(${1 / model.renderedScale})`,
          "pointer-events": "all",
          role: "slider",
          "aria-label": "Adjust polar angle range",
          "aria-valuemin": 1,
          "aria-valuemax": 360,
          "aria-valuenow": model.angleSpan,
          onPointerdown: beginAngleDrag,
        }, [
          h("title", `${Math.round(model.angleSpan)}°`),
          h("circle", { class: "polar-coordinate-angle-hit-target", cx: 0, cy: 0, r: 10 }),
          h("circle", { class: "polar-coordinate-angle-handle", cx: 0, cy: 0, r: 7 }),
        ]),
        ] : []),
      ]);
    };
  },
});
