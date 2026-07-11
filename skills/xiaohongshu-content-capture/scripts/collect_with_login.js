#!/usr/bin/env node
const fs = require("fs");
const path = require("path");
const readline = require("readline");

const COLLECTOR_VERSION = "3.1.0";
const CAPTURE_POLICY_VERSION = 2;

function parseArgs(argv) {
  const args = {
    creatorsFile: path.resolve(__dirname, "../config/creators.txt"),
    reportDate: todayInShanghai(),
    outDir: path.resolve(process.cwd(), "xhs-captures"),
    profileDir: path.resolve(process.cwd(), "work/xhs-browser-profile"),
    headless: false,
    manualFallback: false,
    detailLimit: 6,
    playSeconds: 12,
    maxVideoSeconds: 1800,
    videoPlaybackRate: "max",
    videoFrameCount: 6,
  };
  for (let i = 2; i < argv.length; i += 1) {
    const arg = argv[i];
    const next = argv[i + 1];
    if (arg === "--creators-file") args.creatorsFile = path.resolve(requireValue(arg, next)), i += 1;
    else if (arg === "--report-date") args.reportDate = requireValue(arg, next), i += 1;
    else if (arg === "--out-dir") args.outDir = path.resolve(requireValue(arg, next)), i += 1;
    else if (arg === "--profile-dir") args.profileDir = path.resolve(requireValue(arg, next)), i += 1;
    else if (arg === "--headless") args.headless = true;
    else if (arg === "--manual-fallback") args.manualFallback = true;
    else if (arg === "--no-manual-fallback") args.manualFallback = false;
    else if (arg === "--detail-limit") args.detailLimit = Number(requireValue(arg, next)), i += 1;
    else if (arg === "--play-seconds") args.playSeconds = Number(requireValue(arg, next)), i += 1;
    else if (arg === "--max-video-seconds") args.maxVideoSeconds = Number(requireValue(arg, next)), i += 1;
    else if (arg === "--video-playback-rate") args.videoPlaybackRate = requireValue(arg, next), i += 1;
    else if (arg === "--video-frame-count") args.videoFrameCount = Number(requireValue(arg, next)), i += 1;
    else if (arg === "--help" || arg === "-h") {
      printHelp();
      process.exit(0);
    } else throw new Error(`Unknown option: ${arg}`);
  }
  validateArgs(args);
  return args;
}

function requireValue(arg, value) {
  if (!value || String(value).startsWith("--")) {
    throw new Error(`${arg} requires a value.`);
  }
  return value;
}

function validateArgs(args) {
  if (!isValidIsoDate(args.reportDate)) {
    throw new Error("--report-date must use YYYY-MM-DD.");
  }
  if (!Number.isInteger(args.detailLimit) || args.detailLimit < 1 || args.detailLimit > 50) {
    throw new Error("--detail-limit must be an integer from 1 to 50.");
  }
  if (!Number.isFinite(args.playSeconds) || args.playSeconds < 0 || args.playSeconds > 120) {
    throw new Error("--play-seconds must be a number from 0 to 120.");
  }
  if (!Number.isFinite(args.maxVideoSeconds) || args.maxVideoSeconds < 10 || args.maxVideoSeconds > 1800) {
    throw new Error("--max-video-seconds must be a number from 10 to 1800.");
  }
  if (args.videoPlaybackRate !== "max") {
    args.videoPlaybackRate = Number(args.videoPlaybackRate);
    if (!Number.isFinite(args.videoPlaybackRate) || args.videoPlaybackRate < 1 || args.videoPlaybackRate > 16) {
      throw new Error("--video-playback-rate must be max or a number from 1 to 16.");
    }
  }
  if (!Number.isInteger(args.videoFrameCount) || args.videoFrameCount < 4 || args.videoFrameCount > 24) {
    throw new Error("--video-frame-count must be an integer from 4 to 24.");
  }
}

function isValidIsoDate(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(value || ""))) return false;
  const [year, month, day] = value.split("-").map(Number);
  const parsed = new Date(Date.UTC(year, month - 1, day));
  return parsed.getUTCFullYear() === year
    && parsed.getUTCMonth() === month - 1
    && parsed.getUTCDate() === day;
}

function printHelp() {
  console.log(`Usage:
  node collect_with_login.js --report-date 2026-07-06 --out-dir captures

Options:
  --creators-file <path>  Watchlist file, one creator per line.
  --report-date <date>   Report date. Posts are labeled as report-date - 1.
  --out-dir <path>       Directory for the collection package and generated screenshots.
  --profile-dir <path>   Browser profile directory for your manual login session.
  --detail-limit <n>     Max yesterday posts to open per creator. Default: 6.
  --play-seconds <n>     Legacy compatibility option. Videos now wait for a verified end.
  --max-video-seconds <n> Maximum seconds to wait while playing a video to completion. Default: 1800.
  --video-playback-rate <max|n> Use the highest media rate supported by the visible player, or 1-16. Default: max.
  --video-frame-count <n> Number of timeline-distributed video frames to capture. Default: 6.
  --headless             Run headless. Not recommended because login needs a visible browser.
  --manual-fallback      Pause for user intervention if automatic navigation cannot find a creator page.
  --no-manual-fallback   Do not pause if automatic navigation cannot find a creator page. Default.
`);
}

function todayInShanghai() {
  const fmt = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Shanghai",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  return fmt.format(new Date());
}

function addDays(yyyyMmDd, delta) {
  const [year, month, day] = yyyyMmDd.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  date.setUTCDate(date.getUTCDate() + delta);
  const y = date.getUTCFullYear();
  const m = String(date.getUTCMonth() + 1).padStart(2, "0");
  const d = String(date.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function normalizeCreator(name) {
  const text = String(name || "").replace(/\s+/g, "").trim();
  if (!text) return "";
  return text.startsWith("@") ? text : `@${text}`;
}

function readCreators(file) {
  if (!fs.existsSync(file)) return [];
  return Array.from(new Set(fs.readFileSync(file, "utf8")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith("#"))
    .map(normalizeCreator)
    .filter(Boolean)));
}

function writeCreators(file, creators) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, `${creators.join("\n")}\n`, "utf8");
}

async function ensureCreators(args, rl) {
  const creators = readCreators(args.creatorsFile);
  if (creators.length) return creators;

  console.log("\nNo Xiaohongshu creator watchlist is configured yet.");
  console.log("Paste the creators you want to follow, separated by spaces, commas, or new lines.");
  console.log("Example: @creatorA @creatorB @creatorC\n");
  const answer = await ask(rl, "Creators to watch: ");
  const configured = answer
    .split(/[\s,，;；]+/)
    .map(normalizeCreator)
    .filter(Boolean);
  if (!configured.length) {
    throw new Error(`No creators configured. Add one creator per line to ${args.creatorsFile} or rerun this script.`);
  }
  writeCreators(args.creatorsFile, configured);
  console.log(`Saved ${configured.length} creator(s) to ${args.creatorsFile}.`);
  return configured;
}

function createRl() {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  rl.closed = false;
  rl.on("close", () => {
    rl.closed = true;
  });
  return rl;
}

function ask(rl, question, fallback = "") {
  if (!process.stdin.isTTY || rl.closed) return Promise.resolve(fallback);
  return new Promise((resolve) => {
    try {
      rl.question(question, (answer) => resolve(answer.trim()));
    } catch {
      resolve(fallback);
    }
  });
}

function writeJson(file, data) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, `${JSON.stringify(data, null, 2)}\n`, "utf8");
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function safeGoto(page, url) {
  let error = "";
  try {
    await page.goto(url, { waitUntil: "domcontentloaded", timeout: 60000 });
  } catch (caught) {
    error = String(caught && caught.message ? caught.message : caught);
  }
  await sleep(6500);
  return {
    ok: !error,
    requested_url: url,
    final_url: page.url(),
    error,
  };
}

async function visibleText(page) {
  return page.evaluate(() => (document.body && document.body.innerText ? document.body.innerText : "").slice(0, 20000)).catch(() => "");
}

async function visibleAnchorTexts(page) {
  return page.evaluate(() => Array.from(document.querySelectorAll("a[href]"))
    .map((a) => (a.innerText || a.textContent || "").replace(/\s+/g, " ").trim())
    .filter(Boolean)
    .slice(0, 80)).catch(() => []);
}

