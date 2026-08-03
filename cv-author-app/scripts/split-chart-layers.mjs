import { mkdir, readFile, readdir, rename, writeFile } from "node:fs/promises";
import { dirname, extname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parse, stringify } from "svgson";

const scriptDirectory = dirname(fileURLToPath(import.meta.url));
const projectDirectory = resolve(scriptDirectory, "..");
const workspaceDirectory = resolve(projectDirectory, "..");

const defaultPaths = {
  selection: resolve(projectDirectory, "src/selectedCharts.ts"),
  overrides: resolve(scriptDirectory, "chart-layer-overrides.json"),
  svg: resolve(workspaceDirectory, "VisAnatomy/charts_svg"),
  annotations: resolve(workspaceDirectory, "VisAnatomy/annotations"),
  output: resolve(workspaceDirectory, "VisAnatomy/charts_svg_separated"),
};

const annotatedTags = new Set([
  "path",
  "rect",
  "circle",
  "text",
  "use",
  "line",
  "tspan",
  "polyline",
  "polygon",
  "ellipse",
  "image",
]);

const renderableTags = new Set([
  "path",
  "rect",
  "circle",
  "text",
  "use",
  "line",
  "polyline",
  "polygon",
  "ellipse",
  "image",
  "foreignobject",
  "tspan",
]);

const definitionTags = new Set([
  "defs",
  "style",
  "clippath",
  "mask",
  "marker",
  "pattern",
  "lineargradient",
  "radialgradient",
  "filter",
  "symbol",
]);

function parseArguments(argv) {
  const options = { ...defaultPaths, charts: null };

  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === "--help" || argument === "-h") {
      options.help = true;
      continue;
    }

    const value = argv[index + 1];
    if (!value || value.startsWith("--")) {
      throw new Error(`Missing value for ${argument}`);
    }

    switch (argument) {
      case "--selection":
        options.selection = resolve(value);
        break;
      case "--overrides":
        options.overrides = resolve(value);
        break;
      case "--svg-dir":
        options.svg = resolve(value);
        break;
      case "--annotations-dir":
        options.annotations = resolve(value);
        break;
      case "--output-dir":
        options.output = resolve(value);
        break;
      case "--charts":
        options.charts = value
          .split(",")
          .map((name) => name.trim().replace(/\.svg$/i, ""))
          .filter(Boolean);
        break;
      default:
        throw new Error(`Unknown argument: ${argument}`);
    }
    index += 1;
  }

  return options;
}

function printHelp() {
  console.log(`Usage: npm run split:charts -- [options]

Separates the curated VisAnatomy SVGs into coordinate and content layers.

Options:
  --selection <file>        Curated TypeScript selection file
  --overrides <file>        Known SVG/annotation mapping overrides
  --svg-dir <directory>     Source SVG directory
  --annotations-dir <dir>  VisAnatomy annotation directory
  --output-dir <directory>  Generated layer directory
  --charts <a,b,c>          Process only the named charts (for verification)
  -h, --help                Show this help
`);
}

function parseSelectedChartNames(source) {
  const declaration = source.match(
    /const\s+selectedChartNumbers\s*=\s*\{([\s\S]*?)\}\s*as\s+const/,
  );
  if (!declaration) {
    throw new Error("Could not find selectedChartNumbers in the selection file");
  }

  const names = [];
  const entryPattern = /^\s*([A-Za-z_$][\w$]*)\s*:\s*\[([^\]]*)\]\s*,?\s*$/gm;
  for (const match of declaration[1].matchAll(entryPattern)) {
    const chartType = match[1];
    const numbers = match[2].match(/\d+/g) ?? [];
    names.push(...numbers.map((number) => `${chartType}${number}`));
  }

  if (names.length === 0) {
    throw new Error("The curated selection did not contain any chart names");
  }
  return names;
}

