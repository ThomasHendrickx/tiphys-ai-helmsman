import { createHash, randomBytes } from "node:crypto";
import { spawnSync } from "node:child_process";
import {
  accessSync,
  constants as fsConstants,
  lstatSync,
  mkdirSync,
  renameSync,
  rmSync,
  statSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { isAbsolute, join, resolve } from "node:path";
import {
  classifyEntry,
  readRegularFileIfPresent,
  refuseOpenForWrite,
  runStep,
  singleLine,
} from "../task.ts";
/* M3-P2 step 4. The registry is validated by the M3-P1 Ajv engine, not by
   M2's closed-keyword validator, because `schemas/gate-registry.schema.json`
   uses `if`/`then`. `loadTypeSchema` is imported from the validate COMMAND
   rather than re-deriving the shipped `schemas/` location here, because that
   walk is already written, already tested, and already correct in both the
   source and the dist layouts; a second copy would be a second thing to keep
   right. */
import { loadTypeSchema } from "../commands/validate.ts";
import { decodeDocument, formatDiagnostics, validateInstance } from "../validate.ts";
import type { SchemaDocument } from "../validate.ts";
import { loadManifest, validateManifestDocument, validateResultDocument } from "./manifest.ts";
import { comparePins, describePinDifference } from "./pin.ts";
import {
  EXIT_GATE_ERROR,
  EXIT_GREEN,
  EXIT_NOT_APPLICABLE,
  EXIT_RED,
  M2_C_2_DETAIL,
  exitCodeForStatus,
  makeGateResult,
  renderGateResult,
  statusForExitCode,
} from "./result.ts";
import type { GateEntry, GateManifest, PreconditionSpec, RunParameter } from "./manifest.ts";
import type { GateResult, GateStatus, PreconditionRecord } from "./result.ts";

/**
 * THE GATE RUNNER (kernel plan M2, M2-P1 step 7 and step 8).
 *
 * Runs the manifest's gates sequentially in the foreground as subprocesses,
 * captures each one's stdout and stderr into the evidence directory,
 * ingests each one's result record, and writes `summary.json`.
 *
 * C-3, STRUCTURALLY: `spawnSync` only, no `detached`, no `unref`, no flag
 * anywhere that lets a gate outlive this process. C-2, STRUCTURALLY: nothing
 * here reads a pid, probes a process, sends a signal or touches /proc; a
 * gate's outcome is its RECORD plus its exit code, never its liveness.
 *
 * THE GATE SUBPROCESS CONTRACT, stated once because eight phases build
 * against it:
 *
 *   invocation  <command...> --result <abs path> --evidence <abs dir>
 *               plus one --<name> <value> for each parameter the gate
 *               DECLARES in the manifest (base, head, phase)
 *   cwd         the runner's working directory
 *   output      exactly one GateResult JSON document at --result
 *   exit codes  0 green, 1 red, 20 not-applicable, 21 error, 64 usage
 *
 * WHY PARAMETERS ARE DECLARED AND NOT INFERRED. Step 7 requires a gate
 * "whose command requires --phase" to report `error` when `--phase` is
 * absent. The runner can only know that from a declaration or by
 * pattern-matching the gate's command line, and MECHANISMS.md's row
 * "Deciding what another program will do by pattern-matching the text of a
 * file it consumes" records four fix rounds paid for the second option. So
 * the manifest declares it, the schema validates it, and the runner reads
 * it. This adds one field to the plan's manifest field list and is declared
 * as a deviation in the work history.
 *
 * INGEST IS ADVERSARIAL TOWARDS ITS OWN GATES. A gate is another program:
 * it can exit 0 having written nothing, exit nonzero because Node threw,
 * write a record for a different gate, write a record whose status
 * contradicts its exit code, or write a green record having examined
 * nothing. Every one of those is `error`, because `error` is what "I cannot
 * tell you whether the property holds" is called (M2-C-3), and because
 * every one of them otherwise reads as a pass.
 *
 * WHAT "APPLICABLE" MEANS, fixed in round 1 (CR-800). It used to mean "the
 * runner spawned this gate", which is not the same thing and differed from it
 * on the one path that matters: a gate that decides its OWN applicability and
 * exits 20 with a `not-applicable` record was spawned, so it counted as
 * applicable, so the aggregate anti-vacuity rule never fired, so a bundle in
 * which zero gates were green exited 0 with the reason "every applicable gate
 * is green". The two routes to `not-applicable`, runner-evaluated and
 * gate-declared, were guarded differently, and the gate subprocess contract
 * documented above is what tells every gate author the second route exists.
 *
 * So there are now two counts and they answer two different questions:
 *
 *   applicable  the gate was reached AND did not report `not-applicable`,
 *               whichever side decided that. It is the denominator of "how
 *               much of this manifest was in play".
 *   verdict     the gate reached a GREEN OR RED verdict. It is the only
 *               count the anti-vacuity rule consults, because it is the only
 *               one that means work was actually done.
 *
 * The exit-0 success path is then structurally unable to describe an empty
 * green bucket: it is guarded by `verdict > 0` and asserted again before the
 * summary is written, so an internal inconsistency reports `error` rather
 * than a green nobody measured (SC-011, M2-C-2, M2R-012).
 *
 * ONE RUN OWNS ITS EVIDENCE DIRECTORY (CR-803). Two runners pointed at one
 * `--evidence` directory used to interleave on fixed per-gate paths: the
 * later runner ingested the earlier one's records as its own, and a genuine
 * red was converted to `error` while the surviving bundle was the other run's
 * green. That is the declared hazard "a runner that writes a record for a
 * gate it did not execute", and seven phases run this concurrently.
 *
 * The evidence directory is therefore CLAIMED with an O_EXCL create, the
 * pattern src/lock.ts already carries and which MECHANISMS.md requires a
 * third user to read first. Per that row's rule, a claim that cannot be taken
 * fails LOUDLY and NAMES THE STUCK FILE; there is no steal, no age heuristic
 * and no bounded wait, because an evidence directory is not a contended
 * resource by design and a silent wait would be indistinguishable from an
 * absence of contention. Every run also stamps a `runId` into its summary, so
 * a bundle is attributable, and the summary is replaced atomically through a
 * stage name carrying that runId, which no other run can collide with
 * (MECHANISMS.md, "Atomic file replacement").
 *
 * THE RUNNER OBEYS ITS OWN CRASH DISCIPLINE (CR-801). It used to enforce on
 * its gates the rule that Node's uncaught-exception exit code 1 collides with
 * this phase's own RED code, while itself exiting 1 on an escaping throw,
 * with no summary and, mid-bundle, a gate-authored green record left on disk.
 * `runGates` now folds any escaping throw into `EXIT_GATE_ERROR` AND writes a
 * summary marked aborted, so a consumer can always tell "a gate reported red"
 * from "the runner died before it could report".
 *
 * M2-C-6 IS WIRED AT FOUR PLACES, all of them paths from outside: the
 * manifest path (in `loadManifest`), the evidence directory, every
 * `file-exists` and `file-absent` precondition target, and every gate's
 * record file, which is probed BEFORE the gate is spawned as well as after
 * it returns. Probing before the spawn is the load-bearing half: a gate
 * handed a named pipe to write its record into would block in the kernel
 * forever and the runner would wait on it forever, so the run has to be
 * refused before the child exists.
 */

export interface RunOptions {
  manifestPath: string;
  evidenceDir: string;
  base?: string;
  head?: string;
  phase?: string;
  only?: string[];
  /**
   * M3-P2 step 4. When true, `manifestPath` names a canonical GATE REGISTRY
   * (`gate-registry.yaml`, `schemas/gate-registry.schema.json`) rather than an
   * M2-P1 gate manifest. The registry is a SUPERSET of the manifest, so it is
   * projected down to one and every line below this point is the M2 runner
   * unchanged: the same `runOneGate`, the same `ingestGateRun`, the same
   * `makeGateResult`. That is deliberate and it is what makes M2-C-2 and
   * M2-C-3 survive the promotion instead of being re-implemented beside it.
   */
  registry?: boolean;
  /**
   * Registry mode only: the assurance mode selecting entries, matched against
   * each entry's `modes[]`. Defaults to `full`.
   */
  mode?: string;
  /** Working directory for gate subprocesses and git. Defaults to cwd. */
  cwd?: string;
}

/**
 * A registry entry that declares a gate the runner CANNOT execute, because
 * D-11 settles that it is verified by a clean-room checklist probe rather
 * than by a script (R-043, R-044). It is reported rather than dropped, so
 * that "the report accounts for every gate in the registry" is a property a
 * reader can check from the run's own output instead of taking on trust.
 */
export interface DeclaredChecklistGate {
  id: string;
  probe: string;
  applicability: "required" | "conditional";
}

export interface GateSummaryRow {
  id: string;
  status: GateStatus;
  units: number;
  unitLabel: string;
  vacuous: boolean;
  applicable: boolean;
  detail: string;
  record?: string;
  stdout?: string;
  stderr?: string;
}

export interface RunSummary {
  /** Identity of THIS run. A bundle nobody can attribute is not evidence. */
  runId: string;
  manifest: string;
  /** M3-P2: true when `manifest` above named a gate registry, not a manifest. */
  registry?: boolean;
  /** M3-P2: the assurance mode that selected these gates. Registry runs only. */
  mode?: string;
  /**
   * M3-P2: registry entries selected by `mode` that the runner did not
   * execute because they are `verified-by: clean-room-checklist`. Empty for a
   * manifest run. `declared` in `counts` plus this array's length is the
   * number of registry entries the mode selected, which is how a reader
   * checks that the report accounts for every gate.
   */
  declaredByChecklist?: DeclaredChecklistGate[];
  manifestSha256: string;
  startedAt: string;
  endedAt: string;
  parameters: { base?: string; head?: string; phase?: string };
  only: string[];
  manifestGates: number;
  gates: GateSummaryRow[];
  counts: {
    declared: number;
    applicable: number;
    /** green + red: gates that reached a verdict. The anti-vacuity count. */
    verdict: number;
    green: number;
    red: number;
    "not-applicable": number;
    error: number;
    vacuous: number;
  };
  /** Named here as well as in the rows, because the reason line is one line. */
  requiredNotApplicable: string[];
  /** True when a throw escaped the run and this summary is a partial record. */
  aborted: boolean;
  exitCode: number;
  reason: string;
}

export interface RunOutcome {
  /**
   * THIS run's identity, on every outcome including a refusal (CR-861). The
   * runId used to live only inside `summary.json`, so a caller had no way to
   * tell whether the summary it was reading was its own: after a refusal the
   * previous run's green summary sat there, `aborted: false`, exit 0, with
   * nothing to mark it stale. Attribution needs the caller to know the id it
   * should expect, and this is where it gets it.
   */
  runId: string;
  exitCode: number;
  summary?: RunSummary;
  /** Set when the run could not start at all (no summary to write). */
  reason?: string;
  // CR-903. A `refused?: boolean` used to sit here with one producer and zero
  // readers: `src/commands/gates.ts` is the only caller of `runGates` and it
  // consumes `runId`, `exitCode`, `summary` and `reason`. It is removed rather
  // than wired, because the discriminator a consumer actually needs already
  // exists and is stronger: CR-861 put THIS run's id on every outcome, so a
  // caller compares the id it was given with the one inside `summary.json` and
  // learns whether the bundle is its own. A boolean saying "somebody else owns
  // that directory" adds nothing that comparison does not already give, and an
  // unread field on an exported interface is a promise seven concurrent phases
  // would build against with nothing testing it. If M2-P9 wants a typed
  // discriminator it should add one together with the code that reads it.
}

export const NO_APPLICABLE_GATE = "no applicable gate";

/** The default assurance mode when `--registry` is given without `--mode`. */
export const DEFAULT_MODE = "full";

interface RegistryGateEntry {
  id: string;
  command?: string[];
  unitLabel: string;
  applicability: "required" | "conditional";
  "verified-by": "script" | "clean-room-checklist";
  probe?: string;
  modes: string[];
  events: string[];
  parameters?: RunParameter[];
  precondition?: PreconditionSpec;
}

/**
 * Does this assurance mode select this entry?
 *
 * A named predicate rather than an inline callback, so the SELECTION RULE and
 * the act of filtering are two separately breakable things. The clean-room
 * review of this phase deleted the filter outright (`inMode = document.gates`)
 * and the whole suite stayed green, because every mode fixture declared
 * exactly the mode it was run under and no test had an entry that had to be
 * EXCLUDED. `gate-registry-mode-excludes-other-modes` is the witness for the
 * exclusion, and separating the predicate from the call site is what lets the
 * two failure shapes, "no filter at all" and "a filter whose condition does
 * not test membership", be reddened independently.
 */
function selectsMode(entry: RegistryGateEntry, mode: string): boolean {
  return entry.modes.includes(mode);
}

export type RegistryLoad =
  | {
      ok: true;
      manifest: GateManifest;
      sha256: string;
      body: string;
      declaredByChecklist: DeclaredChecklistGate[];
    }
  | { ok: false; reason: string; diagnostics: string[] };

/**
 * LOAD A CANONICAL GATE REGISTRY AND PROJECT IT ONTO AN M2 GATE MANIFEST
 * (kernel plan M3, M3-P2 steps 2 and 4; R-094).
 *
 * The registry is a SUPERSET of the M2-P1 manifest, so the promotion is a
 * projection and not a rewrite, and this function is the whole of it. Four
 * things happen here and each one is load-bearing:
 *
 *   1. The path is operator-supplied, so it is READ through the delivered
 *      `readRegularFileIfPresent` (M2-C-6). A named pipe reports the observed
 *      type and never blocks.
 *   2. The document is DECODED (YAML or JSON, `decodeDocument`) and then
 *      VALIDATED against `schemas/gate-registry.schema.json` through the
 *      M3-P1 Ajv engine. Decoding and validation are separate stages and
 *      produce distinguishable diagnostics (DR-0013 YAML clause 3). The
 *      registry schema is NOT validated by `src/gates/validate.ts`: it uses
 *      `if`/`then`, which is outside M2-D-04's closed keyword set, which is
 *      exactly why it lives in the shipped `schemas/` directory.
 *   3. Entries are selected by MODE and by `verified-by`. A
 *      `clean-room-checklist` entry has no process to run (D-11: R-043 and
 *      R-044 are not computable from a diff), so it is reported as declared
 *      rather than silently dropped.
 *   4. The projected manifest is validated AGAIN, against the M2 manifest
 *      schema, by `validateManifestDocument`. That second validation is the
 *      superset claim turned into a check: if a projection is not a valid M2
 *      manifest then the registry is not a superset of the manifest, and the
 *      run refuses rather than proceeding on a document the M2 contract does
 *      not recognise.
 *
 * Everything after this function is the M2 runner untouched, so M2-C-2 (never
 * green by omission) and M2-C-3 (fail closed) apply to registry runs by
 * CONSTRUCTION rather than by being remembered. A `--registry` path that
 * built `GateResult` literals of its own would be the realistic way those two
 * constraints get dropped by a promotion, and there is no such path.
 */
export function loadRegistry(path: string, mode: string): RegistryLoad {
  const read = readRegularFileIfPresent(path);
  if (read.kind === "absent") {
    return { ok: false, reason: `registry ${path} does not exist`, diagnostics: [] };
  }
  if (read.kind === "refused") {
    return { ok: false, reason: read.reason, diagnostics: [] };
  }
  const decoded = decodeDocument(read.body, path);
  if (!decoded.ok) {
    return { ok: false, reason: decoded.reason, diagnostics: [] };
  }
  let schema: SchemaDocument;
  try {
    schema = loadTypeSchema("gate-registry");
  } catch (error) {
    return {
      ok: false,
      reason: `the gate-registry schema could not be loaded: ${singleLine((error as Error).message)}`,
      diagnostics: [],
    };
  }
  const diagnostics = formatDiagnostics(validateInstance(schema, decoded.value));
  if (diagnostics.length > 0) {
    return {
      ok: false,
      reason: `registry ${path} is not a valid gate registry`,
      diagnostics,
    };
  }

  const document = decoded.value as {
    gates: RegistryGateEntry[];
    destructiveCommands: string[];
    version: number;
  };
  const declaredModes = new Set<string>();
  for (const entry of document.gates) {
    for (const name of entry.modes) {
      declaredModes.add(name);
    }
  }
  if (!declaredModes.has(mode)) {
    // FAIL CLOSED (M2-C-3). A mode no entry declares selects nothing, and a
    // run of nothing that exited 0 would be the vacuous pass this registry
    // exists to prevent. The known modes are named so the operator can see
    // the typo rather than guess at an empty bundle.
    return {
      ok: false,
      reason:
        `registry ${path} declares no gate for mode ${mode}; declared mode(s): ` +
        `${[...declaredModes].sort().join(", ")}`,
      diagnostics: [],
    };
  }

  const inMode = document.gates.filter((entry) => selectsMode(entry, mode));
  const declaredByChecklist: DeclaredChecklistGate[] = inMode
    .filter((entry) => entry["verified-by"] === "clean-room-checklist")
    .map((entry) => ({
      id: entry.id,
      probe: entry.probe as string,
      applicability: entry.applicability,
    }));

  const gates: GateEntry[] = inMode
    .filter((entry) => entry["verified-by"] === "script")
    .map((entry) => {
      const projected: GateEntry = {
        id: entry.id,
        command: entry.command as string[],
        unitLabel: entry.unitLabel,
        applicability: entry.applicability,
        modes: entry.modes,
      };
      if (entry.parameters !== undefined) {
        projected.parameters = entry.parameters;
      }
      if (entry.precondition !== undefined) {
        projected.precondition = entry.precondition;
      }
      return projected;
    });

  const manifest: GateManifest = {
    version: document.version,
    gates,
    destructiveCommands: document.destructiveCommands,
  };
  const projectionDiagnostics = validateManifestDocument(manifest);
  if (projectionDiagnostics.length > 0) {
    return {
      ok: false,
      reason:
        `registry ${path} projected onto an M2 gate manifest that the M2 schema refuses, ` +
        "so this registry is not a superset of the manifest it promotes",
      diagnostics: projectionDiagnostics,
    };
  }
  return {
    ok: true,
    manifest,
    sha256: createHash("sha256").update(read.body).digest("hex"),
    body: read.body,
    declaredByChecklist,
  };
}

function now(): string {
  return new Date().toISOString();
}

/**
 * Escape a value being substituted into regex SOURCE. The set is the one
 * MDN documents for this purpose; `-` is included because it is special
 * inside a character class and a substituted value can land in one.
 */
function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\\-]/g, "\\$&");
}

