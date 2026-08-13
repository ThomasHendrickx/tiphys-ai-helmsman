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
     sits in before its charter is written.
     NOT promoted, and deliberately: `retention-not-applicable`, the state of a
     fleet that has no charter document at all. See checkRetention's header for
     why the two are separate conditions rather than one. */
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
 * "DECLARES NOTHING" IS DECIDED BY THE COUNT OF PATHS, NOT BY THE TYPE OF THE
 * FIELD (CR-1 and HRB-6, fix round 3). Until then the sentence above was a
 * promise the code did not keep: the guard tested `typeof retention !==
 * "object"`, and `{}` and `[]` are objects, so both printed `PASS 0 declared
 * retention path(s) present and tracked` under BOTH profiles. Round 2 recorded
 * `{}` as an open item; measured on a real `tiphys init` fleet it is a family of
 * five, `{}`, `[]`, nested-map values, empty-string values and non-string
 * values, and an ABSENT key correctly FAILs, so two characters defeated the
 * promotion. Two arms now close it and they close different halves: a value that
 * is not a non-empty string is its own FAIL naming the key, and a charter that
 * yields zero paths by any route takes `retention-undeclared`.
 *
 * THIS CHECK DOES NOT VALIDATE THE CHARTER AGAINST ITS SCHEMA, and that is why
 * the above is reachable by a real user rather than only by a fixture.
 * `schemas/charter.schema.json` does forbid every shape above, but nothing makes
 * anyone run `tiphys validate --type charter` before `tiphys doctor --for full`,
 * and charters are owner-authored by design, so a hand-written charter that does
 * not match its schema is the ordinary case. Wiring schema validation in here is
 * a larger change than this round is scoped for; the two arms make doctor's own
 * verdict correct without it.
 *
 * TWO ROOTS, because a retention path is written from the PROJECT's point of
 * view. `delivery/work-history/` lives in the project repository, and the
 * charter that names it lives in the fleet home, so each path is resolved
 * against the fleet root and against `projects/<identity name>` when that
 * clone is present. A path found unignored under either is satisfied.
 *
 * NO CHARTER AT ALL IS A THIRD STATE, AND IT IS NOT THE ONE ABOVE (fix round
 * 2). `tiphys init` writes `charter/.gitkeep` and no charter document, because
 * the charter is owner-authored (delivery/intake/orchestrated-delivery-v1.md:224
 * lists charter authorship among the owner's standing duties) and its required
 * fields are project facts init does not hold. Folding that state into
 * `retention-undeclared` made `tiphys doctor --for full` exit nonzero on every
 * freshly initialized fleet, which is the first thing a new user does. So it
 * gets its own condition, `retention-not-applicable`, which the `full` profile
 * does NOT promote. It is still a WARN and still names its reason, so it never
 * prints the same word as "declared, present and tracked": the plan's hazard
 * row for this check permits exactly "FAIL or not-applicable-with-a-reason,
 * never a silent pass". The SC-011 arm the row is aimed at, a charter that
 * EXISTS and declares no retention paths, keeps `retention-undeclared` and
 * keeps its promotion.
 */
function checkRetention(root: string): CheckResult {
  const charterDir = join(root, "charter");
  let names: string[];
  try {
    names = readdirSync(charterDir).sort();
  } catch {
    /* The `layout` check owns a missing charter/ and FAILs on it (FLEET_DIRS in
       src/fleet.ts), so this arm never has to carry that verdict itself. */
    return {
      name: "retention",
      status: "WARN",
      detail: `no charter/ directory under ${root}, so retention is not applicable; the layout check owns that condition`,
      condition: "retention-not-applicable",
    };
  }
  const declarations: { charter: string; paths: string[]; projectRoot?: string }[] = [];
  let candidates = 0;
  for (const name of names) {
    if (!name.endsWith(".yaml") && !name.endsWith(".yml")) {
      continue;
    }
    candidates += 1;
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
    /* A NON-STRING VALUE IS ITS OWN FAIL, NEVER A SILENT DROP (CR-1, HRB-6, fix
       round 3). The earlier form filtered them away, so a charter declaring
       three retention paths with the wrong types reported the same green as one
       declaring none. Naming the key is what makes the verdict actionable. */
    const paths: string[] = [];
    for (const [key, value] of Object.entries(retention as Record<string, unknown>)) {
      if (typeof value === "string" && value !== "") {
        paths.push(value);
        continue;
      }
      return {
        name: "retention",
        status: "FAIL",
        detail:
          `${path} declares retention key ${key} as ` +
          `${value === "" ? "an empty string" : describeRetentionValue(value)}, ` +
          `which names no path`,
      };
    }
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
    /* NOT APPLICABLE versus UNDECLARED, and the difference is whether anyone
       has written a charter yet. An empty charter/ is a fleet before
       realization; YAML that is present but carries no `kind: charter` is a
       fleet someone has configured wrongly, which stays the promoted
       condition. */
    if (candidates === 0) {
      return {
        name: "retention",
        status: "WARN",
        detail: `no charter document in ${charterDir}, so no project is realized here yet and retention is not applicable`,
        condition: "retention-not-applicable",
      };
    }
    return {
      name: "retention",
      status: "WARN",
      detail: `${String(candidates)} YAML document(s) in ${charterDir}, none with kind: charter, so no retention paths are declared`,
      condition: "retention-undeclared",
    };
  }
  /* THE VERDICT COMES FROM THE COUNT, NOT FROM THE TYPE (CR-1, HRB-6, fix
     round 3). The type test above decides PRESENCE OF AN OBJECT, and `{}` and
     `[]` are both objects, so two characters in a charter defeated the promoted
     `retention-undeclared` condition and printed `PASS 0 declared retention
     path(s) present and tracked`: the same word as a charter with three paths
     present and tracked, which is the exact thing this check's header forbids
     and the plan's hazard row at delivery/plan/kernel-plan-m3.md:4042 polices.
     Whatever shape `retention` had, a charter that yields NO path has declared
     nothing, and that is one condition rather than a family of them. */
  const empty = declarations.filter((declaration) => declaration.paths.length === 0);
  if (empty.length > 0) {
    return {
      name: "retention",
      status: "WARN",
      detail: `${(empty[0] as { charter: string }).charter} declares no retention paths`,
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

/** Name a non-string retention value in a diagnostic, without printing it. */
function describeRetentionValue(value: unknown): string {
  if (value === null) {
    return "null";
  }
  if (Array.isArray(value)) {
    return "a list";
  }
  if (typeof value === "object") {
    return "a map";
  }
  return `a ${typeof value}`;
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
