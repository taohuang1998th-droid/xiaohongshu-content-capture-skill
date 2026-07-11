const assert = require("node:assert/strict");
const path = require("node:path");
const { spawnSync } = require("node:child_process");
const test = require("node:test");

const collector = require("../skills/xiaohongshu-content-capture/scripts/collect_with_login.js");
const collectorPath = path.resolve(__dirname, "../skills/xiaohongshu-content-capture/scripts/collect_with_login.js");

test("prints CLI help without loading browser dependencies", () => {
  const result = spawnSync(process.execPath, [collectorPath, "--help"], { encoding: "utf8" });
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /--video-frame-count/);
});

test("validates real calendar dates", () => {
  assert.equal(collector.isValidIsoDate("2026-07-11"), true);
  assert.equal(collector.isValidIsoDate("2026-02-29"), false);
  assert.equal(collector.isValidIsoDate("2026-13-01"), false);
});

test("rejects unknown and invalid CLI options", () => {
  assert.throws(
    () => collector.parseArgs(["node", "collector", "--unknown"]),
    /Unknown option/,
  );
  assert.throws(
    () => collector.parseArgs(["node", "collector", "--report-date", "2026-02-30"]),
    /YYYY-MM-DD/,
  );
});

test("parses bounded video capture options", () => {
  const args = collector.parseArgs([
    "node",
    "collector",
    "--report-date",
    "2026-07-11",
    "--detail-limit",
    "8",
    "--video-frame-count",
    "10",
    "--video-playback-rate",
    "max",
  ]);
  assert.equal(args.detailLimit, 8);
  assert.equal(args.videoFrameCount, 10);
  assert.equal(args.videoPlaybackRate, "max");
});

test("creates ordered equidistant frame targets", () => {
  const targets = collector.timelineFrameTargets(100, 6);
  assert.equal(targets.length, 6);
  assert.equal(targets[0], 0);
  assert.ok(targets.at(-1) < 100);
  assert.ok(targets.every((value, index) => index === 0 || value > targets[index - 1]));
  assert.deepEqual(collector.timelineFrameTargets(0, 6), []);
});

test("requires every real video frame sample for strict coverage", () => {
  const samples = Array.from({ length: 6 }, (_, index) => ({ actual_seconds: index * 10 }));
  assert.equal(collector.hasCompleteVideoFrameCoverage({ frame_sample_count: 6 }, samples, 6), true);
  assert.equal(collector.hasCompleteVideoFrameCoverage({ frame_sample_count: 6 }, samples.slice(0, 5), 6), false);
  assert.equal(collector.hasCompleteVideoFrameCoverage({
    frame_sample_count: 6,
    frame_sampling_missed_targets_seconds: [20],
  }, samples, 6), false);
});

test("extracts only supported Xiaohongshu post IDs", () => {
  assert.equal(collector.noteIdFromUrl("https://www.xiaohongshu.com/explore/abc123?xsec_token=1"), "abc123");
  assert.equal(collector.noteIdFromUrl("https://www.xiaohongshu.com/user/profile/creator"), "");
  assert.equal(collector.isPostDetailUrl("https://www.xiaohongshu.com/explore/abc123", "abc123"), true);
  assert.equal(collector.isCreatorProfileUrl("https://www.xiaohongshu.com/user/profile/creator"), true);
});

test("matches explicit target-date evidence", () => {
  assert.equal(collector.matchesTargetDateEvidence("发布于 2026年7月10日", "2026-07-10"), true);
  assert.equal(collector.matchesTargetDateEvidence("发布于 2026年7月9日", "2026-07-10"), false);
});
