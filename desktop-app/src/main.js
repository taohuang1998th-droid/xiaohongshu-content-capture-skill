const { app, BrowserWindow, dialog, ipcMain, shell } = require("electron");
const path = require("path");
const fs = require("fs");
const { spawn } = require("child_process");
const { enumOption, integerOption, isValidIsoDate, normalizeCreators } = require("./config");

const MAX_CAPTURED_OUTPUT_CHARS = 2_000_000;

const repoRoot = path.resolve(__dirname, "..", "..");
const desktopRoot = app.isPackaged ? process.resourcesPath : path.resolve(__dirname, "..");
const desktopNodeModules = app.isPackaged
  ? path.join(process.resourcesPath, "app.asar", "node_modules")
  : path.join(desktopRoot, "node_modules");
const skillRoot = app.isPackaged
  ? path.join(process.resourcesPath, "skill")
  : path.join(repoRoot, "skills", "xiaohongshu-content-capture");
const bundledPlaywrightBrowsers = app.isPackaged
  ? path.join(process.resourcesPath, "ms-playwright")
  : "";
const collectorScript = path.join(skillRoot, "scripts", "collect_with_login.js");
const reportScript = path.join(skillRoot, "scripts", "daily_brief.py");

let mainWindow;
let activeRun = null;
let runInProgress = false;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1180,
    height: 780,
    minWidth: 980,
    minHeight: 680,
    title: "Xiaohongshu Content Capture",
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  mainWindow.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
  mainWindow.loadFile(path.join(__dirname, "renderer", "index.html"));
  mainWindow.on("closed", () => {
    mainWindow = null;
  });
}

app.whenReady().then(createWindow);

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});

app.on("activate", () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});

function appDataDir() {
  const dir = path.join(app.getPath("userData"), "workspace");
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

function processCwd() {
  return appDataDir();
}

function send(channel, payload) {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send(channel, payload);
  }
}

