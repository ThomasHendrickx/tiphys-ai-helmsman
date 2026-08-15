# Work history: the release manifest's `repository` field

Branch: `claude/release-manifest-repository-field`, cut from `main` at 5336859.
Deliberately NOT matching `^claude/m[0-9]+-p[0-9]+-`: this is a defect fix on
the release path, not a plan phase, and that pattern makes the scope gate demand
a phase declaration (CLAUDE.md:601). The consequence is measured rather than
assumed, in section 8 below: the scope gate's precondition prints the branch and
the pattern it did not match.

This file is the beacon (T-008 rule 1). It was created and pushed before the
work and appended as the work happened.

## 1. The defect

The `0.1.0` publish dispatch, run 31861403550, reached
`npm publish --access public --provenance` (.github/workflows/release.yml:286)
and the registry refused it:

```
npm error code E422
npm error 422 Unprocessable Entity - PUT https://registry.npmjs.org/@tiphys%2fkernel
Error verifying sigstore provenance bundle: Failed to validate repository information:
package.json: "repository.url" is "", expected to match
"https://github.com/ThomasHendrickx/tiphys-ai-helmsman" from provenance
```

Nothing was published, `0.1.0` is still free, and the tag job did not run
because `needs: release` (.github/workflows/release.yml:379) fails when the
release job fails. That is the design working and nothing in it was changed.

`package.json` on `main` at 5336859 declared no `repository` key at all.

## 2. The mechanism, not the instance

The instance is "the field is missing". The mechanism is:

**A property of the published artifact that only the registry checks is a
property nothing in this repository can be red about.**

Every other manifest key the release path depends on already has a local
assertion behind it. `version` is compared against the dispatch input by the
`decide` step (.github/workflows/release.yml:178), `files` is compared against
the built tree by the pack check, `bin` is INSTALLED AND EXECUTED by
`scripts/release-verify.sh` before the publish. `repository` had none, so its
state was first observable at the one step in the process with no clean undo.

The counterfactual is measured, not argued. On `main` at 5336859, with
`repository` absent, the whole local process is green:

| probe on `main` at 5336859 | exit |
|---|---|
| `node scripts/license-gate.mjs` | 0 |
| `npm pack --dry-run` | 0 |
| `node --test test/license-gate.test.ts` | 0 |
| `npm test` (node v26.6.0, `dist/` built) | 0, 822 tests, 822 pass, 0 skipped |

That is the shape this repository keeps paying for: a green report that is true
and says nothing about the property that mattered.

## 3. The form of the field, and how it was established

npm accepts a string shorthand or an object with `type` and `url`, so the choice
had to be measured rather than picked. Two measurements settled it, both against
the npm 11.18.0 bundled with the floor toolchain (node v26.6.0), which is the
version .github/workflows/release.yml:152 pins the runner to.

**Measurement one: what the attestation claims.** `libnpmpublish`'s provenance
module builds the attestation's repository claim as
`${env.GITHUB_SERVER_URL}/${env.GITHUB_REPOSITORY}`, one line of its own source:

```
$ grep -rn "repository" <npm-root>/node_modules/libnpmpublish/lib/provenance.js
37:              repository: `${env.GITHUB_SERVER_URL}/${env.GITHUB_REPOSITORY}`,
44:              repository_id: env.GITHUB_REPOSITORY_ID,
45:              repository_owner_id: env.GITHUB_REPOSITORY_OWNER_ID,
```

For this repository that is `https://github.com/ThomasHendrickx/tiphys-ai-helmsman`,
which is exactly the string the registry's refusal quoted. So the refusal is
fully explained: the two sides of the comparison are the attestation's claim and
the manifest's `repository.url`, and the second was absent.

**Measurement two: what npm sends.** `npm publish` does not send the manifest as
authored: `lib/commands/publish.js` reads it through `@npmcli/package-json`'s
`fix`, whose `fixRepositoryField` step promotes a string to an object and
normalizes the url through `hosted-git-info`. Four candidate manifests were run
through that exact code path and the reported `changes` recorded:

```
--- absent (today on main)
    fixed repository: undefined
    repository.url  : ""
    changes         : []
--- string shorthand
    fixed repository: {"type":"git","url":"git+https://github.com/ThomasHendrickx/tiphys-ai-helmsman.git"}
    repository.url  : "git+https://github.com/ThomasHendrickx/tiphys-ai-helmsman.git"
    changes         : ["\"repository\" was changed from a string to an object","\"repository.url\" was normalized to \"git+https://github.com/ThomasHendrickx/tiphys-ai-helmsman.git\""]
--- object git+https .git
    fixed repository: {"type":"git","url":"git+https://github.com/ThomasHendrickx/tiphys-ai-helmsman.git"}
    repository.url  : "git+https://github.com/ThomasHendrickx/tiphys-ai-helmsman.git"
    changes         : []
--- object plain https
    fixed repository: {"type":"git","url":"git+https://github.com/ThomasHendrickx/tiphys-ai-helmsman.git"}
    repository.url  : "git+https://github.com/ThomasHendrickx/tiphys-ai-helmsman.git"
    changes         : ["\"repository.url\" was normalized to \"git+https://github.com/ThomasHendrickx/tiphys-ai-helmsman.git\""]
```

The first row REPRODUCES the registry's message: an absent `repository` reduces
to a `repository.url` of `""`, which is the exact value the refusal quoted. That
is the strongest evidence available here that the diagnosis is right, and it was
obtained without publishing anything.

The third row is the reason for the choice. **Of the accepted spellings, exactly
one is already a fixed point of npm's own fixer**, and that is the object form
with `git+https://<host>/<owner>/<project>.git`. Every other spelling reaches
the registry only because a normalization step rewrote it on the way.

That matters because the tarball ships the manifest AS AUTHORED, which was also
measured rather than assumed:

```
$ npm pack --pack-destination <dir>          # exit 0, tiphys-kernel-0.1.0.tgz
$ tar -xzf <tarball> package/package.json
$ node -p 'JSON.stringify(require(".../package/package.json").repository)'
{"type":"git","url":"git+https://github.com/ThomasHendrickx/tiphys-ai-helmsman.git"}
$ cmp <extracted>/package.json package.json
IDENTICAL
```

So with the fixed-point form the authored bytes, the bytes inside the tarball
and the manifest npm sends are all the same bytes, and no normalization step is
load-bearing between them. That is the form chosen:

```json
  "repository": {
    "type": "git",
    "url": "git+https://github.com/ThomasHendrickx/tiphys-ai-helmsman.git"
  },
```

**What was also measured, and rules out one form.** `hosted-git-info` was run
over six spellings. Five parse to the same `(github.com, ThomasHendrickx,
tiphys-ai-helmsman)` triple as the provenance URL and normalize to the same
canonical string; the `git://` spelling parses to the same triple but its
default representation is `git`, so it normalizes to `git://...` and NOT to the
canonical form. It is the one spelling that would have shipped a manifest whose
url differs from what the fixer produces, and it is not used.

## 4. `homepage` and `bugs`: not added, and why

They are not added. Three reasons, in the order they were checked.

1. **Neither is read by the check that failed.** The refusal names
   `repository.url` and nothing else, and the attestation carries only the
   repository claim (measurement one above). Neither key can fail a publish.
2. **npm does not derive them, so they are not free.** This was checked rather
   than assumed, because the obvious guess is that a hosted `repository` implies
   both. Measured through the same code path: with `repository` set to the
   chosen form, `fix()` and `normalize()` both leave `bugs` and `homepage`
   `undefined`. So adding them would be adding two real, independent fields.
