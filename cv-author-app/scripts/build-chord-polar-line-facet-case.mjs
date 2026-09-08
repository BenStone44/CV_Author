import { chromium } from "playwright";
import { mkdir } from "node:fs/promises";
import path from "node:path";

const appUrl = process.argv[2];
const screenshotPath = process.argv[3]
  ?? path.resolve("../docs/screenshots/chord-circular-stacked-facet-concat.png");

if (!appUrl) {
  throw new Error("Usage: node scripts/build-chord-polar-line-facet-case.mjs <running-app-url> [screenshot-path]");
}

const caseUrl = new URL(appUrl);
caseUrl.searchParams.set("case", "chord-circular-stacked-facet-concat");

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({
  viewport: { width: 1800, height: 1100 },
  deviceScaleFactor: 1.25,
});

try {
  await page.goto(caseUrl.href, { waitUntil: "networkidle" });
  await page.locator('html[data-case-status="ready"]').waitFor({ timeout: 15_000 });

  const chord = page.locator('[data-chart-type="chord"]');
  const facets = page.locator(
    '[data-chart-type="circular-bar"][data-bar-variant="stacked"][data-facet-column]:not([data-facet-column=""])',
  );
  if (await chord.count() !== 1) {
    throw new Error(`Expected one Chord, found ${await chord.count()}`);
  }
  if (await facets.count() !== 6) {
    throw new Error(`Expected six Circular Stacked Bar facets, found ${await facets.count()}`);
  }

  const facetStats = await facets.evaluateAll((roots) => roots.map((root) => {
    const nodeId = root.getAttribute("data-facet-column") ?? "";
    const start = Number(root.getAttribute("data-angle-start"));
    const span = Number(root.getAttribute("data-angle-span"));
    const marks = Array.from(root.querySelectorAll('[data-mark-role="bar"]'));
    const categories = Array.from(new Set(marks.map((mark) =>
      mark.getAttribute("data-category-key") ?? "")));
    const groups = categories.map((category) => {
      const segments = marks.filter((mark) =>
        mark.getAttribute("data-category-key") === category);
      return {
        category,
        segmentCount: segments.length,
        firstStackStart: Number(segments[0]?.getAttribute("data-stack-start")),
        lastStackEnd: Number(segments.at(-1)?.getAttribute("data-stack-end")),
        firstAngleStart: Number(segments[0]?.getAttribute("data-angle-start-deg")),
        lastAngleEnd: Number(segments.at(-1)?.getAttribute("data-angle-end-deg")),
      };
    });
    return { nodeId, start, span, markCount: marks.length, categoryCount: categories.length, groups };
  }));

  for (const facet of facetStats) {
    if (facet.markCount !== 18 || facet.categoryCount !== 6) {
      throw new Error(`${facet.nodeId}: expected 6 bars x 3 segments, found ${facet.categoryCount} x ${facet.markCount}`);
    }
    if (facet.groups.some((group) =>
      group.segmentCount !== 3
      || Math.abs(group.firstStackStart) > 1e-9
      || Math.abs(group.firstAngleStart - facet.start) > 1e-6
      || group.lastAngleEnd > facet.start + facet.span + 1e-6)) {
      throw new Error(`${facet.nodeId}: a stacked bar violates its node angle band`);
    }
    const longestEnd = Math.max(...facet.groups.map((group) => group.lastAngleEnd));
    if (Math.abs(longestEnd - (facet.start + facet.span)) > 1e-6) {
      throw new Error(`${facet.nodeId}: longest stacked bar does not reach the node end angle`);
    }
  }

  const chordBands = await chord.locator('[data-mark-role="node"]').evaluateAll((nodes) =>
    nodes.map((node) => ({
      id: node.getAttribute("data-node-key"),
      start: Number(node.getAttribute("data-angle-start")),
      end: Number(node.getAttribute("data-angle-end")),
    })),
  );
  const angularMismatch = chordBands.some((band, index) => {
    const facet = facetStats[index];
    return !facet
      || band.id !== facet.nodeId
      || Math.abs(facet.start - (band.start - 90)) > 1e-6
      || Math.abs(facet.span - (band.end - band.start)) > 1e-6;
  });
  if (angularMismatch) {
    throw new Error("Chord node bands and Circular Stacked Bar facets are not geometrically aligned");
  }

  const screenOrigin = async (locator) => locator.evaluate((element) => {
    const matrix = element.getScreenCTM();
    if (!matrix) throw new Error("Polar mark has no screen transform");
    const origin = new DOMPoint(0, 0).matrixTransform(matrix);
    return { x: origin.x, y: origin.y };
  });
  const chordOrigin = await screenOrigin(chord);
  const facetOrigins = [];
  for (let index = 0; index < await facets.count(); index += 1) {
    facetOrigins.push(await screenOrigin(facets.nth(index).locator('[data-mark-role="bar"]').first()));
  }
  if (facetOrigins.some((origin) =>
    Math.hypot(origin.x - chordOrigin.x, origin.y - chordOrigin.y) > 1)) {
    throw new Error(`Polar units are not concentric: ${JSON.stringify({ chordOrigin, facetOrigins })}`);
  }

  await mkdir(path.dirname(screenshotPath), { recursive: true });
  await page.locator(".canvas-board").screenshot({ path: screenshotPath });
  console.log(JSON.stringify({
    caseUrl: caseUrl.href,
    screenshotPath,
    facetCount: facetStats.length,
    totalBars: facetStats.reduce((sum, facet) => sum + facet.markCount, 0),
    barsPerFacet: facetStats.map((facet) => ({
      nodeId: facet.nodeId,
      rings: facet.categoryCount,
      segments: facet.markCount,
    })),
    chordOrigin,
    facetOrigins,
    chordBands,
    facetBands: facetStats.map(({ nodeId, start, span }) => ({ nodeId, start, span })),
  }, null, 2));
} finally {
  await browser.close();
}
