import { defineComponent, h, type PropType } from "vue";
import { scaleLinear, scaleLog, scalePoint, scaleUtc } from "d3-scale";
import type {
  CanvasNode,
  ChartScaleSpec,
  EncodingChannel,
  Point,
} from "../types";
import { getLeafNodeTransform, getNodeTransform } from "../utils/canvasUtils";
import { chartAxisLabelsVisible, chartAxisVisible } from "../utils/chartAxes";
import {
  cartesianTreeDirection,
  cartesianTreeLeafAxis,
  isCartesianTreeChart,
} from "../utils/treeLayout";
import { PolarCoordinateSystem } from "./PolarCoordinateSystem";

type AxisTick = {
  position: number;
  label: string;
};

export type CartesianAxisModel = {
  left: number;
  top: number;
  right: number;
  bottom: number;
  origin: Point;
  xEnd: Point;
  yEnd: Point;
  xDirection: 1 | -1;
  yDirection: 1 | -1;
  xTicks: AxisTick[];
  yTicks: AxisTick[];
  xTitle: string;
  yTitle: string;
  fontFamily: string;
  fontSize: number;
  axisColor: string;
  textColor: string;
};

const cartesianChannels: EncodingChannel[] = ["x", "y"];

export function getCartesianAxisChannels(
  node: CanvasNode,
  mode: "static" | "interactive",
): EncodingChannel[] {
  const system = node.coordinateSystem;
  const isLayer = node.compositionSpec?.type === "layer";
  const isOwner = !system || system.ownerNodeId === node.id;
  const treeLeafAxis = isCartesianTreeChart(node.chartSpec?.chartType)
    ? cartesianTreeLeafAxis(cartesianTreeDirection(node.chartSpec))
    : null;
  if (isLayer) {
    return mode === "static" && isOwner
      ? treeLeafAxis ? [treeLeafAxis] : [...cartesianChannels]
      : [];
  }
  if (treeLeafAxis) {
    if (mode === "interactive" && node.compositionSpec?.type === "concat") {
      return node.compositionSpec.sharedChannels.includes(treeLeafAxis) ? [treeLeafAxis] : [];
    }
    return [treeLeafAxis];
  }
  // Interactive concat controls expose only channels shared by its recorded
  // links; independent member axes remain local to their charts.
  if (mode === "interactive" && node.compositionSpec?.type === "concat") {
    const shared = new Set(node.compositionSpec.sharedChannels);
    return cartesianChannels.filter((channel) => shared.has(channel));
  }
  if (mode === "interactive") return [...cartesianChannels];
  if (node.compositionSpec?.type === "concat") return [...cartesianChannels];
  const shared = new Set(system?.sharedChannels ?? []);
  return cartesianChannels.filter((channel) => !shared.has(channel) || isOwner);
}

function sampled<T>(values: T[], maximum: number) {
  if (values.length <= maximum) return values;
  const stride = (values.length - 1) / Math.max(maximum - 1, 1);
  return Array.from({ length: maximum }, (_, index) => values[Math.round(index * stride)]!);
}

function formatNumber(value: number) {
  return new Intl.NumberFormat("en-US", { maximumFractionDigits: 2 }).format(value);
}

function axisTicks(spec: ChartScaleSpec, maximum: number): AxisTick[] {
  if (spec.type === "point") {
    const domain = spec.domain as string[];
    const scale = scalePoint<string>().domain(domain).range(spec.range).padding(0.5);
    return domain.map((value) => ({
      position: scale(value) ?? 0,
      label: value,
    }));
  }
  if (spec.type === "utc") {
    const domain = (spec.domain as [string, string]).map((value) => new Date(value)) as [Date, Date];
    const scale = scaleUtc().domain(domain).range(spec.range);
    return scale.ticks(maximum).map((value) => ({
      position: scale(value),
      label: value.toISOString().slice(0, 7),
    }));
  }
  const scale = (spec.type === "log" ? scaleLog() : scaleLinear()).domain(spec.domain as [number, number]).range(spec.range);
  return scale.ticks(maximum).map((value) => ({
    position: scale(value),
    label: formatNumber(value),
  }));
}

