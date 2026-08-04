import { spawnSync } from "node:child_process";
import { existsSync, readFileSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { EX_USAGE } from "../cli.ts";
import { BEACON_FILE, LOCK_FILE, missingLayoutEntries } from "../fleet.ts";
import {
  MACHINE_IDENTITY_EMAIL,
  MACHINE_IDENTITY_NAME,
} from "./init.ts";

/**
 * tiphys doctor: deterministic health checks over the current directory as
 * a fleet home (kernel plan v1, M1-P2 step 3). One line per check, format
 * "CHECK <name> PASS|WARN|FAIL <detail>", exit 0 only if no check FAILs.
 * Every check is file-based (substrate-neutral, DR-0007): no process is
 * ever probed (plan constraint C-2), and no currency is ever read off a
 * log tail (plan constraint C-1; this phase's checks read no task state,
 * and any later task-currency check must read tasks/<id>/meta.json and the
 * turn-end file only).
 */

type CheckStatus = "PASS" | "WARN" | "FAIL";

interface CheckResult {
  name: string;
  status: CheckStatus;
  detail: string;
  /** Names the WARN condition a profile may promote to FAIL (EXT-F-08). */
  condition?: string;
}

/**
 * Readiness profiles (EXT-F-08): a profile promotes its required WARN
 * conditions to FAIL, so exit 0 under a profile means ready for that mode
 * (SC-011: never green by omission). The M1 table is deliberately small
 * and grows at M2/M3 with the gate registry.
 */
export const PROFILES: Record<string, readonly string[]> = {
  generic: [],
  "local-only": [],
  "direct-pr": ["gh-missing"],
  full: ["gh-missing", "remote-missing"],
  watch: ["beacon-absent"],
};

/** Locate the kernel's own package.json (same walk as src/version.ts). */
function readKernelEnginesNode(): string {
  let dir = dirname(fileURLToPath(import.meta.url));
  for (;;) {
    const candidate = join(dir, "package.json");
    if (existsSync(candidate)) {
      const parsed: unknown = JSON.parse(readFileSync(candidate, "utf8"));
      const engines = (parsed as { engines?: { node?: unknown } }).engines;
      if (engines === undefined || typeof engines.node !== "string") {
        throw new Error(`no engines.node string in ${candidate}`);
      }
      return engines.node;
    }
    const parent = dirname(dir);
    if (parent === dir) {
      throw new Error("package.json not found above " + import.meta.url);
    }
    dir = parent;
  }
}

function checkNode(): CheckResult {
  const range = readKernelEnginesNode();
  const match = /^>=\s*(\d+)/.exec(range);
  if (match === null) {
    return {
      name: "node",
      status: "FAIL",
      detail: `cannot interpret kernel engines.node range "${range}"`,
    };
  }
  const floor = Number(match[1]);
  const major = Number(process.version.slice(1).split(".")[0]);
  if (Number.isFinite(major) && major >= floor) {
    return {
      name: "node",
      status: "PASS",
      detail: `${process.version} satisfies kernel engines "${range}"`,
    };
  }
  return {
    name: "node",
    status: "FAIL",
    detail: `${process.version} does not satisfy kernel engines "${range}"`,
  };
}

function toolVersion(cmd: string): string | undefined {
  const result = spawnSync(cmd, ["--version"], { encoding: "utf8" });
  if (result.error !== undefined || result.status !== 0) {
    return undefined;
  }
  const firstLine = (result.stdout ?? "").split("\n")[0] ?? "";
  return firstLine.trim();
}

function checkGit(): CheckResult {
  const version = toolVersion("git");
  if (version === undefined) {
    return { name: "git", status: "FAIL", detail: "git not found on PATH" };
  }
  return { name: "git", status: "PASS", detail: version };
}

function checkGh(): CheckResult {
  const version = toolVersion("gh");
  if (version === undefined) {
    return {
      name: "gh",
      status: "WARN",
      detail: "gh not found on PATH, PR modes unavailable",
      condition: "gh-missing",
    };
  }
  return { name: "gh", status: "PASS", detail: version };
}

function checkLayout(root: string): CheckResult {
  const missing = missingLayoutEntries(root);
  if (missing.length > 0) {
    return {
      name: "layout",
      status: "FAIL",
      detail: `missing ${missing.join(", ")}`,
    };
  }
  return { name: "layout", status: "PASS", detail: "all layout entries present" };
}

function checkRemote(root: string): CheckResult {
  if (!existsSync(join(root, ".git"))) {
    return {
      name: "remote",
      status: "WARN",
      detail: "fleet home is not a git repository",
      condition: "remote-missing",
    };
  }
  const result = spawnSync("git", ["-C", root, "remote"], { encoding: "utf8" });
  const remotes =
    result.status === 0
      ? (result.stdout ?? "").split("\n").filter((line) => line !== "")
      : [];
  if (remotes.length === 0) {
    return {
      name: "remote",
      status: "WARN",
      detail: "no remote configured, fleet state has no push target (SC-002)",
      condition: "remote-missing",
    };
  }
  return {
    name: "remote",
    status: "PASS",
    detail: `remote configured (${remotes.join(", ")})`,
  };
}

function checkLock(root: string): CheckResult {
  const lockPath = join(root, LOCK_FILE);
  if (!existsSync(lockPath)) {
    return { name: "lock", status: "PASS", detail: "no lease present" };
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(readFileSync(lockPath, "utf8"));
  } catch (error) {
    return {
      name: "lock",
      status: "FAIL",
      detail: `lease file is not valid JSON (${String(error)})`,
    };
  }
  const lease = parsed as { holderId?: unknown; expiresAt?: unknown };
  if (
    typeof lease.holderId !== "string" ||
    lease.holderId === "" ||
    typeof lease.expiresAt !== "string"
  ) {
    return {
      name: "lock",
      status: "FAIL",
      detail: "lease file is missing holderId or expiresAt",
    };
  }
  const expiresMs = Date.parse(lease.expiresAt);
  const expired = Number.isFinite(expiresMs) && expiresMs <= Date.now();
  return {
    name: "lock",
    status: "PASS",
    detail: `lease held by ${lease.holderId}, expires ${lease.expiresAt}${expired ? " (expired)" : ""}`,
  };
}

function checkBeacon(root: string): CheckResult {
  const beaconPath = join(root, BEACON_FILE);
  if (!existsSync(beaconPath)) {
    return {
      name: "beacon",
      status: "WARN",
      detail: "watcher not running or not scheduled",
      condition: "beacon-absent",
    };
  }
  const ageSeconds = (Date.now() - statSync(beaconPath).mtimeMs) / 1000;
  return {
    name: "beacon",
    status: "PASS",
    detail: `beacon present, age ${String(Math.max(0, Math.round(ageSeconds)))}s (freshness threshold lands with the M1-P5 liveness guard)`,
  };
}

function gitConfigGet(root: string, key: string): string | undefined {
  const result = spawnSync("git", ["-C", root, "config", "--get", key], {
    encoding: "utf8",
  });
  if (result.error !== undefined || result.status !== 0) {
    return undefined;
  }
  const value = (result.stdout ?? "").trim();
  return value === "" ? undefined : value;
}

function checkIdentity(root: string): CheckResult {
  const name = gitConfigGet(root, "user.name");
  const email = gitConfigGet(root, "user.email");
  if (name === undefined || email === undefined) {
    return {
      name: "identity",
      status: "WARN",
      detail: `git user.name or user.email unset; fleet-scoped commits use init's machine identity (${MACHINE_IDENTITY_NAME} <${MACHINE_IDENTITY_EMAIL}>) and do not require it`,
      condition: "identity-unset",
    };
  }
  return {
    name: "identity",
    status: "PASS",
    detail: `git commit identity configured (${name} <${email}>)`,
  };
}

export function runChecks(root: string): CheckResult[] {
  return [
    checkNode(),
    checkGit(),
    checkGh(),
    checkLayout(root),
    checkRemote(root),
    checkLock(root),
    checkBeacon(root),
    checkIdentity(root),
  ];
}

export function cmdDoctor(args: string[]): number {
  let profile = "generic";
  for (let i = 0; i < args.length; i += 1) {
    if (args[i] === "--for" && i + 1 < args.length) {
      profile = args[i + 1] as string;
      i += 1;
    } else {
      process.stderr.write("usage: tiphys doctor [--for <profile>]\n");
      return EX_USAGE;
    }
  }
  const promoted = PROFILES[profile];
  if (promoted === undefined) {
    process.stderr.write(
      `tiphys doctor: unknown profile "${profile}" (profiles: ${Object.keys(PROFILES).join(", ")})\n`,
    );
    return EX_USAGE;
  }

  let failed = false;
  for (const result of runChecks(process.cwd())) {
    let status: CheckStatus = result.status;
    let detail = result.detail;
    if (
      status === "WARN" &&
      result.condition !== undefined &&
      promoted.includes(result.condition)
    ) {
      status = "FAIL";
      detail = `${detail} (required for profile ${profile})`;
    }
    if (status === "FAIL") {
      failed = true;
    }
    process.stdout.write(`CHECK ${result.name} ${status} ${detail}\n`);
  }
  return failed ? 1 : 0;
}
