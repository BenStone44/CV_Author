import { createHash } from "node:crypto";
import {
  cpSync,
  existsSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  renameSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import { chromium } from "playwright";

const appDir = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const sourceDir = resolve(appDir, "..");
const publicOrigin = "https://visbricks.github.io";
const pagesRepository = "git@github.com:VisBricks/visbricks.github.io.git";
const deployKey = "/home/jovyan/.ssh/visbricks_pages_deploy";
const deployKeyFingerprint = "SHA256:F/IfvYwTRWEPRoM/r7Fv8LHiTMpuGaS1FvrHkSy1JFE";
const releaseIdentity = "VisBricks <visbricks-site@users.noreply.github.com>";
const publish = process.argv.includes("--publish");
const messageArgument = process.argv.find((argument) => argument.startsWith("--message="));
const commitMessage = messageArgument?.slice("--message=".length)
  || "Publish expanded gallery and nested visualization updates";
const sshCommand = [
  "ssh",
  "-o", "BatchMode=yes",
  "-o", "IdentitiesOnly=yes",
  "-o", "IdentityAgent=none",
  "-o", "ConnectTimeout=10",
  "-o", "ServerAliveInterval=5",
  "-o", "ServerAliveCountMax=2",
  "-i", deployKey,
].join(" ");

function fail(message) {
  throw new Error(message);
}

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: options.cwd ?? appDir,
    env: { ...process.env, ...options.env },
    encoding: "utf8",
    stdio: options.capture ? "pipe" : "inherit",
  });
  if (result.error) throw result.error;
  if (!options.allowFailure && result.status !== 0) {
    fail(`${command} ${args.join(" ")} failed with exit code ${result.status}`);
  }
  return result;
}

function output(command, args, options = {}) {
  return run(command, args, { ...options, capture: true }).stdout.trim();
}

function listFiles(root, includeHidden = false) {
  const files = [];
  const visit = (directory) => {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      if (!includeHidden && entry.name.startsWith(".")) continue;
      const path = join(directory, entry.name);
      if (entry.isDirectory()) visit(path);
      else if (entry.isFile()) files.push(relative(root, path).split(sep).join("/"));
    }
  };
  visit(root);
  return files.sort();
}

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function validateSource() {
  const nodeMajor = Number(process.versions.node.split(".")[0]);
  if (nodeMajor !== 22 && nodeMajor < 24) {
    fail(`Node ${process.versions.node} does not satisfy ^22.18.0 or >=24.12.0`);
  }
  if (output("git", ["status", "--porcelain"], { cwd: sourceDir })) {
    fail("Source worktree is not clean. Commit or set aside reviewed changes before releasing.");
  }
  const fingerprint = output("ssh-keygen", ["-lf", `${deployKey}.pub`], { cwd: sourceDir });
  if (!fingerprint.includes(deployKeyFingerprint)) fail("The Pages deploy-key fingerprint does not match the reviewed key.");
  const auth = run("ssh", [
    "-T", "-o", "BatchMode=yes", "-o", "IdentitiesOnly=yes", "-o", "IdentityAgent=none",
    "-o", "ConnectTimeout=10", "-i", deployKey, "git@github.com",
  ], { capture: true, allowFailure: true, cwd: sourceDir });
  const authMessage = `${auth.stdout}\n${auth.stderr}`;
  if (auth.status !== 1 || !authMessage.includes("Hi VisBricks/visbricks.github.io!")) {
    fail("GitHub did not authenticate the reviewed repository-scoped Pages identity.");
  }
}

function configurePagesCheckout(pagesDir) {
  run("git", ["-C", pagesDir, "config", "--local", "core.sshCommand", sshCommand]);
  run("git", ["-C", pagesDir, "config", "--local", "user.name", "VisBricks"]);
  run("git", ["-C", pagesDir, "config", "--local", "user.email", "visbricks-site@users.noreply.github.com"]);
  run("git", ["-C", pagesDir, "config", "--local", "commit.gpgsign", "false"]);

  const identities = output("git", ["-C", pagesDir, "log", "--format=%an <%ae>%x09%cn <%ce>"]);
  const unexpected = identities.split("\n").filter((line) => line !== `${releaseIdentity}\t${releaseIdentity}`);
  if (unexpected.length) fail("The public repository contains an unexpected author or committer identity.");
  run("git", ["-C", pagesDir, "push", "--dry-run", "origin", "HEAD:refs/heads/main"], {
    env: { GIT_SSH_COMMAND: sshCommand },
  });
}