export function createCartesianAxisModel(node: CanvasNode): CartesianAxisModel | null {
  const guide = node.coordinateGuide;
  const plot = node.chartSpec?.plotArea;
  const xScale = node.chartSpec?.scales?.x;
  const yScale = node.chartSpec?.scales?.y;
  if (guide?.type !== "Cartesian" || !plot || !xScale || !yScale) return null;

  const left = plot.x;
  const top = plot.y;
  const right = left + plot.width;
  const bottom = top + plot.height;
  const treeDirection = isCartesianTreeChart(node.chartSpec?.chartType)
    ? cartesianTreeDirection(node.chartSpec)
    : null;
  const xDirection = treeDirection === "right" ? -1 : treeDirection === "left" ? 1 : guide.xDirection;
  const yDirection = treeDirection === "up" ? 1 : treeDirection === "down" ? -1 : guide.yDirection;
  const origin = {
    x: xDirection === 1 ? left : right,
    y: yDirection === -1 ? bottom : top,
  };
  const tokens = node.chartSpec?.styleTokens;
  const renderedScale = Math.max(Math.abs(node.scaleX), Math.abs(node.scaleY), 0.0001);
  const screenFontSize = Math.max(8, Math.min(tokens?.fontSize ?? 9, 9, Math.min(node.width, node.height) * 0.04));
  const fontSize = screenFontSize / renderedScale;
  return {
    left,
    top,
    right,
    bottom,
    origin,
    xEnd: { x: xDirection === 1 ? right : left, y: origin.y },
    yEnd: { x: origin.x, y: yDirection === -1 ? top : bottom },
    xDirection,
    yDirection,
    xTicks: axisTicks(xScale, Math.max(2, Math.min(6, Math.floor(plot.width / 80)))),
    yTicks: axisTicks(yScale, Math.max(2, Math.min(6, Math.floor(plot.height / 42)))),
    // Axis titles duplicated the bound CSV column names. The encoding panel
    // remains the source of truth for those bindings, so keep the canvas axes
    // free of field-name labels.
    xTitle: "",
    yTitle: "",
    fontFamily: tokens?.fontFamily ?? "Inter, ui-sans-serif, system-ui, sans-serif",
    fontSize,
    axisColor: tokens?.axisColor ?? "#64748b",
    textColor: tokens?.textColor ?? "#334155",
  };
}

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
    channels: { type: Array as PropType<EncodingChannel[]>, default: () => ["x", "y"] },
    showAxis: { type: Boolean, default: true },
    interactive: { type: Boolean, default: false },
    applyTransform: { type: Boolean, default: true },
    bindingLabel: { type: String, default: "" },
    bindingFields: { type: Array as PropType<string[]>, default: () => [] },
    bindingAxis: { type: String as PropType<"x" | "y">, default: "y" },
    onBindingRemove: { type: Function as PropType<(nodeId: string, field: string) => void>, default: null },
  },
  setup(props) {
    return () => {
      const guide = props.node.coordinateGuide;
      if (guide?.type !== "Cartesian") return null;
      const minX = props.node.kind === "leaf" ? props.node.contentMinX : 0;
      const minY = props.node.kind === "leaf" ? props.node.contentMinY : 0;
      const model = createCartesianAxisModel(props.node);
      const left = model?.left ?? minX;
      const top = model?.top ?? minY;
      const right = model?.right ?? minX + props.node.width * (guide.xScale ?? 1);
      const bottom = model?.bottom ?? minY + props.node.height * (guide.yScale ?? 1);
      const xDirection = model?.xDirection ?? guide.xDirection;
      const yDirection = model?.yDirection ?? guide.yDirection;
      const origin = model?.origin ?? {
        x: xDirection === 1 ? left : right,
        y: yDirection === -1 ? bottom : top,
      };
      const xEnd = model?.xEnd ?? { x: xDirection === 1 ? right : left, y: origin.y };
      const yEnd = model?.yEnd ?? { x: origin.x, y: yDirection === -1 ? top : bottom };
      const screenScale = Math.max(Math.abs(props.node.scaleX), Math.abs(props.node.scaleY), 0.0001) * Math.max(props.viewZoom, 0.0001);
      const nodeScaleX = Math.max(Math.abs(props.node.scaleX), 0.0001);
      const nodeScaleY = Math.max(Math.abs(props.node.scaleY), 0.0001);
      const textScale = Math.max(nodeScaleX, nodeScaleY);
      const textTransform = (x: number, y: number) => `translate(${x} ${y}) scale(${textScale / nodeScaleX} ${textScale / nodeScaleY})`;
      const arrowSize = 11 / screenScale;
      const includes = (channel: EncodingChannel) => props.channels.includes(channel);
      const showXLine = chartAxisVisible(props.node.chartSpec, guide, "x");
      const showYLine = chartAxisVisible(props.node.chartSpec, guide, "y");
      const showDiscreteLabels = guide.showDiscreteLabels !== false;
      const showAllAxes = guide.showAllAxes !== false;
      const renderAxes = props.showAxis && showAllAxes;
      const axisNodes = [] as ReturnType<typeof h>[];

      if (renderAxes && model) {
        if (includes("y")) {
          if (showYLine) axisNodes.push(h("line", {
            class: "cartesian-axis-domain",
            x1: model.origin.x,
            y1: model.top,
            x2: model.origin.x,
            y2: model.bottom,
            stroke: model.axisColor,
            "vector-effect": "non-scaling-stroke",
          }));
          const showLabels = chartAxisLabelsVisible(props.node.chartSpec, guide, "y")
            && (props.node.chartSpec?.scales?.y?.type !== "point"
              || props.node.chartSpec?.axes?.y?.labelsVisible !== undefined
              || showDiscreteLabels);
          axisNodes.push(...model.yTicks.flatMap((tick) => {
            const tickEnd = model.origin.x + (xDirection === 1 ? -5 : 5);
            const textOffset = model.fontSize * textScale / nodeScaleX * 0.8;
            const textX = model.origin.x + (xDirection === 1 ? -textOffset : textOffset);
            return [
              ...(showYLine ? [h("line", { class: "cartesian-axis-tick", x1: model.origin.x, y1: tick.position, x2: tickEnd, y2: tick.position, stroke: model.axisColor, "vector-effect": "non-scaling-stroke" })] : []),
              ...(showLabels ? [h("text", {
                class: "cartesian-axis-tick-label",
                transform: textTransform(textX, tick.position),
                "text-anchor": xDirection === 1 ? "end" : "start",
                "dominant-baseline": "middle",
              }, tick.label)] : []),
            ];
          }));
          if (model.yTitle) axisNodes.push(h("text", {
            class: "cartesian-axis-title",
            transform: `${textTransform(model.left - model.fontSize * 4.2, (model.top + model.bottom) / 2)} rotate(-90)`,
            "text-anchor": "middle",
          }, model.yTitle));
        }
        if (includes("x")) {
          if (showXLine) axisNodes.push(h("line", {
            class: "cartesian-axis-domain",
            x1: model.left,
            y1: model.origin.y,
            x2: model.right,
            y2: model.origin.y,
            stroke: model.axisColor,
            "vector-effect": "non-scaling-stroke",
          }));
          const showLabels = chartAxisLabelsVisible(props.node.chartSpec, guide, "x")
            && (props.node.chartSpec?.scales?.x?.type !== "point"
              || props.node.chartSpec?.axes?.x?.labelsVisible !== undefined
              || showDiscreteLabels);
          axisNodes.push(...model.xTicks.flatMap((tick) => {
            const tickEnd = model.origin.y + (yDirection === -1 ? 5 : -5);
            const textOffset = model.fontSize * textScale / nodeScaleY;
            const textY = model.origin.y + (yDirection === -1 ? textOffset * 1.6 : -textOffset * 0.8);
            return [
              ...(showXLine ? [h("line", { class: "cartesian-axis-tick", x1: tick.position, y1: model.origin.y, x2: tick.position, y2: tickEnd, stroke: model.axisColor, "vector-effect": "non-scaling-stroke" })] : []),
              ...(showLabels ? [h("text", {
                class: "cartesian-axis-tick-label",
                transform: textTransform(tick.position, textY),
                "text-anchor": "middle",
              }, tick.label)] : []),
            ];
          }));
          if (model.xTitle) axisNodes.push(h("text", {
            class: "cartesian-axis-title",
            transform: textTransform((model.left + model.right) / 2, model.bottom + model.fontSize * 3.4),
            "text-anchor": "middle",
          }, model.xTitle));
        }
        const facet = props.node.compositionSpec?.type === "facet" ? props.node.compositionSpec : null;
        if (facet && showDiscreteLabels) {
          const filters = props.node.chartSpec?.filters ?? {};
          const horizontalField = facet.facetCoordinateSystem === "Polar"
            ? facet.facetThetaField
            : facet.facetGrid?.columnField ?? (facet.facetDirection !== "row" ? facet.facetField : undefined);
          const verticalField = facet.facetCoordinateSystem === "Polar"
            ? facet.facetRadiusField
            : facet.facetGrid?.rowField ?? (facet.facetDirection === "row" ? facet.facetField : undefined);
          const caption = (field: string) => filters[field] === undefined ? field : `${field}: ${filters[field]}`;
          if (horizontalField) axisNodes.push(h("text", {
            class: ["cartesian-axis-title", "facet-coordinate-axis-label", facet.facetCoordinateSystem === "Polar" ? "facet-coordinate-axis-label--theta" : "facet-coordinate-axis-label--column"],
            transform: textTransform((model.left + model.right) / 2, model.top - model.fontSize * 1.4),
            "text-anchor": "middle",
          }, caption(horizontalField)));
          if (verticalField) axisNodes.push(h("text", {
            class: ["cartesian-axis-title", "facet-coordinate-axis-label", facet.facetCoordinateSystem === "Polar" ? "facet-coordinate-axis-label--radius" : "facet-coordinate-axis-label--row"],
            transform: `${textTransform(model.left - model.fontSize * 1.8, (model.top + model.bottom) / 2)} rotate(-90)`,
            "text-anchor": "middle",
          }, caption(verticalField)));
        }
      } else if (renderAxes) {
        if (includes("x") && showXLine) axisNodes.push(
          h("line", { class: "cartesian-axis-line", x1: origin.x, y1: origin.y, x2: xEnd.x, y2: xEnd.y, "vector-effect": "non-scaling-stroke" }),
          h("path", { class: "cartesian-axis-arrow", d: arrowHead(xEnd, { x: xDirection, y: 0 }, arrowSize), "vector-effect": "non-scaling-stroke" }),
        );
        if (includes("y") && showYLine) axisNodes.push(
          h("line", { class: "cartesian-axis-line", x1: origin.x, y1: origin.y, x2: yEnd.x, y2: yEnd.y, "vector-effect": "non-scaling-stroke" }),
          h("path", { class: "cartesian-axis-arrow", d: arrowHead(yEnd, { x: 0, y: yDirection }, arrowSize), "vector-effect": "non-scaling-stroke" }),
        );
      }

      const bindingControls = props.interactive && props.bindingFields.length > 0
        ? (() => {
          const chipWidth = 138 / screenScale;
          const chipHeight = 20 / screenScale;
          const gap = 4 / screenScale;
          const labelHeight = 18 / screenScale;
          const availableHeight = Math.max((bottom - top) - labelHeight, chipHeight);
          const rowsPerColumn = Math.max(1, Math.floor(availableHeight / (chipHeight + gap)));
          const isXAxisBinding = props.bindingAxis === "x";
          const startX = isXAxisBinding
            ? left + 6 / screenScale
            : origin.x + (xDirection === 1 ? 10 / screenScale : -(chipWidth + 10 / screenScale));
          const startY = isXAxisBinding
            ? origin.y + (yDirection === -1 ? 10 / screenScale : -(labelHeight + chipHeight + 10 / screenScale))
            : top + 6 / screenScale;
          return [h("g", { class: "cartesian-axis-item-bindings" }, [
            h("text", {
              class: "cartesian-axis-item-bindings__label",
              x: startX,
              y: startY + 10 / screenScale,
              "font-size": 10 / screenScale,
            }, props.bindingLabel),
            ...props.bindingFields.map((field, index) => {
              const column = Math.floor(index / rowsPerColumn);
              const row = index % rowsPerColumn;
              const x = startX + column * (chipWidth + gap);
              const y = startY + labelHeight + row * (chipHeight + gap);
              const remove = (event: PointerEvent) => {
                event.preventDefault();
                event.stopPropagation();
                props.onBindingRemove?.(props.node.id, field);
              };
              return h("g", {
                key: field,
                class: "cartesian-axis-item-binding",
                transform: `translate(${x} ${y})`,
              }, [
                h("title", null, `${field} - remove binding`),
                h("rect", {
                  class: "cartesian-axis-item-binding__background",
                  width: chipWidth,
                  height: chipHeight,
                  rx: 4 / screenScale,
                }),
                h("text", {
                  class: "cartesian-axis-item-binding__text",
                  x: 7 / screenScale,
                  y: 13.5 / screenScale,
                  "font-size": 10 / screenScale,
                }, field.length > 18 ? `${field.slice(0, 15)}...` : field),
                h("g", {
                  class: "cartesian-axis-item-binding__remove",
                  transform: `translate(${chipWidth - 18 / screenScale} 0)`,
                  role: "button",
                  "aria-label": `Remove ${field}`,
                  onPointerdown: remove,
                }, [
                  h("rect", { width: 18 / screenScale, height: chipHeight, fill: "transparent" }),
                  h("path", {
                    d: `M ${5 / screenScale} ${6 / screenScale} L ${13 / screenScale} ${14 / screenScale} M ${13 / screenScale} ${6 / screenScale} L ${5 / screenScale} ${14 / screenScale}`,
                    "vector-effect": "non-scaling-stroke",
                  }),
                ]),
              ]);
            }),
          ])];
        })()
        : [];
      const transform = props.applyTransform
        ? props.node.kind === "leaf" ? getLeafNodeTransform(props.node) : getNodeTransform(props.node)
        : undefined;
      return h("g", {
        class: ["cartesian-coordinate-system", props.interactive ? "cartesian-coordinate-system--interactive" : "cartesian-coordinate-system--static"],
        transform,
        "font-family": model?.fontFamily,
        "font-size": model?.fontSize,
        fill: model?.textColor,
        "aria-hidden": props.interactive ? undefined : "true",
      }, [...axisNodes, ...bindingControls]);
    };
  },
});

