/*
 * M6-P7: the Codex review executor for tests. It IS adapters/codex/review.ts
 * (vocabulary, tier-to-model, family, the declared harness environment and the
 * stream reading) with one change: the command runs replay.mjs instead of the
 * real CLI, so no test calls the harness. test/codex-review.test.ts drives it.
 * TIPHYS_STUB_DECLARE, read from the kernel's own environment, adds one more
 * declared name with a reason, so a refused declaration can be observed.
 */
import { fileURLToPath } from "node:url";

const { reviewExecutor: codex } = await import(new URL("../../../adapters/codex/review.ts", import.meta.url).href);

const extra = process.env["TIPHYS_STUB_DECLARE"];

export const reviewExecutor = {
  ...codex,
  environment: extra === undefined ? codex.environment : [...codex.environment, { name: extra, reason: "a test declares it" }],
  command: (model, prompt, ...rest) => [
    process.execPath,
    fileURLToPath(new URL("./replay.mjs", import.meta.url)),
    model,
    prompt,
    JSON.stringify({
      stream: process.env["TIPHYS_STUB_STREAM"] ?? "",
      verdict: process.env["TIPHYS_STUB_VERDICT"] ?? "",
      echo: process.env["TIPHYS_STUB_ECHO"] ?? "",
      exit: process.env["TIPHYS_STUB_EXIT"] ?? "0",
      extra: rest,
    }),
  ],
};
