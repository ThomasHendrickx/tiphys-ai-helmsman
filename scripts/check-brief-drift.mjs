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
 * THAT SENTENCE WAS TRUE OF THE PLUMBING AND FALSE OF THE BEHAVIOUR UNTIL
 * M3-P6's FIRST FIX ROUND, and it is recorded here rather than quietly
 * corrected. `units` was `preflight.length + selected.length` and `preflight`
 * is mode-independent, so the count had a floor of three and M2-C-2, which
 * rewrites green-with-zero-units and nothing else, could never fire. A clean
 * room contract pointed the marker at a mode no gate declares and got
 * `green (3 generated brief gate rows compared)` over a table holding a header,
 * a separator and nothing else. `units` now counts the GATE ROWS compared, so
 * the number measures what `unitLabel` names and the vacuity guard is reachable.
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
const {
  locateGateBlock,
  renderBriefGateBlock,
  BRIEF_GATE_BLOCK_END_MARKER,
  BRIEF_GATE_BLOCK_MODE,
} = rolesModule;

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

/**
 * THE SECOND, INDEPENDENT STATEMENT OF WHAT THE BLOCK MUST CONTAIN (M3-P6 fix
 * round 2, DV-1).
 *
 * The mechanism, one level above the one round 1 named: A CHECK THAT COMPARES A
 * GENERATED ARTIFACT AGAINST ITS OWN GENERATOR CAN ONLY SEE DRIFT BETWEEN THE
 * TWO. `--write` renders the brief FROM `renderBriefGateBlock` and `--check`
 * compares the brief TO `renderBriefGateBlock`, so any narrowing INSIDE that
 * function is a fixed point of the loop and is silent by construction. Round 1
 * closed the two seats that select the subject from OUTSIDE the renderer (the
 * mode in the marker, and the unit count); the seat INSIDE it stayed open, and
 * a strict-subset filter on the selection left this check reporting
 * `green (13 ...)` over a brief advertising thirteen gates where the registry
 * declares fifteen, with the whole suite green.
 *
 * Nothing that calls `renderBriefGateBlock` can close that seat, because the
 * seat is inside it. So this function derives what the block must contain from
 * the REGISTRY ALONE and never calls the renderer.
 *
 * THE DUPLICATION IS DELIBERATE AND IT IS NOT THE ONE THE HEADER WARNS ABOUT.
 * The header says a second copy of the TABLE would make a check agree with
 * itself, and that is still true. What is duplicated here is the SELECTION and
 * the FIELD LIST, never the rendering, and duplicating the selection is exactly
 * how a narrowing of one copy becomes visible to the other. A shared helper
 * between this and the registered test would put both copies back inside one
 * loop, so `test/implementer-brief.test.ts` states the same property a third
 * time in its own code over the SHIPPED BYTES, and neither imports the other.
 *
 * IT IS SET EQUALITY AND FIELD PRESENCE, NOT CONTAINMENT, and both halves are
 * load-bearing against a different member. Containment ("every selected gate
 * appears") is green when the renderer WIDENS, and it is green when the renderer
 * drops a COLUMN from rows that all still appear: deleting the `unitLabel` cell
 * leaves fifteen rows carrying fifteen ids and strips the column the table
 * exists to teach. Measured both ways in this round's work history.
 *
 * NEVER BY COUNT. The registry is append-only, so a pinned number is a claim
 * about every future phase (CLAUDE.md binding convention 5). Every assertion
 * below is per gate and per field, derived at run time.
 */
