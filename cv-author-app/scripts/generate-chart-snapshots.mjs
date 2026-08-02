import { cpus } from "node:os";
import { mkdir, readdir, stat } from "node:fs/promises";
import { dirname, extname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const scriptDirectory = dirname(fileURLToPath(import.meta.url));
const projectDirectory = resolve(scriptDirectory, "..");
const sourceDirectory = resolve(projectDirectory, "../charts_svg");
const outputDirectory = resolve(projectDirectory, "../charts_snapshots");
const snapshotWidth = 352;
const concurrency = Math.min(Math.max(cpus().length - 1, 1), 8);

await mkdir(outputDirectory, { recursive: true });

const sourceFiles = (await readdir(sourceDirectory))
  .filter((fileName) => extname(fileName).toLowerCase() === ".svg")
  .sort((left, right) => left.localeCompare(right, "en", { numeric: true }));

let nextIndex = 0;
let generatedCount = 0;
let skippedCount = 0;

async function generateSnapshot(fileName) {
  const sourcePath = join(sourceDirectory, fileName);
  const outputPath = join(outputDirectory, `${fileName.slice(0, -4)}.webp`);
  const [sourceStats, outputStats] = await Promise.all([
    stat(sourcePath),
    stat(outputPath).catch(() => null),
  ]);

  if (outputStats && outputStats.mtimeMs >= sourceStats.mtimeMs) {
    skippedCount += 1;
    return;
  }

  await sharp(sourcePath, { density: 144 })
    .resize({ width: snapshotWidth })
    .webp({ quality: 86, effort: 4, smartSubsample: true })
    .toFile(outputPath);
  generatedCount += 1;
}

async function runWorker() {
  while (nextIndex < sourceFiles.length) {
    const fileName = sourceFiles[nextIndex];
    nextIndex += 1;
    await generateSnapshot(fileName);
  }
}

await Promise.all(Array.from({ length: concurrency }, () => runWorker()));

console.log(
  `Chart snapshots ready: ${sourceFiles.length} total, ${generatedCount} generated, ${skippedCount} unchanged.`,
);
