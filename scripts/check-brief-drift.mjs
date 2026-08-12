/**
 * THE BRIEF GATE-LIST DRIFT CHECK (kernel plan M3, M3-P6 step 3 and
 * criterion 3; R-094, D-M3-28, D-M3-34).
 *
 * R-094 asks for one source consumed by CI and by the BRIEFS. M3-P2 made that
 * true for `CLAUDE.md`; this makes it true for `roles/implementer.md`, whose
 * gate-list section is a GENERATED projection of `gate-registry.yaml` for the
 * mode the brief's own begin marker declares. A transcribed gate list is a
 * second source, and a second source is what goes stale the first time a gate
 * is added.
 *
 * IT DERIVES, IT DOES NOT READ THE BLOCK. The hazard this phase names for this
 * criterion, in its own words, is "a generated gate-list block whose drift
 * check compares the block TO ITSELF rather than to the registry", which is
 * green forever. `renderBriefGateBlock` in src/roles.ts takes the decoded
 * registry and a mode string and nothing else; this script opens the brief only
 * to compare against or to write into. The added-gate direction of criterion 3
 * is exactly what a compare-to-itself check would fail to detect.
 *
 * ONE RENDERER, THREE CALLERS: this script's `--check` and `--write`, and the
 * registered test that asserts the COMPOSED brief's block is byte-identical to
 * the registry's rendering. A second copy of the table in any of them would be
 * a check asserting agreement with itself.
 *
 * IT IS A GATE SUBPROCESS UNDER M2-P1's CONTRACT (D-M3-34, section 2.2a).
 * Declared in `gate-registry.yaml` AND in `gates.manifest.json` as `brief-drift`,
 * and when invoked with `--result` it writes ONE `GateResult` through
 * `makeGateResult`, so M2-C-2 applies: a run that compared ZERO rows becomes
 * `error` with `vacuous: true` instead of exiting 0.
 *
 * WHERE IT RUNS, stated exactly, because "declared" and "runs" are not the same
 * thing and this repository has paid for confusing them. On a PULL REQUEST the
 * manifest entry puts it in the bundle `scripts/m2-exit-test.sh` runs, so the
 * runner executes it as a gate. On a PUSH to the default branch the main bundle
 * has a hard-coded `--only` list that does not name it, so the push arm is
 * covered instead by a direct step in `.github/workflows/gates.yml` carrying no
 * `if:`. Both arms have a witness, which is what T-009 requires; they do not
 * have the SAME witness, and that is why this paragraph exists.
 *
 * AND WHICH HALF FAILS THE BUILD, because "the runner executes it as a gate"
 * and "a red one fails the pull request" are two different claims and only the
 * first is true of the harness. `scripts/m2-exit-test.sh`'s PR expectation table
 * does not list this gate, and its assertion program compares only the gates
 * that table names; its two GLOBAL checks are zero-error and zero-vacuous over
 * every row, with no global zero-red. So an `error` from here is caught by the
 * harness, and a plain `red` is caught by the workflow step, which carries no
 * `if:` and fails the job on either event. Do not delete that step on the
 * grounds that the gate covers it.
 *
 * MODES
 *   (default)   print the rendered block to stdout
 *   --check     compare the block in the brief against the rendering; exit
 *               nonzero on drift, NAMING what differs
 *   --write     replace the block in the brief with the rendering
 *
 * The runner contract's flags are accepted in every mode:
 *   --result <path>   write the GateResult here
 *   --evidence <dir>  the run's evidence directory for this gate
 *   --registry <path> the registry to render from (default gate-registry.yaml)
 *   --brief <path>    the brief carrying the block (default roles/implementer.md)
 */

import { mkdirSync, writeFileSync } from "node:fs";
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
const rolesModule = await import(
  pathToFileURL(join(repoRoot, "src", "roles.ts")).href
);
const { makeGateResult, renderGateResult, exitCodeForStatus } = resultModule;
const { refuseOpenForWrite, readRegularFileIfPresent } = taskModule;
const { decodeDocument } = validateModule;
const { locateGateBlock, renderBriefGateBlock, BRIEF_GATE_BLOCK_END_MARKER } = rolesModule;

const GATE_ID = "brief-drift";
const UNIT_LABEL = "generated brief gate rows compared";
const EXIT_GATE_ERROR = 20;

const DEFAULT_REGISTRY = "gate-registry.yaml";
const DEFAULT_BRIEF = join("roles", "implementer.md");

function usage() {
  return (
    "usage: node scripts/check-brief-drift.mjs [--check | --write] " +
    "[--registry <path>] [--brief <path>] [--result <path>] [--evidence <dir>]"
  );
}

function parseArgs(argv) {
  const options = {
    mode: "print",
    registry: DEFAULT_REGISTRY,
    brief: DEFAULT_BRIEF,
    result: undefined,
    evidence: undefined,
  };
  for (let index = 0; index < argv.length; index += 1) {
    const flag = argv[index];
    if (flag === "--check" || flag === "--write") {
      options.mode = flag.slice(2);
      continue;
    }
    const value = argv[index + 1];
    if (value === undefined || value.startsWith("--")) {
      return { usageError: `${flag} requires a value` };
    }
    if (flag === "--registry") {
      options.registry = value;
    } else if (flag === "--brief") {
      options.brief = value;
    } else if (flag === "--result") {
      options.result = value;
    } else if (flag === "--evidence") {
      options.evidence = value;
    } else {
      return { usageError: `unknown option ${flag}` };
    }
    index += 1;
  }
  return { options };
}

