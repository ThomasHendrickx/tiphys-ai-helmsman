/*
 * M6-P5: a review executor for tests. It IS the Claude Code plugin's executor
 * (plugin/src/review.ts: vocabulary, tier-to-model, family, and the stream
 * reading) with one change: the command runs replay.mjs instead of the real
 * CLI, so no test calls the harness. test/review-dispatch.test.ts drives it.
 */
import { fileURLToPath } from "node:url";

const { reviewExecutor: plugin } = await import(new URL("../../../plugin/src/review.ts", import.meta.url).href);

export const reviewExecutor = {
  ...plugin,
  command: (model, prompt) => [process.execPath, fileURLToPath(new URL("./replay.mjs", import.meta.url)), model, prompt],
};
