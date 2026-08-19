import type {
  SvgCandidate,
  Bounds,
  Point,
  ParsedSvgLeafTemplateNode,
  ParsedSvgGroupTemplateNode,
  ParsedSvgTemplateNode,
  ParsedSvgTemplate,
  FlattenedSvgLeaf,
  ElementOrientation,
} from "../types";
import {
  previewSrcByName,
  rawSvgSourceByName,
  templateCatalog,
} from "virtual:chart-assets";

const rawSvgLoaders = Object.fromEntries(
  Object.values(rawSvgSourceByName).map(({ id, loader }) => [id, loader]),
);

export const collator = new Intl.Collator("en", {
  numeric: true,
  sensitivity: "base",
});
const templateCache = new Map<string, Promise<ParsedSvgTemplate>>();
const svgIdLookupCache = new WeakMap<SVGSVGElement, Map<string, Element>>();
const clipBoundsCache = new WeakMap<SVGGraphicsElement, Map<string, Bounds | null>>();
const SVG_NS = "http://www.w3.org/2000/svg";
const ignoredSvgTags = new Set([
  "defs",
  "style",
  "script",
  "metadata",
  "title",
  "desc",
]);
const nonRenderableContextTags = new Set([
  "clippath",
  "mask",
  "marker",
  "pattern",
  "lineargradient",
  "radialgradient",
  "filter",
  "symbol",
]);
const definitionSvgTags = new Set([
  "defs",
  "style",
  ...nonRenderableContextTags,
]);
const terminalSvgTags = new Set([
  "path",
  "rect",
  "circle",
  "ellipse",
  "line",
  "polyline",
  "polygon",
  "text",
  "image",
  "use",
  "foreignObject",
]);
const alwaysVisibleSvgTags = new Set(["image", "use", "foreignObject"]);
const flattenedSvgStyleProperties = [
  "clip-path",
  "color",
  "display",
  "dominant-baseline",
  "fill",
  "fill-opacity",
  "fill-rule",
  "filter",
  "font-family",
  "font-size",
  "font-stretch",
  "font-style",
  "font-variant",
  "font-weight",
  "image-rendering",
  "letter-spacing",
  "marker-end",
  "marker-mid",
  "marker-start",
  "mask",
  "mix-blend-mode",
  "opacity",
  "paint-order",
  "shape-rendering",
  "stop-color",
  "stop-opacity",
  "stroke",
  "stroke-dasharray",
  "stroke-dashoffset",
  "stroke-linecap",
  "stroke-linejoin",
  "stroke-miterlimit",
  "stroke-opacity",
  "stroke-width",
  "text-anchor",
  "text-decoration",
  "text-rendering",
  "vector-effect",
  "visibility",
  "word-spacing",
  "writing-mode",
];

export function toFileName(path: string) {
  return (
    path
      .split("/")
      .pop()
      ?.replace(/\.(?:png|svg|webp)$/i, "") ?? path
  );
}

function parseDimension(value: string | null) {
  if (!value) return Number.NaN;
  const match = value.match(/-?\d*\.?\d+/);
  return match ? Number(match[0]) : Number.NaN;
}

function parseViewBox(viewBox: string | null) {
  if (!viewBox) return null;
  const values = viewBox
    .trim()
    .split(/[\s,]+/)
    .map((value) => Number(value));
  if (values.length !== 4 || values.some((value) => !Number.isFinite(value))) {
    return null;
  }
  return { minX: values[0], minY: values[1], width: values[2], height: values[3] };
}

