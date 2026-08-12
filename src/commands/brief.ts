/**
 * `tiphys brief compose --role <id> --phase <plan-file> --phase-id <id>
 * [--out <file>]` (kernel plan M3, M3-P5 step 6).
 *
 * Resolves `roles/<id>.md` from the installed kernel, checks every
 * mandated-reading path, expands the shared clause include, and emits the
 * composed brief: the frontmatter-driven header (which carries the resolved
 * mandated-reading list, in order), the brief body, the named phase rendered
 * from the plan instance, and the fleet warnings file when one is present.
 *
 * Exit codes:
 *   0   the brief composed
 *   1   a resolution failed, and the reason names what
 *   64  usage error (BSD sysexits EX_USAGE)
 *
 * WHAT THIS COMMAND WRITES IS WHAT `tiphys spawn --brief` CONSUMES.
 * `src/brief.ts` stays the assembly spawn performs at launch and is not
 * rewritten here, so no M1 contract changes (M3-P5 step 6, and CR-521's
 * lesson that patching another phase's module from this one is its own
 * defect).
 *
 * D-M3-27, AND IT IS THE POINT OF THE COMMAND RATHER THAN A GARNISH. This
 * command's entire job is resolving and reading paths it did not create:
 * a role file named by an operator flag, a plan file named by another, every
 * mandated-reading entry a brief declares, an included clause block, an
 * output file, and the fleet warnings file. Every one of those goes through
 * `classifyEntry` or `refuseOpenForWrite` in src/task.ts, so a named pipe at
 * any of them is a reported refusal naming the path and the observed entry
 * type in bounded time. Nothing here opens a path whose type has not been
 * established, and this module adds no thirteenth instance to the open class
 * `delivery/STATE.md` records against src/brief.ts, src/hooks.ts and
 * src/pool.ts.
 */

import { writeFileSync } from "node:fs";
import { join } from "node:path";
import {
  REVIEW_CONTRACTS,
  REVIEW_CONTRACT_ROLE,
  ROLE_IDS,
  clauseRoundTripDiagnostics,
  expandIncludes,
  kernelRoot,
  missingRequiredSections,
  renderPhase,
  resolveMandatedReading,
  selectReviewContract,
  splitFrontmatter,
} from "../roles.ts";
import { refuseOpenForWrite, readRegularFileIfPresent } from "../task.ts";
import { decodeDocument, formatDiagnostics, readOperatorPath } from "../validate.ts";

/** Exit code for usage errors, per BSD sysexits EX_USAGE. */
export const EX_USAGE = 64;

/**
 * The fleet's environment-warnings file, the same name src/brief.ts appends
 * at spawn (`WARNINGS_FILE`). Composition has no fleet argument in the usage
 * the plan fixes, so it looks for the file in the CURRENT WORKING DIRECTORY,
 * which is the fleet root when an operator composes inside a fleet. Stated
 * here rather than left implicit, because "the fleet warnings file" names a
 * location the command is not given.
 */
export const WARNINGS_FILE = "warnings.md";

export interface ComposeOptions {
  roleId: string;
  planFile: string;
  phaseId: string;
  /** The installed kernel root. Injected so tests can stage one. */
  root: string;
  /** Where to look for the fleet warnings file. */
  workingDirectory: string;
  /**
   * Which review contract the clean-room brief is running (M3-P6 criterion 10,
   * T-007). `undefined` means the caller named none, which DEFAULTS to
   * `criteria` for the one role that has contracts and is a usage error for
   * every other role. The default is not a shrug: `criteria` is the contract
   * R-053 already described and the one every existing dispatch means, so the
   * three briefs M3-P5 shipped and every caller that predates this flag keep
   * composing unchanged.
   */
  reviewContract?: string;
}

export type ComposeResult =
  | { ok: true; text: string }
  | { ok: false; reason: string };

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}

function stringList(value: unknown): string[] {
  return Array.isArray(value) ? value.map((entry) => String(entry)) : [];
}

/**
 * Compose one brief. Exported so tests drive every arm without a subprocess
 * and, more importantly, against a STAGED kernel root: the missing-path arm
 * (criterion 2) and the named-pipe arm (criterion 6c) both need a role brief
 * pointing at a path this repository must not ship.
 */
