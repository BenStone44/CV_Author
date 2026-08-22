import { watch } from "node:fs";
import { extname, resolve } from "node:path";
import { spawn } from "node:child_process";

const projectDir = resolve(import.meta.dirname);
const sourceExtensions = new Set([
  ".bib",
  ".bst",
  ".cfg",
  ".cls",
  ".csv",
  ".dat",
  ".def",
  ".eps",
  ".fd",
  ".jpeg",
  ".jpg",
  ".pdf",
  ".png",
  ".sty",
  ".svg",
  ".tex",
]);

let buildInProgress = false;
let rebuildRequested = false;
let debounceTimer;

function isSourceFile(filename) {
  if (!filename) {
    return false;
  }

  const normalizedFilename = filename.toString().replaceAll("\\", "/");
  if (normalizedFilename === "template.pdf") {
    return false;
  }

  return sourceExtensions.has(extname(normalizedFilename).toLowerCase());
}

function runBuild(reason) {
  if (buildInProgress) {
    rebuildRequested = true;
    return;
  }

  buildInProgress = true;
  rebuildRequested = false;
  console.log(`\n[latex] Building template.pdf (${reason})...`);

  const build = spawn("make", ["pdf"], {
    cwd: projectDir,
    stdio: "inherit",
  });

  build.on("error", (error) => {
    console.error(`[latex] Could not start the build: ${error.message}`);
  });

  build.on("close", (code) => {
    buildInProgress = false;

    if (code === 0) {
      console.log("[latex] template.pdf is up to date.");
    } else {
      console.error(`[latex] Build failed with exit code ${code}. Watching for changes...`);
    }

    if (rebuildRequested) {
      runBuild("changes received during the previous build");
    }
  });
}

function scheduleBuild(filename) {
  clearTimeout(debounceTimer);
  debounceTimer = setTimeout(() => runBuild(filename), 250);
}

const watcher = watch(projectDir, { recursive: true }, (_eventType, filename) => {
  if (isSourceFile(filename)) {
    scheduleBuild(filename.toString());
  }
});

watcher.on("error", (error) => {
  console.error(`[latex] File watcher failed: ${error.message}`);
  process.exitCode = 1;
});

console.log(`[latex] Watching ${projectDir}`);
console.log("[latex] Press Ctrl+C to stop.");
runBuild("initial build");
