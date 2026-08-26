import { defineComponent, h, type PropType } from "vue";
import type { CanvasNode, CoordinateChannel, EncodingChannel, NestedRenderPlacement, Point } from "../types";
import { getCanvasObjectHitTargetBounds, getNodeTransform, getLeafNodeTransform, getPolarOccupiedGeometry } from "../utils/canvasUtils";
import { CanvasCoordinateSystemLayer } from "./CartesianCoordinateSystem";
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
  if (guide.showAllAxes === false) return null;
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
  ]);
}

type Matrix = { a: number; b: number; c: number; d: number; e: number; f: number };

const identityMatrix = (): Matrix => ({ a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 });

function multiplyMatrix(left: Matrix, right: Matrix): Matrix {
  return {
    a: left.a * right.a + left.c * right.b,
    b: left.b * right.a + left.d * right.b,
    c: left.a * right.c + left.c * right.d,
    d: left.b * right.c + left.d * right.d,
    e: left.a * right.e + left.c * right.f + left.e,
    f: left.b * right.e + left.d * right.f + left.f,
  };
}

function inverseMatrix(matrix: Matrix): Matrix | null {
  const determinant = matrix.a * matrix.d - matrix.b * matrix.c;
  if (!Number.isFinite(determinant) || Math.abs(determinant) < 1e-12) return null;
  return {
    a: matrix.d / determinant,
    b: -matrix.b / determinant,
    c: -matrix.c / determinant,
    d: matrix.a / determinant,
    e: (matrix.c * matrix.f - matrix.d * matrix.e) / determinant,
    f: (matrix.b * matrix.e - matrix.a * matrix.f) / determinant,
  };
}

function matrixTransform(matrix: Matrix) {
  return `matrix(${matrix.a} ${matrix.b} ${matrix.c} ${matrix.d} ${matrix.e} ${matrix.f})`;
}

function nodeTransformMatrix(node: CanvasNode): Matrix {
  const radians = node.rotation * Math.PI / 180;
  const cos = Math.cos(radians);
  const sin = Math.sin(radians);
  const cx = (node.kind === "leaf" ? node.contentMinX : 0) + node.width / 2;
  const cy = (node.kind === "leaf" ? node.contentMinY : 0) + node.height / 2;
  const a = cos * node.scaleX;
  const b = sin * node.scaleX;
  const c = -sin * node.scaleY;
  const d = cos * node.scaleY;
  const centerX = node.x + node.width * node.scaleX / 2;
  const centerY = node.y + node.height * node.scaleY / 2;
  return {
    a,
    b,
    c,
    d,
    e: centerX - a * cx - c * cy,
    f: centerY - b * cx - d * cy,
  };
}

function svgTransformMatrix(value: string | null): Matrix {
  if (!value) return identityMatrix();
  let result = identityMatrix();
  const commandPattern = /([a-z]+)\s*\(([^)]*)\)/gi;
  let match: RegExpExecArray | null;
  while ((match = commandPattern.exec(value))) {
    const values = match[2]?.match(/[-+]?(?:\d*\.?\d+)(?:e[-+]?\d+)?/gi)?.map(Number) ?? [];
    const command = match[1]?.toLowerCase();
    let next = identityMatrix();
    if (command === "matrix" && values.length >= 6) {
      next = { a: values[0]!, b: values[1]!, c: values[2]!, d: values[3]!, e: values[4]!, f: values[5]! };
    } else if (command === "translate" && values.length >= 1) {
      next.e = values[0]!;
      next.f = values[1] ?? 0;
    } else if (command === "scale" && values.length >= 1) {
      next.a = values[0]!;
      next.d = values[1] ?? values[0]!;
    } else if (command === "rotate" && values.length >= 1) {
      const radians = values[0]! * Math.PI / 180;
      const rotation = { a: Math.cos(radians), b: Math.sin(radians), c: -Math.sin(radians), d: Math.cos(radians), e: 0, f: 0 };
      if (values.length >= 3) {
        const cx = values[1]!;
        const cy = values[2]!;
        next = multiplyMatrix(
          multiplyMatrix({ a: 1, b: 0, c: 0, d: 1, e: cx, f: cy }, rotation),
          { a: 1, b: 0, c: 0, d: 1, e: -cx, f: -cy },
        );
      } else next = rotation;
    } else if (command === "skewx" && values.length >= 1) {
      next.c = Math.tan(values[0]! * Math.PI / 180);
    } else if (command === "skewy" && values.length >= 1) {
      next.b = Math.tan(values[0]! * Math.PI / 180);
    }
    result = multiplyMatrix(result, next);
  }
  return result;
}

