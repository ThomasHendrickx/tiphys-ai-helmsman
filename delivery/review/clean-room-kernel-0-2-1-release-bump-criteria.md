# Clean-room review: kernel 0.2.1 release bump (PR #218), criteria contract

- Branch: `claude/kernel-0-2-1-release-bump`
- Head: 95d1ede537d528243aad9e3a90d1366570301ef0
- Base: `main` at 69a7a607abb2932ff87bc580df22f304a38c2a0b (the merge base
  equals `origin/main`, so the branch is not behind)
- Reviewer: claude-opus-5-5, criteria contract
- Toolchain: node v26.6.0, npm 11.18.0 (scratch prefix), `dist/` built
- Verdict: **APPROVE**, no findings

The five changed files are quoted, never cited, because the branch changes
them. Resolving citations point only into files that are byte-identical on
both sides: the diff is exactly five files, and none of the cited files is
among them. The merge rule this verdict feeds is
delivery/decisions/DR-0012-delegated-merge-authority.md:23.

## Criterion 1: the diff is exactly the stated five files. MET

`git diff --stat origin/main...95d1ede`:

```
 package-lock.json                                       | 6 +++---
 package.json                                            | 2 +-
 plugin/package.json                                     | 2 +-
 templates/final-report.example.yaml                     | 2 +-
 witness/kernel-0-2-1-final-report-template-stamped.json | 2 +-
 5 files changed, 7 insertions(+), 7 deletions(-)
```

Each hunk is a single `0.2.0` -> `0.2.1` change, and I read every one:

- `package.json`: `"version"`.
- `package-lock.json`: the top-level `version`, `packages[""].version`, and
  the plugin workspace's `devDependencies["@tiphys/kernel"]`.
- `plugin/package.json`: the exact kernel devDependency pin. Its
  `peerDependencies` stays `^0.2.0`, which admits 0.2.1.
- `templates/final-report.example.yaml`: `tiphys-version: 0.2.1`.
- The witness spec's mutation `find` follows the template. It is now
  `tiphys-version: 0.2.1\n`, which occurs exactly once in the template (grep
  count 1), so the mutation still bites.

## Criterion 2: package, lockfile and plugin agree, and `npm ci` is clean. MET

- Lockfile at head, read by node: top-level `0.2.1`, root package `0.2.1`,
  plugin dev pin `0.2.1`, plugin peer range `^0.2.0`. `package.json` declares
  0.2.1, and the plugin's dev pin is 0.2.1.
- `npm ci`: exit 0, zero `EBADENGINE`, `npm warn` or `npm err` lines. After
  it, `node_modules/@tiphys/kernel` is the workspace self-link (`-> ../..`) and
  reports version 0.2.1.
- Two things are present and are NOT introduced by this PR. I measured both
  on `main` at 69a7a60 with the same toolchain and an identical result:
  - `npm ci` reports "1 high severity vulnerability" on both.
  - `npm ls @tiphys/kernel` exits with `ELSPROBLEMS`. It prints
    `@tiphys/kernel@npm:@tiphys/claude-code-plugin@0.1.0 invalid: "file:." from plugin`,
    and the text is identical on both sides apart from the root version.
  Neither is a finding against this bump. Both are outside its scope.

## Criterion 3: every remaining "0.2.0" is correct to keep. MET

I ran `git grep -F 0.2.0` outside `delivery/`, which gives 69 lines. Every
one is in one of these classes:

| class | where | why it stays |
|---|---|---|
| RULES_SINCE `since` | `src/stamp.ts` lines 155, 163, 170, 182 | rules introduced in 0.2.0; moving them would exempt 0.2.0-stamped documents from rules they were written under |
| prose about 0.2.0 behavior | `src/stamp.ts`, `src/checks.ts`, `scripts/check-dual-review.mjs`, schema `$comment`s | describe history |
| peer range | `plugin/package.json` and its lockfile mirror, `^0.2.0` | admits 0.2.1; widening the floor is not a bump's job |
| witness find text for that peer range | `witness/plugin-runtime-packages-declared-for-consumers.json` | follows the unchanged peer range |
| old-stamped fixtures | `witness/fixtures/dual-review/*.yaml` (5), 30 lines in `test/history-compat.test.ts` and `test/verdict-head.test.ts` | deliberately a past stamp; the tests exercise stamp-dependent rules |
| behavior titles | `test/behaviors.json` (4), three witness specs quoting them | describe rules that apply from 0.2.0 |
| release-verify fixtures | `test/license-gate.test.ts` (4), two captures | a stub version or a recorded capture of the published 0.2.0 |
| retirement test text | `test/retirement-inventory.test.ts` (1) | a synthetic A-15 line about v0.2.0 |

The `since: "0.2.0"` rows are at src/stamp.ts:155. The brief stamps the
running version from `package.json` through `ownVersionForStamp()`
(src/commands/brief.ts:403), so it has no literal to bump.

The one stamp that MUST follow the version is the shipped template's, and it
did. I checked in a lab copy of the tree, running only the test named in the
witness spec:

| template stamp | `history-compat` named test |
|---|---|
| 0.2.1 (head) | rc 0, 1 pass |
| 0.1.0 (the witness mutation) | rc 1, 0 pass 1 fail |
| 0.2.0 (the bump left undone) | rc 1, 0 pass 1 fail |

So a missed template bump is red, not silent.

## Criterion 4: the release guards accept 0.2.1. MET

- `.github/workflows/release.yml`, step "Decide whether this dispatch
  publishes": it compares `node -p 'require("./package.json").version'` with
  `inputs.version` by string equality, and `publish=yes` needs `confirm` to
  equal the declared version as well. It contains no hard-coded version. I ran
  the step's logic at head:
  - `REQUESTED=0.2.1 CONFIRM=0.2.1` is accepted and writes `publish=yes`,
    rc 0;
  - `REQUESTED=0.2.0` is refused ("declared 0.2.1"), rc 1.
- `scripts/release-verify.sh` takes `<name> <version>` as operands with no
  version grammar or literal. It checks what the registry serves by equality
  with the operand (scripts/release-verify.sh:485) and the installed
  `meta.version` against it (scripts/release-verify.sh:572), so it accepts
  0.2.1. The workflow passes `$REQUESTED` to it. I did not run it against the
  registry, because 0.2.1 is not published yet.

## Criterion 5: build clean, and the three test files pass on node 26. MET

- `npm run build` exit 0. `git status --short` afterwards: 0 lines.
- `node --test test/history-compat.test.ts`: rc 0, 21 tests, 21 pass, 0 fail,
  0 cancelled, 0 skipped.
- `node --test test/verdict-head.test.ts`: rc 0, 41 tests, 41 pass, 0 fail,
  0 cancelled, 0 skipped.
- `node --test test/license-gate.test.ts`: rc 0, 47 tests, 47 pass, 0 fail,
  0 cancelled, 0 skipped.
- `git status --short` after the tests: 0 lines.

Count lines are the reporter's summary lines, each with its leading U+2139
removed (15 removals in total, nothing else changed). Each `rc` is my own
echo of the exit status.

## Findings

None.

## Not covered

- The full suite and the PR bundle (single files only, as asked).
- The red-witness gate. The one changed spec's first member was checked by
  hand in a lab copy (above), not through the gate.
- `release-verify.sh` against the live registry, and the `tag` job.
