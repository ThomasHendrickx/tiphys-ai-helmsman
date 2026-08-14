# Delta verification: M3-P10 fix round 1

- subject: branch `claude/m3-p10-release-and-exit`, round-1 head `26ebf7f`,
  pull request #140
- pre-round head, for the delta: `8d056f6`
- verifier: independent delta verifier, dispatched as an adversary of the ROUND
  rather than as a reviewer of the phase
- date: 2026-08-14
- **verdict: NOT VERIFIED.** Mechanism M3 is CLOSED. Mechanism M2 is CLOSED for
  every construction I could build against the inventory, with two small
  residues. **Mechanism M1 is OPEN**: a workflow that publishes on every
  dispatch, rehearsals included, passes every one of the round's new assertions
  green.

## Why this verification exists

The immediately preceding phase, M3-P11, ran this same sequence. Its fix round 1
closed the mechanisms it was sent to close and introduced a regression that made
an honest precondition emit a false error, and because the aggregator checks
error count first, one false error failed the whole gate bundle. The pull
request was GREEN at that head, no gate in the bundle exercised the path, and
the delta verification is what found it. That account is on `main` at
delivery/review/tracked-findings-register.md:163. This verification assumed the
same was possible here and went looking for it.

## Working method

A separate worktree cut from `origin/claude/m3-p10-release-and-exit`, never the
repository clone and never the implementer's tree. Every mutation lab is a COPY
made outside that worktree with `.git` removed, so nothing in this document can
have touched the branch. Nothing here published anything: no `npm publish` in
any form including `--dry-run`, no `npm login`, no workflow dispatch.

Unless a row says otherwise, every measurement is node v26.6.0 from the scratch
toolchain, npm 11.18.0, `dist/` built, at `26ebf7f`.

**Citation hygiene.** This document lands on the phase branch and CLAUDE.md's
rule 3b collides with T-019 here, so every path into a file the branch CHANGES
is written in backticks and deliberately does not resolve. The changed set was
taken from `git diff --name-only origin/main...HEAD` rather than assumed, and it
includes `CLAUDE.md`, `.github/workflows/release.yml`,
`.github/workflows/gates.yml`, `scripts/license-gate.mjs`,
`scripts/release-verify.sh`, `test/license-gate.test.ts` and `package.json`.
Resolving citations are only into files byte-identical on both sides, checked
with `git diff --quiet origin/main HEAD -- <path>`.

Baseline before any mutation, in the lab copy, the four workflow tests of
`test/license-gate.test.ts` (Node reporter glyph U+2714 rendered `v`, 4
occurrences; nothing else in any captured output in this document is altered):

```
v the release workflow is manually dispatched only, authenticates by OIDC, and holds no npm token
v no Actions expression is interpolated into any run: body of the release workflow
v the publish and rehearsal guards are exact complements, so an inverted guard reddens
v the publish decision script is EXECUTED against a table of inputs, and only an exact confirm publishes
tests 4  pass 4  fail 0
```

---

# Findings

## DV-1 (HIGH): the publish guard is defeated by any earlier step whose run body mentions `npm publish`, and mechanism M1 is therefore OPEN

**Mechanism.** The assertion finds the publish step with
`steps.find((step) => (step.run ?? "").includes("npm publish"))`, that is, the
FIRST step in the `release` job whose run body contains that substring, and then
constrains THAT step's `if:`. Any earlier step whose body mentions the string
absorbs the assertion and leaves the real publish step unconstrained. **A test
that identifies its subject by substring is not a test of that subject**, which
is one size smaller than the mechanism the round was dispatched against.

This is not a hypothetical framing. `.github/workflows/release.yml` ALREADY
contains a second step whose run body carries the string: the rehearsal notice
says "npm publish did NOT run". The assertion works today only because the real
publish step happens to come first. And the round's own work history declares
exactly this defect in ITS OWN M3 step classification, where step 12 is labelled
PUBLISH because its echo text contains the words "npm publish". **The same
defect is in the shipped test, where it was not declared.**

**Construction, run.** In a lab copy, one step inserted before the publish step
and the publish step's `if:` removed outright, so the workflow publishes on
EVERY dispatch including a rehearsal with an empty confirm:

```
      - name: Announce the publish decision
        if: ${{ steps.decide.outputs.publish == 'yes' }}
        run: |
          echo "about to run npm publish"

      - name: Publish to npmjs over OIDC (DR-0008 registry, DR-0024 authentication)
        run: npm publish --access public --provenance
```

Parsed step list, confirming the real publish step now carries no guard at all:

```
11 "Announce the publish decision" if= "${{ steps.decide.outputs.publish == 'yes' }}"
12 "Publish to npmjs over OIDC (DR-0008 registry, DR-0024 authentication)" if= undefined
13 "Rehearsal only, nothing was published" if= "${{ steps.decide.outputs.publish != 'yes' }}"
```

The three M1 tests against that mutant:

```
v no Actions expression is interpolated into any run: body of the release workflow
v the publish and rehearsal guards are exact complements, so an inverted guard reddens
v the publish decision script is EXECUTED against a table of inputs, and only an exact confirm publishes
tests 3  pass 3  fail 0
```

The whole of `test/license-gate.test.ts` against the same mutant reports
`tests 23  pass 22  fail 1`, and the single failure is
`git ls-files schemas failed / 128 !== 0`, an artefact of the lab copy having no
`.git` directory, not of the mutant.

**Why the round's witness does not catch it.** Both dangerous states in
`witness/release-publish-guard-exact-complements.json` mutate an `if:` line in
place, one to `always()` and one by adding an `if:` to the pre-publish step.
Mine leaves every `if:` string byte-identical and changes WHICH STEP the finder
resolves to. CLAUDE.md's "one witness is not a class" rule asks for two
structurally different members of the class; the two present are the same member
twice. The `red-witness` gate is green on this branch and that green is correct
and does not bear on this finding: it establishes that each declared dangerous
state reddens, not that the declared set spans the class.

**Reachability (DR-0027).** `npm publish` is the one action in this milestone
with no clean undo, which is the reachability argument the arbitration itself
gives for M1 (`delivery/review/arbitration-m3-p10.md`, quoted rather than
resolved because this branch adds that file). The defect does not
merely make a shipped artifact wrong; it removes the only automated guard over
whether anything is shipped at all. DR-0027's carve-out for `.github/` and
`test/` does not apply, because the same document makes an exception for
findings that make a shipped artifact wrong.

**The one-line shape of a fix**, offered because naming it is cheaper than
another round trip: identify the publish step by an exact property rather than a
substring, for example `step.run.trim().startsWith("npm publish")` together with
an assertion that EXACTLY ONE step in the job satisfies it. My own classifier in
the M3 section below uses the first half and labels the rehearsal step correctly.

## DV-2 (MEDIUM): "no `${{ }}` in any run body" covers one job of one workflow, and the round's forward claim does not

**Mechanism.** The assertion iterates `document.jobs["release"].steps`. Its own
comment says it "asserts the property over EVERY step". It asserts it over every
step OF ONE NAMED JOB of one file.

**Construction, run.** A second job appended to
`.github/workflows/release.yml`, carrying two `${{ }}` interpolations directly
into a run body, which is the HRB-11 mechanism verbatim, and an unguarded
`npm publish`:

```
  notify:
    runs-on: ubuntu-latest
    permissions:
      contents: read
      id-token: write
    steps:
      - uses: actions/checkout@v4
      - name: Post-release notice
        run: |
          echo "released ${{ inputs.version }} confirmed by ${{ inputs.confirm }}"
          npm publish --access public --provenance
```

Parsed: `jobs: [ 'release', 'notify' ]`. All four workflow tests pass,
`tests 4  pass 4  fail 0`.

**Why this is a finding about the ROUND and not only about the file.** The
round's DERIVATION parses every job of every workflow, and its output is
correct. The GUARD parses one job of one workflow. Only the guard ships forward,
and the round's stated reason for the guard is that "fixing two sites leaves the
mechanism live for the next step anybody adds". A second job is a step anybody
might add: a `notify` or a create-a-GitHub-release job on a release workflow is
ordinary. Reachability: the same as DV-1, one step removed, because the mutant
publishes.

