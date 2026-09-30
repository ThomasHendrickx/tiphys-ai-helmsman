/*
 * M6-P5: a review executor for tests. It IS the Claude Code plugin's executor
 * (plugin/src/review.ts: vocabulary, tier-to-model, family, and the stream
 * reading) with one change: the command runs replay.mjs instead of the real
 * CLI, so no test calls the harness. test/review-dispatch.test.ts drives it.
 *
 * The replay's settings travel in its argv, read from the kernel's own
 * environment when the command is built: the child runs in the kernel's
 * scrubbed environment (M6-P5 fix round 1, CR-M6P5A-02), so a TIPHYS_STUB_*
 * variable does not reach it.
 */
import { fileURLToPath } from "node:url";

const { reviewExecutor: plugin } = await import(new URL("../../../plugin/src/review.ts", import.meta.url).href);

export const reviewExecutor = {
  ...plugin,
  command: (model, prompt) => [
    process.execPath,
    fileURLToPath(new URL("./replay.mjs", import.meta.url)),
    model,
    prompt,
    JSON.stringify({
      stream: process.env["TIPHYS_STUB_STREAM"] ?? "",
      verdict: process.env["TIPHYS_STUB_VERDICT"] ?? "",
      echo: process.env["TIPHYS_STUB_ECHO"] ?? "",
      exit: process.env["TIPHYS_STUB_EXIT"] ?? "0",
    }),
  ],
};
