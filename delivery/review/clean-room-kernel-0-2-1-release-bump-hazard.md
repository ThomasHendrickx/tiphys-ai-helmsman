# Clean-room review: kernel 0.2.1 release bump (PR #218)

Branch claude/kernel-0-2-1-release-bump, head
0571bc621cbb3e6bc4ee269ab1acd4c9e6c0d756. Base main is 69a7a607abb2932ff87bc580df22f304a38c2a0b
(the merged history/compat PR #216). Budget: quick review, about 10 minutes.
Model family: Sonnet.

## 1. Diff is exactly the claimed 4 files, 6 lines

  git diff origin/main 0571bc621cbb3e6bc4ee269ab1acd4c9e6c0d756

  package-lock.json                   | 6 +++---
  package.json                        | 2 +-
  plugin/package.json                 | 2 +-
  templates/final-report.example.yaml | 2 +-
  4 files changed, 6 insertions(+), 6 deletions(-)

Confirmed exactly as claimed. package.json: version 0.2.0 -> 0.2.1.
plugin/package.json: only the devDependencies exact pin moves to 0.2.1;
peerDependencies stays "^0.2.0" (a semver range, still satisfied by 0.2.1),
matching the brief. package-lock.json: the top-level name/version block and
the plugin workspace entry's exact devDependency pin, both mirroring
package.json and plugin/package.json (git diff origin/main 0571bc6 --
package-lock.json read directly, three hunks, all 0.2.0 -> 0.2.1).
templates/final-report.example.yaml: the tiphys-version stamp line only.

## 2. No stray 0.2.0 pin left where it should now say 0.2.1

  git grep -n "0\.2\.0" 0571bc621cbb3e6bc4ee269ab1acd4c9e6c0d756 -- '*.json' '*.yaml' '*.yml' '*.ts' '*.md'

Every hit is one of: a RULES_SINCE / stamp-history reference correctly
naming the version that INTRODUCED a rule (src/stamp.ts, src/checks.ts,
test/behaviors.json's descriptions, test/history-compat.test.ts,
test/verdict-head.test.ts, all discussing "0.2.0" as a fact about when a
rule started applying, never as the running kernel's own version); a
peerDependencies range ("^0.2.0" in plugin/package.json and its lockfile
mirror, and witness/plugin-runtime-packages-declared-for-consumers.json's
`find` string, which matches that same range and is untouched by design);
test fixtures that deliberately stamp OLD documents at 0.2.0 to exercise
history rules (witness/fixtures/dual-review/*.yaml, several
witness/kernel-0-2-1-*.json specs); test/license-gate.test.ts's
release-verify stub, which feeds "0.2.0" as fabricated registry test data
to a script under test, unrelated to this repository's own package.json;
and test/retirement-inventory.test.ts:2010, a string used inside a test
that exercises STATE.md text about "v0.2.0", also historical. None of these
is a live pin that should track the running kernel version. Nothing found
requiring a change.

## Release workflow and release-verification script accept 0.2.1

.github/workflows/release.yml is a workflow_dispatch flow: every version
check compares the OPERATOR-SUPPLIED `inputs.version` against
`declared="$(node -p 'require("./package.json").version')'`, string
equality, generically. No literal "0.2.0" appears anywhere in the workflow
(confirmed by grep: every "0.2." hit is prose in comments about the
mechanism, not a version literal). It will accept 0.2.1 the same way it
accepted 0.2.0, because it never encodes a version.

scripts/release-verify.sh takes NAME and VERSION as positional arguments
(read directly: `NAME="$1"`, `VERSION="$2"` via the parse loop) and never
hardcodes a version anywhere in the script. The workflow's publish job
calls it with `${{ inputs.version }}`, so it too is version-agnostic.

## 3. Build and tests

Node v26.6.0. `npm ci`: clean, no error (EBADENGINE-free on this
floor-satisfying toolchain). `npm run build`: exit 0, and its own npm
banner lines print "@tiphys/kernel@0.2.1 build:schemas" /
"build:runtime-deps", confirming the bump is live in the built package
metadata. `git status --porcelain` after build: empty.

  node --test test/history-compat.test.ts test/verdict-head.test.ts \
    test/license-gate.test.ts test/retirement-inventory.test.ts

165 tests, 165 pass, 0 fail, 0 cancelled, 0 skipped, 0 todo. The last two
files were added to the coordinator's named pair because they are the ones
that either read the real package.json version dynamically (history-compat
and verdict-head both use KERNEL_VERSION, sourced from the built package,
in their stamp/template assertions, and all such assertions passed) or
exercise the release-verify script and the retirement-inventory's own
version-naming text; all passed with no version-mismatch failure.

## Verdict

**APPROVE.** No findings. The diff is exactly the claimed 4 files and 6
lines, every remaining "0.2.0" string in the tree is correctly historical
or a semver range and none needs to become 0.2.1, the release workflow and
release-verify script are both version-agnostic and will accept 0.2.1
without modification, and the targeted test run (165 tests) plus a clean
build (git status empty after) show no regression from the bump.

## Update: head moved to 95d1ede (dual review now required)

merge-preconditions counts package.json, the lockfile and templates/ as
dual-review tier, so this phase needs two decorrelated verdicts after all.
One commit added on top of the head reviewed above.

  git diff 0571bc621cbb3e6bc4ee269ab1acd4c9e6c0d756 95d1ede537d528243aad9e3a90d1366570301ef0

One file, one hunk: witness/kernel-0-2-1-final-report-template-stamped.json's
mutation `find` text moves from "tiphys-version: 0.2.0\n" to
"tiphys-version: 0.2.1\n". Exactly the claimed delta.

**No other stored witness affected.** Grepped every witness/*.json whose
`file` target is one of the four bumped files. Two target package.json
(witness/kernel-exports-do-not-widen-package.json: the `./package.json`
self-export line; witness/release-manifest-names-the-provenance-repository.json:
the `repository` block and url), neither touched by the bump. One targets
plugin/package.json (witness/plugin-runtime-packages-declared-for-consumers.json:
the peerDependencies `^0.2.0` range), which the bump deliberately left
unchanged. None targets package-lock.json. So the one witness fixed in
95d1ede was the only one broken.

**Red-witness gate reproduced green locally.** `--base 0571bc6` gives no
src/bin/plugin diff against this narrow head, so the gate's own precondition
reports not-applicable there and does not reproduce what CI evaluates (CI's
base predates this branch's merge of main, which carries #216's real src/
changes). Using `--base fc44f28e0cf473fecf6de6bf443fa04d0853d37b` (the
release-bump branch's true fork point) instead:

  node bin/tiphys.ts gates run --registry gate-registry.yaml --mode full \
    --only red-witness --base fc44f28e0cf473fecf6de6bf443fa04d0853d37b --head HEAD

  gates: red-witness: green: 4 witness(es) evaluated (1 own, 3 stored
  re-evaluated in 20141ms); every witness red against every declared
  dangerous state and green at head. declared 1 applicable 1 verdict 1
  green 1 red 0 not-applicable 0 error 0 vacuous 0.

Confirms the fix; CI's earlier error on 0571bc6 is not reproduced at
95d1ede.

**Verdict at 95d1ede: APPROVE.** No findings. Recorded as
delivery/review/kernel-0-2-1-release-bump-hazard.json (validated:
`tiphys validate --type verdict` exit 0, no INVALID line).