export function parseSvgTemplate(markup: string): ParsedSvgTemplate {
  const parser = new DOMParser();
  const document = parser.parseFromString(markup, "image/svg+xml");
  const svg = document.documentElement as unknown as SVGSVGElement;
  const parsedViewBox = parseViewBox(svg.getAttribute("viewBox"));
  const fallbackWidth = parseDimension(svg.getAttribute("width"));
  const fallbackHeight = parseDimension(svg.getAttribute("height"));
  const width = parsedViewBox?.width ?? fallbackWidth ?? 0;
  const height = parsedViewBox?.height ?? fallbackHeight ?? 0;
  const safeWidth = Number.isFinite(width) && width > 0 ? width : 200;
  const safeHeight = Number.isFinite(height) && height > 0 ? height : 180;
  const viewBox =
    svg.getAttribute("viewBox") ??
    `${parsedViewBox?.minX ?? 0} ${parsedViewBox?.minY ?? 0} ${safeWidth} ${safeHeight}`;
  return {
    viewBox,
    width: safeWidth,
    height: safeHeight,
    minX: parsedViewBox?.minX ?? 0,
    minY: parsedViewBox?.minY ?? 0,
    nodes: extractSvgElements(markup, svg, viewBox, {
      minX: parsedViewBox?.minX ?? 0,
      minY: parsedViewBox?.minY ?? 0,
      width: safeWidth,
      height: safeHeight,
    }),
  };
}

function serializeSvgNode(node: Node) {
  return new XMLSerializer().serializeToString(node);
}

function collectDefinitionMarkup(svg: SVGSVGElement) {
  return Array.from(svg.querySelectorAll("*"))
    .filter((element) => {
      if (!definitionSvgTags.has(element.tagName.toLowerCase())) return false;
      let ancestor: Element | null = element.parentElement;
      while (ancestor && ancestor !== svg) {
        if (definitionSvgTags.has(ancestor.tagName.toLowerCase())) return false;
        ancestor = ancestor.parentElement;
      }
      return true;
    })
    .map((element) => serializeSvgNode(element))
    .join("");
}

function formatSvgNumber(value: number) {
  if (!Number.isFinite(value)) return "0";
  return Number(value.toFixed(6)).toString();
}

function formatSvgMatrix(matrix: DOMMatrix) {
  return `matrix(${[
    formatSvgNumber(matrix.a),
    formatSvgNumber(matrix.b),
    formatSvgNumber(matrix.c),
    formatSvgNumber(matrix.d),
    formatSvgNumber(matrix.e),
    formatSvgNumber(matrix.f),
  ].join(" ")})`;
}

function hasVisibleSvgPaint(element: SVGGraphicsElement, style: CSSStyleDeclaration) {
  const tagName = element.tagName.toLowerCase();
  if (alwaysVisibleSvgTags.has(tagName)) return true;
  const strokeWidth = parseDimension(style.strokeWidth);
  const hasStroke =
    isVisiblePaint(style.stroke, style.strokeOpacity) &&
    (!Number.isFinite(strokeWidth) || strokeWidth > 0);
  const hasFill = isVisiblePaint(style.fill, style.fillOpacity);
  const hasMarkers =
    style.markerStart !== "none" ||
    style.markerMid !== "none" ||
    style.markerEnd !== "none";
  return hasStroke || hasFill || hasMarkers;
}

function isVisiblePaint(paint: string, opacity: string) {
  const normalizedPaint = paint.trim().toLowerCase();
  const numericOpacity = Number.parseFloat(opacity);
  if (
    normalizedPaint === "none" ||
    normalizedPaint === "transparent" ||
    (Number.isFinite(numericOpacity) && numericOpacity <= 0)
  ) {
    return false;
  }
  const alphaMatch = normalizedPaint.match(/rgba?\([^)]*[,/]\s*(\d*\.?\d+%?)\s*\)$/);
  return !alphaMatch?.[1] || Number.parseFloat(alphaMatch[1]) > 0;
}

function transformSvgPoint(matrix: DOMMatrix | SVGMatrix, x: number, y: number): Point {
  return {
    x: matrix.a * x + matrix.c * y + matrix.e,
    y: matrix.b * x + matrix.d * y + matrix.f,
  };
}

