import { spawnSync } from "node:child_process";
import { existsSync, writeFileSync } from "node:fs";
import { isAbsolute, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { EX_USAGE } from "../cli.ts";
import { pathsIdentifySameObject } from "../path-identity.ts";
import {
  readRegularFileIfPresent,
  refuseOpenForWrite,
  runStep,
  singleLine,
} from "../task.ts";
import { decodeDocument } from "../validate.ts";
import { formatDiagnostics, loadSchema, validate } from "./validate.ts";
import type { SchemaDocument } from "./validate.ts";
import {
  EXIT_GATE_ERROR,
  exitCodeForStatus,
  makeGateResult,
  renderGateResult,
} from "./result.ts";
import type { GateResultFields, GateStatus } from "./result.ts";

/**
 * THE GATE CLASS VOCABULARY (kernel plan M4, M4-P14; DR-0029 part 2a; R-041).
 *
 * TWO gate ids out of one module, the shape src/gates/credentials.ts already
 * ships for `credential-scrub` and `credential-token`. The first argument is
 * the gate id.
 *
 *   `gate-classes`  the check DR-0029 promised: a PHASE declares at least one
 *                   gate in each required class, or declares an escape that is
 *                   DATA rather than silence.
 *   `typecheck`     R-041, retargeted by M4-P13 under DR-0028: the kernel is
 *                   just another project under the scheme, so the kernel's OWN
 *                   registry declares the command that satisfies `correctness`
 *                   alongside `suite`. The kernel ships the class; the project
 *                   ships the command.
 *
 * WHY ONE MODULE AND NOT TWO. Plan section 3.3.2 authorises exactly one new
 * source file for this phase (`src/gates/gate-classes.ts`), and the scope
 * auditor reads that list literally. `credentials.ts` is the delivered
 * precedent for two gate ids behind one entry point, so this follows it rather
 * than widening the declaration. Recorded in delivery/work-history/m4-p14.md
 * as a content-level deviation from the READING that one gate means one file,
 * which the plan never actually says.
 *
 * ================= THE CLASS CHECK =================
 *
 * DR-0029 states the required classes and the two escapes:
 *
 *   correctness   something executable that fails when the code is wrong
 *   scope         the change is the change that was promised
 *   review        an independent read happened, with a recorded verdict
 *
 * A class is satisfied by naming one or more gate ids that this repository's
 * own registry declares, OR by `not-applicable` WITH a recorded reason, OR by
 * `not-yet-establishable` NAMING the phase that will establish it. The second
 * is an IOU with a due date, not a waiver.
 *
 * THE PROPERTY BEING PROTECTED, in DR-0029's words: you can start from
 * nothing; you can never SILENTLY have nothing. So an escape is not refused,
 * it is PRINTED BY NAME on the green arm, which is the same trade
 * src/gates/scope.ts's M3-P11 change B makes for a declaration addition. A
 * reviewer who does not read the printed line gets no protection from it.
 *
 * THIS CHECK JUDGES NAMING, NEVER ASSERTING, AND SAYING SO IS PART OF ITS JOB
 * (CR-FS-GATES-01, the DR-0047 final sweep). It establishes that a phase NAMES
 * a registered gate for each required class. It does not, and from here cannot,
 * establish that the named gate was APPLICABLE on the head under audit, because
 * that is a fact about a run and this reads a declaration. Measured at the swept
 * head, one phase, two commands:
 *
 *   gate-classes --phase m4-p28   ->  green, "review: asserted by check-dual-review", exit 0
 *   check-dual-review --precondition .  ->  exit 1, "0 verdict document(s)"
 *
 * Two carve-outs, each correct on its own, composing into the state DR-0029
 * forbids: a declaration check SHOULD check declarations, and a gate with no
 * subject SHOULD report not-applicable, and `check-dual-review` is
 * `applicability: conditional` so its vacuity never reddens the bundle either.
 * All 17 declarations carrying `gateClasses` satisfy `review` with exactly
 * `{"gates":["check-dual-review"]}`.
 *
 * THE ANSWER IS DISCLOSURE, NOT REFUSAL, and the choice is the module's own
 * existing trade rather than a new one. Refusing a class satisfied only by a
 * conditional gate would redden 17 landed declarations over a property this
 * command cannot measure. So a class satisfied by a gate that is CONDITIONAL in
 * the registry is named on the green arm, exactly as a declared escape is, and
 * the sentence says that the named gate's applicability was not checked here. A
 * reviewer who reads the line can then go and look; a reader of the old line
 * could not know there was anything to look at.
 *
 * WHY A BAD DECLARATION IS `red` AND A BAD REGISTRY IS `error`, because
 * M2-C-3 makes that distinction load-bearing. A declaration that does not
 * parse, does not validate, or names a class with no disposition is a DEFECT
 * IN THE SUBJECT: the check reached a verdict about the thing it audits, and
 * that verdict is red. A registry that cannot be read is an INSTRUMENT
 * failure: the set of legal gate ids is unknown, so no verdict about the
 * declaration's gate names can be reached at all, and that is `error`, never
 * a green with the id check quietly skipped.
 *
 * WHERE THE DECLARATION IS READ FROM, and it is deliberately NOT the merge
 * base. src/gates/scope.ts reads the merge base because its declaration
 * GRANTS scope and a branch must not widen its own grant. This check grants
 * nothing: it only requires a phase to say, out loud and in a committed file,
 * what asserts each class. Reading the working tree is what lets a phase fix
 * its own declaration and see the result before pushing, and the disclosure
 * on the green arm is what a reviewer reads either way.
 *
 * ================= THE TYPECHECK GATE =================
 *
 * `tsc -b <projects> --force --listFiles`, and both halves of that command
 * are there for a reason.
 *
 *   `--force`   without it the build is incremental and the file list depends
 *               on what happened to be up to date, so the unit count would
 *               vary with the state of `dist/` rather than with the code.
 *               Measured on this repository at one head: 308 lines when warm,
 *               657 lines with --force, three --force runs all 657.
 *   `--listFiles`  the unit count is DERIVED FROM A NUMBER THE COMPILER
 *               PRINTS (plan criterion 3), never a constant: it is the count
 *               of distinct paths tsc reported it read. A constant, or a
 *               count of the gate's own argv, would be green on a compiler
 *               that checked nothing.
 *
 * A compiler that prints NO file list is `error`, not green with zero units:
 * M2-C-2 would rewrite the green anyway, and saying so here makes the reason
 * legible instead of arriving as a vacuity rewrite.
 */

/* -------------------------------------------------------------------- */
/* Shared plumbing                                                       */
/* -------------------------------------------------------------------- */

const GATE_IDS = ["gate-classes", "typecheck"] as const;
type GateId = (typeof GATE_IDS)[number];

const USAGE =
  "usage: node src/gates/gate-classes.ts gate-classes --declarations <dir> " +
  "--registry <file> --result <file> [--evidence <dir>] --phase <id>\n" +
  "       node src/gates/gate-classes.ts typecheck --result <file> " +
  "[--evidence <dir>] --project <tsconfig> [--project <tsconfig> ...]";

interface Flags {
  declarations?: string;
  registry?: string;
  result?: string;
  evidence?: string;
  phase?: string;
  project: string[];
}

const SINGLE_VALUE_FLAGS = [
  "--declarations",
  "--registry",
  "--result",
  "--evidence",
  "--phase",
] as const;

function parseFlags(args: string[]): Flags | undefined {
  const flags: Flags = { project: [] };
  for (let index = 0; index < args.length; index += 1) {
    const flag = args[index];
    const value = args[index + 1];
    if (flag === undefined) {
      return undefined;
    }
    if (value === undefined || value.startsWith("--")) {
      return undefined;
    }
    if (flag === "--project") {
      flags.project.push(value);
      index += 1;
      continue;
    }
    if (!(SINGLE_VALUE_FLAGS as readonly string[]).includes(flag)) {
      return undefined;
    }
    const key = flag.slice(2) as "declarations" | "registry" | "result" | "evidence" | "phase";
    flags[key] = value;
    index += 1;
  }
  return flags;
}

function usageError(message?: string): number {
  if (message !== undefined) {
    process.stderr.write(`tiphys gates gate-classes: ${message}\n`);
  }
  process.stderr.write(`${USAGE}\n`);
  return EX_USAGE;
}

function now(): string {
  return new Date().toISOString();
}

/** Write the record, print the one-line summary, and return the exit code. */
function emit(gateId: string, resultPath: string, fields: GateResultFields): number {
  const result = makeGateResult(fields);
  const refusal = refuseOpenForWrite(resultPath);
  if (refusal !== undefined) {
    process.stderr.write(`tiphys gates ${gateId}: ${refusal}\n`);
    return EXIT_GATE_ERROR;
  }
  const written = runStep(`writing ${resultPath}`, () =>
    writeFileSync(resultPath, renderGateResult(result)),
  );
  if (!written.ok) {
    process.stderr.write(`tiphys gates ${gateId}: ${written.reason}\n`);
    return EXIT_GATE_ERROR;
  }
  const status: GateStatus = result.status;
  process.stdout.write(`${result.gate}: ${status} (${String(result.units)} ${result.unitLabel})\n`);
  if (result.detail !== "") {
    process.stdout.write(`${result.detail}\n`);
  }
  return exitCodeForStatus(status);
}

/* -------------------------------------------------------------------- */
/* The class check                                                       */
/* -------------------------------------------------------------------- */

/** DR-0029's three required classes, in the order the record reports them. */
const REQUIRED_CLASSES = ["correctness", "scope", "review"] as const;
type RequiredClass = (typeof REQUIRED_CLASSES)[number];

const CLASS_UNIT_LABEL = "declared gate classes checked";
const PHASE_ID_PATTERN = /^M[0-9]+-P[0-9]+$/;

interface ClassDeclaration {
  gates?: string[];
  status?: string;
  reason?: string;
  establishedBy?: string;
}

interface PhaseDeclarationDocument {
  id: string;
  branch: string;
  filesToTouch: string[];
  declaredExtras: string[];
  citations: string[];
  gateClasses?: Partial<Record<RequiredClass, ClassDeclaration>>;
}

const schemaDirectory = new URL("./schemas/", import.meta.url);
let cachedSchema: SchemaDocument | undefined;

/** M2-C-6: the schema document is opened through the delivered primitive. */
function declarationSchema(): SchemaDocument {
  if (cachedSchema !== undefined) {
    return cachedSchema;
  }
  const path = fileURLToPath(new URL("phase-declaration.schema.json", schemaDirectory));
  const read = readRegularFileIfPresent(path);
  if (read.kind !== "read") {
    throw new Error(
      read.kind === "absent"
        ? `schema document ${path} is missing from this installation`
        : read.reason,
    );
  }
  const loaded = loadSchema(JSON.parse(read.body) as unknown, "phase-declaration.schema.json");
  if (!loaded.ok) {
    throw new Error(loaded.reason);
  }
  cachedSchema = loaded.schema;
  return cachedSchema;
}

type RegistryIdsResult =
  | { ok: true; ids: Set<string>; conditional: Set<string> }
  | { ok: false; reason: string };

/**
 * The legal gate ids: every entry of this repository's own registry.
 *
 * A failure here is `error` at the call site and never a skipped check. The
 * registry is DECODED rather than JSON-parsed because it ships as YAML and
 * `decodeDocument` is the delivered decoder for both (DR-0013 YAML clause 3).
 */
function registryGateIds(path: string): RegistryIdsResult {
  const read = readRegularFileIfPresent(path);
  if (read.kind === "absent") {
    return { ok: false, reason: `gate registry ${path} does not exist` };
  }
  if (read.kind === "refused") {
    return { ok: false, reason: read.reason };
  }
  const decoded = decodeDocument(read.body, path);
  if (!decoded.ok) {
    return { ok: false, reason: decoded.reason };
  }
  const gates = (decoded.value as { gates?: unknown }).gates;
  if (!Array.isArray(gates)) {
    return { ok: false, reason: `gate registry ${path} declares no gates array` };
  }
  const ids = new Set<string>();
  /* CR-FS-GATES-01. The APPLICABILITY is read here because it is the one fact
     about a named gate this command can establish from the registry it is
     already parsing. It is never used to REFUSE a class: it is carried out so
     the green sentence can name which of the phase's chosen gates can report
     not-applicable without reddening anything. */
  const conditional = new Set<string>();
  for (const entry of gates) {
    const id = (entry as { id?: unknown } | null)?.id;
    if (typeof id === "string" && id !== "") {
      ids.add(id);
      if ((entry as { applicability?: unknown } | null)?.applicability === "conditional") {
        conditional.add(id);
      }
    }
  }
  if (ids.size === 0) {
    return { ok: false, reason: `gate registry ${path} declares no usable gate id` };
  }
  return { ok: true, ids, conditional };
}

interface ClassVerdict {
  name: RequiredClass;
  ok: boolean;
  /** One sentence, printed on either arm. */
  sentence: string;
  /** True when this class is satisfied by a declared escape rather than a gate. */
  escape: boolean;
  /**
   * The gate ids this class names that are `applicability: conditional`.
   *
   * NOT A FAILURE AND NOT AN ESCAPE, which is why it is a third field rather
   * than a reuse of either (CR-FS-GATES-01). A conditional gate is a legitimate
   * satisfier; what a reader is owed is that it can report not-applicable at a
   * head and that nothing here checked whether it did.
   */
  conditionalGates: string[];
}

/**
 * Judge ONE class. Every red arm names the class, so the detail a reader sees
 * says which of the three is wrong rather than only that something is.
 */
function judgeClass(
  name: RequiredClass,
  entry: ClassDeclaration | undefined,
  knownGateIds: Set<string>,
  conditionalGateIds: Set<string> = new Set<string>(),
): ClassVerdict {
  if (entry === undefined) {
    return {
      name,
      ok: false,
      sentence: `${name}: MISSING, the declaration names no disposition for this required class`,
      escape: false,
      conditionalGates: [],
    };
  }
  const hasGates = Array.isArray(entry.gates) && entry.gates.length > 0;
  const hasStatus = typeof entry.status === "string" && entry.status !== "";
  if (hasGates && hasStatus) {
    return {
      name,
      ok: false,
      sentence:
        `${name}: AMBIGUOUS, it names gate(s) ${(entry.gates as string[]).join(", ")} and also ` +
        `status ${String(entry.status)}; a class is asserted by a gate or excused by a status, never both`,
      escape: false,
      conditionalGates: [],
    };
  }
  if (hasGates) {
    const named = entry.gates as string[];
    const unknown = named.filter((id) => !knownGateIds.has(id));
    if (unknown.length > 0) {
      return {
        name,
        ok: false,
        sentence:
          `${name}: names gate id(s) ${unknown.join(", ")} that this repository's gate registry ` +
          "does not declare, so nothing runs for this class",
        escape: false,
        conditionalGates: [],
      };
    }
    /* CR-FS-GATES-01. The per-class SENTENCE is unchanged, deliberately: it
       says what the declaration says, and this check judges the declaration.
       The disclosure is a TRAILING note built by `runClassGate`, beside the
       declared-escape note it is a sibling of, for two reasons. It keeps one
       disclosure idiom rather than two, and it keeps every committed capture of
       this gate's detail a PREFIX of the new one, so the existing witnesses
       still assert what they were taken to assert instead of being re-recorded
       to match a change they were supposed to be independent of. */
    const conditional = named.filter((id) => conditionalGateIds.has(id));
    return {
      name,
      ok: true,
      sentence: `${name}: asserted by ${named.join(", ")}`,
      escape: false,
      conditionalGates: conditional,
    };
  }
  if (!hasStatus) {
    return {
      name,
      ok: false,
      sentence:
        `${name}: declares neither a gate nor a status, which is the SILENT nothing DR-0029 ` +
        "exists to refuse",
      escape: false,
      conditionalGates: [],
    };
  }
  if (entry.status === "not-applicable") {
    const reason = typeof entry.reason === "string" ? entry.reason.trim() : "";
    if (reason === "") {
      return {
        name,
        ok: false,
        sentence: `${name}: not-applicable with no recorded reason; the reason is what makes it data rather than silence`,
        escape: false,
        conditionalGates: [],
      };
    }
    return {
      name,
      ok: true,
      sentence: `${name}: DECLARED not-applicable, reason: ${reason}`,
      escape: true,
      conditionalGates: [],
    };
  }
  if (entry.status === "not-yet-establishable") {
    const by = typeof entry.establishedBy === "string" ? entry.establishedBy.trim() : "";
    if (by === "") {
      return {
        name,
        ok: false,
        sentence:
          `${name}: not-yet-establishable naming no establishing phase; an IOU with no due date ` +
          "is a waiver, which DR-0029 does not grant",
        escape: false,
        conditionalGates: [],
      };
    }
    if (!PHASE_ID_PATTERN.test(by)) {
      return {
        name,
        ok: false,
        sentence:
          `${name}: not-yet-establishable names establishedBy ${by}, which is not a phase id of ` +
          "the form M<n>-P<n>",
        escape: false,
        conditionalGates: [],
      };
    }
    return {
      name,
      ok: true,
      sentence: `${name}: DECLARED not-yet-establishable, to be established by ${by}`,
      escape: true,
      conditionalGates: [],
    };
  }
  return {
    name,
    ok: false,
    sentence: `${name}: declares unknown status ${String(entry.status)}`,
    escape: false,
    conditionalGates: [],
  };
}

function runClassGate(flags: Flags): number {
  const startedAt = now();
  const resultPath = flags.result as string;
  const phase = flags.phase as string;
  const declarationsDir = flags.declarations as string;
  const registryPath = flags.registry as string;
  const shared = { gate: "gate-classes", unitLabel: CLASS_UNIT_LABEL, startedAt };

  const relPath = `${declarationsDir.replace(/\/+$/, "")}/${phase}.json`;
  const absolute = isAbsolute(relPath) ? relPath : resolve(process.cwd(), relPath);

  const registryIds = registryGateIds(
    isAbsolute(registryPath) ? registryPath : resolve(process.cwd(), registryPath),
  );
  if (!registryIds.ok) {
    // INSTRUMENT failure, not a verdict about the subject (M2-C-3).
    return emit("gate-classes", resultPath, {
      ...shared,
      status: "error",
      units: 0,
      endedAt: now(),
      detail:
        `the set of legal gate ids could not be established: ${registryIds.reason}; refusing to ` +
        "report on a declaration's gate names without knowing which names exist",
    });
  }

  const read = readRegularFileIfPresent(absolute);
  if (read.kind === "absent") {
    return emit("gate-classes", resultPath, {
      ...shared,
      status: "red",
      units: 0,
      endedAt: now(),
      detail:
        `phase ${phase} has no declaration at ${relPath}, so it declares no gate class at all; ` +
        `DR-0029 requires a disposition for ${REQUIRED_CLASSES.join(", ")}`,
    });
  }
  if (read.kind === "refused") {
    return emit("gate-classes", resultPath, {
      ...shared,
      status: "error",
      units: 0,
      endedAt: now(),
      detail: read.reason,
    });
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(read.body);
  } catch (error) {
    return emit("gate-classes", resultPath, {
      ...shared,
      status: "red",
      units: 0,
      endedAt: now(),
      detail: `declaration ${relPath} does not parse as JSON: ${singleLine((error as Error).message)}`,
    });
  }
  const diagnostics = formatDiagnostics(validate(declarationSchema(), parsed));
  if (diagnostics.length > 0) {
    return emit("gate-classes", resultPath, {
      ...shared,
      status: "red",
      units: 0,
      endedAt: now(),
      detail: `declaration ${relPath} is not a valid phase declaration: ${diagnostics.join("; ")}`,
    });
  }
  const declaration = parsed as PhaseDeclarationDocument;
  if (phase.toUpperCase() !== declaration.id) {
    return emit("gate-classes", resultPath, {
      ...shared,
      status: "red",
      units: 0,
      endedAt: now(),
      detail:
        `--phase ${phase} does not match declaration ${relPath}'s own id ${declaration.id}; ` +
        "refusing to report class coverage for a phase against another phase's declaration",
    });
  }

  const classes = declaration.gateClasses;
  const verdicts = REQUIRED_CLASSES.map((name) =>
    judgeClass(
      name,
      classes === undefined ? undefined : classes[name],
      registryIds.ids,
      registryIds.conditional,
    ),
  );
  const failed = verdicts.filter((verdict) => !verdict.ok);
  const escapes = verdicts.filter((verdict) => verdict.ok && verdict.escape);
  const conditionallySatisfied = verdicts.filter(
    (verdict) => verdict.ok && verdict.conditionalGates.length > 0,
  );
  const units = verdicts.length;

  if (failed.length > 0) {
    return emit("gate-classes", resultPath, {
      ...shared,
      status: "red",
      units,
      endedAt: now(),
      detail:
        `phase ${declaration.id} fails ${String(failed.length)} of ${String(units)} required gate ` +
        `class(es) in ${relPath}: ${failed.map((verdict) => verdict.sentence).join("; ")}`,
    });
  }

  // THE DISCLOSURE, and it is on the GREEN arm on purpose. An escape is
  // allowed by DR-0029 and is the thing a reviewer must actually read, so it
  // is named here rather than being visible only as an absence.
  const escapeNote =
    escapes.length === 0
      ? ""
      : `; ${String(escapes.length)} class(es) satisfied by a DECLARED ESCAPE rather than a gate, ` +
        "which a reviewer signs off rather than the gate refusing: " +
        escapes.map((verdict) => verdict.name).join(", ");
  /* THE SECOND DISCLOSURE, AND IT IS ON THE GREEN ARM FOR THE SAME REASON AS
     THE FIRST (CR-FS-GATES-01). A class whose only satisfier is a conditional
     gate is DECLARED correctly and may still have had nothing run for it at
     this head, and the composition of those two correct behaviours is the
     silent nothing DR-0029 forbids. Naming it here does not make the gate
     assert anything; it makes the reviewer's signature informed. */
  const conditionalNote =
    conditionallySatisfied.length === 0
      ? ""
      : `; ${String(conditionallySatisfied.length)} class(es) are satisfied ONLY BY NAMING a gate, and ` +
        "this check never establishes that the named gate asserted anything on this head: " +
        conditionallySatisfied
          .map((verdict) => `${verdict.name} -> ${verdict.conditionalGates.join(", ")}`)
          .join("; ");
  return emit("gate-classes", resultPath, {
    ...shared,
    status: "green",
    units,
    endedAt: now(),
    detail:
      `phase ${declaration.id} declares all ${String(units)} required gate class(es) in ${relPath}: ` +
      `${verdicts.map((verdict) => verdict.sentence).join("; ")}${escapeNote}${conditionalNote}`,
  });
}

/* -------------------------------------------------------------------- */
/* The typecheck gate                                                    */
/* -------------------------------------------------------------------- */

const TYPECHECK_UNIT_LABEL = "source files type-checked";
/** `<path>(<line>,<col>): error TS<n>:` is the compiler's own diagnostic shape. */
const TSC_ERROR_LINE = /error TS[0-9]+:/;

interface CompilerReading {
  files: string[];
  errors: string[];
}

/** Split a real `tsc --listFiles` capture into its file list and its errors. */
function readCompilerOutput(text: string): CompilerReading {
  const files: string[] = [];
  const errors: string[] = [];
  const seen = new Set<string>();
  for (const raw of text.split("\n")) {
    const line = raw.trim();
    if (line === "") {
      continue;
    }
    if (TSC_ERROR_LINE.test(line)) {
      errors.push(line);
      continue;
    }
    if (!seen.has(line)) {
      seen.add(line);
      files.push(line);
    }
  }
  return { files, errors };
}

function runTypecheckGate(flags: Flags): number {
  const startedAt = now();
  const resultPath = flags.result as string;
  const shared = { gate: "typecheck", unitLabel: TYPECHECK_UNIT_LABEL, startedAt };
  const projects = flags.project;

  const compiler = join(process.cwd(), "node_modules", "typescript", "bin", "tsc");
  if (!existsSync(compiler)) {
    return emit("typecheck", resultPath, {
      ...shared,
      status: "error",
      units: 0,
      endedAt: now(),
      detail:
        `the TypeScript compiler is not installed at ${compiler}; this gate asserts nothing ` +
        "without it and reports error rather than a green that measured no project",
    });
  }

  const run = spawnSync(
    process.execPath,
    [compiler, "-b", ...projects, "--force", "--listFiles"],
    { encoding: "utf8", cwd: process.cwd() },
  );
  if (run.error !== undefined) {
    return emit("typecheck", resultPath, {
      ...shared,
      status: "error",
      units: 0,
      endedAt: now(),
      detail: `the compiler could not be run: ${singleLine(String(run.error))}`,
    });
  }
  const reading = readCompilerOutput(`${run.stdout ?? ""}\n${run.stderr ?? ""}`);
  const units = reading.files.length;

  if (reading.errors.length > 0 || run.status !== 0) {
    const named = reading.errors.slice(0, 5);
    return emit("typecheck", resultPath, {
      ...shared,
      status: "red",
      units,
      endedAt: now(),
      detail:
        `tsc -b ${projects.join(" ")} exited ${String(run.status)} with ` +
        `${String(reading.errors.length)} diagnostic(s): ` +
        (named.length === 0
          ? "the compiler printed no diagnostic line, so the nonzero exit is the whole evidence"
          : named.map((line) => singleLine(line)).join(" | ")),
    });
  }
  if (units === 0) {
    // A green with zero units is rewritten by makeGateResult anyway; saying it
    // here makes the CAUSE legible rather than arriving as a vacuity rewrite.
    return emit("typecheck", resultPath, {
      ...shared,
      status: "error",
      units: 0,
      endedAt: now(),
      detail:
        `tsc -b ${projects.join(" ")} --listFiles printed no file, so nothing was counted and ` +
        "this gate asserts nothing about the code",
    });
  }
  return emit("typecheck", resultPath, {
    ...shared,
    status: "green",
    units,
    endedAt: now(),
    detail:
      `tsc -b ${projects.join(" ")} --force --listFiles exited 0 and reported ${String(units)} ` +
      "distinct file(s); the unit count is those printed paths, not a constant",
  });
}

/* -------------------------------------------------------------------- */
/* Entry point                                                           */
/* -------------------------------------------------------------------- */

export function main(argv: string[]): number {
  const gateId = argv[0];
  if (gateId === undefined || !(GATE_IDS as readonly string[]).includes(gateId)) {
    return usageError(
      `expected a gate id: ${GATE_IDS.join(" or ")}${gateId === undefined ? "" : `, saw ${gateId}`}`,
    );
  }
  const flags = parseFlags(argv.slice(1));
  if (flags === undefined) {
    return usageError();
  }
  if (flags.result === undefined) {
    return usageError(`${gateId} requires --result`);
  }
  if ((gateId as GateId) === "gate-classes") {
    const missing = (["declarations", "registry", "phase"] as const).filter(
      (name) => flags[name] === undefined,
    );
    if (missing.length > 0) {
      return usageError(
        `gate-classes requires ${missing.map((name) => `--${name}`).join(" ")}`,
      );
    }
    return runClassGate(flags);
  }
  if (flags.project.length === 0) {
    return usageError("typecheck requires at least one --project");
  }
  return runTypecheckGate(flags);
}

const entry = process.argv[1];
if (entry !== undefined && pathsIdentifySameObject(fileURLToPath(import.meta.url), entry)) {
  // The same second layer src/gates/scope.ts carries: an uncaught throw would
  // exit 1, which is EXIT_RED, and a crash reported as a red verdict is
  // indistinguishable from a real one to a consumer reading the exit code.
  try {
    process.exitCode = main(process.argv.slice(2));
  } catch (error) {
    process.stderr.write(
      `tiphys gates gate-classes: ${singleLine((error as Error).message ?? String(error))}\n`,
    );
    process.exitCode = EXIT_GATE_ERROR;
  }
}

export { judgeClass, readCompilerOutput, registryGateIds, REQUIRED_CLASSES };
export type { ClassDeclaration, ClassVerdict, RequiredClass };
