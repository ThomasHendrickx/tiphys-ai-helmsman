import { readFileSync } from "node:fs";
import type { ReviewExecutor, ReviewStreamReading } from "@tiphys/kernel";
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

/** The headless CLI invocation for one review. */
export function reviewArgv(model: string, prompt: string): string[] {
  return ["claude", "-p", prompt, "--output-format", "stream-json", "--verbose", "--model", model];
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