function todayShanghai() {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Shanghai",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());
  const dict = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${dict.year}-${dict.month}-${dict.day}`;
}

function runProcess(command, args, options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: processCwd(),
      env: { ...process.env, ...(options.env || {}) },
      stdio: ["ignore", "pipe", "pipe"],
      windowsHide: true,
    });

    if (options.track) activeRun = child;

    let stdout = "";
    let stderr = "";
    let settled = false;
    const appendOutput = (current, value) => {
      const next = current + value;
      return next.length <= MAX_CAPTURED_OUTPUT_CHARS ? next : next.slice(-MAX_CAPTURED_OUTPUT_CHARS);
    };
    const finish = (error, result) => {
      if (settled) return;
      settled = true;
      if (options.track && activeRun === child) activeRun = null;
      if (error) reject(error);
      else resolve(result);
    };
    child.stdout.on("data", (chunk) => {
      const text = chunk.toString();
      stdout = appendOutput(stdout, text);
      send("run-log", { stream: "stdout", text });
    });
    child.stderr.on("data", (chunk) => {
      const text = chunk.toString();
      stderr = appendOutput(stderr, text);
      send("run-log", { stream: "stderr", text });
    });
    child.on("error", (error) => finish(error));
    child.on("close", (code) => {
      if (code === 0) finish(null, { stdout, stderr });
      else finish(new Error(`${path.basename(command)} exited with code ${code}\n${stderr}`));
    });
  });
}

function commandExists(command, args = []) {
  const result = spawn(command, args, {
    cwd: processCwd(),
    env: process.env,
    stdio: ["ignore", "ignore", "ignore"],
    windowsHide: true,
  });
  return new Promise((resolve) => {
    let settled = false;
    let timer;
    const finish = (value) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve(value);
    };
    timer = setTimeout(() => {
      result.kill();
      finish(false);
    }, 5000);
    result.on("error", () => finish(false));
    result.on("close", (code) => finish(code === 0));
  });
}

async function resolvePython() {
  const candidates = process.platform === "win32"
    ? [
        { command: "py", args: ["-3"] },
        { command: "python", args: [] },
        { command: "python3", args: [] },
      ]
    : [
        { command: "python3", args: [] },
        { command: "python", args: [] },
      ];

  for (const candidate of candidates) {
    if (await commandExists(candidate.command, [...candidate.args, "--version"])) return candidate;
  }

  throw new Error("Python 3 was not found. Install Python 3 and make sure it is available in PATH.");
}

ipcMain.handle("get-defaults", () => {
  return {
    reportDate: todayShanghai(),
    workspaceDir: appDataDir(),
  };
});

ipcMain.handle("choose-output-dir", async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    title: "Choose output folder",
    properties: ["openDirectory", "createDirectory"],
  });
  return result.canceled ? "" : result.filePaths[0];
});

ipcMain.handle("open-path", async (_event, targetPath) => {
  if (!targetPath) return;
  const resolved = path.resolve(String(targetPath));
  if (!fs.existsSync(resolved)) throw new Error(`Path does not exist: ${resolved}`);
  const error = await shell.openPath(resolved);
  if (error) throw new Error(error);
});

ipcMain.handle("cancel-run", () => {
  if (activeRun) {
    activeRun.kill("SIGTERM");
    send("run-log", { stream: "stderr", text: "\nRun cancelled by user.\n" });
    return true;
  }
  return false;
});

async function startRun(rawConfig) {
  if (activeRun) throw new Error("A collection run is already active.");

  const creators = normalizeCreators(rawConfig.creators);
  if (!creators.length) throw new Error("Please add at least one creator handle.");

  const reportDate = rawConfig.reportDate || todayShanghai();
  if (!isValidIsoDate(reportDate)) {
    throw new Error("Report date must use YYYY-MM-DD.");
  }

  const language = enumOption(rawConfig.language, "双语", ["中文", "英文", "双语"], "Language");
  const detail = enumOption(rawConfig.detail, "详细", ["极简", "普通", "详细"], "Detail level");
  const detailLimit = integerOption(rawConfig.detailLimit, 6, 1, 50, "Creator post limit");
  const videoFrameCount = integerOption(rawConfig.videoFrameCount, 6, 4, 24, "Video frame count");
  const baseDir = path.resolve(String(rawConfig.outputDir || appDataDir()));
  const runDir = path.join(baseDir, `xhs-run-${reportDate}-${Date.now()}`);
  const outDir = path.join(runDir, "captures");
  const profileDir = path.join(baseDir, "xhs-browser-profile");
  const archiveDir = path.join(baseDir, "daily-reports");
  const creatorsFile = path.join(runDir, "creators.txt");

  fs.mkdirSync(runDir, { recursive: true });
  fs.mkdirSync(outDir, { recursive: true });
  fs.writeFileSync(creatorsFile, `${creators.join("\n")}\n`, "utf8");

  send("run-state", { running: true, runDir, report: "" });
  send("run-log", { stream: "stdout", text: `Run folder: ${runDir}\nCreators: ${creators.join(", ")}\n\n` });

  try {
    await runProcess(process.execPath, [
      collectorScript,
      "--creators-file", creatorsFile,
      "--report-date", reportDate,
      "--out-dir", outDir,
      "--profile-dir", profileDir,
      "--detail-limit", String(detailLimit),
      "--video-playback-rate", "max",
      "--video-frame-count", String(videoFrameCount),
    ], {
      track: true,
      env: {
        ELECTRON_RUN_AS_NODE: "1",
        NODE_PATH: [desktopNodeModules, process.env.NODE_PATH || ""].filter(Boolean).join(path.delimiter),
        ...(bundledPlaywrightBrowsers ? { PLAYWRIGHT_BROWSERS_PATH: bundledPlaywrightBrowsers } : {}),
      },
    });

    const packageFile = path.join(outDir, `xhs-watch-package-${reportDate}.json`);
    if (!fs.existsSync(packageFile)) throw new Error(`Collection package was not created: ${packageFile}`);

    const python = await resolvePython();
    await runProcess(python.command, [
      ...python.args,
      reportScript,
      "--package", packageFile,
      "--creators-file", creatorsFile,
      "--report-date", reportDate,
      "--language", language,
      "--detail", detail,
      "--archive-dir", archiveDir,
      "--no-stdout",
    ]);

    const reportPath = path.join(archiveDir, `${reportDate}.md`);
    const historyPath = path.join(archiveDir, "index.md");
    if (!fs.existsSync(reportPath)) throw new Error(`Daily report was not created: ${reportPath}`);
    const report = fs.readFileSync(reportPath, "utf8");
    send("run-state", { running: false, runDir, report, reportPath, historyPath, packageFile });
    return { ok: true, runDir, report, reportPath, historyPath, packageFile };
  } catch (error) {
    send("run-state", { running: false, runDir, error: error.message });
    throw error;
  }
}

ipcMain.handle("start-run", async (_event, rawConfig) => {
  if (runInProgress) return { ok: false, error: "A collection run is already active." };
  runInProgress = true;
  try {
    return await startRun(rawConfig);
  } catch (error) {
    return { ok: false, error: error.message };
  } finally {
    runInProgress = false;
  }
});