export function composeBrief(options: ComposeOptions): ComposeResult {
  if (!ROLE_IDS.includes(options.roleId)) {
    return {
      ok: false,
      reason: `unknown role ${options.roleId}; the roles are ${ROLE_IDS.join(", ")}`,
    };
  }
  const rolesDirectory = join(options.root, "roles");
  const rolePath = join(rolesDirectory, `${options.roleId}.md`);
  const roleRead = readOperatorPath(rolePath);
  if (!roleRead.ok) {
    return { ok: false, reason: `role brief ${rolePath}: ${roleRead.reason}` };
  }

  const split = splitFrontmatter(roleRead.body, rolePath);
  if (!split.ok) {
    return { ok: false, reason: split.reason };
  }
  const decoded = decodeDocument(split.frontmatter, `${rolePath} frontmatter`);
  if (!decoded.ok) {
    return { ok: false, reason: decoded.reason };
  }
  const frontmatter = asRecord(decoded.value);
  if (frontmatter === undefined) {
    return {
      ok: false,
      reason: `${rolePath} frontmatter is not a mapping, so it carries no role-brief fields`,
    };
  }

  const reading = stringList(frontmatter["mandated-reading"]);
  const resolution = resolveMandatedReading(reading, options.root);
  if (!resolution.ok) {
    return { ok: false, reason: resolution.reason };
  }

  const expanded = expandIncludes(split.body, rolesDirectory, rolePath);
  if (!expanded.ok) {
    return { ok: false, reason: expanded.reason };
  }

  /* R-033a, CRITERION 2. Checked on the INCLUDE-EXPANDED body and only for the
     implementer, because R-033a is the implementer brief's template and no
     other role's row enumerates sections. A brief that has lost one is refused
     HERE rather than emitted with a hole, because the failure mode this guards
     is a brief that reads complete: five sections and no gate list composes
     cleanly, dispatches cleanly, and instructs an agent to pass gates it was
     never shown. */
  if (options.roleId === "implementer") {
    const missing = missingRequiredSections(expanded.text);
    if (missing.length > 0) {
      return { ok: false, reason: `${rolePath}: ${missing.join("; ")}` };
    }
  }

  /* T-007, CRITERION 10. The composed brief declares ONE contract and carries
     one contract's clauses. The flag is refused for any other role rather than
     ignored: silently accepting it would let a dispatch believe it had selected
     a contract for a role that has none. */
  let body = expanded.text;
  let reviewContract: string | undefined;
  if (options.roleId === REVIEW_CONTRACT_ROLE) {
    reviewContract = options.reviewContract ?? "criteria";
    if (!REVIEW_CONTRACTS.includes(reviewContract)) {
      return {
        ok: false,
        reason: `unknown review contract ${reviewContract}; the contracts are ${REVIEW_CONTRACTS.join(", ")}`,
      };
    }
    const selected = selectReviewContract(body, reviewContract);
    if (!selected.ok) {
      return { ok: false, reason: selected.reason };
    }
    body = selected.text;
  } else if (options.reviewContract !== undefined) {
    return {
      ok: false,
      reason: `--review-contract applies to ${REVIEW_CONTRACT_ROLE} and ${options.roleId} declares no review contracts`,
    };
  }

  const planRead = readOperatorPath(options.planFile);
  if (!planRead.ok) {
    return { ok: false, reason: `plan ${options.planFile}: ${planRead.reason}` };
  }
  const planDecoded = decodeDocument(planRead.body, options.planFile);
  if (!planDecoded.ok) {
    return { ok: false, reason: planDecoded.reason };
  }
  const plan = asRecord(planDecoded.value);
  const phases = Array.isArray(plan?.["phases"]) ? (plan["phases"] as unknown[]) : [];
  const phase = phases
    .map((candidate) => asRecord(candidate))
    .find((candidate) => candidate?.["id"] === options.phaseId);
  if (phase === undefined) {
    return {
      ok: false,
      reason: `${options.planFile} declares no phase with id ${options.phaseId}`,
    };
  }

  const lines: string[] = [
    `# Brief: ${options.roleId}`,
    "",
    `role: ${String(frontmatter["role"] ?? options.roleId)}`,
    `lifetime: ${String(frontmatter["lifetime"] ?? "")}`,
    `model-tier: ${String(frontmatter["model-tier"] ?? "")}`,
    ...(reviewContract === undefined ? [] : [`review-contract: ${reviewContract}`]),
    "",
    "## Mandated reading, in order",
    "",
  ];
  for (let index = 0; index < resolution.paths.length; index += 1) {
    lines.push(`${String(index + 1)}. ${resolution.paths[index] as string}`);
  }
  lines.push("");
  lines.push("## Sees");
  lines.push("");
  for (const entry of stringList(frontmatter["sees"])) {
    lines.push(`- ${entry}`);
  }
  lines.push("");
  lines.push("## Never");
  lines.push("");
  for (const entry of stringList(frontmatter["never"])) {
    lines.push(`- ${entry}`);
  }
  lines.push("");
  lines.push("## Verifiers");
  lines.push("");
  for (const entry of stringList(frontmatter["verifiers"])) {
    lines.push(`- ${entry}`);
  }
  lines.push("");
  lines.push("## Outputs");
  lines.push("");
  for (const entry of stringList(frontmatter["outputs"])) {
    lines.push(`- ${entry}`);
  }
  lines.push("");
  lines.push("# Brief body");
  lines.push("");
  lines.push(body.replace(/^\n+/, "").replace(/\n+$/, ""));
  lines.push("");
  lines.push(...renderPhase(phase));

  const warnings = readRegularFileIfPresent(
    join(options.workingDirectory, WARNINGS_FILE),
  );
  if (warnings.kind === "refused") {
    return { ok: false, reason: warnings.reason };
  }
  if (warnings.kind === "read") {
    lines.push("# Environment warnings");
    lines.push("");
    lines.push(warnings.body.replace(/\n+$/, ""));
    lines.push("");
  }

  return { ok: true, text: `${lines.join("\n").replace(/\n+$/, "")}\n` };
}

