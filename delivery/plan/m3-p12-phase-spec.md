# M3-P12: the tag and the GitHub release, which must never point at nothing

- date: 2026-08-14
- author: orchestrator
- governing decision: DR-0032
- branch: `claude/m3-p12-tag-and-github-release`
- merges BEFORE the `0.1.0` publish and before the M3 exit test

## What it delivers

A second job in `.github/workflows/release.yml` that creates an annotated git
tag and a GitHub release for a version that was ACTUALLY PUBLISHED, and does so
only then.

## The design is decided, not left to the implementer

Two points are settled by DR-0032 and are not the phase's to reopen:

1. **A separate job**, `permissions: contents: write` and NO `id-token`. The
   `release` job keeps `contents: read` and `id-token: write` unchanged.
2. **Two independent conditions gate it**, because they cover different
   failures and either alone leaves a hole:
   - `needs: release`, which means the tag job does not run if ANY step of the
     release job failed, including the post-publish registry verification;
   - an `if:` on a JOB-LEVEL OUTPUT of the release job derived from
     `steps.decide.outputs.publish`, which means it does not run on a rehearsal
     even though a rehearsal succeeds.

   The first covers "the publish happened and then something was wrong". The
   second covers "nothing was published at all". A tag created in either case is
   the failure DR-0032 exists to prevent.

## Acceptance criteria, falsifiable

1. Parsing `.github/workflows/release.yml` as YAML yields exactly two jobs.
   The release job's `permissions` are `contents: read` and `id-token: write`.
   The tag job's `permissions` are `contents: write` and `id-token` is ABSENT,
   asserted as absent rather than as any particular value.
2. The release job declares a job-level `outputs` entry whose value derives from
   `steps.decide.outputs.publish`, and the tag job's `if:` compares that output
   by exact string equality. Asserted by EXTRACTING AND EVALUATING the condition,
   not by matching its text. The round-2 `exactlyOne` helper is used for every
   selection this test makes.
3. **Red witness, and the two members must be structurally different.**
   Member A removes the tag job's `if:` entirely. Member B makes the release
   job's output always `yes`. Both redden at least one named test, and NEITHER
   is a mutation of a permissions line, because that is criterion 4's class.
4. A mutant that adds `id-token: write` to the tag job reddens a named test.
5. The tag is ANNOTATED, named `v<version>`, and points at the exact commit the
   workflow ran from. Established by executing the tagging command against a
   scratch git repository and reading back the resulting object type and target,
   not by grepping the workflow for `git tag`.
6. **It fails closed on a pre-existing tag.** With `v<version>` already present,
   the command exits nonzero and does NOT move, delete or reuse the tag.
   Witnessed against a scratch repository in that state.
7. The release body carries, each asserted by name: the version, the commit sha,
   the npm package URL, and a link to the workflow run.
8. `npm test` reports 0 failures, quoted as a complete sentence with invocation,
   toolchain, build state and SKIPPED count.
9. `test/license-gate.test.ts:1330` and the per-job permissions assertions are
   updated DELIBERATELY, and the work history states why relaxing the job-list
   assertion does not reopen the hole round 2 closed. The comment above that line
   already anticipates a second job; quote it rather than paraphrase it.

## Hazards, named because two of them are mechanisms this repository just paid for

- **Do not reintroduce M1**, the guard asserted by its TEXT rather than
  EVALUATED. The tag job's condition is a guard over a repository write. Grepping
  it is not testing it.
- **Do not reintroduce the round-2 mechanism**, a check whose SEARCH SCOPE is
  narrower than the property it protects. Every new assertion iterates every job
  of every workflow, not the jobs the author had in mind.
- **Do not rename `release.yml`.** npm's trusted publisher names that file. A
  rename invalidates the owner's configuration and makes every publish fail
  closed.
- **Do not publish.** No `npm publish` in any form, no `npm login`, no dispatch
  of the release workflow.

## Non-goals, stated so the phase does not sprawl

Release notes generation, a changelog, signing beyond provenance, and anything
for `@tiphys/claude-code-plugin`, which has no release workflow to attach to.

## What this spec does NOT establish

- **It does not claim the two conditions are sufficient**, only that each covers
  a failure the other does not. The adversarial reviewer should look for a third.
- **It does not settle how the tag job behaves if the tag write itself fails
  after a successful publish.** The published version would then exist with no
  tag, which is the blind spot DR-0032 names, and the implementer should state
  what it chose and why rather than leave it implicit.

## Where the hazard is written down

Appended by the M3-P12 implementer, and it is a CITATION rather than a
restatement: the sentence this whole phase is shaped by is at
delivery/decisions/DR-0032-the-github-release-is-the-owners-mental-model.md:44,
and the two settled design points are at
delivery/decisions/DR-0032-the-github-release-is-the-owners-mental-model.md:60.
Added because the `citations` gate reported this document citationRequired with
zero substantive citations, which is a red gate rather than a stylistic note.
Nothing above this heading was changed, so every line number cited into this
file elsewhere still resolves.
