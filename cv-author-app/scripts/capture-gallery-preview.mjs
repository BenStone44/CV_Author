import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import process from "node:process";
import { chromium } from "playwright";

const casesRoot = "public/site/gallery/cases";
const slugs = JSON.parse(await readFile(`${casesRoot}/index.json`, "utf8"));
const galleryCases = Object.fromEntries(await Promise.all(slugs.map(async (slug) => {
  const entry = JSON.parse(await readFile(`${casesRoot}/${slug}/case.json`, "utf8"));
  return [entry.completedCase, { outputPath: `${casesRoot}/${slug}/${entry.preview.path}`, metadataPath: `${casesRoot}/${slug}/case.json` }];
})));

function optionValue(name) {
  const inlinePrefix = `--${name}=`;
  const inline = process.argv.find((argument) => argument.startsWith(inlinePrefix));
  if (inline) return inline.slice(inlinePrefix.length);
  const index = process.argv.indexOf(`--${name}`);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

const baseUrlValue = optionValue("base-url");
const caseId = optionValue("case") ?? "academic-scores-nested-concat";
const registration = galleryCases[caseId];
const outputPath = registration?.outputPath;

if (!baseUrlValue) {
  throw new Error("Pass the user-owned Vite endpoint with --base-url, for example --base-url=http://127.0.0.1:5173");
}
if (!outputPath) {
  throw new Error(`Unknown Gallery case: ${caseId}`);
}

const baseUrl = new URL(baseUrlValue);
const caseUrl = new URL("editor/", `${baseUrl.href.replace(/\/$/, "")}/`);
caseUrl.searchParams.set("case", caseId);

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 1080 } });
page.on("console", (message) => {
  if (message.type() === "error") process.stderr.write(`Browser console: ${message.text()}\n`);
});
page.on("pageerror", (error) => {
  process.stderr.write(`Browser page error: ${error.message}\n`);
});

try {
  await page.goto(caseUrl.href, { waitUntil: "domcontentloaded", timeout: 30_000 });
  await page.waitForFunction(
    (expectedCaseId) => document.documentElement.dataset.caseId === expectedCaseId
      && ["ready", "error"].includes(document.documentElement.dataset.caseStatus ?? ""),
    caseId,
    { timeout: 30_000 },
  );

  const caseStatus = await page.evaluate(() => document.documentElement.dataset.caseStatus);
  if (caseStatus !== "ready") {
    const reason = await page.evaluate(() => document.documentElement.dataset.galleryStarterError);
    throw new Error(`Editor case did not render successfully (status: ${caseStatus ?? "missing"}, reason: ${reason ?? "missing"})`);
  }

  const svg = await page.evaluate(() => {
    const exported = window.__VISBRICKS_CASE_SVG__;
    return typeof exported === "string" ? exported : "";
  });
  if (!svg.startsWith("<svg") || !svg.endsWith("</svg>")) {
    throw new Error("Editor case reached ready state without a valid serialized SVG export");
  }

  const absoluteOutputPath = resolve(outputPath);
  await writeFile(absoluteOutputPath, svg, "utf8");
  const digest = createHash("sha256").update(svg).digest("hex");
  const metadata = JSON.parse(await readFile(registration.metadataPath, "utf8"));
  metadata.preview = {
    ...metadata.preview,
    source: caseUrl.href,
    capturedOn: new Date().toISOString().slice(0, 10),
    sha256: digest,
  };
  await writeFile(registration.metadataPath, `${JSON.stringify(metadata, null, 2)}\n`, "utf8");
  process.stdout.write([
    `Captured Gallery case: ${caseId}`,
    `Source: ${caseUrl.href}`,
    `Output: ${absoluteOutputPath}`,
    `SHA-256: ${digest}`,
    "",
  ].join("\n"));
} finally {
  await browser.close();
}