interface Options {
  role?: string;
  phase?: string;
  phaseId?: string;
  out?: string;
  reviewContract?: string;
}

function usage(): string {
  return (
    "usage: tiphys brief compose --role <" +
    ROLE_IDS.join(" | ") +
    "> --phase <plan-file> --phase-id <id> [--out <file>] " +
    `[--review-contract <${REVIEW_CONTRACTS.join(" | ")}>]`
  );
}

function parseArgs(argv: string[]): { options?: Options; usageError?: string } {
  const options: Options = {};
  const flags = new Map<string, keyof Options>([
    ["--role", "role"],
    ["--phase", "phase"],
    ["--phase-id", "phaseId"],
    ["--out", "out"],
    ["--review-contract", "reviewContract"],
  ]);
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index] as string;
    const field = flags.get(argument);
    if (field === undefined) {
      return { usageError: `unknown option ${argument}` };
    }
    const value = argv[index + 1];
    if (value === undefined || value.startsWith("--")) {
      return { usageError: `${argument} requires a value` };
    }
    options[field] = value;
    index += 1;
  }
  const optional = new Set<keyof Options>(["out", "reviewContract"]);
  for (const [flag, field] of flags) {
    if (!optional.has(field) && options[field] === undefined) {
      return { usageError: `${flag} is required` };
    }
  }
  return { options };
}

function cmdCompose(argv: string[]): number {
  const parsed = parseArgs(argv);
  if (parsed.options === undefined) {
    process.stderr.write(`tiphys brief compose: ${parsed.usageError ?? "usage error"}\n`);
    process.stderr.write(`${usage()}\n`);
    return EX_USAGE;
  }
  const { role, phase, phaseId, out, reviewContract } = parsed.options;

  let root: string;
  try {
    root = kernelRoot();
  } catch (error) {
    process.stderr.write(`tiphys brief compose: ${(error as Error).message}\n`);
    return 1;
  }

  const composed = composeBrief({
    roleId: role as string,
    planFile: phase as string,
    phaseId: phaseId as string,
    root,
    workingDirectory: process.cwd(),
    ...(reviewContract === undefined ? {} : { reviewContract }),
  });
  if (!composed.ok) {
    process.stderr.write(`tiphys brief compose: ${composed.reason}\n`);
    return 1;
  }

  if (out === undefined) {
    process.stdout.write(composed.text);
    return 0;
  }
  const refusal = refuseOpenForWrite(out);
  if (refusal !== undefined) {
    process.stderr.write(`tiphys brief compose: ${refusal}\n`);
    return 1;
  }
  writeFileSync(out, composed.text);
  return 0;
}

/**
 * Validate one role brief's clause round trip. Used by
 * `tiphys validate --type role-brief` after the frontmatter passes its
 * schema, and exported here so the two live beside the include that makes
 * them necessary.
 */
export function roleBriefBodyDiagnostics(
  briefPath: string,
  body: string,
  clauses: readonly string[],
): { ok: true; lines: string[] } | { ok: false; reason: string } {
  const expanded = expandIncludes(body, dirnameOf(briefPath), briefPath);
  if (!expanded.ok) {
    return { ok: false, reason: expanded.reason };
  }
  return {
    ok: true,
    lines: formatDiagnostics(clauseRoundTripDiagnostics(clauses, expanded.text)),
  };
}

function dirnameOf(path: string): string {
  const index = Math.max(path.lastIndexOf("/"), path.lastIndexOf("\\"));
  return index === -1 ? "." : path.slice(0, index);
}

/** `tiphys brief <subcommand>`. */
export function cmdBrief(argv: string[]): number {
  const [subcommand, ...rest] = argv;
  if (subcommand === "compose") {
    return cmdCompose(rest);
  }
  process.stderr.write(
    `tiphys brief: ${subcommand === undefined ? "a subcommand is required" : `unknown subcommand ${subcommand}`}\n`,
  );
  process.stderr.write(`${usage()}\n`);
  return EX_USAGE;
}
