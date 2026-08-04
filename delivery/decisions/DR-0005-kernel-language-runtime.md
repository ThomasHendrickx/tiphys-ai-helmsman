# DR-0005: Kernel implementation language and runtime

- id: DR-0005
- project: tiphys-kernel
- task: stage-1-plan
- question: What language and runtime is the kernel's executable surface (bin/, the toolbelt, the doctor CLI, all M1 and M2 deliverables) written in? Raised by finding SC-004: neither intake document decides this, and the charter schema itself classes "stack, language" as an irreversible decision that blocks realization.
- reversibility: irreversible in practice (every M1 and M2 deliverable is written in this language; deciding differently later means rewriting the whole toolbelt, which is milestone-scale rework)
- status: open
- decided: (pending)
- date: 2026-08-04

## Options

1. Node.js with plain JavaScript (ESM), typed via JSDoc annotations and checked in CI with `tsc --noEmit --checkJs`. No build step: the published package ships the source that runs, stack traces point at real files, npm publish has no dist directory to drift. Type safety is retained at CI time. Shell is used only where a genuine one-liner suffices.
2. TypeScript with a compile step. Strongest typing ergonomics for parsing and schema logic, at the cost of a build pipeline (dist output, source maps, a generated-artifact drift surface the process doc explicitly gates against) in every kernel change and every downstream debugging session.
3. Bash-first with minimal Node. Matches the blueprint's "bash + CI + git config" description of layer 1 literally, but the BUILD components (harnesses, linters, checkers, verifiers) are parsing-heavy and bash parsing is the opposite of determinism-first; testability under a single test runner also degrades.

## Recommendation

Option 1: Node.js, plain ESM JavaScript, JSDoc types checked by `tsc --noEmit --checkJs` in CI, thin bash only where a shell one-liner genuinely suffices. Node presence is already guaranteed by the settled npm distribution decision; the built-in `node --test` runner (mature at the DR-0002 floor) gives a zero-dependency test story; no build step keeps the toolbelt deterministic end to end.

The plan's M1 phases assume this recommendation. A different owner choice triggers a plan revision before any M1 phase is dispatched.

## Evidence

- SC-004 in delivery/verification/spec-coherence-report.md (silence-irreversible, severity high).
- Blueprint layer 1 "bash + CI + git config" versus the BUILD component list: delivery/intake/orchestrated-delivery-v1.md sections 2 and 4.
- Charter schema lists "stack, language" among irreversible decisions: delivery/intake/orchestrated-delivery-v1.md section 7.
- npm distribution settled (Node guaranteed present): delivery/intake/orchestrated-delivery-v1.md section 3.
