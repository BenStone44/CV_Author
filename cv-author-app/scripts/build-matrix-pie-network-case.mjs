import { chromium } from "playwright";
import { mkdir } from "node:fs/promises";
import path from "node:path";

const appUrl = process.argv[2];
const screenshotPath = process.argv[3]
  ?? path.resolve("../docs/screenshots/matrix-pie-network-marginal-bars.png");

if (!appUrl) {
  throw new Error("Usage: node scripts/build-matrix-pie-network-case.mjs <running-app-url> [screenshot-path]");
}

const caseUrl = new URL(appUrl);
caseUrl.searchParams.set("case", "matrix-force-heatmap-marginal-bars");

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({
  viewport: { width: 1800, height: 1100 },
  deviceScaleFactor: 1.25,
});

try {
  await page.goto(caseUrl.href, { waitUntil: "networkidle" });
  await page.locator('html[data-case-status="ready"]').waitFor({ timeout: 15_000 });

  const matrix = page.locator('[data-chart-type="matrix"][data-link="true"]');
  const cells = matrix.locator('[data-mark-role="cell"]');
  const force = matrix.locator('[data-chart-type="force-directed-graph"]');
  const links = force.locator('[data-mark-role="link"]');
  const nodes = force.locator('[data-mark-role="node"]');
  const pieSlices = force.locator('[data-mark-role="node-pie-slice"]');
  const stackedBars = page.locator('[data-chart-type="bar"][data-bar-variant="stacked"]');
  const topBar = stackedBars.filter({ has: page.locator('[data-mark-role="bar"][data-category-key="C01"]') });
  const rightBar = stackedBars.filter({ has: page.locator('[data-mark-role="bar"][data-category-key="R01"]') });

  const counts = {
    matrix: await matrix.count(),
    cells: await cells.count(),
    force: await force.count(),
    nodes: await nodes.count(),
    pieSlices: await pieSlices.count(),
    links: await links.count(),
    stackedBars: await stackedBars.count(),
    topSegments: await topBar.locator('[data-mark-role="bar"]').count(),
    rightSegments: await rightBar.locator('[data-mark-role="bar"]').count(),
  };
  const expected = {
    matrix: 1,
    cells: 400,
    force: 1,
    nodes: 72,
    pieSlices: 360,
    links: 163,
    stackedBars: 2,
    topSegments: 100,
    rightSegments: 100,
  };
  for (const [name, value] of Object.entries(expected)) {
    if (counts[name] !== value) throw new Error(`${name}: expected ${value}, found ${counts[name]}`);
  }

  const nodeRadii = await nodes.evaluateAll((items) =>
    items.map((item) => Number(item.getAttribute("data-node-radius") ?? 0)));
  const nodeGeometry = await nodes.evaluateAll((items) => items.map((item) => ({
    key: item.getAttribute("data-node-key") ?? "",
    x: Number(item.getAttribute("data-node-x") ?? 0),
    y: Number(item.getAttribute("data-node-y") ?? 0),
    radius: Number(item.getAttribute("data-node-radius") ?? 0),
  })));
  const clearanceViolations = nodeGeometry.flatMap((node, index) => nodeGeometry.slice(index + 1).flatMap((other) =>
    Math.hypot(node.x - other.x, node.y - other.y) + 0.5 < (node.radius + other.radius) * 1.25
      ? [`${node.key}:${other.key}`]
      : []));
  if (clearanceViolations.length > 0) {
    throw new Error(`Pie node clearance is below 1.25 radii: ${JSON.stringify(clearanceViolations)}`);
  }
  const nodeColors = await pieSlices.evaluateAll((items) =>
    [...new Set(items.map((item) => item.getAttribute("fill") ?? ""))]);
  const expectedNodeColors = ["#606c38", "#283618", "#ffe6a7", "#dda15e", "#bc6c25"];
  if (nodeColors.length !== 5
    || expectedNodeColors.some((color) => !nodeColors.includes(color))
    || Math.min(...nodeRadii) > 8.1
    || Math.max(...nodeRadii) < 23.9) {
    throw new Error(`Force component colors or node sizes are invalid: ${JSON.stringify({ nodeColors, nodeRadii })}`);
  }
  const layoutSource = await force.getAttribute("data-layout-source");
  if (layoutSource !== "stored-force") throw new Error(`Expected stored force positions, found ${layoutSource}`);
  const nodeShape = await force.getAttribute("data-node-shape");
  if (nodeShape !== "pie") throw new Error(`Expected Pie nodes, found ${nodeShape}`);
  const linkVisuals = await links.evaluateAll((items) => items.map((item) => ({
    kind: item.getAttribute("data-link-kind") ?? "",
    weight: Number(item.getAttribute("data-link-weight") ?? 0),
    width: Number(item.getAttribute("stroke-width") ?? 0),
    opacity: Number(item.getAttribute("stroke-opacity") ?? 0),
    color: item.getAttribute("stroke") ?? "",
  })));
  const radialLinks = linkVisuals.filter((link) => link.kind === "radial");
  const lightestRadial = radialLinks.reduce((best, link) => link.weight < best.weight ? link : best);
  const heaviestRadial = radialLinks.reduce((best, link) => link.weight > best.weight ? link : best);
  if (heaviestRadial.width <= lightestRadial.width
    || heaviestRadial.opacity <= lightestRadial.opacity
    || Math.min(...linkVisuals.map((link) => link.width)) > 1.7
    || Math.max(...linkVisuals.map((link) => link.width)) < 9.5
    || linkVisuals.some((link) => link.color !== "#ffffff")) {
    throw new Error(`Link weights are not visibly mapped to width: ${JSON.stringify({ lightestRadial, heaviestRadial })}`);
  }

  const heatmapColors = await cells.evaluateAll((items) =>
    [...new Set(items.map((cell) => cell.getAttribute("fill") ?? ""))]);
  const heatmapOpacity = await cells.first().getAttribute("fill-opacity");
  if (heatmapColors.length < 12 || Number(heatmapOpacity) < 0.9) {
    throw new Error(`Heatmap gradient is not prominent: ${JSON.stringify({ heatmapColors, heatmapOpacity })}`);
  }

  const matrixCenters = await cells.evaluateAll((items) => items.map((cell) => {
    const transform = cell.getScreenCTM();
    if (!transform) throw new Error("Rendered mark has no screen transform");
    const point = new DOMPoint(
      Number(cell.getAttribute("x")) + Number(cell.getAttribute("width")) / 2,
      Number(cell.getAttribute("y")) + Number(cell.getAttribute("height")) / 2,
    ).matrixTransform(transform);
    return { x: point.x, y: point.y };
  }));
  const topCenters = await topBar.locator('[data-mark-role="bar"][data-series-key="channel_a"]')
    .evaluateAll((items) => items.map((bar) => {
      const transform = bar.getScreenCTM();
      if (!transform) throw new Error("Rendered mark has no screen transform");
      const point = new DOMPoint(
        Number(bar.getAttribute("x")) + Number(bar.getAttribute("width")) / 2,
        Number(bar.getAttribute("y")) + Number(bar.getAttribute("height")) / 2,
      ).matrixTransform(transform);
      return { x: point.x, y: point.y };
    }));
  const rightCenters = await rightBar.locator('[data-mark-role="bar"][data-series-key="channel_a"]')
    .evaluateAll((items) => items.map((bar) => {
      const transform = bar.getScreenCTM();
      if (!transform) throw new Error("Rendered mark has no screen transform");
      const point = new DOMPoint(
        Number(bar.getAttribute("x")) + Number(bar.getAttribute("width")) / 2,
        Number(bar.getAttribute("y")) + Number(bar.getAttribute("height")) / 2,
      ).matrixTransform(transform);
      return { x: point.x, y: point.y };
    }));
  const matrixColumnCenters = matrixCenters.slice(0, 20).map((point) => point.x);
  const matrixRowCenters = Array.from({ length: 20 }, (_, index) => matrixCenters[index * 20].y);
  if (topCenters.some((point, index) => Math.abs(point.x - matrixColumnCenters[index]) > 1)) {
    throw new Error("Top stacked bars do not share the Matrix X positions");
  }
  if (rightCenters.some((point, index) => Math.abs(point.y - matrixRowCenters[index]) > 1)) {
    throw new Error("Right stacked bars do not share the Matrix Y positions");
  }

  const matrixBounds = await matrix.boundingBox();
  const topBounds = await topBar.boundingBox();
  const rightBounds = await rightBar.boundingBox();
  if (!matrixBounds || !topBounds || !rightBounds
    || topBounds.y + topBounds.height > matrixBounds.y + 2
    || rightBounds.x < matrixBounds.x + matrixBounds.width - 2) {
    throw new Error(`Marginal concat placement is invalid: ${JSON.stringify({ matrixBounds, topBounds, rightBounds })}`);
  }
  const visibleAxes = await page.locator('.cartesian-axis-domain, .cartesian-axis-tick, .cartesian-axis-tick-label').count();
  if (visibleAxes !== 0) throw new Error(`Expected all Cartesian axes to be hidden, found ${visibleAxes} axis elements`);

  await mkdir(path.dirname(screenshotPath), { recursive: true });
  await page.locator(".canvas-board").screenshot({ path: screenshotPath });
  console.log(JSON.stringify({
    caseUrl: caseUrl.href,
    screenshotPath,
    counts,
    nodeColors,
    layoutSource,
    nodeShape,
    nodeRadiusRange: [Math.min(...nodeRadii), Math.max(...nodeRadii)],
    nodeClearanceViolations: clearanceViolations.length,
    linkWidthRange: [
      Math.min(...linkVisuals.map((link) => link.width)),
      Math.max(...linkVisuals.map((link) => link.width)),
    ],
    radialOpacityRange: [lightestRadial.opacity, heaviestRadial.opacity],
    heatmapColorCount: heatmapColors.length,
    matrixBounds,
    topBounds,
    rightBounds,
  }, null, 2));
} finally {
  await browser.close();
}
