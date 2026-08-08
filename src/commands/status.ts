/**
 * `tiphys status <emit | show>` (kernel plan M3, M3-P1 step 6; R-084).
 *
 *   tiphys status emit --run <id> --state <state> [--project <name>]
 *                      [--detail <text>] [--ref <r>]...
 *   tiphys status show
 *
 * Runs in a fleet home (cwd). `emit` composes a record, VALIDATES it against
 * the shipped `status-line` schema before writing anything, appends one line
 * to `state/status/stream.jsonl`, then rewrites `state/status/current.json`
 * atomically. `show` reads `current.json` ONLY and never opens the stream
 * (constraint C-1: never read current state from the tail of an append-only
 * log).
 *
 * The state vocabulary is closed and is enforced, not requested: `--state
 * progress` is refused naming the permitted values, because R-084's
 * sparseness is worth nothing if the emitter accepts whatever it is handed.
 */

import { basename } from "node:path";
import { EX_USAGE } from "../cli.ts";
import { loadFleet } from "../fleet.ts";
import { loadTypeSchema } from "./validate.ts";
import { formatDiagnostics, validateInstance } from "../validate.ts";
import {
  STATUS_STATES,
  emitStatus,
  makeStatusRecord,
  readCurrent,
  renderStatus,
} from "../status.ts";

const USAGE =
  "usage: tiphys status <emit --run <id> --state <" +
  STATUS_STATES.join("|") +
  "> [--project <name>] [--detail <text>] [--ref <r>] | show>";

interface EmitArgs {
  run?: string;
  state?: string;
  project?: string;
  detail?: string;
  refs: string[];
  at?: string;
}

function parseEmit(argv: string[]): { args?: EmitArgs; usageError?: string } {
  const args: EmitArgs = { refs: [] };
  for (let index = 0; index < argv.length; index += 1) {
    const flag = argv[index] as string;
    const value = argv[index + 1];
    if (
      flag !== "--run" &&
      flag !== "--state" &&
      flag !== "--project" &&
      flag !== "--detail" &&
      flag !== "--ref" &&
      flag !== "--at"
    ) {
      return { usageError: `unknown option ${flag}` };
    }
    if (value === undefined) {
      return { usageError: `${flag} requires a value` };
    }
    index += 1;
    if (flag === "--run") args.run = value;
    else if (flag === "--state") args.state = value;
    else if (flag === "--project") args.project = value;
    else if (flag === "--detail") args.detail = value;
    else if (flag === "--at") args.at = value;
    else args.refs.push(value);
  }
  if (args.run === undefined) {
    return { usageError: "--run is required" };
  }
  if (args.state === undefined) {
    return { usageError: "--state is required" };
  }
  return { args };
}

export function cmdStatus(argv: string[]): number {
  const [subcommand, ...rest] = argv;
  if (subcommand === "show") {
    if (rest.length > 0) {
      process.stderr.write(`tiphys status show: takes no arguments\n${USAGE}\n`);
      return EX_USAGE;
    }
    const fleet = loadFleet(process.cwd());
    const current = readCurrent(fleet.root);
    if (!current.ok) {
      process.stderr.write(`tiphys status show: ${current.reason}\n`);
      return 1;
    }
    process.stdout.write(`${renderStatus(current.record)}\n`);
    return 0;
  }

  if (subcommand !== "emit") {
    process.stderr.write(`${USAGE}\n`);
    return EX_USAGE;
  }

  const parsed = parseEmit(rest);
  if (parsed.args === undefined) {
    process.stderr.write(
      `tiphys status emit: ${parsed.usageError ?? "usage error"}\n${USAGE}\n`,
    );
    return EX_USAGE;
  }

  const fleet = loadFleet(process.cwd());
  const record = makeStatusRecord({
    run: parsed.args.run as string,
    project: parsed.args.project ?? basename(fleet.root),
    state: parsed.args.state as string,
    detail: parsed.args.detail,
    refs: parsed.args.refs,
    at: parsed.args.at,
  });

  /* The record is validated against the SHIPPED schema before anything is
     written. Validating a composed record against the same document the
     validator command uses is what makes the closed state vocabulary one
     rule rather than two: `--state progress` fails here for exactly the
     reason it would fail `tiphys validate --type status-line`. */
  const diagnostics = validateInstance(loadTypeSchema("status-line"), record);
  if (diagnostics.length > 0) {
    for (const line of formatDiagnostics(diagnostics)) {
      process.stderr.write(`${line}\n`);
    }
    process.stderr.write(
      `tiphys status emit: the permitted states are ${STATUS_STATES.join(", ")}\n`,
    );
    return 1;
  }

  const emitted = emitStatus(fleet.root, record);
  if (!emitted.ok) {
    process.stderr.write(`tiphys status emit: ${emitted.reason}\n`);
    return 1;
  }
  process.stdout.write(`${renderStatus(emitted.record)}\n`);
  return 0;
}
