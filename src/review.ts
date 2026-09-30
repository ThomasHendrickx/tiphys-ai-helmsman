import { spawnSync } from "node:child_process";
import { createHash, randomBytes } from "node:crypto";
import { closeSync, lstatSync, mkdirSync, openSync, readFileSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { homedir } from "node:os";
import { extname, isAbsolute, join, relative, resolve, sep } from "node:path";
import { pathToFileURL } from "node:url";
import {
  boundAtMergeBase,
  describeOffHeadVerdicts,
  listSourceFiles,
  readSourceBytes,
  relateDeclaredHead,
  reviewFamiliesProvenanceLine,
} from "./checks.ts";
import type { HeadRelation, LoadedVerdict, ReviewFamiliesReading, VerdictCorpusSource } from "./checks.ts";
import { loadTypeSchema } from "./commands/validate.ts";
import { CREDENTIAL_STORE_REDIRECTIONS, SCRUB_DIR_NAME, buildChildEnv, refuseExtraAllowlist } from "./exec/env.ts";
import type { ChildEnvExtension } from "./exec/env.ts";
import { singleLine } from "./task.ts";
import { decodeDocument, formatDiagnostics, validateInstance } from "./validate.ts";

/**
 * THE KERNEL LAUNCHES REVIEWERS (kernel plan M6, M6-P5; DR-0062).
 *
 * The kernel dispatches a review, observes which model the harness served, and
 * writes a REVIEW RECORD. The merge gate takes a review's head, its family and
 * whether it counts from that record, and only APPROVE and the findings from
 * the verdict the reviewer wrote (src/gates/merge-preconditions.ts). Nothing the
 * reviewer writes decides identity, head or family: the head is resolved here
 * before launch, the model is observed in the harness's own output stream, and
 * the family is the executor vocabulary's answer for that observed model.
 *
 * THE KERNEL NAMES NO VENDOR (test/schemas.test.ts walks src/ for model names),
 * so the harness side is a contract: the executor module supplies the
 * tier-to-model and model-to-family vocabulary, the command line, and the
 * reading of its own stream. The Claude Code plugin implements it
 * (plugin/src/review.ts); `--executor` names another module.
 */

/** The model tiers of role-model-config.yaml, passed to the executor verbatim. */
export const REVIEW_MODEL_TIERS: readonly string[] = ["strongest", "cheaper"];

/** The roles a review may be dispatched for. */
export const REVIEW_ROLES: readonly string[] = ["clean-room-reviewer"];

/** The family of a model the vocabulary does not name, or of no observed model. Never distinct from anything. */
export const UNKNOWN_FAMILY = "unknown";

export const REVIEW_RECORD_KIND = "review-record";

/** Where a phase's review records are committed, relative to the project. */
export const REVIEW_RECORDS_DIRECTORY = "delivery/review/records";

/** The directory a counted verdict must be committed under. */
const VERDICT_DIRECTORY = "delivery/review/";

const VERDICT_EXTENSION = /\.(ya?ml|json)$/i;

/**
 * The charter field naming the executor module used when `--executor` is not
 * given (M6-P7): project configuration, so a project run by any harness needs
 * no flag and the kernel names no harness package.
 */
export const REVIEW_EXECUTOR_FIELD = "review-executor";

/**
 * The executor module the project's own `charter.yaml` names, or why there is
 * none. Read from the PROJECT directory's working tree, the same root the
 * module is resolved from, never from the review worktree.
 */
export function configuredReviewExecutor(projectDirectory: string): { ok: true; specifier: string } | { ok: false; reason: string } {
  const path = join(projectDirectory, "charter.yaml");
  let text: string;
  try {
    if (!lstatSync(path).isFile()) {
      return { ok: false, reason: `${path} is not a regular file` };
    }
    text = readFileSync(path, "utf8");
  } catch (error) {
    return { ok: false, reason: `${path} could not be read: ${describe(error)}` };
  }
  const decoded = decodeDocument(text, path);
  if (!decoded.ok) {
    return { ok: false, reason: decoded.reason };
  }
  const value = isMapping(decoded.value) ? decoded.value[REVIEW_EXECUTOR_FIELD] : undefined;
  if (typeof value !== "string" || value.trim() === "") {
    return { ok: false, reason: `${path} names no ${REVIEW_EXECUTOR_FIELD}` };
  }
  return { ok: true, specifier: value };
}

/** What an executor read out of one captured run. */
export interface ReviewStreamReading {
  /** The executor's own observation: one served model, or why there is none. */
  observed: { model: string } | { model: null; reason: string };
  /** Distinct models on the top-level turn's rows. */
  topLevelModels: string[];
  /** Distinct models on rows a subagent wrote; reported, never observed. */
  subagentModels: string[];
  totalCostUsd: number | null;
  usage: Record<string, unknown> | null;
  modelUsage: Record<string, unknown> | null;
}

/**
 * What a kernel-launched reviewer may do (DR-0065), as data with no harness in
 * it. The kernel states it once, below, and passes it to the executor's
 * `command`; each executor maps it to its own harness's settings, and one that
 * cannot map a grant faithfully throws, which refuses the dispatch before
 * launch.
 *
 * It bounds an honest reviewer, not a hostile one: an allowed program such as
 * `node` can start any process, and a scrubbed environment does not stop a push
 * through a proxy that supplies credentials (DR-0065, "Known limit").
 */
export interface ReviewerGrant {
  /** It may read the project's files at the reviewed head. */
  readRepository: boolean;
  /** It may create and change files, only inside the review worktree the kernel added. */
  writeReviewWorktree: boolean;
  /** The commands it may run, each the words a command line must begin with. */
  commands: readonly (readonly string[])[];
  /** It may push to a remote. */
  push: boolean;
  /** It may use the harness's own network tools (fetching or searching the web). */
  networkTools: boolean;
}

/** The kernel's reviewer grant (DR-0065, option 1 as the owner decided it). */
export const REVIEWER_GRANT: ReviewerGrant = Object.freeze({
  readRepository: true,
  writeReviewWorktree: true,
  commands: Object.freeze([
    Object.freeze(["node"]),
    Object.freeze(["npm", "run", "build"]),
    Object.freeze(["git", "diff"]),
    Object.freeze(["git", "log"]),
    Object.freeze(["git", "show"]),
    Object.freeze(["git", "grep"]),
    Object.freeze(["git", "status"]),
    Object.freeze(["git", "checkout", "--"]),
  ]),
  push: false,
  networkTools: false,
});

/** The harness side of a review dispatch. */
export interface ReviewExecutor {
  name: string;
  vocabulary: { id: string; version: number };
  modelForTier(tier: string): string | undefined;
  familyOf(model: string): string | undefined;
  /**
   * The argv to run, with no shell, carrying `grant` mapped to the harness's
   * own settings. The brief arrives on stdin.
   */
  command(model: string, prompt: string, grant: ReviewerGrant): string[];
  observe(capturePath: string): ReviewStreamReading;
  /**
   * The variables the harness needs beyond the kernel's scrubbed allowlist to
   * authenticate, each with the reason (M6-P7). Copied from the kernel's own
   * environment when set there. A name in a refused vocabulary (a pull-request
   * credential, a code-execution variable, a proxy) or one with no reason
   * refuses the dispatch before anything is created.
   */
  environment?: readonly ChildEnvExtension[];
}

export interface ReviewRecord {
  kind: typeof REVIEW_RECORD_KIND;
  contractVersion: "1";
  taskId: string;
  role: string;
  phase: string;
  head: string;
  tier: string;
  requestedModel: string;
  executor: string;
  vocabulary: { id: string; version: number };
  observation: {
    model: string | null;
    topLevelModels: string[];
    subagentModels: string[];
    reason: string;
  };
  family: string;
  verdict: { path: string; sha256: string | null; reason: string };
  totalCostUsd: number | null;
  usage: Record<string, unknown> | null;
  modelUsage: Record<string, unknown> | null;
  startedAt: string;
  endedAt: string;
  executorExitCode: number | null;
}

function isMapping(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function describe(error: unknown): string {
  return singleLine(error instanceof Error ? error.message : String(error));
}

/**
 * Why a verdict path is refused, or undefined. The path is relative to the
 * project (the review worktree's copy of it), lies under `delivery/review/`
 * and outside the records directory, so the gate can find and count it.
 */
export function verdictPathFault(path: string): string | undefined {
  if (path === "" || isAbsolute(path) || path.includes("\\")) {
    return "must be a relative path with / separators";
  }
  const segments = path.split("/");
  if (segments.some((segment) => segment === "" || segment === "." || segment === "..")) {
    return "has an empty, . or .. segment";
  }
  if (!path.startsWith(VERDICT_DIRECTORY) || path.startsWith(`${REVIEW_RECORDS_DIRECTORY}/`)) {
    return `must lie under ${VERDICT_DIRECTORY} and outside ${REVIEW_RECORDS_DIRECTORY}/`;
  }
  if (!VERDICT_EXTENSION.test(path)) {
    return "must end in .yaml, .yml or .json";
  }
  return undefined;
}

/** The shape checks an executor module's export must pass before anything is launched. */
export function checkReviewExecutor(value: unknown, where: string): { ok: true; executor: ReviewExecutor } | { ok: false; reason: string } {
  if (!isMapping(value)) {
    return { ok: false, reason: `${where} exports no reviewExecutor object` };
  }
  if (typeof value["name"] !== "string" || value["name"].trim() === "") {
    return { ok: false, reason: `${where} reviewExecutor has no name` };
  }
  const vocabulary = value["vocabulary"];
  if (!isMapping(vocabulary) || typeof vocabulary["id"] !== "string" || vocabulary["id"] === "" || !Number.isInteger(vocabulary["version"])) {
    return { ok: false, reason: `${where} reviewExecutor has no vocabulary {id, version}` };
  }
  for (const method of ["modelForTier", "familyOf", "command", "observe"]) {
    if (typeof value[method] !== "function") {
      return { ok: false, reason: `${where} reviewExecutor.${method} is not a function` };
    }
  }
  if (value["environment"] !== undefined && !Array.isArray(value["environment"])) {
    return { ok: false, reason: `${where} reviewExecutor.environment is not a list` };
  }
  return { ok: true, executor: value as unknown as ReviewExecutor };
}

/**
 * Load an executor module's `reviewExecutor` export.
 *
 * Resolved from the PROJECT directory, never from the review worktree, so a
 * reviewer cannot supply the code that reads its own stream.
 */
export async function loadReviewExecutor(
  specifier: string,
  projectDirectory: string,
): Promise<{ ok: true; executor: ReviewExecutor; resolved: string } | { ok: false; reason: string }> {
  let resolved: string;
  try {
    resolved = createRequire(join(projectDirectory, "package.json")).resolve(specifier);
  } catch (error) {
    return { ok: false, reason: `the review executor ${specifier} could not be resolved from ${projectDirectory}: ${describe(error)}` };
  }
  let module: Record<string, unknown>;
  try {
    module = (await import(pathToFileURL(resolved).href)) as Record<string, unknown>;
  } catch (error) {
    return { ok: false, reason: `the review executor ${specifier} resolved to ${resolved} and could not be loaded: ${describe(error)}` };
  }
  const checked = checkReviewExecutor(module["reviewExecutor"], `${specifier} (${resolved})`);
  return checked.ok ? { ok: true, executor: checked.executor, resolved } : checked;
}

function git(cwd: string, args: string[]): { ok: true; stdout: string } | { ok: false; reason: string } {
  const run = spawnSync("git", args, { cwd, encoding: "utf8" });
  if (run.error !== undefined || run.status !== 0) {
    return { ok: false, reason: `git ${args.join(" ")} failed: ${singleLine(String(run.error ?? run.stderr ?? ""))}` };
  }
  return { ok: true, stdout: run.stdout ?? "" };
}

function compactUtc(date: Date): string {
  return date.toISOString().replace(/[-:]/g, "").replace(/\.\d+Z$/, "z").toLowerCase();
}

/**
 * The observed model the record carries, or null with the reason.
 *
 * The kernel takes the executor's observation only when it agrees with the
 * executor's own row list: exactly one top-level model, and it is the observed
 * one. Anything else is null. The requested model is never a fallback.
 */
export function observedModel(reading: ReviewStreamReading): { model: string | null; reason: string } {
  const top = reading.topLevelModels;
  if (reading.observed.model === null) {
    return { model: null, reason: reading.observed.reason };
  }
  if (top.length !== 1 || top[0] !== reading.observed.model) {
    return {
      model: null,
      reason:
        `the executor observed ${reading.observed.model} while the top-level rows name ` +
        `[${top.join(", ")}], so no single served model is established`,
    };
  }
  return {
    model: reading.observed.model,
    reason:
      `one model on the top-level rows of the captured stream` +
      (reading.subagentModels.length === 0 ? "" : `; subagent rows name [${reading.subagentModels.join(", ")}] and are not the review's model`),
  };
}

export interface DispatchOptions {
  projectDirectory: string;
  role: string;
  tier: string;
  head: string;
  phase: string;
  briefPath: string;
  verdictPath: string;
  outDirectory: string;
  executor: ReviewExecutor;
  now?: () => Date;
  /** The environment the child's allowlisted names are copied from; process.env when absent. */
  parentEnv?: Record<string, string | undefined>;
}

/**
 * The reviewer's environment (M6-P5 fix round 1, CR-M6P5A-02): the kernel's
 * scrubbed child environment, the one `spawnTask` gives a payload, with no
 * extension. The reviewer is an agent standing in a worktree of the project,
 * so a pull-request credential in its environment is one it can use; the
 * allowlist keeps every such name out, and the credential-store pointers
 * (HOME and the rest) point at empty directories under the task directory.
 */
export function reviewChildEnv(
  parentEnv: Record<string, string | undefined>,
  taskDirectory: string,
): { ok: true; env: Record<string, string> } | { ok: false; reason: string } {
  return buildChildEnv({ parentEnv, scrubDir: join(taskDirectory, SCRUB_DIR_NAME) });
}

/**
 * A declared name that is a credential-store pointer (M6-P7 fix round 1,
 * CR-M6P7A-01). `buildChildEnv` redirects HOME and the four other pointers in
 * CREDENTIAL_STORE_REDIRECTIONS to empty harness-owned targets, and the
 * harness's declared variables are copied from the KERNEL's environment, so a
 * declared HOME would hand the reviewer the kernel's own home directory and
 * every credential store under it. The dispatch refuses such a declaration
 * before anything is created; this returns the one line naming it.
 */
export function refuseCredentialStorePointer(entries: readonly ChildEnvExtension[]): string | undefined {
  for (const entry of entries) {
    if (CREDENTIAL_STORE_REDIRECTIONS.some((redirection) => redirection.name === entry.name)) {
      return (
        `the allowlist extension entry ${entry.name} is a credential-store pointer the kernel redirects ` +
        `to an empty harness-owned target, and a declared value would give the reviewer the kernel's own credential store`
      );
    }
  }
  return undefined;
}

/**
 * The harness's declared variables joined onto the reviewer's scrubbed
 * environment (M6-P7), with the credential-store redirections applied LAST
 * again (fix round 1, CR-M6P7A-01). `buildChildEnv` sets the five pointers last
 * so nothing copied before them overrides them; this join runs after it (after
 * the dependency install, so no install script sees the harness's variables),
 * so it restores that ordering itself by setting each pointer back to the
 * target `buildChildEnv` chose. The dispatch refuses a declared pointer before
 * this is reached; this is the second layer, for a join reached without it.
 */
export function applyHarnessEnvironment(
  env: Record<string, string>,
  entries: readonly ChildEnvExtension[],
  parentEnv: Record<string, string | undefined>,
): Record<string, string> {
  const redirected = CREDENTIAL_STORE_REDIRECTIONS.map((redirection) => [redirection.name, env[redirection.name]] as const);
  for (const entry of entries) {
    const value = parentEnv[entry.name];
    if (value !== undefined) {
      env[entry.name] = value;
    }
  }
  for (const [name, target] of redirected) {
    if (target === undefined) {
      delete env[name];
    } else {
      env[name] = target;
    }
  }
  return env;
}

/**
 * The KERNEL's own npm cache (M6-P5 fix round 4), resolved from the kernel's
 * environment the way npm 11 resolves it (@npmcli/config, `loadEnv` and the
 * `cache` definition): `npm_config_cache` when set, else npm's POSIX default,
 * `.npm` under the kernel's HOME (npm's `env.HOME || homedir()`). Never a path
 * in the task directory, whose scrubbed HOME starts empty. An `.npmrc` that
 * sets `cache` is not read here.
 */
function kernelNpmCache(parentEnv: Record<string, string | undefined>): string {
  /* npm's own loop: every case of the name counts, an empty value is
     skipped, and a later entry wins over an earlier one. */
  let configured: string | undefined;
  for (const [name, value] of Object.entries(parentEnv)) {
    if (name.toLowerCase() === "npm_config_cache" && value !== undefined && value !== "") {
      configured = value;
    }
  }
  return configured !== undefined ? resolve(configured) : join(parentEnv["HOME"] || homedir(), ".npm");
}

/**
 * The reviewed head's dependencies, installed by the KERNEL before launch
 * (M6-P5 fix round 3), so a reviewer can build and test without a grant to
 * install anything. Only when the head carries a `package-lock.json` in the
 * review directory: `npm ci` there, in the reviewer's own scrubbed
 * environment, with its output in `npm-ci.txt` in the task directory. Audit
 * and funding requests are left out: they reach the registry and prepare
 * nothing. A lockfile that is not a regular file is refused rather than
 * handed to npm, since its type decides what reading it does.
 *
 * Fix round 4: `--prefer-offline --cache <the kernel's cache>`. Where the
 * registry cannot be reached from the scrubbed environment (a proxy whose CA
 * only the kernel's environment names), the tarballs the operator already
 * fetched install from the cache; where it can, a cache miss still reaches
 * it. The child environment gains nothing, no TLS setting included.
 */
function installReviewDependencies(
  reviewDirectory: string,
  taskDirectory: string,
  env: Record<string, string>,
  cache: string,
): { ok: true } | { ok: false; reason: string } {
  const lockfile = join(reviewDirectory, "package-lock.json");
  let isFile: boolean;
  try {
    isFile = lstatSync(lockfile).isFile();
  } catch {
    return { ok: true };
  }
  if (!isFile) {
    return { ok: false, reason: `${lockfile} is not a regular file, so npm ci was not run` };
  }
  const logPath = join(taskDirectory, "npm-ci.txt");
  let logFd: number | undefined;
  try {
    logFd = openSync(logPath, "wx");
    const run = spawnSync("npm", ["ci", "--prefer-offline", "--cache", cache, "--no-audit", "--no-fund"], {
      cwd: reviewDirectory,
      env,
      stdio: ["ignore", logFd, logFd],
      shell: false,
    });
    if (run.error !== undefined) {
      return { ok: false, reason: `npm ci could not be run in ${reviewDirectory}: ${describe(run.error)}` };
    }
    if (run.status !== 0) {
      return {
        ok: false,
        reason: `npm ci exited ${run.status === null ? "without an exit code" : String(run.status)} in ${reviewDirectory} (output in ${logPath})`,
      };
    }
    return { ok: true };
  } catch (error) {
    return { ok: false, reason: `npm ci failed in ${reviewDirectory}: ${describe(error)}` };
  } finally {
    if (logFd !== undefined) {
      closeSync(logFd);
    }
  }
}

export type DispatchOutcome =
  /** Refused before launch: no worktree was launched into and no record was written. */
  | { ok: false; reason: string }
  /** A record was written. `problems` is empty only when it can count. */
  | {
      ok: true;
      recordPath: string;
      record: ReviewRecord;
      taskDirectory: string;
      /** The verdict's bytes, copied next to the record; absent when the reviewer wrote none. */
      verdictCopyPath: string | undefined;
      problems: string[];
    };

export function dispatchReview(options: DispatchOptions): DispatchOutcome {
  const now = options.now ?? (() => new Date());
  const executor = options.executor;
  const project = resolve(options.projectDirectory);
  if (!REVIEW_ROLES.includes(options.role)) {
    return { ok: false, reason: `--role ${options.role} is not a review role (${REVIEW_ROLES.join(", ")})` };
  }
  if (!REVIEW_MODEL_TIERS.includes(options.tier)) {
    return { ok: false, reason: `--tier ${options.tier} is not one of ${REVIEW_MODEL_TIERS.join(", ")}` };
  }
  if (!/^[a-z0-9][a-z0-9-]*$/.test(options.phase)) {
    return { ok: false, reason: `--phase ${options.phase} is not a phase id (lowercase letters, digits and -)` };
  }
  const pathFault = verdictPathFault(options.verdictPath);
  if (pathFault !== undefined) {
    return { ok: false, reason: `--verdict ${options.verdictPath} ${pathFault}` };
  }
  let brief: string;
  try {
    if (!lstatSync(options.briefPath).isFile()) {
      return { ok: false, reason: `--brief ${options.briefPath} is not a regular file` };
    }
    brief = readFileSync(options.briefPath, "utf8");
  } catch (error) {
    return { ok: false, reason: `--brief ${options.briefPath} could not be read: ${describe(error)}` };
  }
  const commit = git(project, ["rev-parse", "--verify", "--quiet", "--end-of-options", `${options.head}^{commit}`]);
  if (!commit.ok) {
    return { ok: false, reason: `--head ${options.head} does not name a commit in ${project}` };
  }
  const head = commit.stdout.trim().toLowerCase();
  const prefixRun = git(project, ["rev-parse", "--show-prefix"]);
  if (!prefixRun.ok) {
    return { ok: false, reason: prefixRun.reason };
  }
  const prefix = prefixRun.stdout.trim();
  /* A verdict already committed at the path would be hashed whether or not
     the reviewer wrote anything, so the path must be new at the head. */
  const existing = spawnSync("git", ["cat-file", "-e", `${head}:${prefix}${options.verdictPath}`], { cwd: project });
  if (existing.status === 0) {
    return { ok: false, reason: `--verdict ${options.verdictPath} already exists at ${head}; a review writes a new verdict` };
  }
  const requestedModel = executor.modelForTier(options.tier);
  if (requestedModel === undefined || requestedModel === "") {
    return { ok: false, reason: `the executor ${executor.name} names no model for tier ${options.tier}` };
  }
  const harnessEnvironment = executor.environment ?? [];
  const refusedEnvironment = refuseExtraAllowlist(harnessEnvironment, "reason-required");
  if (refusedEnvironment !== undefined) {
    return { ok: false, reason: `the executor ${executor.name} declares an environment the kernel refuses: ${refusedEnvironment}` };
  }
  const refusedPointer = refuseCredentialStorePointer(harnessEnvironment);
  if (refusedPointer !== undefined) {
    return { ok: false, reason: `the executor ${executor.name} declares an environment the kernel refuses: ${refusedPointer}` };
  }

  /* The grant is mapped BEFORE anything is created (M6-P5 fix round 3): an
     executor that cannot map it refuses with no task directory and no
     worktree left behind. */
  const prompt =
    `Review according to the brief on standard input. Write your verdict to ${options.verdictPath}, ` +
    "relative to the current directory.";
  let argv: string[];
  try {
    argv = executor.command(requestedModel, prompt, REVIEWER_GRANT);
  } catch (error) {
    return { ok: false, reason: `the executor ${executor.name} could not build its command: ${describe(error)}` };
  }
  if (!Array.isArray(argv) || argv.length === 0 || argv.some((part) => typeof part !== "string" || part === "")) {
    return { ok: false, reason: `the executor ${executor.name} returned no usable argv` };
  }

  const started = now();
  const taskId = `review-${options.phase}-${compactUtc(started)}-${randomBytes(3).toString("hex")}`;
  const out = resolve(options.outDirectory);
  const taskDirectory = join(out, taskId);
  const worktree = join(taskDirectory, "worktree");
  try {
    mkdirSync(taskDirectory, { recursive: true });
  } catch (error) {
    return { ok: false, reason: `${taskDirectory} could not be created: ${describe(error)}` };
  }
  const parentEnv = options.parentEnv ?? process.env;
  const childEnv = reviewChildEnv(parentEnv, taskDirectory);
  if (!childEnv.ok) {
    return { ok: false, reason: `the reviewer's environment could not be built: ${childEnv.reason}` };
  }
  const added = git(project, ["worktree", "add", "--detach", worktree, head]);
  if (!added.ok) {
    return { ok: false, reason: added.reason };
  }
  const reviewDirectory = join(worktree, prefix);
  const installed = installReviewDependencies(reviewDirectory, taskDirectory, childEnv.env, kernelNpmCache(parentEnv));
  if (!installed.ok) {
    const removed = git(project, ["worktree", "remove", "--force", worktree]);
    return {
      ok: false,
      reason:
        `the reviewer's dependencies could not be installed, so nothing was launched: ${installed.reason}; ` +
        (removed.ok ? "the review worktree was removed" : `the review worktree ${worktree} could not be removed: ${removed.reason}`),
    };
  }

  /* The harness's own variables join the scrubbed environment only now, after
     the dependency install, so no install script of the reviewed head sees
     them; each was refused above unless it carried a reason and named nothing
     in a refused vocabulary and no credential-store pointer (M6-P7), and the
     pointers are redirected again after the join (fix round 1). */
  applyHarnessEnvironment(childEnv.env, harnessEnvironment, parentEnv);

  const streamPath = join(taskDirectory, "stream.jsonl");
  const stderrPath = join(taskDirectory, "stderr.txt");
  const problems: string[] = [];
  const startedAt = now().toISOString();
  let exitCode: number | null = null;
  let outFd: number | undefined;
  let errFd: number | undefined;
  try {
    outFd = openSync(streamPath, "wx");
    errFd = openSync(stderrPath, "wx");
    const run = spawnSync(argv[0] as string, argv.slice(1), {
      cwd: reviewDirectory,
      input: brief,
      stdio: ["pipe", outFd, errFd],
      shell: false,
      env: childEnv.env,
    });
    exitCode = run.status;
    if (run.error !== undefined) {
      problems.push(`the executor could not be run: ${describe(run.error)}`);
    }
  } catch (error) {
    problems.push(`the executor run failed: ${describe(error)}`);
  } finally {
    if (outFd !== undefined) {
      closeSync(outFd);
    }
    if (errFd !== undefined) {
      closeSync(errFd);
    }
  }
  const endedAt = now().toISOString();
  if (exitCode !== 0) {
    problems.push(`the executor exited ${exitCode === null ? "without an exit code" : String(exitCode)}`);
  }

  let reading: ReviewStreamReading;
  try {
    reading = executor.observe(streamPath);
  } catch (error) {
    reading = {
      observed: { model: null, reason: `the executor could not read ${streamPath}: ${describe(error)}` },
      topLevelModels: [],
      subagentModels: [],
      totalCostUsd: null,
      usage: null,
      modelUsage: null,
    };
  }
  const observation = observedModel(reading);
  if (observation.model === null) {
    problems.push(`no served model was observed: ${observation.reason}`);
  }
  const family = observation.model === null ? UNKNOWN_FAMILY : (executor.familyOf(observation.model) ?? UNKNOWN_FAMILY);

  const verdictFile = join(reviewDirectory, options.verdictPath);
  let verdict: ReviewRecord["verdict"];
  let verdictBytes: Buffer | undefined;
  try {
    const stats = lstatSync(verdictFile);
    if (!stats.isFile()) {
      verdict = { path: options.verdictPath, sha256: null, reason: `${verdictFile} is not a regular file` };
    } else {
      verdictBytes = readFileSync(verdictFile);
      const sha256 = createHash("sha256").update(verdictBytes).digest("hex");
      verdict = { path: options.verdictPath, sha256, reason: "sha256 of the bytes the reviewer wrote, read after the executor exited" };
    }
  } catch (error) {
    verdict = { path: options.verdictPath, sha256: null, reason: `the reviewer wrote no verdict: ${describe(error)}` };
  }
  if (verdict.sha256 === null) {
    problems.push(verdict.reason);
  }

  /* The hashed bytes are copied next to the record, so the review worktree
     can go: the verdict the orchestrator commits is this copy. The captured
     stream, stderr and the scrubbed HOME stay in the task directory. */
  let verdictCopyPath: string | undefined;
  if (verdictBytes !== undefined) {
    const copy = join(out, `${taskId}.verdict${extname(options.verdictPath)}`);
    try {
      writeFileSync(copy, verdictBytes, { flag: "wx" });
      verdictCopyPath = copy;
    } catch (error) {
      problems.push(`the verdict could not be copied to ${copy}: ${describe(error)}`);
    }
  }
  /* The worktree the kernel added is removed with its registration, and only
     once the verdict is copied: a verdict that could not be copied is left in
     the worktree for the operator. */
  if (verdictBytes === undefined || verdictCopyPath !== undefined) {
    const removed = git(project, ["worktree", "remove", "--force", worktree]);
    if (!removed.ok) {
      problems.push(`the review worktree ${worktree} could not be removed: ${removed.reason}`);
    }
  }

  const record: ReviewRecord = {
    kind: REVIEW_RECORD_KIND,
    contractVersion: "1",
    taskId,
    role: options.role,
    phase: options.phase,
    head,
    tier: options.tier,
    requestedModel,
    executor: executor.name,
    vocabulary: { id: executor.vocabulary.id, version: executor.vocabulary.version },
    observation: {
      model: observation.model,
      topLevelModels: [...reading.topLevelModels],
      subagentModels: [...reading.subagentModels],
      reason: observation.reason,
    },
    family,
    verdict,
    totalCostUsd: typeof reading.totalCostUsd === "number" ? reading.totalCostUsd : null,
    usage: isMapping(reading.usage) ? reading.usage : null,
    modelUsage: isMapping(reading.modelUsage) ? reading.modelUsage : null,
    startedAt,
    endedAt,
    executorExitCode: exitCode,
  };
  const invalid = formatDiagnostics(validateInstance(loadTypeSchema(REVIEW_RECORD_KIND), record));
  if (invalid.length > 0) {
    problems.push(`the record does not validate against schemas/review-record.schema.json: ${invalid.join("; ")}`);
  }
  const recordPath = join(out, `${taskId}.json`);
  try {
    writeFileSync(recordPath, `${JSON.stringify(record, null, 2)}\n`, { flag: "wx" });
  } catch (error) {
    return { ok: false, reason: `the review ran and its record ${recordPath} could not be written: ${describe(error)}` };
  }
  return { ok: true, recordPath, record, taskDirectory, verdictCopyPath, problems };
}

/* -------------------------------------------------------------------- */
/* Reading committed records, for the merge gate                         */
/* -------------------------------------------------------------------- */

export interface LoadedReviewRecord {
  /** Relative to the context directory. */
  path: string;
  record: ReviewRecord;
}

/**
 * Every review record committed under `delivery/review/records/`.
 *
 * A file there that is not a valid review record is NAMED and never counted,
 * whatever it claims to be: a verdict dropped into this directory is not a
 * record, and the verdict loader skips this directory, so it is not a verdict
 * either.
 */
export function loadReviewRecords(
  contextDirectory: string,
  source: VerdictCorpusSource,
): { ok: true; records: LoadedReviewRecord[]; invalid: { path: string; reason: string }[] } | { ok: false; reason: string } {
  const listed = listSourceFiles(contextDirectory, source, REVIEW_RECORDS_DIRECTORY);
  if (!listed.ok) {
    return { ok: false, reason: `the review records under ${REVIEW_RECORDS_DIRECTORY}/ could not be listed: ${listed.reason}` };
  }
  const schema = loadTypeSchema(REVIEW_RECORD_KIND);
  const records: LoadedReviewRecord[] = [];
  const invalid: { path: string; reason: string }[] = [];
  for (const path of listed.paths) {
    const read = readSourceBytes(contextDirectory, source, path);
    if (read.kind === "error") {
      return { ok: false, reason: `the review record ${path} could not be read: ${read.reason}` };
    }
    if (read.kind === "absent") {
      return { ok: false, reason: `the review record ${path} was listed and is not there` };
    }
    let value: unknown;
    try {
      value = JSON.parse(new TextDecoder().decode(read.bytes));
    } catch (error) {
      invalid.push({ path, reason: `does not parse as JSON (${describe(error)})` });
      continue;
    }
    const diagnostics = formatDiagnostics(validateInstance(schema, value));
    if (diagnostics.length > 0) {
      invalid.push({ path, reason: `is not a valid review record (${diagnostics.slice(0, 3).join("; ")})` });
      continue;
    }
    records.push({ path, record: value as ReviewRecord });
  }
  return { ok: true, records, invalid };
}

/** One review the gate counts: a kernel record and the committed verdict it hashed. */
export interface CountedReview {
  recordPath: string;
  record: ReviewRecord;
  /** Relative to the context directory. */
  verdictPath: string;
  verdict: Record<string, unknown>;
  relation: HeadRelation;
}

/** A committed verdict no counted record names, which does not APPROVE the audited head. */
export interface UnclaimedRefusal {
  path: string;
  /** The verdict's own `verdict` word, printed as written. */
  word: string;
  /** The verdict's own `head`, which admits it here as the base's reading did. */
  head: string;
  relation: HeadRelation;
}

export interface ReviewCount {
  counted: CountedReview[];
  /** Records that do not count, each with the reason. */
  excluded: { path: string; reason: string }[];
  /** Committed verdicts no counted record names. They never count. */
  unclaimed: string[];
  /**
   * The unclaimed verdicts that refuse this head: not APPROVE, and their own
   * `head` is the audited commit or admitted by the ancestry rule. A refusal
   * blocks the merge whether or not the kernel launched it (M6-P5 fix round 1,
   * CR-M6P5A-04): DR-0062 takes an unlaunched review out of the COUNT, and a
   * recorded refusal is not something a merge may ignore.
   */
  refusing: UnclaimedRefusal[];
}

/**
 * Which committed verdicts count for one phase at one head (DR-0062).
 *
 * A verdict counts only through a record: the record is for this phase, it
 * observed a served model, its head is the audited commit or admitted by the
 * paperwork-only ancestry rule (bounded at the merge base), and the sha256 it
 * holds is the sha256 of the verdict's committed bytes. One count per task id
 * and per verdict. Nothing here reads a field the reviewer wrote.
 */
export function countKernelReviews(input: {
  contextDirectory: string;
  source: VerdictCorpusSource;
  records: readonly LoadedReviewRecord[];
  verdicts: readonly LoadedVerdict[];
  auditedHead: string;
  phase: string;
  mergeBase?: string;
}): { ok: true; count: ReviewCount } | { ok: false; reason: string } {
  const { contextDirectory, source, auditedHead } = input;
  const phase = input.phase.toLowerCase();
  const verdictByPath = new Map<string, LoadedVerdict>();
  for (const verdict of input.verdicts) {
    verdictByPath.set(relative(contextDirectory, verdict.path).split(sep).join("/"), verdict);
  }
  const counted: CountedReview[] = [];
  const excluded: { path: string; reason: string }[] = [];
  const taskIds = new Set<string>();
  const verdictPaths = new Set<string>();
  for (const { path, record } of [...input.records].sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0))) {
    if (record.phase !== phase) {
      excluded.push({ path, reason: `is a review of phase ${record.phase}, not of phase ${phase}` });
      continue;
    }
    if (record.observation.model === null) {
      excluded.push({
        path,
        reason: `observed no served model (${record.observation.reason}), so the kernel cannot say which family reviewed and the record does not count`,
      });
      continue;
    }
    if (record.verdict.sha256 === null) {
      excluded.push({ path, reason: `hashed no verdict (${record.verdict.reason})` });
      continue;
    }
    if (record.executorExitCode !== 0) {
      excluded.push({
        path,
        reason:
          `records that the executor exited ${record.executorExitCode === null ? "without an exit code" : String(record.executorExitCode)}, ` +
          "so the kernel recorded a failed run and it does not count",
      });
      continue;
    }
    const relation = boundAtMergeBase(
      contextDirectory,
      record.head,
      input.mergeBase,
      relateDeclaredHead(contextDirectory, record.head, auditedHead),
    );
    if (relation.kind !== "same" && relation.kind !== "evidence-only-ancestor") {
      excluded.push({
        path,
        reason: describeOffHeadVerdicts([{ path: "the record", declared: record.head, relation }], auditedHead)[0] as string,
      });
      continue;
    }
    const verdict = verdictByPath.get(record.verdict.path);
    if (verdict === undefined) {
      excluded.push({
        path,
        reason: `names verdict ${record.verdict.path}, which is not a committed verdict document under delivery/review/`,
      });
      continue;
    }
    const bytes = readSourceBytes(contextDirectory, source, record.verdict.path);
    if (bytes.kind !== "read") {
      return {
        ok: false,
        reason: `the verdict ${record.verdict.path} named by ${path} could not be read to hash it: ${bytes.kind === "error" ? bytes.reason : "absent"}`,
      };
    }
    const sha256 = createHash("sha256").update(bytes.bytes).digest("hex");
    if (sha256 !== record.verdict.sha256) {
      excluded.push({
        path,
        reason:
          `names verdict ${record.verdict.path}, whose committed bytes hash to ${sha256} and not to the recorded ` +
          `${record.verdict.sha256}, so the verdict changed after the kernel hashed it`,
      });
      continue;
    }
    if (taskIds.has(record.taskId)) {
      excluded.push({ path, reason: `repeats task id ${record.taskId}, which is already counted` });
      continue;
    }
    if (verdictPaths.has(record.verdict.path)) {
      excluded.push({ path, reason: `names verdict ${record.verdict.path}, which another record already counts` });
      continue;
    }
    taskIds.add(record.taskId);
    verdictPaths.add(record.verdict.path);
    counted.push({ recordPath: path, record, verdictPath: record.verdict.path, verdict: verdict.record, relation });
  }
  const unclaimed = [...verdictByPath.keys()].filter((path) => !verdictPaths.has(path)).sort();
  const refusing: UnclaimedRefusal[] = [];
  for (const path of unclaimed) {
    const document = (verdictByPath.get(path) as LoadedVerdict).record;
    const word = document["verdict"];
    const declared = document["head"];
    if (word === "APPROVE" || typeof declared !== "string") {
      continue;
    }
    const relation = boundAtMergeBase(
      contextDirectory,
      declared,
      input.mergeBase,
      relateDeclaredHead(contextDirectory, declared, auditedHead),
    );
    if (relation.kind === "same" || relation.kind === "evidence-only-ancestor") {
      refusing.push({ path, word: typeof word === "string" ? word : JSON.stringify(word), head: declared, relation });
    }
  }
  return { ok: true, count: { counted, excluded, unclaimed, refusing } };
}