function toDomMatrix(matrix: DOMMatrix | SVGMatrix) {
  return new DOMMatrix([matrix.a, matrix.b, matrix.c, matrix.d, matrix.e, matrix.f]);
}

function mergeBounds(current: Bounds | null, next: Bounds): Bounds {
  if (!current) return next;
  const minX = Math.min(current.minX, next.minX);
  const minY = Math.min(current.minY, next.minY);
  const maxX = Math.max(current.maxX, next.maxX);
  const maxY = Math.max(current.maxY, next.maxY);
  return { minX, minY, maxX, maxY, width: maxX - minX, height: maxY - minY };
}

function boundsFromTransformedBox(
  box: { x: number; y: number; width: number; height: number },
  matrix: DOMMatrix,
): Bounds {
  const corners = [
    transformSvgPoint(matrix, box.x, box.y),
    transformSvgPoint(matrix, box.x, box.y + box.height),
    transformSvgPoint(matrix, box.x + box.width, box.y),
    transformSvgPoint(matrix, box.x + box.width, box.y + box.height),
  ];
  const minX = Math.min(...corners.map((point) => point.x));
  const minY = Math.min(...corners.map((point) => point.y));
  const maxX = Math.max(...corners.map((point) => point.x));
  const maxY = Math.max(...corners.map((point) => point.y));
  return { minX, minY, maxX, maxY, width: maxX - minX, height: maxY - minY };
}

function intersectBounds(first: Bounds, second: Bounds): Bounds | null {
  const minX = Math.max(first.minX, second.minX);
  const minY = Math.max(first.minY, second.minY);
  const maxX = Math.min(first.maxX, second.maxX);
  const maxY = Math.min(first.maxY, second.maxY);
  if (maxX < minX || maxY < minY) return null;
  return { minX, minY, maxX, maxY, width: maxX - minX, height: maxY - minY };
}

function getClipPathId(value: string) {
  const match = value.match(/url\(["']?[^#)]*#([^"')\s]+)["']?\)/i);
  return match?.[1] ? decodeURIComponent(match[1]) : null;
}

function getSvgElementById(rootSvg: SVGSVGElement, id: string) {
  let lookup = svgIdLookupCache.get(rootSvg);
  if (!lookup) {
    lookup = new Map(
      Array.from(rootSvg.querySelectorAll("[id]"))
        .map((candidate) => [candidate.getAttribute("id"), candidate] as const)
        .filter((entry): entry is [string, Element] => !!entry[0]),
    );
    svgIdLookupCache.set(rootSvg, lookup);
  }
  return lookup.get(id) ?? null;
}

function measureClipPathBounds(
  rootSvg: SVGSVGElement,
  owner: SVGGraphicsElement,
  clipPath: SVGElement,
): Bounds | null {
  const rootMatrix = rootSvg.getCTM();
  const ownerMatrix = owner.getCTM();
  if (!rootMatrix || !ownerMatrix) return null;

  let coordinateMatrix = toDomMatrix(rootMatrix).inverse().multiply(toDomMatrix(ownerMatrix));
  if (clipPath.getAttribute("clipPathUnits")?.toLowerCase() === "objectboundingbox") {
    const ownerBounds = owner.getBBox();
    if (ownerBounds.width <= 0 || ownerBounds.height <= 0) return null;
    coordinateMatrix = coordinateMatrix
      .translate(ownerBounds.x, ownerBounds.y)
      .scale(ownerBounds.width, ownerBounds.height);
  }

  let definitionContext: Element | null = clipPath.parentElement;
  while (
    definitionContext &&
    definitionContext !== rootSvg &&
    !(definitionContext instanceof SVGGraphicsElement)
  ) {
    definitionContext = definitionContext.parentElement;
  }
  const contextMatrix = definitionContext instanceof SVGGraphicsElement
    ? definitionContext.getCTM()
    : rootMatrix;
  if (!contextMatrix) return null;

  let result: Bounds | null = null;
  Array.from(clipPath.querySelectorAll("*"))
    .filter((candidate): candidate is SVGGraphicsElement =>
      candidate instanceof SVGGraphicsElement &&
      terminalSvgTags.has(candidate.tagName.toLowerCase()))
    .forEach((candidate) => {
      try {
        if (window.getComputedStyle(candidate).display === "none") return;
        const candidateMatrix = candidate.getCTM();
        if (!candidateMatrix) return;
        const definitionMatrix = toDomMatrix(contextMatrix)
          .inverse()
          .multiply(toDomMatrix(candidateMatrix));
        result = mergeBounds(
          result,
          boundsFromTransformedBox(candidate.getBBox(), coordinateMatrix.multiply(definitionMatrix)),
        );
      } catch {
        // A malformed clip shape should not discard otherwise measurable content.
      }
    });
  return result;
}

