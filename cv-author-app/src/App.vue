<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from "vue";
import { parseSync, stringify, type INode } from "svgson";

type SvgCandidate = {
  id: string;
  name: string;
  chartType: string;
  coordinateSystem: CoordinateSystem;
  src: string;
};

type CoordinateSystem = "Cartesian" | "Polar" | "Geographic" | "None";
type CoordinateFilter = "All" | CoordinateSystem;
type IconKind = "all" | "cartesian" | "polar" | "geographic" | "none";

type CanvasItem = {
  id: string;
  candidateId: string;
  name: string;
  content: string;
  viewBox: string;
  width: number;
  height: number;
  x: number;
  y: number;
  groupId?: string;
};

type Point = {
  x: number;
  y: number;
};

type Bounds = {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
  width: number;
  height: number;
};

type ParsedSvgElement = {
  content: string;
  viewBox: string;
  width: number;
  height: number;
  offsetX: number;
  offsetY: number;
};

type ParsedSvgTemplate = {
  viewBox: string;
  width: number;
  height: number;
  elements: ParsedSvgElement[];
};

type ScaleHandle = "nw" | "ne" | "sw" | "se";

type MoveInteraction = {
  type: "move";
  startPoint: Point;
  startBounds: Bounds;
  itemIds: string[];
  snapshots: Record<string, Point>;
};

type MarqueeInteraction = {
  type: "marquee";
  startPoint: Point;
  currentPoint: Point;
};

type ScaleInteraction = {
  type: "scale";
  handle: ScaleHandle;
  startBounds: Bounds;
  itemIds: string[];
  snapshots: Record<
    string,
    { x: number; y: number; width: number; height: number }
  >;
};

type Interaction = MoveInteraction | MarqueeInteraction | ScaleInteraction;

type SelectionUnit = {
  key: string;
  itemIds: string[];
  bounds: Bounds;
};

const previewModules = import.meta.glob("../../charts_svg/*.svg", {
  eager: true,
  import: "default",
}) as Record<string, string>;

const rawSvgLoaders = import.meta.glob("../../charts_svg/*.svg", {
  import: "default",
  query: "?raw",
}) as Record<string, () => Promise<string>>;

