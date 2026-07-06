const state = {
  language: "中文",
  detail: "普通",
  running: false,
  runDir: "",
  reportPath: "",
};

const els = {
  creators: document.querySelector("#creators"),
  reportDate: document.querySelector("#reportDate"),
  detailLimit: document.querySelector("#detailLimit"),
  playSeconds: document.querySelector("#playSeconds"),
  playSecondsValue: document.querySelector("#playSecondsValue"),
  outputDir: document.querySelector("#outputDir"),
  chooseDir: document.querySelector("#chooseDir"),
  start: document.querySelector("#start"),
  cancel: document.querySelector("#cancel"),
  status: document.querySelector("#status"),
  report: document.querySelector("#report"),
  log: document.querySelector("#log"),
  openRunDir: document.querySelector("#openRunDir"),
  openReport: document.querySelector("#openReport"),
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

els.playSeconds.addEventListener("input", () => {
  els.playSecondsValue.textContent = `${els.playSeconds.value} 秒`;
});

els.chooseDir.addEventListener("click", async () => {
  const dir = await window.xhsApp.chooseOutputDir();
  if (dir) els.outputDir.value = dir;
});

els.cancel.addEventListener("click", async () => {
  await window.xhsApp.cancelRun();
  setRunning(false);
  setStatus("已停止", "warn");
});

els.openRunDir.addEventListener("click", () => {
  if (state.runDir) window.xhsApp.openPath(state.runDir);
});

els.openReport.addEventListener("click", () => {
  if (state.reportPath) window.xhsApp.openPath(state.reportPath);
});

els.start.addEventListener("click", async () => {
  els.log.textContent = "";
  els.report.innerHTML = "正在采集，完成后会显示简报。";
  els.report.classList.add("empty");
  setRunning(true);
  setStatus("运行中", "busy");
  state.runDir = "";
  state.reportPath = "";
  els.openRunDir.disabled = true;
  els.openReport.disabled = true;

  try {
    const result = await window.xhsApp.startRun({
      creators: els.creators.value,
      reportDate: els.reportDate.value,
      language: state.language,
      detail: state.detail,
      detailLimit: Number(els.detailLimit.value),
      playSeconds: Number(els.playSeconds.value),
      outputDir: els.outputDir.value,
    });
    if (!result.ok) throw new Error(result.error || "运行失败");
    state.runDir = result.runDir;
    state.reportPath = result.reportPath;
    els.report.classList.remove("empty");
    els.report.innerHTML = markdownToHtml(result.report);
    els.openRunDir.disabled = false;
    els.openReport.disabled = false;
    setStatus("简报已生成", "ok");
  } catch (error) {
    els.report.textContent = error.message;
    setStatus("运行失败", "error");
  } finally {
    setRunning(false);
  }
});

window.xhsApp.onLog(({ stream, text }) => {
  els.log.textContent += text;
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
  if (payload.report) {
    els.report.classList.remove("empty");
    els.report.innerHTML = markdownToHtml(payload.report);
  }
  if (payload.error) {
    els.report.textContent = payload.error;
  }
  setRunning(Boolean(payload.running));
});

window.xhsApp.getDefaults().then((defaults) => {
  els.reportDate.value = defaults.reportDate;
  els.outputDir.value = defaults.workspaceDir;
});