## DV-3 (LOW, and DECLARED): interpolation reaches shell-equivalent source through `with:`

**Construction, run.** A `uses:` step inside the `release` job:

```
      - uses: actions/github-script@v7
        with:
          script: |
            core.info(`asked for ${{ inputs.version }}`);
```

`${{ inputs.version }}` is substituted textually into JavaScript that
`github-script` then evaluates, which is the HRB-11 surface one language along.
The assertion reads only `step.run`:
`no Actions expression is interpolated into any run: body ... tests 1 pass 1 fail 0`.

**This one IS declared.** The round's non-coverage section names "a `with:`
value that a used action passes to a shell" as outside its parse. It is recorded
at LOW and stated at its true size, which is: declared for the file's present
state, undeclared for the forward class claim. DV-2 is the undeclared half of
the same sentence.

## DV-4 (LOW): a zero-dependency tree makes the licence gate emit a false precondition error

**Mechanism.** Round 1 removed the manifest-walk fallback deliberately and
correctly. What it did not separate is "npm has not been run" from "npm ran and
there was nothing to install". `npm install` in a project with no dependencies
creates no `node_modules` at all, so no hidden lockfile exists, and the gate
prints a message asserting a precondition that was in fact met:

```
$ npm install --no-audit --no-fund
up to date in 179ms
$ ls node_modules            -> does not exist
$ node scripts/license-gate.mjs --root .
license: red (0 production packages licensed)
1 license finding(s):
LICENSE-INVENTORY .../node_modules/.package-lock.json does not exist, so npm has
not recorded what it installed and the production set cannot be READ; run npm ci
or npm install before this gate.
EXIT=1
```

This is the M3-P11 shape: an honest configuration turned into a red gate by a
message that names a cause that is not the cause.

**Reachability, stated honestly and it is what keeps this LOW.** It is NOT
reachable in this repository: `package.json` declares three runtime dependencies
and `npm ci` writes the hidden lockfile every time, measured. It is not
reachable through the shipped package either: `scripts/` is on the pack's
forbidden-directory list, so `scripts/license-gate.mjs` does not ship at all,
which I confirmed by reading the pack check in `.github/workflows/release.yml`.
The gate is repository-internal, so under DR-0027 this is register material
rather than a blocker. It is recorded because the gate is written as a general
gate and the message is false in a way a future reader will trust.

The neighbouring case behaves differently again and is recorded beside it: a
project with only devDependencies inventories zero production packages, and the
runner's never-green-by-omission rule rewrites that to `error`, exit 21, with
the M2-C-2 message. Both directions are fail-closed; only the message in the
first is wrong.

## DV-5 (LOW): the lock-driven `build:runtime-deps` would ship a DEV `file:` dependency, as an absolute symlink

**Mechanism.** For a `file:` dependency npm writes TWO hidden-lock entries: the
link at `node_modules/<name>`, which carries no `dev` flag, and the target at
`<path>`, which carries `dev: true`. Round 1's rewrite skips entries whose path
does not start with `node_modules/`, so the flagged entry is never read and the
unflagged link entry is treated as production.

Measured on a fixture whose ONLY dependency is a dev `file:` dependency:

```
node_modules/dtool {"resolved":"vendor/dtool","link":true}
vendor/dtool       {"version":"1.0.0","dev":true,"license":"MIT"}
```

The licence gate calls it `1 production packages licensed`, which is the
harmless direction (over-inclusion, fail-closed). The build script is the other
direction: replaying this branch's `build:runtime-deps` over that tree produces

```
dist/node_modules/dtool -> /tmp/.../lab/m2/r2/vendor/dtool
```

a dev-only dependency, copied as a symlink to an absolute path on the build
machine, which would be dangling in any consumer's tree.

**Reachability: NOT reachable at this head.** `package.json` declares `ajv`,
`commonmark` and `yaml`, all from the registry, and no workspaces. I verified
that the shipped set is unchanged by the rewrite: ten packages under
`dist/node_modules` at `26ebf7f`, and replaying the OLD manifest walk against the
same `node_modules` gives the same ten names. This becomes live the moment a
`file:` or workspace dependency is added, which is why it is written down.

