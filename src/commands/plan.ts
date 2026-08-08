/**
 * `tiphys plan project --phase-id <id> [--plan <file>] [--out <dir>]`
 * (kernel plan M3, M3-P1 step 2; D-M3-18).
 *
 * Emits the M2-P4 scope auditor's phase declaration from the plan, so the
 * auditor's input becomes a GENERATED VIEW of one source instead of a second
 * hand-authored source that can drift.
 *
 * The output path is `<out>/<phase-id-lowercased>.json`, defaulting to
 * `delivery/plan/phase-declarations`, which is the directory
 * `gates.manifest.json` passes to the auditor as `--declarations`.
 *
 * With no `--out` the document is written; with `--stdout` it is printed and
 * nothing is written, which is what a test or a reviewer wants when checking
 * WHAT would be emitted without touching the tree.
 *
 * Every path this command touches is operator-supplied and is classified
 * before it is opened or written (D-M3-27).
 */

import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { EX_USAGE } from "../cli.ts";
import { projectPhase, renderDeclaration } from "../plan.ts";
import { refuseOpenForWrite } from "../task.ts";
import {
  classifyContextDirectory,
  decodeDocument,
  readOperatorPath,
} from "../validate.ts";

const USAGE =
  "usage: tiphys plan project --phase-id <id> [--plan <file>] " +
  "[--out <dir>] [--stdout]";

const DEFAULT_PLAN = "templates/plan.example.yaml";
const DEFAULT_OUT = join("delivery", "plan", "phase-declarations");

interface Args {
  phaseId?: string;
  plan: string;
  out: string;
  toStdout: boolean;
}

function parseArgs(argv: string[]): { args?: Args; usageError?: string } {
  const args: Args = { plan: DEFAULT_PLAN, out: DEFAULT_OUT, toStdout: false };
  for (let index = 0; index < argv.length; index += 1) {
    const flag = argv[index] as string;
    if (flag === "--stdout") {
      args.toStdout = true;
      continue;
    }
    const value = argv[index + 1];
    if (flag !== "--phase-id" && flag !== "--plan" && flag !== "--out") {
      return { usageError: `unknown option ${flag}` };
    }
    if (value === undefined || value.startsWith("--")) {
      return { usageError: `${flag} requires a value` };
    }
    index += 1;
    if (flag === "--phase-id") args.phaseId = value;
    else if (flag === "--plan") args.plan = value;
    else args.out = value;
  }
  if (args.phaseId === undefined) {
    return { usageError: "--phase-id is required" };
  }
  return { args };
}

export function cmdPlan(argv: string[]): number {
  const [subcommand, ...rest] = argv;
  if (subcommand !== "project") {
    process.stderr.write(`${USAGE}\n`);
    return EX_USAGE;
  }
  const parsed = parseArgs(rest);
  if (parsed.args === undefined) {
    process.stderr.write(
      `tiphys plan project: ${parsed.usageError ?? "usage error"}\n${USAGE}\n`,
    );
    return EX_USAGE;
  }
  const { phaseId, plan, out, toStdout } = parsed.args;

  const read = readOperatorPath(plan);
  if (!read.ok) {
    process.stderr.write(`tiphys plan project: ${read.reason}\n`);
    return 1;
  }
  const decoded = decodeDocument(read.body, plan);
  if (!decoded.ok) {
    process.stderr.write(`tiphys plan project: ${decoded.reason}\n`);
    return 1;
  }

  const projection = projectPhase(decoded.value, phaseId as string);
  if (!projection.ok) {
    process.stderr.write(`tiphys plan project: ${projection.reason}\n`);
    return 1;
  }
  const body = renderDeclaration(projection.declaration);

  if (toStdout) {
    process.stdout.write(body);
    return 0;
  }

  mkdirSync(out, { recursive: true });
  const problem = classifyContextDirectory(out);
  if (problem !== undefined) {
    process.stderr.write(`tiphys plan project: ${problem}\n`);
    return 1;
  }
  const target = join(out, projection.filename);
  const refusal = refuseOpenForWrite(target);
  if (refusal !== undefined) {
    process.stderr.write(`tiphys plan project: ${refusal}\n`);
    return 1;
  }
  writeFileSync(target, body, "utf8");
  process.stdout.write(`${target}\n`);
  return 0;
}
