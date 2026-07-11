const { spawnSync } = require("child_process");

const candidates = process.platform === "win32"
  ? [["py", ["-3"]], ["python", []], ["python3", []]]
  : [["python3", []], ["python", []]];

for (const [command, prefix] of candidates) {
  const probe = spawnSync(command, [...prefix, "--version"], { encoding: "utf8", windowsHide: true });
  if (probe.error || probe.status !== 0) continue;
  const result = spawnSync(
    command,
    [...prefix, "-m", "unittest", "discover", "-s", "../tests", "-p", "test_*.py"],
    { encoding: "utf8", stdio: "inherit", windowsHide: true },
  );
  process.exit(result.status === null ? 1 : result.status);
}

console.error("Python 3 was not found; report tests could not run.");
process.exit(1);