function clipRenderableBounds(
  rootSvg: SVGSVGElement,
  element: SVGGraphicsElement,
  initialBounds: Bounds,
) {
  let result: Bounds | null = initialBounds;
  let owner: Element | null = element;
  while (result && owner && owner !== rootSvg) {
    if (owner instanceof SVGGraphicsElement) {
      const clipPathId = getClipPathId(window.getComputedStyle(owner).clipPath);
      const clipPath = clipPathId ? getSvgElementById(rootSvg, clipPathId) : null;
      if (clipPath instanceof SVGElement && clipPath.tagName.toLowerCase() === "clippath") {
        let ownerCache = clipBoundsCache.get(owner);
        if (!ownerCache) {
          ownerCache = new Map();
          clipBoundsCache.set(owner, ownerCache);
        }
        if (!ownerCache.has(clipPathId!)) {
          ownerCache.set(clipPathId!, measureClipPathBounds(rootSvg, owner, clipPath));
        }
        const clipBounds = ownerCache.get(clipPathId!) ?? null;
        if (clipBounds) result = intersectBounds(result, clipBounds);
      }
    }
    owner = owner.parentElement;
  }
  return result;
}

function getRenderableSvgBounds(rootSvg: SVGSVGElement, element: SVGGraphicsElement): Bounds | null {
  const style = window.getComputedStyle(element);
  if (
    style.display === "none" ||
    style.visibility === "hidden" ||
    (Number.isFinite(Number(style.opacity)) && Number(style.opacity) <= 0) ||
    !hasVisibleSvgPaint(element, style)
  ) {
    return null;
  }
  try {
    const rawBounds = element.getBBox();
    const matrix = element.getCTM();
    const rootMatrix = rootSvg.getCTM();
    if (!matrix || !rootMatrix) return null;
    const localMatrix = toDomMatrix(rootMatrix).inverse().multiply(toDomMatrix(matrix));
    const bounds = boundsFromTransformedBox(rawBounds, localMatrix);
    const strokeWidth = parseDimension(style.strokeWidth);
    if (
      isVisiblePaint(style.stroke, style.strokeOpacity) &&
      Number.isFinite(strokeWidth) &&
      strokeWidth > 0
    ) {
      const strokeMatrix = style.vectorEffect === "non-scaling-stroke"
        ? toDomMatrix(rootMatrix).inverse()
        : localMatrix;
      const halfStroke = strokeWidth / 2;
      const paddingX = halfStroke * Math.hypot(strokeMatrix.a, strokeMatrix.c);
      const paddingY = halfStroke * Math.hypot(strokeMatrix.b, strokeMatrix.d);
      bounds.minX -= paddingX;
      bounds.maxX += paddingX;
      bounds.minY -= paddingY;
      bounds.maxY += paddingY;
      bounds.width = bounds.maxX - bounds.minX;
      bounds.height = bounds.maxY - bounds.minY;
    }
    const clippedBounds = clipRenderableBounds(rootSvg, element, bounds);
    if (!clippedBounds) return null;
    if (clippedBounds.width < 0.25 && clippedBounds.height < 0.25) return null;
    return clippedBounds;
  } catch {
    return null;
  }
}