function isRealDirectory(path: string): boolean {
  try {
    return lstatSync(path).isDirectory();
  } catch {
    return false;
  }
}

/**
 * Create a directory, refusing a path that exists and is not a real
 * directory. Never opens anything, so a named pipe here reports rather than
 * blocking.
 */
function ensureDirectory(path: string): string | undefined {
  const entry = classifyEntry(path);
  if (entry.kind === "regular") {
    return `${path} is a regular file, not a directory`;
  }
  if (entry.kind === "unexaminable") {
    return entry.reason;
  }
  if (entry.kind === "irregular" && !isRealDirectory(path)) {
    return entry.reason;
  }
  const made = runStep(`creating ${path}`, () =>
    mkdirSync(path, { recursive: true }),
  );
  return made.ok ? undefined : made.reason;
}

/**
 * MUTATE ONLY WHILE THIS RUN HOLDS THE CLAIM (CR-860, then CR-900).
 *
 * The finding's mechanism is *a mutation of evidence-directory state
 * performed from a frame that does not know whether the claim is held*.
 *
 * CR-900 is the correction of ONE WORD in that sentence. Round two read the
 * mechanism as being about WRITES, built `writeInsideClaim` around
 * `writeFileSync`, derived its coverage by grepping for the name of its own
 * new wrapper, and concluded that every write into the directory verified the
 * claim. That sentence was true and it was not the property that mattered,
 * because a directory's state is mutated by six operations and not by one:
 *
 *   CREATE, CONTENT-WRITE, DELETE, RENAME, MKDIR, and SUBPROCESS DISPATCH
 *   that will write there.
 *
 * A two-gate construction defeated the total claim in one run: the runner
 * `rmSync`ed a foreign holder's `result.json` and then spawned a gate into a
 * directory whose claim it had lost, neither of which is a `writeFileSync`.
 *
 * So the predicate is separated from the operation. THIS function answers
 * "may this run mutate that directory right now", and every one of the six
 * operations asks it, rather than one of them owning the rule. The wrappers
 * below (`writeInsideClaim`, `mkdirInsideClaim`) and the four inline checks in
 * `runOneGate`, `runClaimedBundle` and `writeSummaryAtomically` are its
 * callers; the work history's CR-900 section carries the full inventory that
 * fixes what "every" ranges over, derived from the closure's `node:fs` and
 * `node:child_process` imports rather than from the names of these wrappers.
 *
 * Guarding the mutation rather than the call site also makes the ordering
 * OBSERVABLE, which it was not: a release moved back in front of a mutation is
 * now a refusal with a reason, rather than an identical end state reachable
 * two ways. That is what let the ordering be red-witnessed at all (G2b).
 *
 * NOT COVERED, and stated rather than implied: a gate subprocess's own write
 * to the record path it was handed. This runner cannot guard another
 * process's write. What it CAN do, and now does, is decline to dispatch that
 * process at all when it does not hold the claim, and decline to certify a
 * run in which that happened.
 */