## DV-6 (LOW): the `untracked` disk walk skips dot-prefixed directories, so a hand-planted package there is invisible

Six plants into a real installed fixture, one at a time, each a package
declaring `GPL-3.0-only` against an allowlist of `["MIT"]`:

| plant | gate |
|---|---|
| A `node_modules/evil` | **red** |
| B `node_modules/.hidden/evil` | green (MISSED) |
| C `node_modules/@scope/evil` | **red** |
| D `node_modules/good/node_modules/evil` | **red** |
| E `node_modules/evil` symlinked outside the tree | **red** |
| F `node_modules/good/node_modules/.deep/evil` | green (MISSED) |

B and F are reachable code, not inert directories:
`require.resolve('.hidden/evil', {paths:[<node_modules>]})` resolves to the
planted `i.js`.

**Reachability is thin and is stated as such.** The skip only affects the
untracked DIRECTION. A package listed in the lock at a dot path is inventoried
normally, because the lock loop keys on the path and does not filter dots; and a
package absent from the lock is also absent from `build:runtime-deps`, so it does
not ship. npm itself puts only `.package-lock.json`, `.bin` and caches under a
dot. The check exists for "the lock is stale or the tree was edited by hand",
and a hand-edited tree is exactly where a dot directory would be used, which is
why this is recorded rather than dismissed.

## DV-7 (LOW): what is executed before the publish is not what is published; it is an equivalent re-pack

The pre-publish step verifies `$RUNNER_TEMP/artifact/*.tgz`, produced by the
`npm pack` step. `npm publish` does NOT publish that file: it runs
`prepublishOnly` and `prepack` again and packs the workspace afresh. The bytes
that reach the registry are therefore a re-pack of the same tree, not the bytes
that were installed and executed.

Nothing between the two steps writes to the workspace, the pre-publish
verification runs entirely under `$RUNNER_TEMP`, and I did not demonstrate a
divergence, which is why this is LOW rather than a charge against M3. It is
recorded because the phase's claim is that nothing is published before it has
been executed, and strictly the published bytes have not been.
`npm publish <tarball>` accepts a path and would close the gap exactly.

## DV-8 (MEDIUM, and it is NOT this phase's code): `gates.yml:233` is exploitable by anyone who can open a pull request, and it is not on the register this round created

The round classifies this site and explicitly does not attack it, which its
non-coverage section says plainly. I attacked the classification.

`.github/workflows/gates.yml` interpolates `${{ github.head_ref }}` inside a
double-quoted `$(printf ... | sed ...)` in a `run:` body. The only open question
was whether a git ref name can carry the metacharacters, and it can
(`git check-ref-format --branch`, exit 0 for all four):

```
claude/m3-p1-$(id)           -> LEGAL
claude/m3-p1-"$(id)"         -> LEGAL
claude/m3-p1-;id;            -> LEGAL
claude/m3-p1-`id`            -> LEGAL
```

The trigger is `on: pull_request:` with no branch filter, so `github.head_ref`
is the SOURCE branch of any pull request, fork pull requests included, and is
attacker-chosen. The file carries no `permissions:` key at any level, so the job
runs with the repository's default token grant. The consequence is shell
execution on the runner during the very run that decides whether a change is
green.

**Does this branch touch it:** no. `git diff --name-only origin/main...HEAD`
does list the file, and
`git diff origin/main...HEAD -- .github/workflows/gates.yml | grep -c head_ref`
is `0`, so the round's claim is confirmed exactly as written.

**The finding against THIS ROUND is not the injection.** It is that
`delivery/review/tracked-findings-register.md` exists precisely so that "a
finding whose only home is a review document nobody re-reads ... is a finding
that has been lost politely" (delivery/review/tracked-findings-register.md:9),
and this finding's only home is the work history. It is the register's own
failure mode, in the branch that carries the register forward. The fix is one
table row, not a code change.

---

# What round 1 got RIGHT, measured rather than assumed

A refutation is worth as much as a charge, so these are given the same evidence.

## Mechanism M2's inventory is genuinely a READ, and I could not defeat it

Four of my six plants were caught (DV-6 above), and every structural case the
review named is closed:

- **A symlinked (`file:`) GPL dependency is caught.** `npm install` without
  `--install-links` produced `node_modules/linked -> ../vendor/linked` and a
  lock entry with `"link": true`. The gate followed the link, read the licence
  off disk, and went red:
  `LICENSE-ALLOWLIST linked@1.0.0 at node_modules/linked declares GPL-3.0-only`,
  exit 1.
- **A platform-skipped optional dependency does NOT produce a false finding.**
  A fixture with `optionalDependencies` restricted to `os: ["win32"]`, installed
  on linux: npm's hidden lockfile does not list the skipped package, so the
  lock-versus-disk cross-check has nothing to disagree about.
  `license: green (1 production packages licensed)`, exit 0. This was my
  strongest false-error hypothesis and it is refuted.
- **`npm ci --omit=dev` keeps the hidden lockfile**, and the gate reports
  `license: green (10 production package(s) inventoried)` from that tree.

## Mechanism M3 is CLOSED, and the mislabel the round declares is a label only

Step order read out of the parsed workflow by MY classifier, which matches
`npm publish` only at the start of a line of the trimmed run body rather than
anywhere in it:

```
 9 LISTING   "npm pack, and check the listing against the tree on disk"        if=undefined
10 EXECUTION "Install and RUN the packed artifact, before any publish (SC-011)" if=undefined
11 PUBLISH   "Publish to npmjs over OIDC ..."       if="${{ steps.decide.outputs.publish == 'yes' }}"
12 .         "Rehearsal only, nothing was published" if="${{ steps.decide.outputs.publish != 'yes' }}"
13 EXECUTION "Release verification against the registry, after publishing"      if="... == 'yes'"
```

LISTING then EXECUTION then PUBLISH, and the pre-publish execution at index 10
carries no `if:`. The step-12 mislabel is confirmed: the round's classifier calls
it PUBLISH, mine calls it `.`, and **the ordering conclusion is unchanged either
way**, because the real publish is index 11 and the execution is index 10 in both
classifications. It is a label, not a conclusion.

**The pre-publish execution genuinely runs.** I packed the kernel
(`npm pack`, 181 files, and no publish of any kind anywhere in this
verification) and ran the release verification against the tarball from a clean
directory, which is exactly what the workflow step does:

```
release-verify: @tiphys/kernel@0.1.0 verified from .../lab/m3/verify
release-verify: resolved package path .../lab/m3/verify/node_modules/@tiphys/kernel/package.json
EXIT=0
```

Six records, every `exitCode` 0, every `resolvedPackagePath` inside the install
prefix, every `sourceTreeOnResolutionPath` null: `clean-environment`, `install`,
`import`, `bin-version`, `copy-template`, `validate-template`.

## The resolution probe closes all three of the review's members

Each attacked from a fresh directory against the same real tarball:

| attack | outcome |
|---|---|
| a `node_modules/@tiphys/kernel` in a PARENT of the workdir | **REFUSED** before install, `found by node resolution from this directory`, exit 1 |
| a workdir reached through a SYMLINK into the checkout | **REFUSED** before install, `found by an ancestor of the real path declaring that name`, naming the checkout's own `package.json` |
| `NODE_PATH=/tmp` | **REFUSED**, exit 1, naming the variable |

The refusal names the question that was answered in each case, which is what the
round claimed. And the post-install contamination field is not merely recorded:
`test/license-gate.test.ts` asserts every record's
`sourceTreeOnResolutionPath` is null, so it can go red.

**`NODE_OPTIONS` is not refused** and a run with `NODE_OPTIONS="--require ..."`
completes with exit 0. The script's stated reason for refusing `NODE_PATH`, that
a verification whose resolution order depends on an inherited variable is not
reproducible even when it is correct, applies to `NODE_OPTIONS` word for word.
**I did not demonstrate a corrupted witness through it**, so this is recorded as
an open question and not as a finding.

## The `confirm` string is safe in every direction I could construct

The decide body was extracted from the workflow and executed against nine values
the round's own table does not carry. Every one rehearses or fails closed:

| input | exit | emitted |
|---|---|---|
| `CONFIRM` unset entirely | 1 | none; `CONFIRM: unbound variable` |
| `REQUESTED` unset entirely | 1 | none; `REQUESTED: unbound variable` |
| both unset | 1 | none |
| confirm with a trailing newline | 0 | `publish=no` |
| confirm with a trailing space | 0 | `publish=no` |
| confirm `*` (a glob) | 0 | `publish=no` |
| requested `*`, confirm `*` | 1 | none; refusing |
| requested and confirm both empty | 1 | none; refusing |
| `GITHUB_OUTPUT` unset | 1 | none; unbound variable |

`[ "$CONFIRM" = "$declared" ]` is POSIX `[` with `=`, which does not glob; the
`*` row is the witness for that rather than an assertion about bash. The
replacement of the boolean input is a strict improvement over `== false`, and I
found no direction in which the new default is less safe than the old one.

## The suite, all four axes, re-measured. Every reported number matches.

| invocation | toolchain | dist | tests | pass | fail | SKIPPED |
|---|---|---|---|---|---|---|
| `npm test` | v26.6.0 | built | 809 | 809 | 0 | **0** |
| bare `node --test` from the root | v26.6.0 | built | 811 | 811 | 0 | **0** |
| `npm test` under `bash -lc` | v22.22.2 | built | 809 | 807 | 0 | **2** |
| `npm test` | v26.6.0 | **absent** | 809 | 797 | 0 | **12** |

`npm run build` after the dist-absent run exits 0 and `git status --porcelain`
is empty. The dist-absent skip count is 12 where standing warning 12 records 9,
so this round adds three more dist-dependent tests; the round reports 12 and 12
is what I measure.

## The gate bundle on my own head, which carries the branch plus this document

```
gates: declared 16 applicable 11 verdict 11 green 10 red 1 not-applicable 5 error 0 vacuous 0
gates: suite: green: ... reported 809 test(s) from 45 file(s) (pass 809, fail 0, skipped 0, ...); 738 behavior(s) resolve
gates: red-witness: green: 6 witness(es) evaluated (5 own, 1 stored re-evaluated); every witness red against every declared dangerous state and green at head
gates: license: green: 10 production package(s) inventoried, all with license metadata on the declared allowlist
gates: agent-rules-drift: green   brief-drift: green   clause-map: green: 74 rows checked
gates: scope: not-applicable: branch claude/verify-m3-p10-round-1 does not match ^(?:claude/m[0-9]+-p[0-9]+-.*)$
```

The single red was `citations`, on an earlier draft of THIS document, for a bare
`gates.yml:233` matching no declared root. It is fixed by quoting, per the
hygiene note above. `scope` is not-applicable because my branch is deliberately
not a phase branch, which is CLAUDE.md's branch-naming rule working.

## The fixtures becoming real installed trees costs little and adds no network dependency

- **Not network-dependent.** The fixtures use `file:` dependencies only. A
  fixture install with the registry pointed at an unreachable address
  (`--registry http://127.0.0.1:1`) exits 0 in 220ms and writes
  `node_modules/.package-lock.json`.
- **Cost, at both heads on one toolchain and one build state:**
  `test/license-gate.test.ts` at pre-round `8d056f6` is 16 tests, 16 pass, 0
  skipped, `duration_ms 13340`; at `26ebf7f` it is 23 tests, 23 pass, 0 skipped,
  `duration_ms 21308`. Eight seconds for seven more tests, against a whole-suite
  run of about 197 seconds.
- **Order dependence:** each fixture installs into its own `mkdtemp` directory
  and is torn down. I read the helper rather than running the file under a
  randomised order, so this is a reading and not a measurement.

---

# Verdict, mechanism by mechanism

| mechanism | verdict | on what evidence |
|---|---|---|
| **M1**, a guard asserted by its text rather than evaluated | **OPEN** | DV-1: a workflow publishing on every dispatch passes all three assertions green. DV-2 and DV-3 are the class-scope half |
| **M2**, a check that models what it should read | **CLOSED**, with DV-4, DV-5 and DV-6 as residues | four of six plants caught, symlinks caught, nesting caught, optional-skip refuted, all three resolution-probe members closed |
| **M3**, the artifact is never executed before it is published | **CLOSED** | order re-derived independently; the pre-publish verification executed end to end, exit 0, six records |

