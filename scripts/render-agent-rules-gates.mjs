/**
 * RENDER THE AGENT-RULES GATE SECTION FROM THE CANONICAL REGISTRY
 * (kernel plan M3, M3-P2 step 5; R-094).
 *
 * R-094 asks for "a single source consumed by CI and briefs". A registry that
 * CI reads while `CLAUDE.md` carries a hand-maintained copy of the same list
 * is two sources with a convention between them, and a convention is what
 * this project has recorded three times as not surviving. This script is the
 * mechanism that makes the single source TRUE rather than asserted: the block
 * in `CLAUDE.md` is GENERATED from `gate-registry.yaml`, and `--check` fails
 * when the file and the registry disagree.
 *
 * THE RENDERER DERIVES, IT DOES NOT READ THE BLOCK. The whole hazard here is
 * a renderer that reads `CLAUDE.md`'s block and calls it the rendering, so
 * the two always agree and the check is worthless. `renderBlock` below takes
 * ONE argument, the decoded registry, and `CLAUDE.md` is opened only to
 * compare against or to write into. A change to the registry that is not
 * re-rendered is therefore a difference this script can see; that is what
 * M3-P2 criterion 5 witnesses in both directions.
 *
 * IT IS A GATE SUBPROCESS UNDER M2-P1's CONTRACT (D-M3-34, section 2.2a).
 * Registered in `gate-registry.yaml` as `agent-rules-drift`, so it runs
 * inside the one `gates run` the harness makes rather than beside it, and it
 * writes ONE `GateResult` through `makeGateResult`. M2-C-2 therefore applies
 * for free: a run that compared ZERO rows becomes `error` with
 * `vacuous: true` instead of exiting 0, which a raw workflow `run:` step
 * could never do.
 *
 * MODES
 *   (default)   print the rendered block to stdout
 *   --check     compare the block in CLAUDE.md against the rendering; exit
 *               nonzero on drift, NAMING what differs
 *   --write     replace the block in CLAUDE.md with the rendering
 *
 * The runner contract's flags are accepted in every mode:
 *   --result <path>   write the GateResult here
 *   --evidence <dir>  the run's evidence directory for this gate
 *   --registry <path> the registry to render from (default gate-registry.yaml)
 *   --agent-rules <path> the file carrying the block (default CLAUDE.md)
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
const { makeGateResult, renderGateResult, exitCodeForStatus } = resultModule;
const { refuseOpenForWrite, readRegularFileIfPresent } = taskModule;
const { decodeDocument } = validateModule;

const GATE_ID = "agent-rules-drift";
const UNIT_LABEL = "rendered gate rows compared";
const EXIT_GATE_ERROR = 20;

const DEFAULT_REGISTRY = "gate-registry.yaml";
const DEFAULT_AGENT_RULES = "CLAUDE.md";

/**
 * The two markers delimiting the generated block. HTML comments, so they are
 * invisible in rendered markdown and unambiguous to a line scanner. They name
 * the producing script and the source document, because the next person to
 * edit the block by hand should be told what to edit instead.
 */
const BEGIN_MARKER =
  "<!-- BEGIN GENERATED GATE LIST: rendered from gate-registry.yaml by scripts/render-agent-rules-gates.mjs. Do not edit by hand; edit the registry. -->";
const END_MARKER = "<!-- END GENERATED GATE LIST -->";

function usage() {
  return (
    "usage: node scripts/render-agent-rules-gates.mjs [--check | --write] " +
    "[--registry <path>] [--agent-rules <path>] [--result <path>] [--evidence <dir>]"
  );
}

