#!/usr/bin/env node
const fs = require("fs");
const path = require("path");
const readline = require("readline");
const { chromium } = require("playwright");

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
  };
  for (let i = 2; i < argv.length; i += 1) {
    const arg = argv[i];
    const next = argv[i + 1];
    if (arg === "--creators-file") args.creatorsFile = path.resolve(next), i += 1;
    else if (arg === "--report-date") args.reportDate = next, i += 1;
    else if (arg === "--out-dir") args.outDir = path.resolve(next), i += 1;
    else if (arg === "--profile-dir") args.profileDir = path.resolve(next), i += 1;
    else if (arg === "--headless") args.headless = true;
    else if (arg === "--manual-fallback") args.manualFallback = true;
    else if (arg === "--no-manual-fallback") args.manualFallback = false;
    else if (arg === "--detail-limit") args.detailLimit = Number(next), i += 1;
    else if (arg === "--play-seconds") args.playSeconds = Number(next), i += 1;
    else if (arg === "--help" || arg === "-h") {
      printHelp();
      process.exit(0);
    }
  }
  return args;
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
  --play-seconds <n>     Seconds to let visible videos play before extracting. Default: 12.
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
  return fs.readFileSync(file, "utf8")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith("#"))
    .map(normalizeCreator);
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
  return readline.createInterface({ input: process.stdin, output: process.stdout });
}