/**
 * The pair tier's family rule over the counted reviews (DR-0062, DR-0038).
 *
 * Green when the kernel-recorded families of the counted reviews include two
 * distinct known families, or when the charter declares exactly one family
 * available and every counted review was observed on it. `unknown` is never
 * distinct from anything. The declaration is falsified by any committed record
 * observed on a known family it does not list.
 *
 * A family token means what the vocabulary that minted it says, so counted
 * reviews minted under different vocabulary ids are not comparable and the
 * rule is red, naming the ids (M6-P5 fix round 1, CR-M6P5A-05; the same refusal
 * src/model-resolution.ts makes). A committed record minted under another
 * vocabulary than the counted reviews neither supports nor contradicts the
 * declaration, and is named as not comparable.
 *
 * M6-P7 (DR-0065): tokens from different vocabularies ARE comparable when every
 * one of them is a member of charter.yaml's `review-families.available`,
 * because the project has then declared them in one list. A token outside the
 * list keeps the refusal, and is named.
 */
export function judgeFamilies(
  counted: readonly CountedReview[],
  declaration: ReviewFamiliesReading,
  allRecords: readonly LoadedReviewRecord[],
): { ok: boolean; exceptionUsed: boolean; sentence: string } {
  const families = counted.map((review) => review.record.family);
  const named = counted.map((review) => `${review.record.taskId} ${review.record.family}`).join(", ");
  const vocabularies = [...new Set(counted.map((review) => review.record.vocabulary.id))].sort();
  if (vocabularies.length > 1) {
    const listed = declaration.kind === "declared" ? declaration.families : [];
    const outside = [...new Set(families.filter((family) => !listed.includes(family)))].sort();
    if (outside.length > 0) {
      return {
        ok: false,
        exceptionUsed: false,
        sentence:
          `the counted reviews were minted under different family vocabularies, ${vocabularies.join(" and ")} ` +
          `(${counted.map((review) => `${review.record.taskId} ${review.record.vocabulary.id}`).join(", ")}), ` +
          "so their family tokens are not comparable and no family rule can be judged from them: " +
          (declaration.kind === "declared"
            ? `[${outside.join(", ")}] outside charter.yaml review-families.available [${listed.join(", ")}]`
            : `charter.yaml declares no review-families.available to compare [${outside.join(", ")}] in`),
      };
    }
  }
  const vocabulary = vocabularies[0];
  const known = [...new Set(families.filter((family) => family !== UNKNOWN_FAMILY))].sort();
  if (known.length >= 2) {
    return {
      ok: true,
      exceptionUsed: false,
      sentence: `the counted reviews were observed on ${String(known.length)} distinct families (${named}), from the kernel's records`,
    };
  }
  if (declaration.kind !== "declared") {
    return {
      ok: false,
      exceptionUsed: false,
      sentence:
        `the counted reviews were observed on [${families.join(", ")}] (${named}), not two distinct families, and ` +
        "charter.yaml declares no single-family exception (DR-0038)",
    };
  }
  if (declaration.families.length !== 1) {
    return {
      ok: false,
      exceptionUsed: false,
      sentence:
        `the counted reviews were observed on [${families.join(", ")}] (${named}), not two distinct families, and ` +
        `charter.yaml declares ${String(declaration.families.length)} families available, so the single-family exception does not apply`,
    };
  }
  const declared = declaration.families[0] as string;
  const off = families.filter((family) => family !== declared);
  if (off.length > 0) {
    return {
      ok: false,
      exceptionUsed: false,
      sentence:
        `the counted reviews were observed on [${families.join(", ")}] (${named}), and the single-family exception ` +
        `covers only the declared family ${declared}`,
    };
  }
  const comparable = allRecords.filter((entry) => entry.record.vocabulary.id === vocabulary);
  const incomparable = allRecords.filter((entry) => entry.record.vocabulary.id !== vocabulary);
  const contradicting = comparable.filter(
    (entry) => entry.record.family !== UNKNOWN_FAMILY && !declaration.families.includes(entry.record.family),
  );
  if (contradicting.length > 0) {
    return {
      ok: false,
      exceptionUsed: false,
      sentence:
        `charter.yaml declares only ${declared} available, and the committed record(s) ` +
        `${contradicting.map((entry) => `${entry.path} (${entry.record.family})`).join(", ")} observed another family, ` +
        "so the declaration is contradicted and the exception does not apply (DR-0038)",
    };
  }
  return {
    ok: true,
    exceptionUsed: true,
    sentence:
      `SINGLE-FAMILY EXCEPTION USED (DR-0038): the counted reviews were observed on one family (${named}), ` +
      `the one family charter.yaml declares available (reason: ${declaration.reason}); ` +
      reviewFamiliesProvenanceLine(declaration.provenance) +
      (incomparable.length === 0
        ? ""
        : `; not comparable with the declaration, minted under another vocabulary than ${String(vocabulary)}: ` +
          incomparable.map((entry) => `${entry.path} (${entry.record.vocabulary.id})`).join(", ")),
  };
}