function refuseUnlessHolder(
  evidenceDir: string,
  runId: string,
  what: string,
): string | undefined {
  const holder = claimHolder(evidenceDir);
  if (holder !== runId) {
    return (
      `refusing to ${what}: this run (${runId}) does not hold the claim ` +
      `on ${evidenceDir} (held by ${holder ?? "nobody"})`
    );
  }
  return undefined;
}

/** Content write, row 2 of the CR-900 inventory. */
function writeInsideClaim(
  evidenceDir: string,
  runId: string,
  path: string,
  body: string,
): string | undefined {
  return (
    refuseUnlessHolder(evidenceDir, runId, `write ${path}`) ??
    guardedWrite(path, body)
  );
}

/**
 * Mkdir, rows 1a and 1b of the CR-900 inventory. Creating a directory inside
 * an evidence tree this run no longer owns is a smaller harm than deleting a
 * record, and it is the same mechanism: it leaves a directory the real holder
 * never made, in a bundle attributed to the real holder.
 *
 * Row 1c, the creation of the evidence directory ITSELF at the top of
 * `runGatesInner`, deliberately does NOT go through here and must not: the
 * directory has to exist before a claim file can be created inside it, so a
 * holdership test there would be unsatisfiable by construction. That single
 * mkdir is the only mutation in this module that legitimately precedes the
 * claim, and it creates a directory rather than touching any content.
 */
function mkdirInsideClaim(
  evidenceDir: string,
  runId: string,
  path: string,
): string | undefined {
  return (
    refuseUnlessHolder(evidenceDir, runId, `create ${path}`) ??
    ensureDirectory(path)
  );
}

/** Write a file, refusing any path that is not safe to open for writing. */
function guardedWrite(path: string, body: string): string | undefined {
  const refusal = refuseOpenForWrite(path);
  if (refusal !== undefined) {
    return refusal;
  }
  const written = runStep(`writing ${path}`, () => writeFileSync(path, body));
  return written.ok ? undefined : written.reason;
}

/**
 * Which run parameters a gate cannot be evaluated without.
 *
 * Derived from two places and nowhere else: the gate's own `parameters`
 * declaration, and the precondition kind, whose needs are a property of the
 * kind rather than of the gate. `branch-matches` requires `--phase`
 * unconditionally rather than only when the pattern happens to interpolate
 * it, which is stricter than necessary and deliberately so: M2-C-3 says a
 * check that cannot reach a verdict fails closed, and the cost of the strict
 * reading is one flag on an invocation that already carries three.
 */
export function requiredParameters(entry: GateEntry): RunParameter[] {
  const required = new Set<RunParameter>(entry.parameters ?? []);
  const kind = entry.precondition?.kind;
  if (kind === "diff-touches") {
    required.add("base");
  }
  if (kind === "branch-matches") {
    required.add("phase");
  }
  return [...required].sort();
}

type PreconditionOutcome =
  | { kind: "met"; record: PreconditionRecord }
  | { kind: "unmet"; record: PreconditionRecord }
  | { kind: "error"; reason: string };

/**
 * A CRASH IS NOT A SKIP (M3-P11, delivery/plan/m3-p11-phase-spec.md:15).
 *
 * THE DEFECT THIS EXISTS FOR, root-caused by the M3-P9 hazard reviewer. The
 * `command-exit-zero` evaluator below treated a command as "could not run"
 * only when `spawnSync` set `error`, which is the LAUNCHER failing to spawn.
 * A launcher that spawns perfectly well and runs a script that does not
 * exist gets exit 1, which the evaluator read as "the precondition is
 * unmet", so the gate printed `not-applicable`. Measured on this machine,
 * node v26.6.0, four commands, one `spawnSync` each:
 *
 *   node missing-script.mjs        status 1     error undefined
 *   node -e "process.exit(1)"      status 1     error undefined
 *   ./noexec.sh (mode 644)         status null  error EACCES
 *   ./badinterp.sh (bad shebang)   status null  error ENOENT
 *
 * Rows one and two are the whole problem: identical to `spawnSync`, opposite
 * in meaning. Row two is a REAL declaration in this repository
 * (`credential-token`'s precondition, gates.manifest.json), so "exit 1 means
 * unmet" cannot simply be withdrawn; and rows three and four already reached
 * `error` before this phase, so they are regression guards rather than the
 * new behaviour.
 *
 * THE DISTINGUISHING EVIDENCE IS THEREFORE NOT THE EXIT CODE (spec step 2).
 * It is whether the paths the command names can be run at all, established
 * BEFORE the spawn, so that "could not run" is a fact about the filesystem
 * rather than an inference from a number that two different situations
 * produce identically.
 *
 * WHICH ARGV ELEMENTS ARE PROBED, stated as a rule rather than left to
 * judgment, because MECHANISMS.md's row about deciding what another program
 * will do by pattern-matching its input is exactly the trap here. An element
 * is a PATH OPERAND when ALL FOUR hold:
 *
 *   1. it is not `command[0]` (the launcher, handled separately);
 *   2. `namesNoPath` does not rule it out (it is not an option, not the code
 *      value of one, and not a URL). Fix round 2 hoisted this into its own
 *      function so this rule and the wider one below cannot drift apart.
 *   3. it contains `/` (a bare word is not treated as a path HERE, so `.` and
 *      `--pin-root src` are left alone; the wider rule below adds the one
 *      further test that makes `node check.mjs` visible);
 *   4. it contains no whitespace, and the element before it does not begin
 *      with `-` (so an option's VALUE is never probed by THIS rule, whatever
 *      the option is).
 *
 * WHAT THIS RULE DOES NOT COVER, so the next reader does not have to
 * rediscover it: an interpreter invoked as `node --flag script.mjs` puts the
 * script after an option and rule 4 skips it; an operand named by an
 * environment variable or produced by a shell is invisible here; and a
 * script that EXISTS but whose own body throws still exits 1 and is still
 * read as unmet, because nothing outside the script can distinguish that
 * from a deliberate refusal. Those residues are recorded in
 * delivery/work-history/m3-p11.md rather than implied.
 *
 * FAIL CLOSED, LOUDLY (M2-C-3). An operand this rule probes and does not
 * find is `error` naming the element and its resolved absolute path, never a
 * quiet `not-applicable`. That is the right direction HERE, and only because
 * rules 2 to 4 keep the set small: this probe runs before the spawn, so a
 * false positive refuses a command that would have exited 0, and no exit code
 * exists yet to tell you it would have. Round 2 hit exactly that with a URL
 * operand.
 *
 * ------------------------------------------------------------------------
 * FIX ROUND 1 (M3-P11), AND THE MECHANISM IT CLOSES.
 *
 * As first written, the paragraphs above established SOME of the
 * preconditions of running and then let the exit code decide. That is one
 * mechanism with two independent halves, and a clean-room hazard reviewer
 * reproduced BOTH of them end to end through the packed CLI as a wrong
 * verdict (`not-applicable` for a command that crashed), which is the exact
 * defect this phase exists to close, surviving inside its own fix:
 *
 *   HALF A, the CONDITIONS tested per examined element were incomplete.
 *   `classifyEntry` answers "does it exist and is it a regular file". It
 *   does not answer "may this process OPEN it". A `chmod 000` script is
 *   present and regular, the probe passed it, `node` launched fine (so
 *   `spawnSync.error` stayed undefined), the open failed with EACCES, the
 *   exit was 1, and 1 meant unmet. Existence and type are two of the
 *   conditions for an open; permission is the third and it was untested.
 *
 *   HALF B, the SET of elements examined was a proper subset of the
 *   path-shaped ones. Rules 2 and 4 above skip an operand that follows an
 *   option (`node --flag script.mjs`) and one carrying whitespace, and both
 *   were confirmed to produce the same wrong verdict.
 *
 * HALF A IS CLOSED OUTRIGHT, by asking the complete question. A path can be
 * opened for reading exactly when `access(R_OK)` succeeds, which resolves
 * every component's traversal permission and the file's own mode in one
 * call, FOR THE CALLING PROCESS. That last clause is the point: the process
 * that runs this probe is the process that will spawn the command, so the
 * calling UID is the right UID to ask about, and `access` is therefore the
 * correct primitive here even though the pre-existing executable check
 * deliberately reads mode bits instead (that check wants a UID-independent
 * answer; this one wants a UID-dependent one, and both are now applied to
 * the launcher).
 *
 * HALF B IS NOT CLOSED BY WIDENING THIS RULE. This rule hard-refuses BEFORE
 * the spawn, so a false positive here breaks a precondition that would have
 * exited 0, and that is a worse direction to be wrong in than any silent skip.
 * Half B is closed by a SECOND, wider rule (`commandPathCandidates` below)
 * whose result is consulted only when the exit is nonzero, so an exit of 0
 * remains its own proof and no working declaration can be affected.
 *
 * ------------------------------------------------------------------------
 * FIX ROUND 2 (M3-P11) CORRECTED THAT SECOND RULE IN TWO WAYS, and the
 * sentence round 1 wrote here is the one that had to go. Round 1 argued that
 * after a nonzero exit a deliberately OVER-INCLUSIVE scan is the safe
 * direction, because its false positive is only a loud `error` an operator
 * can read. A delta verifier measured that trade and it does not hold:
 * `decideAggregate` checks `counts.error > 0` before anything else, so one
 * false error on one conditional gate fails the WHOLE bundle. The two
 * corrections are documented on `commandPathCandidates` (which elements) and
 * on `attributionGaps` (which moment).
 */
export interface CommandRunnability {
  /** False when the command could not have run: this is `error`, not unmet. */
  runnable: boolean;
  /** Why not. Empty when runnable. */
  reason: string;
  /** Every element this probe examined, so its scope is data, not a claim. */
  probed: string[];
}

/**
 * ELEMENTS THAT ARE NOT PATHS, WHATEVER SHAPE THEY HAVE. One function, so the
 * two rules below cannot drift apart: fix round 2 found the URL case by
 * fixing only the wider rule and watching the narrower one hard-refuse the
 * same element BEFORE the spawn, which is a strictly worse failure because it
 * refuses a command that would have exited 0. The three reasons are the three
 * this file claims to know, and each is written down rather than inferred:
 *
 *   an OPTION           begins with `-`. `--out=/tmp/x` is an option carrying
 *                       a value, not a path; probing the whole element could
 *                       never succeed, since no file is named `--out=/tmp/x`.
 *   an OPTION'S CODE    the element before it is in `CODE_VALUED_OPTIONS`.
 *   a URL               `scheme://...` has slashes and no filesystem.
 */
