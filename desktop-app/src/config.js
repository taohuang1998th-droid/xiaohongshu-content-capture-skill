function normalizeCreators(input) {
  const creators = String(input || "")
    .split(/[\n,，;；]+/)
    .map((item) => item.trim())
    .filter(Boolean)
    .map((item) => (item.startsWith("@") ? item : `@${item}`));
  return Array.from(new Set(creators));
}

function isValidIsoDate(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(value || ""))) return false;
  const [year, month, day] = value.split("-").map(Number);
  const parsed = new Date(Date.UTC(year, month - 1, day));
  return parsed.getUTCFullYear() === year
    && parsed.getUTCMonth() === month - 1
    && parsed.getUTCDate() === day;
}

function integerOption(value, fallback, min, max, label) {
  const candidate = value === undefined || value === null || value === "" ? fallback : Number(value);
  if (!Number.isInteger(candidate) || candidate < min || candidate > max) {
    throw new Error(`${label} must be an integer from ${min} to ${max}.`);
  }
  return candidate;
}

function enumOption(value, fallback, allowed, label) {
  const candidate = value || fallback;
  if (!allowed.includes(candidate)) {
    throw new Error(`${label} must be one of: ${allowed.join(", ")}.`);
  }
  return candidate;
}

module.exports = {
  enumOption,
  integerOption,
  isValidIsoDate,
  normalizeCreators,
};