3. **An unasserted field is the mechanism this round exists to close.** Adding
   `homepage` and `bugs` with no local assertion behind them would recreate,
   twice, exactly the shape section 2 names. Adding them WITH assertions widens
   this change well past the defect. The cost of leaving them out is that the
   npm page carries no separate homepage or issues link; the repository link,
   which is what the registry now has, is derived from `repository`.

If they are wanted later, the assertion pattern is already here to extend.

## 5. The derivation, and what it does not cover

The fix-round contract requires the command that enumerates every site of the
mechanism, with its full output. The mechanism is "a manifest key nothing local
goes red for", so the enumeration is over the manifest's own top-level keys:
delete each key in a copy of the tree and record which local checks redden.
`scripts/derive.sh` in scratch did this; the full output is:

```
key              license-gate pack-dryrun lgate-tests
name             exit 1     exit 1     exit 1
version          exit 1     exit 1     exit 1
description      exit 0     exit 0     exit 0
type             exit 0     exit 2     exit 1
license          exit 0     exit 0     exit 0
repository       exit 0     exit 0     exit 1
engines          exit 0     exit 0     exit 0
bin              exit 0     exit 0     exit 1
files            exit 0     exit 0     exit 1
scripts          exit 0     exit 0     exit 0
devDependencies  exit 0     exit 0     exit 0
dependencies     exit 0     exit 0     exit 1
tiphys           exit 1     exit 0     exit 1
```

The `repository` row is `exit 1` on the third probe BECAUSE OF THIS CHANGE. On
`main` that row is `exit 0 / exit 0 / exit 0`, which is the table in section 2.

Five keys still redden nothing under this harness: `description`, `license`,
`engines`, `scripts`, `devDependencies`. They are reported rather than fixed,
because none of them is the defect and widening the change to cover them is the
sprawl the brief forbids. `license` is the one worth a second look by whoever
picks this up: the license gate inventories DEPENDENCY licenses and the LICENSE
file, and does not read the manifest's own `license` key, so removing it is
locally silent.

**What the derivation does NOT cover, stated before any row is read:**

1. **Three probes, not the suite.** It runs `scripts/license-gate.mjs`,
   `npm pack --dry-run` and `node --test test/license-gate.test.ts`. A key
   guarded by some other test file reads as unguarded in this table. It is a
   lower bound on coverage, not an upper bound. The full suite was run for the
   `repository` row specifically (section 6), not for the other twelve.
2. **Deletion only, no other mutation.** The harness applies exactly one edit
   per key, `delete m[key]`, which is the whole mutation in `derive.sh`. A key
   present but holding a wrong value is a different dangerous state and this
   table says nothing about it. For `repository` the wrong-value state is
   exercised by the witness spec's second and third members, with the harness
   output in section 7; for the other twelve keys it was not exercised at all.
3. **It enumerates manifest keys, not registry rules.** The registry's
   validation rules are not in this repository, and I did not find a way to
   enumerate them locally. The obvious candidate was measured and does not do
   it: with `repository` deleted from a copy of this tree, so that the manifest
   is exactly the shape the registry refused,

   ```
   $ node -p 'JSON.stringify(require("./package.json").repository ?? null)'
   null
   $ npm publish --dry-run --provenance
   npm warn publish This command requires you to be logged in to https://registry.npmjs.org/ (dry-run)
   npm notice Publishing to https://registry.npmjs.org/ with tag latest and default access (dry-run)
   + @tiphys/kernel@0.1.0
   MAIN_SHAPE_DRYRUN_EXIT=0
   ```

   The strongest npm-side local check available is green on the tree the
   registry refused. So there may be further properties of a publish that this
   repository has no local assertion for, and this derivation would not show
   them. That is an open question left open, not an absence established.
4. **One repository, one registry.** Everything here is measured against npm
   11.18.0, node v26.6.0, and `registry.npmjs.org`. A different npm version
   normalizes differently; the pin at .github/workflows/release.yml:152 is what
   makes the measurement apply to the run that will happen.

## 6. The test, and why its oracle is two oracles