function namesNoPath(element: string, previous: string): boolean {
  return (
    element.startsWith("-") || CODE_VALUED_OPTIONS.has(previous) || URL_SHAPED.test(element)
  );
}

/**
 * The path operands of a command, by the four-part rule documented above,
 * MINUS the elements `namesNoPath` rules out. This is the STRICT set: it is
 * probed before the spawn and a failure here is a hard `error`, so it stays
 * conservative and keeps the whitespace and after-an-option guards that the
 * wider rule drops.
 */
export function commandPathOperands(command: string[]): string[] {
  const operands: string[] = [];
  for (let index = 1; index < command.length; index += 1) {
    const element = command[index] as string;
    const previous = command[index - 1] as string;
    if (namesNoPath(element, previous)) {
      continue;
    }
    if (!element.includes("/")) {
      continue;
    }
    if (/\s/.test(element)) {
      continue;
    }
    if (previous.startsWith("-")) {
      continue;
    }
    operands.push(element);
  }
  return operands;
}

/**
 * Options whose VALUE is CODE and never a path. A closed, explicit list, and
 * that is the point: it is the one piece of launcher grammar this file claims
 * to know, it is written down rather than inferred, and anything not in it is
 * treated as possibly naming a path. `node -e` and `node --eval` are the pair
 * that matters here, because `credential-token`'s real precondition in
 * gates.manifest.json:57 is exactly that shape; the others are the same
 * construct in the launchers a precondition is most likely to use (`sh -c`,
 * `bash -c`, `python -c`, `perl -e`, `ruby -e`, `node -p`).
 */
const CODE_VALUED_OPTIONS: ReadonlySet<string> = new Set([
  "-e",
  "--eval",
  "-p",
  "--print",
  "-c",
  "--command",
]);

/**
 * Suffixes that make a DIRECTORY-LESS operand a script path. This is the only
 * reason `node check.mjs` (fix round 1's declared residue, and the exact
 * defect class this phase exists to close) is visible at all: it has no `/`,
 * so the separator test cannot see it. A closed list, deliberately, because
 * the alternative is dropping the shape test entirely and that breaks a real
 * declaration: `check-dual-review`'s precondition ends `--precondition .`, and
 * `.` resolves to a DIRECTORY, which `probeOpenable` calls irregular, which
 * would make every run of that gate a false `error`. Measured, not assumed.
 */
const SCRIPT_SUFFIXES: readonly string[] = [
  ".mjs",
  ".cjs",
  ".js",
  ".ts",
  ".mts",
  ".cts",
  ".sh",
  ".bash",
  ".py",
  ".rb",
  ".pl",
];

/** `scheme://...`, which contains slashes and is never a filesystem path. */
const URL_SHAPED = /^[A-Za-z][A-Za-z0-9+.-]*:\/\//;

/**
 * Every argv element that names a PATH THE COMMAND NEEDED, used only to decide
 * whether a NONZERO exit is attributable to the command's own logic.
 *
 * ------------------------------------------------------------------------
 * FIX ROUND 2 (M3-P11) REWROTE THIS RULE, AND WHY IS THE WHOLE POINT.
 *
 * Fix round 1 defined it as "contains `/`", at any position, launcher
 * included. A delta verifier measured what that costs
 * (delivery/verification/m3-p11-fix-round-1.md, findings 2a and 2b) and the
 * cost is larger than round 1's own note conveyed: `decideAggregate` checks
 * `counts.error > 0` FIRST, so ONE false error on ONE conditional gate fails
 * the ENTIRE bundle. An honest, correctly written precondition could take a
 * consumer's whole delivery down. That is a worse failure than the silent
 * skip this phase set out to abolish, because a silent skip is wrong and
 * quiet while this is wrong and total.
 *
 * THE MECHANISM: "contains a slash" was being used as a proxy for "is a path
 * operand", and it is neither necessary nor sufficient.
 *
 *   NOT SUFFICIENT: inline code (`process.exit(existsSync("/marker")?0:1)`),
 *   a URL, an `--opt=/value` pair, a date (`2026/08/14`), a regex and plain
 *   division all contain `/` and none of them is a path.
 *
 *   NOT NECESSARY: `node check.mjs` names a real script with no `/` in it.
 *
 * So the rule now tests four things instead of one. An element at index >= 1
 * is a path this command needed when ALL FOUR hold:
 *
 *   1. it does not itself begin with `-`. An option is not an operand, and
 *      `--out=/tmp/x` is an option carrying a value, not a path: probing the
 *      whole element was a GUARANTEED false error for every `--opt=/path`
 *      form, since no file is ever named `--out=/tmp/x`.
 *   2. the element before it is not in `CODE_VALUED_OPTIONS`. This is the
 *      `node -e` case, and it is the one measured in finding 2a.
 *   3. it is not URL-shaped.
 *   4. it either contains `/`, or it carries a `SCRIPT_SUFFIXES` suffix and
 *      no whitespace. The second disjunct is new in round 2 and is what
 *      closes the bare-operand residue.
 *
 * The launcher (index 0) is deliberately NOT in this set. It is already
 * probed, with the executable conditions on top, by `probeCommandRunnable`
 * before the spawn, so including it here only duplicated that work.
 *
 * WHAT THIS RULE STILL GETS WRONG, stated rather than left to be discovered.
 * A FALSE ERROR remains reachable for an element that is not a path, is not
 * an option's value, and either contains `/` or ends in a script suffix: a
 * bare date operand (`mytool 2026/08/14`), an operand-position regex, and a
 * value passed to an option that takes a non-path value NOT in
 * `CODE_VALUED_OPTIONS` (`awk -v expr=a/b`). A SILENT SKIP remains reachable
 * for an operand with no `/` and no known suffix (`node check`, an
 * extensionless script), for a path named through an environment variable or
 * produced by a shell, and for an `--opt=/path` pair, which rule 1 now
 * declines to probe. Both lists are shorter than round 1's; neither is empty.
 * Full accounting, with the enumeration that produced it, in
 * delivery/work-history/m3-p11.md.
 */
export function commandPathCandidates(command: string[]): string[] {
  const candidates: string[] = [];
  for (let index = 1; index < command.length; index += 1) {
    const element = command[index] as string;
    const previous = command[index - 1] as string;
    if (namesNoPath(element, previous)) {
      continue;
    }
    const named =
      element.includes("/") ||
      (!/\s/.test(element) && SCRIPT_SUFFIXES.some((suffix) => element.endsWith(suffix)));
    if (!named) {
      continue;
    }
    candidates.push(element);
  }
  return [...new Set(candidates)];
}

/**
 * MAY THIS PROCESS OPEN THIS PATH? The complete question, asked once, so
 * there is one enumeration of "what opening a file requires" and not one per
 * call site: it must exist, it must be a regular file, and this process must
 * be permitted to read it. Fix round 1, half A (finding H-1).
 *
 * `requireExecutable` adds the launcher's two extra conditions: the
 * UID-independent mode-bit test that was already here, and `access(X_OK)`,
 * which is the UID-dependent one it could not answer.
 */
function probeOpenable(
  display: string,
  absolute: string,
  requireExecutable: boolean,
): { ok: true } | { ok: false; reason: string } {
  const entry = classifyEntry(absolute);
  if (entry.kind === "absent") {
    return { ok: false, reason: `${display} does not exist (resolved to ${absolute})` };
  }
  if (entry.kind === "dangling") {
    return {
      ok: false,
      reason: `${display} is a symbolic link whose target does not exist (resolved to ${absolute})`,
    };
  }
  if (entry.kind === "irregular" || entry.kind === "unexaminable") {
    return { ok: false, reason: entry.reason };
  }
  const stat = runStep(`examining ${absolute}`, () => statSync(absolute));
  if (!stat.ok) {
    return { ok: false, reason: stat.reason };
  }
  const mode = (stat.value.mode & 0o777).toString(8);
  const readable = runStep(`checking read access to ${absolute}`, () =>
    accessSync(absolute, fsConstants.R_OK),
  );
  if (!readable.ok) {
    return {
      ok: false,
      reason:
        `${display} exists and is a regular file but is NOT READABLE by this process ` +
        `(mode ${mode}, resolved to ${absolute}); the command would launch and then fail to ` +
        "open it, which an exit code cannot be distinguished from a deliberate refusal",
    };
  }
  if (!requireExecutable) {
    return { ok: true };
  }
  if ((stat.value.mode & 0o111) === 0) {
    return {
      ok: false,
      reason: `${display} is not executable (mode ${mode}, resolved to ${absolute})`,
    };
  }
  const executable = runStep(`checking execute access to ${absolute}`, () =>
    accessSync(absolute, fsConstants.X_OK),
  );
  if (!executable.ok) {
    return {
      ok: false,
      reason:
        `${display} carries an execute bit but is NOT EXECUTABLE by this process ` +
        `(mode ${mode}, resolved to ${absolute})`,
    };
  }
  return { ok: true };
}

/**
 * Can this command run at all? See the block comment above for the rule and
 * for what it deliberately does not cover.
 *
 * The launcher is probed only when it names a path (contains `/`); a bare
 * name is a PATH lookup and is left to `spawnSync`'s own `error`, which
 * already reports it, rather than reimplementing PATH resolution here.
 */
export function probeCommandRunnable(
  command: string[],
  cwd: string,
): CommandRunnability {
  const probed: string[] = [];
  const launcher = command[0];
  if (launcher === undefined || launcher === "") {
    return { runnable: false, reason: "the command is empty", probed };
  }
  const targets: { path: string; isLauncher: boolean }[] = [];
  if (launcher.includes("/")) {
    targets.push({ path: launcher, isLauncher: true });
  }
  for (const operand of commandPathOperands(command)) {
    targets.push({ path: operand, isLauncher: false });
  }
  for (const target of targets) {
    const absolute = isAbsolute(target.path) ? target.path : resolve(cwd, target.path);
    probed.push(target.path);
    const openable = probeOpenable(target.path, absolute, target.isLauncher);
    if (!openable.ok) {
      return { runnable: false, reason: openable.reason, probed };
    }
  }
  return { runnable: true, reason: "", probed };
}