function buildWholeSvgElement(svg: SVGSVGElement, viewBox: string): ParsedSvgLeafTemplateNode[] {
  const parsedViewBox = parseViewBox(viewBox);
  const width = parsedViewBox?.width ?? parseDimension(svg.getAttribute("width"));
  const height = parsedViewBox?.height ?? parseDimension(svg.getAttribute("height"));
  const safeWidth = Number.isFinite(width) && width > 0 ? width : 200;
  const safeHeight = Number.isFinite(height) && height > 0 ? height : 180;
  return [{
    kind: "leaf",
    content: svg.innerHTML,
    viewBox,
    bounds: {
      minX: parsedViewBox?.minX ?? 0,
      minY: parsedViewBox?.minY ?? 0,
      maxX: (parsedViewBox?.minX ?? 0) + safeWidth,
      maxY: (parsedViewBox?.minY ?? 0) + safeHeight,
      width: safeWidth,
      height: safeHeight,
    },
    contentMinX: parsedViewBox?.minX ?? 0,
    contentMinY: parsedViewBox?.minY ?? 0,
  }];
}

function createMeasurementSvg(markup: string, viewBox: string, width: number, height: number) {
  const parser = new DOMParser();
  const document = parser.parseFromString(markup, "image/svg+xml");
  const measurementSvg = window.document.importNode(document.documentElement, true) as unknown as SVGSVGElement;
  measurementSvg.setAttribute("xmlns", SVG_NS);
  measurementSvg.setAttribute("viewBox", viewBox);
  measurementSvg.setAttribute("width", `${width}`);
  measurementSvg.setAttribute("height", `${height}`);
  measurementSvg.style.position = "absolute";
  measurementSvg.style.left = "-100000px";
  measurementSvg.style.top = "-100000px";
  measurementSvg.style.pointerEvents = "none";
  measurementSvg.style.overflow = "visible";
  measurementSvg.style.zIndex = "-1";
  measurementSvg.querySelectorAll("script").forEach((s) => s.remove());
  window.document.body.appendChild(measurementSvg);
  return measurementSvg;
}

function applyFlattenedSvgStyle(source: Element, target: SVGElement) {
  const computedStyle = window.getComputedStyle(source);
  const declarations = flattenedSvgStyleProperties
    .map((property) => {
      const value = computedStyle.getPropertyValue(property).trim();
      return value.length > 0 ? `${property}:${value}` : "";
    })
    .filter((d) => d.length > 0);
  if (declarations.length > 0) {
    target.setAttribute("style", declarations.join("; "));
  } else {
    target.removeAttribute("style");
  }
}

function applyFlattenedSvgStyles(source: SVGElement, target: SVGElement) {
  const sourceElements = [source, ...Array.from(source.querySelectorAll("*"))];
  const targetElements = [target, ...Array.from(target.querySelectorAll("*"))];
  sourceElements.forEach((sourceElement, index) => {
    const targetElement = targetElements[index];
    if (targetElement instanceof SVGElement) {
      applyFlattenedSvgStyle(sourceElement, targetElement);
    }
  });
}

function isHiddenBySvgAncestor(element: Element, rootSvg: SVGSVGElement) {
  let ancestor: Element | null = element.parentElement;
  while (ancestor && ancestor !== rootSvg) {
    const style = window.getComputedStyle(ancestor);
    const opacity = Number(style.opacity);
    if (
      style.display === "none" ||
      style.visibility === "hidden" ||
      (Number.isFinite(opacity) && opacity <= 0)
    ) {
      return true;
    }
    ancestor = ancestor.parentElement;
  }
  return false;
}

