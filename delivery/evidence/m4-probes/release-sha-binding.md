# PROBE: can release verification bind an observation to the COMMIT it verifies?

Key: release-sha-binding
Started: (see mtimes)
Scratch: /tmp/claude-0/m4-probes/release-sha-binding/
Repository under probe: /home/user/tiphys-ai-helmsman (READ ONLY; scratch clone used for all work)

## Status log (append-only)

- [t0] Created scratch dir, began reading sources.
2026-09-15T23:10:14Z

## 1. Ground facts, measured

Repository head under probe:

```
$ cd /home/user/tiphys-ai-helmsman && git log -1 --format='%H %cI %s'
f7576f46db536ce7da069ac94cf3ec377a5e5df3 2026-09-15T22:47:31+00:00 DR-0042 and DR-0043: the pilot is reachable on request, and the package gets a cleanup
exit 0
```

Declaration is not tracked (DR-0041's supporting absence, re-measured):

```
$ git ls-files | grep -c 'release-verification.json'
0
exit 1   (grep -c exit 1 == zero matching lines)
```

The real npm packument (fetched fresh, not from the intake):

```
$ curl -sS -o packument.json -w 'http=%{http_code} bytes=%{size_download}\n' https://registry.npmjs.org/@tiphys/kernel
http=200 bytes=4766
exit 0
```

```
$ node -e '...print shape and gitHead...'
top-level keys: _id,_rev,name,dist-tags,versions,time,license,description,maintainers,readme,readmeFilename,homepage,repository,bugs
versions is Array? false typeof object
version list: [ '0.0.0', '0.1.0' ]
version 0.0.0 gitHead= undefined dist.shasum= 66e1da142279a15721d9ac31e6506ff8c667dcf6
version 0.1.0 gitHead= 7c0b1e7ee60b36a880d4cd8d0302946d2cab923d dist.shasum= 3f9aef3cd26bc29e94caa34f1535d2627eb0cdab
time: {"created":"2026-08-14T14:13:53.386Z","modified":"2026-08-15T06:34:55.405Z","0.0.0":"2026-08-14T14:13:53.690Z","0.1.0":"2026-08-15T06:34:55.122Z"}
dist-tags: {"latest":"0.1.0"}
exit 0
```

CONFIRMED, two things at once:
- `versions` IS an object keyed by version, NOT an array. The `locate` path of
  the shipped adapter (src/gates/adapters/http-json.ts:245) requires an array at
  `listPointer`, so it cannot be pointed at the packument's versions.
- The packument DOES carry a per-version `gitHead`. For 0.1.0 it is
  `7c0b1e7ee60b36a880d4cd8d0302946d2cab923d`. `0.0.0` carries NO gitHead at all
  (`undefined`), which is a second class member found by measurement, see below.

That gitHead is a real commit in this repository:

```
$ git log -1 --format='%H %cI %s' 7c0b1e7ee60b36a880d4cd8d0302946d2cab923d
7c0b1e7ee60b36a880d4cd8d0302946d2cab923d 2026-08-15T07:54:06+02:00 Declare the repository the provenance attestation asserts, and make the registry's check reachable locally (#145)
exit 0
```

## 2. DR-0041's measurement, reproduced independently

Scratch clone at /tmp/claude-0/m4-probes/release-sha-binding/clone, cut from the
repository at f7576f4, branch `probe-baseline`. `npm ci` exit 0 on the
floor-satisfying toolchain. INTERPRETER FOR EVERY GATE RUN BELOW:
`/tmp/claude-0/m4-probes/release-sha-binding/node-v26.6.0-linux-x64/bin/node`,
reporting v26.6.0. Build state: dist/ NOT built (the gate entry runs from
src/ under type stripping, so it does not need it).

Declaration committed at the repository root, pointing the SHIPPED http-json
adapter at the real public registry, `observe.statusPointer` `/dist-tags/latest`.

### Green arm

```
$ node src/gates/deploy.ts --result .../ev/green/result.json --evidence .../ev/green --phase m4-probe
deploy: green (1 release verifications satisfied)
verification deploy satisfied for subject 7d6b402a6d43fc3ae0a3bf8152dd5a02dfafcc44: /dist-tags/latest = "0.1.0"; resolved {"kind":"endpoint","id":"https://registry.npmjs.org/@tiphys/kernel"}; 1 attempt(s); declaration release-verification.json read from HEAD (7d6b402a6d43fc3ae0a3bf8152dd5a02dfafcc44), blob sha256 a08ec02139d124602c82c5851d4deca092cc9d7fe76d8cda5a0172e81ff1e752
GATE EXIT=0
```

Subject `7d6b402a...` is a commit created MINUTES EARLIER in the scratch clone.
It has never been published, has never existed on any remote, and is not the
gitHead of any version in the packument. The gate is green for it.

### Red arm

`satisfiedValue` changed to `"9.9.9"`, deadline 1500ms / maxAttempts 2:

```
deploy: red (0 release verifications satisfied)
verification deploy for subject 624a24e67023357f34fa9620207e9e87fac8e3d5: deadline reached, last observed /dist-tags/latest = "0.1.0" (attempt budget of 2 exhausted); 2 attempt(s); declaration release-verification.json read from HEAD (624a24e6...), blob sha256 2a8e9f76...
GATE EXIT=1
```

### The stronger form: green for EVERY commit

DR-0041 says "it would be green for every commit forever". I tested that rather
than accepting it. Two further empty commits, same declaration, same run:

```
  -> GATE EXIT=0 at sha bcf4fea2e68e18577300c3a311f4de08676eccd7
  -> GATE EXIT=0 at sha f4613063ea5ef2d1ac80973b5da0fa43419de03d
```

THREE distinct subject shas, none published, all green. **DR-0041 CONFIRMED.**
Its two arms reproduce and its "green for every commit" claim is now measured,
not inferred. The red arm reddens only because the CONFIGURED CONSTANT moved,
which is the point: the red witness available today is a config edit, not a
fact about the subject.

## 3. The sha binding: where it could live, and why it does not

### 3a. The npm side of the binding EXISTS

Already captured in section 1: `versions["0.1.0"].gitHead` is
`7c0b1e7ee60b36a880d4cd8d0302946d2cab923d`, a real commit in this repository.
So the registry does carry the fact needed to bind an observation to a commit.
Nothing consumes it.

### 3b. The derivation (fix-round contract item 2): every subject read in the
shipped adapter

```
$ grep -n 'request\.subject\|subjectField\|subject\[' src/gates/adapters/http-json.ts
45:  subjectField?: keyof ReleaseSubject;
150:    subject: request.subject,
259:        if (rule.subjectField !== undefined) {
260:          return jsonEqual(value.value, request.subject[rule.subjectField]);
exit 0
```

FOUR hits, and only ONE is a comparison:

- 45 is the type of the locate match rule's field.
- 150 is the VERBATIM ECHO into the response. It does not compare anything; it
  is the material fail-closed rule 3 checks in the kernel.
- 259/260 are the single comparison, and they are inside `locate.match`.

```
$ grep -n 'satisfiedValue\|terminalValue\|jsonEqual' src/gates/adapters/http-json.ts
...
321:    status.found && jsonEqual(status.value, config.observe.satisfiedValue);
```

Line 321 is the observe decision. Its right-hand side is
`config.observe.satisfiedValue`, a CONFIGURED CONSTANT. `ObserveConfig`
(src/gates/adapters/http-json.ts:57) has no `subjectField` member and no way to
name one. **So the observe step is structurally incapable of binding to the
subject: there is no syntax for it in the configuration.**

The second shipped adapter is covered too:

```
$ grep -n 'subject' src/gates/adapters/migrations-command.ts
55:  subject: ReleaseSubject;
116:    subject: request.subject,
exit 0
```

Type declaration and verbatim echo. `migrations-command` performs ZERO subject
comparisons. Both shipped adapters are in scope and neither binds an observed
field to the subject outside `locate`.

### 3c. The only subject-binding path REFUSES the npm packument, measured

Declaration reconfigured to `locate` against `/versions` with
`match: [{pointer: "/gitHead", subjectField: "mergedSha"}]`:

```
deploy: error (0 release verifications satisfied)
verification deploy for subject 85c121ae556ea8df4cf29fc3ecdd7f3fb3db6577: no array at locate.listPointer "/versions" in the response from https://registry.npmjs.org/@tiphys/kernel; 1 attempt(s); declaration release-verification.json read from HEAD (85c121ae...), blob sha256 88d5fa22...
GATE EXIT=21
```

Exit 21 is the gate's `error` code, not red. So today the ONLY way to ask for
sha binding against npm produces an ERROR, and the only way to get a GREEN is to
not ask for it. That is the defect in one sentence.

### 3d. What the kernel's fail-closed rule 3 does and does NOT do

`validateAdapterResponse` (src/gates/release.ts:291) compares the echoed subject
field by field before reading the outcome. That binds the RESPONSE to the
subject. It does not bind the OBSERVATION to the subject: an adapter that looked
at an unrelated release object and echoed the subject faithfully passes rule 3
and reports satisfied. That is exactly what the green arm in section 2 is.

## 4. The change I built

Branch `probe-fix` in the scratch clone. ONE file touched,
`src/gates/adapters/http-json.ts`, +74 -6.

**The mechanism, not the instance.** The defect is not "npm's versions is an
object". The defect is: **the observe step's satisfying value has exactly one
source, configuration, and configuration is constant across commits.** Anything
comparing a commit-scoped observation to a commit-independent constant is green
for every commit forever. So the fix adds a SECOND SOURCE for that value, the
kernel-owned subject:

`observe.satisfiedSubjectField` names a subject field. The satisfying value is
read from `request.subject`, not from config. Exclusive with `satisfiedValue`;
naming both is a configError, deliberately NOT a fallback, because a fallback is
how a binding silently stops binding.

Three failure arms written FIRST, because a binding that fails open is worse
than no binding:

1. An unrecognized field name is a configError against a closed list
   (`BINDABLE_SUBJECT_FIELDS`), never an `undefined` that compares equal to a
   missing observation.
2. A subject field that is absent or empty is a configError, never a comparison
   that passes by default.
3. Naming both sources is a configError.

`observation.detail` now names the expected value AND ITS SOURCE, so a reader of
the evidence record can tell a bound observation from an unbound one without
reading the declaration.

Build on the fix branch:

```
$ npm run build   (node v26.6.0)
BUILD EXIT=0
```

Alternative considered and rejected as larger: a new npm-specific adapter, or
teaching `locate` to iterate an OBJECT at listPointer. Both are more code and
neither generalizes: `satisfiedSubjectField` binds ANY platform that echoes a
commit sha anywhere in its JSON, which is the actual class.

Configuration that works against the REAL registry with no locate at all:

```json
{"url": "https://registry.npmjs.org/@tiphys/kernel/latest",
 "observe": {"statusPointer": "/gitHead", "satisfiedSubjectField": "mergedSha"}}
```

`https://registry.npmjs.org/<pkg>/latest` returns the manifest of the version
tagged `latest`, with `gitHead` at the TOP LEVEL (measured: http 200, 2827
bytes, `version= 0.1.0 gitHead= 7c0b1e7ee60b36a880d4cd8d0302946d2cab923d`). So
the object/array problem never arises: the two-step lookup npm forces on the
packument is done by the registry.

## 5. THE RED WITNESS: the dangerous state, against the real registry

The dangerous state is a deploy gate GREEN for a commit that was never
published. Section 2 IS that state, measured three times. Here is the same
state with the fix in place, real network, real registry, same gate entry:

```
subject will be 426bad47b9c77463cc05a12817a32fcda73664fe; published gitHead is 7c0b1e7ee60b36a880d4cd8d0302946d2cab923d

$ node src/gates/deploy.ts --result ... --evidence ... --phase m4-probe
deploy: red (0 release verifications satisfied)
verification deploy for subject 426bad47b9c77463cc05a12817a32fcda73664fe: deadline reached, last observed /gitHead = "7c0b1e7ee60b36a880d4cd8d0302946d2cab923d" (satisfying value "426bad47b9c77463cc05a12817a32fcda73664fe" from subject.mergedSha) (attempt budget of 2 exhausted); 2 attempt(s); declaration release-verification.json read from HEAD (426bad47...), blob sha256 f58fe48d...
GATE EXIT=1
```

RED, exit 1, and the reason NAMES BOTH SHAS. This is not "the feature exists":
it is the exact configuration and the exact commit that today's shipped adapter
reports green for.

### 5a. One-variable A/B at the ADAPTER, identical subject

Two hand-written request files, identical in every field except the source of
the satisfying value. Same URL (the real registry), same statusPointer, same
subject `426bad47b9c77463cc05a12817a32fcda73664fe`:

```
--- ADAPTER ARM: unbound (satisfiedValue constant) ---
adapter exit=0
outcome = satisfied
detail  = /gitHead = "7c0b1e7ee60b36a880d4cd8d0302946d2cab923d" (satisfying value "7c0b1e7ee60b36a880d4cd8d0302946d2cab923d" from configured constant)
--- ADAPTER ARM: bound (satisfiedSubjectField mergedSha) ---
adapter exit=0
outcome = pending
detail  = /gitHead = "7c0b1e7ee60b36a880d4cd8d0302946d2cab923d" (satisfying value "426bad47b9c77463cc05a12817a32fcda73664fe" from subject.mergedSha)
```

`satisfied` against `pending`. The kernel turns pending into red at the
deadline; it never turns it green (src/gates/release.ts:126).

### 5b. The fix is not a guard that cannot go GREEN

A binding that always reddens is as worthless as one that always greens. Local
fixture server (`fixture-run.mjs`) serving the REAL captured bytes of
`https://registry.npmjs.org/@tiphys/kernel/latest` with EXACTLY ONE field value
substituted, declared per run. Gate entry, end to end, subject
`f9c4a82e9e8dd75c179bdc69ae95ab8d9df9e30f`:

| cell | served gitHead | verdict |
|---|---|---|
| GREEN-counterpart | the subject sha | `deploy: green (1 ...)`, GATE EXIT=0 |
| RED-wrong-commit | `7c0b1e7...` (the REAL value, unmodified) | `deploy: red (0 ...)`, GATE EXIT=1 |
| RED-no-provenance | field deleted | `deploy: red (0 ...)`, GATE EXIT=1 |

Full green line:

```
deploy: green (1 release verifications satisfied)
verification deploy satisfied for subject f9c4a82e9e8dd75c179bdc69ae95ab8d9df9e30f: /gitHead = "f9c4a82e9e8dd75c179bdc69ae95ab8d9df9e30f" (satisfying value "f9c4a82e9e8dd75c179bdc69ae95ab8d9df9e30f" from subject.mergedSha); resolved {"kind":"endpoint","id":"http://127.0.0.1:8731/latest"}; 1 attempt(s); ...
GATE EXIT=0 (fixture served 1 request(s))
```

The no-provenance line, which matters because it shows an ABSENT observation
does not compare equal:

```
last observed /gitHead = (no value) (satisfying value "f9c4a82e..." from subject.mergedSha)
GATE EXIT=1
```

WHY A FIXTURE WAS NEEDED FOR THE GREEN CELL, stated rather than hidden: the
declaration is read from a COMMITTED ref and the subject sha IS that commit. To
get a real-registry green I would have to publish a package whose gitHead equals
the sha of the commit that contains the declaration naming it, which needs an
npm publish credential this container does not hold. So the green cell is
fixture-served and the RED cells are available both ways (section 5 is a
real-registry red).

A HARNESS BUG I MADE AND FIXED, recorded because the first three cells were
wrong and looked plausible: `fixture-run.mjs` originally used `spawnSync` for
the gate, which blocks the parent's event loop, so the server never accepted a
connection and all three cells read `adapter overran the per-attempt timeout of
20000 ms`. That is an error, not a red, and reading it as "the fix works" would
have been exactly the mistake this repository keeps paying for. The rewritten
harness prints `fixture served N request(s)` so a cell that never reached the
server cannot be mistaken for one that did.

## 6. TWO structurally different members of the class, plus the misconfiguration arm

The class is "the deploy gate is green for a commit that was not published".
One witness is not a class, so:

| # | member | mechanism | arm | measured |
|---|---|---|---|---|
| 1 | WRONG COMMIT | latest was published from a different commit | real registry, gate entry | `deploy: red`, EXIT 1, names both shas |
| 2 | NO PROVENANCE AT ALL | the published version carries no gitHead field | real registry `@tiphys/kernel/0.0.0`, adapter | `pending` (red at deadline), detail `/gitHead = (no value)` |
| 3 | THE BINDING SILENTLY STOPS BINDING | config names both a constant and a subject field | real registry, adapter | `error`, misconfiguration named |

Members 1 and 2 are structurally different: 1 is a value mismatch on a value
that IS there, 2 is a missing value, and a naive implementation that compares
`undefined` to `undefined` passes 2 while failing 1. Member 2 needs NO fixture:
`https://registry.npmjs.org/@tiphys/kernel/0.0.0` really has no gitHead key
(measured: `has gitHead key? false`). That is what an `npm publish` from a
directory with no git metadata produces, so it is a real deployment state, not a
constructed one.

Member 2 measured:

```
=== m2-real-no-githead ===
  outcome = pending
  detail/reason = /gitHead = (no value) (satisfying value "426bad47b9c77463cc05a12817a32fcda73664fe" from subject.mergedSha)
```

Member 3 measured, and the counterfactual is the interesting half:

```
=== m3-typo-field (satisfiedSubjectField "mergedsha") ===
  outcome = error
  reason = misconfiguration at config.observe.satisfiedSubjectField: "mergedsha" is not a subject field; the bindable fields are repository, integrationRef, mergedSha, mergedAt, phaseId

=== m4-both-sources (satisfiedValue AND satisfiedSubjectField) ===  [PATCHED adapter]
  outcome = error
  reason = misconfiguration at config.observe.satisfiedValue: satisfiedValue and satisfiedSubjectField are exclusive; ...

=== m4-both-sources ===  [UNPATCHED adapter, the shipped one at f7576f4]
  outcome = satisfied
  detail = /gitHead = "7c0b1e7ee60b36a880d4cd8d0302946d2cab923d"
```

The last row is why the exclusivity check is not decoration: an adapter that
does not KNOW about `satisfiedSubjectField` silently uses the constant and
reports satisfied. A config carrying both would be green on an old kernel and
bound on a new one, which is the worst possible mixture.

FORWARD COMPATIBILITY, measured on the same unpatched adapter: a
BOUND-ONLY config (no `satisfiedValue`) on the shipped adapter gives
`outcome = error`, `misconfiguration at config.observe.satisfiedValue: one
satisfying value is required`. So an old kernel meeting a new declaration
FAILS CLOSED. It does not go green.

## 7. Suite, and a scope fact the phase will need

Fix branch, node v26.6.0, `dist/` built, invocation `npm test`, declaration NOT
present (the repository as shipped):

```
SUITE EXIT=0
tests 849 / pass 849 / fail 0 / skipped 0
```

With the declaration COMMITTED, same branch, same everything:

```
SUITE EXIT=1
tests 849 / pass 848 / fail 1 / skipped 0
failing: test/deploy-gate.test.ts:644
  "the runner reports both release gates not-applicable on this repository naming the structural reason"
  actual 'error' / expected 'not-applicable'
```

So the failure belongs to COMMITTING THE DECLARATION, not to the adapter change.
It is a real scope fact for whichever phase does this work: that test asserts
`release-verification.json does not exist` in this repository, and it must be
rewritten in the same phase that adds the file.

`scripts/m2-exit-test.sh` pins the same expectation TWICE, once per bundle:

```
$ grep -n '"id": "deploy"' scripts/m2-exit-test.sh
197:    {"id": "deploy", "expect": "not-applicable", "required": false, "structural": true}   (PR_EXPECT_JSON)
257:    {"id": "deploy", "expect": "not-applicable", "required": false, "structural": true}   (MAIN_EXPECT_JSON)
```

Both tables move together or CI reddens on the arm that was not edited, which is
the T-009 shape exactly.

## 8. Is the missing post-merge call site a separate phase? NO, it is the same one

### The derivation

```
$ grep -rn "gates/deploy" --include=*.ts --include=*.mjs --include=*.json --include=*.yaml --include=*.yml --include=*.sh . \
    --exclude-dir=node_modules --exclude-dir=dist --exclude-dir=.git | grep -v '^./test/'
```

Excluding `delivery/evidence/m3-exit-test/**` (captured witness records, paths
inside temp directories, not call sites) the entire non-test result is THREE
lines: `gate-registry.yaml:139`, `gates.manifest.json:124`, and
`delivery/plan/phase-declarations/m2-p7.json:6`. There is no orchestrator-side
post-merge invocation. That part of `src/gates/deploy.ts:13` is true.

### But the call site already EXISTS, in CI, on the push arm

```
$ grep -n 'MAIN_ONLY_GATES=' scripts/m2-exit-test.sh
217:MAIN_ONLY_GATES="manifest-self-check suite coverage credential-scrub deploy migrations"
```

`deploy` is IN the main bundle. The `gates` workflow runs
`scripts/m2-exit-test.sh --bundle main` on a push to `main`
(.github/workflows/gates.yml:238). `run_main_bundle` passes `--base "${base}"`
and `base` defaults to `main` (scripts/m2-exit-test.sh:302). On a push to main,
`main` IS the new tip, which IS the merged sha.

**So the post-merge call site is not missing code. It is a gate that already
runs post-merge on every push to main and reports not-applicable because the
declaration is absent.**

Measured end to end through the real gate runner, three states, same branch:

| declaration | runner line | exit |
|---|---|---|
| absent (as shipped) | `declared 1 applicable 0 ... not-applicable 1`, precondition unmet: `release-verification.json does not exist` | 21 |
| present but UNTRACKED | `declared 1 applicable 1 ... error 1`: `no release-verification declaration at 330fc3f8...:release-verification.json` | 21 |
| COMMITTED | `declared 1 applicable 1 verdict 1 green 0 red 1` with the bound reason naming both shas | 1 |

A wiring seam worth naming for the phase: **applicability is a WORKING-TREE
file-exists (the manifest precondition) while the gate itself reads the
declaration from a COMMITTED ref.** An untracked declaration therefore turns the
gate on and then errors. It fails closed, which is right, and the two checks do
not ask the same question.

### The answer

SAME PHASE. One phase commits `release-verification.json`, lands
`satisfiedSubjectField`, and moves the three pinned expectations
(test/deploy-gate.test.ts:644 and the two tables in scripts/m2-exit-test.sh).
Reasons, in order of weight:

1. **Splitting them produces an interval in which the gate is green and
   worthless.** Commit the declaration without the binding and `main`'s push run
   goes green for every commit forever, which is precisely the state DR-0041
   found. That green would then be cited. Land the binding first and there is
   nothing to bind until the declaration exists.
2. **They touch the same three pinned assertions.** Whichever goes first has to
   edit `test/deploy-gate.test.ts:644` and both expectations tables; the second
   phase then edits them again. DR-0031 calls a pull request a unit of
   self-contained value, and "the deploy gate genuinely asserts something" is
   one such unit.
3. **There is no separate orchestrator call site to build**, so the thing that
   sounded like a second phase is one line of configuration.

What WOULD be a separate phase, if wanted: R-032's blocking half, "the next
dispatch requires a green verdict record for the merged sha"
(src/gates/release.ts:975 comment block). That is a DISPATCH change, it touches
different code, and it is not needed for the gate to assert.

## 11. Settling this report's own claims

The claim grep, both forms, run against this file. Line-visible occurrences 16,
wrap-insensitive occurrences 16, so nothing is hidden by a wrap.

The repeated claim "these subject shas were never published" is settled by
command, not by assertion:

```
$ node -e '...compare every probe sha against every published gitHead...'
published gitHeads: [["0.0.0",null],["0.1.0","7c0b1e7ee60b36a880d4cd8d0302946d2cab923d"]]
7d6b402a6d43fc3ae0a3bf8152dd5a02dfafcc44 -> published? false
bcf4fea2e68e18577300c3a311f4de08676eccd7 -> published? false
f4613063ea5ef2d1ac80973b5da0fa43419de03d -> published? false
426bad47b9c77463cc05a12817a32fcda73664fe -> published? false
f9c4a82e9e8dd75c179bdc69ae95ab8d9df9e30f -> published? false
12a8a93d5838c8be3441e44fb6598f0d14883e7c -> published? false
exit 0
```

(`null` for 0.0.0 is JSON.stringify rendering an ABSENT key inside an array; the
direct probe of `https://registry.npmjs.org/@tiphys/kernel/0.0.0` reported
`has gitHead key? false`.)

RESTATED AS AN OPEN QUESTION rather than a claim, per the claim grep: section
5b says a real-registry green "needs an npm publish credential this container
does not hold". What I actually established is narrower. I did not attempt a
publish and I did not probe whether one is possible from here. The true
sentence is: **I did not find a way to produce a real-registry green from this
container, and I did not try to publish.** The next reader is invited to try.

The repository working tree was not modified:

```
$ cd /home/user/tiphys-ai-helmsman && git status --porcelain | wc -l
0
```

(The repository HEAD moved during this probe, from f7576f4 to c1e12f7, by the
orchestrator's own work. The scratch clone is pinned at f7576f4 and nothing
here was re-measured against c1e12f7.)