function validateThirdPartyNotices(noticePath) {
  const lock = JSON.parse(readFileSync(join(appDir, "package-lock.json"), "utf8"));
  const expected = [];
  for (const [location, metadata] of Object.entries(lock.packages)) {
    if (!location.includes("node_modules/") || metadata.dev) continue;
    const packageDir = resolve(appDir, location);
    if (!existsSync(packageDir)) fail(`Installed runtime package is missing: ${location}`);
    const packageMetadata = JSON.parse(readFileSync(join(packageDir, "package.json"), "utf8"));
    const licenseFiles = readdirSync(packageDir).filter((name) => {
      const path = join(packageDir, name);
      return /^(licen[cs]e|copying|notice)(\.|$)/i.test(name) && statSync(path).isFile();
    });
    if (licenseFiles.length) expected.push(`${packageMetadata.name} ${packageMetadata.version}`);
  }

  const notice = readFileSync(noticePath, "utf8");
  const actual = [...notice.matchAll(/^========================================================================\n([^\n]+)\n/gm)]
    .map((match) => match[1]);
  const counts = (values) => values.reduce((map, value) => map.set(value, (map.get(value) ?? 0) + 1), new Map());
  const expectedCounts = counts(expected);
  const actualCounts = counts(actual);
  const mismatch = [...new Set([...expectedCounts.keys(), ...actualCounts.keys()])]
    .filter((name) => expectedCounts.get(name) !== actualCounts.get(name));
  if (mismatch.length) {
    fail(`THIRD_PARTY_LICENSES.txt is stale for: ${mismatch.join(", ")}`);
  }
}

function postprocessBuild(buildDir, pagesDir) {
  const casesDir = join(buildDir, "site/gallery/cases");
  const slugs = JSON.parse(readFileSync(join(casesDir, "index.json"), "utf8"));
  const cases = slugs.map((slug) => {
    const path = join(casesDir, slug, "case.json");
    const metadata = JSON.parse(readFileSync(path, "utf8"));
    if (metadata.slug !== slug || !metadata.starter || !metadata.completedCase || !metadata.preview?.path) {
      fail(`Gallery metadata is incomplete for ${slug}`);
    }
    metadata.preview.source = `${publicOrigin}/editor/?case=${encodeURIComponent(metadata.completedCase)}`;
    for (const key of ["sourceBranch", "sourceCommit", "sourceWorktree"]) delete metadata[key];
    writeFileSync(path, `${JSON.stringify(metadata, null, 2)}\n`);
    return metadata;
  });

  const noticeSource = join(pagesDir, "THIRD_PARTY_LICENSES.txt");
  if (!existsSync(noticeSource)) fail("The reviewed public checkout has no THIRD_PARTY_LICENSES.txt to preserve.");
  validateThirdPartyNotices(noticeSource);
  cpSync(noticeSource, join(buildDir, "THIRD_PARTY_LICENSES.txt"));

  for (const file of listFiles(buildDir).filter((path) => path.endsWith(".html"))) {
    const path = join(buildDir, file);
    let html = readFileSync(path, "utf8");
    if (!html.includes('rel="license"')) {
      html = html.replace(
        /(<meta charset="[^"]+">)/,
        '$1\n    <link rel="license" href="/THIRD_PARTY_LICENSES.txt">',
      );
      writeFileSync(path, html);
    }
  }
  return cases;
}

