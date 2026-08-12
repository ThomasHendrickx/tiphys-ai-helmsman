import { spawnSync } from "node:child_process";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { EX_USAGE } from "../cli.ts";
import { BEACON_FILE, LOCK_FILE, loadFleet, missingLayoutEntries } from "../fleet.ts";
import { judgeBeacon, warnIfWatcherStale } from "../liveness.ts";
import { readRegularFileIfPresent } from "../task.ts";
import { decodeDocument } from "../validate.ts";
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

export type CheckStatus = "PASS" | "WARN" | "FAIL";

export interface CheckResult {
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
  /* M3-P8 step 7 (R-098): `retention-undeclared` is promoted here, so a fleet
     whose charter declares no retention paths is not ready for full mode. The
     generic profile leaves it a WARN, which is the state a fleet legitimately
     sits in before its charter is written. */
  full: ["gh-missing", "remote-missing", "retention-undeclared"],
  watch: ["beacon-absent", "beacon-stale"],
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

/**
 * Evaluate a running node version against the kernel's engines.node range.
 * Fails closed (CR-102): only the exact ">=<major>[.<minor>[.<patch>]]"
 * form is interpreted, compared over the full version tuple; any other
 * range shape, and any unparseable version, is FAIL with a reason line,
 * never a silent truncation.
 */
export function nodeCheckFor(range: string, version: string): CheckResult {
  const match = /^>=\s*(\d+)(?:\.(\d+))?(?:\.(\d+))?$/.exec(range.trim());
  if (match === null) {
    return {
      name: "node",
      status: "FAIL",
      detail: `cannot interpret kernel engines.node range "${range}"`,
    };
  }
  const floor = [
    Number(match[1]),
    Number(match[2] ?? "0"),
    Number(match[3] ?? "0"),
  ];
  const parts = version.replace(/^v/, "").split(".").map(Number);
  if (parts.length !== 3 || parts.some((n) => !Number.isFinite(n))) {
    return {
      name: "node",
      status: "FAIL",
      detail: `cannot interpret running node version "${version}"`,
    };
  }
  let satisfied = true;
  for (let i = 0; i < 3; i += 1) {
    const have = parts[i] as number;
    const need = floor[i] as number;
    if (have > need) {
      break;
    }
    if (have < need) {
      satisfied = false;
      break;
    }
  }
  if (satisfied) {
    return {
      name: "node",
      status: "PASS",
      detail: `${version} satisfies kernel engines "${range}"`,
    };
  }
  return {
    name: "node",
    status: "FAIL",
    detail: `${version} does not satisfy kernel engines "${range}"`,
  };
}

function checkNode(): CheckResult {
  return nodeCheckFor(readKernelEnginesNode(), process.version);
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

/**
 * Lease presence and shape. The read is guarded (fix round 4, CR-520's
 * class): doctor is the command an operator runs when a fleet is
 * misbehaving, and a named pipe at state/orchestrator.lock blocked this
 * check in the kernel, so doctor produced no diagnosis at all. This check
 * now classifies such an entry instead of opening it.
 */
function checkLock(root: string): CheckResult {
  const lockPath = join(root, LOCK_FILE);
  const read = readRegularFileIfPresent(lockPath);
  if (read.kind === "absent") {
    return { name: "lock", status: "PASS", detail: "no lease present" };
  }
  if (read.kind === "refused") {
    return { name: "lock", status: "FAIL", detail: read.reason };
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(read.body);
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
  if (Number.isNaN(expiresMs)) {
    return {
      name: "lock",
      status: "FAIL",
      detail: `lease expiresAt "${lease.expiresAt}" is not a parseable timestamp`,
    };
  }
  const expired = expiresMs <= Date.now();
  return {
    name: "lock",
    status: "PASS",
    detail: `lease held by ${lease.holderId}, expires ${lease.expiresAt}${expired ? " (expired)" : ""}`,
  };
}

/**
 * Beacon freshness (R-095, completed by M1-P5). THE JUDGEMENT IS NOT MADE
 * HERE: judgeBeacon in src/liveness.ts decides what the beacon is
 * evidence of, and this check only decides how to present it. That is
 * why doctor and the liveness guard can never return two verdicts about
 * one file in one run, which they did while this check carried its own
 * copy of the comparison and missed the declared-cadence floor (delta
 * review CR-508).
 *
 * This check is about the beacon alone. The separate "watcher stale"
 * warning line this command also emits is the GUARD, whose predicate
 * additionally requires work in flight: a fleet with nothing in flight
 * and no watcher is untidy, not dangerous.
 */
function checkBeacon(root: string): CheckResult {
  const beaconPath = join(root, BEACON_FILE);
  const verdict = judgeBeacon(beaconPath);
  if (verdict.kind === "absent") {
    return {
      name: "beacon",
      status: "WARN",
      detail: "watcher not running or not scheduled",
      condition: "beacon-absent",
    };
  }
  if (verdict.kind === "unreadable") {
    return {
      name: "beacon",
      status: "FAIL",
      detail: `beacon file ${beaconPath} does not parse as a beacon record`,
    };
  }
  const thresholdSeconds = String(Math.round(verdict.thresholdMs / 1000));
  if (verdict.kind === "ahead") {
    return {
      name: "beacon",
      status: "WARN",
      detail:
        `beacon present but dated ${String(Math.round(verdict.aheadMs / 1000))}s in ` +
        `the future, so it is no evidence that supervision ran`,
      condition: "beacon-stale",
    };
  }
  const rounded = String(Math.max(0, Math.round(verdict.ageMs / 1000)));
  if (verdict.kind === "stale") {
    return {
      name: "beacon",
      status: "WARN",
      detail:
        `beacon present but ${rounded}s old, past the ${thresholdSeconds}s ` +
        `freshness threshold`,
      condition: "beacon-stale",
    };
  }
  return {
    name: "beacon",
    status: "PASS",
    detail: `beacon present, age ${rounded}s (freshness threshold ${thresholdSeconds}s)`,
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

/**
 * THE RETENTION CHECK (M3-P8 step 7, R-098).
 *
 * A charter declares `retention` paths for its work histories, its evidence
 * and its tuition. This check reads them and FAILs when a declared path is
 * absent, or is git-ignored in the repository it lives in, because evidence
 * that is ignored is evidence that does not survive the next clone. That is
 * the duty made checkable rather than stated.
 *
 * A CHARTER THAT DECLARES NOTHING IS NOT A PASS. It is a WARN carrying the
 * condition `retention-undeclared`, promoted to FAIL under the `full` profile.
 * A check that is vacuously satisfied by an absent declaration is the SC-011
 * shape this milestone exists to police, so the two states a reader might
 * confuse (nothing declared, everything declared and present) never print the
 * same word.
 *
 * TWO ROOTS, because a retention path is written from the PROJECT's point of
 * view. `delivery/work-history/` lives in the project repository, and the
 * charter that names it lives in the fleet home, so each path is resolved
 * against the fleet root and against `projects/<identity name>` when that
 * clone is present. A path found unignored under either is satisfied.
 */
function checkRetention(root: string): CheckResult {
  const charterDir = join(root, "charter");
  let names: string[];
  try {
    names = readdirSync(charterDir).sort();
  } catch {
    return {
      name: "retention",
      status: "WARN",
      detail: "no charter/ directory, so no retention paths are declared",
      condition: "retention-undeclared",
    };
  }
  const declarations: { charter: string; paths: string[]; projectRoot?: string }[] = [];
  for (const name of names) {
    if (!name.endsWith(".yaml") && !name.endsWith(".yml")) {
      continue;
    }
    const path = join(charterDir, name);
    const read = readRegularFileIfPresent(path);
    if (read.kind === "refused") {
      return { name: "retention", status: "FAIL", detail: read.reason };
    }
    if (read.kind === "absent") {
      continue;
    }
    let document: Record<string, unknown>;
    try {
      const decoded = decodeDocument(read.body, path);
      if (!decoded.ok) {
        return { name: "retention", status: "FAIL", detail: decoded.reason };
      }
      document = (decoded.value ?? {}) as Record<string, unknown>;
    } catch (error) {
      return {
        name: "retention",
        status: "FAIL",
        detail: `${path} could not be decoded: ${String(error)}`,
      };
    }
    if (document["kind"] !== "charter") {
      continue;
    }
    const retention = document["retention"];
    if (typeof retention !== "object" || retention === null) {
      return {
        name: "retention",
        status: "WARN",
        detail: `${path} declares no retention paths`,
        condition: "retention-undeclared",
      };
    }
    const paths = Object.values(retention as Record<string, unknown>).filter(
      (value): value is string => typeof value === "string" && value !== "",
    );
    const identity = document["identity"];
    const projectName =
      typeof identity === "object" && identity !== null
        ? (identity as Record<string, unknown>)["name"]
        : undefined;
    const projectRoot =
      typeof projectName === "string"
        ? join(root, "projects", projectName)
        : undefined;
    declarations.push(
      projectRoot !== undefined && existsSync(projectRoot)
        ? { charter: path, paths, projectRoot }
        : { charter: path, paths },
    );
  }
  if (declarations.length === 0) {
    return {
      name: "retention",
      status: "WARN",
      detail: `no charter in ${charterDir} declares retention paths`,
      condition: "retention-undeclared",
    };
  }
  let checked = 0;
  for (const declaration of declarations) {
    const roots = [root, ...(declaration.projectRoot === undefined ? [] : [declaration.projectRoot])];
    for (const relative of declaration.paths) {
      checked += 1;
      const present = roots.filter((base) => existsSync(join(base, relative)));
      if (present.length === 0) {
        return {
          name: "retention",
          status: "FAIL",
          detail: `${declaration.charter} declares retention path ${relative}, which does not exist`,
        };
      }
      const kept = present.filter((base) => !isGitIgnored(base, relative));
      if (kept.length === 0) {
        return {
          name: "retention",
          status: "FAIL",
          detail: `${declaration.charter} declares retention path ${relative}, which is git-ignored and will not survive a clone`,
        };
      }
    }
  }
  return {
    name: "retention",
    status: "PASS",
    detail: `${String(checked)} declared retention path(s) present and tracked`,
  };
}

/** True when git reports the path ignored in that repository. */
function isGitIgnored(repository: string, relative: string): boolean {
  const result = spawnSync(
    "git",
    ["-C", repository, "check-ignore", "-q", "--", relative],
    { encoding: "utf8" },
  );
  return result.error === undefined && result.status === 0;
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
    checkRetention(root),
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

  // Liveness guard (M1-P5 step 2). It warns and never blocks: doctor's
  // exit code is decided by its checks exactly as before. Outside a fleet
  // home there is no guard to run, and the layout check is what reports
  // that; an advisory must not be the thing that says so.
  //
  // THE ADVISORY RUNS LAST, AFTER THE DIAGNOSIS IS PRINTED (CR-523). It
  // used to run first, so anything wrong with the guard silenced the whole
  // command: with a named pipe at the beacon, the one tool an operator
  // runs on a misbehaving fleet produced zero CHECK lines. The guard is
  // now safe on that path, but the ordering is what made a single defect
  // in an advisory cost the entire diagnosis, and an advisory belongs
  // beside a diagnosis rather than in front of it.
  try {
    warnIfWatcherStale(loadFleet(process.cwd()));
  } catch {
    // Not a fleet home: reported by CHECK layout above.
  }

  return failed ? 1 : 0;
}
