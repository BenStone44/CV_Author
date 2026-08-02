import type {
  SvgCandidate,
  CoordinateSystem,
  Bounds,
  Point,
  ParsedSvgLeafTemplateNode,
  ParsedSvgGroupTemplateNode,
  ParsedSvgTemplateNode,
  ParsedSvgTemplate,
  FlattenedSvgLeaf,
} from "./types";

const previewModules = import.meta.glob("../../charts_snapshots/*.webp", {
  eager: true,
  import: "default",
}) as Record<string, string>;

const rawSvgLoaders = import.meta.glob("../../charts_svg/*.svg", {
  import: "default",
  query: "?raw",
}) as Record<string, () => Promise<string>>;

export const collator = new Intl.Collator("en", {
  numeric: true,
  sensitivity: "base",
});
const templateCache = new Map<string, Promise<ParsedSvgTemplate>>();
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
      ?.replace(/\.(?:svg|webp)$/i, "") ?? path
  );
}

const previewSrcByName = new Map(
  Object.entries(previewModules).map(([path, src]) => [toFileName(path), src]),
);

function getPreviewSrc(name: string) {
  const src = previewSrcByName.get(name);
  if (!src) throw new Error(`Missing WebP snapshot for ${name}`);
  return src;
}

function toCategory(name: string) {
  const category = name.replace(/\d+$/, "");
  return category.length > 0 ? category : "Uncategorized";
}

const polarChartTypes = new Set([
  "BarChartInRadialLayout",
  "DonutChart",
  "PieChart",
  "PolarAreaChart",
  "RadarChart",
  "RadialBarChart",
  "SpiralPlot",
]);

const geographicChartTypes = new Set(["GeoHeatmap"]);
const noCoordinateChartTypes = new Set(["CirclePacking", "WordCloud"]);

function resolveCoordinateSystem(chartType: string): CoordinateSystem {
  if (geographicChartTypes.has(chartType)) return "Geographic";
  if (noCoordinateChartTypes.has(chartType)) return "None";
  if (polarChartTypes.has(chartType)) return "Polar";
  return "Cartesian";
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
    style.stroke !== "none" &&
    (!Number.isFinite(strokeWidth) || strokeWidth > 0);
  const hasFill = style.fill !== "none";
  const hasMarkers =
    style.markerStart !== "none" ||
    style.markerMid !== "none" ||
    style.markerEnd !== "none";
  return hasStroke || hasFill || hasMarkers;
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
    const strokeWidth = parseDimension(style.strokeWidth);
    const padding =
      style.stroke !== "none" && Number.isFinite(strokeWidth)
        ? strokeWidth / 2 + 0.5
        : 0;
    const minX = rawBounds.x - padding;
    const minY = rawBounds.y - padding;
    const maxX = rawBounds.x + rawBounds.width + padding;
    const maxY = rawBounds.y + rawBounds.height + padding;
    const corners = [
      transformSvgPoint(localMatrix, minX, minY),
      transformSvgPoint(localMatrix, minX, maxY),
      transformSvgPoint(localMatrix, maxX, minY),
      transformSvgPoint(localMatrix, maxX, maxY),
    ];
    const bounds: Bounds = {
      minX: Math.min(...corners.map((p) => p.x)),
      minY: Math.min(...corners.map((p) => p.y)),
      maxX: Math.max(...corners.map((p) => p.x)),
      maxY: Math.max(...corners.map((p) => p.y)),
      width: 0,
      height: 0,
    };
    bounds.width = bounds.maxX - bounds.minX;
    bounds.height = bounds.maxY - bounds.minY;
    if (bounds.width < 0.25 && bounds.height < 0.25) return null;
    return bounds;
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

function collectFlattenedSvgLeaves(rootSvg: SVGSVGElement, defsMarkup: string, viewBox: string): FlattenedSvgLeaf[] {
  const leaves: FlattenedSvgLeaf[] = [];
  let nextGroupId = 0;
  const visit = (element: Element, groupPath: string[], groupAncestors: SVGElement[]) => {
    const tagName = element.tagName.toLowerCase();
    if (ignoredSvgTags.has(tagName) || nonRenderableContextTags.has(tagName)) return;
    if (tagName === "g") {
      const nextPath = [...groupPath, `g-${nextGroupId}`];
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
      leaves.push({ groupPath, content: `${defsMarkup}${serializeSvgNode(flattenedElement)}`, viewBox, bounds, contentMinX: bounds.minX, contentMinY: bounds.minY });
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
    siblings.push({ kind: "leaf", content: leaf.content, viewBox: leaf.viewBox, bounds: leaf.bounds, contentMinX: leaf.contentMinX, contentMinY: leaf.contentMinY });
  });
  const finalizeNode = (node: GroupBuildNode | ParsedSvgLeafTemplateNode): ParsedSvgTemplateNode | null => {
    if (node.kind === "leaf") return node;
    const children = node.children.map(finalizeNode).filter((c): c is ParsedSvgTemplateNode => !!c);
    let bounds: Bounds | null = null;
    children.forEach((child) => { bounds = mergeBounds(bounds, child.bounds); });
    if (children.length === 0 || !bounds) return null;
    return { kind: "group", bounds, children } satisfies ParsedSvgGroupTemplateNode;
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

export const candidates: SvgCandidate[] = Object.keys(rawSvgLoaders)
  .map((id) => {
    const name = toFileName(id);
    const chartType = toCategory(name);
    return {
      id,
      name,
      chartType,
      coordinateSystem: resolveCoordinateSystem(chartType),
      src: getPreviewSrc(name),
    };
  })
  .sort((left, right) => {
    const coordinateCompare = collator.compare(left.coordinateSystem, right.coordinateSystem);
    if (coordinateCompare !== 0) return coordinateCompare;
    const typeCompare = collator.compare(left.chartType, right.chartType);
    return typeCompare !== 0 ? typeCompare : collator.compare(left.name, right.name);
  });