const parsedMarkupCache = new Map<string, SVGSVGElement | null>();
const parsedMarkupMarksCache = new WeakMap<SVGSVGElement, SVGGraphicsElement[]>();

function parseSvgMarkup(markup: string) {
  if (parsedMarkupCache.has(markup)) return parsedMarkupCache.get(markup) ?? null;
  if (parsedMarkupCache.size >= 64) parsedMarkupCache.clear();
  if (typeof DOMParser === "undefined") return null;
  const document = new DOMParser().parseFromString(
    `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink">${markup}</svg>`,
    "image/svg+xml",
  );
  const root = document.querySelector("parsererror") ? null : document.documentElement as unknown as SVGSVGElement;
  parsedMarkupCache.set(markup, root);
  return root;
}

function parsedMarkupMarks(root: SVGSVGElement) {
  const cached = parsedMarkupMarksCache.get(root);
  if (cached) return cached;
  const marks = Array.from(root.querySelectorAll<SVGGraphicsElement>("[data-mark-role]"));
  parsedMarkupMarksCache.set(root, marks);
  return marks;
}

const nestedPlacementsByParentCache = new WeakMap<readonly NestedRenderPlacement[], Map<string, NestedRenderPlacement[]>>();

function placementsByParent(placements: readonly NestedRenderPlacement[]) {
  const cached = nestedPlacementsByParentCache.get(placements);
  if (cached) return cached;
  const grouped = new Map<string, NestedRenderPlacement[]>();
  placements.forEach((placement) => {
    const current = grouped.get(placement.parentChartId) ?? [];
    current.push(placement);
    grouped.set(placement.parentChartId, current);
  });
  nestedPlacementsByParentCache.set(placements, grouped);
  return grouped;
}

function markMatchesPlacement(element: Element, placement: NestedRenderPlacement, fallbackIndex: number) {
  if (!placement.parentDataKey) return true;
  try {
    const identity = JSON.parse(placement.parentDataKey) as {
      rowKey?: string;
      categoryKey?: string;
      seriesKey?: string;
      role?: string;
      fallbackIndex?: number;
    };
    return (identity.rowKey === undefined || element.getAttribute("data-row-key") === identity.rowKey)
      && (identity.categoryKey === undefined || element.getAttribute("data-category-key") === identity.categoryKey)
      && (identity.seriesKey === undefined || element.getAttribute("data-series-key") === identity.seriesKey)
      && (identity.role === undefined || element.getAttribute("data-mark-role") === identity.role)
      && (identity.fallbackIndex === undefined || fallbackIndex === identity.fallbackIndex);
  } catch {
    return [
      element.getAttribute("data-row-key"),
      element.getAttribute("data-category-key"),
      element.getAttribute("data-series-key"),
    ].includes(placement.parentDataKey);
  }
}

