const state = {
  language: "双语",
  detail: "详细",
  running: false,
  cancelRequested: false,
  runDir: "",
  reportPath: "",
  historyPath: "",
};

const els = {
  creators: document.querySelector("#creators"),
  reportDate: document.querySelector("#reportDate"),
  detailLimit: document.querySelector("#detailLimit"),
  videoFrameCount: document.querySelector("#videoFrameCount"),
  outputDir: document.querySelector("#outputDir"),
  chooseDir: document.querySelector("#chooseDir"),
  start: document.querySelector("#start"),
  cancel: document.querySelector("#cancel"),
  status: document.querySelector("#status"),
  report: document.querySelector("#report"),
  log: document.querySelector("#log"),
  openRunDir: document.querySelector("#openRunDir"),
  openReport: document.querySelector("#openReport"),
  openHistory: document.querySelector("#openHistory"),
};

function setStatus(text, tone = "") {
  els.status.textContent = text;
  els.status.dataset.tone = tone;
}

function markdownToHtml(markdown) {
  const escape = (value) => value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
  return escape(markdown || "")
    .split("\n")
    .map((line) => {
      if (line.startsWith("# ")) return `<h1>${line.slice(2)}</h1>`;
      if (line.startsWith("## ")) return `<h2>${line.slice(3)}</h2>`;
      if (line.startsWith("### ")) return `<h3>${line.slice(4)}</h3>`;
      if (line.startsWith("- ")) return `<p class="bullet">${line.slice(2)}</p>`;
      if (!line.trim()) return "<br>";
      return `<p>${line}</p>`;
    })
    .join("");
}

function setRunning(running) {
  state.running = running;
  els.start.disabled = running;
  els.cancel.disabled = !running;
  document.body.classList.toggle("running", running);
}

function selectButton(groupSelector, attrName, value) {
  document.querySelectorAll(groupSelector).forEach((button) => {
    const selected = button.dataset[attrName] === value;
    button.classList.toggle("selected", selected);
  });
}

document.querySelectorAll("[data-language]").forEach((button) => {
  button.addEventListener("click", () => {
    state.language = button.dataset.language;
    selectButton("[data-language]", "language", state.language);
  });
});

document.querySelectorAll("[data-detail]").forEach((button) => {
  button.addEventListener("click", () => {
    state.detail = button.dataset.detail;
    selectButton("[data-detail]", "detail", state.detail);
  });
});

document.querySelectorAll("[data-tab]").forEach((button) => {
  button.addEventListener("click", () => {
    const tab = button.dataset.tab;
    document.querySelectorAll("[data-tab]").forEach((item) => item.classList.toggle("selected", item === button));
    els.report.classList.toggle("hidden", tab !== "report");
    els.log.classList.toggle("hidden", tab !== "log");
  });
});

els.chooseDir.addEventListener("click", async () => {
  const dir = await window.xhsApp.chooseOutputDir();
  if (dir) els.outputDir.value = dir;
});

els.cancel.addEventListener("click", async () => {
  state.cancelRequested = true;
  await window.xhsApp.cancelRun();
  els.cancel.disabled = true;
  setStatus("正在停止", "warn");
});

els.openRunDir.addEventListener("click", () => {
  if (state.runDir) window.xhsApp.openPath(state.runDir);
});

els.openReport.addEventListener("click", () => {
  if (state.reportPath) window.xhsApp.openPath(state.reportPath);
});

els.openHistory.addEventListener("click", () => {
  if (state.historyPath) window.xhsApp.openPath(state.historyPath);
});

els.start.addEventListener("click", async () => {
  els.log.textContent = "";
  els.report.innerHTML = "正在采集，完成后会显示简报。";
  els.report.classList.add("empty");
  setRunning(true);
  state.cancelRequested = false;
  setStatus("运行中", "busy");
  state.runDir = "";
  state.reportPath = "";
  state.historyPath = "";
  els.openRunDir.disabled = true;
  els.openReport.disabled = true;
  els.openHistory.disabled = true;

  try {
    const result = await window.xhsApp.startRun({
      creators: els.creators.value,
      reportDate: els.reportDate.value,
      language: state.language,
      detail: state.detail,
      detailLimit: Number(els.detailLimit.value),
      videoFrameCount: Number(els.videoFrameCount.value),
      outputDir: els.outputDir.value,
    });
    if (!result.ok) throw new Error(result.error || "运行失败");
    state.runDir = result.runDir;
    state.reportPath = result.reportPath;
    state.historyPath = result.historyPath;
    els.report.classList.remove("empty");
    els.report.innerHTML = markdownToHtml(result.report);
    els.openRunDir.disabled = false;
    els.openReport.disabled = false;
    els.openHistory.disabled = !state.historyPath;
    setStatus("简报已生成", "ok");
  } catch (error) {
    if (state.cancelRequested) {
      els.report.textContent = "采集已停止，本次未完成的内容不会进入简报分析。";
      setStatus("已停止", "warn");
    } else {
      els.report.textContent = error.message;
      setStatus("运行失败", "error");
    }
  } finally {
    setRunning(false);
  }
});

window.xhsApp.onLog(({ stream, text }) => {
  const next = els.log.textContent + text;
  els.log.textContent = next.length > 500000 ? next.slice(-500000) : next;
  els.log.scrollTop = els.log.scrollHeight;
  if (stream === "stderr") setStatus("运行中，有提示信息", "warn");
});

window.xhsApp.onState((payload) => {
  if (payload.runDir) {
    state.runDir = payload.runDir;
    els.openRunDir.disabled = false;
  }
  if (payload.reportPath) {
    state.reportPath = payload.reportPath;
    els.openReport.disabled = false;
  }
  if (payload.historyPath) {
    state.historyPath = payload.historyPath;
    els.openHistory.disabled = false;
  }
  if (payload.report) {
    els.report.classList.remove("empty");
    els.report.innerHTML = markdownToHtml(payload.report);
  }
  if (payload.error && !state.cancelRequested) {
    els.report.textContent = payload.error;
  }
  setRunning(Boolean(payload.running));
});

window.xhsApp.getDefaults().then((defaults) => {
  els.reportDate.value = defaults.reportDate;
  els.outputDir.value = defaults.workspaceDir;
});
