/**
 * THE DUAL-REVIEW DECORRELATION CHECK (kernel plan M3, M3-P9 step 3b,
 * criteria 7 and 7b; M3R-004, DR-0012, T-001, T-007).
 *
 * The orchestrator's `decorrelated-review` duty, made into a command with an
 * exit code. A kernel that can REPRESENT the delegated-merge regime but cannot
 * DETECT a run that quietly used one model family twice reproduces the exact
 * failure class T-001 exists to prevent, this time invisible because the
 * kernel's own artifacts never looked.
 *
 * THE COMPARISON IS NOT HERE. It is the Kind B derived check
 * `dual-review-decorrelation` in `src/checks.ts`, registered for artifact type
 * `verdict`, and this script is only the runner around it. That split is what
 * makes criterion 7's last direction a real witness rather than a simulated
 * one: DEREGISTERING the check makes the shared-family fixture pass, because
 * there is then nothing left that would object to it, and that is the shape
 * section 2.3 rule 3 asks a Kind B criterion to be falsified by.
 *
 * IT RUNS EXACTLY ONE CHECK, BY ID, AND THAT IS DELIBERATE. `runChecks` would
 * run every check registered for `verdict`, including the three cross-document
 * COMPLETENESS checks M3-P7 ships, which resolve `plan.yaml` and
 * `work-history.yaml` out of the context. Those are real rules and they are not
 * this gate's question; a script named for dual review that failed because a
 * plan document was absent would be reporting the wrong thing. So the check is
 * selected by id out of `registeredChecks()`, and how many checks were selected
 * is PRINTED, because "the guard ran and found nothing" and "no guard ran" must
 * not print the same line (SC-011).
 *
 * THE DIRECTORY IS WHAT SCOPES A SET OF VERDICTS TO ONE HEAD. Criterion 7 says
 * "two verdicts for one head", and `schemas/verdict.schema.json` carries no head
 * field: its join key is `phase`, and that schema belongs to M3-P7 and is not on
 * this phase's declaration. So the operator points this at the directory holding
 * one head's committed reviews and verdicts are grouped inside it by `phase`.
 * That reading is declared in delivery/work-history/m3-p9.md rather than
 * absorbed silently.
 *
 * TWO ARMS, and the second exists because of the gate contract rather than the
 * criterion. `--precondition <dir>` answers only "is there any verdict document
 * to compare", which is what `gate-registry.yaml` declares as this gate's
 * precondition: a merged head has no pair of verdicts, and a gate that cannot
 * reach a verdict must report not-applicable WITH A REASON rather than green,
 * which is M2-C-3 and SC-011 applied to M3's own check.
 */

import { mkdirSync, readdirSync, writeFileSync } from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";
import { dirname, join, resolve } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, "..");

const resultModule = await import(
  pathToFileURL(join(repoRoot, "src", "gates", "result.ts")).href
);
const taskModule = await import(
  pathToFileURL(join(repoRoot, "src", "task.ts")).href
);
const validateModule = await import(
  pathToFileURL(join(repoRoot, "src", "validate.ts")).href
);
const checksModule = await import(
  pathToFileURL(join(repoRoot, "src", "checks.ts")).href
);
const { makeGateResult, renderGateResult, exitCodeForStatus } = resultModule;
const { refuseOpenForWrite, classifyEntry } = taskModule;
const { decodeDocument, readOperatorPath } = validateModule;
const { registeredChecks } = checksModule;

const GATE_ID = "check-dual-review";
const UNIT_LABEL = "review verdicts examined for decorrelation";
const CHECK_ID = "dual-review-decorrelation";
const EXIT_NOT_APPLICABLE = 20;
const EXIT_GATE_ERROR = 21;

/** Where a project's committed review verdicts live (DR-0012 condition 1). */
const REVIEW_DIRECTORY = join("delivery", "review");

function usage() {
  return (
    "usage: node scripts/check-dual-review.mjs [--precondition] <dir> " +
    "[--result <path>] [--evidence <dir>]"
  );
}

function parseArgs(argv) {
  const options = {
    directory: undefined,
    precondition: false,
    result: undefined,
    evidence: undefined,
  };
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === "--precondition") {
      options.precondition = true;
      continue;
    }
    if (argument === "--result" || argument === "--evidence") {
      const value = argv[index + 1];
      if (value === undefined || value.startsWith("--")) {
        return { usageError: `${argument} requires a value` };
      }
      options[argument.slice(2)] = value;
      index += 1;
      continue;
    }
    if (argument.startsWith("--")) {
      return { usageError: `unknown option ${String(argument)}` };
    }
    if (options.directory !== undefined) {
      return { usageError: "exactly one directory argument is accepted" };
    }
    options.directory = argument;
  }
  if (options.directory === undefined) {
    return { usageError: "a directory argument is required" };
  }
  return { options };
}

