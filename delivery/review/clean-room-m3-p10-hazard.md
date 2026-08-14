# Clean-room review: M3-P10 (release and exit), ADVERSARIAL HAZARD lens

- Branch: claude/m3-p10-release-and-exit
- Head reviewed: 8d056f6
- Pull request: #140
- Reviewer lens: adversarial hazard. A second reviewer walks the acceptance
  criteria in parallel; this document does not re-walk them.
- Toolchain: node v26.6.0, npm 11.18.0, from the scratch prefix, confirmed in
  every shell that ran a command.
- Status: IN PROGRESS (this file is appended to as work proceeds; its mtime is
  the beacon required by CLAUDE.md:422).

## The claim under attack

The phase ships release machinery. The irreversible action in it is
`npm publish`. The design claim is that publishing is READY and CANNOT HAPPEN
by accident. Everything below attacks that claim and the guards around it.

## Attack list (declared before work, appended to as attacks are added)

1. Can anything publish without a deliberate owner dispatch? Evaluate what
   `if: ${{ inputs.dry-run == false }}` actually resolves to for a
   `workflow_dispatch` boolean input, for an omitted input, and for the string
   "false".
2. `prepublishOnly` and `prepack`: which npm commands fire each, and was the
   pack-listing evidence produced with scripts disabled?
3. Can the license gate pass vacuously, or green over a genuinely unlicensed
   package? Probe workspaces, optional deps, bundled deps, SPDX expressions,
   LICENSE-file-without-license-field, deduped transitives.
4. Can scripts/release-verify.sh pass against a contaminated resolution path?
   Probe NODE_PATH, parent node_modules, symlink, NPM_CONFIG_PREFIX, global
   install, parent .npmrc.
5. The three witness specs: red against the DANGEROUS state or merely against
   the absent feature? Two structurally different members per class?
6. Dependency-tree growth 6 -> 10: verify permissiveness independently, and
   ask whether the gate would have SEEN the growth or only sees it because the
   allowlist widened.
7. What does the `license` gate assert per gate rather than per bundle on a CI
   run (CLAUDE.md:577 four printed facts)?

Attacks added by this reviewer beyond the dispatched list are marked ADDED
where they appear.

## Findings

(Appended below as they are confirmed.)

### HRB-1 (HIGH): the license inventory is a MANIFEST WALK, not a reading of the installed tree, and it goes GREEN over a genuinely unlicensed shipped package

**Mechanism.** scripts/license-gate.mjs:154 builds the production set by
re-deriving it: it reads the root manifest's `dependencies`, then for each name
opens `<root>/node_modules/<name>/package.json` and recurses into THAT file's
`dependencies` (scripts/license-gate.mjs:162, scripts/license-gate.mjs:186).
Two properties follow and both are defects:

- only edges spelled `dependencies` are followed, and
- resolution is keyed on the BARE NAME at the ROOT `node_modules` only, with a
  visited-set keyed on name (scripts/license-gate.mjs:158).

The installer does not build the tree that way. Anything npm installs that the
manifest walk does not model is invisible to the gate: optional dependencies,
bundled dependencies, and any package NESTED because of a version conflict.

The mechanism is not "optional dependencies are skipped". It is **the gate
models the tree instead of reading it**, while `node_modules/.package-lock.json`
and `npm ls --omit=dev --all --json` both describe the tree npm actually built.

**Two structurally different members, both measured** (CLAUDE.md:415 requires a
class witness to redden under at least two). Node v26.6.0, npm 11.18.0, lab
outside the worktree, `--pack-listing` used so check 5 does not mask checks 1
to 4.

Member A, optional dependency. `good@1.0.0` (MIT) declares
`optionalDependencies: { evil: <tarball> }`; `evil@1.0.0` has NO `license`
field at all.

```
$ npm install --no-audit --no-fund   -> exit 0
$ ls node_modules                    -> evil  good
$ npm ls --omit=dev --all
root-optional2@1.0.0
`-- good@1.0.0
  `-- evil@1.0.0
$ node scripts/license-gate.mjs --root <root> --pack-listing <listing>
license: green (1 production packages licensed)
1 production package(s) inventoried, all with license metadata on the declared allowlist; LICENSE present in the pack listing
EXIT 0
```

