(() => {
  const APP_ID = "xhs-visible-page-collector";

  const existing = document.getElementById(APP_ID);
  if (existing) {
    existing.remove();
    return;
  }

  const today = new Date();
  const yesterday = new Date(today.getTime() - 24 * 60 * 60 * 1000);
  const dateString = (value) => {
    const y = value.getFullYear();
    const m = String(value.getMonth() + 1).padStart(2, "0");
    const d = String(value.getDate()).padStart(2, "0");
    return `${y}-${m}-${d}`;
  };

  const state = {
    creator: inferCreator(),
    publishedAt: dateString(yesterday),
    followerDate: dateString(yesterday),
    followerCount: "",
  };

  function isVisible(el) {
    if (!el || !(el instanceof Element)) return false;
    const style = window.getComputedStyle(el);
    if (style.display === "none" || style.visibility === "hidden" || Number(style.opacity) === 0) return false;
    const rect = el.getBoundingClientRect();
    if (rect.width < 20 || rect.height < 10) return false;
    if (rect.bottom < 0 || rect.right < 0 || rect.top > window.innerHeight || rect.left > window.innerWidth) return false;
    return true;
  }

  function textOf(el) {
    return (el && el.innerText ? el.innerText : "")
      .replace(/\s+/g, " ")
      .replace(/\u200b/g, "")
      .trim();
  }

  function inferCreator() {
    const pageText = document.body ? textOf(document.body).slice(0, 5000) : "";
    const title = (document.title || "").replace(/[-_].*$/, "").trim();
    if (title && !/小红书|RED/i.test(title) && title.length <= 30) {
      return title.startsWith("@") ? title : `@${title}`;
    }
    const profileName = Array.from(document.querySelectorAll("h1, h2, [class*='name'], [class*='user']"))
      .map((el) => textOf(el))
      .find((text) => text && text.length <= 30 && !/关注|粉丝|获赞|笔记|小红书|RED/i.test(text));
    if (profileName) return profileName.startsWith("@") ? profileName : `@${profileName}`;
    const atMatch = pageText.match(/@[\p{L}\p{N}_-]{2,30}/u);
    return atMatch ? atMatch[0] : "";
  }

  function absoluteUrl(url) {
    if (!url) return "";
    try {
      return new URL(url, location.href).href;
    } catch (_) {
      return "";
    }
  }

  function parseCount(label, text) {
    const patterns = {
      likes: /(?:赞|点赞|like)[^\d万wk千百十]*([\d,.]+)\s*([万wk千百十]?)/i,
      collects: /(?:收藏|藏|collect|favorite)[^\d万wk千百十]*([\d,.]+)\s*([万wk千百十]?)/i,
      comments: /(?:评论|评|comment)[^\d万wk千百十]*([\d,.]+)\s*([万wk千百十]?)/i,
    };
    const match = text.match(patterns[label]);
    if (!match) return "";
    return `${match[1]}${match[2] || ""}`;
  }

  function compactBody(text, title) {
    let value = text.replace(title || "", "").trim();
    value = value.replace(/(赞|点赞|收藏|评论|分享|关注|展开|收起)\s*/g, " $1 ");
    value = value.replace(/\s+/g, " ").trim();
    return value.length > 360 ? `${value.slice(0, 359)}…` : value;
  }

  function titleFromText(text) {
    const lines = text
      .split(/[\n。！？!?]/)
      .map((line) => line.replace(/\s+/g, " ").trim())
      .filter(Boolean);
    const candidate = lines.find((line) => line.length >= 4 && line.length <= 80) || lines[0] || "";
    return candidate.replace(/^(赞|收藏|评论|分享)\s*/g, "").trim();
  }

  function candidateElements() {
    const links = Array.from(document.querySelectorAll("a[href]")).filter(isVisible);
    const noteLinks = links.filter((a) => /xiaohongshu\.com|\/explore\/|\/discovery\/item\//i.test(a.href));
    const cards = new Set();
    noteLinks.forEach((link) => {
      let node = link;
      for (let i = 0; i < 5 && node && node !== document.body; i += 1) {
        const text = textOf(node);
        const rect = node.getBoundingClientRect();
        if (text.length >= 12 && rect.width >= 80 && rect.height >= 40) {
          cards.add(node);
          break;
        }
        node = node.parentElement;
      }
    });

    if (cards.size === 0) {
      Array.from(document.querySelectorAll("article, section, div")).forEach((el) => {
        if (!isVisible(el)) return;
        const text = textOf(el);
        const rect = el.getBoundingClientRect();
        if (text.length >= 30 && text.length <= 1200 && rect.width >= 120 && rect.height >= 60) {
          cards.add(el);
        }
      });
    }
    return Array.from(cards);
  }

  function extractPosts() {
    const posts = [];
    const seen = new Set();
    candidateElements().forEach((el) => {
      const text = textOf(el);
      if (!text || text.length < 10) return;
      const link = el.matches("a[href]") ? el : el.querySelector("a[href]");
      const img = el.querySelector("img[src], img[data-src]");
      const url = absoluteUrl(link && link.href ? link.href : location.href);
      const title = titleFromText(text);
      const key = `${url}|${title}`;
      if (!title || seen.has(key)) return;
      seen.add(key);
      posts.push({
        published_at: state.publishedAt,
        creator: state.creator,
        title,
        body: compactBody(text, title),
        likes: parseCount("likes", text),
        collects: parseCount("collects", text),
        comments: parseCount("comments", text),
        url,
        cover_url: absoluteUrl(img && (img.currentSrc || img.src || img.dataset.src)),
        captured_at: new Date().toISOString(),
        page_url: location.href,
      });
    });
    return posts;
  }

  function csvEscape(value) {
    const text = String(value == null ? "" : value);
    return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
  }

  function toCsv(rows, headers) {
    return [headers.join(",")]
      .concat(rows.map((row) => headers.map((key) => csvEscape(row[key])).join(",")))
      .join("\n");
  }

  function download(name, content, type = "text/csv;charset=utf-8") {
    const blob = new Blob(["\ufeff", content], { type });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = name;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  function downloadPosts(format) {
    syncState();
    const rows = extractPosts();
    if (!rows.length) {
      setStatus("没有识别到可见笔记。请先打开博主主页/笔记页并确认内容在当前视口可见。");
      return;
    }
    const stamp = `${state.creator.replace(/^@/, "") || "unknown"}-${state.publishedAt}`;
    if (format === "json") {
      download(`xhs-posts-${stamp}.json`, JSON.stringify(rows, null, 2), "application/json;charset=utf-8");
    } else {
      const headers = [
        "published_at",
        "creator",
        "title",
        "body",
        "likes",
        "collects",
        "comments",
        "url",
        "cover_url",
        "captured_at",
        "page_url",
      ];
      download(`xhs-posts-${stamp}.csv`, toCsv(rows, headers));
    }
    setStatus(`已导出 ${rows.length} 条可见记录。导出后请人工复核标题、日期和互动数。`);
  }

  function downloadFollowerSnapshot() {
    syncState();
    const rows = [{
      snapshot_date: state.followerDate,
      creator: state.creator,
      follower_count: state.followerCount,
      captured_at: new Date().toISOString(),
      page_url: location.href,
    }];
    download(
      `xhs-followers-${state.creator.replace(/^@/, "") || "unknown"}-${state.followerDate}.csv`,
      toCsv(rows, ["snapshot_date", "creator", "follower_count", "captured_at", "page_url"]),
    );
    setStatus("已导出粉丝快照。粉丝数需要你确认填写，助手不会自动读取隐藏数据。");
  }

  function syncState() {
    state.creator = document.getElementById(`${APP_ID}-creator`).value.trim();
    state.publishedAt = document.getElementById(`${APP_ID}-published-at`).value.trim();
    state.followerDate = document.getElementById(`${APP_ID}-follower-date`).value.trim();
    state.followerCount = document.getElementById(`${APP_ID}-follower-count`).value.trim();
  }

  function setStatus(message) {
    const el = document.getElementById(`${APP_ID}-status`);
    if (el) el.textContent = message;
  }

  function buildPanel() {
    const style = document.createElement("style");
    style.textContent = `
      #${APP_ID} {
        position: fixed;
        right: 18px;
        bottom: 18px;
        z-index: 2147483647;
        width: 320px;
        box-sizing: border-box;
        padding: 14px;
        border: 1px solid #e5e7eb;
        border-radius: 10px;
        background: #ffffff;
        color: #111827;
        box-shadow: 0 16px 45px rgba(15, 23, 42, .18);
        font: 13px/1.45 -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      }
      #${APP_ID} * { box-sizing: border-box; }
      #${APP_ID} .head { display: flex; justify-content: space-between; align-items: center; margin-bottom: 10px; }
      #${APP_ID} .title { font-weight: 700; font-size: 14px; }
      #${APP_ID} .close { border: 0; background: transparent; cursor: pointer; font-size: 18px; line-height: 1; }
      #${APP_ID} label { display: block; margin: 8px 0 4px; color: #374151; }
      #${APP_ID} input {
        width: 100%;
        border: 1px solid #d1d5db;
        border-radius: 7px;
        padding: 7px 8px;
        color: #111827;
        background: #fff;
      }
      #${APP_ID} .row { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; }
      #${APP_ID} .actions { display: grid; gap: 8px; margin-top: 12px; }
      #${APP_ID} button.action {
        border: 0;
        border-radius: 7px;
        padding: 8px 10px;
        background: #111827;
        color: #fff;
        cursor: pointer;
        font-weight: 650;
      }
      #${APP_ID} button.secondary { background: #f3f4f6; color: #111827; }
      #${APP_ID}-status { margin-top: 10px; color: #4b5563; min-height: 34px; }
    `;
    document.documentElement.appendChild(style);

    const panel = document.createElement("div");
    panel.id = APP_ID;
    panel.innerHTML = `
      <div class="head">
        <div class="title">小红书可见页面采集</div>
        <button class="close" title="关闭">×</button>
      </div>
      <label>博主账号</label>
      <input id="${APP_ID}-creator" value="${state.creator}" placeholder="@creator" />
      <div class="row">
        <div>
          <label>帖子日期</label>
          <input id="${APP_ID}-published-at" value="${state.publishedAt}" placeholder="YYYY-MM-DD" />
        </div>
        <div>
          <label>粉丝快照日期</label>
          <input id="${APP_ID}-follower-date" value="${state.followerDate}" placeholder="YYYY-MM-DD" />
        </div>
      </div>
      <label>当前可见粉丝数</label>
      <input id="${APP_ID}-follower-count" value="${state.followerCount}" placeholder="例如 118万" />
      <div class="actions">
        <button class="action" data-action="posts-csv">导出可见帖子 CSV</button>
        <button class="action secondary" data-action="posts-json">导出可见帖子 JSON</button>
        <button class="action secondary" data-action="followers">导出粉丝快照 CSV</button>
      </div>
      <div id="${APP_ID}-status">只采集当前页面可见内容，不访问接口、不自动翻页。</div>
    `;
    document.body.appendChild(panel);
    panel.querySelector(".close").addEventListener("click", () => panel.remove());
    panel.querySelector('[data-action="posts-csv"]').addEventListener("click", () => downloadPosts("csv"));
    panel.querySelector('[data-action="posts-json"]').addEventListener("click", () => downloadPosts("json"));
    panel.querySelector('[data-action="followers"]').addEventListener("click", downloadFollowerSnapshot);
  }

  buildPanel();
})();