async function clickVisibleExactText(page, label) {
  return page.evaluate((target) => {
    const isVisible = (el) => {
      const rect = el.getBoundingClientRect();
      const style = window.getComputedStyle(el);
      return rect.width > 8 && rect.height > 8 && style.display !== "none" && style.visibility !== "hidden";
    };
    const nodes = Array.from(document.querySelectorAll("button, a, div, span"));
    const node = nodes.find((el) => isVisible(el) && (el.innerText || el.textContent || "").trim() === target);
    if (!node) return false;
    node.click();
    return true;
  }, label).catch(() => false);
}

async function waitForCreatorSignals(page, creator, timeoutMs = 18000) {
  const target = creator.replace(/^@/, "");
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const text = await visibleText(page);
    const anchors = await visibleAnchorTexts(page);
    if (text.includes(target) || anchors.some((item) => item.includes(target))) return true;
    if (/验证码|验证|风险|异常|安全验证/.test(text)) return false;
    await sleep(1500);
  }
  return false;
}

function isCreatorProfileUrl(url) {
  return /\/user\/profile(?:\/|\?|$)/i.test(String(url || ""));
}

async function verifyCreatorProfile(page, creator) {
  const url = page.url();
  const text = await visibleText(page);
  const name = creator.replace(/^@/, "");
  if (/验证码|验证|风险|异常|安全验证/.test(text)) {
    return { ok: false, reason: "verification", url };
  }
  if (!isCreatorProfileUrl(url)) {
    return { ok: false, reason: "not-profile-url", url };
  }
  if (!text.includes(name)) {
    return { ok: false, reason: "creator-name-mismatch", url };
  }
  if (!/(关注|粉丝|获赞|收藏|笔记|followers?)/i.test(text)) {
    return { ok: false, reason: "profile-signals-missing", url };
  }
  return { ok: true, reason: "verified-profile", url };
}

async function saveDebugSnapshot(page, outDir, creator, reason) {
  const safeName = creator.replace(/^@/, "").replace(/[^\p{L}\p{N}_-]+/gu, "_") || "unknown";
  const debugDir = path.join(outDir, "debug");
  fs.mkdirSync(debugDir, { recursive: true });
  const base = path.join(debugDir, `${safeName}-${reason}-${Date.now()}`);
  const text = await visibleText(page);
  fs.writeFileSync(`${base}.txt`, text, "utf8");
  await page.screenshot({ path: `${base}.png`, fullPage: true }).catch(() => {});
  return base;
}

