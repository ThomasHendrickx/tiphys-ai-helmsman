# Clean-room review, HAZARD lens: kernel 0.2.1 -> 0.2.2 release bump

Subject: origin/claude/kernel-0-2-2-release-bump at head e48499bc4b9f654cc43537feb38690931dee15bb
Base: origin/main. One commit, five files, 7 insertions, 7 deletions, all version strings.
Comparison shape: identical file set and hunk shape to the 0.2.1 bump (2c49ab3, PR #218).

## Evidence gathered (scratch worktree, node v26.6.0, npm ci exit 0, npm run build exit 0)

- git status --porcelain after build: 0 lines (plan decision D-17 clean tree holds).
- npm test: 1512 tests, 1512 pass, 0 fail, 0 skipped, exit 0. Matches the orchestrator's report.
- node bin/tiphys.ts version prints 0.2.2.
- npm pack --dry-run --json: name @tiphys/kernel, version 0.2.2, filename tiphys-kernel-0.2.2.tgz,
  214 entries. Replayed the release.yml listing check (required LICENSE, AGENTS.md,
  gate-registry.yaml, assurance-modes.yaml, role-model-config.yaml all present; forbidden
  delivery/, test/, sandbox/, src/, scripts/, witness/ all absent). No problems.
- Production dependencies: package.json dependencies identical on main and head
  ({ajv 8.20.0, commonmark 0.31.2, yaml 2.9.0}); package-lock.json changes only the three
  self-version lines (root version, root package version, plugin devDependency pin).
- release.yml (workflow_dispatch only): the version-agreement guard at step
  "Decide whether this dispatch publishes" compares inputs.version to package.json 0.2.2;
  the tag job refuses if v0.2.2 exists locally or on the remote. git ls-remote --tags origin
  shows v0.1.0 and v0.2.1 only, so v0.2.2 is free. No changelog or release-notes file is
  read by any step, and no file in the tree lists released versions (ls-tree grep for
  change/release/version: no hits).
- red-witness gate on the head against origin/main: green, 4 witnesses evaluated
  (1 own, 3 stored re-evaluated), every witness red against every dangerous state and green
  at head. The stored witness witness/kernel-0-2-1-final-report-template-stamped.json has
  its mutation find string updated to "tiphys-version: 0.2.2\n", which matches
  templates/final-report.example.yaml line 15 on the head; without that update the
  mutation would not apply and the witness would go vacuous.
- Remaining literal "0.2.1" strings outside delivery/ are historical prose in schema
  $comment fields, src/, scripts/ and test/ describing what changed in kernel 0.2.1. None is
  a version check. plugin/package.json peerDependency ^0.2.0 admits 0.2.2.

## Findings

CR-001 (low, informational): the stored witness keeps the filename
witness/kernel-0-2-1-final-report-template-stamped.json while its find string now names
0.2.2. Functionally correct (the gate is green and non-vacuous, see above) and the same
shape #218 shipped, so no release hazard; a rename is optional housekeeping for a later
phase and is not owed by this bump.

No medium or high finding. Nothing found that could make release.yml fail on a 0.2.2
dispatch or ship a wrong artifact.

VERDICT: APPROVE

## Re-verification at 43ecd83

Re-verified 43ecd8386cf97c5b458d0fe7827f3f0e90665a5e (local, not pushed): the
approved head e48499b, plus the delivery-only verdict commit 2283ff4, plus a merge
of origin/main at 0e29760 (M5-P1). Parents of 43ecd83: 2283ff4 and 0e29760.

- git diff --stat e48499b 43ecd83: 16 files, 2464 insertions, 26 deletions. The only
  path outside delivery/ is test/retirement-inventory.test.ts (+16 -16 lines).
- test/retirement-inventory.test.ts at 43ecd83 has the same blob id as at 0e29760, and
  the branch-delta hunks are identical to git diff 9813a86 0e29760 for that path
  (diff of the two patches with index lines removed: empty).
- Every other delta path is byte-identical to its origin/main blob (10 M5-P1 files:
  STATE.md, DR-0060, m5-p1.json, the two M5-P1 clean-room reviews and JSONs, the two
  verification documents, the M5-P1 work history) or to its 2283ff4 blob (the five
  release-bump review files). Nothing in the delta originates in the merge commit.
- The five bumped files (package.json, plugin/package.json, package-lock.json,
  templates/final-report.example.yaml,
  witness/kernel-0-2-1-final-report-template-stamped.json) have the same blob ids at
  e48499b and 43ecd83: untouched by the merge.
- git grep for conflict markers at 43ecd83 across the whole tree: exit 1, no hits.
  git status --porcelain: 0 lines.
- node --test test/retirement-inventory.test.ts, node v26.6.0, dist present, not
  rebuilt: 56 tests, 56 pass, 0 fail, 0 skipped, exit 0.

Findings unchanged: CR-001 (low) only. Verdict JSON:
v2-kernel-0-2-2-release-bump-hazard.json, head 43ecd83.

VERDICT: APPROVE
