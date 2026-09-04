import { mkdir } from "node:fs/promises";
import { resolve } from "node:path";
import process from "node:process";
import { chromium } from "playwright";

const captures = [
  ["ArcLayer", "arc-layer.png"],
  ["BitmapLayer", "bitmap-layer.png"],
  ["ColumnLayer", "column-layer.png"],
  ["ContourLayer", "contour-layer.png"],
  ["GeoJsonLayer", "geojson-layer.png"],
  ["GridCellLayer", "grid-cell-layer.png"],
  ["GridLayer", "grid-layer.png"],
  ["HeatmapLayer", "heatmap-layer.png"],
  ["HexagonLayer", "hexagon-layer.png"],
  ["IconLayer", "icon-layer.png"],
  ["LineLayer", "line-layer.png"],
  ["MVTLayer", "mvt-layer.png"],
  ["PathLayer", "path-layer.png"],
  ["PointCloudLayer", "point-cloud-layer.png"],
  ["PolygonLayer", "polygon-layer.png"],
  ["ScatterplotLayer", "scatterplot-layer.png"],
  ["ScreenGridLayer", "screen-grid-layer.png"],
  ["TerrainLayer", "terrain-layer.png"],
  ["TileLayer", "tile-layer.png"],
  ["TripsLayer", "trips-layer.png"],
  ["GreatCircleLayer", "great-circle-layer.png"],
  ["TextLayer", "text-layer.png"],
  ["SolidPolygonLayer", "solid-polygon-layer.png"],
  ["SimpleMeshLayer", "simple-mesh-layer.png"],
  ["ScenegraphLayer", "scenegraph-layer.png"],
];

function optionValue(name, fallback) {
  const inlinePrefix = `--${name}=`;
  const inline = process.argv.find((argument) => argument.startsWith(inlinePrefix));
  if (inline) return inline.slice(inlinePrefix.length);
  const index = process.argv.indexOf(`--${name}`);
  return index >= 0 ? process.argv[index + 1] ?? fallback : fallback;
}

const baseUrl = optionValue("base-url", "http://localhost:5173").replace(/\/$/, "");
const outputDirectory = resolve(optionValue("output", "public/deckgl-examples"));
const requestedLayer = optionValue("layer", "");
const selectedCaptures = requestedLayer
  ? captures.filter(([layerType]) => layerType === requestedLayer)
  : captures;
if (requestedLayer && selectedCaptures.length === 0) {
  throw new Error(`Unknown Deck.gl layer type: ${requestedLayer}`);
}
await mkdir(outputDirectory, { recursive: true });

const browser = await chromium.launch({
  channel: "chromium",
  headless: true,
  args: ["--enable-webgl", "--use-angle=swiftshader"],
});
const page = await browser.newPage({
  viewport: { width: 320, height: 180 },
  deviceScaleFactor: 1,
});
page.on("console", (message) => {
  if (message.type() === "error") process.stderr.write(`Browser console: ${message.text()}\n`);
});
page.on("pageerror", (error) => {
  process.stderr.write(`Browser page error: ${error.message}\n`);
});

try {
  for (const [layerType, fileName] of selectedCaptures) {
    const url = `${baseUrl}/?deckgl-thumbnail=${encodeURIComponent(layerType)}`;
    await page.goto(url, { waitUntil: "domcontentloaded", timeout: 30_000 });
    await page.addStyleTag({
      content: "#vue-devtools-anchor,.vue-devtools__anchor,.vue-devtools__anchor-btn,.vue-devtools__panel,.vue-devtools-frame{display:none!important;visibility:hidden!important}",
    });
    await page.evaluate(() => {
      document.querySelectorAll(
        "#vue-devtools-anchor,.vue-devtools__anchor,.vue-devtools__anchor-btn,.vue-devtools__panel,.vue-devtools-frame",
      ).forEach((element) => element.remove());
    });
    const capture = page.locator(".deckgl-thumbnail-capture");
    await capture.waitFor({ state: "visible", timeout: 15_000 });
    await page.waitForFunction(
      () => document.querySelector(".deckgl-thumbnail-capture")?.getAttribute("data-capture-ready") === "true",
      undefined,
      { timeout: 20_000 },
    );
    if (requestedLayer) {
      const diagnostics = await capture.locator("canvas").evaluateAll((canvases) => canvases.map((canvas) => ({
        className: canvas.className,
        parentClassName: canvas.parentElement?.className,
        width: canvas.width,
        height: canvas.height,
        clientWidth: canvas.clientWidth,
        clientHeight: canvas.clientHeight,
        display: getComputedStyle(canvas).display,
        position: getComputedStyle(canvas).position,
      })));
      process.stdout.write(`Canvas diagnostics: ${JSON.stringify(diagnostics)}\n`);
      const bottomCenterElements = await page.evaluate(() => document.elementsFromPoint(160, 175).map((element) => ({
        tag: element.tagName,
        id: element.id,
        className: typeof element.className === "string" ? element.className : "",
      })));
      process.stdout.write(`Bottom center diagnostics: ${JSON.stringify(bottomCenterElements)}\n`);
    }
    await capture.screenshot({
      path: resolve(outputDirectory, fileName),
      type: "png",
      animations: "disabled",
    });
    process.stdout.write(`Captured ${layerType} -> ${fileName}\n`);
  }
} finally {
  await browser.close();
}
