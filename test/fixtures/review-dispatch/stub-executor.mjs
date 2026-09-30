/*
 * M6-P5: a review executor for tests. It IS the Claude Code plugin's executor
 * (plugin/src/review.ts: vocabulary, tier-to-model, family, and the stream
 * reading) with one change: the command runs replay.mjs instead of the real
 * CLI, so no test calls the harness. test/review-dispatch.test.ts drives it.
 *
 * The replay's settings travel in its argv, read from the kernel's own
 * environment when the command is built: the child runs in the kernel's
 * scrubbed environment (M6-P5 fix round 1, CR-M6P5A-02), so a TIPHYS_STUB_*
 * variable does not reach it. The arguments the kernel passed after the prompt
 * (the reviewer grant, DR-0065) travel the same way, as `extra`.
 */
import { fileURLToPath } from "node:url";

const { reviewExecutor: plugin } = await import(new URL("../../../plugin/src/review.ts", import.meta.url).href);

export const reviewExecutor = {
  ...plugin,
  command: (model, prompt, ...rest) => {
    /* A grant this stub is told not to map, so the dispatch's refusal path
       can be observed (M6-P5 fix round 3). */
    if (process.env["TIPHYS_STUB_COMMAND_THROWS"]) {
      throw new Error("the stub executor was told to refuse the grant");
    }
    return commandFor(model, prompt, rest);
  },
};

function commandFor(model, prompt, rest) {
  return [
    process.execPath,
    fileURLToPath(new URL("./replay.mjs", import.meta.url)),
    model,
    prompt,
    JSON.stringify({
      stream: process.env["TIPHYS_STUB_STREAM"] ?? "",
      verdict: process.env["TIPHYS_STUB_VERDICT"] ?? "",
      echo: process.env["TIPHYS_STUB_ECHO"] ?? "",
      exit: process.env["TIPHYS_STUB_EXIT"] ?? "0",
      /* Every argument after the prompt, so the echo shows the grant the
         kernel passed and that nothing else came with it. */
      extra: rest,
    }),
  ];
}