export const CanvasCoordinateSystemLayer: any = defineComponent({
  name: "CanvasCoordinateSystemLayer",
  props: {
    node: { type: Object as PropType<CanvasNode>, required: true },
    draggingNodeId: { type: String as PropType<string | null>, default: null },
    editingCompositionId: { type: String as PropType<string | null>, default: null },
    hiddenNodeIds: { type: Object as PropType<ReadonlySet<string>>, default: () => new Set<string>() },
    allowHiddenNodeId: { type: String as PropType<string | null>, default: null },
  },
  setup(props) {
    return () => {
      const node = props.node;
      if (props.hiddenNodeIds?.has(node.id) && props.allowHiddenNodeId !== node.id) return null;
      const editingLayer = node.compositionSpec?.type === "layer"
        && props.editingCompositionId === node.compositionSpec.id;
      const channels = editingLayer
        ? [...cartesianChannels]
        : getCartesianAxisChannels(node, "static");
      if (node.coordinateGuide?.type === "Cartesian"
        && node.compositionSpec?.type === "layer"
        && channels.length === 0) return null;
      const children = node.kind === "group"
        ? node.children.map((child) => h(CanvasCoordinateSystemLayer, {
          key: child.id,
          node: child,
          draggingNodeId: props.draggingNodeId,
          editingCompositionId: props.editingCompositionId,
          hiddenNodeIds: props.hiddenNodeIds,
        }))
        : [];
      const axis = node.coordinateGuide?.type === "Cartesian" && channels.length > 0
        ? h(CartesianCoordinateSystem, {
          node,
          channels,
          showAxis: true,
          interactive: false,
          applyTransform: false,
        })
        : node.coordinateGuide?.type === "Polar"
          && (chartAxisVisible(node.chartSpec, node.coordinateGuide, "theta")
            || chartAxisVisible(node.chartSpec, node.coordinateGuide, "radius"))
          ? h(PolarCoordinateSystem, {
            node,
            showAxis: true,
            interactive: false,
            applyTransform: false,
          })
          : null;
      if (!axis && children.length === 0) return null;
      return h("g", {
        class: [
          "canvas-coordinate-system-node",
          props.draggingNodeId === node.id ? "canvas-coordinate-system-node--drag-source" : "",
        ],
        "data-coordinate-node-id": node.id,
        transform: node.kind === "leaf" ? getLeafNodeTransform(node) : getNodeTransform(node),
        "pointer-events": "none",
      }, [...(axis ? [axis] : []), ...children]);
    };
  },
});