function applyFlattenedGroupEffects(target: SVGElement, groupAncestors: SVGElement[]) {
  const targetOpacity = Number.parseFloat(target.style.opacity);
  const opacity = groupAncestors.reduce(
    (value, group) => {
      const groupOpacity = Number(window.getComputedStyle(group).opacity);
      return Number.isFinite(groupOpacity) ? value * groupOpacity : value;
    },
    Number.isFinite(targetOpacity) ? targetOpacity : 1,
  );
  if (opacity !== 1) target.style.opacity = formatSvgNumber(opacity);
  for (const property of ["clip-path", "filter", "mask", "mix-blend-mode"]) {
    for (let i = groupAncestors.length - 1; i >= 0; i -= 1) {
      const group = groupAncestors[i];
      if (!group) continue;
      const value = window.getComputedStyle(group).getPropertyValue(property).trim();
      if (value && value !== "none" && value !== "normal") {
        target.style.setProperty(property, value);
        break;
      }
    }
  }
}

function flattenSvgLeafElement(
  rootSvg: SVGSVGElement,
  source: SVGGraphicsElement,
  groupAncestors: SVGElement[],
) {
  const target = source.cloneNode(true) as SVGElement;
  const elementMatrix = source.getCTM();
  const rootMatrix = rootSvg.getCTM();
  if (elementMatrix && rootMatrix) {
    const localMatrix = toDomMatrix(rootMatrix).inverse().multiply(toDomMatrix(elementMatrix));
    target.setAttribute("transform", formatSvgMatrix(localMatrix));
  }
  applyFlattenedSvgStyles(source, target);
  applyFlattenedGroupEffects(target, groupAncestors);
  return target;
}

function measureElementOrientation(
  rootSvg: SVGSVGElement,
  source: SVGGraphicsElement,
): ElementOrientation | undefined {
  if (!(source instanceof SVGGeometryElement)) return undefined;
  const elementMatrix = source.getCTM();
  const rootMatrix = rootSvg.getCTM();
  if (!elementMatrix || !rootMatrix) return undefined;

  let totalLength = 0;
  try {
    totalLength = source.getTotalLength();
  } catch {
    return undefined;
  }
  if (!Number.isFinite(totalLength) || totalLength <= 0) return undefined;

  const matrix = toDomMatrix(rootMatrix).inverse().multiply(toDomMatrix(elementMatrix));
  const sampleCount = 32;
  const points: Point[] = [];
  try {
    for (let index = 0; index < sampleCount; index += 1) {
      const point = source.getPointAtLength(totalLength * index / sampleCount);
      points.push(transformSvgPoint(matrix, point.x, point.y));
    }
  } catch {
    return undefined;
  }

  const point = points.reduce(
    (sum, current) => ({ x: sum.x + current.x / sampleCount, y: sum.y + current.y / sampleCount }),
    { x: 0, y: 0 },
  );
  let xx = 0;
  let xy = 0;
  let yy = 0;
  points.forEach((current) => {
    const dx = current.x - point.x;
    const dy = current.y - point.y;
    xx += dx * dx;
    xy += dx * dy;
    yy += dy * dy;
  });
  const trace = xx + yy;
  if (!Number.isFinite(trace) || trace <= 0.0001) return undefined;
  const spread = Math.hypot(xx - yy, 2 * xy);
  const confidence = spread / trace;
  if (!Number.isFinite(confidence) || confidence < 0.08) return undefined;
  const angle = 0.5 * Math.atan2(2 * xy, xx - yy);
  return {
    point,
    direction: { x: Math.cos(angle), y: Math.sin(angle) },
    confidence,
  };
}