`npm ci --omit=dev` was measured separately and installs `evil` as well
(exit 0, `ls node_modules` -> `evil  good`), and the gate is still green over
it. That matters because scripts/license-gate.mjs:141 states that neither
optional nor peer dependencies "is installed by `npm ci --omit=dev` in this
repository today". The measured behaviour of `npm ci --omit=dev` is that it
DOES install optional dependencies; the sentence is true only because no
present dependency declares any, and nothing in this phase detects the day one
does.

Member B, version-conflict nesting. `parenta` needs `nested@1.0.0` (MIT),
`parentb` needs `nested@2.0.0` (GPL-3.0-only). npm hoists one and nests the
other:

```
$ npm ls --omit=dev --all
root-nested@1.0.0
+-- parenta@1.0.0
| `-- nested@1.0.0
`-- parentb@1.0.0
  `-- nested@2.0.0
$ find node_modules -name package.json -path '*nested*'
  node_modules/nested/package.json                  nested@1.0.0 MIT
  node_modules/parentb/node_modules/nested/...      nested@2.0.0 GPL-3.0-only
$ node scripts/license-gate.mjs --root <root> --pack-listing <listing>
license: green (3 production packages licensed)
EXIT 0
```

A GPL-3.0-only package is physically installed, ships to every consumer of the
package, and the gate reports GREEN, because the name `nested` was already in
the visited set from the hoisted MIT copy.

**Reachability (DR-0027).** It reaches the shipped artifact and a real user
path. `package.json` does not vendor the production tree into the tarball
(`"!dist/node_modules"`, package.json:15), so a consumer's `npm install
@tiphys/kernel` resolves the FULL transitive production tree from the registry,
nested copies and optional dependencies included. The gate that is supposed to
say what licenses that consumer receives does not see them. Today's tree has
ten packages, all permissive, so this is a LATENT defect with no present
instance; it is HIGH because the gate's entire purpose is to be the thing that
notices the first instance, and it structurally cannot.

**Enumeration of the mechanism's sites, and what it did NOT cover.**

```
$ grep -n 'dependencies\|node_modules' scripts/license-gate.mjs
```
gives the single traversal at scripts/license-gate.mjs:154 to
scripts/license-gate.mjs:197 and no other. So there is exactly one site in this
script. The same shape exists a second time in the repository, in the
`build:runtime-deps` script at package.json:31, which walks `dependencies` from
`node_modules/<name>` in the same way; scripts/license-gate.mjs:15 says so
itself. That command is not a gate and its output is excluded from the pack, so
it is noted, not charged.

NOT covered by that command: I did not audit `src/` for a third copy of the
walk, and I did not test workspaces, `peerDependencies` with
`auto-install-peers`, or npm aliases (`"a": "npm:b@1"`). Aliases in particular
I reasoned about and did not measure.

**What would close it.** Read the tree instead of modelling it: parse
`node_modules/.package-lock.json` (which npm writes and which lists every
installed path with its resolved location) or `npm ls --omit=dev --all --json`,
and classify every entry it contains. The work history already runs `npm ls
--omit=dev --all` as a cross-check by hand; making the gate consume it is the
difference between a one-time human observation and a gate.

### HRB-2 (refuted, no finding): green over zero units

The implementer's claim that M2-C-2 rewrites green-with-zero-units to error
holds on the DIRECT invocation path, which is the one CI uses
(.github/workflows/gates.yml:222 runs `node scripts/license-gate.mjs`, not the
runner). Measured against a manifest with no `dependencies`:

```
license: error (0 production packages licensed)
M2-C-2 (never green by omission): a gate reporting green with units 0 examined
nothing, so this record is error; ...
EXIT 21
```

The rewrite is in `makeGateResult` at src/gates/result.ts:179 and the exit code
is taken from the REWRITTEN status at scripts/license-gate.mjs:284, so the
protection does not depend on the runner. Attack failed; recorded because a
failed attack is evidence too.

### HRB-3 (HIGH): the ONLY automated guard over `npm publish` asserts that the guard STRING CONTAINS "dry-run", so an inverted guard is green

**Mechanism.** The single irreversible action in this phase is
`npm publish --access public --provenance` at .github/workflows/release.yml:158.
Its guard is .github/workflows/release.yml:157. The only test that claims to
check it is test/license-gate.test.ts:845, whose comment reads "THE PUBLISH IS
GUARDED and the guard defaults to a rehearsal", and whose assertion is

    assert.match(String(publish.if), /dry-run/);          test/license-gate.test.ts:848

A substring match on the guard's TEXT. It does not evaluate the guard, does not
compare it to an expected expression, and does not distinguish a guard from its
own inverse. This is CLAUDE.md:116 exactly: a guard whose condition does not
test the property that matters is green and worthless. There is also no witness
spec for the registered behavior `release-workflow-dispatch-only-and-tokenless`
(witness/ carries three new specs and none is that one), and the `red-witness`
gate does not require one because it scopes to `src/` and `bin/`, so nothing
else covers this either.

**Measured, THREE structurally different members** (CLAUDE.md:415). Node
v26.6.0, in a lab copy of the tree outside the worktree, one line changed per
run, `--test-name-pattern` before the positional path (warning 7).

Control, unmutated:

```
+ the release workflow is manually dispatched only, authenticates by OIDC, and holds no npm token (83.320699ms)
tests 1 / pass 1 / fail 0
```

| mutation applied to the publish step's `if:` | what it would do | test |
|---|---|---|
| `${{ inputs.dry-run == true }}` | publishes EXACTLY when the operator asked for a rehearsal | tests 1, pass 1, fail 0 |
| `${{ inputs.dry-run != null }}` | publishes on every dispatch | tests 1, pass 1, fail 0 |
| `${{ inputs.dry-run \|\| true }}` | publishes on every dispatch | tests 1, pass 1, fail 0 |

Three inversions of the guard over the one action with no clean undo, and the
suite is green on all three, exit 0. (The capture above is real `node --test`
output; U+2714 was transliterated to `+`, 1 occurrence, and the U+2139 that
prefixes the summary lines was dropped from the table rows, 3 occurrences.
Nothing else in any captured output was changed.)

**Reachability (DR-0027).** It reaches the shipped artifact directly: the
defect class is "a wrong publish guard reaches `main` green", and the published
package is what a wrong guard publishes. It needs no attacker: an ordinary
edit to that line during a later phase, or a rebase resolving a conflict the
wrong way, is caught by nothing.

**What would close it.** Assert the guard EXACTLY, not by substring:
`assert.equal(String(publish.if).trim(), "${{ inputs.dry-run == false }}")`,
and assert the rehearsal step's guard is its exact complement. An exact-string
assertion reddens on all three mutants above. A behavioural alternative does not
exist here, because the correct number of runs of this workflow in M3-P10 is
zero, which the test's own comment (test/license-gate.test.ts:795) correctly
says.

### HRB-4 (LOW, reachability NOT established): `== false` coerces, and the permissive direction is null or empty string

**Mechanism.** .github/workflows/release.yml:157 compares an input to a BOOLEAN
LITERAL. GitHub's expression language casts operands of differing types to
numbers before comparing, with `null` and `''` both casting to 0, `false`
casting to 0, and a non-numeric string casting to NaN. Applying that table:

| value of `inputs.dry-run` | `== false` (publish) | `!= false` (rehearsal) |
|---|---|---|
| boolean `true` | false, skip | true |
| boolean `false` | TRUE, publish | false |
| string `"false"` | false, skip | true |
| string `"true"` | false, skip | true |
| `null` or `''` | **TRUE, publish** | **false** |

Every wrong value fails CLOSED except null and the empty string, which fail
OPEN and additionally suppress the "Rehearsal only, nothing was published"
notice, so the run looks like neither branch ran.

**This is DEDUCED, not measured, and the deduced half is named as such**
(CLAUDE.md:591). I have no way to evaluate a GitHub expression locally and the
hard limits forbid dispatching the workflow, so I did NOT establish that a
dispatch can ever deliver null or `''` for a `type: boolean` input carrying
`default: true`. It may be that GitHub's dispatch validation makes those
unreachable, in which case this is latent rather than live. **Open question for
the arbitrator**, stated as one rather than as a claim.

Severity LOW on that basis, and it is recorded because the FIX is free and
removes the question: gate on a string the operator must type, for example a
required `confirm` input asserted `inputs.confirm == inputs.version`. A
string-to-string comparison performs no numeric coercion, so null and `''` both
fail it, and it is a second pair of eyes rather than a default that can be
inverted by one keystroke.

### HRB-5 (HIGH): the rehearsal cannot catch a broken artifact, and the check that can runs AFTER the publish

**Mechanism.** The release workflow's step order is: pack listing check (no
`if:`), then publish guarded `dry-run == false`, then the rehearsal notice, then
release verification ALSO guarded `dry-run == false`
(.github/workflows/release.yml:157, .github/workflows/release.yml:171). So:

- a REHEARSAL (`dry-run` true, the default) never runs
  scripts/release-verify.sh at all, and
- a REAL run runs it only after `npm publish` has already happened.

The one check in the phase that installs the artifact and executes it is
therefore incapable of preventing a bad publish. It can only report one. That
inverts the purpose the workflow header states for the rehearsal
(.github/workflows/release.yml:134: "Run every gate, the license gate and npm
pack, then STOP before publishing. This is the rehearsal").

**Why that matters, measured.** Everything upstream of `npm publish` is a
LISTING check, and a listing check does not establish that the artifact runs.
One-word mutation in a faithful lab copy of this branch (`git archive HEAD`,
same node_modules, same dist): `files: ["dist", ...]` becomes
`files: ["dist/bin", ...]` at package.json:12.

| | control | mutant |
|---|---|---|
| pack listing | 181 entries, 121 under `dist/` | 62 entries, 2 under `dist/` |
| `the pack listing carries every declared kernel artifact ...` + `... no delivery, test, sandbox or src entry` | tests 2, pass 2, fail 0 | **tests 2, pass 2, fail 0** |
| the workflow's inline pack check (.github/workflows/release.yml:143) | exit 0 | **exit 0** |
| `node scripts/license-gate.mjs` | green, exit 0 | **green, exit 0** |
| install the packed tarball and run its bin | prints the version | **ERR_MODULE_NOT_FOUND `dist/src/cli.js`, exit 1** |

A package that is completely non-functional passes every check the phase runs
before `npm publish`, and fails the one it runs after.

The reason the listing checks miss it is the same defect on both sides: the
`dist` leg is a PRESENCE test. test/license-gate.test.ts:554 asserts
`[...files].some((path) => path.startsWith("dist/"))` and
.github/workflows/release.yml:148 asserts
`files.some((path) => path.startsWith(dir + "/"))`. The same test comments,
twelve lines earlier at test/license-gate.test.ts:523, correctly say that a
per-directory presence check is exactly what the plan's hazard row defeats, and
apply the stronger `git ls-files` comparison to the five TRACKED directories.
`dist/` is the one directory carrying the executable code and it gets the weak
check, because it is not tracked and `git ls-files` cannot be its oracle.

**Reachability (DR-0027).** Directly: it publishes. `npm publish` is
irreversible by the workflow's own account (.github/workflows/release.yml:114).

**What would close it, and both halves are cheap.**

1. Run scripts/release-verify.sh with `--tarball` against the locally packed
   artifact in BOTH arms, BEFORE the publish step. The `--tarball` mode exists
   for precisely this and is documented at scripts/release-verify.sh:46; it is
   simply not wired into the rehearsal.
2. Give the `dist` leg an oracle: compare the listing against
   `find dist -type f` (or against the built tree's file list) the way the five
   tracked directories are compared against `git ls-files`.

### HRB-6 (MEDIUM): the contamination probe answers a question that is neither necessary nor sufficient for Node resolution, and reports CLEAN three ways

**Mechanism.** scripts/release-verify.sh:112 defines "the source tree is on the
resolution path" as "some ancestor of the LOGICAL working directory holds a
package.json whose `name` equals the package under test". Node's resolution
does not work that way: it walks the REAL path, it consults `NODE_PATH`, and it
consults `node_modules` at every ancestor. The probe models none of those.

**Three structurally different members, all measured** (node v26.6.0, npm
11.18.0, real script, real tarball packed from this branch). A stand-in
checkout was used so the worktree under review was never written into.

Control, the real path: workdir `<checkout>/sub`.

```
release-verify: step clean-environment exited 1
release-verify: REFUSED. <checkout>/package.json declares name @tiphys/kernel,
  so the source tree is on the resolution path from <checkout>/sub.
