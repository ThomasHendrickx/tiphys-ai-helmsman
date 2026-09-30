import { readFileSync } from "node:fs";
import type { ReviewExecutor, ReviewerGrant, ReviewStreamReading } from "@tiphys/kernel";

/**
 * THE CODEX REVIEW EXECUTOR (kernel plan M6, M6-P7; DR-0065).
 *
 * The kernel's `tiphys review dispatch --executor ./adapters/codex/review.ts`
 * runs `codex exec` with this argv, no shell, the brief on stdin (which
 * `codex exec` appends to the prompt as a `<stdin>` block) and stdout captured
 * to a file. With `--json` that capture is one JSON event per line. Every flag
 * below is quoted from the installed CLI's own `codex exec --help`
 * (@openai/codex 0.159.2), and every `-c` key was checked against that CLI,
 * not written from memory: delivery/work-history/m6-p7.md, steps 1 and 2.
 */

export const REVIEW_EXECUTOR_NAME = "codex";

/** This vocabulary's identity, which is all the kernel reads of it. */
export const VOCABULARY_ID = "codex-model-vendors";

/** Bumped when a token's MEANING changes, never when a model is added. */
export const VOCABULARY_VERSION = 1;

/**
 * TIER to MODEL. Both ids are in the model list `GET /v1/models` returned to
 * this environment's key on 2026-09-30 AND in the installed CLI's own bundled
 * catalog (`codex debug models --bundled`), where the first reads "Frontier
 * intelligence for the most demanding work." and the second "Fast and
 * affordable model for easier tasks."
 */
export const TIER_MODELS: readonly (readonly [string, string])[] = [
  ["strongest", "gpt-6-astra"],
  ["cheaper", "gpt-6-luna"],
];

/**
 * MODEL ID PREFIX to FAMILY TOKEN. A family is the vendor (DR-0062), and every
 * model this harness is asked for or observed on through its default provider
 * is one vendor's. An id no row names is `undefined`, which the kernel records
 * as `unknown`, never as a confident wrong answer.
 */
export const FAMILY_PREFIXES: readonly (readonly [string, string])[] = [["gpt-", "openai"]];

export function modelForTier(tier: string): string | undefined {
  return TIER_MODELS.find(([name]) => name === tier)?.[1];
}

export function familyOf(modelId: string): string | undefined {
  return FAMILY_PREFIXES.find(([prefix]) => modelId.startsWith(prefix))?.[1];
}

/**
 * The one variable this harness needs beyond the kernel's scrubbed allowlist,
 * the API key `codex exec` reads. Measured 2026-09-30, both with this argv: in
 * the scrubbed environment (PATH, an empty HOME, TMPDIR) every request was
 * refused `401 Unauthorized: Missing bearer or basic authentication`, and the
 * same with `OPENAI_API_KEY` set, since `codex exec` does not read that name;
 * the agent proxy supplies no credential for that host. The binary names
 * `CODEX_API_KEY` beside it ("API key login is required, CODEX_API_KEY"), and
 * with it set the run authenticated (delivery/work-history/m6-p7.md, step 3).
 * The kernel refuses a declared name that is a pull-request credential, a
 * code-execution variable or a proxy, or that carries no reason.
 */
export const HARNESS_ENVIRONMENT: readonly { name: string; reason: string }[] = [
  {
    name: "CODEX_API_KEY",
    reason:
      "codex exec authenticates to the model API with it; without it every request is refused 401. " +
      "The argv excludes it from every command the reviewer runs (shell_environment_policy.exclude).",
  },
];

function toml(value: string): string {
  return JSON.stringify(value);
}

/**
 * The kernel's reviewer grant (DR-0065) as this CLI's sandbox and approval
 * settings.
 *
 * - Writes: `--sandbox workspace-write` lets commands write in the working
 *   directory, which is the review directory the kernel launches in. By
 *   default that mode ALSO lets them write `/tmp` and `$TMPDIR`, so
 *   `sandbox_workspace_write.exclude_slash_tmp` and `exclude_tmpdir_env_var`
 *   are set, which leaves the review directory the only writable root. With
 *   no writes granted the mode is `read-only`.
 * - No network: `sandbox_workspace_write.network_access=false`. The sandbox
 *   refuses network to every command, so an allowed program cannot push or
 *   fetch either (measured with `codex sandbox`: DNS fails inside it).
 * - No approvals: `approval_policy="never"`, so the reviewer cannot ask to run
 *   a command outside the sandbox. `-a` is not a `codex exec` flag, hence `-c`.
 * - No network tools: `web_search="disabled"`.
 * - Nothing the reviewed head carries widens this: `--ignore-rules` (a
 *   project's execpolicy rules can let a command run outside the sandbox) and
 *   `--ignore-user-config`; `--ephemeral` keeps session files off disk.
 * - The harness's own credential is excluded from the commands' environment
 *   (`shell_environment_policy`), so a reviewer cannot write it into a verdict.
 *
 * WHAT THIS CLI CANNOT BOUND, stated rather than widened around:
 * - THE COMMAND LIST. The sandbox bounds what a command can touch, not which
 *   program it is. `codex exec --help` has no flag that limits commands to a
 *   list, and its execpolicy rules live in files, where `allow` means "run
 *   outside the sandbox", which is wider. So any program runs, inside the
 *   write and network bounds above; `grant.commands` is checked for shape and
 *   is not otherwise expressed.
 * - READS. The sandbox reads the whole filesystem, not only the repository.
 *   The Claude Code executor has the same limit.
 * A grant this mapping cannot express faithfully (a push, network tools, no
 * reads) throws, and the kernel then refuses the dispatch.
 */
