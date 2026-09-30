import { readFileSync } from "node:fs";
import type { ReviewExecutor, ReviewerGrant, ReviewStreamReading } from "@tiphys/kernel";
import { assistantModelsIn, observeServedModel } from "./model-resolution.ts";
import { familyOf, modelForTier, vocabularyIdentity } from "./vocabulary.ts";

/**
 * THE CLAUDE CODE REVIEW EXECUTOR (kernel plan M6, M6-P5; DR-0062).
 *
 * The kernel's `tiphys review dispatch` runs the headless CLI with this argv,
 * no shell, the brief on stdin, and stdout captured to a file. That capture IS
 * a transcript: one JSON row per line, `type: "assistant"` rows naming
 * `message.model`, and a final `type: "result"` row carrying the run's cost
 * and token usage. Measured, and committed as the fixture
 * test/fixtures/review-dispatch/haiku-with-sonnet-subagent.stream.jsonl:1.
 */

export const REVIEW_EXECUTOR_NAME = "claude-code";

/**
 * The kernel's reviewer grant (DR-0065) as this CLI's permission flags. The
 * flag and rule syntax is checked against Claude Code 2.1.285's own `--help`
 * and its permissions documentation, quoted in the M6-P5 work history (fix
 * round 2), not written from memory.
 *
 * - Writes: `--permission-mode acceptEdits`, which accepts file edits in the
 *   working directory (the review directory) only, and `Edit(./**)`, anchored
 *   there. A path-less `Write` or `Edit` rule matches at the tool level
 *   everywhere, which is wider than the grant.
 * - Reads: `Read(./**)`, anchored the same way; Glob and Grep follow Read rules.
 * - Commands: one `Bash(<words> *)` rule per granted command. A trailing ` *`
 *   also matches the bare command, and the space keeps `git log *` from
 *   matching another program that starts with the same letters.
 * - No network tools: `WebFetch` and `WebSearch` are denied, because WebFetch
 *   fetches a built-in set of documentation domains without a prompt.
 * - No push: `Bash(git push *)` is denied.
 *
 * A grant this mapping cannot express faithfully throws, and the kernel then
 * refuses the dispatch.
 */
function permissionArgs(grant: ReviewerGrant): string[] {
  if (grant.readRepository !== true) {
    throw new Error("the grant withholds reads of the repository, which this CLI allows in every permission mode");
  }
  if (grant.push !== false) {
    throw new Error("the grant allows a push, which this executor does not map");
  }
  if (grant.networkTools !== false) {
    throw new Error("the grant allows network tools, which this executor does not map");
  }
  const allowed = ["Read(./**)"];
  if (grant.writeReviewWorktree === true) {
    allowed.push("Edit(./**)");
  }
  for (const words of grant.commands) {
    if (!Array.isArray(words) || words.length === 0 || words.some((word) => typeof word !== "string" || !/^[A-Za-z0-9._/=@+-]+$/.test(word))) {
      throw new Error(`the granted command ${JSON.stringify(words)} is not a list of plain words`);
    }
    allowed.push(`Bash(${words.join(" ")} *)`);
  }
  return [
    "--permission-mode",
    grant.writeReviewWorktree === true ? "acceptEdits" : "dontAsk",
    "--allowedTools",
    ...allowed,
    "--disallowedTools",
    "WebFetch",
    "WebSearch",
    "Bash(git push *)",
  ];
}

/**
 * The headless CLI invocation for one review, carrying the grant. The two
 * list flags take several values each, so they come last, after the prompt.
 */
export function reviewArgv(model: string, prompt: string, grant: ReviewerGrant): string[] {
  return ["claude", "-p", prompt, "--output-format", "stream-json", "--verbose", "--model", model, ...permissionArgs(grant)];
}

export interface ResultRowReading {
  totalCostUsd: number | null;
  usage: Record<string, unknown> | null;
  modelUsage: Record<string, unknown> | null;
}

function isMapping(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * Cost and token usage from the LAST `type: "result"` row. The CLI writes
 * rows after it (a task summary), so the last row of the file is not the
 * result row. No result row reads as three nulls.
 */
export function readResultRow(path: string): ResultRowReading {
  const empty: ResultRowReading = { totalCostUsd: null, usage: null, modelUsage: null };
  let body: string;
  try {
    body = readFileSync(path, "utf8");
  } catch {
    return empty;
  }
  let found: ResultRowReading = empty;
  for (const line of body.split("\n")) {
    if (line.trim() === "") {
      continue;
    }
    let row: unknown;
    try {
      row = JSON.parse(line);
    } catch {
      continue;
    }
    if (!isMapping(row) || row["type"] !== "result") {
      continue;
    }
    const cost = row["total_cost_usd"];
    found = {
      totalCostUsd: typeof cost === "number" && Number.isFinite(cost) ? cost : null,
      usage: isMapping(row["usage"]) ? row["usage"] : null,
      modelUsage: isMapping(row["modelUsage"]) ? row["modelUsage"] : null,
    };
  }
  return found;
}

/** Read one captured review stream with the plugin's observation code. */
export function readReviewStream(path: string): ReviewStreamReading {
  const outcome = observeServedModel(path);
  const models = assistantModelsIn(path);
  return {
    observed: outcome.kind === "observed" ? { model: outcome.model } : { model: null, reason: outcome.reason },
    topLevelModels: models?.topLevel ?? [],
    subagentModels: models?.subagent ?? [],
    ...readResultRow(path),
  };
}

export const reviewExecutor: ReviewExecutor = {
  name: REVIEW_EXECUTOR_NAME,
  vocabulary: vocabularyIdentity(),
  modelForTier,
  familyOf,
  command: reviewArgv,
  observe: readReviewStream,
};
