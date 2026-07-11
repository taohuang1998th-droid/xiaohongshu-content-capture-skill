const assert = require("node:assert/strict");
const test = require("node:test");

const config = require("../desktop-app/src/config.js");

test("normalizes and deduplicates creator handles", () => {
  assert.deepEqual(
    config.normalizeCreators("小Lin说\n@小Lin说，孟羽童Morita"),
    ["@小Lin说", "@孟羽童Morita"],
  );
});

test("validates dates and bounded integer options", () => {
  assert.equal(config.isValidIsoDate("2026-07-11"), true);
  assert.equal(config.isValidIsoDate("2026-04-31"), false);
  assert.equal(config.integerOption("6", 4, 4, 24, "Frames"), 6);
  assert.throws(() => config.integerOption(25, 6, 4, 24, "Frames"), /4 to 24/);
});

test("rejects unsupported enum values", () => {
  assert.equal(config.enumOption("双语", "中文", ["中文", "英文", "双语"], "Language"), "双语");
  assert.throws(() => config.enumOption("法语", "中文", ["中文", "英文", "双语"], "Language"), /must be one of/);
});