export const CanvasNodeView: any = defineComponent({
  name: "CanvasNodeView",
  props: {
    node: { type: Object as PropType<CanvasNode>, required: true },
    interactive: { type: Boolean, default: false },
    selected: { type: Boolean, default: false },
    editingGroupPath: { type: Array as PropType<string[]>, default: () => [] },
    editingChartId: { type: String as PropType<string | null>, default: null },
    draggingNodeId: { type: String as PropType<string | null>, default: null },
    selectedIds: { type: Array as PropType<string[]>, default: () => [] },
    nestedPlacements: { type: Array as PropType<NestedRenderPlacement[]>, default: () => [] },
    nestedRenderedChildIds: { type: Object as PropType<ReadonlySet<string>>, default: () => new Set<string>() },
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
          props.node.layerKind === "deckgl" ? "canvas-object--deckgl-layer" : "",
          nodeInteractive ? "canvas-object--interactive" : "",
          isActiveEditingGroup ? "canvas-object--editing-group" : "",
          props.selected ? "canvas-object--selected" : "",
          props.draggingNodeId === props.node.id ? "canvas-object--composition-drag-source" : "",
        ],
        "data-node-id": props.node.id,
        "data-layer-kind": props.node.layerKind,
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
      const nodePlacements = placementsByParent(props.nestedPlacements).get(props.node.id) ?? [];
      const renderNestedChild = (placement: NestedRenderPlacement, ancestorMatrix: Matrix) => {
        const inverseAncestor = inverseMatrix(ancestorMatrix);
        const inverseParent = inverseMatrix(nodeTransformMatrix(props.node));
        if (!inverseAncestor || !inverseParent) return null;
        const child = placement.child;
        // Paint inside the parent mark's layer while keeping the child's model-space frame.
        return h("g", {
          key: `nested-placement:${placement.relationshipId}`,
          class: "nested-render-placement",
          transform: matrixTransform(multiplyMatrix(inverseAncestor, inverseParent)),
        }, [
          h(NodeView, {
            key: child.id,
            node: child,
            interactive: props.interactive,
            selected: props.selectedIds.includes(child.id),
            editingGroupPath: props.editingGroupPath,
            editingChartId: props.editingChartId,
            draggingNodeId: props.draggingNodeId,
            selectedIds: props.selectedIds,
            nestedPlacements: props.nestedPlacements,
            nestedRenderedChildIds: props.nestedRenderedChildIds,
            onNodePointerDown: props.onNodePointerDown,
            onNodeDoubleClick: props.onNodeDoubleClick,
            onNodeContextMenu: props.onNodeContextMenu,
            onMarkPointerDown: props.onMarkPointerDown,
            onEditingBackgroundPointerDown: props.onEditingBackgroundPointerDown,
          }),
          h(CanvasCoordinateSystemLayer, {
            key: `coordinate-system-${child.id}`,
            node: child,
            draggingNodeId: props.draggingNodeId,
            hiddenNodeIds: props.nestedRenderedChildIds,
            allowHiddenNodeId: child.id,
          }),
        ]);
      };
      const renderNestedMarkup = (markup: string) => {
        const root = parseSvgMarkup(markup);
        if (!root) return null;
        const anchors = new Map<Element, NestedRenderPlacement[]>();
        const suppressedParentMarks = new Set<Element>();
        const unmatched = new Set(nodePlacements);
        const marks = parsedMarkupMarks(root);
        const marksByGroup = new Map<string, SVGGraphicsElement[]>();
        marks.forEach((mark) => {
          const groupId = mark.getAttribute("data-mark-group-id") ?? "";
          const group = marksByGroup.get(groupId) ?? [];
          group.push(mark);
          marksByGroup.set(groupId, group);
        });
        nodePlacements.forEach((placement) => {
          const groupMarks = placement.parentMarkGroupId
            ? marksByGroup.get(placement.parentMarkGroupId) ?? []
            : marks;
          const matchingMarks = groupMarks.filter((element, index) => {
            const role = element.getAttribute("data-mark-role");
            const roleIndex = groupMarks.slice(0, index)
              .filter((candidate) => candidate.getAttribute("data-mark-role") === role).length;
            return markMatchesPlacement(element, placement, roleIndex);
          });
          const anchor = matchingMarks.at(-1) ?? groupMarks.at(-1);
          if (!anchor) return;
          if (!placement.retainParent) {
            matchingMarks.forEach((element) => {
              suppressedParentMarks.add(element);
            });
          }
          anchors.set(anchor, [...(anchors.get(anchor) ?? []), placement]);
          unmatched.delete(placement);
        });

        const renderElement = (element: Element, path: string, ancestorMatrix: Matrix): any => {
          const attributes: Record<string, string> = {};
          Array.from(element.attributes).forEach((attribute) => { attributes[attribute.name] = attribute.value; });
          attributes.key = path;
          if (suppressedParentMarks.has(element)) {
            attributes.style = `${attributes.style ?? ""};visibility:hidden !important;pointer-events:none !important;`;
            attributes["aria-hidden"] = "true";
          }
          const elementMatrix = multiplyMatrix(ancestorMatrix, svgTransformMatrix(element.getAttribute("transform")));
          const children: any[] = [];
          Array.from(element.childNodes).forEach((childNode, index) => {
            if (childNode.nodeType === 1) {
              const childElement = childNode as Element;
              children.push(renderElement(childElement, `${path}.${index}`, elementMatrix));
              (anchors.get(childElement) ?? []).forEach((placement) => {
                const nestedChild = renderNestedChild(placement, elementMatrix);
                if (nestedChild) children.push(nestedChild);
              });
            } else if (childNode.nodeType === 3 && childNode.nodeValue) {
              children.push(childNode.nodeValue);
            }
          });
          return h(element.tagName, attributes, children);
        };

        const content: any[] = [];
        Array.from(root.childNodes).forEach((childNode, index) => {
          if (childNode.nodeType === 1) {
            const childElement = childNode as Element;
            content.push(renderElement(childElement, `svg.${index}`, identityMatrix()));
            (anchors.get(childElement) ?? []).forEach((placement) => {
              const nestedChild = renderNestedChild(placement, identityMatrix());
              if (nestedChild) content.push(nestedChild);
            });
          } else if (childNode.nodeType === 3 && childNode.nodeValue) {
            content.push(childNode.nodeValue);
          }
        });
        unmatched.forEach((placement) => {
          const nestedChild = renderNestedChild(placement, identityMatrix());
          if (nestedChild) content.push(nestedChild);
        });
        return content;
      };
      const renderContent = (content: string, hasInteractiveMarks: boolean) => {
        const contentProps = {
          class: hasInteractiveMarks ? "semantic-rendered-content" : undefined,
          style: { pointerEvents: hasInteractiveMarks ? "all" : "none" },
          onPointerdown: hasInteractiveMarks
            ? (event: PointerEvent) => markHandler!(props.node, event)
            : undefined,
        };
        const nestedContent = props.node.renderedContent && nodePlacements.length > 0
          ? renderNestedMarkup(props.node.renderedContent)
          : null;
        if (nestedContent) return h("g", contentProps, nestedContent);
        if (props.node.renderedContent && nodePlacements.length > 0) {
          return h("g", contentProps, [
            h("g", { innerHTML: content }),
            ...nodePlacements.flatMap((placement) =>
              renderNestedChild(placement, identityMatrix()) ?? []),
          ]);
        }
        return h("g", { ...contentProps, innerHTML: content });
      };
      const hitTarget = (hasInteractiveMarks = false) => {
        const pointerEvents = hasInteractiveMarks ? "none" : "all";
        const polarGeometry = getPolarOccupiedGeometry(props.node);
        if (polarGeometry) {
          return h("path", {
            d: polarGeometry.path,
            fill: "transparent",
            "fill-rule": "evenodd",
            class: "canvas-object-hit-target",
            "data-hit-target-shape": "polar",
            "pointer-events": pointerEvents,
            style: { pointerEvents },
          });
        }
        const hitBounds = getCanvasObjectHitTargetBounds(props.node);
        return h("rect", {
          x: hitBounds.minX,
          y: hitBounds.minY,
          width: hitBounds.width,
          height: hitBounds.height,
          fill: "transparent",
          class: "canvas-object-hit-target",
          "data-hit-target-shape": "rect",
          "pointer-events": pointerEvents,
          style: { pointerEvents },
        });
      };

      if (props.node.kind === "leaf") {
        const hasInteractiveMarks = !!props.node.renderedContent
          && props.editingChartId === props.node.id
          && !!markHandler;
        const isChartPlaceholder = !!props.node.chartSpec && !props.node.renderedContent;
        const isDeckglLayer = props.node.layerKind === "deckgl";
        return h("g", { ...sharedProps }, [
          // Keep a stable hit area for thin strokes and hollow SVG shapes.
          ...(!isDeckglLayer ? [hitTarget(hasInteractiveMarks)] : []),
          ...(isChartPlaceholder ? [h("rect", {
            class: "chart-placeholder-frame",
            x: props.node.contentMinX,
            y: props.node.contentMinY,
            width: Math.max(props.node.width, 1),
            height: Math.max(props.node.height, 1),
            "vector-effect": "non-scaling-stroke",
            "pointer-events": "none",
          })] : []),
          ...(props.node.layerKind === "deckgl"
            ? []
            : [renderContent(props.node.renderedContent ?? props.node.content, hasInteractiveMarks)]),
        ]);
      }

      if (props.node.renderedContent && !isEditingAncestor) {
        const hasInteractiveMarks = props.editingChartId === props.node.id && !!markHandler;
        return h("g", sharedProps, [
          hitTarget(hasInteractiveMarks),
          renderContent(props.node.renderedContent, hasInteractiveMarks),
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
            ? [hitTarget()]
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
          ...props.node.children
            .filter((child) => !props.nestedRenderedChildIds.has(child.id))
            .map((child) =>
              h(NodeView, {
                key: child.id,
                node: child,
                interactive: isActiveEditingGroup,
                selected: props.selectedIds.includes(child.id),
                editingGroupPath: isEditingAncestor && editingPath[1] === child.id
                  ? editingPath.slice(1)
                  : [],
                editingChartId: props.editingChartId,
                draggingNodeId: props.draggingNodeId,
                selectedIds: props.selectedIds,
                nestedPlacements: props.nestedPlacements,
                nestedRenderedChildIds: props.nestedRenderedChildIds,
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