/**
 * Every path-shaped argv element this process cannot open, with the reason.
 * Empty means a nonzero exit is ATTRIBUTABLE to the command's own logic;
 * non-empty means it is not, and M2-C-3 says a check that cannot reach a
 * verdict fails closed rather than guessing one.
 *
 * FIX ROUND 2 MOVED THE CALL SITE, and the move is the fix for a second
 * mechanism, independent of which elements are scanned. Round 1 ran this
 * AFTER the spawn, on the nonzero arm only. The question it answers is "did
 * the command have what it needed IN ORDER TO RUN", which is a question about
 * the moment BEFORE the spawn, and answering it from the filesystem AFTER the
 * spawn reads the command's own effects back as evidence about its inputs. A
 * precondition script that legitimately decides "unmet" and deletes itself as
 * its last act (a one-shot or bootstrap script) was therefore reported
 * `error`, deterministically, no timing window needed: measured in
 * delivery/verification/m3-p11-fix-round-1.md as finding 2b.
 *
 * So the scan now runs BEFORE the spawn and its result is CARRIED. The exit
 * code still decides whether the result is consulted: an exit of 0 is its own
 * proof that the command ran, so no declaration that succeeds can be affected
 * by this at all, which is the property round 1 established and round 2 keeps.
 */
export function attributionGaps(command: string[], cwd: string): string[] {
  const gaps: string[] = [];
  for (const element of commandPathCandidates(command)) {
    const absolute = isAbsolute(element) ? element : resolve(cwd, element);
    // A DIRECTORY IS A PATH, and this scan must not say otherwise. Round 2
    // found this by enumeration rather than by argument: this repository's OWN
    // `scope` gate is declared as
    // `node src/gates/scope.ts --declarations delivery/plan/phase-declarations`
    // (gate-registry.yaml:126), whose last element is a directory that exists,
    // is exactly what the command wants, and which `probeOpenable` refuses as
    // "not a regular file". That gate has no `command-exit-zero` precondition,
    // so nothing was breaking today, but it is a real declared counter-example
    // to the regular-file question being the right one HERE. The pre-spawn
    // runnability probe keeps asking the stricter question, because there the
    // element is a script the LAUNCHER is about to open.
    const kind = runStep(`examining ${absolute}`, () => statSync(absolute));
    if (kind.ok && kind.value.isDirectory()) {
      const enterable = runStep(`entering ${absolute}`, () =>
        accessSync(absolute, fsConstants.R_OK | fsConstants.X_OK),
      );
      if (!enterable.ok) {
        gaps.push(
          `${element} is a directory this process cannot read or enter (resolved to ${absolute})`,
        );
      }
      continue;
    }
    const openable = probeOpenable(element, absolute, false);
    if (!openable.ok) {
      gaps.push(openable.reason);
    }
  }
  return gaps;
}

function gitLines(
  cwd: string,
  args: string[],
): { ok: true; lines: string[] } | { ok: false; reason: string } {
  const result = spawnSync("git", args, { cwd, encoding: "utf8" });
  if (result.error !== undefined) {
    return {
      ok: false,
      reason: `git ${args.join(" ")} could not be run: ${singleLine(String(result.error))}`,
    };
  }
  if (result.status !== 0) {
    return {
      ok: false,
      reason: `git ${args.join(" ")} exited ${String(result.status)}: ${singleLine(result.stderr ?? "")}`,
    };
  }
  return {
    ok: true,
    lines: (result.stdout ?? "")
      .split("\n")
      .map((line) => line.trim())
      .filter((line) => line !== ""),
  };
}

function evaluatePrecondition(
  precondition: PreconditionSpec,
  options: RunOptions,
  cwd: string,
): PreconditionOutcome {
  const id = precondition.id;
  if (precondition.kind === "file-exists" || precondition.kind === "file-absent") {
    const path = precondition.path;
    if (path === undefined) {
      return { kind: "error", reason: `precondition ${id} declares no path` };
    }
    const entry = classifyEntry(path);
    if (entry.kind === "irregular" || entry.kind === "unexaminable") {
      // M2-C-6: present, and not a thing this gate may open. Reporting the
      // observed type is the whole point; guessing "unmet" would be a
      // verdict about a path nobody examined.
      return { kind: "error", reason: entry.reason };
    }
    const present = entry.kind === "regular";
    const wanted = precondition.kind === "file-exists";
    const met = present === wanted;
    const record: PreconditionRecord = {
      id,
      met,
      reason: present
        ? `${path} is a regular file`
        : `${path} does not exist`,
      evidence: [path],
    };
    return met ? { kind: "met", record } : { kind: "unmet", record };
  }

  if (precondition.kind === "branch-matches") {
    const pattern = precondition.pattern;
    if (pattern === undefined) {
      return { kind: "error", reason: `precondition ${id} declares no pattern` };
    }
    if (options.phase === undefined) {
      return {
        kind: "error",
        reason: `precondition ${id} is kind branch-matches and --phase was not supplied`,
      };
    }
    const branch = gitLines(cwd, ["rev-parse", "--abbrev-ref", "HEAD"]);
    if (!branch.ok) {
      return { kind: "error", reason: branch.reason };
    }
    const name = branch.lines[0] ?? "";
    // CR-805, two faults in one line. `{phase}` is documented as a TOKEN
    // substitution, and substituting a value into regex SOURCE without
    // escaping silently changes the pattern's meaning: a phase id containing
    // `.` matched any character. And the compiled expression was unanchored,
    // so `claude/m2-p4-` matched the decoy branch
    // `evil/claude/m2-p4-scope-auditor-DECOY`. A precondition whose job is to
    // decide "am I on the branch this phase governs" was deciding it on a
    // strictly weaker predicate than it appeared to.
    const source = pattern.split("{phase}").join(escapeRegExp(options.phase));
    let expression: RegExp;
    try {
      expression = new RegExp(`^(?:${source})$`);
    } catch (error) {
      return {
        kind: "error",
        reason: `precondition ${id} pattern ${source} is not a valid expression: ${(error as Error).message}`,
      };
    }
    const met = expression.test(name);
    const record: PreconditionRecord = {
      id,
      met,
      reason: `branch ${name} ${met ? "matches" : "does not match"} ^(?:${source})$`,
    };
    return met ? { kind: "met", record } : { kind: "unmet", record };
  }

  if (precondition.kind === "diff-touches") {
    const paths = precondition.paths;
    if (paths === undefined || paths.length === 0) {
      return { kind: "error", reason: `precondition ${id} declares no paths` };
    }
    if (options.base === undefined) {
      return {
        kind: "error",
        reason: `precondition ${id} is kind diff-touches and --base was not supplied`,
      };
    }
    const head = options.head ?? "HEAD";
    const changed = gitLines(cwd, [
      "diff",
      "--name-only",
      `${options.base}...${head}`,
    ]);
    if (!changed.ok) {
      return { kind: "error", reason: changed.reason };
    }
    const touched = changed.lines.filter((line) =>
      paths.some((prefix) => line === prefix || line.startsWith(prefix)),
    );
    const met = touched.length > 0;
    const record: PreconditionRecord = {
      id,
      met,
      reason: met
        ? `${String(touched.length)} changed path(s) under ${paths.join(", ")}`
        : `no changed path under ${paths.join(", ")}`,
      evidence: touched,
    };
    return met ? { kind: "met", record } : { kind: "unmet", record };
  }

  const command = precondition.command;
  if (command === undefined || command.length === 0) {
    return { kind: "error", reason: `precondition ${id} declares no command` };
  }
  // M3-P11. THE PROBE COMES BEFORE THE SPAWN, and it is the whole of the
  // difference between the three outcomes below and the two there used to be.
  // After the spawn there is only an exit code, and an exit code cannot
  // separate "this script does not exist" from "this script says no".
  const runnable = probeCommandRunnable(command, cwd);
  if (!runnable.runnable) {
    return {
      kind: "error",
      reason:
        `precondition ${id} command ${command.join(" ")} could not be run: ${runnable.reason}` +
        ` (this is NOT not-applicable: nothing was evaluated, M2-C-3)`,
    };
  }
  // FIX ROUND 2, MECHANISM B. Taken HERE, before the spawn, and carried.
  // "Did this command have what it needed" is a question about the state the
  // command was launched into, and the filesystem after it has run is a
  // different subject. Consulted only on the nonzero arm, below.
  const gapsAtSpawnTime = attributionGaps(command, cwd);
  const result = spawnSync(command[0] as string, command.slice(1), {
    cwd,
    encoding: "utf8",
  });
  if (result.error !== undefined) {
    // The command does not exist, or could not be executed. That is not
    // "the precondition is unmet": nothing was evaluated (M2-C-3).
    return {
      kind: "error",
      reason: `precondition ${id} command ${command.join(" ")} could not be run: ${singleLine(String(result.error))}`,
    };
  }
  if (result.signal !== null && result.signal !== undefined) {
    return {
      kind: "error",
      reason: `precondition ${id} command ${command.join(" ")} was terminated by ${result.signal}`,
    };
  }
  const met = result.status === 0;
  if (!met) {
    // FIX ROUND 1, HALF B, AS CORRECTED BY ROUND 2. Reading this nonzero exit
    // as "evaluated and unmet" asserts that the command reached its own logic.
    // That assertion is only sound if everything the command needed in order
    // to get there was available AT THE MOMENT IT WAS LAUNCHED, which is what
    // `gapsAtSpawnTime` records. The pre-spawn runnability probe establishes
    // the same thing for a PROPER SUBSET of the elements (it declines to look
    // at an option's value at all, and it hard-refuses rather than carrying a
    // result), so this wider, carried scan is what covers the rest.
    if (gapsAtSpawnTime.length > 0) {
      return {
        kind: "error",
        reason:
          `precondition ${id} command ${command.join(" ")} exited ${String(result.status)}, ` +
          `and that exit CANNOT BE ATTRIBUTED to an evaluated precondition: ` +
          `${String(gapsAtSpawnTime.length)} path-shaped argv element(s) could not be opened by ` +
          `this process when the command was launched: ` +
          `${gapsAtSpawnTime.join("; ")}` +
          ` (this is NOT not-applicable: nothing was established, M2-C-3. If such an element is ` +
          `not a path, give the command a form in which it is not path-shaped)`,
      };
    }
  }
  const record: PreconditionRecord = {
    id,
    met,
    reason: `${command.join(" ")} exited ${String(result.status)}`,
  };
  return met ? { kind: "met", record } : { kind: "unmet", record };
}

function errorResult(
  entry: GateEntry,
  startedAt: string,
  detail: string,
  precondition?: PreconditionRecord,
): GateResult {
  return makeGateResult({
    gate: entry.id,
    status: "error",
    units: 0,
    unitLabel: entry.unitLabel,
    startedAt,
    endedAt: now(),
    detail,
    precondition,
  });
}

interface GateOutcome {
  result: GateResult;
  applicable: boolean;
  recordPath?: string;
  stdoutPath?: string;
  stderrPath?: string;
}

