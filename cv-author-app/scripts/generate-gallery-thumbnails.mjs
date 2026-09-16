import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

const appDir = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const casesDir = join(appDir, "public/site/gallery/cases");
const thumbnailMaxSize = 384;
const slugs = JSON.parse(readFileSync(join(casesDir, "index.json"), "utf8"));
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage();

try {
  for (const slug of slugs) {
    const metadataPath = join(casesDir, slug, "case.json");
    const metadata = JSON.parse(readFileSync(metadataPath, "utf8"));
    const svg = readFileSync(join(casesDir, slug, "preview.svg"), "utf8");
    const result = await page.evaluate(async ({ markup, maxSize }) => {
      const url = URL.createObjectURL(new Blob([markup], { type: "image/svg+xml" }));
      try {
        const image = new Image();
        image.src = url;
        await image.decode();
        if (!image.naturalWidth || !image.naturalHeight) throw new Error("SVG has no intrinsic dimensions");
        const scale = Math.min(1, maxSize / Math.max(image.naturalWidth, image.naturalHeight));
        const width = Math.max(1, Math.round(image.naturalWidth * scale));
        const height = Math.max(1, Math.round(image.naturalHeight * scale));
        const canvas = document.createElement("canvas");
        canvas.width = width;
        canvas.height = height;
        const context = canvas.getContext("2d");
        if (!context) throw new Error("Canvas 2D context is unavailable");
        context.drawImage(image, 0, 0, width, height);
        return {
          width,
          height,
          png: canvas.toDataURL("image/png").split(",")[1],
        };
      } finally {
        URL.revokeObjectURL(url);
      }
    }, { markup: svg, maxSize: thumbnailMaxSize });
    const png = Buffer.from(result.png, "base64");
    const output = join(casesDir, slug, "thumbnail.png");
    writeFileSync(output, png);
    metadata.preview.thumbnail = {
      path: "thumbnail.png",
      sha256: createHash("sha256").update(png).digest("hex"),
      width: result.width,
      height: result.height,
    };
    writeFileSync(metadataPath, `${JSON.stringify(metadata, null, 2)}\n`);
    console.log(`${slug}: ${result.width} × ${result.height}`);
  }
} finally {
  await browser.close();
}
