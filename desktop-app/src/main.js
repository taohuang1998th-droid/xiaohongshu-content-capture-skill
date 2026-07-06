const { app, BrowserWindow, dialog, ipcMain, shell } = require("electron");
const path = require("path");
const fs = require("fs");
const { spawn } = require("child_process");

const repoRoot = path.resolve(__dirname, "..", "..");
const desktopRoot = path.resolve(__dirname, "..");
const desktopNodeModules = path.join(desktopRoot, "node_modules");
const skillRoot = path.join(repoRoot, "skills", "xiaohongshu-content-capture");
const collectorScript = path.join(skillRoot, "scripts", "collect_with_login.js");
const reportScript = path.join(skillRoot, "scripts", "daily_brief.py");

let mainWindow;
let activeRun = null;

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
    },
  });

  mainWindow.loadFile(path.join(__dirname, "renderer", "index.html"));
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

function send(channel, payload) {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send(channel, payload);
  }
}

function normalizeCreators(input) {
  return String(input || "")
    .split(/[\n,，;；]+/)
    .map((item) => item.trim())
    .filter(Boolean)
    .map((item) => (item.startsWith("@") ? item : `@${item}`));
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
      cwd: repoRoot,
      env: { ...process.env, ...(options.env || {}) },
      stdio: ["ignore", "pipe", "pipe"],
    });

    if (options.track) activeRun = child;

    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => {
      const text = chunk.toString();
      stdout += text;
      send("run-log", { stream: "stdout", text });
    });
    child.stderr.on("data", (chunk) => {
      const text = chunk.toString();
      stderr += text;
      send("run-log", { stream: "stderr", text });
    });
    child.on("error", reject);
    child.on("close", (code) => {
      if (options.track && activeRun === child) activeRun = null;
      if (code === 0) resolve({ stdout, stderr });
      else reject(new Error(`${path.basename(command)} exited with code ${code}\n${stderr}`));
    });
  });
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
  await shell.openPath(targetPath);
});

ipcMain.handle("cancel-run", () => {
  if (activeRun) {
    activeRun.kill("SIGTERM");
    activeRun = null;
    send("run-log", { stream: "stderr", text: "\nRun cancelled by user.\n" });
  }
});

async function startRun(rawConfig) {
  if (activeRun) throw new Error("A collection run is already active.");

  const creators = normalizeCreators(rawConfig.creators);
  if (!creators.length) throw new Error("Please add at least one creator handle.");

  const reportDate = rawConfig.reportDate || todayShanghai();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(reportDate)) {
    throw new Error("Report date must use YYYY-MM-DD.");
  }

  const language = rawConfig.language || "中文";
  const detail = rawConfig.detail || "普通";
  const detailLimit = String(rawConfig.detailLimit || 6);
  const playSeconds = String(rawConfig.playSeconds || 8);
  const baseDir = rawConfig.outputDir || appDataDir();
  const runDir = path.join(baseDir, `xhs-run-${reportDate}-${Date.now()}`);
  const outDir = path.join(runDir, "captures");
  const profileDir = path.join(baseDir, "xhs-browser-profile");
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
      "--detail-limit", detailLimit,
      "--play-seconds", playSeconds,
    ], {
      track: true,
      env: {
        ELECTRON_RUN_AS_NODE: "1",
        NODE_PATH: [desktopNodeModules, process.env.NODE_PATH || ""].filter(Boolean).join(path.delimiter),
      },
    });

    const packageFile = path.join(outDir, `xhs-watch-package-${reportDate}.json`);
    if (!fs.existsSync(packageFile)) throw new Error(`Collection package was not created: ${packageFile}`);

    const report = await runProcess("python3", [
      reportScript,
      "--package", packageFile,
      "--creators-file", creatorsFile,
      "--report-date", reportDate,
      "--language", language,
      "--detail", detail,
    ]);

    const reportPath = path.join(runDir, "report.md");
    fs.writeFileSync(reportPath, report.stdout, "utf8");
    send("run-state", { running: false, runDir, report: report.stdout, reportPath, packageFile });
    return { ok: true, runDir, report: report.stdout, reportPath, packageFile };
  } catch (error) {
    send("run-state", { running: false, runDir, error: error.message });
    throw error;
  }
}

ipcMain.handle("start-run", async (_event, rawConfig) => {
  try {
    return await startRun(rawConfig);
  } catch (error) {
    return { ok: false, error: error.message };
  }
});