/**
 * The differences between two blocks, as lines a reader can act on. NAMED
 * rather than counted: criterion 3 requires the check to name the added gate,
 * and "the block differs" names nothing and sends the reader back to a diff.
 */
function describeDrift(expected, observed) {
  const want = expected.split("\n");
  const have = observed.split("\n");
  const wantSet = new Set(want);
  const haveSet = new Set(have);
  const differences = [];
  for (const line of want.filter((row) => row.trim() !== "" && !haveSet.has(row))) {
    differences.push(`the registry has a row the brief does not: ${line.trim()}`);
  }
  for (const line of have.filter((row) => row.trim() !== "" && !wantSet.has(row))) {
    differences.push(`the brief has a row the registry does not: ${line.trim()}`);
  }
  if (differences.length === 0 && expected !== observed) {
    differences.push("the two blocks differ only in blank-line placement or line order");
  }
  return differences;
}

function emit(options, fields) {
  const result = makeGateResult({
    gate: GATE_ID,
    unitLabel: UNIT_LABEL,
    evidence: [],
    ...fields,
  });
  process.stdout.write(
    `${result.gate}: ${result.status} (${String(result.units)} ${result.unitLabel})\n`,
  );
  if (result.detail !== "") {
    process.stdout.write(`${result.detail}\n`);
  }
  if (options.result !== undefined) {
    const refusal = refuseOpenForWrite(options.result);
    if (refusal !== undefined) {
      process.stderr.write(`${GATE_ID}: ${refusal}\n`);
      return EXIT_GATE_ERROR;
    }
    if (options.evidence !== undefined) {
      mkdirSync(options.evidence, { recursive: true });
    }
    writeFileSync(options.result, renderGateResult(result));
  }
  return exitCodeForStatus(result.status);
}

function main(argv) {
  const parsed = parseArgs(argv);
  if (parsed.options === undefined) {
    process.stderr.write(`check-brief-drift: ${parsed.usageError}\n${usage()}\n`);
    return 64;
  }
  const options = parsed.options;
  const startedAt = new Date().toISOString();
  const failed = (detail, units = 0) =>
    emit(options, {
      status: "error",
      units,
      startedAt,
      endedAt: new Date().toISOString(),
      detail,
    });

  const briefRead = readRegularFileIfPresent(options.brief);
  if (briefRead.kind !== "read") {
    return failed(
      briefRead.kind === "absent"
        ? `${options.brief} does not exist`
        : briefRead.reason,
    );
  }
  /* THE MODE COMES FROM THE BRIEF, NOT FROM A FLAG AND NOT FROM A DEFAULT.
     The brief declares which mode's gate set it carries, in its own begin
     marker; a `--mode` flag here would let a caller compare the brief against
     a mode it never claimed, which is a check that can be made to pass. A
     missing marker is a REFUSAL and never a silent "no drift". */
  const located = locateGateBlock(briefRead.body, options.brief);
  if (!located.ok) {
    return failed(located.reason);
  }

  const registryRead = readRegularFileIfPresent(options.registry);
  if (registryRead.kind !== "read") {
    return failed(
      registryRead.kind === "absent"
        ? `registry ${options.registry} does not exist`
        : registryRead.reason,
    );
  }
  const decoded = decodeDocument(registryRead.body, options.registry);
  if (!decoded.ok) {
    return failed(decoded.reason);
  }

  const rendered = renderBriefGateBlock(decoded.value, located.mode);

  if (options.mode === "print") {
    process.stdout.write(`${rendered.text}\n`);
    return 0;
  }

  if (options.mode === "write") {
    const replaced =
      briefRead.body.slice(0, located.begin) +
      rendered.text +
      briefRead.body.slice(located.end + BRIEF_GATE_BLOCK_END_MARKER.length);
    const refusal = refuseOpenForWrite(options.brief);
    if (refusal !== undefined) {
      process.stderr.write(`check-brief-drift: ${refusal}\n`);
      return EXIT_GATE_ERROR;
    }
    writeFileSync(options.brief, replaced);
    process.stdout.write(
      `check-brief-drift: rewrote the ${located.mode} gate block in ${options.brief} ` +
        `(${String(rendered.units)} row(s) from ${options.registry})\n`,
    );
    return 0;
  }

  const differences = describeDrift(rendered.text, located.block);
  if (differences.length > 0) {
    return emit(options, {
      status: "red",
      units: rendered.units,
      startedAt,
      endedAt: new Date().toISOString(),
      detail:
        `${options.brief}'s ${located.mode} gate block has drifted from ` +
        `${options.registry}: ${differences.join("; ")}. Re-render with ` +
        "node scripts/check-brief-drift.mjs --write",
    });
  }
  return emit(options, {
    status: "green",
    units: rendered.units,
    startedAt,
    endedAt: new Date().toISOString(),
    detail:
      `${options.brief}'s ${located.mode} gate block matches ${options.registry} ` +
      `row for row (${String(rendered.units)} row(s) compared)`,
  });
}

process.exit(main(process.argv.slice(2)));