function ask(rl, question) {
  return new Promise((resolve) => rl.question(question, (answer) => resolve(answer.trim())));
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

function appendCsv(file, rows, headers) {
  if (!rows.length) return;
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const exists = fs.existsSync(file);
  const body = toCsv(rows, headers).split("\n").slice(exists ? 1 : 0).join("\n");
  fs.appendFileSync(file, `${body}\n`, "utf8");
}

function writeJson(file, data) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, `${JSON.stringify(data, null, 2)}\n`, "utf8");
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function safeGoto(page, url) {
  await page.goto(url, { waitUntil: "domcontentloaded", timeout: 60000 }).catch(() => {});
  await sleep(6500);
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
  if (/\/user\/profile|\/user\//i.test(candidate.href)) score += 25;
  if (/关注|粉丝|获赞|笔记/.test(candidate.text)) score += 10;
  if (/search_result/.test(candidate.href)) score -= 20;
  return score;
}

async function clickBestCreatorCandidate(page, creator) {
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
    .map((candidate) => ({ ...candidate, score: scoreCandidate(candidate, creator) }))
    .sort((a, b) => b.score - a.score);
  const best = ranked[0];
  if (!best || best.score < 80) return false;

  await Promise.all([
    page.waitForLoadState("domcontentloaded", { timeout: 15000 }).catch(() => {}),
    page.evaluate((targetHref) => {
      const link = Array.from(document.querySelectorAll("a[href]")).find((a) => a.href === targetHref);
      if (link) link.click();
    }, best.href),
  ]);
  await sleep(3500);
  return true;
}

async function autoOpenCreatorPage(page, creator) {
  const keyword = encodeURIComponent(creator.replace(/^@/, ""));
  const searchUrls = [
    `https://www.xiaohongshu.com/search_result?keyword=${keyword}&type=user`,
    `https://www.xiaohongshu.com/search_result?keyword=${keyword}`,
  ];

  for (const url of searchUrls) {
    await safeGoto(page, url);
    await clickVisibleExactText(page, "用户");
    await sleep(5000);
    await waitForCreatorSignals(page, creator);
    const text = await visibleText(page);
    if (/验证码|验证|风险|异常|安全验证/.test(text)) {
      return { ok: false, reason: "verification" };
    }
    if (text.includes(creator.replace(/^@/, ""))) {
      const clicked = await clickBestCreatorCandidate(page, creator);
      if (clicked) {
        await page.mouse.wheel(0, 900).catch(() => {});
        await sleep(1200);
        await page.mouse.wheel(0, -400).catch(() => {});
        await sleep(800);
        return { ok: true, reason: "clicked-search-result" };
      }
    }
  }
  return { ok: false, reason: "not-found" };
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

function noteIdFromUrl(url) {
  const match = String(url || "").match(/\/(?:explore|search_result)\/([^/?#]+)/);
  return match ? match[1] : String(url || "");
}

function isYesterdayCandidate(post, creator) {
  const text = `${post.title || ""} ${post.body || ""}`;
  const creatorName = String(creator || "").replace(/^@/, "");
  return /昨天|1天前/.test(text)
    && /\/(?:explore|search_result)\//.test(post.url || "")
    && (!creatorName || text.includes(creatorName));
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

async function tryPlayVisibleMedia(page, seconds) {
  const result = await page.evaluate(() => {
    const media = Array.from(document.querySelectorAll("video, audio"));
    let videoCount = 0;
    let audioCount = 0;
    let attempted = 0;
    for (const item of media) {
      if (item.tagName.toLowerCase() === "video") videoCount += 1;
      if (item.tagName.toLowerCase() === "audio") audioCount += 1;
      try {
        item.muted = true;
        item.playbackRate = 1;
        const promise = item.play();
        if (promise && typeof promise.catch === "function") promise.catch(() => {});
        attempted += 1;
      } catch (_) {}
    }
    return { video_count: videoCount, audio_count: audioCount, play_attempted: attempted };
  }).catch(() => ({ video_count: 0, audio_count: 0, play_attempted: 0 }));
  if (result.play_attempted) await sleep(Math.max(1000, seconds * 1000));
  return result;
}

async function clickPostFromProfile(page, post) {
  const noteId = noteIdFromUrl(post.url);
  const title = String(post.title || "").slice(0, 28);
  return page.evaluate(({ noteId, title }) => {
    const isVisible = (el) => {
      if (!el || !(el instanceof Element)) return false;
      const rect = el.getBoundingClientRect();
      const style = window.getComputedStyle(el);
      return rect.width > 20 && rect.height > 10 && style.display !== "none" && style.visibility !== "hidden";
    };
    const links = Array.from(document.querySelectorAll("a[href]")).filter(isVisible);
    const byId = links.find((link) => noteId && link.href && link.href.includes(noteId));
    const byTitle = links.find((link) => {
      const text = (link.innerText || link.textContent || "").replace(/\s+/g, " ").trim();
      return title && text.includes(title);
    });
    const target = byId || byTitle;
    if (!target) return false;
    target.scrollIntoView({ block: "center", inline: "center" });
    target.click();
    return true;
  }, { noteId, title }).catch(() => false);
}

function isMissingPage(detail) {
  const text = `${detail.title || ""} ${detail.visible_text || ""}`;
  return /访问的页面不见了|页面不见了|内容无法查看/.test(text);
}

async function extractDetailPage(page, creator, post, args, postDate, index, profileUrl) {
  const noteId = noteIdFromUrl(post.url);
  const creatorPart = safeFilePart(creator);
  const notePart = safeFilePart(noteId || index);
  const frameDir = path.join(args.outDir, "frames", `${creatorPart}-${notePart}`);
  fs.mkdirSync(frameDir, { recursive: true });

  let openedByClick = false;
  if (profileUrl) {
    await safeGoto(page, profileUrl);
    await sleep(1200);
    openedByClick = await clickPostFromProfile(page, post);
    if (openedByClick) await sleep(4500);
  }
  if (!openedByClick) {
    await safeGoto(page, post.url);
    await sleep(2500);
  }
  const media = await tryPlayVisibleMedia(page, args.playSeconds);
  const frames = [];
  for (let i = 0; i < 3; i += 1) {
    const framePath = path.join(frameDir, `frame-${String(i + 1).padStart(2, "0")}.png`);
    await page.screenshot({ path: framePath, fullPage: false }).catch(() => {});
    if (fs.existsSync(framePath)) frames.push(framePath);
    if (i < 2 && media.play_attempted) await sleep(2500);
  }

  const detail = await page.evaluate(() => {
    const clean = (value) => String(value || "").replace(/\u200b/g, "").replace(/\s+/g, " ").trim();
    const bodyText = clean(document.body ? document.body.innerText : "");
    const meta = {};
    const metaText = bodyText.slice(0, 30000);
    const pick = (patterns) => {
      for (const pattern of patterns) {
        const match = metaText.match(pattern);
        if (match) return `${match[1]}${match[2] || ""}`;
      }
      return "";
    };
    meta.likes = pick([/(?:赞|点赞)[^\d万wk千百十]{0,8}([\d,.]+)\s*([万wk千百十]?)/i]);
    meta.collects = pick([/(?:收藏|藏)[^\d万wk千百十]{0,8}([\d,.]+)\s*([万wk千百十]?)/i]);
    meta.comments = pick([/(?:评论|评)[^\d万wk千百十]{0,8}([\d,.]+)\s*([万wk千百十]?)/i]);
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
    return { title, description, visible_text: bodyText.slice(0, 12000), metrics: meta, images };
  }).catch(() => ({ title: "", description: "", visible_text: "", metrics: {}, images: [] }));

  const missingPage = isMissingPage(detail);
  return {
    ...post,
    published_at: postDate,
    title: missingPage ? post.title : (detail.title || post.title),
    body: missingPage ? post.body : (detail.description || post.body),
    detail_text: missingPage ? "" : detail.visible_text,
    likes: missingPage ? post.likes : (detail.metrics.likes || post.likes),
    collects: missingPage ? post.collects : (detail.metrics.collects || post.collects),
    comments: missingPage ? post.comments : (detail.metrics.comments || post.comments),
    cover_url: post.cover_url || (detail.images && detail.images[0]) || "",
    media,
    video_frame_paths: frames,
    extraction_note: missingPage
      ? "The script found this post on the creator page, but the detail page could not be opened from the visible browser session; summary falls back to the visible card text."
      : media.video_count
      ? "Visible video was played muted and sampled with screenshots; audio/transcription is available only if visible captions/text are present on page."
      : "Detail page text and visible images were captured; no playable video element was detected.",
    detail_captured_at: new Date().toISOString(),
  };
}

async function main() {
  const args = parseArgs(process.argv);
  const postDate = addDays(args.reportDate, -1);
  const rl = createRl();
  fs.mkdirSync(args.outDir, { recursive: true });
  fs.mkdirSync(args.profileDir, { recursive: true });
  const creators = await ensureCreators(args, rl);

  const browser = await chromium.launchPersistentContext(args.profileDir, {
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

  for (const creator of creators) {
    await page.bringToFront();
    console.log(`\nCreator: ${creator}`);
    console.log("Automatically searching and opening the best matching visible result...");
    const opened = await autoOpenCreatorPage(page, creator);
    if (!opened.ok) {
      console.log(`Automatic navigation failed for ${creator}: ${opened.reason}.`);
      const base = await saveDebugSnapshot(page, args.outDir, creator, opened.reason);
      console.log(`Saved debug snapshot: ${base}.txt / .png`);
      if (args.manualFallback) {
        console.log("Use the browser to open this creator's profile or yesterday's visible posts.");
        console.log("If Xiaohongshu shows a verification/risk page, solve it manually or skip; this script will not bypass it.");
        const answer = await ask(rl, "Press Enter to extract the currently visible page, or type s to skip: ");
        if (answer.toLowerCase() === "s") continue;
      } else {
        console.log("Continuing with best-effort extraction from the current page, then moving to the next creator.");
      }
    } else {
      console.log(`Opened page for ${creator} via ${opened.reason}. Extracting visible content...`);
    }

    const extracted = await extractVisiblePage(page, creator, postDate, args.reportDate);
    const candidates = uniquePosts(extracted.posts.filter((post) => isYesterdayCandidate(post, creator))).slice(0, args.detailLimit);
    const profileUrl = page.url();
    const detailed = [];
    console.log(`Found ${candidates.length} likely yesterday post(s). Opening detail pages...`);
    for (let i = 0; i < candidates.length; i += 1) {
      const detail = await extractDetailPage(page, creator, candidates[i], args, postDate, i + 1, profileUrl);
      detailed.push(detail);
      console.log(`  Detail ${i + 1}/${candidates.length}: ${detail.title || "(untitled)"}`);
    }
    allPosts.push(...detailed);
    allFollowers.push(extracted.follower);
    writeJson(packageFile, {
      report_date: args.reportDate,
      covered_publishing_date: postDate,
      creators,
      posts: allPosts,
      followers: allFollowers,
      generated_at: new Date().toISOString(),
      browser_profile_dir: args.profileDir,
    });
    console.log(`Captured ${detailed.length} detailed yesterday post(s) for ${creator}; follower count: ${extracted.follower.follower_count || "not found"}.`);
    await sleep(1800);
  }

  console.log("\nCollection complete.");
  console.log(`Collection package: ${packageFile}`);
  console.log(`Next: run daily_brief.py --package "${packageFile}" and paste the Markdown report directly in chat.`);

  rl.close();
  await browser.close();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
