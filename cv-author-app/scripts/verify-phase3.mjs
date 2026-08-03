import assert from "node:assert/strict";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { chromium } from "playwright-core";

const baseUrl = process.env.CV_AUTHOR_URL ?? "http://127.0.0.1:5173";
const browser = await chromium.launch({ channel: "chrome", headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
const pageErrors = [];
page.on("pageerror", (error) => pageErrors.push(error.message));

try {
  await page.goto(baseUrl, { waitUntil: "networkidle" });
  await page.getByText("40 rows / 7 columns", { exact: true }).waitFor();
  await page.getByRole("button", { name: "LineGraph", exact: true }).click();

  const candidate = page.locator(".candidate-card").first();
  await candidate.dragTo(page.locator(".canvas-board"), {
    targetPosition: { x: 520, y: 560 },
  });
  await page.locator(".canvas-object").first().waitFor();

  await page.locator(".coordinate-axis-hit-target--x").dispatchEvent("pointerdown", {
    button: 0,
    pointerId: 1,
  });
  await page.locator(".encoding-inspector__field select").selectOption("time");
  try {
    await page.locator(".coordinate-axis-binding-label--x").waitFor({ timeout: 5000 });
  } catch (error) {
    console.error(JSON.stringify({
      inspectorCount: await page.locator(".encoding-inspector").count(),
      selectedObjects: await page.locator(".canvas-object--selected").count(),
      guides: await page.locator(".coordinate-guide-layer").count(),
      axisLines: await page.locator(".coordinate-axis-line").count(),
      bindingLabels: await page.locator(".coordinate-axis-binding-label").count(),
      bindingLabelTexts: await page.locator(".coordinate-axis-binding-label").allTextContents(),
      inspectorText: await page.locator(".encoding-inspector").allTextContents(),
      svg: (await page.locator(".canvas-scene").innerHTML()).slice(0, 1200),
    }));
    throw error;
  }

  await page.locator(".coordinate-axis-hit-target--y").dispatchEvent("pointerdown", {
    button: 0,
    pointerId: 2,
  });
  await page.locator(".encoding-inspector__field select").selectOption("weight_kg");
  await page.locator(".coordinate-axis-binding-label--y").waitFor();
  const seriesSelect = page.locator(".encoding-inspector__series select");
  try {
    await seriesSelect.waitFor({ timeout: 5000 });
  } catch (error) {
    console.error(JSON.stringify({
      inspectorCount: await page.locator(".encoding-inspector").count(),
      inspectorText: await page.locator(".encoding-inspector").allInnerTexts(),
      axisLabels: await page.locator(".coordinate-axis-binding-label").allInnerTexts(),
      canvasObjects: await page.locator(".canvas-object").count(),
    }));
    throw error;
  }
  assert.equal(await seriesSelect.inputValue(), "person");
  assert.match(await seriesSelect.locator("option").first().textContent(), /person \(5 groups\)/);
  await page.getByRole("button", { name: "Confirm series", exact: true }).click();

  const renderedChart = page.locator('[data-renderer="deterministic-line@1"]');
  await renderedChart.waitFor();
  const series = renderedChart.locator('[data-mark-role="series"]');
  assert.equal(await series.count(), 5);
  assert.deepEqual(await series.evaluateAll((elements) => elements.map((element) => element.getAttribute("data-point-count"))), ["8", "8", "8", "8", "8"]);

  await page.getByRole("button", { name: "Undo", exact: true }).click();
  assert.equal(await page.locator('[data-renderer="deterministic-line@1"]').count(), 0);
  await page.getByRole("button", { name: "Redo", exact: true }).click();
  await page.locator('[data-renderer="deterministic-line@1"]').waitFor();

  await page.keyboard.press("Control+c");
  await page.keyboard.press("Control+v");
  assert.equal(await page.locator('[data-renderer="deterministic-line@1"]').count(), 2);
  const chartIds = await page.locator('[data-renderer="deterministic-line@1"]').evaluateAll(
    (elements) => elements.map((element) => element.getAttribute("data-chart-id")),
  );
  assert.equal(new Set(chartIds).size, 2);

  const screenshotPath = join(tmpdir(), "cv-author-phase3.png");
  await page.screenshot({ path: screenshotPath, fullPage: true });
  assert.deepEqual(pageErrors, []);
  console.log(JSON.stringify({ baseUrl, screenshotPath, seriesCount: 5, pointsPerSeries: 8, copiedCharts: 2 }));
} finally {
  await browser.close();
}
