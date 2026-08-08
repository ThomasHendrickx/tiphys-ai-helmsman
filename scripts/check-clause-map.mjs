/**
 * THE CLAUSE MAP CHECK (kernel plan M3, section 2.2; M3-P1 step 9; A-007).
 *
 * EXT-F-07 requires a per-subphase orphan check. A row like R-034 ("stop and
 * escalate, never improvise") lands as a CLAUSE inside a prose brief, and
 * nothing in M1 or M2 can check that a brief still carries it. This is the
 * smallest thing that can.
 *
 * FOUR CONDITIONS, and the first one is why this is not just a presence
 * check:
 *
 *   1. a row in the INVENTORY, owned by a phase that is IN FORCE, with no
 *      entry in the coverage table;
 *   2. an entry in the coverage table naming a row that is NOT in the
 *      inventory (the reverse direction, which catches an invented row);
 *   3. a named artifact file that does not exist;
 *   4. a clause id that does not occur inside its artifact.
 *
 * TWO SEPARATELY CONFIGURED SOURCES, in the shape `src/gates/coverage.ts`
 * already uses on `main`, and the separation is not decoration. Condition 1
 * needs an INDEPENDENT enumeration of which rows exist: if the script took
 * `clause-map.json` as its own inventory then a phase that omitted one of its
 * rows would produce a green check, and "exits 0 over all 74 rows" would be
 * satisfied by a file containing seventy-three. A completeness checker whose
 * only input is the thing whose completeness is in question is a presence
 * check wearing a completeness checker's name.
 *
 *   inventory      Appendix A of `delivery/plan/kernel-plan-m3.md`, the
 *                  74-row markdown table, id pattern `R-[0-9]+[a-z]?` in
 *                  column 1 and the owning phase `M3-P[0-9]+` in column 2.
 *                  Authored by a different act (planning) from the map
 *                  (implementation), which is what makes the comparison
 *                  mean something.
 *   coverage table `delivery/requirements/clause-map.json`, one entry per
 *                  row, `{phase, artifact, clause}`.
 *
 * A THIRD INPUT, DECLARED RATHER THAN ASSUMED. Section 2.2 says "a phase is
 * IN FORCE when its artifact file named in the inventory row exists in the
 * working tree". Appendix A's row NOTES name an artifact for some rows and
 * not for others (R-012's note names no file at all), so that sentence is not
 * computable from Appendix A as delivered. Rather than improvise a reading,
 * this script declares one ANCHOR PATH per M3 phase below and treats the
 * phase as in force when its anchor exists. The anchor is a third configured
 * source and is deliberately NOT derived from `clause-map.json`, because a
 * determination derived from the map would make condition 1 circular again.
 * The divergence from section 2.2's letter is recorded in
 * `delivery/work-history/m3-p1.md` as a declared deviation.
 *
 * `git merge-base` is deliberately not used: the check must give the same
 * answer on a phase branch, in CI on both events, and in the exit run.
 *
 * IT IS A GATE SUBPROCESS UNDER M2-P1's CONTRACT (D-M3-34, section 2.2a). It
 * writes ONE `GateResult` through `makeGateResult`, so M2-C-2 applies for
 * free: a run that examined ZERO rows becomes `error` with `vacuous: true`
 * rather than exiting 0, which a raw workflow `run:` step could never do.
 */

import { writeFileSync } from "node:fs";
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
const { makeGateResult, renderGateResult, exitCodeForStatus } = resultModule;
const { refuseOpenForWrite, readRegularFileIfPresent } = taskModule;

const GATE_ID = "clause-map";
const UNIT_LABEL = "clause-map rows checked";
const EXIT_GATE_ERROR = 20;

const DEFAULT_INVENTORY = join("delivery", "plan", "kernel-plan-m3.md");
const DEFAULT_MAP = join("delivery", "requirements", "clause-map.json");

/**
 * One anchor per M3 phase: the artifact whose existence in the working tree
 * means that phase has landed. See the header for why this is declared here.
 */
const PHASE_ANCHORS = new Map([
  ["M3-P1", "schemas/plan.schema.json"],
  ["M3-P2", "gate-registry.yaml"],
  ["M3-P3", "assurance-modes.yaml"],
  ["M3-P4", "schemas/report.schema.json"],
  ["M3-P5", "roles/plan-writer.md"],
  ["M3-P6", "roles/implementer.md"],
  ["M3-P7", "checklists/clean-room.yaml"],
  ["M3-P8", "schemas/tuition.schema.json"],
  ["M3-P9", "AGENTS.md"],
  ["M3-P10", "scripts/license-gate.mjs"],
]);

const ROW_PATTERN = /^\|\s*(R-[0-9]+[a-z]?)\s*\|\s*(M3-P[0-9]+)\s*\|/;

function usage() {
  return (
    "usage: node scripts/check-clause-map.mjs [--inventory <path>] " +
    "[--map <path>] [--result <path>] [--evidence <dir>]"
  );
}