/**
 * Every verdict document committed under `<dir>/delivery/review/`.
 *
 * Deliberately the same selection rule the derived check uses: a `.yaml`,
 * `.yml` or `.json` file that decodes and carries `kind: verdict`. That
 * directory also holds prose reviews in this repository, so anything else is
 * skipped rather than reported.
 */
export function committedVerdictPaths(directory) {
  const reviewDirectory = join(directory, REVIEW_DIRECTORY);
  const entry = classifyEntry(reviewDirectory);
  if (entry.kind === "absent" || entry.kind === "dangling") {
    return { ok: true, paths: [] };
  }
  if (entry.kind === "unexaminable") {
    return { ok: false, reason: entry.reason };
  }
  let names;
  try {
    names = readdirSync(reviewDirectory);
  } catch (error) {
    if (entry.kind === "regular") {
      return {
        ok: false,
        reason: `${reviewDirectory} is a regular file, not a directory`,
      };
    }
    return { ok: false, reason: `${reviewDirectory} could not be listed: ${String(error)}` };
  }
  const paths = [];
  for (const name of names.sort()) {
    if (!/\.(ya?ml|json)$/i.test(name)) {
      continue;
    }
    const path = join(reviewDirectory, name);
    const read = readOperatorPath(path);
    if (!read.ok) {
      continue;
    }
    const decoded = decodeDocument(read.body, path);
    if (!decoded.ok) {
      continue;
    }
    const value = decoded.value;
    if (
      value === null ||
      typeof value !== "object" ||
      Array.isArray(value) ||
      value["kind"] !== "verdict"
    ) {
      continue;
    }
    paths.push({ path, instance: value });
  }
  return { ok: true, paths };
}

/**
 * Run the decorrelation check over every committed verdict in one directory.
 *
 * EXPORTED so `test/dual-review.test.ts` can deregister the check and call this
 * again IN PROCESS, which is criterion 7's Kind B witness. A witness that
 * re-implemented the loop in the test would be asserting about a copy.
 */
/**
 * The documents that say WHICH merge-authority regime is in force, and which
 * this caller therefore cannot proceed without.
 *
 * THIS IS WHERE THE FAIL-CLOSED TEETH LIVE, and it is a deliberate move rather
 * than the original design. The derived check treats an ABSENT charter as
 * "this context declares no delivery mode" and reports it, because it runs on
 * any verdict with any context and a verdict fixture directory is not a project
 * workspace. THIS caller is different: it is the command DR-0012's grant runs
 * through, and a merge check that cannot determine the regime must never report
 * green. So the refusal is here, where the merge decision is made, and not in a
 * check that has to be usable somewhere else.
 */
const REGIME_DOCUMENTS = ["charter.yaml", "assurance-modes.yaml"];

export function evaluate(directory) {
  for (const document of REGIME_DOCUMENTS) {
    if (classifyEntry(join(directory, document)).kind === "absent") {
      return {
        status: "error",
        units: 0,
        checksRun: 0,
        lines: [
          `${join(directory, document)} does not exist, so the declared mode's merge-authority ` +
            `is unknown and no decorrelation verdict can be reached; a merge check that cannot ` +
            `determine the regime reports error, never green`,
        ],
      };
    }
  }
  const found = committedVerdictPaths(directory);
  if (!found.ok) {
    return { status: "error", units: 0, lines: [found.reason], checksRun: 0 };
  }
  const selected = registeredChecks().filter((check) => check.id === CHECK_ID);
  /* DEDUPLICATED, and the reason is a property of the rule rather than tidiness.
     Decorrelation is a property of a SET, so every verdict in a group reports
     the same violation about the same pair, and a two-verdict group would print
     each finding twice. What a reader needs is the DISTINCT set of things wrong
     with this directory. The per-verdict provenance is kept in the line so
     nothing is lost: the same violation seen from two verdicts differs in its
     trailing path and stays two lines. */
  const seen = new Set();
  const lines = [];
  const violations = new Set();
  for (const { path, instance } of found.paths) {
    for (const check of selected) {
      const outcome = check.run(instance, directory);
      for (const violation of outcome.violations) {
        const line = `INVALID ${violation.pointer} ${violation.message} (check: ${check.id}) [${path}]`;
        violations.add(`${violation.pointer} ${violation.message}`);
        if (!seen.has(line)) {
          seen.add(line);
          lines.push(line);
        }
      }
      for (const report of outcome.reports) {
        if (!seen.has(report)) {
          seen.add(report);
          lines.push(report);
        }
      }
    }
  }
  lines.sort();
  return {
    status: violations.size > 0 ? "red" : "green",
    units: found.paths.length,
    lines,
    distinctViolations: violations.size,
    checksRun: selected.length,
    verdicts: found.paths.map((entry) => entry.path),
  };
}

