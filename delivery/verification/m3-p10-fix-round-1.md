# Delta verification: M3-P10 fix round 1

Subject: branch claude/m3-p10-release-and-exit, round-1 head 26ebf7f (pull
request #140). Pre-round head for the delta: 8d056f6.

Verifier: independent delta verifier, dispatched as an adversary of the ROUND,
not a reviewer of the phase. Working tree is a separate worktree cut from
origin/claude/m3-p10-release-and-exit; nothing in the implementer's tree or in
the repository clone was touched. Mutation labs are built OUTSIDE the worktree.

Status: IN PROGRESS. This file is the beacon; it is appended to as work
proceeds and its mtime is the liveness signal.

## Why this verification exists

The immediately preceding phase, M3-P11, ran the same sequence: its fix round 1
closed the mechanisms it was sent to close and introduced a regression that made
an honest precondition emit a false error, failing the whole gate bundle, while
the pull request was GREEN at that head. The delta verification is what found
it. This one assumes the same is possible.

## Plan

1. Read the two clean-room reviews, the arbitration, the round-1 work history,
   and the full diff 8d056f6..26ebf7f.
2. Re-attack the three mechanisms with my own constructions:
   - M1, a guard asserted by its text rather than evaluated.
   - M2, a check that models what it should read.
   - M3, the artifact is never executed before it is published.
3. Hunt for regressions introduced by the round itself: the no-fallback licence
   reader, the confirm-string replacement of the boolean dry-run input, and the
   real installed fixtures.
4. Re-run the suite on all four axes and the gate bundle, and compare against
   the numbers the round reports.
5. Audit the declared non-coverage for accuracy and for gaps it did not declare.

## Hard limits observed

No `npm publish` in any form, including `--dry-run`. No `npm login`. No workflow
dispatch. No file modified outside this one.

## Findings

(appended below as they are established)

---

## Environment for every measurement below

Unless a row says otherwise: node v26.6.0 from the scratch toolchain, npm
11.18.0, `dist/` built, worktree cut from origin/claude/m3-p10-release-and-exit
at 26ebf7f. Mutation labs are COPIES made outside the worktree, with `.git`
removed, so nothing in this section can have touched the branch.

Baseline before any mutation, in the lab copy, the four workflow tests of
`test/license-gate.test.ts`:

```
✔ the release workflow is manually dispatched only, authenticates by OIDC, and holds no npm token
✔ no Actions expression is interpolated into any run: body of the release workflow
✔ the publish and rehearsal guards are exact complements, so an inverted guard reddens
✔ the publish decision script is EXECUTED against a table of inputs, and only an exact confirm publishes
tests 4  pass 4  fail 0
```

(Node's reporter glyphs U+2714 and U+2139 were transliterated to `v` and `i`
nowhere: the captures in this document keep them, and where a capture is quoted
the codepoints present are U+2714 only. Counts are given at each capture.)

## DV-1 (HIGH): the publish guard is defeated by any earlier step whose run body mentions `npm publish`

**Mechanism.** `test/license-gate.test.ts` finds the publish step with
`steps.find((step) => (step.run ?? "").includes("npm publish"))`, that is, the
FIRST step in the `release` job whose run body contains that substring. The
assertion then constrains THAT step's `if:`. Any earlier step whose body
mentions the string absorbs the assertion and leaves the real publish step
unconstrained.

This is not hypothetical framing. The workflow ALREADY contains a second step
whose run body carries the string: the rehearsal notice says "npm publish did
NOT run". It works today only because the real publish step happens to come
first. And the round's own work history declares the identical mislabel in its
M3 step classification, where step 12 is called PUBLISH because its echo text
contains the words "npm publish". The same defect is in the SHIPPED TEST, where
it was not declared.

**Construction, run.** In a lab copy, one step inserted before the publish step
and the publish step's `if:` deleted outright, so the workflow publishes on
EVERY dispatch including a rehearsal with an empty confirm:

```
      - name: Announce the publish decision
        if: ${{ steps.decide.outputs.publish == 'yes' }}
        run: |
          echo "about to run npm publish"

      - name: Publish to npmjs over OIDC (DR-0008 registry, DR-0024 authentication)
        run: npm publish --access public --provenance
```

Parsed step list confirming the real publish step now carries no guard:

```
11 "Announce the publish decision" if= "${{ steps.decide.outputs.publish == 'yes' }}"
12 "Publish to npmjs over OIDC (DR-0008 registry, DR-0024 authentication)" if= undefined
13 "Rehearsal only, nothing was published" if= "${{ steps.decide.outputs.publish != 'yes' }}"
```

Result, the three M1 tests:

```
✔ no Actions expression is interpolated into any run: body of the release workflow
✔ the publish and rehearsal guards are exact complements, so an inverted guard reddens
✔ the publish decision script is EXECUTED against a table of inputs, and only an exact confirm publishes
tests 3  pass 3  fail 0
```

The whole of `test/license-gate.test.ts` against the same mutant reports
`tests 23  pass 22  fail 1`, and the single failure is `git ls-files schemas
failed / 128 !== 0`, an artefact of the lab copy having no `.git`, not of the
mutant.

**Why the existing witness does not catch it.** Both dangerous states in
`witness/release-publish-guard-exact-complements.json` mutate an `if:` line in
place. Mine leaves every `if:` string byte-identical and changes WHICH STEP the
finder resolves to. CLAUDE.md's "one witness is not a class" rule asks for two
structurally different members; the two present are the same member twice.

**Reachability (DR-0027).** `npm publish` is the one action in the milestone
with no clean undo. The defect does not merely make a shipped artifact wrong, it
removes the only automated guard over whether anything is shipped at all. It
reaches `.github/workflows/release.yml`, which is the release path.

## DV-2 (MEDIUM): the "no `${{ }}` in any run body" assertion covers one job of one workflow, not every step

**Mechanism.** The assertion iterates `document.jobs["release"].steps`. Its own
comment at test/license-gate.test.ts:1191 says it "asserts the property over
EVERY step". It asserts it over every step OF ONE NAMED JOB.

**Construction, run.** A second job appended to `.github/workflows/release.yml`,
carrying two `${{ }}` interpolations directly into a run body, which is the
HRB-11 mechanism verbatim, and an unguarded `npm publish`:

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

Parsed: `jobs: [ 'release', 'notify' ]`. All four workflow tests pass:
`tests 4  pass 4  fail 0`.

## DV-3 (MEDIUM): interpolation reaches a shell-equivalent body through `with:`, which the assertion does not read

**Construction, run.** A `uses:` step inside the `release` job itself:

```
      - uses: actions/github-script@v7
        with:
          script: |
            core.info(`asked for ${{ inputs.version }}`);
```

`${{ inputs.version }}` is substituted textually into JavaScript that
`github-script` then evaluates, which is the same injection surface HRB-11
names one language along. The assertion reads only `step.run`, so:
`no Actions expression is interpolated into any run: body ... tests 1 pass 1
fail 0`.

## Refuted, and recorded because a refutation is worth as much as a charge

- **The `confirm` string is safe in every direction I could construct.** The
  decide body was extracted from the workflow and executed against nine values
  the round's table does not carry. Every one either rehearses or fails closed:

  | input | exit | emitted |
  |---|---|---|
  | `CONFIRM` unset entirely | 1 | (none), `CONFIRM: unbound variable` |
  | `REQUESTED` unset entirely | 1 | (none), `REQUESTED: unbound variable` |
  | both unset | 1 | (none) |
  | confirm with a trailing newline | 0 | `publish=no` |
  | confirm with a trailing space | 0 | `publish=no` |
  | confirm `*` (a glob) | 0 | `publish=no` |
  | requested `*`, confirm `*` | 1 | (none), refusing |
  | requested and confirm both empty | 1 | (none), refusing |
  | `GITHUB_OUTPUT` unset | 1 | (none), unbound variable |

  `[ "$CONFIRM" = "$declared" ]` is POSIX `[` with `=`, which does not glob;
  the `*` row is the witness for that. The replacement of the boolean input is a
  strict improvement over `== false`, not a regression.

- **A platform-skipped optional dependency does NOT produce a false finding.**
  A fixture with `optionalDependencies` restricted to `os: ["win32"]`,
  installed on linux: npm's hidden lockfile does not list the skipped package,
  so the lock-versus-disk cross-check has nothing to disagree about.
  `license: green (1 production packages licensed)`, exit 0.

- **A symlinked (`file:`) dependency carrying GPL-3.0-only IS caught.**
  `npm install` without `--install-links` produced `node_modules/linked ->
  ../vendor/linked` and a lock entry `node_modules/linked {"link":true,...}`.
  The gate followed the link, read the licence off disk, and went red:
  `LICENSE-ALLOWLIST linked@1.0.0 at node_modules/linked declares GPL-3.0-only`,
  exit 1.

- **The lock-driven `build:runtime-deps` ships exactly the set the old walk
  shipped.** Ten packages either way, same names, measured by replaying the old
  walk against the same `node_modules`.