function runOneGate(
  entry: GateEntry,
  options: RunOptions,
  cwd: string,
  evidenceDir: string,
  runId: string,
): GateOutcome {
  const startedAt = now();
  const gateDir = join(evidenceDir, entry.id);
  // CR-900 row 1a. Every mutation below is inside `evidenceDir`, and the claim
  // can be lost between gates (a previous gate steals it) or DURING one (this
  // gate's own precondition command steals it), so the question is asked at
  // each operation and not once at the top of this function.
  const dirRefusal = mkdirInsideClaim(evidenceDir, runId, gateDir);
  if (dirRefusal !== undefined) {
    return {
      result: errorResult(entry, startedAt, dirRefusal),
      applicable: false,
    };
  }
  const recordPath = join(gateDir, "result.json");
  const stdoutPath = join(gateDir, "stdout.txt");
  const stderrPath = join(gateDir, "stderr.txt");

  // Parameters first: a gate invoked without something it needs measured
  // nothing, and that is `error`, never `not-applicable` (M2-C-3, M2R-003).
  const missing = requiredParameters(entry).filter(
    (name) => options[name] === undefined,
  );
  if (missing.length > 0) {
    return {
      result: errorResult(
        entry,
        startedAt,
        `gate ${entry.id} requires ${missing.map((name) => `--${name}`).join(" ")}, which was not supplied`,
      ),
      applicable: false,
    };
  }

  if (entry.precondition !== undefined) {
    // CR-900 row 4, which the review's table did not list. Evaluating a
    // precondition DISPATCHES a subprocess: `git` for `branch-matches` and
    // `diff-touches`, and for kind `command` an ARBITRARY program named by the
    // manifest. Dispatching a program is a mutation of this directory by
    // proxy, so it asks the same question the delete and the gate spawn ask.
    const preconditionRefusal = refuseUnlessHolder(
      evidenceDir,
      runId,
      `evaluate precondition ${entry.precondition.id} for gate ${entry.id}`,
    );
    if (preconditionRefusal !== undefined) {
      return {
        result: errorResult(entry, startedAt, preconditionRefusal),
        applicable: false,
      };
    }
    const outcome = evaluatePrecondition(entry.precondition, options, cwd);
    if (outcome.kind === "error") {
      return {
        result: errorResult(entry, startedAt, outcome.reason),
        applicable: false,
      };
    }
    if (outcome.kind === "unmet") {
      return {
        result: makeGateResult({
          gate: entry.id,
          status: "not-applicable",
          units: 0,
          unitLabel: entry.unitLabel,
          startedAt,
          endedAt: now(),
          detail: `precondition ${outcome.record.id} evaluated and unmet: ${outcome.record.reason}`,
          precondition: outcome.record,
        }),
        applicable: false,
      };
    }
  }

  // M3-P11, the same rule one level out. A GATE whose command names a path
  // that does not exist reached `error` before this phase too, but by a
  // route that named the wrong path: the child exited 1 without writing a
  // record, so the detail read "gate X exited 1 without writing a result
  // record at <the RECORD path>", which is the one path in the sentence that
  // is not the problem. Probing first makes the missing path the thing the
  // operator is told about (criterion 1). This sits AFTER the precondition
  // block deliberately: a precondition the runner evaluated and found unmet
  // is a real skip, and a gate that was never going to run is honestly
  // reported as not-applicable rather than as a crash.
  const commandRunnable = probeCommandRunnable(entry.command, cwd);
  if (!commandRunnable.runnable) {
    return {
      result: errorResult(
        entry,
        startedAt,
        `gate ${entry.id} could not be run: ${commandRunnable.reason}`,
      ),
      applicable: false,
    };
  }

  // The record path is probed BEFORE the child exists. A named pipe here
  // would block the gate in the kernel forever and the runner behind it.
  const recordRefusal = refuseOpenForWrite(recordPath);
  if (recordRefusal !== undefined) {
    return {
      result: errorResult(
        entry,
        startedAt,
        `${recordRefusal}; refusing to run gate ${entry.id}`,
      ),
      applicable: false,
    };
  }
  // CR-900 rows 5 and 6, the two the finding named. The DELETE below removes a
  // record that, under a stolen claim, belongs to another run; the DISPATCH
  // after it hands that other run's directory to a program of this manifest's
  // choosing. One question covers both because nothing between them can change
  // the claim: the argv construction is pure string work. Splitting it into two
  // identical checks would add a line no test could redden independently.
  //
  // This check is what makes the fix COMPLETE rather than the review's sketch
  // of one check at the top of `runOneGate`. By here the precondition command
  // has already run, and it can have stolen the claim after that top check
  // passed (witness W3).
  const mutateRefusal = refuseUnlessHolder(
    evidenceDir,
    runId,
    `clear ${recordPath} and run gate ${entry.id}`,
  );
  if (mutateRefusal !== undefined) {
    return {
      result: errorResult(entry, startedAt, mutateRefusal),
      applicable: false,
    };
  }
  const cleared = runStep(`clearing ${recordPath}`, () =>
    rmSync(recordPath, { force: true }),
  );
  if (!cleared.ok) {
    return {
      result: errorResult(entry, startedAt, cleared.reason),
      applicable: false,
    };
  }

  const argv = [...entry.command.slice(1), "--result", recordPath, "--evidence", gateDir];
  for (const name of requiredParameters(entry)) {
    argv.push(`--${name}`, options[name] as string);
  }
  const child = spawnSync(entry.command[0] as string, argv, {
    cwd,
    encoding: "utf8",
  });
  // Through writeInsideClaim like every other write into this directory: the
  // rule is a property of writing here, not of one call site (CR-860).
  const stdoutRefusal = writeInsideClaim(
    evidenceDir,
    runId,
    stdoutPath,
    child.stdout ?? "",
  );
  const stderrRefusal = writeInsideClaim(
    evidenceDir,
    runId,
    stderrPath,
    child.stderr ?? "",
  );
  const captureRefusal = stdoutRefusal ?? stderrRefusal;

  const ingested = ingestGateRun(entry, startedAt, recordPath, child, captureRefusal);
  return {
    result: ingested,
    // CR-800: "applicable" is read off the RESULT, never off the fact that a
    // child was started. A gate that decides its own applicability and says
    // `not-applicable` is not applicable, and it used to be counted as one.
    applicable: ingested.status !== "not-applicable",
    recordPath,
    stdoutPath,
    stderrPath,
  };
}

/**
 * Turn one gate subprocess's exit code plus whatever it left at the record
 * path into a GateResult. Every path that is not "the gate said what it
 * meant" ends at `error`.
 */
function ingestGateRun(
  entry: GateEntry,
  startedAt: string,
  recordPath: string,
  child: ReturnType<typeof spawnSync>,
  captureRefusal: string | undefined,
): GateResult {
  if (captureRefusal !== undefined) {
    return errorResult(entry, startedAt, captureRefusal);
  }
  if (child.error !== undefined) {
    return errorResult(
      entry,
      startedAt,
      `gate ${entry.id} could not be run: ${singleLine(String(child.error))}`,
    );
  }
  if (child.signal !== null && child.signal !== undefined) {
    return errorResult(
      entry,
      startedAt,
      `gate ${entry.id} was terminated by ${child.signal}`,
    );
  }
  const exitCode = child.status ?? -1;

  const entryClass = classifyEntry(recordPath);
  if (entryClass.kind === "irregular" || entryClass.kind === "unexaminable") {
    return errorResult(entry, startedAt, entryClass.reason);
  }
  if (entryClass.kind !== "regular") {
    // No record. A nonzero exit here is NOT red: Node exits 1 on an uncaught
    // exception, which collides exactly with the red code, so a crash and a
    // refutation would be indistinguishable (step 7).
    return errorResult(
      entry,
      startedAt,
      `gate ${entry.id} exited ${String(exitCode)} without writing a result record at ${recordPath}`,
    );
  }
  const read = readRegularFileIfPresent(recordPath);
  if (read.kind !== "read") {
    return errorResult(
      entry,
      startedAt,
      read.kind === "refused"
        ? read.reason
        : `gate ${entry.id} result record vanished at ${recordPath}`,
    );
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(read.body);
  } catch (error) {
    return errorResult(
      entry,
      startedAt,
      `gate ${entry.id} result record does not parse: ${(error as Error).message}`,
    );
  }
  const diagnostics = validateResultDocument(parsed);
  if (diagnostics.length > 0) {
    return errorResult(
      entry,
      startedAt,
      `gate ${entry.id} result record is invalid: ${diagnostics.join("; ")}`,
    );
  }
  const record = parsed as GateResult;
  if (record.gate !== entry.id) {
    return errorResult(
      entry,
      startedAt,
      `gate ${entry.id} wrote a record for ${record.gate}`,
    );
  }
  const expected = exitCodeForStatus(record.status);
  if (exitCode !== expected) {
    const named = statusForExitCode(exitCode);
    return errorResult(
      entry,
      startedAt,
      `gate ${entry.id} recorded status ${record.status} (exit ${String(expected)}) but exited ${String(exitCode)}` +
        (named === undefined ? "" : ` (${named})`),
    );
  }
  // CR-806. `vacuous` exists to be set by the two rewrite points and by
  // nothing else (deviation D2). A gate that writes it itself was being
  // believed, so a green record could be counted in the `vacuous` bucket and
  // break step 8's "vacuous is a strict subset of error". The runner is
  // documented as adversarial towards its own gates; here it was trusting one.
  const claimed: GateResult = { ...record };
  delete claimed.vacuous;

  if (claimed.status === "green" && claimed.units === 0) {
    // The constructor cannot produce this, but a gate that does not use the
    // constructor can, and that is exactly the party this rule is aimed at.
    return {
      ...claimed,
      status: "error",
      vacuous: true,
      detail:
        claimed.detail === ""
          ? M2_C_2_DETAIL
          : `${M2_C_2_DETAIL}; the gate reported: ${claimed.detail}`,
    };
  }

  // CR-804 part two: M2-C-5, enforced by the runner rather than left to each
  // gate's own honesty. The runner holds both the record's pins and the
  // module that compares them, two lines from where it applies the
  // structurally identical M2-C-2 rewrite, and was doing nothing with either.
  const pinFailure = pinRefusal(claimed);
  if (pinFailure !== undefined && claimed.status === "green") {
    return {
      ...claimed,
      status: "error",
      detail:
        claimed.detail === ""
          ? pinFailure
          : `${pinFailure}; the gate reported: ${claimed.detail}`,
    };
  }
  return claimed;
}

export const M2_C_5_DETAIL =
  "M2-C-5 (a run that cannot name what it executed is not evidence)";