function writeEvidence(options, lines) {
  if (options.evidence === undefined) {
    return [];
  }
  const path = join(options.evidence, "dual-review.txt");
  const refusal = refuseOpenForWrite(path);
  if (refusal !== undefined) {
    process.stderr.write(`tiphys ${GATE_ID}: ${refusal}\n`);
    return [];
  }
  try {
    mkdirSync(options.evidence, { recursive: true });
    writeFileSync(path, `${lines.join("\n")}\n`);
  } catch (error) {
    process.stderr.write(
      `tiphys ${GATE_ID}: evidence could not be written: ${String(error)}\n`,
    );
    return [];
  }
  return [path];
}

function emit(options, fields) {
  const result = makeGateResult({
    gate: GATE_ID,
    status: fields.status,
    units: fields.units,
    unitLabel: UNIT_LABEL,
    startedAt: fields.startedAt,
    endedAt: new Date().toISOString(),
    detail: fields.detail,
    evidence: writeEvidence(options, fields.evidenceLines ?? [fields.detail]),
  });
  process.stdout.write(
    `${GATE_ID}: ${result.status} (${String(result.units)} ${result.unitLabel})\n`,
  );
  if (result.detail !== "") {
    process.stdout.write(`${result.detail}\n`);
  }
  if (options.result !== undefined) {
    const refusal = refuseOpenForWrite(options.result);
    if (refusal !== undefined) {
      process.stderr.write(`tiphys ${GATE_ID}: ${refusal}\n`);
      return EXIT_GATE_ERROR;
    }
    writeFileSync(options.result, renderGateResult(result));
  }
  return exitCodeForStatus(result.status);
}

function main(argv) {
  const startedAt = new Date().toISOString();
  const parsed = parseArgs(argv);
  if (parsed.options === undefined) {
    process.stderr.write(`tiphys ${GATE_ID}: ${parsed.usageError}\n${usage()}\n`);
    return EXIT_GATE_ERROR;
  }
  const options = parsed.options;

  /* THE PRECONDITION ARM. No gate record and no evidence: it answers one
     question with an exit code, which is what `kind: command-exit-zero`
     consumes. */
  if (options.precondition) {
    const found = committedVerdictPaths(options.directory);
    if (!found.ok) {
      process.stderr.write(`tiphys ${GATE_ID}: ${found.reason}\n`);
      return 1;
    }
    process.stdout.write(
      `${GATE_ID}: ${String(found.paths.length)} verdict document(s) under ${join(options.directory, REVIEW_DIRECTORY)}\n`,
    );
    return found.paths.length > 0 ? 0 : 1;
  }

  const run = evaluate(options.directory);
  if (run.status === "error") {
    return emit(options, {
      status: "error",
      units: 0,
      startedAt,
      detail: run.lines.join("; "),
    });
  }

  if (run.units === 0) {
    /* NOT-APPLICABLE WITH A REASON, never green. A merged head has no pair of
       verdicts to compare, and a gate that cannot reach its subject reporting
       green is the vacuous pass M2-C-3 and SC-011 both exist against. */
    return emit(options, {
      status: "not-applicable",
      units: 0,
      startedAt,
      detail: `no verdict document exists under ${join(options.directory, REVIEW_DIRECTORY)}, so there is no pair of reviews to compare`,
    });
  }

  /* HOW MANY GUARDS RAN IS PRINTED. With the check deregistered this reads
     `0 registered check(s)` beside a green, which is exactly what a reader
     needs in order not to mistake the deregistration witness for an assertion.
     `test/dual-review.test.ts` asserts the check IS registered in the shipped
     registry, so the two facts are separated rather than conflated. */
  process.stdout.write(
    `${GATE_ID}: ${String(run.checksRun)} registered check(s) named ${CHECK_ID} ran over ${String(run.units)} verdict(s)\n`,
  );
  for (const line of run.lines) {
    process.stdout.write(`${line}\n`);
  }

  return emit(options, {
    status: run.status,
    units: run.units,
    startedAt,
    detail:
      run.status === "green"
        ? `${String(run.units)} verdict(s) examined by ${String(run.checksRun)} registered check(s); no decorrelation violation`
        : run.lines.filter((line) => line.startsWith("INVALID")).join("; "),
    evidenceLines: [
      `directory: ${options.directory}`,
      `registered checks named ${CHECK_ID}: ${String(run.checksRun)}`,
      `verdicts examined: ${String(run.units)}`,
      ...(run.verdicts ?? []).map((path) => `  ${path}`),
      ...run.lines,
    ],
  });
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  try {
    process.exitCode = main(process.argv.slice(2));
  } catch (error) {
    process.stderr.write(
      `tiphys ${GATE_ID}: ${String(error?.message ?? error).replace(/\s+/g, " ")}\n`,
    );
    process.exitCode = EXIT_GATE_ERROR;
  }
}

export { EXIT_NOT_APPLICABLE, REVIEW_DIRECTORY, CHECK_ID };
