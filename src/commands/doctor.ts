import { spawnSync } from "node:child_process";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { EX_USAGE } from "../cli.ts";
import { BEACON_FILE, LOCK_FILE, loadFleet, missingLayoutEntries } from "../fleet.ts";
import { judgeBeacon, warnIfWatcherStale } from "../liveness.ts";
import { classifyEntry, readRegularFileIfPresent } from "../task.ts";
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
  /* M3-P13: `kernel-artifacts-incomplete` is promoted here, so a fleet whose
     installed kernel has lost roles/, schemas/, checklists/ or AGENTS.md is not
     ready for full mode. It is NOT promoted below full, deliberately: the
     commands that resolve those artifacts are full mode's, and promoting
     everywhere is how a check fails a fleet that never needed it. */
  full: [
    "gh-missing",
    "remote-missing",
    "retention-undeclared",
    "kernel-artifacts-incomplete",
  ],
  watch: ["beacon-absent", "beacon-stale"],
};

/**
 * Locate the kernel's own package.json (same walk as src/version.ts).
 *
 * `classifyEntry`, not `existsSync`: this is the second of the three call
 * sites of the mechanism `reading-a-path-whose-type-is-not-established`, and
 * it is the one inside this phase's files-to-touch. The derivation over all
 * three, and the one left open, is published in this phase's work history.
 */