async function indexFilesByBaseName(directory, extension) {
  const files = await readdir(directory);
  return new Map(
    files
      .filter((fileName) => extname(fileName).toLowerCase() === extension)
      .map((fileName) => [fileName.slice(0, -extension.length).toLowerCase(), fileName]),
  );
}

function collectNestedStrings(value, target) {
  if (typeof value === "string") {
    target.add(value);
    return;
  }
  if (Array.isArray(value)) {
    value.forEach((item) => collectNestedStrings(item, target));
  }
}

function collectCoordinateIds(annotation) {
  const explicitIds = new Set();
  const referenceElements = annotation.referenceElements ?? {};
  collectNestedStrings(referenceElements.xGridlines, explicitIds);
  collectNestedStrings(referenceElements.yGridlines, explicitIds);

  for (const axis of referenceElements.axes ?? []) {
    for (const field of ["labels", "label", "ticks", "path", "title", "upperLevels"]) {
      collectNestedStrings(axis[field], explicitIds);
    }
  }

  const roleIds = new Set();
  for (const [id, element] of Object.entries(annotation.allElements ?? {})) {
    if (/axis|gridline/i.test(String(element.role ?? ""))) {
      roleIds.add(id);
    }
  }

  return {
    explicitIds,
    roleIds,
    allIds: new Set([...explicitIds, ...roleIds]),
  };
}

function collectGroupLeaves(group, target, allElements) {
  for (const child of group.children ?? []) {
    if (typeof child === "string") {
      if (allElements[child]?.role === "Main Chart Mark") target.add(child);
    } else if (child && typeof child === "object") {
      collectGroupLeaves(child, target, allElements);
    }
  }
}

function indexAnnotationGroups(grouping) {
  const groups = new Map();

  function visit(group) {
    if (!group || typeof group !== "object") return;
    if (typeof group.id === "string") {
      groups.set(group.id.toLowerCase(), group);
      const numericId = group.id.match(/^g(\d+)$/i)?.[1];
      if (numericId !== undefined) groups.set(`group ${numericId}`, group);
    }
    for (const child of group.children ?? []) {
      if (child && typeof child === "object") visit(child);
    }
  }

  for (const group of grouping ?? []) visit(group);
  return groups;
}

function collectDataBindingIds(annotation) {
  const allElements = annotation.allElements ?? {};
  const groups = indexAnnotationGroups(annotation.grouping);
  const allIds = new Set();
  const directKeys = [];
  const groupKeys = [];
  const unresolvedKeys = [];
  const channels = new Map();

  for (const [key, encodedChannels] of Object.entries(annotation.encodingInfo ?? {})) {
    if (!Array.isArray(encodedChannels) || encodedChannels.length === 0) continue;

    if (allElements[key]) {
      allIds.add(key);
      directKeys.push(key);
      channels.set(key, new Set(encodedChannels));
      continue;
    }

    const group = groups.get(key.toLowerCase());
    if (!group) {
      unresolvedKeys.push(key);
      continue;
    }

    const groupIds = new Set();
    collectGroupLeaves(group, groupIds, allElements);
    for (const id of groupIds) {
      allIds.add(id);
      const elementChannels = channels.get(id) ?? new Set();
      encodedChannels.forEach((channel) => elementChannels.add(channel));
      channels.set(id, elementChannels);
    }
    groupKeys.push({ key, elementCount: groupIds.size });
  }

  const channelCounts = {};
  for (const elementChannels of channels.values()) {
    for (const channel of elementChannels) {
      channelCounts[channel] = (channelCounts[channel] ?? 0) + 1;
    }
  }

  return { allIds, directKeys, groupKeys, unresolvedKeys, channelCounts };
}

