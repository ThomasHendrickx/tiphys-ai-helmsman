/**
 * The `check-dual-review` registry entry. M6-P3 removed it from this
 * repository's gate-registry.yaml (it duplicated merge-preconditions, which is
 * the gate CI enforces), and the script stays until M6-P5 because
 * merge-preconditions uses it as its precondition command. Tests that drive the
 * script through the real runner stage a registry carrying this entry.
 */
export const DUAL_REVIEW_ENTRY = [
  "  - id: check-dual-review",
  "    prevents: a pair-tier change merged with two reviews from one model family",
  "    command: [node, scripts/check-dual-review.mjs, .]",
  "    unitLabel: review verdicts examined for decorrelation",
  "    applicability: conditional",
  "    verified-by: script",
  "    modes: [full, direct-pr]",
  "    events: [pull_request]",
  "    parameters: [base, head]",
  "    precondition:",
  "      id: dual-review-budget-decidable",
  "      kind: command-exit-zero",
  "      command: [node, scripts/check-dual-review.mjs, --precondition, --review-budget, .]",
].join("\n");

/** The registry text with the entry appended to its gate list. */
export function withDualReviewGate(registryText: string): string {
  const marker = "\ndestructiveCommands:";
  if (!registryText.includes(marker)) {
    throw new Error("the registry has no top-level destructiveCommands key to insert the entry before");
  }
  return registryText.replace(marker, `\n${DUAL_REVIEW_ENTRY}\n${marker}`);
}