function auditBuild(buildDir) {
  const files = listFiles(buildDir, true);
  const forbiddenFiles = files.filter((path) => (
    path.endsWith(".map")
    || path.endsWith(".log")
    || path.startsWith(".git/")
    || path.toLowerCase().includes("screenshot")
  ));
  if (forbiddenFiles.length) fail(`Forbidden release files: ${forbiddenFiles.join(", ")}`);

  const sourceIdentities = output("git", ["log", "--format=%an%x00%ae%x00%cn%x00%ce", "--all"], { cwd: sourceDir })
    .split(/\0|\n/)
    .map((value) => value.trim())
    .filter((value) => (
      value
      && value !== "null"
      && value !== "null.com"
      && value !== "VisBricks"
      && value !== "visbricks-site@users.noreply.github.com"
    ));
  const remotes = output("git", ["remote", "-v"], { cwd: sourceDir });
  const remoteTokens = [...remotes.matchAll(/github\.com[:/]([^/\s]+)\/([^\s.]+)/g)]
    .flatMap((match) => [match[1], match[2]])
    .filter((value) => value !== "VisBricks" && value !== "visbricks.github.io");
  const forbiddenText = [...new Set([
    ...sourceIdentities,
    ...remoteTokens,
    sourceDir,
    "/home/jovyan",
    output("git", ["branch", "--show-current"], { cwd: sourceDir }),
  ].filter((value) => value.length >= 4))];

  const matches = [];
  for (const file of files) {
    const path = join(buildDir, file);
    const content = readFileSync(path);
    for (const value of forbiddenText) {
      if (content.includes(Buffer.from(value))) matches.push(`${file}: ${value}`);
    }
    if (file !== "THIRD_PARTY_LICENSES.txt") {
      const text = content.toString("utf8");
      const email = text.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i)?.[0];
      if (email) matches.push(`${file}: email address ${email}`);
      if (/file:\/\/[/\\](home|Users)[/\\][^\s"'<>]+/.test(text)) matches.push(`${file}: local filesystem path`);
    }
  }
  if (matches.length) fail(`Release identity audit failed:\n${matches.slice(0, 20).join("\n")}`);
}

function syncBuild(buildDir, pagesDir, backupDir) {
  const buildFiles = new Set(listFiles(buildDir));
  const preserved = new Set([".nojekyll"]);
  const stale = listFiles(pagesDir).filter((path) => !buildFiles.has(path) && !preserved.has(path));
  const removable = stale.filter((path) => /^assets\/.+-[A-Za-z0-9_-]{8,}\.(css|js)$/.test(path));
  const unsafe = stale.filter((path) => !removable.includes(path));
  if (unsafe.length) {
    fail(`Refusing to retain or remove unreviewed stale public files:\n${unsafe.join("\n")}`);
  }
  for (const file of removable) {
    const target = join(backupDir, file);
    run("mkdir", ["-p", dirname(target)]);
    renameSync(join(pagesDir, file), target);
  }
  cpSync(buildDir, pagesDir, { recursive: true });
  return removable;
}

const mimeTypes = new Map([
  [".css", "text/css; charset=utf-8"],
  [".csv", "text/csv; charset=utf-8"],
  [".geojson", "application/geo+json; charset=utf-8"],
  [".html", "text/html; charset=utf-8"],
  [".js", "text/javascript; charset=utf-8"],
  [".json", "application/json; charset=utf-8"],
  [".svg", "image/svg+xml"],
  [".txt", "text/plain; charset=utf-8"],
]);

function extension(path) {
  const match = path.match(/(\.[^.\/]+)$/);
  return match?.[1].toLowerCase() ?? "";
}

async function verifyBrowser(buildDir, cases, local, releaseSha = "") {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ serviceWorkers: "block" });
  if (local) {
    await context.route(`${publicOrigin}/**`, async (route) => {
      const url = new URL(route.request().url());
      let requestPath = decodeURIComponent(url.pathname).replace(/^\/+/, "");
      if (!requestPath || requestPath.endsWith("/")) requestPath += "index.html";
      const file = resolve(buildDir, requestPath);
      if (!file.startsWith(`${buildDir}${sep}`) || !existsSync(file) || !statSync(file).isFile()) {
        await route.fulfill({ status: 404, body: "Not found" });
        return;
      }
      await route.fulfill({
        status: 200,
        contentType: mimeTypes.get(extension(file)) ?? "application/octet-stream",
        body: readFileSync(file),
      });
    });
  }

  const verifyPage = async (path, check) => {
    const page = await context.newPage();
    const failures = [];
    page.on("pageerror", (error) => failures.push(`page error: ${error.message}`));
    page.on("requestfailed", (request) => {
      if (new URL(request.url()).origin === publicOrigin) failures.push(`request failed: ${request.url()}`);
    });
    const separator = path.includes("?") ? "&" : "?";
    const url = `${publicOrigin}${path}${releaseSha ? `${separator}release=${releaseSha}` : ""}`;
    const response = await page.goto(url, { waitUntil: "domcontentloaded", timeout: 60_000 });
    if (!response?.ok()) fail(`${url} returned ${response?.status() ?? "no response"}`);
    await check(page);
    if (failures.length) fail(`${url}\n${failures.join("\n")}`);
    await page.close();
  };

  try {
    await verifyPage("/", async (page) => {
      await page.waitForSelector("main h1", { timeout: 20_000 });
    });
    await verifyPage("/gallery/", async (page) => {
      await page.waitForFunction((expected) => (
        document.querySelectorAll('a[href*="/gallery/example/"]').length === expected
      ), cases.length, { timeout: 20_000 });
      const links = await page.locator('a[href*="/gallery/example/"]').evaluateAll((elements) =>
        elements.map((element) => element.getAttribute("href")));
      if (!links[1]?.includes("example=shared-hierarchy")) throw new Error("Shared Hierarchy is not the second Gallery card.");
    });
    await verifyPage("/gallery/example/?example=shared-hierarchy", async (page) => {
      await page.waitForSelector("main h1", { timeout: 20_000 });
      const starterHref = await page.locator('a[href*="starter=shared-hierarchy"]').first().getAttribute("href");
      if (!starterHref) throw new Error("Shared Hierarchy detail page has no matching starter link.");
    });
    await verifyPage("/tutorials/", async (page) => page.waitForSelector("main h1", { timeout: 20_000 }));
    await verifyPage("/api/", async (page) => page.waitForSelector("main h1", { timeout: 20_000 }));
    await verifyPage("/editor/", async (page) => page.waitForSelector("#app", { timeout: 20_000 }));

    for (const metadata of cases) {
      await verifyPage(`/editor/?starter=${encodeURIComponent(metadata.starter)}`, async (page) => {
        await page.waitForFunction(({ id }) => (
          document.documentElement.dataset.starterId === id
          && ["ready", "error"].includes(document.documentElement.dataset.starterStatus ?? "")
        ), { id: metadata.starter }, { timeout: 60_000 });
        const state = await page.evaluate(() => ({
          status: document.documentElement.dataset.starterStatus,
          error: document.documentElement.dataset.galleryStarterError,
          nodes: document.querySelectorAll(".canvas-object").length,
        }));
        if (state.status !== "ready" || state.nodes < metadata.blocks.length) {
          throw new Error(`Starter ${metadata.starter} failed: ${JSON.stringify(state)}`);
        }
      });
      await verifyPage(`/editor/?case=${encodeURIComponent(metadata.completedCase)}`, async (page) => {
        await page.waitForFunction(({ id }) => (
          document.documentElement.dataset.caseId === id
          && ["ready", "error"].includes(document.documentElement.dataset.caseStatus ?? "")
        ), { id: metadata.completedCase }, { timeout: 90_000 });
        const state = await page.evaluate(() => ({
          status: document.documentElement.dataset.caseStatus,
          error: document.documentElement.dataset.galleryStarterError,
          svg: window.__VISBRICKS_CASE_SVG__,
        }));
        if (state.status !== "ready" || !state.svg?.startsWith("<svg") || state.svg.length < 100) {
          throw new Error(`Case ${metadata.completedCase} failed: ${state.error ?? state.status}`);
        }
      });
    }
  } finally {
    await browser.close();
  }
}

