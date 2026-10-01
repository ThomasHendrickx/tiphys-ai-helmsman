/**
 * `tiphys review dispatch` (kernel plan M6, M6-P5; DR-0062).
 *
 *   tiphys review dispatch --role clean-room-reviewer --tier strongest|cheaper
 *     --head <sha> --phase <id> --brief <file> --verdict <path> --out <dir>
 *     [--executor <module>]
 *
 * Creates a detached worktree at --head under <out>/<task id>/, launches the
 * executor there with the brief on stdin, captures its stdout, and writes the
 * review record to <out>/<task id>.json. The orchestrator commits the verdict
 * at its path and the record under delivery/review/records/.
 *
 * Without --executor the module is the one the project's charter.yaml names in
 * `review-executor` (M6-P7); with neither, the dispatch is refused.
 *
 * Exit codes:
 *   0   the record was written, the executor exited 0, one served model was
 *       observed and the verdict was hashed
 *   1   refused before launch, or the record was written with a problem, each
 *       problem printed on its own line
 *   64  usage error (BSD sysexits EX_USAGE)
 */

import { configuredReviewExecutor, dispatchReview, loadReviewExecutor } from "../review.ts";

export const EX_USAGE = 64;

interface Options {
  role?: string;
  tier?: string;
  head?: string;
  phase?: string;
  brief?: string;
  verdict?: string;
  out?: string;
  executor?: string;
}

const REQUIRED: readonly (keyof Options)[] = ["role", "tier", "head", "phase", "brief", "verdict", "out"];

function usage(): string {
  return (
    "usage: tiphys review dispatch --role <role> --tier <strongest|cheaper> --head <sha> --phase <id> " +
    "--brief <file> --verdict <path> --out <dir> [--executor <module>]"
  );
}

function fail(reason: string, code: number): number {
  process.stderr.write(`tiphys review: ${reason}\n`);
  if (code === EX_USAGE) {
    process.stderr.write(`${usage()}\n`);
  }
  return code;
}

function parseArgs(argv: string[]): { options: Options } | { usageError: string } {
  const options: Options = {};
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index] as string;
    const field = argument.startsWith("--") ? (argument.slice(2) as keyof Options) : undefined;
    if (field === undefined || !(REQUIRED.includes(field) || field === "executor")) {
      return { usageError: `unknown argument ${argument}` };
    }
    const value = argv[index + 1];
    if (value === undefined || value.startsWith("--")) {
      return { usageError: `${argument} requires a value` };
    }
    if (options[field] !== undefined) {
      return { usageError: `${argument} given twice` };
    }
    options[field] = value;
    index += 1;
  }
  const missing = REQUIRED.filter((name) => options[name] === undefined);
  if (missing.length > 0) {
    return { usageError: `missing ${missing.map((name) => `--${name}`).join(" ")}` };
  }
  return { options };
}

export async function cmdReview(argv: string[]): Promise<number> {
  const [subcommand, ...rest] = argv;
  if (subcommand !== "dispatch") {
    return fail(subcommand === undefined ? "a subcommand is required" : `unknown subcommand ${subcommand}`, EX_USAGE);
  }
  const parsed = parseArgs(rest);
  if ("usageError" in parsed) {
    return fail(parsed.usageError, EX_USAGE);
  }
  const options = parsed.options as Required<Omit<Options, "executor">> & Pick<Options, "executor">;
  const project = process.cwd();
  let specifier = options.executor;
  if (specifier === undefined) {
    const configured = configuredReviewExecutor(project);
    if (!configured.ok) {
      return fail(`no --executor was given and ${configured.reason}`, 1);
    }
    specifier = configured.specifier;
  }
  const loaded = await loadReviewExecutor(specifier, project);
  if (!loaded.ok) {
    return fail(loaded.reason, 1);
  }
  const outcome = dispatchReview({
    projectDirectory: project,
    role: options.role,
    tier: options.tier,
    head: options.head,
    phase: options.phase,
    briefPath: options.brief,
    verdictPath: options.verdict,
    outDirectory: options.out,
    executor: loaded.executor,
  });
  if (!outcome.ok) {
    return fail(outcome.reason, 1);
  }
  const record = outcome.record;
  process.stdout.write(
    `review ${record.taskId}: head ${record.head}, requested ${record.requestedModel}, observed ` +
      `${record.observation.model ?? "none"}, family ${record.family}, verdict ${record.verdict.path} ` +
      `sha256 ${record.verdict.sha256 ?? "none"}, exit ${record.executorExitCode === null ? "none" : String(record.executorExitCode)}\n` +
      `record: ${outcome.recordPath}\n` +
      (outcome.verdictCopyPath === undefined ? "" : `verdict: ${outcome.verdictCopyPath}\n`),
  );
  for (const problem of outcome.problems) {
    process.stderr.write(`tiphys review: ${problem}\n`);
  }
  return outcome.problems.length === 0 ? 0 : 1;
}