function collectFlattenedSvgLeaves(rootSvg: SVGSVGElement, defsMarkup: string, viewBox: string): FlattenedSvgLeaf[] {
  const leaves: FlattenedSvgLeaf[] = [];
  let nextGroupId = 0;
  const visit = (element: Element, groupPath: string[], groupAncestors: SVGElement[]) => {
    const tagName = element.tagName.toLowerCase();
    if (ignoredSvgTags.has(tagName) || nonRenderableContextTags.has(tagName)) return;
    if (tagName === "g") {
      const layerName = element.getAttribute("data-cv-layer");
      const groupSegment = layerName ? `layer-${layerName}` : `g-${nextGroupId}`;
      const nextPath = [...groupPath, groupSegment];
      const nextAncestors = element instanceof SVGElement ? [...groupAncestors, element] : groupAncestors;
      nextGroupId += 1;
      Array.from(element.children).forEach((child) => visit(child, nextPath, nextAncestors));
      return;
    }
    if (terminalSvgTags.has(tagName) && element instanceof SVGGraphicsElement) {
      if (isHiddenBySvgAncestor(element, rootSvg)) return;
      const bounds = getRenderableSvgBounds(rootSvg, element);
      if (!bounds) return;
      const flattenedElement = flattenSvgLeafElement(rootSvg, element, groupAncestors);
      leaves.push({
        groupPath,
        content: `${defsMarkup}${serializeSvgNode(flattenedElement)}`,
        viewBox,
        bounds,
        contentMinX: bounds.minX,
        contentMinY: bounds.minY,
        orientation: measureElementOrientation(rootSvg, element),
      });
      return;
    }
    Array.from(element.children).forEach((child) => visit(child, groupPath, groupAncestors));
  };
  Array.from(rootSvg.children).forEach((child) => visit(child, [], [rootSvg]));
  return leaves;
}

function buildSvgNodeTree(flattenedLeaves: FlattenedSvgLeaf[]): ParsedSvgTemplateNode[] {
  type GroupBuildNode = { kind: "group"; groupKey: string; children: Array<GroupBuildNode | ParsedSvgLeafTemplateNode> };
  const rootNodes: Array<GroupBuildNode | ParsedSvgLeafTemplateNode> = [];
  const groupLookup = new Map<string, GroupBuildNode>();
  flattenedLeaves.forEach((leaf) => {
    let siblings = rootNodes;
    let pathKey = "";
    leaf.groupPath.forEach((segment) => {
      pathKey = pathKey.length > 0 ? `${pathKey}/${segment}` : segment;
      let groupNode = groupLookup.get(pathKey);
      if (!groupNode) {
        groupNode = { kind: "group", groupKey: pathKey, children: [] };
        siblings.push(groupNode);
        groupLookup.set(pathKey, groupNode);
      }
      siblings = groupNode.children;
    });
    siblings.push({
      kind: "leaf",
      content: leaf.content,
      viewBox: leaf.viewBox,
      bounds: leaf.bounds,
      contentMinX: leaf.contentMinX,
      contentMinY: leaf.contentMinY,
      orientation: leaf.orientation,
    });
  });
  const finalizeNode = (node: GroupBuildNode | ParsedSvgLeafTemplateNode): ParsedSvgTemplateNode | null => {
    if (node.kind === "leaf") return node;
    const children = node.children.map(finalizeNode).filter((c): c is ParsedSvgTemplateNode => !!c);
    let bounds: Bounds | null = null;
    children.forEach((child) => { bounds = mergeBounds(bounds, child.bounds); });
    if (children.length === 0 || !bounds) return null;
    const segment = node.groupKey.split("/").at(-1) ?? "";
    const name = segment.startsWith("layer-") ? segment.slice("layer-".length) : undefined;
    return { kind: "group", name, bounds, children } satisfies ParsedSvgGroupTemplateNode;
  };
  return rootNodes.map(finalizeNode).filter((n): n is ParsedSvgTemplateNode => !!n);
}

function wrapSvgNodesInRootGroup(nodes: ParsedSvgTemplateNode[]): ParsedSvgTemplateNode[] {
  let bounds: Bounds | null = null;
  nodes.forEach((node) => { bounds = mergeBounds(bounds, node.bounds); });
  if (!bounds || nodes.length === 0) return nodes;
  return [{ kind: "group", bounds, children: nodes } satisfies ParsedSvgGroupTemplateNode];
}