function parseArgs(argv) {
  const options = {
    inventory: DEFAULT_INVENTORY,
    map: DEFAULT_MAP,
    result: undefined,
    evidence: undefined,
  };
  for (let index = 0; index < argv.length; index += 2) {
    const flag = argv[index];
    const value = argv[index + 1];
    if (!["--inventory", "--map", "--result", "--evidence"].includes(flag)) {
      return { usageError: `unknown option ${String(flag)}` };
    }
    if (value === undefined || value.startsWith("--")) {
      return { usageError: `${flag} requires a value` };
    }
    options[flag.slice(2)] = value;
  }
  return { options };
}

/** Parse Appendix A into `[{id, phase}]`, the inventory. */
export function parseInventory(markdown) {
  const rows = [];
  const seen = new Set();
  for (const line of markdown.split("\n")) {
    const match = ROW_PATTERN.exec(line);
    if (match === null) {
      continue;
    }
    const [, id, phase] = match;
    if (seen.has(id)) {
      continue;
    }
    seen.add(id);
    rows.push({ id, phase });
  }
  return rows;
}

/** Read a repository-relative file, or undefined when it is not there. */
function readIfPresent(path) {
  const read = readRegularFileIfPresent(path);
  return read.kind === "read" ? read.body : undefined;
}

/**
 * Evaluate the four conditions. Pure, so `test/checks.test.ts` can drive it
 * over fixtures without spawning a process.
 */
export function evaluate(inventoryRows, coverage, exists, readArtifact) {
  const problems = [];
  const pending = [];
  const byId = new Map(inventoryRows.map((row) => [row.id, row]));
  let checked = 0;

  for (const row of inventoryRows) {
    const anchor = PHASE_ANCHORS.get(row.phase);
    const inForce = anchor !== undefined && exists(anchor);
    const entry = coverage[row.id];
    if (entry === undefined) {
      if (inForce) {
        /* CONDITION 1. */
        problems.push(
          `${row.id} is owned by ${row.phase}, which is in force, and has no clause-map entry`,
        );
      } else {
        pending.push(`${row.id} pending ${row.phase}`);
      }
      continue;
    }
    checked += 1;
    /* CONDITION 3. */
    const body = readArtifact(entry.artifact);
    if (body === undefined) {
      problems.push(
        `${row.id} names artifact ${entry.artifact}, which does not exist`,
      );
      continue;
    }
    /* CONDITION 4. */
    if (!body.includes(entry.clause)) {
      problems.push(
        `${row.id} names clause ${entry.clause}, which does not occur in ${entry.artifact}`,
      );
    }
  }

  /* CONDITION 2, the reverse direction. */
  for (const id of Object.keys(coverage).sort()) {
    if (!byId.has(id)) {
      problems.push(`${id} has a clause-map entry and is not in the inventory`);
    }
  }

  return { problems, pending, checked };
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
    evidence: [],
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
      process.stderr.write(`tiphys clause-map: ${refusal}\n`);
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
    process.stderr.write(`tiphys clause-map: ${parsed.usageError}\n${usage()}\n`);
    return EXIT_GATE_ERROR;
  }
  const options = parsed.options;

  const inventoryText = readIfPresent(options.inventory);
  if (inventoryText === undefined) {
    return emit(options, {
      status: "error",
      units: 0,
      startedAt,
      detail: `the inventory ${options.inventory} is not a readable file`,
    });
  }
  const mapText = readIfPresent(options.map);
  if (mapText === undefined) {
    return emit(options, {
      status: "error",
      units: 0,
      startedAt,
      detail: `the coverage table ${options.map} is not a readable file`,
    });
  }
  let coverage;
  try {
    coverage = JSON.parse(mapText);
  } catch (error) {
    return emit(options, {
      status: "error",
      units: 0,
      startedAt,
      detail: `${options.map} is not readable as JSON: ${String(error)}`,
    });
  }
  const rows = parseInventory(inventoryText);
  const { problems, pending, checked } = evaluate(
    rows,
    coverage,
    (path) => readIfPresent(path) !== undefined,
    (path) => readIfPresent(path),
  );

  for (const line of pending) {
    process.stdout.write(`${line}\n`);
  }
  for (const line of problems) {
    process.stdout.write(`CLAUSE-MAP ${line}\n`);
  }

  return emit(options, {
    status: problems.length === 0 ? "green" : "red",
    units: checked,
    startedAt,
    detail:
      problems.length === 0
        ? `${String(checked)} rows checked, ${String(pending.length)} pending a phase not yet in force`
        : problems.join("; "),
  });
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  try {
    process.exitCode = main(process.argv.slice(2));
  } catch (error) {
    process.stderr.write(
      `tiphys clause-map: ${String(error?.message ?? error).replace(/\s+/g, " ")}\n`,
    );
    process.exitCode = EXIT_GATE_ERROR;
  }
}