The assertion lives in `test/license-gate.test.ts`, which is where the release
and pack family already lives, and it is named
`the published manifest names the repository provenance will assert`. It makes
four assertions:

1. `repository` is an object and `repository.url` is a non-empty string. Absent
   and empty are separate dangerous states, so presence is asserted separately
   from value.
2. `repository.url` parses to the same `(host, owner, project)` triple as the
   repository this package is published from. The registry compares VALUES, so a
   well-formed url naming a different project fails a publish exactly as an
   absent one does.
3. `repository.url` is npm's own normalized form, which is the fixed point
   section 3 established. This is stricter than a publish requires: a plain
   `https://` spelling would also publish, and it reddens here. That cost is
   deliberate and is recorded rather than hidden.
4. The constant is cross-checked against `${GITHUB_SERVER_URL}/${GITHUB_REPOSITORY}`,
   which is the live expression npm reads, falling back to the `origin` remote
   when those are unset. **On a CI runner the live oracle is required**, so this
   arm cannot silently stop running in the environment the publish happens in.

**The first version of this test had one oracle and it was wrong, and the
harness found it rather than a reviewer.** That version read ONLY the live
oracle and failed closed when it was unavailable. The red-witness harness
evaluates a spec inside a scratch clone whose `origin` is a filesystem path, so
every member of the witness would have been red for a reason nobody intended:
a vacuous witness, green-looking and worthless, which is precisely the failure
mode the red-witness rule exists to prevent (CLAUDE.md:320). The constant is now
the primary oracle, available in every environment, and the live one cross-checks
it. This is recorded because the wrong version was written first and the reason
it was wrong is not obvious from reading it.

## 7. The witnesses

Registered as `witness/release-manifest-names-the-provenance-repository.json`
with three structurally different members, and evaluated by the delivered
harness rather than by hand:

```
$ node src/gates/red-witness.ts --result <dir>/result.json --evidence <dir> \
    --base origin/main --head HEAD
red-witness: green (1 witness(es) evaluated (1 own, 0 stored re-evaluated in 0ms); every witness red against every declared dangerous state and green at head)
EXIT=0
```

Per member, read back from the harness's own `witness-records.json`:

| member | dangerous state | runs |
|---|---|---|
| 0 | the whole `repository` block REMOVED | exit 1 red, exit 1 red, exit 0 green control |
| 1 | `repository.url` present and EMPTY | exit 1 red, exit 1 red, exit 0 green control |
| 2 | `repository.url` naming a DIFFERENT repository | exit 1 red, exit 1 red, exit 0 green control |

Member 0 is the exact state that produced the E422. Members 1 and 2 are the two
states the registry's value comparison would also refuse, and they are
structurally different from member 0 and from each other: absent, present-but-
empty, present-and-wrong.

**A fourth state was exercised by hand and is not in the spec:** the STRING
SHORTHAND form, which reddens assertion 1 because the raw manifest then carries
no `repository.url` at all. It is left out of the spec because it is a valid
publishable spelling and the round did not want a stored witness asserting it
is not, but it is recorded here because it is the state a future editor is most
likely to reach for.

The harness rejected the first spec I wrote, which is worth recording:

```
red-witness: red (1 witness(es) evaluated ...; witness release-manifest-names-the-provenance-repository:
red: rule (g): members 1 and 2 mutate the same text of package.json and count as one member (collapse))
```

Two of the three members shared their `find` text, and src/witness/run.ts:1318
collapses those to one member. "One witness is not a class" is enforced
structurally here, not left to judgment.

Captured output from the hand runs, one per state. **TRANSLITERATION DECLARED:**
node's test reporter prints U+2139 and U+2716, which fail the non-ASCII check,
so in the four blocks below U+2139 is rendered `i` (8 occurrences per block, 32
in total) and U+2716 is rendered `x` (3 occurrences per block, 12 in total).
Nothing else in any captured output was changed.

Member 0, the field removed:

```
x the published manifest names the repository provenance will assert (2.872908ms)
i tests 1
i pass 0
i fail 1
  AssertionError [ERR_ASSERTION]: package.json must declare a "repository" object; an absent field is what the registry reported as ""
    actual: 'undefined',
    expected: 'object',
    operator: 'strictEqual',
```

Member 1, the url emptied:

```
x the published manifest names the repository provenance will assert (2.507838ms)
i tests 1
i pass 0
i fail 1
  AssertionError [ERR_ASSERTION]: "repository.url" must not be empty
    actual: '',
    expected: '',
    operator: 'notStrictEqual',
```

Member 2, a different repository:

```
x the published manifest names the repository provenance will assert (4.173926ms)
i tests 1
i pass 0
i fail 1
  AssertionError [ERR_ASSERTION]: "repository.url" "git+https://github.com/ThomasHendrickx/some-other-repository.git" does not name "https://github.com/ThomasHendrickx/tiphys-ai-helmsman", which is the repository this package is published from
    actual: { host: 'github.com', owner: 'ThomasHendrickx', project: 'some-other-repository' },
    expected: { host: 'github.com', owner: 'ThomasHendrickx', project: 'tiphys-ai-helmsman' },
    operator: 'deepStrictEqual',
```

The fourth state, the string shorthand:

```
x the published manifest names the repository provenance will assert (2.717482ms)
i tests 1
i pass 0
i fail 1
  AssertionError [ERR_ASSERTION]: package.json must declare a "repository" object; an absent field is what the registry reported as ""
    actual: 'string',
    expected: 'object',
    operator: 'strictEqual',
```

Each reddens at a DIFFERENT assertion, which is what distinguishes three
members of a class from one member measured three times.

## 8. Gates and evidence

Toolchain: the fetched floor toolchain at node v26.6.0, npm 11.18.0, first on
PATH, `node --version` confirmed in the shell that ran each command. The worktree
is under `/tmp/claude-0`, which per CLAUDE.md:803 is what makes
`runCliUnprivileged` reachable; a clone elsewhere is a different measurement and
this run does not speak for it.

**The suite, as a complete sentence:** invocation `npm test`, toolchain node
v26.6.0 (the fetched floor toolchain), `dist/` built by `npm run build`
immediately before, worktree under `/tmp/claude-0`: **824 tests, 824 pass, 0
fail, 0 SKIPPED, exit 0**. On `main` at 5336859 under the identical four
conditions the same command reports 822 tests, 822 pass, 0 skipped, exit 0; the
difference is the two tests this change adds.

Preflight and scripts:

| command | exit |
|---|---|
| `npm ci` | 0 |
| `npm run build` | 0, `git status --porcelain` empty afterwards |
| `npm test` | 0, 824/824, 0 skipped |
| `node scripts/check-authored-bytes.mjs` | 0 |
| `node scripts/render-agent-rules-gates.mjs --check` | 0 |
| `node scripts/check-brief-drift.mjs --check` | 0 |
| `node scripts/check-agents-references.mjs` | 0 |
| `node scripts/license-gate.mjs` | 0 |
| `scripts/m1-exit-test.sh --mode local` | 0 |

The registry bundle, `--mode full --base origin/main --head HEAD --phase` set
the way the workflow derives it:

```
gates: declared 16 applicable 9 verdict 9 green 9 red 0 not-applicable 7 error 0 vacuous 0
gates: required gate(s) not applicable: citations, scope, red-witness
```

Exit 21 without `--phase` and **20 with it**. 20 is `EXIT_NOT_APPLICABLE`, and
its reason is the line above: three required gates evaluated their preconditions
and found them unmet. Each printed the evaluation:

- `citations`: no changed path under `delivery/plan/`, `delivery/verification/`,
  `delivery/decisions/`, `delivery/tuition/`, `delivery/requirements/` or
  `delivery/STATE.md`. A work history is not in that set.