function gateBlockFindings(block, registry, mode) {
  const selected = (registry.gates ?? []).filter((gate) =>
    (gate.modes ?? []).includes(mode),
  );
  const findings = [];

  /* The rows the block actually carries, keyed by the id in the first cell. */
  const rows = new Map();
  for (const line of block.split("\n")) {
    const match = /^\| `([^`]+)` \|(.*)$/.exec(line);
    if (match !== null) {
      rows.set(match[1], match[2]);
    }
  }

  for (const gate of selected) {
    const row = rows.get(gate.id);
    if (row === undefined) {
      findings.push(
        `the registry's ${mode} mode selects ${gate.id} and the block carries no row for it`,
      );
      continue;
    }
    const cells = row.split("|").map((cell) => cell.trim());
    const fields = [
      ["verified-by", gate["verified-by"]],
      ["applicability", gate.applicability],
      ["unitLabel", gate.unitLabel],
    ];
    for (const [field, value] of fields) {
      /* `verified-by` renders with the probe appended for a checklist gate, so
         the cell is that value FOLLOWED BY the probe rather than equal to it. */
      const present = cells.some(
        (cell) => cell === value || cell.startsWith(`${value} (probe \``),
      );
      if (!present) {
        findings.push(
          `${gate.id}'s row carries no cell holding its registry ${field} "${String(value)}"`,
        );
      }
    }
  }

  for (const id of rows.keys()) {
    if (!selected.some((gate) => gate.id === id)) {
      findings.push(
        `the block carries a row for ${id}, which the registry's ${mode} mode does not select`,
      );
    }
  }

  return findings;
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
  /* AND WHICH MODE IS PINNED OUTSIDE THE BRIEF (M3-P6 fix round 1, CV-1).
     Reading the mode from the brief stops a CALLER narrowing the subject; it
     does not stop an EDITOR of the brief doing the same thing by changing the
     marker and re-rendering, which produces a green check over a brief
     advertising a fraction of the gate table. So the mode the shipped brief
     must declare is a constant in src/roles.ts, and a disagreement is a REFUSAL
     in every mode of this script, `--write` included: `--write` is precisely
     the command an editor would use to legitimise a narrowed marker. */
  if (located.mode !== BRIEF_GATE_BLOCK_MODE) {
    return failed(
      `${options.brief}'s generated gate-list block declares mode ` +
        `${located.mode} and the shipped brief must declare ` +
        `${BRIEF_GATE_BLOCK_MODE}: a narrowed mode renders a smaller gate ` +
        "table that this check would then find in agreement with itself",
    );
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

  /* AND THE RENDERING IS CHECKED AGAINST THE REGISTRY DIRECTLY, IN EVERY MODE
     INCLUDING `--write` (M3-P6 fix round 2, DV-1). `--write` is the command that
     launders a narrowed renderer into the shipped brief, which is the same
     reason round 1 put the mode refusal in `--write` as well as `--check`. A
     narrowing inside `renderBriefGateBlock` is invisible to the row-for-row
     compare below, because that compare has the narrowed rendering on both
     sides. Refusing here is an `error` and not a `red`: the check cannot make a
     statement about drift when its own rendering does not match the authority. */
  const renderingFindings = gateBlockFindings(rendered.text, decoded.value, located.mode);
  if (renderingFindings.length > 0) {
    return failed(
      `the block ${options.registry} renders for mode ${located.mode} does not ` +
        `match the registry it was rendered from: ${renderingFindings.join("; ")}. ` +
        "This is a defect in the renderer, not drift in the brief",
      rendered.units,
    );
  }

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

  /* THE SHIPPED BYTES, ASSERTED DIRECTLY RATHER THAN BY TRANSITIVITY. A green
     row-for-row compare below does imply the block equals the validated
     rendering, so this is redundant TODAY. It is here because that implication
     is a property of `describeDrift`, and a check whose coverage depends on a
     second function staying correct is the shape this phase has now paid for
     twice. Costs one pass over the block; buys a direct statement about the file
     that ships. */
  const blockFindings = gateBlockFindings(located.block, decoded.value, located.mode);
  if (blockFindings.length > 0) {
    return emit(options, {
      status: "red",
      units: rendered.units,
      startedAt,
      endedAt: new Date().toISOString(),
      detail:
        `${options.brief}'s ${located.mode} gate block does not match ` +
        `${options.registry}: ${blockFindings.join("; ")}. Re-render with ` +
        "node scripts/check-brief-drift.mjs --write",
    });
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