function finiteNumber(value) {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function formatNumber(value) {
  return Number(value.toFixed(4)).toString();
}

function coordinatePoint(x, y) {
  return { x: Number(formatNumber(x)), y: Number(formatNumber(y)) };
}

function axisGeometry(annotation, axis) {
  const allElements = annotation.allElements ?? {};
  const pathIds = new Set();
  collectNestedStrings(axis?.path, pathIds);
  let candidates = [...pathIds]
    .map((id) => allElements[id])
    .filter((element) =>
      element &&
      ["left", "top", "right", "bottom"].every((key) => finiteNumber(element[key])),
    );
  if (candidates.length === 0) {
    const roles = axis?.channel === "x"
      ? new Set(["X Axis Line"])
      : axis?.channel === "y"
        ? new Set(["Y Axis Line"])
        : axis?.channel === "angular"
          ? new Set(["Angular Axis Line"])
          : new Set(["Radian Axis Line"]);
    candidates = Object.values(allElements).filter((element) =>
      roles.has(String(element?.role)) &&
      ["left", "top", "right", "bottom"].every((key) => finiteNumber(element[key])),
    );
  }
  if (candidates.length === 0) return null;

  const element = candidates[0];
  const left = element.left;
  const top = element.top;
  const right = element.right;
  const bottom = element.bottom;
  const width = Math.abs(right - left);
  const height = Math.abs(bottom - top);
  if (String(element.type).toLowerCase() === "circle") {
    return { kind: "circle", center: coordinatePoint((left + right) / 2, (top + bottom) / 2) };
  }

  // Annotation bounds are sufficient for the straight axis lines used by the dataset.
  if (width === 0 && height === 0) return null;
  if (width >= height) {
    const y = (top + bottom) / 2;
    return { kind: "line", start: { x: left, y }, end: { x: right, y } };
  }
  const x = (left + right) / 2;
  return { kind: "line", start: { x, y: top }, end: { x, y: bottom } };
}

function lineIntersection(first, second) {
  const dx1 = first.end.x - first.start.x;
  const dy1 = first.end.y - first.start.y;
  const dx2 = second.end.x - second.start.x;
  const dy2 = second.end.y - second.start.y;
  const denominator = dx1 * dy2 - dy1 * dx2;
  if (Math.abs(denominator) < 1e-9) return null;
  const offsetX = second.start.x - first.start.x;
  const offsetY = second.start.y - first.start.y;
  const parameter = (offsetX * dy2 - offsetY * dx2) / denominator;
  return { x: first.start.x + parameter * dx1, y: first.start.y + parameter * dy1 };
}

function axisDirection(axis, origin) {
  if (!axis || axis.kind !== "line") return null;
  const preferred = axis.channel === "y" ? { x: 0, y: -1 } : { x: 1, y: 0 };
  const endpoints = [axis.start, axis.end];
  const endpoint = endpoints
    .map((point) => ({ point, distance: (point.x - origin.x) ** 2 + (point.y - origin.y) ** 2 }))
    .filter(({ distance }) => distance > 1e-9)
    .sort((left, right) => {
      const leftProjection = (left.point.x - origin.x) * preferred.x + (left.point.y - origin.y) * preferred.y;
      const rightProjection = (right.point.x - origin.x) * preferred.x + (right.point.y - origin.y) * preferred.y;
      return rightProjection - leftProjection;
    })[0]?.point;
  if (!endpoint) return null;
  const length = Math.hypot(endpoint.x - origin.x, endpoint.y - origin.y);
  return coordinatePoint((endpoint.x - origin.x) / length, (endpoint.y - origin.y) / length);
}

function extractCoordinateSystem(annotation) {
  const axes = Array.isArray(annotation.referenceElements?.axes)
    ? annotation.referenceElements.axes
    : [];
  if (axes.length === 0) {
    return { origin: null, xAxisDirection: null, yAxisDirection: null };
  }

  const xAxisDefinition = axes.find((axis) => axis?.channel === "x" || axis?.channel === "angular");
  const yAxisDefinition = axes.find((axis) => axis?.channel === "y" || axis?.channel === "radian");
  const xAxis = axisGeometry(annotation, xAxisDefinition);
  const yAxis = axisGeometry(annotation, yAxisDefinition);
  let origin = null;
  if (xAxis?.kind === "circle") {
    origin = xAxis.center;
  } else if (xAxis?.kind === "line" && yAxis?.kind === "line") {
    const intersection = lineIntersection(xAxis, yAxis);
    if (intersection) origin = coordinatePoint(intersection.x, intersection.y);
  } else if (yAxis?.kind === "circle") {
    origin = yAxis.center;
  }

  if (!origin) return { origin: null, xAxisDirection: null, yAxisDirection: null };
  if (xAxis) xAxis.channel = xAxisDefinition?.channel === "angular" ? "x" : xAxisDefinition?.channel;
  if (yAxis) yAxis.channel = yAxisDefinition?.channel === "radian" ? "y" : yAxisDefinition?.channel;
  return {
    origin,
    xAxisDirection: axisDirection(xAxis, { x: Number(origin.x), y: Number(origin.y) }),
    yAxisDirection: axisDirection(yAxis, { x: Number(origin.x), y: Number(origin.y) }),
  };
}

function parseViewBox(value) {
  if (typeof value !== "string") return null;
  const values = value.trim().split(/[\s,]+/).map(Number);
  if (values.length !== 4 || values.some((number) => !Number.isFinite(number))) return null;
  if (values[2] <= 0 || values[3] <= 0) return null;
  return { minX: values[0], minY: values[1], width: values[2], height: values[3] };
}

function parseAbsoluteSvgLength(value) {
  if (typeof value !== "string") return null;
  const match = value.trim().match(/^(\d*\.?\d+)(px|in|cm|mm|q|pt|pc)?$/i);
  if (!match) return null;
  const number = Number(match[1]);
  if (!Number.isFinite(number) || number <= 0) return null;
  const unitScale = {
    px: 1,
    in: 96,
    cm: 96 / 2.54,
    mm: 96 / 25.4,
    q: 96 / 101.6,
    pt: 96 / 72,
    pc: 16,
  };
  return number * (unitScale[match[2]?.toLowerCase() ?? "px"] ?? 1);
}

function resolveBaseViewport(root, inferredViewport) {
  const attributes = root.attributes ?? {};
  if (!inferredViewport) {
    const viewBox = parseViewBox(attributes.viewBox);
    if (viewBox) return viewBox;
  }
  const width = parseAbsoluteSvgLength(attributes.width);
  const height = parseAbsoluteSvgLength(attributes.height);
  if (width && height) return { minX: 0, minY: 0, width, height };
  return parseViewBox(attributes.viewBox);
}

function collectAnnotationBounds(annotation, elementIds) {
  const boxes = [...elementIds]
    .map((id) => annotation.allElements?.[id])
    .filter(Boolean)
    .map((element) => ({
      left: finiteNumber(element.left),
      top: finiteNumber(element.top),
      right: finiteNumber(element.right),
      bottom: finiteNumber(element.bottom),
    }))
    .filter((box) => Object.values(box).every((value) => value !== null));
  if (boxes.length === 0) return null;

  const minX = Math.min(...boxes.map((box) => box.left));
  const minY = Math.min(...boxes.map((box) => box.top));
  const maxX = Math.max(...boxes.map((box) => box.right));
  const maxY = Math.max(...boxes.map((box) => box.bottom));
  if (maxX <= minX && maxY <= minY) return null;
  return { minX, minY, width: Math.max(0, maxX - minX), height: Math.max(0, maxY - minY) };
}

function fitDataBindingViewport(root, annotation, elementIds, baseViewport) {
  const annotationBounds = collectAnnotationBounds(annotation, elementIds);
  if (!annotationBounds || !baseViewport) return null;

  const baseMaxX = baseViewport.minX + baseViewport.width;
  const baseMaxY = baseViewport.minY + baseViewport.height;
  const boundsMinX = Math.max(baseViewport.minX, annotationBounds.minX);
  const boundsMinY = Math.max(baseViewport.minY, annotationBounds.minY);
  const boundsMaxX = Math.min(baseMaxX, annotationBounds.minX + annotationBounds.width);
  const boundsMaxY = Math.min(baseMaxY, annotationBounds.minY + annotationBounds.height);
  if (boundsMaxX <= boundsMinX && boundsMaxY <= boundsMinY) return null;

  const boundsWidth = Math.max(0, boundsMaxX - boundsMinX);
  const boundsHeight = Math.max(0, boundsMaxY - boundsMinY);
  const referenceSize = Math.max(boundsWidth, boundsHeight, 1);
  let width = Math.max(boundsWidth, referenceSize * 0.01);
  let height = Math.max(boundsHeight, referenceSize * 0.01);
  let minX = boundsMinX - (width - boundsWidth) / 2;
  let minY = boundsMinY - (height - boundsHeight) / 2;
  const horizontalPadding = width * 0.02;
  const verticalPadding = height * 0.02;
  minX -= horizontalPadding;
  minY -= verticalPadding;
  width += horizontalPadding * 2;
  height += verticalPadding * 2;

  const aspectRatio = baseViewport.width / baseViewport.height;
  const currentAspectRatio = width / height;
  if (currentAspectRatio > aspectRatio) {
    height = width / aspectRatio;
  } else {
    width = height * aspectRatio;
  }

  const scale = Math.min(1, baseViewport.width / width, baseViewport.height / height);
  width *= scale;
  height *= scale;
  const centerX = (boundsMinX + boundsMaxX) / 2;
  const centerY = (boundsMinY + boundsMaxY) / 2;
  minX = Math.min(Math.max(centerX - width / 2, baseViewport.minX), baseMaxX - width);
  minY = Math.min(Math.max(centerY - height / 2, baseViewport.minY), baseMaxY - height);

  root.attributes.viewBox = [minX, minY, width, height].map(formatNumber).join(" ");
  return { minX, minY, width, height };
}

function ensureSvgViewport(root, annotation) {
  const attributes = root.attributes ?? (root.attributes = {});
  if (attributes.viewBox) return null;

  const boxes = Object.values(annotation.allElements ?? [])
    .map((element) => ({
      left: finiteNumber(element.left),
      top: finiteNumber(element.top),
      right: finiteNumber(element.right),
      bottom: finiteNumber(element.bottom),
    }))
    .filter((box) => Object.values(box).every((value) => value !== null));
  if (boxes.length === 0) return null;

  const minX = Math.min(0, ...boxes.map((box) => box.left));
  const minY = Math.min(0, ...boxes.map((box) => box.top));
  const maxX = Math.max(1, ...boxes.map((box) => box.right));
  const maxY = Math.max(1, ...boxes.map((box) => box.bottom));
  const width = Math.max(1, maxX - minX);
  const height = Math.max(1, maxY - minY);
  attributes.viewBox = `${formatNumber(minX)} ${formatNumber(minY)} ${formatNumber(width)} ${formatNumber(height)}`;

  const isAbsoluteDimension = (value) =>
    typeof value === "string" && /^\s*\d+(?:\.\d+)?(?:px)?\s*$/.test(value);
  if (!isAbsoluteDimension(attributes.width)) attributes.width = formatNumber(width);
  if (!isAbsoluteDimension(attributes.height)) attributes.height = formatNumber(height);
  return { minX, minY, width, height };
}

function indexAnnotatedNodes(root) {
  const counters = new Map();
  const nodeIds = new WeakMap();
  const nodesById = new Map();

  function visit(node) {
    const tagName = node.name.toLowerCase();
    if (annotatedTags.has(tagName)) {
      const index = counters.get(tagName) ?? 0;
      const id = `${tagName}${index}`;
      counters.set(tagName, index + 1);
      nodeIds.set(node, id);
      nodesById.set(id, node);
    }
    for (const child of node.children ?? []) visit(child);
  }

  visit(root);
  return { nodeIds, nodesById };
}

function cloneNode(node, children = node.children ?? []) {
  return {
    name: node.name,
    type: node.type,
    value: node.value,
    attributes: { ...node.attributes },
    children,
  };
}

function cloneWholeTree(node) {
  return cloneNode(node, (node.children ?? []).map(cloneWholeTree));
}

function treeContainsTag(node, expectedTag) {
  if (node.name.toLowerCase() === expectedTag) return true;
  return (node.children ?? []).some((child) => treeContainsTag(child, expectedTag));
}

function filterLayer(root, nodeIds, coordinateIds, layer) {
  function visit(node, inDefinition = false) {
    const tagName = node.name.toLowerCase();
    const definition = inDefinition || definitionTags.has(tagName);
    if (definition) return cloneWholeTree(node);

    const nodeId = nodeIds.get(node);
    const isCoordinate = nodeId ? coordinateIds.has(nodeId) : false;
    const isRenderable = renderableTags.has(tagName);

    if (layer === "content" && isCoordinate) return null;
    if (layer === "content" && isRenderable) return cloneWholeTree(node);

    if (layer === "coordinate" && isRenderable && isCoordinate) {
      return cloneWholeTree(node);
    }

    if (layer === "coordinate" && isRenderable && !isCoordinate) {
      const children = (node.children ?? [])
        .map((child) => visit(child, false))
        .filter(Boolean);
      return children.length > 0 ? cloneNode(node, children) : null;
    }

    const children = (node.children ?? [])
      .map((child) => visit(child, false))
      .filter(Boolean);

    if (tagName !== "svg" && !isRenderable && children.length === 0) return null;
    return cloneNode(node, children);
  }

  return visit(root);
}

async function writeAtomically(path, content) {
  const temporaryPath = `${path}.${process.pid}.tmp`;
  await writeFile(temporaryPath, content, "utf8");
  await rename(temporaryPath, path);
}

function serializeSvg(root) {
  return `${stringify(root)}\n`;
}

const options = parseArguments(process.argv.slice(2));
if (options.help) {
  printHelp();
  process.exit(0);
}

const [selectionSource, overridesSource, svgFiles, annotationFiles] = await Promise.all([
  readFile(options.selection, "utf8"),
  readFile(options.overrides, "utf8"),
  indexFilesByBaseName(options.svg, ".svg"),
  indexFilesByBaseName(options.annotations, ".json"),
]);

const selectedNames = options.charts ?? parseSelectedChartNames(selectionSource);
const overrides = JSON.parse(overridesSource);
const requestedNames = [...new Set(selectedNames)];
const coordinateDirectory = join(options.output, "coordinate");
const contentDirectory = join(options.output, "content");
const dataBindingDirectory = join(options.output, "data-binding");
await Promise.all([
  mkdir(coordinateDirectory, { recursive: true }),
  mkdir(contentDirectory, { recursive: true }),
  mkdir(dataBindingDirectory, { recursive: true }),
]);

const manifest = {
  generatedAt: new Date().toISOString(),
  source: {
    selection: options.selection,
    svgDirectory: options.svg,
    annotationsDirectory: options.annotations,
  },
  output: {
    coordinateDirectory,
    contentDirectory,
    dataBindingDirectory,
    coordinateSystems: join(options.output, "coordinate-systems.json"),
  },
  summary: {
    requested: requestedNames.length,
    generated: 0,
    withCoordinateElements: 0,
    withoutCoordinateElements: 0,
    warnings: 0,
    fallbacks: 0,
    dataBindingElements: 0,
    unresolvedDataBindingElements: 0,
    unresolvedEncodingKeys: 0,
    foreignObjectDataBindingCharts: 0,
    errors: 0,
  },
  charts: [],
};
const coordinateSystems = {
  version: 1,
  generatedAt: manifest.generatedAt,
  source: {
    annotationsDirectory: options.annotations,
    dataBindingDirectory,
  },
  charts: {},
};

for (const requestedName of requestedNames) {
  const lookupName = requestedName.toLowerCase();
  const svgFileName = svgFiles.get(lookupName);
  const annotationFileName = annotationFiles.get(lookupName);
  const emptyCoordinateSystem = {
    origin: null,
    xAxisDirection: null,
    yAxisDirection: null,
  };
  const result = {
    name: requestedName,
    status: "generated",
    warnings: [],
    coordinateSystem: emptyCoordinateSystem,
  };
  coordinateSystems.charts[requestedName] = emptyCoordinateSystem;

  if (!svgFileName || !annotationFileName) {
    result.status = "error";
    result.error = `Missing${!svgFileName ? " SVG" : ""}${!annotationFileName ? " annotation" : ""}`;
    manifest.summary.errors += 1;
    manifest.charts.push(result);
    console.error(`[error] ${requestedName}: ${result.error}`);
    continue;
  }

  try {
    const [svgSource, annotationSource] = await Promise.all([
      readFile(join(options.svg, svgFileName), "utf8"),
      readFile(join(options.annotations, annotationFileName), "utf8"),
    ]);
    const [root, annotation] = await Promise.all([
      parse(svgSource),
      Promise.resolve(JSON.parse(annotationSource)),
    ]);
    const coordinateSystem = extractCoordinateSystem(annotation);
    result.coordinateSystem = coordinateSystem;
    coordinateSystems.charts[requestedName] = coordinateSystem;
    const inferredViewport = ensureSvgViewport(root, annotation);
    const dataBindingBaseViewport = resolveBaseViewport(root, inferredViewport);

    const { explicitIds, roleIds, allIds } = collectCoordinateIds(annotation);
    const dataBinding = collectDataBindingIds(annotation);
    const { nodeIds, nodesById } = indexAnnotatedNodes(root);
    const directResolvedIds = [...allIds].filter((id) => nodesById.has(id));
    const directUnresolvedIds = [...allIds].filter((id) => !nodesById.has(id));
    const override = overrides[requestedName] ?? null;
    const overrideCoordinateIds = new Set(override?.coordinateIds ?? []);
    const replacementIds = new Set(override?.replacesAnnotationIds ?? []);
    const missingOverrideIds = [...overrideCoordinateIds].filter((id) => !nodesById.has(id));
    const replacedIds = directUnresolvedIds.filter((id) => replacementIds.has(id));
    const unresolvedIds = directUnresolvedIds.filter((id) => !replacementIds.has(id));
    const coordinateIds = new Set([...allIds, ...overrideCoordinateIds]);

    if (override) {
      result.fallback = {
        reason: override.reason,
        coordinateIds: [...overrideCoordinateIds],
        replacedAnnotationIds: replacedIds,
      };
      manifest.summary.fallbacks += 1;
    }

    if (unresolvedIds.length > 0 || missingOverrideIds.length > 0) {
      result.warnings.push({
        code: "unresolved-coordinate-elements",
        count: unresolvedIds.length + missingOverrideIds.length,
        annotationIds: unresolvedIds,
        overrideIds: missingOverrideIds,
      });
    }

    const coordinateRoot = filterLayer(root, nodeIds, coordinateIds, "coordinate");
    const contentRoot = filterLayer(root, nodeIds, coordinateIds, "content");
    const dataBindingRoot = filterLayer(
      root,
      nodeIds,
      dataBinding.allIds,
      "coordinate",
    );
    if (!coordinateRoot || !contentRoot || !dataBindingRoot) {
      throw new Error("Layer filtering removed the SVG root");
    }
    const dataBindingViewport = fitDataBindingViewport(
      dataBindingRoot,
      annotation,
      dataBinding.allIds,
      dataBindingBaseViewport,
    );

    const resolvedDataBindingIds = [...dataBinding.allIds].filter((id) => nodesById.has(id));
    const unresolvedDataBindingIds = [...dataBinding.allIds].filter(
      (id) => !nodesById.has(id),
    );
    if (unresolvedDataBindingIds.length > 0) {
      result.warnings.push({
        code: "unresolved-data-binding-elements",
        count: unresolvedDataBindingIds.length,
        ids: unresolvedDataBindingIds,
      });
    }

    const outputBaseName = svgFileName.slice(0, -4);
    await Promise.all([
      writeAtomically(
        join(coordinateDirectory, `${outputBaseName}.svg`),
        serializeSvg(coordinateRoot),
      ),
      writeAtomically(join(contentDirectory, `${outputBaseName}.svg`), serializeSvg(contentRoot)),
      writeAtomically(
        join(dataBindingDirectory, `${outputBaseName}.svg`),
        serializeSvg(dataBindingRoot),
      ),
    ]);

    result.sourceSvg = svgFileName;
    result.sourceAnnotation = annotationFileName;
    if (inferredViewport) result.inferredViewport = inferredViewport;
    result.coordinateElements = {
      explicit: explicitIds.size,
      addedByRole: [...roleIds].filter((id) => !explicitIds.has(id)).length,
      requested: allIds.size,
      resolvedDirectly: directResolvedIds.length,
      resolvedByFallback: replacedIds.length,
      resolved: directResolvedIds.length + replacedIds.length,
      unresolved: unresolvedIds.length,
    };
    result.outputs = {
      coordinate: `coordinate/${outputBaseName}.svg`,
      content: `content/${outputBaseName}.svg`,
      dataBinding: `data-binding/${outputBaseName}.svg`,
    };
    result.dataBindingElements = {
      directEncodingKeys: dataBinding.directKeys.length,
      expandedGroupKeys: dataBinding.groupKeys,
      unresolvedEncodingKeys: dataBinding.unresolvedKeys,
      requested: dataBinding.allIds.size,
      resolved: resolvedDataBindingIds.length,
      unresolved: unresolvedDataBindingIds.length,
      channelCounts: dataBinding.channelCounts,
      requiresForeignObjectSupport: treeContainsTag(dataBindingRoot, "foreignobject"),
    };
    if (dataBindingViewport) result.dataBindingViewport = dataBindingViewport;

    manifest.summary.generated += 1;
    manifest.summary.dataBindingElements += resolvedDataBindingIds.length;
    manifest.summary.unresolvedDataBindingElements += unresolvedDataBindingIds.length;
    manifest.summary.unresolvedEncodingKeys += dataBinding.unresolvedKeys.length;
    if (result.dataBindingElements.requiresForeignObjectSupport) {
      manifest.summary.foreignObjectDataBindingCharts += 1;
    }
    if (directResolvedIds.length > 0 || overrideCoordinateIds.size > 0) {
      manifest.summary.withCoordinateElements += 1;
    }
    else manifest.summary.withoutCoordinateElements += 1;
    if (result.warnings.length > 0) manifest.summary.warnings += 1;
    manifest.charts.push(result);
  } catch (error) {
    result.status = "error";
    result.error = error instanceof Error ? error.message : String(error);
    manifest.summary.errors += 1;
    manifest.charts.push(result);
    console.error(`[error] ${requestedName}: ${result.error}`);
  }
}

await writeAtomically(join(options.output, "manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`);
await writeAtomically(
  join(options.output, "coordinate-systems.json"),
  `${JSON.stringify(coordinateSystems, null, 2)}\n`,
);

console.log(
  [
    `Chart layers ready: ${manifest.summary.generated}/${manifest.summary.requested} generated.`,
    `${manifest.summary.withCoordinateElements} with coordinate elements,`,
    `${manifest.summary.withoutCoordinateElements} without coordinate elements,`,
    `${manifest.summary.fallbacks} fallback(s),`,
    `${manifest.summary.dataBindingElements} data-binding element(s),`,
    `${manifest.summary.warnings} warning(s),`,
    `${manifest.summary.errors} error(s).`,
    `Output: ${options.output}`,
  ].join(" "),
);

if (manifest.summary.errors > 0) process.exitCode = 1;