- `scope`: `branch claude/release-manifest-repository-field does not match
  ^(?:claude/m[0-9]+-p[0-9]+-.*)$`, which is the branch-naming rule working as
  intended and is why the branch is named this way (gate-registry.yaml:136).
- `red-witness`: no changed path under `src/` or `bin/`. The witness was
  therefore run DIRECTLY, in section 7, rather than left unrun.

**That exit code is not what CI runs, and the thing CI runs was run here too.**
The workflow invokes `scripts/m2-exit-test.sh --bundle pr --manifest ...`, which
handles required-not-applicable and additionally demonstrates the three
diff-scoped gates green on triggering states. Run locally with this branch's own
base, head and phase:

```
gates: declared 12 applicable 6 verdict 6 green 6 red 0 not-applicable 6 error 0 vacuous 0
m2-assert (PR bundle): OK. 12 gate record(s) match section 1.4; ... zero red; zero error; zero vacuous.
m2-green: red-witness GREEN with 4 unit(s) against M2-P2 merged diff 1b6f0963b62f^..1b6f0963b62f (real history)
m2-green: scope GREEN with 2 unit(s) against scratch repo: ...
m2-green: citations GREEN with 1 unit(s) against scratch repo: ...
m2-exit-test: OK.
M2_EXIT=0
```

Per T-009, all of the above is evidence for the configuration it ran under and
for nothing else. It is a local `push`-shaped and PR-shaped rehearsal on this
head; the `pull_request` run on the real head and the post-merge `push` run are
still owed and are the orchestrator's to observe.

## 9. One thing this change corrected in itself

`test/behaviors.json` first carried a prose description for the new id. The
suite gate resolves a behavior by matching its description against a REPORTED
TEST NAME (src/gates/suite.ts:1042), so the bundle went red with
`behavior release-manifest-names-the-provenance-repository does not resolve`.
The description is now the test name exactly. Recorded because the registry's
value is not a description at all, whatever the file looks like.

## 10. What was deliberately not done

- Nothing was published and no workflow was dispatched. `0.1.0` is still free.
- `.github/workflows/release.yml` is untouched, including its filename, which
  npm's trusted-publisher configuration names.
- No `git checkout --` was run in a tree holding uncommitted work. Every
  mutation experiment was performed in a copied tree or a separate worktree, and
  the separate worktree was removed with `git worktree remove --force`.

## 11. Claim grep

Both forms were run over this file, and they agree, so nothing is hidden by a
wrap. The first pass found FOUR hits in the body and all four were addressed by
rewriting rather than by adding a footnote:

| hit, as first written | where | what was done |
|---|---|---|
| "Deletion only, `never` corruption" | section 5 item 2 | rewritten to "Deletion only, no other mutation", and the actual edit `delete m[key]` is now quoted from the harness |
| "that state `is covered` separately" | section 5 item 2 | rewritten to "is exercised by", pointing at the harness output in section 7 with its per-member runs |
| "`cannot be` enumerated from here" | section 5 item 3 | rewritten to "I did not find a way to enumerate them locally", with the `npm publish --dry-run --provenance` capture showing the obvious candidate is green on the refused tree |
| "still `cannot be` red about" | section 5 item 3 | rewritten to "has no local assertion for" |

Re-run, the body now has ZERO hits. The matches the two commands still report are
all self-referential: this section's own table, which quotes the phrases in order
to name them, and the two commands below, whose alternation lists contain every
phrase by construction. A reader re-running these should expect exactly that and
nothing in sections 1 to 10.

```
grep -nEi 'cannot be|impossible|needs a|is covered|catches|would catch|recovers|anyway|always|never|no way to' \
  delivery/work-history/release-manifest-repository-field.md
tr '\n' ' ' < delivery/work-history/release-manifest-repository-field.md \
  | grep -oEi 'cannot be|impossible|needs a|is covered|catches|would catch|recovers|anyway|always|never|no way to'
```
