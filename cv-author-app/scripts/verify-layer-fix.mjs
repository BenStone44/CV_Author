import assert from "node:assert/strict";
import { chromium } from "playwright-core";
const browser = await chromium.launch({ channel: "chrome", headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
try {
  await page.goto(process.env.CV_AUTHOR_URL ?? "http://127.0.0.1:5173", { waitUntil: "networkidle" });
  await page.getByText("40 rows / 7 columns", { exact: true }).waitFor();
  await page.getByRole("button", { name: "LineGraph", exact: true }).click();
  const candidate = page.locator(".candidate-card").first();
  await candidate.dragTo(page.locator(".canvas-board"), { targetPosition: { x: 430, y: 420 } });
  await candidate.dragTo(page.locator(".canvas-board"), { targetPosition: { x: 900, y: 620 } });
  await page.locator(".canvas-object").nth(1).waitFor();
  for (const index of [0, 1]) {
    await page.locator(".canvas-object").nth(index).click();
    await page.locator(".coordinate-axis-hit-target--x").first().dispatchEvent("pointerdown", { button: 0, pointerId: index + 1 });
    await page.locator(".encoding-inspector__field select").selectOption("time");
    await page.locator(".coordinate-axis-hit-target--y").first().dispatchEvent("pointerdown", { button: 0, pointerId: index + 3 });
    await page.locator(".encoding-inspector__field select").selectOption("weight_kg");
    await page.getByRole("button", { name: "Confirm series", exact: true }).click();
  }
  await page.locator(".canvas-object").nth(0).click();
  await page.locator(".canvas-object").nth(1).click({ modifiers: ["Shift"] });
  assert.equal(await page.locator(".canvas-object--selected").count(), 2);
  await page.getByRole("button", { name: "Layer", exact: true }).click();
  await page.locator('[data-mark-role="point"]').first().waitFor();
  assert.equal(await page.locator('[data-mark-role="point"]').count(), 40);
  assert.equal(await page.locator('.coordinate-guide-layer').count(), 1);
  console.log(JSON.stringify({ points: 40, coordinateGuides: 1 }));
} finally { await browser.close(); }