function extractSvgElements(
  markup: string,
  svg: SVGSVGElement,
  viewBox: string,
  rootBounds: { minX: number; minY: number; width: number; height: number },
): ParsedSvgTemplateNode[] {
  const measurementSvg = createMeasurementSvg(markup, viewBox, Math.max(rootBounds.width, 1), Math.max(rootBounds.height, 1));
  try {
    const defsMarkup = collectDefinitionMarkup(measurementSvg);
    const flattenedLeaves = collectFlattenedSvgLeaves(measurementSvg, defsMarkup, viewBox);
    const nodes = buildSvgNodeTree(flattenedLeaves);
    const contentNodes = nodes.length > 0 ? nodes : buildWholeSvgElement(svg, viewBox);
    return wrapSvgNodesInRootGroup(contentNodes);
  } finally {
    measurementSvg.remove();
  }
}

export function scopeSvgContent(content: string, scopeId: string) {
  const parser = new DOMParser();
  const document = parser.parseFromString(`<svg xmlns="http://www.w3.org/2000/svg">${content}</svg>`, "image/svg+xml");
  const root = document.documentElement as unknown as SVGSVGElement;
  const idMap = new Map<string, string>();
  root.querySelectorAll("[id]").forEach((element) => {
    const oldId = element.getAttribute("id");
    if (!oldId) return;
    const nextId = `${scopeId}-${oldId}`;
    idMap.set(oldId, nextId);
    element.setAttribute("id", nextId);
  });
  const rewriteValue = (value: string) => {
    let nextValue = value;
    idMap.forEach((nextId, oldId) => {
      nextValue = nextValue.replaceAll(`url(#${oldId})`, `url(#${nextId})`);
      nextValue = nextValue.replaceAll(`href="#${oldId}"`, `href="#${nextId}"`);
      nextValue = nextValue.replaceAll(`xlink:href="#${oldId}"`, `xlink:href="#${nextId}"`);
      nextValue = nextValue.replaceAll(`"#${oldId}"`, `"#${nextId}"`);
      nextValue = nextValue.replaceAll(`'#${oldId}'`, `'#${nextId}'`);
    });
    return nextValue;
  };
  root.querySelectorAll("*").forEach((element) => {
    for (const attributeName of element.getAttributeNames()) {
      const value = element.getAttribute(attributeName);
      if (!value) continue;
      const rewritten = rewriteValue(value);
      if (rewritten !== value) element.setAttribute(attributeName, rewritten);
    }
  });
  return root.innerHTML;
}

export async function loadSvgTemplate(candidateId: string): Promise<ParsedSvgTemplate> {
  const cached = templateCache.get(candidateId);
  if (cached) return cached;
  const loader = rawSvgLoaders[candidateId];
  if (!loader) throw new Error(`Missing SVG loader for ${candidateId}`);
  const promise = loader().then((markup) => parseSvgTemplate(markup));
  templateCache.set(candidateId, promise);
  return promise;
}

export const candidates: SvgCandidate[] = templateCatalog
  .map(({ name, chartType, coordinateSystem }) => {
    const source = rawSvgSourceByName[name];
    const src = previewSrcByName.get(name);
    if (!source || !src) throw new Error(`Missing rendered template asset for ${name}`);
    return {
      id: source.id,
      name,
      chartType,
      coordinateSystem,
      src,
    };
  })
  .sort((left, right) => {
    const coordinateCompare = collator.compare(left.coordinateSystem, right.coordinateSystem);
    if (coordinateCompare !== 0) return coordinateCompare;
    const typeCompare = collator.compare(left.chartType, right.chartType);
    return typeCompare !== 0 ? typeCompare : collator.compare(left.name, right.name);
  });