async function waitForPagesWorkflow(releaseSha) {
  const deadline = Date.now() + 10 * 60_000;
  while (Date.now() < deadline) {
    const response = await fetch("https://api.github.com/repos/VisBricks/visbricks.github.io/actions/runs?per_page=20", {
      headers: { Accept: "application/vnd.github+json", "User-Agent": "VisBricks-release" },
    });
    if (!response.ok) fail(`GitHub Actions API returned ${response.status}`);
    const data = await response.json();
    const workflow = data.workflow_runs?.find((run) => run.head_sha === releaseSha && run.name === "pages build and deployment");
    if (workflow?.status === "completed") {
      if (workflow.conclusion !== "success") fail(`Pages workflow ${workflow.id} concluded ${workflow.conclusion}`);
      return workflow;
    }
    await new Promise((resolvePromise) => setTimeout(resolvePromise, 10_000));
  }
  fail(`Timed out waiting for the Pages workflow for ${releaseSha}`);
}

async function compareLiveFiles(buildDir, releaseSha, removedFiles) {
  for (const file of listFiles(buildDir)) {
    const local = readFileSync(join(buildDir, file));
    const response = await fetch(`${publicOrigin}/${file}?release=${releaseSha}`, { cache: "no-store" });
    if (!response.ok) fail(`Live file /${file} returned ${response.status}`);
    const live = Buffer.from(await response.arrayBuffer());
    if (sha256(local) !== sha256(live)) fail(`Live file differs from the staged release: /${file}`);
  }
  for (const file of removedFiles) {
    const response = await fetch(`${publicOrigin}/${file}?release=${releaseSha}`, { cache: "no-store" });
    if (response.status !== 404) fail(`Removed asset is still public: /${file} (${response.status})`);
  }
}

