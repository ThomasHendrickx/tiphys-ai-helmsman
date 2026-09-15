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