const collator = new Intl.Collator("en", {
  numeric: true,
  sensitivity: "base",
});
const templateCache = new Map<string, Promise<ParsedSvgTemplate>>();
const SVG_NS = "http://www.w3.org/2000/svg";
const rootSvgAttributeExcludes = new Set([
  "width",
  "height",
  "viewBox",
  "xmlns",
  "xmlns:xlink",
  "version",
  "baseProfile",
]);
const ignoredSvgTags = new Set([
  "defs",
  "style",
  "script",
  "metadata",
  "title",
  "desc",
]);
const nonRenderableContextTags = new Set([
  "clipPath",
  "mask",
  "marker",
  "pattern",
  "linearGradient",
  "radialGradient",
  "filter",
  "symbol",
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

function toFileName(path: string) {
  return (
    path
      .split("/")
      .pop()
      ?.replace(/\.svg$/i, "") ?? path
  );
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
  if (geographicChartTypes.has(chartType)) {
    return "Geographic";
  }

  if (noCoordinateChartTypes.has(chartType)) {
    return "None";
  }

  if (polarChartTypes.has(chartType)) {
    return "Polar";
  }

  return "Cartesian";
}

function parseDimension(value: string | null) {
  if (!value) {
    return Number.NaN;
  }

  const match = value.match(/-?\d*\.?\d+/);
  return match ? Number(match[0]) : Number.NaN;
}

function parseViewBox(viewBox: string | null) {
  if (!viewBox) {
    return null;
  }

  const values = viewBox
    .trim()
    .split(/[\s,]+/)
    .map((value) => Number(value));

  if (values.length !== 4 || values.some((value) => !Number.isFinite(value))) {
    return null;
  }

  return {
    minX: values[0],
    minY: values[1],
    width: values[2],
    height: values[3],
  };
}

function parseSvgTemplate(markup: string) {
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
    elements: extractSvgElements(markup, svg, viewBox, {
      minX: parsedViewBox?.minX ?? 0,
      minY: parsedViewBox?.minY ?? 0,
      width: safeWidth,
      height: safeHeight,
    }),
  } satisfies ParsedSvgTemplate;
}

function cloneAstNode(node: INode): INode {
  return {
    name: node.name,
    type: node.type,
    value: node.value,
    attributes: { ...node.attributes },
    children: node.children.map((child) => cloneAstNode(child)),
  };
}

function createAstNode(
  name: string,
  attributes: Record<string, string>,
  children: INode[],
): INode {
  return {
    name,
    type: "element",
    value: "",
    attributes,
    children,
  };
}

function collectDefinitionMarkup(rootAst: INode) {
  return rootAst.children
    .filter((child) => ignoredSvgTags.has(child.name))
    .map((child) => stringify(cloneAstNode(child)))
    .join("");
}

function collectEditableAstNodes(rootAst: INode) {
  const nodes: Array<{ node: INode; ancestors: INode[] }> = [];

  const visit = (node: INode, ancestors: INode[]) => {
    if (node.type !== "element") {
      return;
    }

    if (ignoredSvgTags.has(node.name) || nonRenderableContextTags.has(node.name)) {
      return;
    }

    if (terminalSvgTags.has(node.name)) {
      nodes.push({ node, ancestors });
      return;
    }

    const nextAncestors =
      node.name === "svg" ? ancestors : [...ancestors, node];

    node.children.forEach((child) => {
      visit(child, nextAncestors);
    });
  };

  rootAst.children.forEach((child) => {
    visit(child, []);
  });

  return nodes;
}

function buildWrappedAstNode(
  rootAst: INode,
  ancestors: INode[],
  node: INode,
): INode {
  let content = cloneAstNode(node);

  for (let index = ancestors.length - 1; index >= 0; index -= 1) {
    const ancestor = ancestors[index];

    if (!ancestor) {
      continue;
    }

    content = createAstNode(ancestor.name, { ...ancestor.attributes }, [content]);
  }

  const rootAttributes = Object.fromEntries(
    Object.entries(rootAst.attributes).filter(([key]) => {
      return !rootSvgAttributeExcludes.has(key);
    }),
  );

  return Object.keys(rootAttributes).length > 0
    ? createAstNode("g", rootAttributes, [content])
    : content;
}

function hasVisibleSvgPaint(
  element: SVGGraphicsElement,
  style: CSSStyleDeclaration,
) {
  const tagName = element.tagName.toLowerCase();

  if (alwaysVisibleSvgTags.has(tagName)) {
    return true;
  }

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

function transformSvgPoint(
  matrix: DOMMatrix | SVGMatrix,
  x: number,
  y: number,
) {
  return {
    x: matrix.a * x + matrix.c * y + matrix.e,
    y: matrix.b * x + matrix.d * y + matrix.f,
  } satisfies Point;
}

function toDomMatrix(matrix: DOMMatrix | SVGMatrix) {
  return new DOMMatrix([
    matrix.a,
    matrix.b,
    matrix.c,
    matrix.d,
    matrix.e,
    matrix.f,
  ]);
}

function getRenderableSvgBounds(
  rootSvg: SVGSVGElement,
  element: SVGGraphicsElement,
) {
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

    if (!matrix || !rootMatrix) {
      return null;
    }

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
    const bounds = {
      minX: Math.min(...corners.map((point) => point.x)),
      minY: Math.min(...corners.map((point) => point.y)),
      maxX: Math.max(...corners.map((point) => point.x)),
      maxY: Math.max(...corners.map((point) => point.y)),
      width: 0,
      height: 0,
    } satisfies Bounds;

    bounds.width = bounds.maxX - bounds.minX;
    bounds.height = bounds.maxY - bounds.minY;

    if (bounds.width < 0.25 && bounds.height < 0.25) {
      return null;
    }

    return bounds;
  } catch {
    return null;
  }
}

function mergeBounds(current: Bounds | null, next: Bounds) {
  if (!current) {
    return next;
  }

  const minX = Math.min(current.minX, next.minX);
  const minY = Math.min(current.minY, next.minY);
  const maxX = Math.max(current.maxX, next.maxX);
  const maxY = Math.max(current.maxY, next.maxY);

  return {
    minX,
    minY,
    maxX,
    maxY,
    width: maxX - minX,
    height: maxY - minY,
  } satisfies Bounds;
}

function buildWholeSvgElement(svg: SVGSVGElement, viewBox: string) {
  const parsedViewBox = parseViewBox(viewBox);
  const width = parsedViewBox?.width ?? parseDimension(svg.getAttribute("width"));
  const height =
    parsedViewBox?.height ?? parseDimension(svg.getAttribute("height"));
  const safeWidth = Number.isFinite(width) && width > 0 ? width : 200;
  const safeHeight = Number.isFinite(height) && height > 0 ? height : 180;

  return [
    {
      content: svg.innerHTML,
      viewBox,
      width: safeWidth,
      height: safeHeight,
      offsetX: 0,
      offsetY: 0,
    } satisfies ParsedSvgElement,
  ];
}

function measureSvgContentBounds(
  content: string,
  viewBox: string,
  width: number,
  height: number,
): Bounds | null {
  const measurementSvg = window.document.createElementNS(
    SVG_NS,
    "svg",
  ) as SVGSVGElement;

  measurementSvg.setAttribute("xmlns", SVG_NS);
  measurementSvg.setAttribute("viewBox", viewBox);
  measurementSvg.setAttribute("width", `${width}`);
  measurementSvg.setAttribute("height", `${height}`);
  measurementSvg.innerHTML = content;

  measurementSvg.style.position = "absolute";
  measurementSvg.style.left = "0";
  measurementSvg.style.top = "0";
  measurementSvg.style.visibility = "hidden";
  measurementSvg.style.pointerEvents = "none";
  measurementSvg.style.overflow = "visible";
  measurementSvg.style.zIndex = "-1";

  window.document.body.appendChild(measurementSvg);

  try {
    let bounds: Bounds | null = null;

    measurementSvg.querySelectorAll("*").forEach((element) => {
      if (!(element instanceof SVGGraphicsElement)) {
        return;
      }

      const tagName = element.tagName.toLowerCase();

      if (
        tagName === "svg" ||
        ignoredSvgTags.has(tagName) ||
        nonRenderableContextTags.has(tagName) ||
        element.closest(
          "defs, clipPath, mask, marker, pattern, linearGradient, radialGradient, filter, symbol",
        )
      ) {
        return;
      }

      const nextBounds = getRenderableSvgBounds(measurementSvg, element);

      if (nextBounds) {
        bounds = mergeBounds(bounds, nextBounds);
      }
    });

    return bounds;
  } finally {
    measurementSvg.remove();
  }
}

function extractSvgElements(
  markup: string,
  svg: SVGSVGElement,
  viewBox: string,
  rootBounds: { minX: number; minY: number; width: number; height: number },
) {
  const rootAst = parseSync(markup);
  const defsMarkup = collectDefinitionMarkup(rootAst);
  const elements = collectEditableAstNodes(rootAst)
    .map(({ node, ancestors }) => {
      const wrappedNode = buildWrappedAstNode(rootAst, ancestors, node);
      const content = `${defsMarkup}${stringify(wrappedNode)}`;

      return {
        content,
        viewBox,
        width: Math.max(rootBounds.width, 1),
        height: Math.max(rootBounds.height, 1),
        offsetX: 0,
        offsetY: 0,
      } satisfies ParsedSvgElement;
    });

  return elements.length > 0 ? elements : buildWholeSvgElement(svg, viewBox);
}

function scopeSvgContent(content: string, scopeId: string) {
  const parser = new DOMParser();
  const document = parser.parseFromString(
    `<svg xmlns="http://www.w3.org/2000/svg">${content}</svg>`,
    "image/svg+xml",
  );
  const root = document.documentElement as unknown as SVGSVGElement;
  const idMap = new Map<string, string>();

  root.querySelectorAll("[id]").forEach((element) => {
    const oldId = element.getAttribute("id");

    if (!oldId) {
      return;
    }

    const nextId = `${scopeId}-${oldId}`;
    idMap.set(oldId, nextId);
    element.setAttribute("id", nextId);
  });

  const rewriteValue = (value: string) => {
    let nextValue = value;

    idMap.forEach((nextId, oldId) => {
      nextValue = nextValue.replaceAll(`url(#${oldId})`, `url(#${nextId})`);
      nextValue = nextValue.replaceAll(`href="#${oldId}"`, `href="#${nextId}"`);
      nextValue = nextValue.replaceAll(
        `xlink:href="#${oldId}"`,
        `xlink:href="#${nextId}"`,
      );
      nextValue = nextValue.replaceAll(`"#${oldId}"`, `"#${nextId}"`);
      nextValue = nextValue.replaceAll(`'#${oldId}'`, `'#${nextId}'`);
    });

    return nextValue;
  };

  root.querySelectorAll("*").forEach((element) => {
    for (const attributeName of element.getAttributeNames()) {
      const value = element.getAttribute(attributeName);

      if (!value) {
        continue;
      }

      const rewritten = rewriteValue(value);

      if (rewritten !== value) {
        element.setAttribute(attributeName, rewritten);
      }
    }
  });

  return root.innerHTML;
}

function fitIntoBox(
  width: number,
  height: number,
  maxWidth: number,
  maxHeight: number,
) {
  const scale = Math.min(maxWidth / width, maxHeight / height, 1);

  return {
    width: width * scale,
    height: height * scale,
  };
}

function clamp(value: number, min: number, max: number) {
  if (max < min) {
    return min;
  }

  return Math.min(Math.max(value, min), max);
}

function normalizeBounds(firstPoint: Point, secondPoint: Point) {
  const minX = Math.min(firstPoint.x, secondPoint.x);
  const minY = Math.min(firstPoint.y, secondPoint.y);
  const maxX = Math.max(firstPoint.x, secondPoint.x);
  const maxY = Math.max(firstPoint.y, secondPoint.y);

  return {
    minX,
    minY,
    maxX,
    maxY,
    width: maxX - minX,
    height: maxY - minY,
  } satisfies Bounds;
}

function boundsFromItem(item: CanvasItem) {
  return {
    minX: item.x,
    minY: item.y,
    maxX: item.x + item.width,
    maxY: item.y + item.height,
    width: item.width,
    height: item.height,
  } satisfies Bounds;
}

const candidates = Object.entries(previewModules)
  .map(([id, src]) => {
    const name = toFileName(id);
    const chartType = toCategory(name);

    return {
      id,
      name,
      chartType,
      coordinateSystem: resolveCoordinateSystem(chartType),
      src,
    } satisfies SvgCandidate;
  })
  .sort((left, right) => {
    const coordinateCompare = collator.compare(
      left.coordinateSystem,
      right.coordinateSystem,
    );

    if (coordinateCompare !== 0) {
      return coordinateCompare;
    }

    const typeCompare = collator.compare(left.chartType, right.chartType);
    return typeCompare !== 0
      ? typeCompare
      : collator.compare(left.name, right.name);
  });

const selectedCoordinateSystem = ref<"All" | CoordinateSystem>("All");
const selectedChartType = ref("All");
const canvasRef = ref<HTMLElement | null>(null);
const canvasItems = ref<CanvasItem[]>([]);
const selectedIds = ref<string[]>([]);
const interaction = ref<Interaction | null>(null);
const draggedCandidateId = ref<string | null>(null);
const loadingDrop = ref(false);
const importNotice = ref<string | null>(null);
let importNoticeTimer: number | null = null;

const coordinateOptions: Array<{
  value: CoordinateFilter;
  label: string;
  icon: IconKind;
}> = [
  { value: "All", label: "All", icon: "all" },
  { value: "Cartesian", label: "Cartesian", icon: "cartesian" },
  { value: "Polar", label: "Polar", icon: "polar" },
  { value: "Geographic", label: "Geographic", icon: "geographic" },
  { value: "None", label: "None", icon: "none" },
];

function getFilterIconSvg(icon: IconKind) {
  switch (icon) {
    case "cartesian":
      return `
        <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
          <path d="M3 2.5v10.5h10.5" />
          <path d="M5 11l2.3-2.2 1.9 1.5 3.1-4" />
        </svg>
      `;
    case "polar":
      return `
        <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round">
          <circle cx="8" cy="8" r="1.2" fill="currentColor" stroke="none" />
          <path d="M8 2.5v11" />
          <path d="M2.5 8h11" />
          <path d="M8 3.6a4.4 4.4 0 1 1 0 8.8" />
        </svg>
      `;
    case "geographic":
      return `
        <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round">
          <circle cx="8" cy="8" r="5.3" />
          <path d="M2.9 6.3h10.2" />
          <path d="M3.3 9.7h9.4" />
          <path d="M8 2.8c1.9 1.6 2.8 3.4 2.8 5.2S9.9 11.6 8 13.2C6.1 11.6 5.2 9.8 5.2 8S6.1 4.4 8 2.8Z" />
        </svg>
      `;
    case "none":
      return `
        <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round">
          <path d="M3 4.5h10" />
          <path d="M3 8h10" />
          <path d="M3 11.5h6.5" />
        </svg>
      `;
    default:
      return `
        <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round">
          <path d="M3 8h10" />
          <path d="M8 3v10" />
        </svg>
      `;
  }
}

const availableChartTypes = computed(() => {
  const names = new Set(
    candidates
      .filter((candidate) => {
        return (
          selectedCoordinateSystem.value === "All" ||
          candidate.coordinateSystem === selectedCoordinateSystem.value
        );
      })
      .map((candidate) => candidate.chartType),
  );

  return [
    "All",
    ...Array.from(names).sort((left, right) => collator.compare(left, right)),
  ];
});

watch(
  availableChartTypes,
  (values) => {
    if (!values.includes(selectedChartType.value)) {
      selectedChartType.value = "All";
    }
  },
  { immediate: true },
);

const filteredCandidates = computed(() => {
  return candidates.filter((candidate) => {
    const coordinateMatches =
      selectedCoordinateSystem.value === "All" ||
      candidate.coordinateSystem === selectedCoordinateSystem.value;
    const chartTypeMatches =
      selectedChartType.value === "All" ||
      candidate.chartType === selectedChartType.value;

    return coordinateMatches && chartTypeMatches;
  });
});

const selectedItems = computed(() =>
  canvasItems.value.filter((item) => selectedIds.value.includes(item.id)),
);

const selectionBounds = computed(() => computeBounds(selectedIds.value));

const marqueeBounds = computed(() => {
  if (!interaction.value || interaction.value.type !== "marquee") {
    return null;
  }

  return normalizeBounds(
    interaction.value.startPoint,
    interaction.value.currentPoint,
  );
});

const selectionUnits = computed(() => getSelectionUnits(selectedIds.value));
const canGroup = computed(() => selectionUnits.value.length > 1);
const canUngroup = computed(() =>
  selectedItems.value.some((item) => item.groupId),
);

function getCandidate(candidateId: string) {
  return candidates.find((candidate) => candidate.id === candidateId);
}

function getCanvasSize() {
  const rect = canvasRef.value?.getBoundingClientRect();

  return {
    width: rect?.width ?? 0,
    height: rect?.height ?? 0,
  };
}

function toCanvasPoint(clientX: number, clientY: number) {
  const rect = canvasRef.value?.getBoundingClientRect();

  return {
    x: clientX - (rect?.left ?? 0),
    y: clientY - (rect?.top ?? 0),
  };
}

async function loadSvgTemplate(candidateId: string) {
  const cached = templateCache.get(candidateId);

  if (cached) {
    return cached;
  }

  const loader = rawSvgLoaders[candidateId];

  if (!loader) {
    throw new Error(`Missing SVG loader for ${candidateId}`);
  }

  const promise = loader().then((markup) => parseSvgTemplate(markup));
  templateCache.set(candidateId, promise);
  return promise;
}

function createCanvasItemsFromTemplate(
  sourceId: string,
  name: string,
  template: ParsedSvgTemplate,
  point: Point,
) {
  const size = fitIntoBox(template.width, template.height, 200, 180);
  const scale = template.width > 0 ? size.width / template.width : 1;
  const canvasSize = getCanvasSize();
  const x = clamp(point.x - size.width / 2, 0, canvasSize.width - size.width);
  const y = clamp(
    point.y - size.height / 2,
    0,
    canvasSize.height - size.height,
  );
  const nextItems = template.elements.map((element, index) => {
    const instanceId = crypto.randomUUID();

    return {
      id: instanceId,
      candidateId: sourceId,
      name: `${name}-${index + 1}`,
      content: scopeSvgContent(element.content, instanceId),
      viewBox: element.viewBox,
      width: Math.max(element.width * scale, 1),
      height: Math.max(element.height * scale, 1),
      x: x + element.offsetX * scale,
      y: y + element.offsetY * scale,
    } satisfies CanvasItem;
  });

  canvasItems.value.push(...nextItems);
  const firstItem = nextItems[0];
  setSelection(firstItem ? [firstItem.id] : []);
  setImportNotice(
    nextItems.length > 1
      ? `${name}: imported ${nextItems.length} editable elements.`
      : `${name}: imported as a single element.`,
  );
}

function setImportNotice(message: string) {
  importNotice.value = message;

  if (importNoticeTimer !== null) {
    window.clearTimeout(importNoticeTimer);
  }

  importNoticeTimer = window.setTimeout(() => {
    importNotice.value = null;
    importNoticeTimer = null;
  }, 4000);
}

function getGroupMembers(groupId: string) {
  return canvasItems.value
    .filter((item) => item.groupId === groupId)
    .map((item) => item.id);
}

function normalizeSelection(ids: string[]) {
  const normalized = new Set<string>();

  ids.forEach((id) => {
    const item = canvasItems.value.find((entry) => entry.id === id);

    if (!item) {
      return;
    }

    if (item.groupId) {
      getGroupMembers(item.groupId).forEach((memberId) =>
        normalized.add(memberId),
      );
      return;
    }

    normalized.add(item.id);
  });

  return canvasItems.value
    .filter((item) => normalized.has(item.id))
    .map((item) => item.id);
}

function setSelection(ids: string[]) {
  selectedIds.value = normalizeSelection(ids);
}

function toggleSelection(ids: string[]) {
  const targetIds = normalizeSelection(ids);
  const selectedSet = new Set(selectedIds.value);
  const allSelected = targetIds.every((id) => selectedSet.has(id));

  if (allSelected) {
    selectedIds.value = selectedIds.value.filter(
      (id) => !targetIds.includes(id),
    );
    return;
  }

  setSelection([...selectedIds.value, ...targetIds]);
}

function computeBounds(ids: string[]) {
  if (ids.length === 0) {
    return null;
  }

  const items = canvasItems.value.filter((item) => ids.includes(item.id));

  if (items.length === 0) {
    return null;
  }

  const minX = Math.min(...items.map((item) => item.x));
  const minY = Math.min(...items.map((item) => item.y));
  const maxX = Math.max(...items.map((item) => item.x + item.width));
  const maxY = Math.max(...items.map((item) => item.y + item.height));

  return {
    minX,
    minY,
    maxX,
    maxY,
    width: maxX - minX,
    height: maxY - minY,
  } satisfies Bounds;
}

function getSelectionUnits(ids: string[]) {
  const idSet = new Set(ids);
  const units: SelectionUnit[] = [];
  const visitedGroups = new Set<string>();

  canvasItems.value.forEach((item) => {
    if (!idSet.has(item.id)) {
      return;
    }

    if (item.groupId) {
      if (visitedGroups.has(item.groupId)) {
        return;
      }

      const memberIds = getGroupMembers(item.groupId);
      const bounds = computeBounds(memberIds);

      if (bounds) {
        units.push({
          key: `group:${item.groupId}`,
          itemIds: memberIds,
          bounds,
        });
      }

      visitedGroups.add(item.groupId);
      return;
    }

    units.push({
      key: `item:${item.id}`,
      itemIds: [item.id],
      bounds: boundsFromItem(item),
    });
  });

  return units;
}

async function createCanvasItem(candidate: SvgCandidate, point: Point) {
  loadingDrop.value = true;

  try {
    const template = await loadSvgTemplate(candidate.id);
    createCanvasItemsFromTemplate(candidate.id, candidate.name, template, point);
  } finally {
    loadingDrop.value = false;
  }
}

async function createCanvasItemsFromFile(file: File, point: Point) {
  loadingDrop.value = true;

  try {
    const markup = await file.text();
    const template = parseSvgTemplate(markup);
    createCanvasItemsFromTemplate(
      `file:${file.name}:${crypto.randomUUID()}`,
      file.name.replace(/\.svg$/i, ""),
      template,
      point,
    );
  } finally {
    loadingDrop.value = false;
  }
}

function onCandidateDragStart(candidate: SvgCandidate, event: DragEvent) {
  draggedCandidateId.value = candidate.id;
  event.dataTransfer?.setData("application/x-svg-candidate", candidate.id);
  event.dataTransfer?.setData("text/plain", candidate.id);

  if (event.dataTransfer) {
    event.dataTransfer.effectAllowed = "copy";
  }
}

function onCandidateDragEnd() {
  draggedCandidateId.value = null;
}

function onCanvasDragOver(event: DragEvent) {
  event.preventDefault();

  if (event.dataTransfer) {
    event.dataTransfer.dropEffect = "copy";
  }
}

async function onCanvasDrop(event: DragEvent) {
  event.preventDefault();
  const point = toCanvasPoint(event.clientX, event.clientY);
  const droppedFile = Array.from(event.dataTransfer?.files ?? []).find((file) => {
    return file.type === "image/svg+xml" || /\.svg$/i.test(file.name);
  });

  if (droppedFile) {
    await createCanvasItemsFromFile(droppedFile, point);
    draggedCandidateId.value = null;
    return;
  }

  const candidateId =
    event.dataTransfer?.getData("application/x-svg-candidate") ??
    event.dataTransfer?.getData("text/plain") ??
    draggedCandidateId.value;

  if (!candidateId) {
    return;
  }

  const candidate = getCandidate(candidateId);

  if (!candidate) {
    return;
  }

  await createCanvasItem(candidate, point);
  draggedCandidateId.value = null;
}

function attachPointerListeners() {
  window.addEventListener("pointermove", onWindowPointerMove);
  window.addEventListener("pointerup", onWindowPointerUp, { once: true });
}

function detachPointerListeners() {
  window.removeEventListener("pointermove", onWindowPointerMove);
  window.removeEventListener("pointerup", onWindowPointerUp);
}

function startMove(itemIds: string[], event: PointerEvent) {
  const bounds = computeBounds(itemIds);

  if (!bounds) {
    return;
  }

  const snapshots = Object.fromEntries(
    itemIds.map((itemId) => {
      const item = canvasItems.value.find((entry) => entry.id === itemId);
      return [itemId, { x: item?.x ?? 0, y: item?.y ?? 0 }];
    }),
  );

  interaction.value = {
    type: "move",
    startPoint: toCanvasPoint(event.clientX, event.clientY),
    startBounds: bounds,
    itemIds,
    snapshots,
  };

  attachPointerListeners();
}

function onCanvasItemPointerDown(item: CanvasItem, event: PointerEvent) {
  if (event.button !== 0) {
    return;
  }

  event.stopPropagation();

  const targetIds = normalizeSelection([item.id]);
  const hasModifier = event.shiftKey || event.metaKey || event.ctrlKey;

  if (hasModifier) {
    toggleSelection(targetIds);
    return;
  }

  const nextSelection = selectedIds.value.includes(item.id)
    ? selectedIds.value
    : targetIds;
  setSelection(nextSelection);
  startMove(nextSelection, event);
}

function onCanvasPointerDown(event: PointerEvent) {
  if (event.button !== 0 || event.target !== event.currentTarget) {
    return;
  }

  interaction.value = {
    type: "marquee",
    startPoint: toCanvasPoint(event.clientX, event.clientY),
    currentPoint: toCanvasPoint(event.clientX, event.clientY),
  };

  attachPointerListeners();
}

function onScaleHandlePointerDown(handle: ScaleHandle, event: PointerEvent) {
  if (event.button !== 0 || !selectionBounds.value) {
    return;
  }

  event.stopPropagation();

  const snapshots = Object.fromEntries(
    selectedIds.value.map((itemId) => {
      const item = canvasItems.value.find((entry) => entry.id === itemId);
      return [
        itemId,
        {
          x: item?.x ?? 0,
          y: item?.y ?? 0,
          width: item?.width ?? 0,
          height: item?.height ?? 0,
        },
      ];
    }),
  );

  interaction.value = {
    type: "scale",
    handle,
    startBounds: selectionBounds.value,
    itemIds: [...selectedIds.value],
    snapshots,
  };

  attachPointerListeners();
}

function updateMoveInteraction(
  currentPoint: Point,
  moveInteraction: MoveInteraction,
) {
  const canvasSize = getCanvasSize();
  const rawDx = currentPoint.x - moveInteraction.startPoint.x;
  const rawDy = currentPoint.y - moveInteraction.startPoint.y;
  const dx = clamp(
    rawDx,
    -moveInteraction.startBounds.minX,
    canvasSize.width - moveInteraction.startBounds.maxX,
  );
  const dy = clamp(
    rawDy,
    -moveInteraction.startBounds.minY,
    canvasSize.height - moveInteraction.startBounds.maxY,
  );

  moveInteraction.itemIds.forEach((itemId) => {
    const item = canvasItems.value.find((entry) => entry.id === itemId);
    const snapshot = moveInteraction.snapshots[itemId];

    if (!item || !snapshot) {
      return;
    }

    item.x = snapshot.x + dx;
    item.y = snapshot.y + dy;
  });
}

function updateScaleInteraction(
  currentPoint: Point,
  scaleInteraction: ScaleInteraction,
) {
  const canvasSize = getCanvasSize();
  const start = scaleInteraction.startBounds;
  const minWidth = 24;
  const minHeight = 24;
  let minX = start.minX;
  let minY = start.minY;
  let maxX = start.maxX;
  let maxY = start.maxY;

  switch (scaleInteraction.handle) {
    case "nw":
      minX = clamp(currentPoint.x, 0, start.maxX - minWidth);
      minY = clamp(currentPoint.y, 0, start.maxY - minHeight);
      break;
    case "ne":
      maxX = clamp(currentPoint.x, start.minX + minWidth, canvasSize.width);
      minY = clamp(currentPoint.y, 0, start.maxY - minHeight);
      break;
    case "sw":
      minX = clamp(currentPoint.x, 0, start.maxX - minWidth);
      maxY = clamp(currentPoint.y, start.minY + minHeight, canvasSize.height);
      break;
    case "se":
      maxX = clamp(currentPoint.x, start.minX + minWidth, canvasSize.width);
      maxY = clamp(currentPoint.y, start.minY + minHeight, canvasSize.height);
      break;
  }

  const nextBounds = {
    minX,
    minY,
    maxX,
    maxY,
    width: maxX - minX,
    height: maxY - minY,
  } satisfies Bounds;

  scaleInteraction.itemIds.forEach((itemId) => {
    const item = canvasItems.value.find((entry) => entry.id === itemId);
    const snapshot = scaleInteraction.snapshots[itemId];

    if (!item || !snapshot) {
      return;
    }

    const leftRatio = (snapshot.x - start.minX) / start.width;
    const topRatio = (snapshot.y - start.minY) / start.height;
    const widthRatio = snapshot.width / start.width;
    const heightRatio = snapshot.height / start.height;

    item.x = nextBounds.minX + leftRatio * nextBounds.width;
    item.y = nextBounds.minY + topRatio * nextBounds.height;
    item.width = Math.max(widthRatio * nextBounds.width, 12);
    item.height = Math.max(heightRatio * nextBounds.height, 12);
  });
}

function onWindowPointerMove(event: PointerEvent) {
  const activeInteraction = interaction.value;

  if (!activeInteraction) {
    return;
  }

  const point = toCanvasPoint(event.clientX, event.clientY);

  if (activeInteraction.type === "marquee") {
    activeInteraction.currentPoint = point;
    return;
  }

  if (activeInteraction.type === "move") {
    updateMoveInteraction(point, activeInteraction);
    return;
  }

  updateScaleInteraction(point, activeInteraction);
}

function finalizeMarqueeSelection(marqueeInteraction: MarqueeInteraction) {
  const bounds = normalizeBounds(
    marqueeInteraction.startPoint,
    marqueeInteraction.currentPoint,
  );

  if (bounds.width < 3 && bounds.height < 3) {
    selectedIds.value = [];
    return;
  }

  const hitIds = canvasItems.value
    .filter((item) => {
      const itemBounds = boundsFromItem(item);
      return !(
        itemBounds.maxX < bounds.minX ||
        itemBounds.minX > bounds.maxX ||
        itemBounds.maxY < bounds.minY ||
        itemBounds.minY > bounds.maxY
      );
    })
    .map((item) => item.id);

  setSelection(hitIds);
}

function onWindowPointerUp() {
  const activeInteraction = interaction.value;

  if (activeInteraction?.type === "marquee") {
    finalizeMarqueeSelection(activeInteraction);
  }

  interaction.value = null;
  detachPointerListeners();
}

function moveItems(itemIds: string[], dx: number, dy: number) {
  itemIds.forEach((itemId) => {
    const item = canvasItems.value.find((entry) => entry.id === itemId);

    if (!item) {
      return;
    }

    item.x += dx;
    item.y += dy;
  });
}

function groupSelectedItems() {
  if (!canGroup.value) {
    return;
  }

  const nextGroupId = crypto.randomUUID();

  selectedIds.value.forEach((itemId) => {
    const item = canvasItems.value.find((entry) => entry.id === itemId);

    if (item) {
      item.groupId = nextGroupId;
    }
  });

  setSelection(selectedIds.value);
}

function ungroupSelectedItems() {
  const groupIds = new Set(
    selectedItems.value
      .map((item) => item.groupId)
      .filter((groupId): groupId is string => !!groupId),
  );

  if (groupIds.size === 0) {
    return;
  }

  canvasItems.value.forEach((item) => {
    if (item.groupId && groupIds.has(item.groupId)) {
      item.groupId = undefined;
    }
  });

  selectedIds.value = [...selectedIds.value];
}

function alignSelection(
  mode: "left" | "right" | "top" | "bottom" | "center-x" | "center-y",
) {
  const units = selectionUnits.value;
  const bounds = selectionBounds.value;

  if (units.length < 2 || !bounds) {
    return;
  }

  units.forEach((unit) => {
    let dx = 0;
    let dy = 0;

    switch (mode) {
      case "left":
        dx = bounds.minX - unit.bounds.minX;
        break;
      case "right":
        dx = bounds.maxX - unit.bounds.maxX;
        break;
      case "top":
        dy = bounds.minY - unit.bounds.minY;
        break;
      case "bottom":
        dy = bounds.maxY - unit.bounds.maxY;
        break;
      case "center-x":
        dx =
          bounds.minX +
          bounds.width / 2 -
          (unit.bounds.minX + unit.bounds.width / 2);
        break;
      case "center-y":
        dy =
          bounds.minY +
          bounds.height / 2 -
          (unit.bounds.minY + unit.bounds.height / 2);
        break;
    }

    moveItems(unit.itemIds, dx, dy);
  });
}

const scaleHandles = computed(() => {
  if (!selectionBounds.value) {
    return [];
  }

  const bounds = selectionBounds.value;

  return [
    { key: "nw", x: bounds.minX, y: bounds.minY },
    { key: "ne", x: bounds.maxX, y: bounds.minY },
    { key: "sw", x: bounds.minX, y: bounds.maxY },
    { key: "se", x: bounds.maxX, y: bounds.maxY },
  ] as Array<{ key: ScaleHandle; x: number; y: number }>;
});

onBeforeUnmount(() => {
  detachPointerListeners();

  if (importNoticeTimer !== null) {
    window.clearTimeout(importNoticeTimer);
  }
});
</script>

<template>
  <div class="app-shell">
    <aside class="sidebar">
      <div class="sidebar__top">
        <div class="sidebar__filters">
          <div class="filter-group filter-group--coordinate">
            <p class="filter-group__title">Coordinate</p>
            <div class="filters filters--compact">
              <button
                v-for="option in coordinateOptions"
                :key="option.value"
                class="filter-chip"
                :class="{
                  'filter-chip--active':
                    option.value === selectedCoordinateSystem,
                }"
                type="button"
                @click="selectedCoordinateSystem = option.value"
              >
                <span
                  v-if="option.icon !== 'all'"
                  class="filter-chip__icon"
                  aria-hidden="true"
                  v-html="getFilterIconSvg(option.icon)"
                ></span>
                <span>{{ option.label }}</span>
              </button>
            </div>
          </div>
        </div>

        <div class="sidebar__browser">
          <div class="filter-group filter-group--types">
            <p class="filter-group__title">Chart Type</p>
            <div class="filters filters--scroll">
              <button
                v-for="chartType in availableChartTypes"
                :key="chartType"
                class="filter-chip filter-chip--text"
                :class="{
                  'filter-chip--active': chartType === selectedChartType,
                }"
                type="button"
                @click="selectedChartType = chartType"
              >
                {{ chartType }}
              </button>
            </div>
          </div>

          <div class="candidate-list">
            <article
              v-for="candidate in filteredCandidates"
              :key="candidate.id"
              class="candidate-card"
              :title="candidate.name"
              draggable="true"
              @dragstart="onCandidateDragStart(candidate, $event)"
              @dragend="onCandidateDragEnd"
            >
              <div class="candidate-card__preview">
                <img
                  :src="candidate.src"
                  :alt="candidate.name"
                  loading="lazy"
                  draggable="false"
                />
              </div>
            </article>
          </div>
        </div>
      </div>
    </aside>

    <main class="workspace">
      <section
        ref="canvasRef"
        class="canvas-board"
        :class="{ 'canvas-board--dragging': draggedCandidateId }"
        @dragover="onCanvasDragOver"
        @drop="onCanvasDrop"
        @pointerdown="onCanvasPointerDown"
      >
        <div class="toolbar toolbar--floating">
          <button
            class="ghost-button"
            type="button"
            :disabled="!canGroup"
            @click="groupSelectedItems"
          >
            Group
          </button>
          <button
            class="ghost-button"
            type="button"
            :disabled="!canUngroup"
            @click="ungroupSelectedItems"
          >
            Ungroup
          </button>
          <button
            class="ghost-button"
            type="button"
            :disabled="selectionUnits.length < 2"
            @click="alignSelection('left')"
          >
            Left
          </button>
          <button
            class="ghost-button"
            type="button"
            :disabled="selectionUnits.length < 2"
            @click="alignSelection('center-x')"
          >
            Center X
          </button>
          <button
            class="ghost-button"
            type="button"
            :disabled="selectionUnits.length < 2"
            @click="alignSelection('right')"
          >
            Right
          </button>
          <button
            class="ghost-button"
            type="button"
            :disabled="selectionUnits.length < 2"
            @click="alignSelection('top')"
          >
            Top
          </button>
          <button
            class="ghost-button"
            type="button"
            :disabled="selectionUnits.length < 2"
            @click="alignSelection('center-y')"
          >
            Center Y
          </button>
          <button
            class="ghost-button"
            type="button"
            :disabled="selectionUnits.length < 2"
            @click="alignSelection('bottom')"
          >
            Bottom
          </button>
          <button
            class="ghost-button"
            type="button"
            @click="
              canvasItems = [];
              selectedIds = [];
            "
          >
            Clear
          </button>
        </div>

        <div
          v-if="canvasItems.length === 0 && !loadingDrop"
          class="empty-state"
        >
          Drag a library SVG or a local .svg file here. Imported graphics are
          decomposed into editable elements. Click to select, Shift/Ctrl/Cmd-click
          to multi-select, drag a blank area to box-select.
        </div>

        <div v-if="loadingDrop" class="loading-state">Loading SVG...</div>
        <div v-if="importNotice" class="import-notice">{{ importNotice }}</div>

        <svg
          v-for="item in canvasItems"
          :key="item.id"
          class="canvas-object"
          :class="{ 'canvas-object--selected': selectedIds.includes(item.id) }"
          :style="{
            left: `${item.x}px`,
            top: `${item.y}px`,
            width: `${item.width}px`,
            height: `${item.height}px`,
          }"
          :viewBox="item.viewBox"
          preserveAspectRatio="xMinYMin meet"
          @pointerdown="onCanvasItemPointerDown(item, $event)"
          v-html="item.content"
        ></svg>

        <svg class="selection-overlay" preserveAspectRatio="none">
          <rect
            v-if="marqueeBounds"
            class="marquee-box"
            :x="marqueeBounds.minX"
            :y="marqueeBounds.minY"
            :width="marqueeBounds.width"
            :height="marqueeBounds.height"
          />

          <g v-if="selectionBounds">
            <rect
              class="selection-box"
              :x="selectionBounds.minX"
              :y="selectionBounds.minY"
              :width="selectionBounds.width"
              :height="selectionBounds.height"
            />

            <circle
              v-for="handle in scaleHandles"
              :key="handle.key"
              class="selection-handle"
              :cx="handle.x"
              :cy="handle.y"
              r="6"
              @pointerdown="onScaleHandlePointerDown(handle.key, $event)"
            />
          </g>
        </svg>
      </section>
    </main>
  </div>