export function sandboxArgs(grant: ReviewerGrant): string[] {
  if (grant.readRepository !== true) {
    throw new Error("the grant withholds reads of the repository, which this CLI's sandbox allows in every mode");
  }
  if (grant.push !== false) {
    throw new Error("the grant allows a push, which this executor does not map");
  }
  if (grant.networkTools !== false) {
    throw new Error("the grant allows network tools, which this executor does not map");
  }
  for (const words of grant.commands) {
    if (!Array.isArray(words) || words.length === 0 || words.some((word) => typeof word !== "string" || !/^[A-Za-z0-9._/=@+-]+$/.test(word))) {
      throw new Error(`the granted command ${JSON.stringify(words)} is not a list of plain words`);
    }
  }
  const excluded = `[${HARNESS_ENVIRONMENT.map((entry) => toml(entry.name)).join(", ")}]`;
  return [
    "--sandbox",
    grant.writeReviewWorktree === true ? "workspace-write" : "read-only",
    "--ephemeral",
    "--ignore-user-config",
    "--ignore-rules",
    "-c",
    `approval_policy=${toml("never")}`,
    "-c",
    "sandbox_workspace_write.network_access=false",
    "-c",
    "sandbox_workspace_write.exclude_slash_tmp=true",
    "-c",
    "sandbox_workspace_write.exclude_tmpdir_env_var=true",
    "-c",
    `web_search=${toml("disabled")}`,
    "-c",
    `shell_environment_policy.inherit=${toml("all")}`,
    "-c",
    `shell_environment_policy.exclude=${excluded}`,
  ];
}

/** The `codex exec` invocation for one review, carrying the grant; the prompt is the last argument. */
export function reviewArgv(model: string, prompt: string, grant: ReviewerGrant): string[] {
  return ["codex", "exec", "--json", "--model", model, ...sandboxArgs(grant), prompt];
}

function isMapping(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * Why no served model is observed from a `codex exec --json` capture.
 *
 * MEASURED, NOT ASSUMED: the real capture at
 * test/fixtures/review-dispatch/codex-luna.stream.jsonl:1 (CLI 0.159.2,
 * `--model gpt-6-luna`) carries `thread.started` (a thread id), `turn.started`,
 * `item.*` rows and `turn.completed` (token usage), and no `model` key on any
 * row. The binary reads the served model from the API's `openai-model`
 * response header internally and prints none of it here. The only text naming
 * a model would be the reviewer's own messages, which are never an
 * observation, and the requested model is never a fallback (src/review.ts,
 * `observedModel`). So a Codex review record observes no model, its family is
 * `unknown`, and the merge gate does not count it.
 */
export const NO_SERVED_MODEL =
  "codex exec --json names no served model on any event it writes (thread, turn and item rows carry none), " +
  "and neither the reviewer's own text nor the requested model is an observation";

/**
 * Token usage from every `turn.completed` row, summed per numeric field (one
 * turn per `codex exec` run in the capture). No such row reads as null. The
 * CLI reports tokens and no cost, so the cost is null.
 */
export function readUsage(rows: readonly Record<string, unknown>[]): Record<string, unknown> | null {
  let usage: Record<string, number> | null = null;
  for (const row of rows) {
    if (row["type"] !== "turn.completed" || !isMapping(row["usage"])) {
      continue;
    }
    usage ??= {};
    for (const [name, value] of Object.entries(row["usage"])) {
      if (typeof value === "number" && Number.isFinite(value)) {
        usage[name] = (usage[name] ?? 0) + value;
      }
    }
  }
  return usage;
}

/** Read one captured `codex exec --json` stream. */
export function readReviewStream(path: string): ReviewStreamReading {
  const rows: Record<string, unknown>[] = [];
  let unreadable: string | undefined;
  try {
    for (const line of readFileSync(path, "utf8").split("\n")) {
      if (line.trim() === "") {
        continue;
      }
      try {
        const row: unknown = JSON.parse(line);
        if (isMapping(row)) {
          rows.push(row);
        }
      } catch {
        continue;
      }
    }
  } catch (error) {
    unreadable = `${path} could not be read: ${error instanceof Error ? error.message : String(error)}`;
  }
  const failed = rows.some((row) => row["type"] === "turn.failed");
  return {
    observed: {
      model: null,
      reason: unreadable ?? (failed ? `the run failed (a turn.failed row); ${NO_SERVED_MODEL}` : NO_SERVED_MODEL),
    },
    topLevelModels: [],
    subagentModels: [],
    totalCostUsd: null,
    usage: readUsage(rows),
    modelUsage: null,
  };
}

export const reviewExecutor: ReviewExecutor & { environment: readonly { name: string; reason: string }[] } = {
  name: REVIEW_EXECUTOR_NAME,
  vocabulary: { id: VOCABULARY_ID, version: VOCABULARY_VERSION },
  modelForTier,
  familyOf,
  command: reviewArgv,
  observe: readReviewStream,
  environment: HARNESS_ENVIRONMENT,
};