function scoreCandidate(candidate, creator) {
  const name = creator.replace(/^@/, "");
  let score = 0;
  const text = `${candidate.text || ""} ${candidate.href || ""}`;
  if (text.includes(name)) score += 100;
  if (/\/user\/profile|\/user\//i.test(candidate.href)) score += 40;
  if (/type=user/.test(candidate.href)) score += 8;
  if (/关注|粉丝|获赞|笔记/.test(candidate.text)) score += 10;
  if (/search_result/.test(candidate.href)) score -= 20;
  return score;
}

async function findBestCreatorCandidate(page, creator) {
  const candidates = await page.evaluate(() => {
    const isVisible = (el) => {
      const rect = el.getBoundingClientRect();
      const style = window.getComputedStyle(el);
      return rect.width > 20 && rect.height > 10 && style.display !== "none" && style.visibility !== "hidden";
    };
    return Array.from(document.querySelectorAll("a[href]"))
      .filter(isVisible)
      .map((a, index) => ({
        index,
        text: (a.innerText || a.textContent || "").replace(/\s+/g, " ").trim(),
        href: a.href,
      }))
      .filter((item) => item.text || item.href);
  }).catch(() => []);

  const ranked = candidates
    .filter((candidate) => isCreatorProfileUrl(candidate.href))
    .map((candidate) => ({ ...candidate, score: scoreCandidate(candidate, creator) }))
    .sort((a, b) => b.score - a.score);
  const best = ranked[0];
  return {
    best: best && best.score >= 80 ? best : null,
    candidates: ranked.slice(0, 8),
  };
}

async function autoOpenCreatorPage(page, creator) {
  const keyword = encodeURIComponent(creator.replace(/^@/, ""));
  const searchUrls = [
    `https://www.xiaohongshu.com/search_result?keyword=${keyword}&type=user`,
    `https://www.xiaohongshu.com/search_result?keyword=${keyword}`,
  ];

  const attempts = [];
  for (const url of searchUrls) {
    const searchNavigation = await safeGoto(page, url);
    await clickVisibleExactText(page, "用户");
    await sleep(5000);
    await waitForCreatorSignals(page, creator);
    const text = await visibleText(page);
    if (/验证码|验证|风险|异常|安全验证/.test(text)) {
      return { ok: false, reason: "verification", attempts };
    }
    if (text.includes(creator.replace(/^@/, ""))) {
      const found = await findBestCreatorCandidate(page, creator);
      if (found.best) {
        const profileNavigation = await safeGoto(page, found.best.href);
        const verification = await verifyCreatorProfile(page, creator);
        attempts.push({
          search_url: url,
          search_navigation: searchNavigation,
          selected_candidate: found.best,
          candidate_sample: found.candidates,
          profile_navigation: profileNavigation,
          verification,
        });
        if (verification.ok) {
          await page.evaluate(() => window.scrollTo(0, 0)).catch(() => {});
          await sleep(1200);
          return { ok: true, reason: "verified-profile", attempts, profile_url: page.url() };
        }
      } else {
        attempts.push({
          search_url: url,
          search_navigation: searchNavigation,
          selected_candidate: null,
          candidate_sample: found.candidates,
          verification: { ok: false, reason: "no-profile-candidate", url: page.url() },
        });
      }
    } else {
      attempts.push({
        search_url: url,
        search_navigation: searchNavigation,
        selected_candidate: null,
        verification: { ok: false, reason: "creator-signal-missing", url: page.url() },
      });
    }
  }
  const reason = attempts.at(-1)?.verification?.reason || "not-found";
  return { ok: false, reason, attempts };
}

async function extractVisiblePage(page, creator, postDate, reportDate) {
  return page.evaluate(({ creator, postDate, reportDate }) => {
    const textOf = (el) => (el && el.innerText ? el.innerText : "")
      .replace(/\s+/g, " ")
      .replace(/\u200b/g, "")
      .trim();
    const isVisible = (el) => {
      if (!el || !(el instanceof Element)) return false;
      const style = window.getComputedStyle(el);
      if (style.display === "none" || style.visibility === "hidden" || Number(style.opacity) === 0) return false;
      const rect = el.getBoundingClientRect();
      return rect.width >= 20 && rect.height >= 10 && rect.bottom >= 0 && rect.right >= 0 && rect.top <= window.innerHeight && rect.left <= window.innerWidth;
    };
    const absoluteUrl = (url) => {
      if (!url) return "";
      try { return new URL(url, location.href).href; } catch (_) { return ""; }
    };
    const parseMetric = (label, text) => {
      const patterns = {
        likes: /(?:赞|点赞|like)[^\d万wk千百十]*([\d,.]+)\s*([万wk千百十]?)/i,
        collects: /(?:收藏|藏|collect|favorite)[^\d万wk千百十]*([\d,.]+)\s*([万wk千百十]?)/i,
        comments: /(?:评论|评|comment)[^\d万wk千百十]*([\d,.]+)\s*([万wk千百十]?)/i,
      };
      const match = text.match(patterns[label]);
      return match ? `${match[1]}${match[2] || ""}` : "";
    };
    const titleFromText = (text) => {
      const lines = text.split(/[\n。！？!?]/)
        .map((line) => line.replace(/\s+/g, " ").trim())
        .filter(Boolean);
      return (lines.find((line) => line.length >= 4 && line.length <= 80) || lines[0] || "")
        .replace(/^(赞|收藏|评论|分享)\s*/g, "")
        .trim();
    };
    const compactBody = (text, title) => {
      let value = text.replace(title || "", "").trim();
      value = value.replace(/(赞|点赞|收藏|评论|分享|关注|展开|收起)\s*/g, " $1 ");
      value = value.replace(/\s+/g, " ").trim();
      return value.length > 420 ? `${value.slice(0, 419)}…` : value;
    };
    const inferFollower = () => {
      const pageText = textOf(document.body).slice(0, 20000);
      const patterns = [
        /粉丝[^\d万wk千百十]{0,8}([\d,.]+)\s*([万wk千百十]?)/,
        /([\d,.]+)\s*([万wk千百十]?)\s*粉丝/,
        /followers?[^\d万wk]{0,8}([\d,.]+)\s*([万wk]?)/i,
      ];
      for (const pattern of patterns) {
        const match = pageText.match(pattern);
        if (match) return `${match[1]}${match[2] || ""}`;
      }
      return "";
    };

    const links = Array.from(document.querySelectorAll("a[href]")).filter(isVisible);
    const candidates = new Set();
    links.forEach((link) => {
      let node = link;
      for (let i = 0; i < 6 && node && node !== document.body; i += 1) {
        const text = textOf(node);
        const rect = node.getBoundingClientRect();
        if (text.length >= 12 && rect.width >= 80 && rect.height >= 40) {
          candidates.add(node);
          break;
        }
        node = node.parentElement;
      }
    });
    if (!candidates.size) {
      Array.from(document.querySelectorAll("article, section, div")).forEach((el) => {
        if (!isVisible(el)) return;
        const text = textOf(el);
        const rect = el.getBoundingClientRect();
        if (text.length >= 30 && text.length <= 1600 && rect.width >= 120 && rect.height >= 60) candidates.add(el);
      });
    }

    const seen = new Set();
    const posts = [];
    Array.from(candidates).forEach((el) => {
      const text = textOf(el);
      const title = titleFromText(text);
      if (!title) return;
      const link = el.matches("a[href]") ? el : el.querySelector("a[href]");
      const img = el.querySelector("img[src], img[data-src]");
      const url = absoluteUrl(link && link.href ? link.href : location.href);
      const key = `${url}|${title}`;
      if (seen.has(key)) return;
      seen.add(key);
      posts.push({
        published_at: postDate,
        creator,
        title,
        body: compactBody(text, title),
        likes: parseMetric("likes", text),
        collects: parseMetric("collects", text),
        comments: parseMetric("comments", text),
        url,
        cover_url: absoluteUrl(img && (img.currentSrc || img.src || img.dataset.src)),
        captured_at: new Date().toISOString(),
        page_url: location.href,
      });
    });

    return {
      posts,
      page_text_excerpt: textOf(document.body).slice(0, 4000),
      follower: {
        snapshot_date: reportDate,
        creator,
        follower_count: inferFollower(),
        captured_at: new Date().toISOString(),
        page_url: location.href,
      },
    };
  }, { creator, postDate, reportDate });
}

async function collectVisibleProfilePosts(page, creator, postDate, reportDate) {
  const snapshots = [];
  for (const top of [0, 700, 1400]) {
    await page.evaluate((value) => window.scrollTo(0, value), top).catch(() => {});
    await sleep(900);
    snapshots.push(await extractVisiblePage(page, creator, postDate, reportDate));
  }
  await page.evaluate(() => window.scrollTo(0, 0)).catch(() => {});
  const posts = uniquePosts(snapshots.flatMap((snapshot) => snapshot.posts || []));
  const follower = snapshots.map((snapshot) => snapshot.follower).find((item) => item && item.follower_count)
    || snapshots[0]?.follower
    || { snapshot_date: reportDate, creator, follower_count: "", captured_at: new Date().toISOString(), page_url: page.url() };
  return {
    posts,
    follower,
    page_text_excerpt: snapshots.map((snapshot) => snapshot.page_text_excerpt || "").filter(Boolean).join("\n").slice(0, 8000),
  };
}

function noteIdFromUrl(url) {
  const match = String(url || "").match(/\/(?:explore|search_result|discovery\/item)\/([^/?#]+)/);
  return match ? match[1] : "";
}

function targetDateTokens(postDate) {
  const [year, month, day] = String(postDate || "").split("-").map(Number);
  if (!year || !month || !day) return [];
  return [
    `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`,
    `${year}/${String(month).padStart(2, "0")}/${String(day).padStart(2, "0")}`,
    `${year}年${month}月${day}日`,
    `${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`,
    `${month}-${day}`,
    `${String(month).padStart(2, "0")}/${String(day).padStart(2, "0")}`,
    `${month}/${day}`,
    `${month}月${day}日`,
  ];
}

function hasTargetDateSignal(text, postDate) {
  const value = String(text || "");
  if (/昨天|1天前|24小时前/.test(value)) {
    return dateInShanghai(new Date(Date.now() - 86400000)) === postDate;
  }
  return targetDateTokens(postDate).some((token) => value.includes(token));
}

function isProfilePostCandidate(post) {
  return /\/(?:explore|search_result|discovery\/item)\//.test(post.url || "")
    && isCreatorProfileUrl(post.page_url || "");
}

function uniquePosts(posts) {
  const byId = new Map();
  for (const post of posts) {
    const id = noteIdFromUrl(post.url);
    if (!id) continue;
    const existing = byId.get(id);
    if (!existing || (/\/explore\//.test(post.url || "") && !/\/explore\//.test(existing.url || ""))) {
      byId.set(id, post);
    }
  }
  return Array.from(byId.values());
}

function safeFilePart(value) {
  return String(value || "note").replace(/^@/, "").replace(/[^\p{L}\p{N}_-]+/gu, "_").slice(0, 80) || "note";
}

async function startVisibleMedia(page, requestedRate) {
  const result = await page.evaluate((requested) => {
    const media = Array.from(document.querySelectorAll("video, audio"));
    let videoCount = 0;
    let audioCount = 0;
    let attempted = 0;
    let resetToStart = 0;
    const visibleVideos = [];
    const applyPlaybackRate = (item) => {
      const candidates = requested === "max"
        ? [16, 12, 8, 6, 4, 3, 2, 1.5, 1]
        : [Number(requested), 1];
      for (const candidate of candidates) {
        if (!Number.isFinite(candidate) || candidate < 1) continue;
        try {
          item.defaultPlaybackRate = candidate;
          item.playbackRate = candidate;
          if (Math.abs(item.playbackRate - candidate) < 0.01) return item.playbackRate;
        } catch (_) {}
      }
      return Number.isFinite(item.playbackRate) ? item.playbackRate : 1;
    };
    for (const item of media) {
      const tag = item.tagName.toLowerCase();
      const rect = item.getBoundingClientRect();
      const visible = rect.width > 20 && rect.height > 20 && rect.bottom >= 0 && rect.right >= 0 && rect.top <= window.innerHeight && rect.left <= window.innerWidth;
      if (tag === "video") {
        videoCount += 1;
        if (visible) visibleVideos.push(item);
      }
      if (tag === "audio") audioCount += 1;
      try {
        item.muted = true;
        item.loop = false;
        applyPlaybackRate(item);
        if (tag === "video") {
          item.currentTime = 0;
          if (Number.isFinite(item.currentTime) && item.currentTime <= 0.25) resetToStart += 1;
        }
        item.pause();
        attempted += 1;
      } catch (_) {}
    }
    const primary = visibleVideos[0] || media.find((item) => item.tagName.toLowerCase() === "video") || media[0];
    const duration = primary && Number.isFinite(primary.duration) ? primary.duration : 0;
    const currentTime = primary && Number.isFinite(primary.currentTime) ? primary.currentTime : 0;
    const remaining = duration > 0 ? Math.max(0, duration - currentTime) : 0;
    return {
      video_count: videoCount,
      audio_count: audioCount,
      play_attempted: attempted,
      duration_seconds: duration || 0,
      current_time_seconds: currentTime || 0,
      remaining_seconds: remaining,
      duration_known: duration > 0,
      playback_rate_requested: requested,
      playback_rate: primary && Number.isFinite(primary.playbackRate) ? primary.playbackRate : 1,
      started_from_beginning: Boolean(primary && Number.isFinite(primary.currentTime) && primary.currentTime <= 0.25 && resetToStart > 0),
      ended: Boolean(primary && primary.ended),
    };
  }, requestedRate).catch(() => ({ video_count: 0, audio_count: 0, play_attempted: 0 }));
  return result;
}

async function mediaPlaybackStatus(page) {
  return page.evaluate(() => {
    const videos = Array.from(document.querySelectorAll("video"));
    const primary = videos.find((item) => {
      const rect = item.getBoundingClientRect();
      return rect.width > 20 && rect.height > 20 && rect.bottom >= 0 && rect.right >= 0 && rect.top <= window.innerHeight && rect.left <= window.innerWidth;
    }) || videos[0];
    if (!primary) return {};
    const duration = Number.isFinite(primary.duration) ? primary.duration : 0;
    const currentTime = Number.isFinite(primary.currentTime) ? primary.currentTime : 0;
    return {
      ended: Boolean(primary.ended),
      paused: Boolean(primary.paused),
      duration_seconds: duration || 0,
      current_time_seconds: currentTime || 0,
      remaining_seconds: duration > 0 ? Math.max(0, duration - currentTime) : 0,
      playback_rate: Number.isFinite(primary.playbackRate) ? primary.playbackRate : 1,
    };
  }).catch(() => ({}));
}

function isPostDetailUrl(url, noteId) {
  const value = String(url || "");
  return Boolean(noteId && value.includes(noteId) && /\/(?:explore|discovery\/item|search_result)\//i.test(value));
}

async function verifyPostDetail(page, noteId) {
  const url = page.url();
  const text = await visibleText(page);
  if (/验证码|验证|风险|异常|安全验证/.test(text)) {
    return { ok: false, reason: "verification", url };
  }
  if (!isPostDetailUrl(url, noteId)) {
    return { ok: false, reason: "post-url-mismatch", url };
  }
  if (/访问的页面不见了|页面不见了|内容无法查看/.test(text)) {
    return { ok: false, reason: "post-unavailable", url };
  }
  return { ok: true, reason: "verified-post-detail", url };
}

function dateInShanghai(value) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Shanghai",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(value);
}

function matchesTargetDateEvidence(text, postDate) {
  const value = String(text || "");
  if (hasTargetDateSignal(value, postDate)) return true;
  const relative = value.match(/(\d+)\s*(分钟|小时)前/);
  if (!relative) return false;
  const amount = Number(relative[1]);
  const millis = relative[2] === "小时" ? amount * 3600000 : amount * 60000;
  return dateInShanghai(new Date(Date.now() - millis)) === postDate;
}

async function readPostDateEvidence(page, postDate) {
  const candidates = await page.evaluate(() => {
    const clean = (value) => String(value || "").replace(/\u200b/g, "").replace(/\s+/g, " ").trim();
    const selectors = ["time", "[class*='date']", "[class*='time']", "[class*='publish']", "[data-testid*='date']"];
    const values = [];
    const seen = new Set();
    const isCommentElement = (el) => {
      let node = el;
      const ancestry = [];
      for (let i = 0; i < 5 && node; i += 1, node = node.parentElement) ancestry.push(`${node.className || ""} ${node.id || ""}`);
      return /(comment|reply|评论|回复)/i.test(ancestry.join(" "));
    };
    selectors.forEach((selector) => {
      document.querySelectorAll(selector).forEach((el) => {
        if (isCommentElement(el)) return;
        const value = clean(el.innerText || el.textContent || el.getAttribute("datetime"));
        if (!value || value.length > 100 || seen.has(value)) return;
        seen.add(value);
        values.push(value);
      });
    });
    return values;
  }).catch(() => []);
  const dateLike = candidates.filter((value) => /昨天|今天|\d+\s*(?:分钟|小时|天)前|\d{1,4}[年/.\-]\d{1,2}/.test(value));
  const matching = dateLike.find((value) => matchesTargetDateEvidence(value, postDate));
  return {
    verified: dateLike.length > 0,
    matches_target: Boolean(matching),
    evidence: matching || dateLike[0] || "",
    candidates: dateLike.slice(0, 12),
    target_date: postDate,
  };
}

async function readFullPostText(page) {
  return page.evaluate(() => {
    const clean = (value) => String(value || "").replace(/\u200b/g, "").replace(/\s+/g, " ").trim();
    const isRendered = (el) => {
      if (!el || !(el instanceof Element)) return false;
      const style = window.getComputedStyle(el);
      const rect = el.getBoundingClientRect();
      return style.display !== "none" && style.visibility !== "hidden" && Number(style.opacity) !== 0 && rect.width > 4 && rect.height > 4;
    };
    const isCommentElement = (el) => {
      const ancestry = [];
      let node = el;
      for (let i = 0; i < 5 && node; i += 1, node = node.parentElement) {
        ancestry.push(`${node.className || ""} ${node.id || ""} ${node.getAttribute?.("data-testid") || ""}`);
      }
      return /(comment|reply|评论|回复)/i.test(ancestry.join(" "));
    };
    const selectors = [
      ".note-content .desc",
      "[class*='note-content'] [class*='desc']",
      "[class*='noteContent'] [class*='desc']",
      ".note-content",
      "[class*='note-content']",
      "[class*='noteContent']",
      "[class*='description']",
      "[class~='desc']",
      "[data-testid*='note-content']",
    ];
    const records = [];
    const seen = new Set();
    selectors.forEach((selector, priority) => {
      document.querySelectorAll(selector).forEach((el) => {
        if (seen.has(el) || !isRendered(el) || isCommentElement(el)) return;
        seen.add(el);
        const text = clean(el.innerText || el.textContent);
        if (!text || /^(展开|展开全文|查看更多|收起)$/.test(text)) return;
        records.push({
          text,
          source: `dom:${selector}`,
          score: (selectors.length - priority) * 100000 + Math.min(text.length, 50000),
        });
      });
    });
    records.sort((a, b) => b.score - a.score);
    const best = records[0] || null;
    const expanderPattern = /^(展开全文|展开|全文|查看更多|显示更多|more)$/i;
    const remainingExpanders = Array.from(document.querySelectorAll("button, a, span, div"))
      .filter((el) => isRendered(el) && !isCommentElement(el) && expanderPattern.test(clean(el.innerText || el.textContent)))
      .length;
    return {
      text: best ? best.text : "",
      source: best ? best.source : "none",
      remaining_expanders: remainingExpanders,
    };
  }).catch((error) => ({
    text: "",
    source: "error",
    remaining_expanders: -1,
    error: String(error && error.message ? error.message : error),
  }));
}

async function expandAndReadFullText(page) {
  let expandedCount = 0;
  for (let round = 0; round < 6; round += 1) {
    const clicked = await page.evaluate(() => {
      const clean = (value) => String(value || "").replace(/\s+/g, " ").trim();
      const isVisible = (el) => {
        if (!el || !(el instanceof Element)) return false;
        const rect = el.getBoundingClientRect();
        const style = window.getComputedStyle(el);
        return rect.width > 4 && rect.height > 4 && style.display !== "none" && style.visibility !== "hidden";
      };
      const isCommentElement = (el) => {
        let node = el;
        const ancestry = [];
        for (let i = 0; i < 5 && node; i += 1, node = node.parentElement) ancestry.push(`${node.className || ""} ${node.id || ""}`);
        return /(comment|reply|评论|回复)/i.test(ancestry.join(" "));
      };
      const pattern = /^(展开全文|展开|全文|查看更多|显示更多|more)$/i;
      const targets = Array.from(document.querySelectorAll("button, a, span, div"))
        .filter((el) => isVisible(el) && !isCommentElement(el) && pattern.test(clean(el.innerText || el.textContent)))
        .slice(0, 4);
      targets.forEach((el) => el.click());
      return targets.length;
    }).catch(() => 0);
    expandedCount += clicked;
    if (!clicked) break;
    await sleep(900);
  }

  const scrolled = await page.evaluate(() => {
    const roots = Array.from(document.querySelectorAll(".note-content, [class*='note-content'], [class*='noteContent'], [role='dialog']"));
    const scrollable = roots
      .flatMap((root) => {
        const values = [];
        let node = root;
        for (let i = 0; i < 5 && node; i += 1, node = node.parentElement) values.push(node);
        return values;
      })
      .find((el) => el.scrollHeight > el.clientHeight + 20);
    if (!scrollable) return false;
    scrollable.scrollTop = scrollable.scrollHeight;
    return true;
  }).catch(() => false);
  if (scrolled) {
    await sleep(700);
    await page.evaluate(() => {
      const roots = Array.from(document.querySelectorAll(".note-content, [class*='note-content'], [class*='noteContent'], [role='dialog']"));
      const scrollable = roots
        .flatMap((root) => {
          const values = [];
          let node = root;
          for (let i = 0; i < 5 && node; i += 1, node = node.parentElement) values.push(node);
          return values;
        })
        .find((el) => el.scrollHeight > el.clientHeight + 20);
      if (scrollable) scrollable.scrollTop = 0;
    }).catch(() => {});
    await sleep(500);
  }

  let previousText = "";
  let stableReads = 0;
  let snapshot = await readFullPostText(page);
  for (let attempt = 0; attempt < 6; attempt += 1) {
    if (snapshot.text && snapshot.text === previousText && snapshot.remaining_expanders === 0) stableReads += 1;
    else stableReads = 0;
    if (stableReads >= 2) break;
    previousText = snapshot.text;
    await sleep(650);
    snapshot = await readFullPostText(page);
  }
  return {
    ...snapshot,
    expanded_count: expandedCount,
    scroll_completed: scrolled,
    stable_reads: stableReads,
    completed: Boolean(snapshot.text && snapshot.source.startsWith("dom:") && snapshot.remaining_expanders === 0 && stableReads >= 2),
  };
}

async function readVisibleCaptions(page) {
  return page.evaluate(() => {
    const clean = (value) => String(value || "").replace(/\u200b/g, "").replace(/\s+/g, " ").trim();
    const selectors = ["[class*='subtitle']", "[class*='caption']", "[class*='video-text']", "[data-testid*='caption']"];
    const values = [];
    selectors.forEach((selector) => {
      document.querySelectorAll(selector).forEach((el) => {
        const rect = el.getBoundingClientRect();
        const style = window.getComputedStyle(el);
        const text = clean(el.innerText || el.textContent);
        if (text && text.length <= 300 && rect.width > 4 && rect.height > 4 && style.display !== "none" && style.visibility !== "hidden") values.push(text);
      });
    });
    return Array.from(new Set(values));
  }).catch(() => []);
}

async function setVisibleVideoPlayback(page, shouldPlay, playbackRate) {
  return page.evaluate(({ play, rate }) => {
    const videos = Array.from(document.querySelectorAll("video"));
    const video = videos.find((item) => {
      const rect = item.getBoundingClientRect();
      return rect.width > 20 && rect.height > 20;
    }) || videos[0];
    if (!video) return false;
    video.muted = true;
    video.loop = false;
    if (Number.isFinite(rate) && rate >= 1) {
      try {
        video.defaultPlaybackRate = rate;
        video.playbackRate = rate;
      } catch (_) {}
    }
    if (!play) {
      video.pause();
      return true;
    }
    if (!video.ended && video.paused) {
      const promise = video.play();
      if (promise && typeof promise.catch === "function") promise.catch(() => {});
    }
    return true;
  }, { play: shouldPlay, rate: playbackRate }).catch(() => false);
}

function timelineFrameTargets(duration, count) {
  if (!Number.isFinite(duration) || duration <= 0 || count < 2) return [];
  const end = Math.max(0, duration - Math.min(0.25, duration * 0.01));
  return Array.from({ length: count }, (_, index) => {
    if (index === 0) return 0;
    if (index === count - 1) return end;
    return Number(((end * index) / (count - 1)).toFixed(3));
  });
}

function hasCompleteVideoFrameCoverage(media, frameSamples, requiredCount) {
  if (!Number.isInteger(requiredCount) || requiredCount < 1) return false;
  const samples = Array.isArray(frameSamples) ? frameSamples : [];
  const missed = Array.isArray(media?.frame_sampling_missed_targets_seconds)
    ? media.frame_sampling_missed_targets_seconds
    : [];
  return Number(media?.frame_sample_count || 0) >= requiredCount
    && samples.length >= requiredCount
    && missed.length === 0;
}

async function playVisibleVideoToCompletion(page, args, captureFrame) {
  const media = await startVisibleMedia(page, args.videoPlaybackRate);
  media.visible_caption_samples = [];
  if (!media.video_count || !media.play_attempted) {
    media.playback_completed = false;
    return media;
  }

  const metadataDeadline = Date.now() + 10000;
  let initialStatus = await mediaPlaybackStatus(page);
  while (!initialStatus.duration_seconds && Date.now() < metadataDeadline) {
    await sleep(100);
    initialStatus = await mediaPlaybackStatus(page);
  }
  if (initialStatus.duration_seconds) {
    await page.evaluate(() => {
      const videos = Array.from(document.querySelectorAll("video"));
      const video = videos.find((item) => {
        const rect = item.getBoundingClientRect();
        return rect.width > 20 && rect.height > 20;
      }) || videos[0];
      if (!video) return;
      video.pause();
      try {
        if (typeof video.fastSeek === "function") video.fastSeek(0);
        else video.currentTime = 0;
      } catch (_) {}
    }).catch(() => {});
    await sleep(100);
    initialStatus = await mediaPlaybackStatus(page);
  }
  media.duration_seconds = initialStatus.duration_seconds || media.duration_seconds || 0;
  media.current_time_seconds = initialStatus.current_time_seconds || 0;
  media.started_from_beginning = Boolean(initialStatus.current_time_seconds <= 0.25);

  const startedAt = Date.now();
  let frameCount = 0;
  let nextTargetIndex = 0;
  let frameTargets = timelineFrameTargets(media.duration_seconds, args.videoFrameCount);
  const missedTargets = [];
  let lastProgress = -1;
  let lastProgressAt = Date.now();
  let finalStatus = {};
  const captureTimelineFrame = async (targetIndex, status) => {
    const targetSeconds = frameTargets[targetIndex];
    const rate = status.playback_rate || media.playback_rate || 1;
    await setVisibleVideoPlayback(page, false, rate);
    const pausedStatus = await mediaPlaybackStatus(page);
    const captured = await captureFrame(targetIndex + 1, {
      target_seconds: Number(targetSeconds.toFixed(3)),
      actual_seconds: Number((pausedStatus.current_time_seconds || status.current_time_seconds || 0).toFixed(3)),
      playback_rate: rate,
    });
    if (captured) frameCount += 1;
    else missedTargets.push(Number(targetSeconds.toFixed(3)));
    nextTargetIndex = targetIndex + 1;
    if (!pausedStatus.ended) await setVisibleVideoPlayback(page, true, rate);
    return captured;
  };

  if (frameTargets.length) {
    await captureTimelineFrame(0, initialStatus);
  } else {
    await setVisibleVideoPlayback(page, true, media.playback_rate || 1);
  }

  while ((Date.now() - startedAt) / 1000 <= args.maxVideoSeconds) {
    const status = await mediaPlaybackStatus(page);
    finalStatus = status;
    const captions = await readVisibleCaptions(page);
    for (const caption of captions) {
      if (!media.visible_caption_samples.includes(caption)) media.visible_caption_samples.push(caption);
    }
    const duration = status.duration_seconds || media.duration_seconds || 0;
    if (!frameTargets.length && duration > 0) frameTargets = timelineFrameTargets(duration, args.videoFrameCount);
    const nextTarget = frameTargets[nextTargetIndex];
    if (Number.isFinite(nextTarget) && status.current_time_seconds >= Math.max(0, nextTarget - 0.05)) {
      const spacing = frameTargets.length > 1 ? frameTargets[1] - frameTargets[0] : 1;
      const tolerance = Math.max(0.5, spacing * 0.2);
      if (status.current_time_seconds > nextTarget + tolerance && nextTargetIndex < frameTargets.length - 1) {
        missedTargets.push(Number(nextTarget.toFixed(3)));
        nextTargetIndex += 1;
      } else {
        await captureTimelineFrame(nextTargetIndex, status);
      }
      continue;
    }
    const completed = Boolean(
      status.ended
      || (duration > 0 && status.current_time_seconds > 0 && status.current_time_seconds >= duration - 0.25)
    );
    if (completed) {
      media.playback_completed = true;
      break;
    }
    const currentProgress = Number.isFinite(status.current_time_seconds) ? status.current_time_seconds : 0;
    if (currentProgress > lastProgress + 0.05) lastProgressAt = Date.now();
    lastProgress = currentProgress;
    if (Date.now() - lastProgressAt >= 30000) {
      media.playback_stalled = true;
      break;
    }
    if (status.paused) await setVisibleVideoPlayback(page, true, status.playback_rate || media.playback_rate || 1);
    const spacing = frameTargets.length > 1 ? frameTargets[1] - frameTargets[0] : 5;
    const rate = Math.max(1, status.playback_rate || media.playback_rate || 1);
    const pollMs = Math.max(25, Math.min(250, (spacing / rate) * 250));
    await sleep(pollMs);
  }
  if (!frameTargets.length && frameCount === 0) {
    const captured = await captureFrame(1, {
      target_seconds: 0,
      actual_seconds: finalStatus.current_time_seconds || 0,
      playback_rate: media.playback_rate || 1,
    });
    if (captured) frameCount = 1;
  }
  media.playback_wait_seconds = Math.round((Date.now() - startedAt) / 1000);
  media.playback_completed = Boolean(media.playback_completed && media.started_from_beginning);
  media.playback_limited = Boolean(!media.playback_completed && media.playback_wait_seconds >= args.maxVideoSeconds);
  media.duration_seconds = finalStatus.duration_seconds || media.duration_seconds || 0;
  media.current_time_seconds = finalStatus.current_time_seconds || media.current_time_seconds || 0;
  media.remaining_seconds = finalStatus.remaining_seconds ?? media.remaining_seconds ?? 0;
  media.playback_rate = finalStatus.playback_rate || media.playback_rate || 1;
  media.frame_sample_count = frameCount;
  media.frame_sample_targets_seconds = frameTargets;
  media.frame_sampling_missed_targets_seconds = missedTargets;
  media.frame_sampling_strategy = "timeline-equidistant-paused-capture";
  return media;
}

function isMissingPage(detail) {
  const text = `${detail.title || ""} ${detail.visible_text || ""}`;
  return /访问的页面不见了|页面不见了|内容无法查看/.test(text);
}

async function extractDetailPage(page, creator, post, args, postDate, index) {
  const noteId = noteIdFromUrl(post.url);
  const creatorPart = safeFilePart(creator);
  const notePart = safeFilePart(noteId || index);
  const frameDir = path.join(args.outDir, "frames", `${creatorPart}-${notePart}`);
  fs.mkdirSync(frameDir, { recursive: true });

  const detailNavigation = await safeGoto(page, post.url);
  const detailVerification = await verifyPostDetail(page, noteId);
  if (!detailVerification.ok) {
    return {
      ...post,
      published_at: postDate,
      detail_text: "",
      analysis_ready: false,
      capture_status: {
        content_type: "unknown",
        detail_navigation: detailNavigation,
        detail_verification: detailVerification,
        text_capture_completed: false,
        video_playback_completed: false,
        failure_reason: detailVerification.reason,
      },
      warnings: [`post detail navigation failed: ${detailVerification.reason}`],
      extraction_note: "Post detail navigation could not be verified, so this post is excluded from summary and analysis.",
      detail_captured_at: new Date().toISOString(),
    };
  }

  const dateEvidence = await readPostDateEvidence(page, postDate);
  if (!dateEvidence.matches_target) {
    const reason = dateEvidence.verified ? "post-date-not-target" : "post-date-unverified";
    return {
      ...post,
      published_at: "",
      detail_text: "",
      analysis_ready: false,
      capture_status: {
        content_type: "unknown",
        detail_navigation: detailNavigation,
        detail_verification: detailVerification,
        date_evidence: dateEvidence,
        target_date_match: false,
        text_capture_completed: false,
        video_playback_completed: false,
        failure_reason: reason,
      },
      warnings: [`post publishing date check failed: ${reason}`],
      extraction_note: "The detail page did not verify this post as published on the target date, so no text reading or video playback was performed.",
      detail_captured_at: new Date().toISOString(),
    };
  }

  const textCapture = await expandAndReadFullText(page);
  const frames = [];
  const frameSamples = [];
  const captureFrame = async (slot, sample = {}) => {
    const framePath = path.join(frameDir, `frame-${String(slot).padStart(2, "0")}.png`);
    await page.screenshot({ path: framePath, fullPage: false }).catch(() => {});
    if (fs.existsSync(framePath) && !frames.includes(framePath)) {
      frames.push(framePath);
      frameSamples.push({
        path: framePath,
        target_seconds: sample.target_seconds ?? null,
        actual_seconds: sample.actual_seconds ?? null,
        playback_rate: sample.playback_rate ?? null,
      });
      return true;
    }
    return false;
  };
  const media = await playVisibleVideoToCompletion(page, args, captureFrame);
  if (!media.video_count) {
    for (let i = 0; i < 3; i += 1) {
      await captureFrame(i + 1);
      if (i < 2) await sleep(1000);
    }
  }

  const detail = await page.evaluate(() => {
    const clean = (value) => String(value || "").replace(/\u200b/g, "").replace(/\s+/g, " ").trim();
    const bodyText = clean(document.body ? document.body.innerText : "");
    const isVisible = (el) => {
      if (!el || !(el instanceof Element)) return false;
      const rect = el.getBoundingClientRect();
      const style = window.getComputedStyle(el);
      return rect.width > 4
        && rect.height > 4
        && style.display !== "none"
        && style.visibility !== "hidden"
        && rect.bottom >= 0
        && rect.right >= 0
        && rect.top <= window.innerHeight
        && rect.left <= window.innerWidth;
    };
    const parseCountToken = (text) => {
      const normalized = clean(text).replace(/,/g, "");
      if (!normalized || /^(赞|点赞|收藏|评论|分享|回复|说点什么|展开|收起)$/.test(normalized)) return "";
      const match = normalized.match(/^(\d+(?:\.\d+)?)(万|w|W|k|K)?$/);
      return match ? `${match[1]}${match[2] || ""}` : "";
    };
    const parseCountInText = (text) => {
      const normalized = clean(text).replace(/,/g, "");
      const exact = parseCountToken(normalized);
      if (exact) return exact;
      const match = normalized.match(/(?:^|[^\d.])(\d+(?:\.\d+)?)(万|w|W|k|K)?(?:$|[^\d.])/);
      return match ? `${match[1]}${match[2] || ""}` : "";
    };
    const extractCountSequence = (text) => {
      const normalized = clean(text).replace(/,/g, "");
      return Array.from(normalized.matchAll(/(^|[^\d.])(\d+(?:\.\d+)?)(万|w|W|k|K)?(?=$|[^\d.])/g))
        .map((match) => `${match[2]}${match[3] || ""}`);
    };
    const pickLabeled = (text, label) => {
      const patterns = {
        likes: [/(?:^|\s)(?:赞|点赞|like)[^\d万wkWK]{0,8}(\d+(?:\.\d+)?)(万|w|W|k|K)?/i],
        collects: [/(?:^|\s)(?:收藏|藏|collect|favorite)[^\d万wkWK]{0,8}(\d+(?:\.\d+)?)(万|w|W|k|K)?/i],
        comments: [/(?:^|\s)(?:评论|评|comment)[^\d万wkWK]{0,8}(\d+(?:\.\d+)?)(万|w|W|k|K)?/i],
      };
      for (const pattern of patterns[label]) {
        const match = clean(text).match(pattern);
        if (match) return `${match[1]}${match[2] || ""}`;
      }
      return "";
    };
    const extractMetrics = () => {
      const elements = Array.from(document.querySelectorAll("button, a, span, div")).filter(isVisible);
      const records = elements.map((el) => {
        const rect = el.getBoundingClientRect();
        return {
          text: clean(el.innerText || el.textContent),
          aria: clean(el.getAttribute("aria-label") || ""),
          title: clean(el.getAttribute("title") || ""),
          cls: String(el.className || ""),
          x: rect.x,
          y: rect.y,
          width: rect.width,
          height: rect.height,
        };
      });
      const inActionArea = (item) =>
        item.x > window.innerWidth * 0.45
        && item.y > window.innerHeight - 220
        && item.y < window.innerHeight
        && item.width < window.innerWidth * 0.70
        && !/ICP备|营业执照|公网安备|许可证/.test(item.text);
      const actionZone = records.filter((item) =>
        inActionArea(item)
      );
      const bottomSequences = actionZone
        .map((item) => ({ ...item, sequence: extractCountSequence(`${item.text} ${item.aria} ${item.title}`) }))
        .filter((item) =>
          item.sequence.length >= 3
          && item.x > window.innerWidth * 0.58
          && item.y > window.innerHeight - 120
          && item.text.length < 120
          && !/(回复|展开|条评论|分钟前|小时前|昨天|今天|北京|上海|美国|20\d{2}[-/.年]\d{1,2})/.test(item.text)
        )
        .sort((a, b) => (b.y - a.y) || (b.width - a.width));
      if (bottomSequences.length) {
        const item = bottomSequences[0];
        const sequence = item.sequence.slice(-3);
        return {
          likes: sequence[0],
          collects: sequence[1],
          comments: sequence[2],
          metric_source: "detail_action_bar_text_sequence",
          metric_debug: [{
            text: item.text,
            cls: item.cls.slice(0, 80),
            sequence,
            x: Math.round(item.x),
            y: Math.round(item.y),
          }],
        };
      }
      const findSemanticMetric = (key) => {
        const classPatterns = {
          likes: /(^|[-_\s])(like|likes|liked|like-wrapper)([-_\s]|$)/i,
          collects: /(^|[-_\s])(collect|collects|collected|favorite|fav|star|collect-wrapper)([-_\s]|$)/i,
          comments: /(^|[-_\s])(comment|comments|chat|reply|chat-wrapper|comment-wrapper)([-_\s]|$)/i,
        };
        const textPatterns = {
          likes: /(赞|点赞|like)/i,
          collects: /(收藏|collect|favorite|fav|star)/i,
          comments: /(评论|留言|comment|chat|reply)/i,
        };
        const candidates = records
          .filter((item) => inActionArea(item))
          .map((item) => {
            const haystack = `${item.cls} ${item.aria} ${item.title} ${item.text}`;
            const semantic = classPatterns[key].test(item.cls) || textPatterns[key].test(haystack);
            const value = parseCountInText(`${item.text} ${item.aria} ${item.title}`);
            return { ...item, semantic, value };
          })
          .filter((item) =>
            item.semantic
            && item.value
            && item.height < 90
            && item.text.length < 120
            && !/(parent-comment|comment-item|comments-container)/i.test(item.cls)
            && !/(回复|展开|条评论|分钟前|小时前|昨天|今天|北京|上海|美国)/.test(item.text)
          )
          .sort((a, b) => (b.y - a.y) || (b.x - a.x) || (a.width - b.width));
        return candidates[0] || null;
      };
      const semanticMetrics = {
        likes: findSemanticMetric("likes"),
        collects: findSemanticMetric("collects"),
        comments: findSemanticMetric("comments"),
      };
      if (semanticMetrics.likes && semanticMetrics.collects && semanticMetrics.comments) {
        return {
          likes: semanticMetrics.likes.value,
          collects: semanticMetrics.collects.value,
          comments: semanticMetrics.comments.value,
          metric_source: "detail_action_bar_semantic",
          metric_debug: Object.entries(semanticMetrics).map(([key, item]) => ({
            key,
            text: item.text,
            cls: item.cls.slice(0, 80),
            x: Math.round(item.x),
            y: Math.round(item.y),
          })),
        };
      }
      const numericNodes = actionZone
        .map((item) => ({ ...item, value: parseCountToken(item.text || item.aria || item.title) }))
        .filter((item) => item.value)
        .sort((a, b) => (a.y - b.y) || (a.x - b.x));
      const compactNumericNodes = [];
      for (const item of numericNodes) {
        const duplicate = compactNumericNodes.some((seen) =>
          seen.value === item.value && Math.abs(seen.x - item.x) < 18 && Math.abs(seen.y - item.y) < 18
        );
        if (!duplicate) compactNumericNodes.push(item);
      }
      if (compactNumericNodes.length >= 3) {
        const rightmostRow = compactNumericNodes
          .slice()
          .sort((a, b) => b.y - a.y)
          .filter((item, _, arr) => Math.abs(item.y - arr[0].y) < 80)
          .sort((a, b) => a.x - b.x)
          .slice(-3);
        if (rightmostRow.length === 3) {
          return {
            likes: semanticMetrics.likes?.value || rightmostRow[0].value,
            collects: semanticMetrics.collects?.value || rightmostRow[1].value,
            comments: semanticMetrics.comments?.value || rightmostRow[2].value,
            metric_source: "detail_action_bar",
            metric_debug: [
              ...Object.entries(semanticMetrics)
                .filter(([, item]) => item)
                .map(([key, item]) => ({ key, text: item.text, cls: item.cls.slice(0, 80), x: Math.round(item.x), y: Math.round(item.y) })),
              ...rightmostRow.map((item) => ({ text: item.text, x: Math.round(item.x), y: Math.round(item.y) })),
            ],
          };
        }
      }
      const actionText = actionZone.map((item) => `${item.text} ${item.aria} ${item.title}`).join(" ");
      return {
        likes: pickLabeled(actionText, "likes"),
        collects: pickLabeled(actionText, "collects"),
        comments: pickLabeled(actionText, "comments"),
        metric_source: "detail_action_zone_labeled_fallback",
        metric_debug: actionZone.slice(-12).map((item) => ({ text: item.text.slice(0, 60), x: Math.round(item.x), y: Math.round(item.y) })),
      };
    };
    const meta = extractMetrics();
    const title =
      clean(document.querySelector("meta[property='og:title']")?.content) ||
      clean(document.querySelector("h1")?.innerText) ||
      clean(document.title).replace(/ - 小红书$/, "");
    const description =
      clean(document.querySelector("meta[property='og:description']")?.content) ||
      clean(document.querySelector("meta[name='description']")?.content);
    const images = Array.from(document.querySelectorAll("img[src], img[data-src]"))
      .map((img) => img.currentSrc || img.src || img.dataset.src || "")
      .filter(Boolean)
      .slice(0, 8);
    return { title, description, visible_text: bodyText, metrics: meta, images };
  }).catch((error) => ({ title: "", description: "", visible_text: "", metrics: {}, images: [], extraction_error: String(error && error.message ? error.message : error) }));

  const missingPage = isMissingPage(detail);
  const isVideo = Boolean(media.video_count);
  const videoFrameCoverageCompleted = Boolean(
    !isVideo
    || hasCompleteVideoFrameCoverage(media, frameSamples, args.videoFrameCount)
  );
  const analysisReady = Boolean(
    !missingPage
    && (isVideo ? media.playback_completed && videoFrameCoverageCompleted : textCapture.completed)
  );
  const failureReason = missingPage
    ? "post-unavailable"
    : isVideo && !media.playback_completed
    ? media.playback_stalled ? "video-playback-stalled" : "video-playback-incomplete"
    : isVideo && !videoFrameCoverageCompleted
    ? "video-frame-coverage-incomplete"
    : !isVideo && !textCapture.completed
    ? "text-capture-incomplete"
    : "";
  return {
    ...post,
    published_at: postDate,
    title: missingPage ? post.title : (detail.title || post.title),
    body: missingPage ? post.body : (detail.description || post.body),
    detail_text: missingPage ? "" : textCapture.text,
    likes: missingPage ? post.likes : (detail.metrics.likes || post.likes),
    collects: missingPage ? post.collects : (detail.metrics.collects || post.collects),
    comments: missingPage ? post.comments : (detail.metrics.comments || post.comments),
    metric_source: missingPage ? "card_fallback" : (detail.metrics.metric_source || "unknown"),
    metric_debug: detail.metrics.metric_debug || [],
    cover_url: post.cover_url || (detail.images && detail.images[0]) || "",
    media,
    video_frame_paths: frames,
    video_frame_samples: frameSamples,
    analysis_ready: analysisReady,
    capture_status: {
      content_type: isVideo ? "video" : "text",
      detail_navigation: detailNavigation,
      detail_verification: detailVerification,
      date_evidence: dateEvidence,
      target_date_match: true,
      text_capture: textCapture,
      text_capture_completed: Boolean(textCapture.completed),
      video_playback_completed: Boolean(media.playback_completed),
      video_frame_coverage_completed: videoFrameCoverageCompleted,
      video_frame_count_required: args.videoFrameCount,
      video_frame_count_captured: frameSamples.length,
      failure_reason: failureReason,
    },
    warnings: [
      ...(detail.extraction_error ? [`detail extraction error: ${detail.extraction_error}`] : []),
      ...(!missingPage && !detail.metrics.likes && !detail.metrics.collects && !detail.metrics.comments ? ["engagement metrics not found in visible action bar"] : []),
      ...(!missingPage && isVideo && !media.playback_completed ? ["full video playback could not be confirmed; this post is excluded from summary and analysis"] : []),
      ...(!missingPage && isVideo && media.playback_completed && !videoFrameCoverageCompleted ? [`only ${frameSamples.length}/${args.videoFrameCount} required timeline frames were captured; this post is excluded from summary, highlight details, and analysis`] : []),
      ...(!missingPage && !isVideo && !textCapture.completed ? ["full text expansion and stable reading could not be confirmed; this post is excluded from summary and analysis"] : []),
    ],
    extraction_note: missingPage
      ? "The post detail page was unavailable, so this post is excluded from summary and analysis."
      : isVideo
      ? media.playback_completed && videoFrameCoverageCompleted
        ? `Visible video was played muted through the end at ${media.playback_rate || 1}x (${Math.round(media.duration_seconds || 0)}s), with ${media.frame_sample_count || frames.length} timeline-distributed frame samples and visible captions; audio is not transcribed unless captions or on-screen text are exposed.`
        : media.playback_completed
        ? `Visible video reached the end, but only ${frameSamples.length}/${args.videoFrameCount} required timeline frames were captured; the post is excluded from summary, highlight details, and analysis.`
        : `Visible video playback did not reach a verified end within ${media.playback_wait_seconds || 0}s; the post is excluded from summary and analysis.`
      : textCapture.completed
      ? `Full visible text was expanded and read to a stable state (${textCapture.text.length} characters, ${textCapture.expanded_count} expansion control(s) activated).`
      : "Full visible text expansion and stable reading could not be confirmed; the post is excluded from summary and analysis.",
    detail_captured_at: new Date().toISOString(),
  };
}

async function main() {
  const args = parseArgs(process.argv);
  const { chromium } = require("playwright");
  const postDate = addDays(args.reportDate, -1);
  const rl = createRl();
  let browser;
  fs.mkdirSync(args.outDir, { recursive: true });
  fs.mkdirSync(args.profileDir, { recursive: true });
  try {
    const creators = await ensureCreators(args, rl);

    browser = await chromium.launchPersistentContext(args.profileDir, {
      headless: args.headless,
      viewport: { width: 1440, height: 1000 },
    });
    const page = browser.pages()[0] || await browser.newPage();
    await page.goto("https://www.xiaohongshu.com/", { waitUntil: "domcontentloaded", timeout: 60000 }).catch(() => {});

    console.log("\nA browser window is open.");
    console.log("Log in to Xiaohongshu yourself if needed. Do not share your password, SMS code, cookies, or session token.");
    console.log("After login, this script will automatically search/open watched creators and read visible page DOM.\n");
    await ask(rl, "After login is complete, press Enter here to start creator collection...");

    const packageFile = path.join(args.outDir, `xhs-watch-package-${args.reportDate}.json`);
    const allPosts = [];
    const allFollowers = [];
    const candidateDebug = [];
    const collectionFailures = [];
    const persistPackage = () => writeJson(packageFile, {
      schema_version: 3,
      collector_version: COLLECTOR_VERSION,
      capture_policy_version: CAPTURE_POLICY_VERSION,
      report_date: args.reportDate,
      covered_publishing_date: postDate,
      creators,
      posts: allPosts,
      followers: allFollowers,
      candidate_debug: candidateDebug,
      collection_failures: collectionFailures,
      generated_at: new Date().toISOString(),
      browser_profile_dir: args.profileDir,
    });
    persistPackage();

    for (const creator of creators) {
      await page.bringToFront();
      console.log(`\nCreator: ${creator}`);
      console.log("Automatically searching and opening the best matching visible result...");
      let opened = await autoOpenCreatorPage(page, creator);
      if (!opened.ok) {
        console.log(`Automatic navigation failed for ${creator}: ${opened.reason}.`);
        const base = await saveDebugSnapshot(page, args.outDir, creator, opened.reason);
        console.log(`Saved debug snapshot: ${base}.txt / .png`);
        if (args.manualFallback) {
          console.log("Use the browser to open this creator's profile.");
          console.log("If Xiaohongshu shows a verification/risk page, solve it manually or skip; this script will not bypass it.");
          const answer = await ask(rl, "Press Enter to verify the currently visible profile, or type s to skip: ");
          if (answer.toLowerCase() !== "s") {
            const manualVerification = await verifyCreatorProfile(page, creator);
            if (manualVerification.ok) {
              opened = { ok: true, reason: "manual-verified-profile", profile_url: page.url(), attempts: opened.attempts || [] };
            }
          }
          if (!opened.ok) console.log(`Manual profile verification failed for ${creator}; skipping extraction.`);
        } else {
          console.log("Skipping this creator because a verified profile page was not reached.");
        }
        if (!opened.ok) {
          candidateDebug.push({
            creator,
            navigation_ok: false,
            navigation_reason: opened.reason,
            page_url: page.url(),
            navigation_attempts: opened.attempts || [],
          });
          collectionFailures.push({ creator, stage: "creator-navigation", reason: opened.reason, page_url: page.url() });
          persistPackage();
          continue;
        }
      }
      console.log(`Opened and verified profile for ${creator} via ${opened.reason}. Extracting visible content...`);

      const extracted = await collectVisibleProfilePosts(page, creator, postDate, args.reportDate);
      const candidates = uniquePosts(extracted.posts.filter(isProfilePostCandidate)).slice(0, args.detailLimit);
      const profileUrl = page.url();
      const detailed = [];
      console.log(`Found ${candidates.length} likely target-date post(s) for ${postDate}. Opening detail pages...`);
      for (let i = 0; i < candidates.length; i += 1) {
        const detail = await extractDetailPage(page, creator, candidates[i], args, postDate, i + 1);
        detailed.push(detail);
        const readiness = detail.analysis_ready ? "analysis-ready" : `excluded (${detail.capture_status?.failure_reason || "incomplete"})`;
        console.log(`  Detail ${i + 1}/${candidates.length}: ${detail.title || "(untitled)"} - ${readiness}`);
      }
      const targetDetails = detailed.filter((item) => item.capture_status?.target_date_match === true);
      allPosts.push(...targetDetails);
      allFollowers.push(extracted.follower);
      candidateDebug.push({
        creator,
        navigation_ok: true,
        navigation_reason: opened.reason,
        page_url: profileUrl,
        navigation_attempts: opened.attempts || [],
        extracted_post_count: extracted.posts.length,
        matched_post_count: candidates.length,
        analysis_ready_count: targetDetails.filter((item) => item.analysis_ready).length,
        incomplete_detail_count: targetDetails.filter((item) => !item.analysis_ready).length,
        non_target_or_unverified_count: detailed.length - targetDetails.length,
        target_date: postDate,
        sample_candidates: extracted.posts.slice(0, 12).map((item) => ({
          title: item.title,
          body: String(item.body || "").slice(0, 220),
          url: item.url,
        })),
        page_text_excerpt: extracted.page_text_excerpt,
      });
      detailed.filter((item) => !item.analysis_ready && item.capture_status?.failure_reason !== "post-date-not-target").forEach((item) => {
        collectionFailures.push({
          creator,
          stage: "post-detail",
          reason: item.capture_status?.failure_reason || "incomplete",
          title: item.title || "",
          url: item.url || "",
        });
      });
      persistPackage();
      console.log(`Captured ${targetDetails.filter((item) => item.analysis_ready).length}/${targetDetails.length} analysis-ready target-date post(s) for ${creator}; follower count: ${extracted.follower.follower_count || "not found"}.`);
      await sleep(1800);
    }

    console.log("\nCollection complete.");
    console.log(`Collection package: ${packageFile}`);
    console.log(`Next: run daily_brief.py --package "${packageFile}" --language bilingual --detail detailed --archive-dir daily-reports --no-stdout, then open the saved Markdown report in Codex/GPT chat.`);
  } finally {
    rl.close();
    if (browser) await browser.close().catch(() => {});
  }
}

if (require.main === module) {
  main().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}

module.exports = {
  hasCompleteVideoFrameCoverage,
  isValidIsoDate,
  isCreatorProfileUrl,
  isPostDetailUrl,
  matchesTargetDateEvidence,
  noteIdFromUrl,
  parseArgs,
  timelineFrameTargets,
};