async function main() {
  console.log(`Mode: ${publish ? "publish" : "prepare only"}`);
  validateSource();
  run("npm", ["run", "generate:site-api"]);
  if (output("git", ["status", "--porcelain"], { cwd: sourceDir })) {
    fail("The generated API catalog changed. Review and commit it before releasing.");
  }

  const releaseDir = mkdtempSync(join(tmpdir(), "visbricks-release."));
  const pagesDir = join(releaseDir, "pages");
  const buildDir = join(releaseDir, "build");
  const backupDir = join(releaseDir, "obsolete-backup");
  console.log(`Release workspace: ${releaseDir}`);

  run("git", ["clone", "--branch", "main", "--single-branch", pagesRepository, pagesDir], {
    cwd: sourceDir,
    env: { GIT_SSH_COMMAND: sshCommand },
  });
  configurePagesCheckout(pagesDir);
  run("npm", ["run", "type-check"]);
  run(join(appDir, "node_modules/.bin/vite"), ["build", "--outDir", buildDir, "--emptyOutDir"]);
  const cases = postprocessBuild(buildDir, pagesDir);
  auditBuild(buildDir);
  const removedFiles = syncBuild(buildDir, pagesDir, backupDir);
  run("git", ["-C", pagesDir, "diff", "--check"]);
  await verifyBrowser(buildDir, cases, true);

  run("git", ["-C", pagesDir, "add", "-A"]);
  run("git", ["-C", pagesDir, "diff", "--cached", "--stat"]);
  run("git", ["-C", pagesDir, "-c", "core.whitespace=cr-at-eol", "diff", "--cached", "--check"]);
  if (!output("git", ["-C", pagesDir, "diff", "--cached", "--name-only"])) {
    console.log("No public artifact changes; no release commit was created.");
    return;
  }
  if (!publish) {
    console.log(`Prepared and verified release. Review it at ${pagesDir}, then rerun with --publish.`);
    return;
  }

  run("git", ["-C", pagesDir, "-c", "commit.gpgsign=false", "commit", "-m", commitMessage], {
    env: {
      GIT_AUTHOR_NAME: "VisBricks",
      GIT_AUTHOR_EMAIL: "visbricks-site@users.noreply.github.com",
      GIT_COMMITTER_NAME: "VisBricks",
      GIT_COMMITTER_EMAIL: "visbricks-site@users.noreply.github.com",
    },
  });
  const releaseSha = output("git", ["-C", pagesDir, "rev-parse", "HEAD"]);
  const releaseMetadata = output("git", ["-C", pagesDir, "log", "-1", "--format=%an <%ae>%n%cn <%ce>%n%s"]);
  const [author, committer, subject] = releaseMetadata.split("\n");
  if (author !== releaseIdentity || committer !== releaseIdentity || subject !== commitMessage) {
    fail("Release commit metadata failed the final identity check.");
  }
  run("git", ["-C", pagesDir, "push", "origin", "HEAD:refs/heads/main"], {
    env: { GIT_SSH_COMMAND: sshCommand },
  });
  if (output("git", ["-C", pagesDir, "status", "--porcelain"])) fail("Pages checkout is dirty after push.");

  const workflow = await waitForPagesWorkflow(releaseSha);
  await verifyBrowser(buildDir, cases, false, releaseSha);
  await compareLiveFiles(buildDir, releaseSha, removedFiles);
  console.log(JSON.stringify({
    releaseSha,
    workflowId: workflow.id,
    workflowUrl: workflow.html_url,
    galleryCases: cases.length,
    verifiedFiles: listFiles(buildDir).length,
    removedFiles,
    releaseDir,
  }, null, 2));
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack : error);
  process.exitCode = 1;
});