function readKernelEnginesNode(): string {
  let dir = dirname(fileURLToPath(import.meta.url));
  for (;;) {
    const candidate = join(dir, "package.json");
    if (classifyEntry(candidate).kind === "regular") {
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

/**
 * THE KERNEL ARTIFACTS THIS CHECK REQUIRES, pinned HERE and never read out of
 * the install being audited.
 *
 * The mechanism index's `checking-a-generated-artifact-against-its-own-generator`
 * row is about a check whose SUBJECT is selected by a value read from the
 * artifact it audits: that check can be silently narrowed by editing the
 * artifact. Reading this list out of the install's own `package.json` files
 * array would be exactly that shape, because an install that dropped `roles/`
 * from both the tree and the files list would report itself complete. So the
 * list is a constant in the source, and `package.json` is consulted only to
 * locate the package root, never to decide what must be in it.
 *
 * A DIRECTORY MUST BE NON-EMPTY, which is decision D-1 of the phase plan. The
 * check's subject is whether the install can resolve a role, a schema or a
 * checklist, and an empty `roles/` resolves none. An `existsSync` on a
 * directory the packer created empty is the vacuous pass hazard H1 names.
 */
/**
 * WHAT "RESOLVES" MEANS, PER ARTIFACT, TAKEN FROM THE CONSUMER (fix round 1,
 * clean-room finding CR-001 of the hazard contract).
 *
 * Round 0 tested that a required path was PRESENT and reported success as
 * `carries roles/, schemas/, checklists/ and AGENTS.md`, which is a claim
 * about RESOLVABILITY. Presence is a PROXY for it, and the proxy was reachable
 * in four measured shapes, every one of them PASS with FAIL count zero: a
 * directory holding one unrelated file, a directory holding only a
 * subdirectory, a directory whose members are all zero bytes, and a zero-byte
 * `AGENTS.md`.
 *
 * The suffix below is not invented here. It is the filter the CONSUMING
 * command already applies, so the check cannot claim more than the consumer
 * will deliver:
 *
 *   roles/       src/roles.ts:335              `.md`
 *   schemas/     src/commands/validate.ts:156  `.schema.json`
 *   checklists/  src/checklists.ts:91          `.yaml`
 *
 * WHAT THE PREDICATE DOES NOT COVER, stated rather than left to be found. It
 * asks whether at least ONE member would be selected and carries bytes. It
 * does not PARSE a member, so a `.yaml` that does not decode, a `.schema.json`
 * that is not a schema and a `.md` with no frontmatter all resolve. It does
 * not ask WHICH members are present, so an install carrying one role resolves
 * `roles/` even if the role a brief names is the missing one. Both are
 * deliberate: doctor answers "is this install fit to run", and a per-document
 * decode is the consuming command's own failure, reported by it, with the path
 * it could not use.
 */
const REQUIRED_KERNEL_DIRECTORIES = [
  { name: "roles", suffix: ".md" },
  { name: "schemas", suffix: ".schema.json" },
  { name: "checklists", suffix: ".yaml" },
] as const;
const REQUIRED_KERNEL_FILES = ["AGENTS.md"] as const;

/**
 * A path that is a regular file AND carries bytes.
 *
 * `classifyEntry` first, `statSync` second: the type is established before the
 * size is asked for, so a FIFO here is `false` in bounded time rather than a
 * blocked open (mechanism index,
 * `reading-a-path-whose-type-is-not-established`). The `statSync` cannot be
 * folded into `classifyEntry`, which returns a kind and no size; it is a
 * second stat of a path already established as a regular file, never an open.
 */
function carriesContent(path: string): boolean {
  if (classifyEntry(path).kind !== "regular") {
    return false;
  }
  try {
    return statSync(path).size > 0;
  } catch {
    return false;
  }
}

/**
 * The installed kernel's own package root: the first ancestor of THIS MODULE
 * carrying a `package.json`.
 *
 * **This is deliberately NOT `kernelRoot()` from src/roles.ts, and the reason
 * is the whole point of the check.** That function walks upward looking for a
 * `roles/` directory containing a `.md` file, which is the very artifact this
 * check exists to find missing: against an install with `roles/` removed it
 * walks PAST the install and answers about an ancestor, and where no ancestor
 * carries one it throws. A check built on it reports on the wrong tree or
 * crashes on precisely the state its own criteria describe.
 *
 * Walking for `package.json` does not have that property. `package.json` is
 * the package BOUNDARY rather than a member of the set under test, and it is
 * present in both shipped layouts. Measured on this head: the published
 * package puts this module at `dist/src/commands/doctor.js` with the artifacts
 * three levels up at the package root, and the development checkout puts it at
 * `src/commands/doctor.ts` with the artifacts two levels up, while
 * `dist/package.json` does not exist in the pack listing. So a FIXED DEPTH
 * from `import.meta.url` is wrong in one of the two layouts and the first
 * `package.json` above the module is right in both.
 *
 * Returns the reason rather than throwing, because a guard whose correctness
 * depends on a crash is not a guard (mechanism index,
 * `a-guard-s-own-failure-path`).
 */
export function resolveInstalledKernelRoot(
  from: string = dirname(fileURLToPath(import.meta.url)),
): { ok: true; root: string } | { ok: false; reason: string } {
  let dir = from;
  for (;;) {
    const candidate = join(dir, "package.json");
    if (classifyEntry(candidate).kind === "regular") {
      return { ok: true, root: dir };
    }
    const parent = dirname(dir);
    if (parent === dir) {
      return {
        ok: false,
        reason: `no package.json above ${from}, so the installed kernel root cannot be resolved`,
      };
    }
    dir = parent;
  }
}

/**
 * `kernel-artifacts`: the resolved kernel install carries every artifact M3
 * made load-bearing (kernel plan M3 section 4, stage E0.4's designated subject;
 * phase M3-P13).
 *
 * WHAT THIS CHECK IS FOR. The brief composer resolves `roles/`, the validator
 * loads `schemas/`, the checklist command resolves `checklists/`, and
 * `AGENTS.md` is the policy document every role brief points at. Until now an
 * install that lost one of them reported nothing wrong: the loss surfaced later
 * as one command's resolution failure, whose message names the path it could
 * not open rather than the state of the install. doctor is the command whose
 * whole job is answering "is this environment fit to run", and the kernel's own
 * artifacts were the one input none of its checks looked at.
 *
 * EVERY missing artifact is named, not the first (decision D-2): a check that
 * names one sends its reader round the loop once per missing item, and the loop
 * here is a reinstall.
 *
 * The condition is `kernel-artifacts-incomplete`, promoted to FAIL under the
 * `full` profile and left a WARN below it. Below `full` no command that needs
 * these artifacts is necessarily in the pipeline, and promoting everywhere is
 * how a check like this ends up failing a fleet that never needed it.
 */
export function checkKernelArtifacts(
  resolution: ReturnType<typeof resolveInstalledKernelRoot> = resolveInstalledKernelRoot(),
): CheckResult {
  if (!resolution.ok) {
    return {
      name: "kernel-artifacts",
      status: "FAIL",
      detail: resolution.reason,
    };
  }
  const root = resolution.root;
  const missing: string[] = [];
  for (const { name, suffix } of REQUIRED_KERNEL_DIRECTORIES) {
    const path = join(root, name);
    let entries: string[];
    try {
      entries = readdirSync(path);
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code;
      missing.push(
        code === "ENOENT"
          ? `${name}/ (absent)`
          : `${name}/ (${code ?? "unreadable"})`,
      );
      continue;
    }
    if (entries.length === 0) {
      missing.push(`${name}/ (present but empty, so it resolves nothing)`);
      continue;
    }
    if (
      !entries.some((entry) => entry.endsWith(suffix) && carriesContent(join(path, entry)))
    ) {
      missing.push(`${name}/ (present, but no ${suffix} member resolves)`);
    }
  }
  for (const name of REQUIRED_KERNEL_FILES) {
    /* classifyEntry, not existsSync: it lstats the link, stats what it
       resolves to, and opens only a regular file, so a FIFO at this path is a
       reported refusal in bounded time rather than a doctor that hangs
       (mechanism index, `reading-a-path-whose-type-is-not-established`). */
    const path = join(root, name);
    const entry = classifyEntry(path);
    if (entry.kind !== "regular") {
      missing.push(
        entry.kind === "absent"
          ? `${name} (absent)`
          : `${name} (${entry.kind}${entry.kind === "dangling" ? "" : `: ${entry.reason}`})`,
      );
      continue;
    }
    /* The FILE member of the class the emptiness reasoning was written for.
       The plan's words for the directory member, "an install that carries an
       empty roles/ resolves no role", are true word for word of a zero-byte
       AGENTS.md: it is the policy document every role brief points at, and an
       empty one states no policy. */
    if (!carriesContent(path)) {
      missing.push(`${name} (present but empty, so it states nothing)`);
    }
  }
  if (missing.length > 0) {
    return {
      name: "kernel-artifacts",
      status: "WARN",
      detail: `the kernel install at ${root} is missing ${missing.join(", ")}`,
      condition: "kernel-artifacts-incomplete",
    };
  }
  return {
    name: "kernel-artifacts",
    status: "PASS",
    detail: `the kernel install at ${root} carries roles/, schemas/, checklists/ and AGENTS.md`,
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
    checkRetention(root),
    checkKernelArtifacts(),
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