</template>

<style scoped>
.app-shell {
  display: flex;
  flex-direction: column;
  min-height: 100vh;
  background:
    radial-gradient(
      circle at top left,
      rgba(255, 255, 255, 0.95),
      rgba(255, 255, 255, 0.68)
    ),
    linear-gradient(135deg, #edf7ff 0%, #eef3f8 48%, #dce8f7 100%);
}

.sidebar {
  --browser-panel-height: 200px;
  display: flex;
  flex-direction: column;
  gap: 14px;
  padding: 18px 24px 14px;
  border-bottom: 1px solid rgba(24, 33, 47, 0.08);
  background: rgba(248, 251, 255, 0.86);
  backdrop-filter: blur(12px);
}

.sidebar__top {
  display: grid;
  grid-template-columns: 132px minmax(200px, 28%) minmax(0, 1fr);
  gap: 16px;
  align-items: stretch;
}

.sidebar__filters {
  display: flex;
  min-width: 0;
  height: var(--browser-panel-height);
}

.sidebar__browser {
  --candidate-card-width: 118px;
  --candidate-card-height: 92px;
  --candidate-gap: 10px;
  --candidate-preview-width: 104px;
  --candidate-preview-height: 68px;
  --candidate-image-width: 176px;
  grid-column: 2 / 4;
  display: grid;
  grid-template-columns: minmax(244px, 32%) minmax(0, 1fr);
  gap: 16px;
  align-items: stretch;
  height: var(--browser-panel-height);
  max-height: var(--browser-panel-height);
  min-height: 0;
  overflow: hidden;
}

.filters {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.filters--compact {
  display: grid;
  grid-template-columns: 1fr;
}

.filter-group {
  display: flex;
  flex-direction: column;
  gap: 8px;
  min-height: 0;
}

.filter-group--types {
  min-width: 0;
  height: var(--browser-panel-height);
  max-height: var(--browser-panel-height);
  min-height: 0;
  overflow: hidden;
}

.filter-group--coordinate .filter-chip {
  gap: 6px;
  min-height: 30px;
  padding: 5px 10px;
  font-size: 13px;
}

.filter-group--coordinate .filter-chip__icon {
  width: 14px;
  height: 14px;
  flex: 0 0 14px;
}

.filter-group--coordinate .filter-chip__icon :deep(svg) {
  width: 14px;
  height: 14px;
}

.filter-group__title {
  margin: 0;
  color: #516176;
  font-size: 12px;
  font-weight: 700;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

.filter-chip {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  padding: 8px 12px;
  border: 1px solid rgba(24, 33, 47, 0.08);
  border-radius: 999px;
  background: #fff;
  color: #334155;
  font: inherit;
  cursor: pointer;
  justify-content: flex-start;
  transition:
    transform 160ms ease,
    background-color 160ms ease,
    color 160ms ease,
    border-color 160ms ease;
}

.filter-chip:hover {
  transform: translateY(-1px);
}

.filter-chip--active {
  border-color: transparent;
  background: linear-gradient(135deg, #1c7ed6, #1554b2);
  color: #fff;
}

.filter-chip__icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 16px;
  height: 16px;
  flex: 0 0 16px;
}

.filter-chip__icon :deep(svg) {
  width: 16px;
  height: 16px;
  display: block;
}

.filter-chip--text {
  gap: 0;
}

.filters--scroll {
  display: flex;
  flex-wrap: wrap;
  flex: 1 1 auto;
  align-content: start;
  width: 100%;
  min-height: 0;
  height: auto;
  box-sizing: border-box;
  overflow-x: hidden;
  overflow-y: auto;
  padding-right: 4px;
}

.filter-group--types .filter-chip--text {
  width: auto;
  max-width: 100%;
  justify-content: flex-start;
}

.candidate-list {
  display: grid;
  grid-template-columns: repeat(auto-fill, var(--candidate-card-width));
  grid-auto-rows: var(--candidate-card-height);
  gap: var(--candidate-gap);
  justify-content: start;
  align-content: start;
  box-sizing: border-box;
  height: var(--browser-panel-height);
  max-height: var(--browser-panel-height);
  min-height: 0;
  overflow-x: hidden;
  overflow-y: auto;
  padding-right: 4px;
}

.candidate-card {
  display: flex;
  align-items: center;
  justify-content: center;
  height: var(--candidate-card-height);
  padding: 6px;
  min-width: 0;
  min-height: 0;
  border: 1px solid rgba(24, 33, 47, 0.08);
  border-radius: 14px;
  background: rgba(255, 255, 255, 0.9);
  cursor: grab;
  box-shadow: 0 6px 18px rgba(45, 89, 126, 0.07);
  transition:
    transform 160ms ease,
    box-shadow 160ms ease,
    border-color 160ms ease;
}

.candidate-card:hover {
  transform: translateY(-2px);
  border-color: rgba(28, 126, 214, 0.3);
  box-shadow: 0 10px 24px rgba(45, 89, 126, 0.1);
}

.candidate-card:active {
  cursor: grabbing;
}

.candidate-card__preview {
  display: flex;
  align-items: center;
  justify-content: center;
  width: var(--candidate-preview-width);
  height: var(--candidate-preview-height);
  min-height: 0;
  overflow: hidden;
  padding: 0;
  border-radius: 10px;
  background: linear-gradient(
    135deg,
    rgba(223, 237, 252, 0.9),
    rgba(255, 255, 255, 0.92)
  );
}

.candidate-card__preview img {
  width: var(--candidate-image-width);
  max-width: none;
  height: auto;
  flex: 0 0 auto;
  pointer-events: none;
}

.workspace {
  display: flex;
  flex-direction: column;
  flex: 1;
  min-width: 0;
  padding: 24px;
}

.toolbar {
  display: flex;
  flex-wrap: wrap;
  justify-content: flex-start;
  gap: 8px;
}

.toolbar--floating {
  position: absolute;
  top: 16px;
  left: 16px;
  right: 16px;
  z-index: 3;
  padding: 10px 12px;
  border: 1px solid rgba(24, 33, 47, 0.08);
  border-radius: 18px;
  background: rgba(255, 255, 255, 0.82);
  backdrop-filter: blur(12px);
  box-shadow: 0 14px 32px rgba(45, 89, 126, 0.12);
}

.ghost-button {
  padding: 10px 14px;
  border: 1px solid rgba(24, 33, 47, 0.1);
  border-radius: 12px;
  background: rgba(255, 255, 255, 0.8);
  color: #223041;
  font: inherit;
  cursor: pointer;
}

.ghost-button:disabled {
  opacity: 0.45;
  cursor: not-allowed;
}

.canvas-board {
  position: relative;
  flex: 1;
  min-height: 680px;
  overflow: hidden;
  border: 1px solid rgba(24, 33, 47, 0.08);
  border-radius: 28px;
  background:
    linear-gradient(rgba(28, 126, 214, 0.06) 1px, transparent 1px),
    linear-gradient(90deg, rgba(28, 126, 214, 0.06) 1px, transparent 1px),
    linear-gradient(180deg, #ffffff 0%, #f4f8fc 100%);
  background-size:
    24px 24px,
    24px 24px,
    100% 100%;
  box-shadow: inset 0 0 0 1px rgba(255, 255, 255, 0.7);
}

.canvas-board--dragging {
  outline: 2px dashed rgba(28, 126, 214, 0.48);
  outline-offset: -10px;
}

.empty-state,
.loading-state {
  position: absolute;
  inset: 50% auto auto 50%;
  padding: 18px 20px;
  border-radius: 16px;
  background: rgba(255, 255, 255, 0.9);
  color: #5b6a80;
  transform: translate(-50%, -50%);
  box-shadow: 0 18px 40px rgba(45, 89, 126, 0.12);
  z-index: 1;
}

.import-notice {
  position: absolute;
  right: 20px;
  bottom: 20px;
  max-width: min(420px, calc(100% - 40px));
  padding: 12px 14px;
  border: 1px solid rgba(24, 33, 47, 0.08);
  border-radius: 14px;
  background: rgba(255, 255, 255, 0.94);
  color: #304255;
  box-shadow: 0 14px 32px rgba(45, 89, 126, 0.14);
  z-index: 2;
}

.canvas-object {
  position: absolute;
  overflow: visible;
  cursor: move;
  user-select: none;
  touch-action: none;
}

.canvas-object:hover {
  outline: 1px dashed rgba(28, 126, 214, 0.32);
  outline-offset: 1px;
}

.canvas-object :deep(*) {
  pointer-events: none;
}

.canvas-object--selected {
  filter: drop-shadow(0 10px 18px rgba(28, 126, 214, 0.18));
}

.selection-overlay {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  pointer-events: none;
  overflow: visible;
}

.selection-box {
  fill: rgba(28, 126, 214, 0.06);
  stroke: #1c7ed6;
  stroke-width: 1.5;
  stroke-dasharray: 6 4;
}

.marquee-box {
  fill: rgba(28, 126, 214, 0.12);
  stroke: #1c7ed6;
  stroke-width: 1.2;
  stroke-dasharray: 4 4;
}

.selection-handle {
  fill: #fff;
  stroke: #1c7ed6;
  stroke-width: 2;
  pointer-events: all;
  cursor: nwse-resize;
}

@media (max-width: 1320px) {
  .sidebar__top {
    grid-template-columns: 132px minmax(200px, 30%) minmax(0, 1fr);
  }

  .sidebar__browser {
    grid-template-columns: minmax(190px, 32%) minmax(0, 1fr);
  }
}

@media (max-width: 960px) {
  .sidebar {
    padding: 16px;
  }

  .sidebar__top {
    grid-template-columns: 1fr;
  }

  .sidebar__browser {
    grid-column: auto;
    grid-template-columns: 1fr;
  }

  .candidate-card {
    min-height: 88px;
  }

  .canvas-board {
    min-height: 520px;
  }

  .toolbar--floating {
    left: 12px;
    right: 12px;
    top: 12px;
  }
}
</style>