EXIT 1
```

Member A, THE SAME PHYSICAL DIRECTORY reached through a symlink
(`<lab>/link -> <checkout>/sub`). `WORKDIR="$(cd ... && pwd)"` at
scripts/release-verify.sh:98 gives bash's LOGICAL pwd, so the upward walk never
leaves `<lab>`:

```
release-verify: @tiphys/kernel@0.1.0 verified from <lab>/link
EXIT 0
```

and every one of the six records carries `sourceTreeOnResolutionPath: null`.
This member also refutes the claim at scripts/release-verify.sh:109, that the
probes are safe to run before the install because "the contaminated direction
must fail without having mutated the tree it was wrongly pointed at". It did
not fail and it DID mutate: `ls -a <checkout>/sub` afterwards shows
`node_modules`, `package-lock.json`, `.release-verify-npm-cache` and
`copied-out-of-install`, none of which were there before.

Member B, `NODE_PATH`. In the same directory and the same environment:

```
$ NODE_PATH=<fake> node -e "console.log(require.resolve('@tiphys/kernel/package.json'))"
<fake>/@tiphys/kernel/package.json
$ NODE_PATH=<fake> bash scripts/release-verify.sh @tiphys/kernel 0.1.0 --tarball ...
release-verify: @tiphys/kernel@0.1.0 verified ...        EXIT 0
clean-environment record -> sourceTreeOnResolutionPath: null
```

Member C, a PARENT-directory `node_modules/@tiphys/kernel`, which the walk never
looks at because it only opens `<ancestor>/package.json`:

```
$ node -e "console.log(require.resolve('@tiphys/kernel/package.json'))"
<lab>/pn/node_modules/@tiphys/kernel/package.json
$ bash scripts/release-verify.sh ...                     EXIT 0
clean-environment record -> sourceTreeOnResolutionPath: null
```

**Honest severity.** In members B and C the install prefix still wins once the
install succeeds, so the WITNESS is probably not corrupted, only the VERDICT is
false. Member A is the one where both are wrong. The workflow's own invocation
runs from `$RUNNER_TEMP/release-verify` (.github/workflows/release.yml:176),
which is not a symlink into the checkout, so the CI path is not defeated today.
MEDIUM on that basis: the defect is in a claim that a reader is invited to rely
on, in the direction of a false green, on the path a human takes.

**Enumeration and what it did NOT cover.** Sites of the mechanism:

```
$ grep -n 'probe_source_tree\|probe_installed\|WORKDIR=' scripts/release-verify.sh
```

gives scripts/release-verify.sh:98, :112, :136, :152, :190. I did NOT probe
`NPM_CONFIG_PREFIX`, a global install, or a parent `.npmrc`: with three members
already reddening the same mechanism, further members would add nothing to the
severity, and I say so rather than reporting an empty result from a search I
did not run. I also did not test a bind mount, which is the same class as the
symlink and would behave differently (bash's `pwd` has no logical form to
report there).

**What would close it.** `pwd -P` at scripts/release-verify.sh:98 closes member
A. Refusing outright when `NODE_PATH` is set closes B. Checking
`<ancestor>/node_modules/<name>` as well as `<ancestor>/package.json` closes C.
The general form is to ASK NODE: run `require.resolve` for the package from the
workdir before the install and refuse if it resolves at all, which covers all
three and any fourth.

### HRB-7 (MEDIUM): "no publish path can skip it" is false, and it is asserted in a SHIPPED file

**Mechanism.** Two places state that no publish can bypass the license gate:

- gate-registry.yaml:308, "`prepublishOnly` runs it a third time, because a
  publish from any path at all must not be able to skip it";
- test/gate-registry.test.ts, in the registry-only-gate reason string, "so no
  publish path can skip it".

`--ignore-scripts` suppresses lifecycle scripts. Measured directly on npm
11.18.0 with an instrumented fixture package (appending to a probe file from
each hook), which is the same npm configuration key that governs
`prepublishOnly`:

| command | hooks fired |
|---|---|
| `npm pack --dry-run` | prepack, prepare |
| `npm pack --dry-run --ignore-scripts` | (none) |
| `npm pack --dry-run --json --ignore-scripts` | (none) |
| `npm pack` | prepack, prepare |
| `npm install --no-audit --no-fund` | prepare |

**Which half is measured and which is deduced** (CLAUDE.md:591). MEASURED: the
`--ignore-scripts` flag suppresses lifecycle hooks completely on this npm.
DEDUCED: that `npm publish --ignore-scripts` therefore also suppresses
`prepublishOnly`. I did not run `npm publish` in any form, because the review's
hard limits forbid it. A second candidate bypass, `npm publish <tarball>`
against a pre-built artifact, I did not test and do not claim; it is an OPEN
QUESTION.

The second, larger loss of the same guard is that package.json:3 no longer
carries `"private": true`. Before this branch, `npm publish` in this repository
failed closed on the manifest alone, regardless of credentials, flags or
intent. After it, the local, offline, unconditional guard is gone and what
remains is the workflow guard (HRB-3, untested) and npm authentication. That
removal is REQUIRED by the phase, so it is not a defect; it is the reason the
absolute claims above should not be made.

**Reachability (DR-0027).** gate-registry.yaml is in the `files` array at
package.json:16 and therefore SHIPS. An over-claim in it reaches every consumer
of the package, and this repository's own rule (CLAUDE.md:376) is that a claim
of this shape carries an adjacent captured command or is restated as an open
question.

**What would close it.** Restate both as what is true: "every publish path that
runs lifecycle scripts runs it, and `--ignore-scripts` skips it", or make the
workflow the enforcement point by keeping the explicit `License gate` step
(.github/workflows/release.yml:141), which is already there and does not depend
on a lifecycle hook at all.

### HRB-8 (LOW): the `release-verify` witness reddens against the ABSENT feature, not against the DANGEROUS state

CLAUDE.md:324 requires the stronger form. The two dangerous states in
witness/release-verify-refuses-contaminated-resolution-path.json are

1. `CONTAMINATION="$(probe_source_tree)"` becomes `CONTAMINATION=""`, and
2. the name comparison inside the probe becomes `if (false)`.

Both DISABLE the same probe. Neither is a state in which the probe RUNS and
returns the wrong answer, which is the dangerous state HRB-6 exhibits three
times. So the pair is two ways of deleting one feature rather than two
structurally different members of the class "refuses a contaminated resolution
path" (CLAUDE.md:415). Any of HRB-6's three members would make a real second
member: the probe is intact, it executes, and it answers `null`.

The other two new witnesses do NOT have this defect and are noted as sound:
witness/license-gate-covers-runtime-dependency-tree.json:18 mutates the license
to a constant `"MIT"`, which is a wrong-answer state, and
witness/init-writes-kernel-pin.json:18 turns the exact pin into a caret range,
which is also a wrong-answer state. The `red-witness` gate on this branch is
green over all of them (`red-witness: green (4 witness(es) evaluated (3 own, 1
stored re-evaluated in 11218ms); every witness red against every declared
dangerous state and green at head)`, exit 0), which is a true statement about
the states DECLARED and not about the class.

### HRB-9 (refuted, no finding): the dependency growth 6 to 10

Verified independently of the work history, by reading each installed
package.json rather than the maps:

| package | license | ships a license file |
|---|---|---|
| ajv | MIT | LICENSE |
| fast-deep-equal | MIT | LICENSE |
| fast-uri | BSD-3-Clause | LICENSE |
| json-schema-traverse | MIT | LICENSE |
| require-from-string | MIT | license |
| yaml | ISC | LICENSE |
| commonmark | BSD-2-Clause | LICENSE |
| entities | BSD-2-Clause | LICENSE |
| mdurl | MIT | LICENSE |
| minimist | MIT | LICENSE |

All ten permissive, all ten matching test/license-gate.test.ts:285 and
test/license-gate.test.ts:309 exactly. `git log -S'"commonmark"' -- package.json`
gives `1a5b7ba M3-P3 round 6 (A2): SALVAGED from a died implementer, gates not
yet run`, which matches the attribution at test/license-gate.test.ts:302.

The allowlist question has an answer worth stating rather than a finding. The
allowlist did not WIDEN to admit the growth, because no allowlist existed before
this phase; it was authored against the tree as it already stood, so it could
not have caught the growth and does not claim to. What records the growth is
the two-map split, which is genuine work and which the test uses in BOTH
directions (test/license-gate.test.ts:338). One observation: `Apache-2.0` is on
the allowlist at package.json:48 and is the license of ZERO production
packages, so it is surface admitted in advance rather than in response to a
need. Informational, not charged.
