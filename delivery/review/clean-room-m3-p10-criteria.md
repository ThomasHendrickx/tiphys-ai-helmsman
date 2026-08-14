# Clean-room review, M3-P10, CRITERIA lens

- reviewer: independent clean-room agent, CRITERIA lens (a second agent runs
  an adversarial hazard lens in parallel; this review does not try to cover
  that ground)
- branch under review: `claude/m3-p10-release-and-exit`
- sha under review: 8d056f6
- pull request: #140
- started: 2026-08-14

## Plan for this review

Walk every acceptance criterion in the plan's M3-P10 section
(delivery/plan/kernel-plan-m3.md:4921) against the branch with my own
commands, independent of the work history's account
(delivery/work-history/m3-p10.md:1). Specific things flagged for extra
scrutiny by the dispatch:

1. Criterion 1b's claim that the criterion's own predicted witness is wrong
   (whole-walk removal exits 21, not the predicted vacuous 0), and that the
   real vacuous pass was witnessed a different way.
2. Criterion 2's claimed numbers: 181 pack entries, zero forbidden, five
   shipped directories identical between `git ls-files` and the pack.
3. Criterion 4: which half is genuinely blocked by the absent publish and
   which was merely not attempted.
4. Criterion 5's claimed residue: `--tarball` means the registry FETCH path
   is unwitnessed, records carry `"artifact":"local-tarball"`.
5. Criterion 6: are the three named blockers real, and could anything in it
   have been done here.

Then run the suite myself and report it as a complete sentence per standing
warning 12. Then the claim greps against this document. Then findings
CR-nnn with severity and DR-0027 reachability, then a verdict.

## Log

(appended as work proceeds)

---

## Setup

Worktree at `/tmp/.../scratchpad/rev-p10-criteria/wt`, branch
`claude/reviews-m3-p10-criteria` off `origin/claude/m3-p10-release-and-exit`
at 8d056f6. Toolchain: node v26.6.0, npm 11.18.0 (confirmed
`node --version` in the shell that ran every command below). `npm ci` then
`npm run build`: exit 0, `git status --porcelain` clean afterward.

## Criterion 1 (license gate, four directions) -- MET, independently confirmed

```
$ node scripts/license-gate.mjs
license: green (10 production packages licensed)
10 production package(s) inventoried, all with license metadata on the declared allowlist; LICENSE present in the pack listing
EXIT=0
```

`npm ls --omit=dev --all` independently confirms 10 packages (ajv, yaml,
commonmark direct; fast-deep-equal, fast-uri, json-schema-traverse,
require-from-string, entities, mdurl, minimist transitive). The four fixture
tests (`test/license-gate.test.ts`) are registered and were not separately
re-derived by hand (the mechanism is identical to criterion 1b's, which I did
re-derive; see below).

**VERDICT: MET.**

## Criterion 1b -- MET, and the work history's correction is itself correct

Reproduced the claimed whole-walk removal independently, in a scratch copy
(`scripts/license-gate.mjs`'s `for (const name of Object.keys(manifest.dependencies ?? {}))`
replaced with `for (const name of [])`), run with `--root` pointed at the
real repository tree:

```
$ node scripts/license-gate.mjs --root <scratch copy, real repo tree>
license: error (0 production packages licensed)
M2-C-2 (never green by omission): a gate reporting green with units 0 examined nothing, ...
EXIT=21
```

This independently confirms the criterion's own literal prediction ("removing
`ajv` from the inventory logic makes the gate exit 0 over a tree that
contains it") is FALSE for the whole-walk-removal reading: `makeGateResult`'s
M2-C-2 rewrite (src/gates/result.ts:179) catches a green-with-zero-units and
turns it into `error`, exit 21, not the predicted vacuous green.

