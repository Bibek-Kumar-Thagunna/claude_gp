import { spawnSync } from "node:child_process";

/**
 * pnpm 9 does not honour `auditConfig.ignoreGhsas` from pnpm-workspace.yaml.
 * Keep the exception narrow and machine-checked instead of disabling the audit.
 *
 * Both entries are transitive Expo/Metro build-time dependencies, are absent
 * from the deployed API/web runtime paths, and currently have no patched
 * upstream version. A changed module or newly-published fix makes this script
 * fail closed so the exception must be reviewed rather than silently growing.
 */
const acceptedUnpatchedBuildAdvisories = new Map([
  ["GHSA-86w9-cpqp-85rv", "node-forge"],
  ["GHSA-vfj7-8cjw-p6xm", "braces"],
]);

const pnpm = process.platform === "win32" ? "pnpm.cmd" : "pnpm";
const result = spawnSync(pnpm, ["audit", "--prod", "--audit-level", "moderate", "--json"], {
  cwd: new URL("..", import.meta.url),
  encoding: "utf8",
  maxBuffer: 16 * 1024 * 1024,
});

if (result.error) {
  console.error(`Unable to run pnpm audit: ${result.error.message}`);
  process.exit(1);
}

let report;
try {
  report = JSON.parse(result.stdout);
} catch {
  console.error("pnpm audit did not return valid JSON. Refusing to pass the dependency gate.");
  if (result.stderr) console.error(result.stderr.trim());
  process.exit(1);
}

const advisories = Object.values(report.advisories ?? {});
const ignored = [];
const blocking = [];

for (const advisory of advisories) {
  const expectedModule = acceptedUnpatchedBuildAdvisories.get(advisory.github_advisory_id);
  const isAccepted =
    expectedModule === advisory.module_name && advisory.patched_versions === "<0.0.0";

  (isAccepted ? ignored : blocking).push(advisory);
}

for (const advisory of ignored) {
  console.warn(
    `Temporarily accepted build-tool advisory ${advisory.github_advisory_id} ` +
      `(${advisory.module_name}): no patched upstream version exists.`,
  );
}

if (blocking.length > 0) {
  console.error("\nProduction dependency audit failed:");
  for (const advisory of blocking) {
    console.error(
      `- ${advisory.severity}: ${advisory.github_advisory_id ?? advisory.id} ` +
        `${advisory.module_name} — ${advisory.title}`,
    );
  }
  process.exit(1);
}

// A non-vulnerability failure (network/registry/config) must not be converted
// into a green audit just because the JSON happened to contain no advisories.
if (result.status !== 0 && advisories.length === 0) {
  console.error(result.stderr.trim() || "pnpm audit failed without an advisory report.");
  process.exit(1);
}

console.log(
  `Production dependency audit passed (${ignored.length} reviewed build-tool exceptions).`,
);
