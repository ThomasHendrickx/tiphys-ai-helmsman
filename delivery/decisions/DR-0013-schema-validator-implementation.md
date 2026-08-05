# DR-0013: How JSON Schema validation is implemented in the kernel

- id: DR-0013
- project: tiphys-kernel
- task: m3-planning
- question: DR-0006 decided that kernel artifacts are validated by JSON Schema. The kernel ships zero runtime dependencies today (`package.json` carries devDependencies only, plan v1 decision D-3), and M2 ships a minimal in-repo validator over a closed, documented keyword set that errors loudly on any keyword it does not implement (M2 plan decision M2-D-04, boundary item 5, which explicitly leaves this decision to M3). M3's five artifact schemas exercise far more of the specification than a gate manifest does. Does the kernel extend M2's validator or adopt an external one?
- reversibility: costly (a runtime dependency in a published package is inherited by every fleet home from M3 onward, enters the EXT-F-09 license gate's inventory, and is a supply-chain surface)
- status: decided
- decided: Option 1, an established external validator. Ajv 8.20.0 exact, JSON Schema Draft 2020-12 (owner, 2026-08-05)
- date: 2026-08-05

## Decision

**Adopt an established external JSON Schema validator. Do not extend the M2
custom validator.** This overrides the recommendation previously carried in
this record and in the M3 plan's section 7, both of which favoured option 2.

### Validator

1. `ajv` at version **8.20.0**, pinned EXACT, as a production dependency.
2. JSON Schema **Draft 2020-12**.
3. Every Tiphys schema declares the dialect explicitly:
   `"$schema": "https://json-schema.org/draft/2020-12/schema"`
4. The Draft 2020-12 Ajv implementation is instantiated with these policies,
   which are the substance of the decision and not defaults to be revisited
   casually:
   - strict mode enabled
   - all errors enabled
   - schema and meta-schema validation enabled
   - no type coercion
   - no insertion of defaults
   - no removal of additional properties
   - no mutation of validated input
   - no automatic loading of remote schemas
   - unknown or invalidly combined keywords fail schema COMPILATION
5. **Ajv is an internal implementation detail.** Its errors are normalized into
   the existing Tiphys public diagnostic contract:
   `INVALID <json-pointer> <message>`
   Diagnostics must be deterministic. Ajv's own wording is never exposed as a
   public contract; keyword, instance path and parameters are mapped into
   Tiphys-owned messages with a stable ordering.
6. **The M2 custom validator is retired as a semantic validation engine** when
   M3-P1 adopts Ajv. Its public and module boundary is preserved where useful,
   existing M2 gate-schema validation is routed through the new engine, and all
   existing M2 validation tests are re-run against it. Two engines with
   potentially different semantics are not maintained.
7. **A documented schema-authoring vocabulary is preserved.** Ajv strict mode
   supplies the safety against unknown keywords. If the project later wants to
   prohibit otherwise-valid but unapproved JSON Schema keywords, that is a
   small schema-aware POLICY LINTER, never a reimplementation of keyword
   semantics. Any vocabulary expansion is deliberate and documented in
   `schemas/README.md`.
8. **Kind B derived rules stay in `src/checks.ts`.** Cross-document,
   filesystem, arithmetic and cross-array rules are not encoded as Ajv
   extensions. The Kind A / Kind B boundary established by plan review finding
   M3R-002 remains binding.

### YAML correction, decided in the same breath

M3 requires YAML artifact input and the plan named no YAML parser. That
omission is closed here rather than left to be discovered at dispatch.

1. `yaml` at version **2.9.0**, pinned EXACT, as a production dependency.
2. No custom YAML parser is written.
3. YAML handling is INPUT DECODING followed by JSON Schema validation. The two
   are separate stages and are not conflated.
4. YAML parse failures are normalized through the same top-level Tiphys
   error-presentation policy as every other usage failure: one concise
   diagnostic, nonzero exit, no stack trace. (This is the seam already recorded
   as a carried-forward item, "clean presentation of a load-time configuration
   error", which needs a top-level handler in `bin/tiphys.ts`. That item is now
   load-bearing for M3 rather than cosmetic.)
5. Both Ajv and `yaml`, INCLUDING their transitive production dependency
   inventory and licenses, are recorded as inputs to the EXT-F-09 license gate.

## Why the earlier recommendation was overridden, recorded honestly

This record previously recommended option 2, extending M2's closed keyword set,
on the grounds that M2's loud-failure-on-unknown-keyword property removes the
failure mode that made an external validator attractive (silently ignored
keywords producing vacuous passes, the SC-011 class).

That argument does not survive the owner's decision, and the reason is that
**Ajv strict mode preserves exactly the property the argument depended on.**
Strict mode makes unknown or invalidly combined keywords fail at schema
COMPILATION, which is earlier and louder than M2's runtime rejection. The loud
failure is not traded away; it is obtained from a maintained implementation
instead of a hand-written one.

What the earlier recommendation correctly identified, and what remains true, is
that this costs the kernel its first production dependency. That cost is
accepted, because validation is a central capability of this kernel rather than
a peripheral convenience: five M3 artifact schemas, the gate registry, the plan
schema and the report contract all rest on it, and a hand-written subset that
must grow to meet them is a maintenance surface with no upstream.

## Consequences for planned work

- **M3-P1** implements this. Its steps 8 and 11 and its dependency-related
  criteria change with the choice, which the M3 plan's own owner note
  anticipated. Its `blocked-by` on this record is now discharged.
- **M2-P1 through M2-P9** are unaffected in scope. M2 still ships its validator;
  M3-P1 retires it as an ENGINE while preserving its boundary. The M2 plan's
  decision M2-D-04 and its section 1.4 note should be annotated with this
  outcome at M2 dispatch re-grounding, not edited now.
- **EXT-F-09 license gate** gains two production dependencies plus their
  transitive inventory as required inputs.
- **Plan v1 decision D-3** (zero runtime dependencies) is superseded from M3
  onward. It remains true for M1 and M2 and should not be silently rewritten;
  the supersession is dated here.

## Implementation boundary, deliberately drawn

**No dependency is added to `package.json` by this record.** Nothing before
M3-P1 needs either package, M1-P6 is in review as this is written, and adding a
production dependency to a branch base mid-review would change what is under
review for no benefit. `ajv` and `yaml` enter `package.json` when M3-P1
dispatches, as part of the phase that uses them, with the exact pins recorded
above.

This is stated because a decision record that reads as an instruction to act
immediately, when the action belongs to a phase two milestones away, is how
scope leaks.

## Evidence

- Owner decision, 2026-08-05, recorded above in the owner's terms.
- The question, options and superseded recommendation as raised:
  `delivery/plan/kernel-plan-m3.md` section 7 and open-question 3.
- The seam M2 leaves for it: `delivery/plan/kernel-plan-m2.md`, decision
  M2-D-04 and the section 1.4 note.
- The zero-runtime-dependency position this supersedes from M3 onward: plan v1
  decision D-3.
- The Kind A / Kind B split that bounds what Ajv is asked to do:
  `delivery/review/plan-review-m3-r1.md` finding M3R-002, and the M3 plan's
  section 2.3.
- Why silently ignored keywords are the failure mode that matters, and what
  strict mode preserves: finding SC-011 in
  `delivery/verification/spec-coherence-report.md`.