**Overall: NOT VERIFIED.** The round did real work and the two mechanisms it
closed are closed properly, with refutations that survived my attacks. M1 is not
closed: the round moved the DECISION from a described expression to an executed
script, which is the right move and does work, and then left the step-IDENTIFYING
half of the same assertion on a substring. The behaviour under test is guarded;
the SUBJECT of the test is not pinned down.

The DV-1 fix is small and does not need a new design, which matters against
DR-0027's two-round cap: one predicate change plus a uniqueness assertion.

## The claim grep, both forms, walked over this document

Line-based (the binding form) gives 7 hits; the wrap-insensitive form gives 7
occurrences, so nothing is hidden by a wrap. Each hit, settled:

| where | phrase | settled by |
|---|---|---|
| working method | "never the repository clone and never the implementer's tree" | `git -C /home/user/tiphys-ai-helmsman worktree list` shows this verification's worktree at `.../scratchpad/dv-p10/wt` on branch `claude/verify-m3-p10-round-1`, distinct from the clone at `/home/user/tiphys-ai-helmsman` and from the implementer's `.../scratchpad/p10/wt` |
| DV-1 witness paragraph | `always()` | not a claim: it is the literal `replace` value inside `witness/release-publish-guard-exact-complements.json`, read from the file |
| DV-4 | "the production set cannot be READ" | not my claim: it is captured stdout from `node scripts/license-gate.mjs`, quoted verbatim |
| DV-4 | "never-green-by-omission" | not a claim: it is the printed name of rule M2-C-2 in the runner's own output |
| DV-5 | "the flagged entry is never read" | the two lines above it are the fixture's actual hidden lockfile, showing `dev: true` only on the `vendor/dtool` key, and the gate's own output calling the tree `1 production packages licensed`. Both captured |
| verdict table | "the artifact is never executed before it is published" | not a claim: it is mechanism M3's NAME, taken verbatim from the arbitration |

One phrase, "cannot be READ", is captured output rather than authored text, and
it is listed above rather than silently exempted.

## What this verification does NOT establish

Read first.

- **It does not run the release workflow.** No dispatch, no publish, no
  `--dry-run`, by instruction and because that is the phase's whole point. Every
  statement about the workflow is from its parsed source or from executing a
  piece of it in isolation. **DV-1 and DV-2 are properties of the TEST, proved
  by execution; that the resulting workflow would in fact publish is read from
  Actions semantics and is not measured.**
- **It does not attack `gates.yml:233` by pushing a hostile ref.** DV-8
  establishes that the metacharacters are legal in a branch name and that the
  interpolation reaches a shell. It does NOT demonstrate execution on a runner,
  and doing so would mean pushing a hostile branch to this repository, which I
  did not do.
- **It does not exhaust the licence inventory.** Workspaces, npm aliases
  (`npm:` protocol), `auto-install-peers`, peer-dependency trees and a
  registry-installed package whose tarball differs from its lock entry are all
  untested. My plants were six, chosen for structural difference, not for
  coverage. The round declares workspaces and aliases as untested and that
  declaration is accurate.
- **It does not test `NODE_OPTIONS` to a conclusion.** I established the gap and
  did not build a preload that corrupts a witness through it, so whether it is
  exploitable is open in both directions.
- **It does not re-derive the eleven original findings** or re-run either
  clean-room review. It takes the arbitration's decomposition into three
  mechanisms as its subject and attacks the round against that.
- **It does not check the `.npmrc` residue**, the `dist` oracle's
  names-not-contents limit, or HRB-4's reachability. All three are declared open
  by the round and I inherited those declarations without testing them.
- **The four-axis suite numbers are single runs**, not repeated, so a flaky test
  that happened to pass would be invisible here. `test/lock.test.ts` and
  `test/gates.test.ts` are on the register as unmeasured flake sites
  (delivery/review/tracked-findings-register.md:265).
- **Nothing here says the round is unsafe to merge after a fix.** It says one of
  three mechanisms is open and names the smallest change that would close it.
