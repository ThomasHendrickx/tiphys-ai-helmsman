/**
 * M6-P5: kernel review records for merge-gate tests, in the shape
 * `tiphys review dispatch` writes (src/review.ts). The dispatch itself is
 * exercised end to end in test/review-dispatch.test.ts; these tests stage the
 * committed result of a dispatch, so the record is written here with the
 * verdict's real sha256.
 */
import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";

export interface RecordFields {
  taskId: string;
  phase: string;
  head: string;
  family: string;
  /** null records a failed observation. */
  model: string | null;
  verdictPath: string;
  sha256: string | null;
}

export function kernelRecord(fields: RecordFields): Record<string, unknown> {
  return {
    kind: "review-record",
    contractVersion: "1",
    taskId: fields.taskId,
    role: "clean-room-reviewer",
    phase: fields.phase,
    head: fields.head,
    tier: "strongest",
    requestedModel: "a-requested-model",
    executor: "test-executor",
    vocabulary: { id: "test-vendors", version: 1 },
    observation: {
      model: fields.model,
      topLevelModels: fields.model === null ? [] : [fields.model],
      subagentModels: [],
      reason: fields.model === null ? "the stream named no model" : "one model on the top-level rows",
    },
    family: fields.model === null ? "unknown" : fields.family,
    verdict: {
      path: fields.verdictPath,
      sha256: fields.sha256,
      reason: fields.sha256 === null ? "the reviewer wrote no verdict" : "sha256 of the bytes the reviewer wrote",
    },
    totalCostUsd: 0.01,
    usage: { input_tokens: 1, output_tokens: 1 },
    modelUsage: null,
    startedAt: "2026-09-30T00:00:00.000Z",
    endedAt: "2026-09-30T00:01:00.000Z",
    executorExitCode: 0,
  };
}

export function sha256Of(path: string): string {
  return createHash("sha256").update(readFileSync(path)).digest("hex");
}

export interface RecordOptions {
  /** Family per verdict file name; default vendor-a, vendor-b, ... in name order. */
  families?: Record<string, string>;
  /** Field overrides per verdict file name, applied last. */
  overrides?: Record<string, Partial<RecordFields>>;
  /** The head when a verdict carries no `head:` line. */
  defaultHead?: string;
  /** Verdict file names that get no record: a review the kernel did not launch. */
  omit?: string[];
}

/**
 * Replace `delivery/review/records/` with one record per YAML verdict directly
 * under `delivery/review/`, each naming the verdict's current bytes and the
 * head its `head:` line names.
 */
export function recordVerdicts(dir: string, phase: string, options: RecordOptions = {}): void {
  const reviewDir = join(dir, "delivery", "review");
  const recordsDir = join(reviewDir, "records");
  rmSync(recordsDir, { recursive: true, force: true });
  mkdirSync(recordsDir, { recursive: true });
  const names = readdirSync(reviewDir)
    .filter((name) => /\.ya?ml$/.test(name) && !(options.omit ?? []).includes(name))
    .sort();
  names.forEach((name, index) => {
    const path = join(reviewDir, name);
    const head =
      /^head: ([0-9a-f]{40})$/m.exec(readFileSync(path, "utf8"))?.[1] ?? options.defaultHead ?? "0".repeat(40);
    const fields: RecordFields = {
      taskId: `review-${phase}-${String(index + 1)}`,
      phase,
      head,
      family: options.families?.[name] ?? `vendor-${String.fromCharCode(97 + index)}`,
      model: `a-served-model-${String(index + 1)}`,
      verdictPath: `delivery/review/${name}`,
      sha256: sha256Of(path),
      ...options.overrides?.[name],
    };
    writeFileSync(join(recordsDir, `${name}.json`), `${JSON.stringify(kernelRecord(fields), null, 2)}\n`);
  });
}