function parseArgs(argv) {
  const options = {
    mode: "print",
    registry: DEFAULT_REGISTRY,
    agentRules: DEFAULT_AGENT_RULES,
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
    } else if (flag === "--agent-rules") {
      options.agentRules = value;
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
 * The block, derived from the registry ALONE. Nothing in this function reads
 * `CLAUDE.md`; see the header for why that is the point rather than a detail.
 */
function renderBlock(registry) {
  const lines = [];
  lines.push(BEGIN_MARKER);
  lines.push("");
  lines.push("Every change must pass these, in order:");
  lines.push("");
  let step = 0;
  for (const entry of registry.preflight) {
    step += 1;
    lines.push(`${String(step)}. \`${entry.command.join(" ")}\` (${entry.note})`);
  }
  lines.push("");
  lines.push(
    "Then the registry's gates, run by `tiphys gates run --registry gate-registry.yaml --mode <mode>`:",
  );
  lines.push("");
  lines.push("| Gate | Verified by | Applicability | Modes | CI events | One unit is |");
  lines.push("|---|---|---|---|---|---|");
  for (const gate of registry.gates) {
    lines.push(
      `| \`${gate.id}\` | ${gate["verified-by"]}` +
        `${gate.probe === undefined ? "" : ` (probe \`${gate.probe}\`)`}` +
        ` | ${gate.applicability} | ${gate.modes.join(", ")} | ${gate.events.join(", ")}` +
        ` | ${gate.unitLabel} |`,
    );
  }
  lines.push("");
  lines.push(END_MARKER);
  return lines.join("\n");
}

/** How many rows the rendering compared. The gate's `units`, so M2-C-2 bites. */
function rowCount(registry) {
  return registry.preflight.length + registry.gates.length;
}

/**
 * Extract the block from the agent-rules file, or say why it cannot be. A
 * missing marker is a REFUSAL and never a silent "no drift": a check that
 * reports clean because it could not find the thing it compares is the
 * guard-condition failure T-008's postscript records.
 */
function extractBlock(text, path) {
  const begin = text.indexOf(BEGIN_MARKER);
  if (begin === -1) {
    return { ok: false, reason: `${path} carries no begin marker; expected ${BEGIN_MARKER}` };
  }
  const end = text.indexOf(END_MARKER, begin);
  if (end === -1) {
    return { ok: false, reason: `${path} carries a begin marker with no matching ${END_MARKER}` };
  }
  if (text.indexOf(BEGIN_MARKER, begin + 1) !== -1) {
    return { ok: false, reason: `${path} carries more than one begin marker` };
  }
  return { ok: true, block: text.slice(begin, end + END_MARKER.length), begin, end };
}

/**
 * The differences between two blocks, as lines a reader can act on. Named
 * rather than counted: criterion 5 requires the check to NAME the added gate,
 * and "the block differs" names nothing.
 */
function describeDrift(expected, observed) {
  const want = expected.split("\n");
  const have = observed.split("\n");
  const wantSet = new Set(want);
  const haveSet = new Set(have);
  const missing = want.filter((line) => line.trim() !== "" && !haveSet.has(line));
  const extra = have.filter((line) => line.trim() !== "" && !wantSet.has(line));
  const differences = [];
  for (const line of missing) {
    differences.push(`the registry has a row the file does not: ${line.trim()}`);
  }
  for (const line of extra) {
    differences.push(`the file has a row the registry does not: ${line.trim()}`);
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
    process.stderr.write(`render-agent-rules-gates: ${parsed.usageError}\n${usage()}\n`);
    return 64;
  }
  const options = parsed.options;
  const startedAt = new Date().toISOString();

  const registryRead = readRegularFileIfPresent(options.registry);
  if (registryRead.kind !== "read") {
    return emit(options, {
      status: "error",
      units: 0,
      startedAt,
      endedAt: new Date().toISOString(),
      detail:
        registryRead.kind === "absent"
          ? `registry ${options.registry} does not exist`
          : registryRead.reason,
    });
  }
  const decoded = decodeDocument(registryRead.body, options.registry);
  if (!decoded.ok) {
    return emit(options, {
      status: "error",
      units: 0,
      startedAt,
      endedAt: new Date().toISOString(),
      detail: decoded.reason,
    });
  }
  const registry = decoded.value;
  const block = renderBlock(registry);
  const units = rowCount(registry);

  if (options.mode === "print") {
    process.stdout.write(`${block}\n`);
    return 0;
  }

  const rulesRead = readRegularFileIfPresent(options.agentRules);
  if (rulesRead.kind !== "read") {
    return emit(options, {
      status: "error",
      units: 0,
      startedAt,
      endedAt: new Date().toISOString(),
      detail:
        rulesRead.kind === "absent"
          ? `${options.agentRules} does not exist`
          : rulesRead.reason,
    });
  }
  const extracted = extractBlock(rulesRead.body, options.agentRules);
  if (!extracted.ok) {
    return emit(options, {
      status: "error",
      units: 0,
      startedAt,
      endedAt: new Date().toISOString(),
      detail: extracted.reason,
    });
  }

  if (options.mode === "write") {
    const replaced =
      rulesRead.body.slice(0, extracted.begin) +
      block +
      rulesRead.body.slice(extracted.end + END_MARKER.length);
    const refusal = refuseOpenForWrite(options.agentRules);
    if (refusal !== undefined) {
      process.stderr.write(`render-agent-rules-gates: ${refusal}\n`);
      return EXIT_GATE_ERROR;
    }
    writeFileSync(options.agentRules, replaced);
    process.stdout.write(
      `render-agent-rules-gates: rewrote the block in ${options.agentRules} ` +
        `(${String(units)} row(s) from ${options.registry})\n`,
    );
    return 0;
  }

  const differences = describeDrift(block, extracted.block);
  if (differences.length > 0) {
    return emit(options, {
      status: "red",
      units,
      startedAt,
      endedAt: new Date().toISOString(),
      detail:
        `${options.agentRules}'s gate block has drifted from ${options.registry}: ` +
        `${differences.join("; ")}. Re-render with ` +
        "node scripts/render-agent-rules-gates.mjs --write",
    });
  }
  return emit(options, {
    status: "green",
    units,
    startedAt,
    endedAt: new Date().toISOString(),
    detail:
      `${options.agentRules}'s gate block matches ${options.registry} row for row ` +
      `(${String(registry.preflight.length)} preflight step(s), ` +
      `${String(registry.gates.length)} gate(s))`,
  });
}

process.exit(main(process.argv.slice(2)));