/**
 * Why a record's pins refuse it, or undefined when they do not. A gate that
 * declares no pin is not bound by M2-C-5 and is not touched here; the
 * constraint binds the gates that execute a test suite, and each of those
 * declares its pins.
 */
function pinRefusal(record: GateResult): string | undefined {
  if (record.pin === undefined) {
    return undefined;
  }
  if (record.pin.start.fileCount === 0 || record.pin.end.fileCount === 0) {
    return `${M2_C_5_DETAIL}: a pin over ${record.pin.start.roots.join(", ")} measured no files`;
  }
  const differences = comparePins(record.pin.start, record.pin.end);
  if (differences.length === 0) {
    return undefined;
  }
  return (
    `${M2_C_5_DETAIL}: the tree changed during the run: ` +
    differences.map(describePinDifference).join("; ")
  );
}

/**
 * Run the manifest's gates. Returns the aggregate exit code and, when the
 * run got far enough to have one, the summary that was written.
 */
export interface AggregateCounts {
  declared: number;
  applicable: number;
  verdict: number;
  green: number;
  red: number;
  "not-applicable": number;
  error: number;
  vacuous: number;
}

/**
 * THE ONE AGGREGATE DECISION, extracted so it can be EXERCISED rather than
 * read (CR-800's fix round). CR-800 was a reading of these branch conditions
 * that turned out not to hold, and the first test written for the fix
 * asserted on the TEXT of this function, which is the guard-that-asserts-text
 * class MECHANISMS.md records six instances of. A pure function over a counts
 * object can be handed states the runner cannot currently produce, including
 * the internally inconsistent ones the invariants below exist for, so the
 * invariants are witnessed instead of quoted.
 *
 * AGGREGATE PRECEDENCE, fixed here so it is one rule and not a reading. A
 * concrete failure outranks the vacuity check, because "3 gates reported
 * error" tells the operator more than "no applicable gate" and both exit 21
 * anyway. The vacuity check outranks a required not-applicable gate, because
 * a bundle that examined nothing is not a report about any one gate (M2-C-2
 * at the aggregate level, M2R-012).
 */
export function decideAggregate(
  counts: AggregateCounts,
  requiredNotApplicable: string[],
  rows: { id: string; status: GateStatus }[],
): { exitCode: number; reason: string } {
  let exitCode = EXIT_GREEN;
  let reason = "every applicable gate is green";
  if (counts.error > 0) {
    exitCode = EXIT_GATE_ERROR;
    reason = `${String(counts.error)} gate(s) reported error: ${rows
      .filter((row) => row.status === "error")
      .map((row) => row.id)
      .join(", ")}`;
  } else if (counts.red > 0) {
    exitCode = EXIT_RED;
    reason = `${String(counts.red)} gate(s) reported red: ${rows
      .filter((row) => row.status === "red")
      .map((row) => row.id)
      .join(", ")}`;
  } else if (counts.verdict === 0) {
    // CR-800. This used to read `counts.applicable === 0`, and `applicable`
    // used to mean "was spawned", so a bundle of gates that each declared
    // their own not-applicable slipped past it and exited 0. The count
    // consulted here is now the only one that means work was done.
    exitCode = EXIT_GATE_ERROR;
    reason = NO_APPLICABLE_GATE;
  } else if (requiredNotApplicable.length > 0) {
    exitCode = EXIT_NOT_APPLICABLE;
    reason = `required gate(s) not applicable: ${requiredNotApplicable.join(", ")}`;
  }

  // TOTAL OVER GARBAGE, not just over zero (CR-862). The first version of
  // this check was `counts.green === 0`, which is FALSE for NaN, for
  // undefined, for a missing key and for a negative number, so all four
  // reached exit 0 with "every applicable gate is green". None is reachable
  // through the runner today, where `counts` is built from integer literals
  // and `+= 1`. That is exactly the argument this function exists to refuse
  // to rely on: its stated contract is to be handed states the runner cannot
  // currently produce, and a guard that only rejects the value it was written
  // against is the same shape as the defect it was written for.
  //
  // So every count is checked for being a non-negative safe integer FIRST,
  // and the success-path assertion is written as `!(green > 0)`, which is
  // true for every non-number as well as for zero.
  const badCounts = Object.entries(counts)
    .filter(([, value]) => !Number.isSafeInteger(value) || (value as number) < 0)
    .map(([name]) => name)
    .sort();
  if (badCounts.length > 0) {
    return {
      exitCode: EXIT_GATE_ERROR,
      reason:
        "internal inconsistency: count(s) that are not non-negative integers: " +
        `${badCounts.join(", ")} (${JSON.stringify(counts)})`,
    };
  }
  for (const name of [
    "declared",
    "applicable",
    "verdict",
    "green",
    "red",
    "not-applicable",
    "error",
    "vacuous",
  ]) {
    if (!Object.prototype.hasOwnProperty.call(counts, name)) {
      return {
        exitCode: EXIT_GATE_ERROR,
        reason: `internal inconsistency: the count ${name} is missing (${JSON.stringify(counts)})`,
      };
    }
  }

  // THE SUCCESS PATH CANNOT DESCRIBE AN EMPTY GREEN BUCKET. The branches
  // above already make exit 0 unreachable with a zero green bucket, and this
  // asserts it rather than trusting the reading, because CR-800 was exactly a
  // reading of the branch conditions that turned out not to hold.
  //
  // `!(green > 0)` rather than `green === 0` is WITNESSED, not belt and braces
  // (CR-901). Round two recorded it as "unwitnessable: no input distinguishes
  // the two forms", which was an impossibility claim of exactly the shape
  // tuition T-006 is about, and it is false. The two screens above do not
  // screen the same set of properties: the bad-count screen enumerates with
  // `Object.entries`, which sees own ENUMERABLE properties, while the presence
  // screen uses `hasOwnProperty`, which sees own properties enumerable or not.
  // A count defined as
  //
  //     Object.defineProperty(counts, "green", { value: NaN, enumerable: false })
  //
  // is invisible to the first screen and present to the second, so it arrives
  // here unexamined. `!(NaN > 0)` is true and reports the inconsistency;
  // `NaN === 0` is false and would certify "every applicable gate is green"
  // with green equal to NaN. Registered as
  // `gate-aggregate-nonenumerable-nan-green`.
  if (exitCode === EXIT_GREEN && !(counts.green > 0)) {
    exitCode = EXIT_GATE_ERROR;
    reason =
      "internal inconsistency: the run reached the success path with zero " +
      `green gates (${JSON.stringify(counts)})`;
  }
  // Step 8's stated relation, asserted rather than assumed (CR-806).
  if (counts.vacuous > counts.error) {
    exitCode = EXIT_GATE_ERROR;
    reason =
      `internal inconsistency: vacuous ${String(counts.vacuous)} exceeds ` +
      `error ${String(counts.error)}, and vacuous is a strict subset of error`;
  }
  return { exitCode, reason };
}

export const RUN_CLAIM_FILE = ".tiphys-gate-run.json";

/**
 * Claim the evidence directory with an O_EXCL create, the pattern
 * `src/lock.ts` already carries (MECHANISMS.md, "Claim file (mutual exclusion
 * by O_EXCL)", which requires a third user to read that module first: done,
 * and this follows its rule rather than inventing a second one).
 *
 * No steal, no age heuristic, no bounded wait. A claim that cannot be taken
 * fails LOUDLY and NAMES THE STUCK FILE, because a silent wait is
 * indistinguishable from an absence of contention, and because an evidence
 * directory is not a contended resource by design: two runs sharing one is
 * an operator error, not a queue.
 */
function claimEvidenceDirectory(
  evidenceDir: string,
  runId: string,
  manifestPath: string,
): string | undefined {
  const claimPath = join(evidenceDir, RUN_CLAIM_FILE);
  const refusal = refuseOpenForWrite(claimPath);
  if (refusal !== undefined) {
    return refusal;
  }
  const body = `${JSON.stringify(
    { runId, manifest: manifestPath, startedAt: now() },
    null,
    2,
  )}\n`;
  try {
    writeFileSync(claimPath, body, { flag: "wx" });
    return undefined;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "EEXIST") {
      return `evidence directory ${evidenceDir} could not be claimed: ${singleLine(String(error))}`;
    }
    const holder = claimHolder(evidenceDir);
    const held = readRegularFileIfPresent(claimPath);
    const who = held.kind === "read" ? singleLine(held.body) : "unreadable";
    // CR-861. The refused run writes NOTHING here, which is correct, and that
    // used to mean the only statement in the directory about what happened
    // was a DIFFERENT run's: the previous summary sat there saying exit 0,
    // aborted false, "every applicable gate is green". So the refusal itself
    // carries both ids and says, in words, that anything in the directory
    // belongs to the other run.
    return (
      `evidence directory ${evidenceDir} is already claimed by another run; ` +
      `claim file ${claimPath} holds ${who}. ` +
      `This run is ${runId} and it wrote NOTHING: any summary.json in ` +
      `${evidenceDir} belongs to run ${holder ?? "unknown"}, not to this run, ` +
      "and is not a report about this invocation. " +
      "Two runs sharing one evidence directory produce a bundle attributable " +
      "to neither. Use a different --evidence directory, or delete that file " +
      "if no run holds it."
    );
  }
}

/**
 * Replace `summary.json` atomically, staging under a name that carries this
 * run's id. MECHANISMS.md's "Atomic file replacement" row is explicit that a
 * FIXED stage name lets two concurrent passes share one temporary and the
 * loser dies on ENOENT, so the runId is in the stage name and no other run
 * can collide with it. The claim above already excludes a second runner from
 * this directory; this is the second lock on the same door, and it costs one
 * rename.
 */
function writeSummaryAtomically(
  evidenceDir: string,
  summaryPath: string,
  runId: string,
  summary: RunSummary,
): string | undefined {
  const stagePath = `${summaryPath}.${runId}.stage`;
  const staged = writeInsideClaim(
    evidenceDir,
    runId,
    stagePath,
    `${JSON.stringify(summary, null, 2)}\n`,
  );
  if (staged !== undefined) {
    return staged;
  }
  const refusal = refuseOpenForWrite(summaryPath);
  if (refusal !== undefined) {
    return refusal;
  }
  // CR-900 row 8. A rename is a mutation of two entries in this directory, and
  // it was guarded only by the READING that the staged write above must have
  // succeeded first. That reading happens to be sound today; this phase is on
  // its third round because a reading of control flow was wrong twice, and the
  // rule this module now states is that the mutation asks, not its caller.
  const renameRefusal = refuseUnlessHolder(
    evidenceDir,
    runId,
    `replace ${summaryPath}`,
  );
  if (renameRefusal !== undefined) {
    return renameRefusal;
  }
  const renamed = runStep(`replacing ${summaryPath}`, () =>
    renameSync(stagePath, summaryPath),
  );
  return renamed.ok ? undefined : renamed.reason;
}