The real vacuous pass the work history substitutes (skip ONE package by name
out of several, so `units` stays nonzero and M2-C-2 is blind to it) is a real,
registered, currently-passing test:
`test/license-gate.test.ts:417` ("skipping ONE package out of several IS a
vacuous green..."). Ran it directly:

```
$ node --test --test-name-pattern="skipping ONE package" test/license-gate.test.ts
tests 1, pass 1, fail 0
```

And the bidirectional recorded-set comparison it depends on
(`test/license-gate.test.ts:316`) is a real BOTH-DIRECTIONS name comparison
against `M3_P1_RECORDED` and `M3_P10_ADDED` maps (test/license-gate.test.ts:285,
:309), not a subset check. Ran it directly, green.

**The criterion's own text is falsified by measurement, and the work history
says so rather than silently substituting.** That is treated here as the
correct disposition, not a defect: CLAUDE.md instructs that a plan being wrong
is itself a finding, and this one is stated, derived, and the real vacuous
pass is witnessed in its place with a structurally different member (T-006's
one-witness-is-not-a-class rule), which is what the fix-round contract asks
for. No open item here.

**VERDICT: MET, with the criterion's own prediction corrected, and the
correction independently reproduced.**

## Criterion 2 (pack listing) -- MET, independently re-derived

```
$ npm pack --dry-run --json --ignore-scripts
TOTAL 181
TOP-LEVEL: AGENTS.md LICENSE assurance-modes.yaml checklists dist
           gate-registry.yaml gates.manifest.json package.json
           role-model-config.yaml roles schemas templates tuition
forbidden delivery/test/sandbox/src/.github/.claude/bin/witness/scripts: all 0
```

Exact match to the work history's numbers. Per-directory `git ls-files` vs
pack listing, independently re-run:

```
schemas:    tracked=17 packed=17
templates:  tracked=7  packed=7
roles:      tracked=7  packed=7
checklists: tracked=5  packed=5
tuition:    tracked=17 packed=17
```

All five match exactly. This is the half the plan's hazard table says a
bare-directory-presence check would miss
(delivery/plan/kernel-plan-m3.md:4843), and the registered test
(test/license-gate.test.ts:505) does the per-file comparison rather than a
per-directory one.

**VERDICT: MET.**

## Criterion 3 (installed package) -- MET, both directions independently reproduced

Fresh tarball, fresh temp prefix, independent of the work history's capture:

```
$ npm pack --pack-destination <tmp>; npm install --no-audit --no-fund <tgz>
INSTALL_EXIT=0
$ ./node_modules/.bin/tiphys version
0.1.0
$ cp node_modules/@tiphys/kernel/templates/plan.example.yaml copied/
$ ./node_modules/.bin/tiphys validate --type plan copied/plan.example.yaml
dispatchable: false ...
EXIT=0
```

Dangerous direction, independently reproduced by removing the schema FROM
THE INSTALL (not the repository):

```
$ mv node_modules/@tiphys/kernel/schemas/plan.schema.json /tmp/...bak
$ ./node_modules/.bin/tiphys validate --type plan copied/plan.example.yaml
tiphys: <prefix>/node_modules/@tiphys/kernel/schemas/plan.schema.json does not exist
EXIT=1
$ <restored>
EXIT=0
```

The diagnostic names a path inside the install prefix, confirming the tree
that answered is the install and not this repository.

**VERDICT: MET.**

## Criterion 4 (fleet pin) -- pre-publication half MET, post-publication half genuinely blocked

**One methodological trap hit and corrected during this review, worth
recording because it shows how easy the failure is.** A first attempt reused
a `/tmp/tmp.*`-glob-derived directory to locate the freshly-`tiphys init`'d
fleet home and picked up a STALE directory from an unrelated earlier `mktemp`
in the same `/tmp`, whose `package.json` still carried the OLD M1-P2
placeholder text ("Tiphys fleet home stub...", no `dependencies` key). That
made the registry-install probe read "up to date, 0 packages" with no error,
which would have read as a contradiction of the work history's claimed E404.
Redone with explicit, non-colliding, named scratch directories rather than
globbing the newest `/tmp/tmp.*`, the result matches the work history exactly:

```
$ node bin/tiphys.ts init <fleet>
$ cat <fleet>/package.json
"dependencies": { "@tiphys/kernel": "0.1.0" }

$ npm install --no-save <local tarball>     # pre-publication half
TARBALL_INSTALL_EXIT=0; npm ls @tiphys/kernel -> @tiphys/kernel@0.1.0; tiphys version -> 0.1.0

$ rm -rf node_modules package-lock.json && npm install   # post-publication half
npm error code E404
npm error 404 Not Found - GET https://registry.npmjs.org/@tiphys%2fkernel - Not found
REGISTRY_INSTALL_EXIT=1
```

So the post-publication half is genuinely blocked by the absent publish, not
merely unattempted -- there is nothing on the registry to install, for anyone,
from any container. The pre-publication half is satisfied by exactly the
artifact this phase produces.

**VERDICT: pre-publication half MET; post-publication half genuinely blocked
on the absent publish, independently confirmed. This is a residue the plan's
own hazard table anticipates (delivery/plan/kernel-plan-m3.md:4848: "nothing
checks a publish that has already happened... the pre-publication criteria
are the whole defence"), not a gap this phase could have closed.**

## Criterion 5 (release-verify.sh) -- MET except the registry-fetch arm, confirmed, residue note added

Contaminated direction (from the repository root), independently reproduced:

```
$ bash scripts/release-verify.sh @tiphys/kernel 0.1.0 --tarball <tgz> --workdir <repo>
release-verify: step clean-environment exited 1
release-verify: REFUSED. <repo>/package.json declares name @tiphys/kernel...
EXIT=1
```
One record, step `clean-environment`, matches the work history exactly.

Clean direction, independently reproduced with a fresh non-colliding scratch
directory:

```
$ bash scripts/release-verify.sh @tiphys/kernel 0.1.0 --tarball <tgz> --workdir <clean>
EXIT=0
```
Six records, all `exitCode: 0`, all `sourceTreeOnResolutionPath: null`, all
`resolvedPackagePath` inside the clean prefix, all `artifact: "local-tarball"`.
Exact match.

**The residue the work history names is accurate, and I checked whether it is
larger than stated by running the literal criterion command (no `--tarball`)
against the clean directory to see what actually happens rather than assuming
it is merely "unwitnessed":**

```
$ bash scripts/release-verify.sh @tiphys/kernel 0.1.0 --workdir <clean2>
release-verify: step install exited 1
... 5 failing step(s) ...
EXIT=1
```

So the literal criterion text, `scripts/release-verify.sh <name> 0.1.0` with
no flags, does not merely go unwitnessed -- run today it FAILS, because it
really does try to fetch from the registry and the registry 404s. That is
consistent with, not larger than, what the work history says ("blocked on
A-7 part 2"); it is worth stating explicitly because "unwitnessed" alone could
be misread as "untested" rather than "tested and fails for the stated reason."

**VERDICT: MET except for the registry-fetch arm, confirmed both that the
tarball substitution is faithful in every other respect and that the literal
criterion command genuinely cannot pass today.**

## Criterion 6 (M3 exit test) -- correctly NOT MET; two of three blockers independently confirmed as real and unconditional; one methodological finding below (CR-001)

```
$ git fetch origin claude/m3-p11-precondition-crash-verdict
$ git merge-base --is-ancestor origin/claude/m3-p11-precondition-crash-verdict origin/main; echo $?
1
$ git merge-base --is-ancestor HEAD origin/main; echo $?
1
```
Both confirmed unmerged. `git branch -r` independently lists both
`origin/claude/m3-p10-release-and-exit` and
`origin/claude/m3-p11-precondition-crash-verdict` as live, unmerged branches.
These two blockers (unmerged phases; the publish, confirmed absent under
criterion 4) are independently sufficient on their own to make criterion 6
NOT MET regardless of the third. See CR-001 below for the third blocker
(standing warning 6 / GH API reachability), which does not change the
verdict but does affect how the "nothing more could be done here" reasoning
should be read.

**VERDICT: correctly NOT MET, correctly deferred. Nothing in criterion 6 was
performable in this phase's scope**, independent of CR-001's finding, because
the merge and publish blockers are alone sufficient.

## Criterion 7 (suite) -- MET, all four axes independently reproduced

| invocation | toolchain | build state | tests | pass | fail | skipped |
|---|---|---|---|---|---|---|
| `npm test` | node v26.6.0 (confirmed `node --version` in-shell) | `dist/` built | 802 | 802 | 0 | 0 |
| bare `node --test` | node v26.6.0 | `dist/` built | 804 | 804 | 0 | 0 |
| `npm test` via `bash -lc` | node v22.22.2 (confirmed in-shell) | `dist/` built | 802 | 800 | 0 | 2 |
| `npm test` | node v26.6.0 | `dist/` REMOVED (`rm -rf dist`, then rebuilt after) | 802 | 790 | 0 | 12 |

All four rows match the work history's table exactly. The two skips on the
default toolchain are named in the log as the floor-gated `doctor` tests
(`local Node v22.22.2 is below the kernel floor >=26`). `node scripts/check-authored-bytes.mjs` also exits 0, independently run.

**VERDICT: MET.**

---

## Findings

### CR-001 (LOW-MEDIUM, methodology / reasoning, not shipped code) -- the "Actions API is unreachable" premise behind part of criterion 6's reasoning does not reproduce in this review session, and the work history states it as settled fact rather than as measured-here

**Reachability (DR-0027):** does not reach a shipped artifact. It reaches a
real, near-term process step: the actual M3 exit test's stage E3.1 requires
observing a `push`-event CI run to completion (delivery/plan/kernel-plan-m3.md:5319),
and the plan's own hazard table names exactly this ("a post-merge witness
discharged from the `pull_request` check rather than the `push` run... T-009",
delivery/plan/kernel-plan-m3.md:4849). Whether that observation is reachable
by a bash-driven watcher or requires MCP tooling is a real planning input for
whoever dispatches criterion 6's own follow-up phase. So this finding reaches
a real user path (the orchestrator's next dispatch), just not this phase's
own shipped artifact.

**What the work history says**, verbatim from delivery/work-history/m3-p10.md:1016-1018:
"I could not read the Actions API to check for dispatches, because standing
warning 6 records that `GH_TOKEN` is set and 401s against REST from this
container, so any such check fails silently."

**What I measured, in my own review session, right now:**

```
$ curl -sS -o /dev/null -w '%{http_code}\n' -H "Authorization: token $GH_TOKEN" \
    https://api.github.com/repos/ThomasHendrickx/tiphys-ai-helmsman/pulls/140
200
$ curl -sS -H "Authorization: token $GH_TOKEN" https://api.github.com/rate_limit
... "core": {"limit": 15000, "used": 50, "remaining": 14950, ...} ...
$ curl -sS -H "Authorization: token $GH_TOKEN" \
    "https://api.github.com/repos/ThomasHendrickx/tiphys-ai-helmsman/actions/runs?per_page=5"
{"total_count": 832, "workflow_runs": [ {"name": "macOS smoke", "head_branch":
"claude/m3-p10-release-and-exit", "head_sha": "8d056f6...", "conclusion":
"success", ...} ... ]}
$ curl -sS -H "Authorization: token $GH_TOKEN" \
    "https://api.github.com/repos/ThomasHendrickx/tiphys-ai-helmsman/commits/8d056f614bf2e3733d388f6322f386efd77998eb/check-runs?per_page=20"
{"total_count": 2, "check_runs": [{"name": "gates", "status": "in_progress",
"conclusion": null}, {"name": "macos-smoke", "status": "completed",
"conclusion": "success"}]}
```

A plain `curl` with `$GH_TOKEN` in THIS session's bash successfully reads
PR data, rate-limit data (a 15000/hr ceiling, not the unauthenticated 60/hr
one, so the token is being honored), and Actions run and check-run data for
this exact head sha. This directly reproduces the literal request shape
CLAUDE.md's standing warning 6 describes as failing ("measured against
`/repos/.../pulls/125` and `/pulls/128`"); I additionally re-ran that exact
literal probe against `/pulls/125` here and it also returned 200 with real
PR data, not the documented 401.

**What this does NOT establish.** I have not reproduced the implementer's
own session or container; sessions in this environment may differ (a point
CLAUDE.md itself makes about GH access being session/container-dependent
in other contexts). I am not asserting the implementer's claim was false in
their own session, only that it is not a durable, session-independent fact
as the standing warning states it, and that the work history leans on the
standing warning's wording ("standing warning 6 records...") rather than on
a measurement taken in its own session. The repository is also PUBLIC
(`"private": false`), so even the unauthenticated form of these GETs
succeeds regardless of token validity, which may be why my probe differs
from whatever the standing warning originally measured (a private-repo
context, or a mutating/write-scoped call rather than a read).

**Why this doesn't change the criterion 6 verdict.** Criterion 6 is blocked
by two independently sufficient, unconditional facts this review confirmed
directly: M3-P10 and M3-P11 are both unmerged (git merge-base, above), and
the publish has not happened (criterion 4's E404, above). Even a fully
working Actions API cannot make either of those true. So "criterion 6 is
NOT MET, deferred" stands regardless of this finding.

**Why it is still worth recording.** The work history's own phrase "any
such check fails silently" is exactly the shape the fix-round contract and
the claim grep exist to catch: a claim about impossibility, attributed to a
standing document rather than measured in the session making the claim. It
is walked in the claim-grep section below rather than left as a silent
finding.

### No other findings

Every other criterion's own claimed numbers, commands, and exit codes were
independently reproduced and matched. No discrepancy was found in criteria
1, 1b, 2, 3, 4 (pre-publication half), 5, or 7.

---
