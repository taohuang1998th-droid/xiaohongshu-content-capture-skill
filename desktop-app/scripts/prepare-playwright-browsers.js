const fs = require("fs");
const os = require("os");
const path = require("path");
const { spawnSync } = require("child_process");

const desktopRoot = path.resolve(__dirname, "..");
const playwrightCoreRoot = path.dirname(require.resolve("playwright-core/package.json"));
const browsersJson = JSON.parse(fs.readFileSync(path.join(playwrightCoreRoot, "browsers.json"), "utf8"));

const required = browsersJson.browsers
  .filter((browser) => browser.name === "chromium")
  .map((browser) => `${browser.name}-${browser.revision}`);

function defaultPlaywrightCacheRoot() {
  if (process.platform === "win32") {
    return path.join(process.env.LOCALAPPDATA || path.join(os.homedir(), "AppData", "Local"), "ms-playwright");
  }
  if (process.platform === "darwin") {
    return path.join(os.homedir(), "Library", "Caches", "ms-playwright");
  }
  return path.join(process.env.XDG_CACHE_HOME || path.join(os.homedir(), ".cache"), "ms-playwright");
}

const cacheRoot = process.env.PLAYWRIGHT_BROWSERS_PATH && process.env.PLAYWRIGHT_BROWSERS_PATH !== "0"
  ? process.env.PLAYWRIGHT_BROWSERS_PATH
  : defaultPlaywrightCacheRoot();
const targetRoot = path.join(desktopRoot, "build-resources", "ms-playwright");

function copyDir(src, dest) {
  fs.mkdirSync(dest, { recursive: true });
  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);
    if (entry.isDirectory()) copyDir(srcPath, destPath);
    else if (entry.isSymbolicLink()) fs.symlinkSync(fs.readlinkSync(srcPath), destPath);
    else fs.copyFileSync(srcPath, destPath);
  }
}

function ensureBrowserInstalled() {
  const missing = required.filter((name) => !fs.existsSync(path.join(cacheRoot, name)));
  if (!missing.length) return;

  const result = spawnSync(process.platform === "win32" ? "npx.cmd" : "npx", ["playwright", "install", "chromium"], {
    cwd: desktopRoot,
    stdio: "inherit",
    env: process.env,
  });
  if (result.status !== 0) {
    throw new Error("Failed to install Playwright Chromium.");
  }
}

ensureBrowserInstalled();
fs.rmSync(targetRoot, { recursive: true, force: true });
fs.mkdirSync(targetRoot, { recursive: true });

for (const name of required) {
  const src = path.join(cacheRoot, name);
  if (!fs.existsSync(src)) throw new Error(`Missing Playwright browser cache: ${src}`);
  copyDir(src, path.join(targetRoot, name));
  console.log(`Bundled ${name}`);
}