/** The runId recorded in a claim file, or undefined if it cannot be read. */
function claimHolder(evidenceDir: string): string | undefined {
  const read = readRegularFileIfPresent(join(evidenceDir, RUN_CLAIM_FILE));
  if (read.kind !== "read") {
    return undefined;
  }
  try {
    const parsed = JSON.parse(read.body) as { runId?: unknown };
    return typeof parsed.runId === "string" ? parsed.runId : undefined;
  } catch {
    return undefined;
  }
}

/**
 * RELEASE ONLY WHAT THIS RUN HOLDS (CR-860).
 *
 * The mechanism the finding names is: *cleanup that is valid only while the
 * claim is held, performed from a frame that does not know whether the claim
 * is held*. The instance was a release in an inner `finally` followed by a
 * second, unconditional release in an outer `catch`, so a crashed run could
 * unlink a claim that by then belonged to a DIFFERENT run, revoking a live
 * run's exclusion. That is "release a lock you no longer hold", the classic
 * claim-file defect.
 *
 * Two things close it, and both are here because the line deletion alone is
 * the instance fix and this project fixes the mechanism:
 *
 *   1. THIS function reads the claim and unlinks ONLY when the runId is its
 *      own, which is what `src/lock.ts` does when it verifies holdership
 *      before mutating. A release from a frame that no longer holds the claim
 *      is then a no-op rather than a revocation, whatever the call graph does.
 *   2. The call graph is also fixed, in `runGates`: exactly one release, in
 *      one `finally`, after every write into the directory. Depending on the
 *      guard alone would leave the writes happening outside the claimed
 *      region, which is the other half of the same finding.
 *
 * A claim this run does not hold is deliberately LEFT IN PLACE. Deleting
 * another run's claim is the harm; leaving a stranded one costs a human one
 * `rm`, and the refusal text says which file and why.
 */
export function releaseEvidenceDirectory(evidenceDir: string, runId: string): boolean {
  const holder = claimHolder(evidenceDir);
  if (holder !== runId) {
    return false;
  }
  try {
    unlinkSync(join(evidenceDir, RUN_CLAIM_FILE));
    return true;
  } catch {
    // Releasing a claim that is already gone is not a failure.
    return false;
  }
}

/**
 * The public entry. It exists so that NO throw can escape the runner and be
 * read as this phase's RED exit code by whatever consumes it (CR-801). The
 * runner enforces exactly this rule on its gates; it now obeys it itself.
 */
export function runGates(options: RunOptions): RunOutcome {
  const runId = randomBytes(12).toString("hex");
  try {
    return runGatesInner(options, runId);
  } catch (error) {
    // Reached only for a throw BEFORE the claim was taken, because every
    // path after it is wrapped inside the claimed region below. Nothing is
    // written here: without the claim this run does not own the directory.
    return {
      runId,
      exitCode: EXIT_GATE_ERROR,
      reason: `the gate runner failed: ${singleLine((error as Error).message ?? String(error))}`,
    };
  }
}

function writeAbortedSummary(
  options: RunOptions,
  runId: string,
  reason: string,
): void {
  if (!isRealDirectory(options.evidenceDir)) {
    return;
  }
  const summary: RunSummary = {
    runId,
    manifest: options.manifestPath,
    manifestSha256: "",
    startedAt: now(),
    endedAt: now(),
    parameters: {},
    only: options.only ?? [],
    manifestGates: 0,
    gates: [],
    counts: {
      declared: 0,
      applicable: 0,
      verdict: 0,
      green: 0,
      red: 0,
      "not-applicable": 0,
      error: 0,
      vacuous: 0,
    },
    requiredNotApplicable: [],
    aborted: true,
    exitCode: EXIT_GATE_ERROR,
    reason,
  };
  writeInsideClaim(
    options.evidenceDir,
    runId,
    join(options.evidenceDir, "summary.json"),
    `${JSON.stringify(summary, null, 2)}\n`,
  );
}

function runGatesInner(options: RunOptions, runId: string): RunOutcome {
  const cwd = options.cwd ?? process.cwd();
  const startedAt = now();

  // The evidence directory is created and CLAIMED before the manifest is
  // loaded, so that every failure from here on leaves a summary a consumer
  // can read. CR-801 member 1 (a throw during the manifest load) otherwise
  // left no directory, no summary and only an exit code, and M2-P9's harness
  // is a programmatic consumer of the bundle.
  const dirRefusal = ensureDirectory(options.evidenceDir);
  if (dirRefusal !== undefined) {
    return { runId, exitCode: EXIT_GATE_ERROR, reason: dirRefusal };
  }
  const claimRefusal = claimEvidenceDirectory(
    options.evidenceDir,
    runId,
    options.manifestPath,
  );
  if (claimRefusal !== undefined) {
    // Deliberately no write and no release: the directory belongs to the run
    // that holds the claim, and writing into it is the very thing this
    // refusal exists to prevent. What the refusal DOES carry is both run
    // ids, so a caller can tell that any summary.json there is not its own
    // (CR-861).
    return { runId, exitCode: EXIT_GATE_ERROR, reason: claimRefusal };
  }

  // EVERY WRITE INTO THE DIRECTORY HAPPENS INSIDE THIS BLOCK, and the single
  // release is its `finally` (CR-860). The aborted summary used to be written
  // by an OUTER catch, after an inner `finally` had already released, so for
  // a measured 2.13ms the run wrote into a directory it no longer owned.
  try {
    try {
      /* One load, two document shapes. A registry is projected onto a
         manifest by `loadRegistry` and everything downstream is identical,
         which is the property the promotion depends on. */
      const loaded =
        options.registry === true
          ? loadRegistry(options.manifestPath, options.mode ?? DEFAULT_MODE)
          : loadManifest(options.manifestPath);
      if (!loaded.ok) {
        const reason = [loaded.reason, ...loaded.diagnostics].join("\n");
        writeAbortedSummary(options, runId, reason);
        return { runId, exitCode: EXIT_GATE_ERROR, reason };
      }
      return runClaimedBundle(options, cwd, startedAt, runId, loaded);
    } catch (error) {
      const reason =
        `the gate runner failed: ${singleLine((error as Error).message ?? String(error))}`;
      // A failure to record must not itself throw out of the catch.
      try {
        writeAbortedSummary(options, runId, reason);
      } catch {
        // Nothing further can be recorded; the exit code and stderr remain.
      }
      return { runId, exitCode: EXIT_GATE_ERROR, reason };
    }
  } finally {
    releaseEvidenceDirectory(options.evidenceDir, runId);
  }
}

function runClaimedBundle(
  options: RunOptions,
  cwd: string,
  startedAt: string,
  runId: string,
  loaded: { manifest: GateManifest; sha256: string; declaredByChecklist?: DeclaredChecklistGate[] },
): RunOutcome {
  const manifest = loaded.manifest;
  const only = options.only ?? [];
  if (only.length > 0) {
    const known = new Set(manifest.gates.map((gate) => gate.id));
    const unknown = only.filter((id) => !known.has(id));
    if (unknown.length > 0) {
      return {
        runId,
        exitCode: EXIT_GATE_ERROR,
        reason: `--only names no such gate: ${unknown.join(", ")}`,
      };
    }
  }
  const selected =
    only.length > 0
      ? manifest.gates.filter((gate) => only.includes(gate.id))
      : manifest.gates;

  const rows: GateSummaryRow[] = [];
  const counts = {
    declared: selected.length,
    applicable: 0,
    verdict: 0,
    green: 0,
    red: 0,
    "not-applicable": 0,
    error: 0,
    vacuous: 0,
  };
  const requiredNotApplicable: string[] = [];

  for (const entry of selected) {
    const outcome = runOneGate(entry, options, cwd, options.evidenceDir, runId);
    const result = outcome.result;
    if (outcome.applicable) {
      counts.applicable += 1;
    }
    counts[result.status] += 1;
    if (result.status === "green" || result.status === "red") {
      counts.verdict += 1;
    }
    if (result.vacuous === true) {
      counts.vacuous += 1;
    }
    if (result.status === "not-applicable" && entry.applicability === "required") {
      requiredNotApplicable.push(entry.id);
    }
    // The runner owns the record on disk whenever it produced or changed
    // one: a not-applicable gate never ran and wrote nothing, and a rewritten
    // vacuous green must not stay green in the evidence (criterion 4).
    const recordPath = outcome.recordPath ?? join(options.evidenceDir, entry.id, "result.json");
    // CR-900 row 1b. Same mutation, second call site.
    const dirRefusalForGate = mkdirInsideClaim(
      options.evidenceDir,
      runId,
      join(options.evidenceDir, entry.id),
    );
    if (dirRefusalForGate === undefined) {
      writeInsideClaim(
        options.evidenceDir,
        runId,
        recordPath,
        renderGateResult(result),
      );
    }
    rows.push({
      id: entry.id,
      status: result.status,
      units: result.units,
      unitLabel: result.unitLabel,
      vacuous: result.vacuous === true,
      applicable: outcome.applicable,
      detail: result.detail,
      record: dirRefusalForGate === undefined ? recordPath : undefined,
      stdout: outcome.stdoutPath,
      stderr: outcome.stderrPath,
    });
  }

  const decided = decideAggregate(counts, requiredNotApplicable, rows);
  const exitCode = decided.exitCode;
  const reason = decided.reason;

  const parameters: RunSummary["parameters"] = {};
  if (options.base !== undefined) {
    parameters.base = options.base;
  }
  if (options.head !== undefined) {
    parameters.head = options.head;
  }
  if (options.phase !== undefined) {
    parameters.phase = options.phase;
  }

  const summary: RunSummary = {
    runId,
    manifest: options.manifestPath,
    ...(options.registry === true
      ? {
          registry: true,
          mode: options.mode ?? DEFAULT_MODE,
          declaredByChecklist: loaded.declaredByChecklist ?? [],
        }
      : {}),
    manifestSha256: loaded.sha256,
    startedAt,
    endedAt: now(),
    parameters,
    only,
    manifestGates: manifest.gates.length,
    gates: rows,
    counts,
    requiredNotApplicable,
    aborted: false,
    exitCode,
    reason,
  };
  const summaryPath = join(options.evidenceDir, "summary.json");
  const summaryRefusal = writeSummaryAtomically(
    options.evidenceDir,
    summaryPath,
    runId,
    summary,
  );
  if (summaryRefusal !== undefined) {
    return { runId, exitCode: EXIT_GATE_ERROR, summary, reason: summaryRefusal };
  }
  return { runId, exitCode, summary, reason };
}
