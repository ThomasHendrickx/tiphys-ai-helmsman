# Clean-room review, M3-P12, ADVERSARIAL HAZARD lens

- head reviewed: `ca9ae71` on `claude/m3-p12-tag-and-github-release`, pull request #144
- reviewer worktree cut from the phase branch; review branch `claude/reviews-m3-p12-hazard`
- toolchain node v26.6.0, npm 11.18.0, `dist/` built, invocation `npm test`
- second reviewer walks the acceptance criteria. This document does not.

## Verdict: APPROVE, with six tracked findings, none blocking

The property under attack is DR-0032's, in the owner's words at
delivery/decisions/DR-0032-the-github-release-is-the-owners-mental-model.md:46:
a release or a tag that exists WITHOUT a corresponding published version is
worse than having none. I attacked it seven ways and could not reach that state
by any DISPATCH of this workflow at this head. Every finding below is reachable
only by a future EDIT to `.github/workflows/release.yml`, which under
DR-0027:2 is a tracked item rather than a blocker, and under DR-0027:1 puts
`.github/` and `test/` in the one-round, non-blocking tier.

I am stating the recommendation first, per DR-0016. **Merge it, and track
HRB-1 and HRB-2, which are one fix between them and about twenty lines.**

## Status of the attack list I declared before any result

| # | attack | outcome |
|---|---|---|
| 1 | defeat each gate and both | gate 2 holds under evaluation (measured); gate 1 is defeatable by one absent key, HRB-1 |
| 2 | the third failure mode | found, HRB-2 |
| 3 | the permission widening | no path found from a dispatch input to a write; positives recorded below |
| 4 | evade the new assertions | a new JOB cannot evade (measured red); a new STEP in the write-granted job can, HRB-4 |
| 5 | witness quality | one member of one class does not redden against a dangerous state, HRB-5 |
| 6 | the tag command | no injection, no forcing path from a dispatch; HRB-3 is the guard gap |
| 7 | fail loudly, leave untagged, never force | the runtime behaviour is right; the "never force" CLAIM is unwitnessed, HRB-3 |
| 8 (mine) | anything decoupling job conclusion from `npm publish` | HRB-1 |
| 9 (mine) | does the tag job ever OBSERVE the registry | no, HRB-2 |
| 10 (mine) | is the local tag check vacuous | NO, settled below in the positives |

## HRB-1, MEDIUM (tracked, non-blocking): `needs: release` reads the release job's CONCLUSION, and nothing couples that conclusion to `npm publish` having succeeded

### The mechanism, which is not the instance

Every assertion this phase adds reads keys that are PRESENT: `permissions`,
`needs`, `if`, `outputs`, and `run` bodies. None of them constrains the keys
that are ABSENT. A guard built from an allow-list of keys is complete; a guard
built from the keys the author had in mind is not, and GitHub has several keys
whose whole purpose is to decouple a job's conclusion from a step's failure.

This is the same shape the phase itself is built to close one level down. The
workflow states the coupling as a fact at .github/workflows/release.yml:332
("INCLUDING the post-publish registry verification") and the spec repeats it at
delivery/plan/m3-p12-phase-spec.md:24. Both sentences are true at this head and
neither is asserted anywhere.

### The derivation, and its full output

Every job and step key actually present in every workflow file:

```
$ node -e '
const {parse}=require("./node_modules/yaml");const fs=require("node:fs");
for (const f of fs.readdirSync(".github/workflows")) {
  const d=parse(fs.readFileSync(".github/workflows/"+f,"utf8"));
  for (const [j,b] of Object.entries(d.jobs??{})) {
    console.log(f, "job", j, "keys:", Object.keys(b).join(","));
    for (const s of (b.steps??[])) console.log("   step keys:", Object.keys(s).join(","));
  }
}'
gates.yml job gates keys: runs-on,steps
macos-smoke.yml job macos-smoke keys: runs-on,steps
release.yml job release keys: runs-on,permissions,outputs,steps
release.yml job tag keys: needs,if,runs-on,permissions,steps
```

(step-key lines elided here only for length; the full run is in the mutation log
directory and every step carries some subset of `name,id,if,env,run,uses,with`.)

The keys the new tests read are `permissions`, `needs`, `if`, `outputs`, `run`,
`env`, `name`, `id`, `uses`. The set difference is what nothing constrains:
`continue-on-error` at job level and at step level, `environment`, `strategy`,
`timeout-minutes`, `container`, `services`, job-level `concurrency`, and step
`working-directory` and `shell`.

**What this derivation does NOT cover.** It enumerates keys PRESENT at this
head and names absent ones I know GitHub accepts; it is not GitHub's full
schema, so a key I have not named may exist with the same effect. It says
nothing about repository or organisation settings, which no file here carries
and which I could not read (see HRB-7). It says nothing about `run` bodies of
steps other than the four this phase's tests extract.

### Measured, four one-line edits, each invisible to the whole suite

Mutation lab at `$SCRATCHPAD/rev-p12-hazard/lab`, a copy of the branch tree
OUTSIDE the review worktree, only `.github/workflows/release.yml` mutated, each
run `node --test test/license-gate.test.ts` on node v26.6.0 with `dist/` built.

| run | mutation | tests | pass | fail |
|---|---|---|---|---|
| baseline | none | 32 | 31 | 1 |
| A | `continue-on-error: true` on the publish STEP | 32 | 31 | 1 |
| B | `continue-on-error: true` on the release JOB | 32 | 31 | 1 |
| C | the post-publish registry verification step DELETED | 32 | 31 | 1 |
| D | `npm publish ... \|\| true` | 32 | 31 | 1 |

The one failure is identical in all five runs and is a LAB RESIDUE, not a
result: `the pack listing carries every declared kernel artifact` fails because
the lab copy is not a git repository. It fails at baseline, so it separates
nothing. Every other test, including all six of this phase's, is green under
every mutation.

For contrast, two controls in the same lab that DO redden, so the harness is
not simply insensitive:

| run | mutation | tests | pass | fail |
|---|---|---|---|---|
| G | a third job with `contents: write` added to release.yml | 32 | 28 | 4 |
| I | the tag job's `if:` changed to `!= 'no'` | 32 | 30 | 2 |

### Which of the four actually reaches the forbidden state

Stated separately from the measurement, because the measurement is about the
GUARD and this is about GitHub, which I did not execute.

- D and A: the release job continues past a failed publish, but the post-publish
  registry verification then runs `npm install "$NAME@$VERSION"` into a clean
  prefix with a fresh cache (scripts/release-verify.sh:299), which fails when
  the registry does not serve the version, so the job fails and the tag job is
  skipped. **A or D alone is caught, by the step C deletes.**
- C alone changes nothing dangerous: a failed publish still fails the job.
- **A+C, or D+C, reaches the forbidden state.** So does B alone if job-level
  `continue-on-error` reports success to dependents, which is documented GitHub
  behaviour that I did NOT execute here and do not assert.

The conclusion that does not depend on B: **the post-publish registry
verification is the only registry observation anywhere in the chain, and it is
the one step in `release.yml` that no assertion requires to exist.** Its sibling
one step up, the PRE-publish verification, is asserted three ways at
test/license-gate.test.ts:1504 (unguarded, and earlier than the publish). The
post-publish one is mentioned only in a comment, at
test/license-gate.test.ts:1874.

### Reachability under DR-0027

Reachable by a future editor of `release.yml`, not by any dispatch at this head.
DR-0027:2 makes that a TRACKED ITEM. The consequence when it is reached is a
false GitHub release, which DR-0032:49 has already ruled a real user path, so
this is worth the twenty lines rather than being left open indefinitely.

### The fix I would defend

Two assertions, both property-selected over every job and step of every
workflow, in the shape the phase already uses:

1. no job and no step of `release.yml` carries `continue-on-error` at all
   (assert the ABSENCE, as criterion 4 does for `id-token`, not a value);
2. the post-publish registry verification step EXISTS, carries exactly the
   publish guard string, and is ordered AFTER the publish step. That is the
   mirror image of test/license-gate.test.ts:1504 and costs one `exactlyOne`
   plus two equalities.

A `npm view "$package@$declared"` inside the tag job would also close it, and I
prefer the assertions: they add no registry dependency to the write-granted job
and they change no runtime behaviour.

## HRB-2, MEDIUM (tracked, non-blocking): the third failure mode the spec asked for is that NEITHER gate observes the registry

delivery/plan/m3-p12-phase-spec.md:86 does not claim the two conditions are
sufficient and asks the adversarial reviewer to look for a third. Here it is,
stated as a property rather than as an edit:

- gate 2, `if: needs.release.outputs.publish == 'yes'` at
  .github/workflows/release.yml:352, reads a value written by the `decide` step,
  which runs BEFORE `npm ci`, before the build, before the suite, and before the
  publish. It records the OPERATOR'S INTENT. It is true of a dispatch that
  intended to publish and did not.
- gate 1, `needs: release` at .github/workflows/release.yml:351, reads a job
  CONCLUSION, which is a statement about the runner, not about npm.

So the composition is `intent AND the runner did not error`. The property
DR-0032 protects is `the registry serves this version`. The two coincide today
only because one unasserted step inside the release job happens to install from
the registry. That is a third failure mode in the exact sense the spec meant:
it is not covered by either gate, and it is not covered by adding a third gate
of the same kind, because both gates are proxies for the same unobserved fact.

The honest summary for the arbitrator: the DESIGN is sound and the CHAIN is
complete at this head; what is missing is that the load-bearing link is held in
place by a comment. HRB-1's fix closes HRB-2, which is why they are one fix.

## HRB-3, LOW (tracked): "nothing here forces" is a comment, and adding `--force` reddens no test

.github/workflows/release.yml:349 states "Nothing here retries and nothing here
forces", and delivery/work-history/m3-p12.md:387 makes the same claim as the
phase's chosen answer to the spec's open question at
delivery/plan/m3-p12-phase-spec.md:88.

Measured in the same lab, mutation E, `git push origin "refs/tags/${tag}"` at
.github/workflows/release.yml:418 changed to `git push --force origin ...`:

| run | mutation | tests | pass | fail |
|---|---|---|---|---|
| E | `--force` added to the tag push | 32 | 31 | 1 |

Same as baseline, same single lab residue. No test sees it.

`--force` alone is not dangerous while the remote probe stands, because the
probe refuses before the push is reached. It becomes dangerous in combination
with HRB-5's observation, which is that the probe's own witness does not
exercise the state the probe protects. The property is cheap to assert: the tag
push line contains no `--force` and no `+` refspec prefix, selected from the
extracted body the tests already have in hand.

## HRB-4, LOW (tracked): the new predicates select an anchor by COMMAND SPELLING, and publish no exclusion list

`GIT_TAG_COMMAND` at test/license-gate.test.ts:1814 and `GH_RELEASE_COMMAND` at
test/license-gate.test.ts:1815 select the two steps to execute. They are good
predicates for that job and the near-miss recorded at
delivery/work-history/m3-p12.md:449 is a real one. They are also used as SCOPE
guards ("a step creates a git tag outside the job DR-0032 gave the write grant
to"), and for that purpose they are narrower than the property, because a git
ref is creatable without the word `tag` and a GitHub release is creatable
without the word `gh`.

Measured, both mutations adding a SECOND anchor inside the already
write-granted `tag` job:

| run | mutation | tests | pass | fail |
|---|---|---|---|---|
| F | a step running `git push origin "${SHA}:refs/tags/v9.9.9"`, no `git tag` | 32 | 31 | 1 |
| H | a `uses: softprops/action-gh-release@v2` step with `tag_name: v9.9.9` | 32 | 31 | 1 |
| J | a tag push added to the `release` job | 32 | 31 | 1 |

F and H create an anchor for a version nobody published, from inside the job
that holds the write grant, and no test sees either. J is harmless at runtime
because the release job holds `contents: read`, and it is listed because nothing
STRUCTURAL forbids it; the permission assertion is what makes it inert.

The permission assertion IS the real net and it works: mutation G, a third job
declaring `contents: write`, reddens three tests including
`exactly one job in any workflow declares a write grant on the repository`. So
a new WRITE-CAPABLE JOB cannot be added silently. A new write-capable STEP
inside the existing one can.

**What my derivation did NOT cover.** I enumerated evasions I could think of and
executed three. I did not enumerate the full set of ways to create a ref or a
release with a `contents: write` token, and I make no claim to have. The point
of the finding is the difference in DISCIPLINE: `PUBLISH_COMMAND` at
test/license-gate.test.ts:1282 and `allWorkflowSteps` at
test/license-gate.test.ts:1244 both publish their exclusions in the file, and
the two new predicates publish none, so a later reader has no list to check
against. That is the fix-round contract's item 3 applied to a predicate, and it
is the cheapest half of this finding.

## HRB-5, LOW (tracked): one member of the pre-existing-tag class does not redden against a dangerous state

`witness/release-tag-refuses-existing-tag.json` claims two structurally
different members. Member 0, the local refusal replaced by `git tag -d`, is a
genuine delete-and-reuse and the work history's reasoning for choosing it over
"delete the guard" at delivery/work-history/m3-p12.md:243 is right.

Member 1 removes the whole remote-existence probe. I measured what that
actually produces, in a scratch git repository outside the worktree, with a bare
remote already carrying an annotated `v0.7.3`:

```
$ git push origin refs/tags/v0.7.3
 ! [rejected]        v0.7.3 -> v0.7.3 (already exists)
error: failed to push some refs to '.../remote.git'
hint: Updates were rejected because the tag already exists in the remote.
push rc=1
remote tag before: 7792953454cd1f840ee754e2a879e7bc9e675363
remote tag after : 7792953454cd1f840ee754e2a879e7bc9e675363
```

So with the probe removed, the remote tag is NOT moved, NOT deleted and NOT
reused. `git push` without `--force` already refuses. The dangerous state named
in the witness is unreachable through that member, and what the member actually
reddens on, per the work history's own table at
delivery/work-history/m3-p12.md:237, is
`The input did not match the regular expression /refusing/`, a diagnostic
message. The same is true of member 0 of
`witness/release-tag-refuses-unreadable-remote.json` at
delivery/work-history/m3-p12.md:255, which reddens on `/ls-remote/`.

There is a second-order point and it is the sharper one. In the deployed
environment a locally present tag IMPLIES a remotely present one, because the
only source of tags in a fresh runner checkout is the fetch. Settled by
measurement rather than by argument, from `actions/checkout@v4`'s own bundled
source:

```
$ curl -s https://raw.githubusercontent.com/actions/checkout/v4/dist/index.js | grep -n "getRefSpecForAllHistory" 
...
function getRefSpecForAllHistory(ref, commit) {
    const result = ['+refs/heads/*:refs/remotes/origin/*', exports.tagsRefSpec];
```
and `tagsRefSpec` is `+refs/tags/*:refs/tags/*`, taken on the `fetchDepth <= 0`
branch. So both lab states, local-only and remote-only, are states a runner does
not produce, and the class's real protection against a moved tag is the plain
`git push`, which HRB-3 shows nothing witnesses.

**This is not a request to delete the probe.** The probe earns its place: it
fails EARLY with a copyable tag-and-commit pair instead of late with a git
error, and its third arm, the unreadable remote, is a genuine fail-closed that
git would not give you. The finding is about the witness, not the guard: what
this class demonstrates red is a message and an intermediate write in a
throwaway clone, and the work history's own tables print that without saying so.

**What my derivation did NOT cover.** I did not enumerate every way a tag could
be present locally and absent remotely in a real runner. I checked the one
source that exists in a fresh checkout and reasoned that there is no other
within a single job; a step added before the tagging step could create one, and
that is HRB-4's territory rather than a separate case.

## HRB-6, LOW (tracked, and an owner action rather than a code change): nothing constrains WHICH REF may exercise the write grant

`workflow_dispatch` lets the operator choose any ref, and the workflow that runs
is the copy on that ref. So every guard in this file, including both gates and
the version-agreement checks, is a property of a file the dispatcher selects.
Nothing in this repository restricts the dispatch to `main`.

This is not new with M3-P12: the same dispatch could already mint an OIDC token
and publish, which is the strictly larger power. What the phase adds is
`contents: write` on the same unconstrained surface. I am recording it because
DR-0032:76 asks the adversarial review to attack the permission widening first,
and because the durable fix is not an edit to this file (a check in a file the
dispatcher chooses is not a check) but a repository setting: a GitHub
Environment with a deployment branch policy on the release path, or the
equivalent restriction on who may dispatch. That is an owner action, and I am
naming it rather than proposing a change to the branch.

## HRB-7, LOW (tracked, and I could NOT measure it): the minimal-grant claim rests on a repository setting no artifact records

The permission test at test/license-gate.test.ts:1817 asserts exactly one job
holds a repository write grant, and honestly enumerates its blind spot:
`gates.yml job gates` declares no `permissions:` at either level, so its grant
is the repository default. Measured, no workflow file in the tree declares
permissions except `macos-smoke.yml` and `release.yml`:

```
$ grep -rn "permissions" .github/workflows/ | grep -v "^\.github/workflows/release.yml:2[0-9]:#"
.github/workflows/macos-smoke.yml:8:permissions:
.github/workflows/release.yml:119:    permissions:
.github/workflows/release.yml:355:    permissions:
```

If the repository default workflow permission is read-and-write, the `gates`
job holds `contents: write` on every pull request and every push, and the
sentence at .github/workflows/release.yml:318 ("This job holds `contents: write`
and NO `id-token`") reads as an exclusivity it does not have.

I tried to settle it and could not:

```
$ curl -sS -o /tmp/gh-out.json -w "%{http_code}" -H "Authorization: Bearer $GH_TOKEN" \
    https://api.github.com/repos/ThomasHendrickx/tiphys-ai-helmsman/actions/permissions/workflow
403
{"message":"Access to this GitHub Actions path is not permitted through this proxy."}
```

So this stays an UNMEASURED precondition and I am labelling it as one rather
than assuming either answer. It is cheap for the owner to read, and cheaper
still to remove: adding `permissions: contents: read` to `gates.yml` would put
the last job inside the scan, at the cost of touching a file this branch must
not touch.

## Attacks that FAILED, recorded because a failed attack is a result

These are the positives, and several settle open questions the branch left open.

1. **Gate 2 holds under evaluation.** The evaluator at
   test/license-gate.test.ts:1771 refuses everything outside a bare reference
   and a single-quoted equality. Mutation I, `!= 'no'`, reddens
   `the job that may write to the repository is gated twice`. `always()`,
   `&&`, a function call and a bare literal all take the same `assert.fail`
   path. The producer half is evaluated too, so an output pinned to a literal
   reddens even though its text still names the decide step. I could not get an
   inverted or truthy gate past it.
2. **No dispatch input can steer a write.** The tag NAME is `v${declared}`,
   derived from `package.json` at .github/workflows/release.yml:381 and
   .github/workflows/release.yml:387, never from `inputs.version`; the input's
   only role is an equality that refuses on mismatch. Both operator values reach
   the shell through `env:` and no `${{ }}` appears in any `run:` body of either
   job, which the inherited test at test/license-gate.test.ts:1372 iterates over
   every job of this file. So HRB-11's mechanism from M3-P10 is not reopened by
   the new job.
3. **The two jobs cannot overlap.** `needs:` serialises them within a run, and
   the workflow-level `concurrency: group: release` with
   `cancel-in-progress: false` at .github/workflows/release.yml:112 serialises
   runs, so the OIDC-minting job and the write-granted job are never live at the
   same time. Nothing asserts the concurrency block, which is worth knowing but
   is not a finding I would spend a round on.
4. **No third-party code runs under `contents: write` except the checkout.** The
   tag job runs no `npm ci` and no lifecycle script; its only `uses:` is
   `actions/checkout@v4`. `actions/checkout` does persist the write-granted
   token into `.git/config` for the rest of the job, so any step ADDED to that
   job inherits repository write, which is the exact answer to "establish
   exactly what that job can do" and is the runtime half of HRB-4.
5. **The work history's own open question 1 is settled, in the safe direction.**
   delivery/work-history/m3-p12.md:685 says it has not shown the two checkouts
   cannot diverge. From `actions/checkout@v4`'s bundled source, with no `ref`
   input and the workflow's own repository, it sets
   `result.ref = github.context.ref; result.commit = github.context.sha` and
   checks out that commit; `GITHUB_SHA` is fixed for the whole run, so both jobs
   check out the same commit. A force-push that made it unreachable fails the
   fetch loudly rather than silently checking out something else. I did not
   execute this; it is read from the action's shipped code.
6. **The local `git rev-parse` check is NOT vacuous**, which was my attack 10.
   `fetch-depth: 0` at .github/workflows/release.yml:361 is load-bearing for it
   in a way the comment above it does not say: with any positive fetch depth the
   refspec is the targeted one and tags are not fetched, so that check would
   silently stop seeing anything. The remote probe still covers the case, so
   this is a note rather than a finding.
7. **No injection through the version input, and no invalid-tag path found.**
   Every use of `$VERSION` is inside double quotes in a `[` comparison or an
   `echo`. A version string that is not a valid refname cannot reach `git tag`
   without also being in `package.json`, and `git tag` refuses invalid refnames
   under `set -e`. I did not find a value that produces a valid ref that is not
   a valid tag.
8. **Concurrent dispatch produced no path.** Serialised by the workflow
   concurrency group; and a second dispatch after a successful publish fails at
   `npm publish` on the duplicate version, which fails the release job and skips
   the tag job.

## The two claim greps, over this document

### Line-based form, binding

```
$ grep -nEi 'cannot be|impossible|needs a|is covered|catches|would catch|recovers|anyway|always|never|no way to' delivery/review/clean-room-m3-p12-hazard.md
```

36 occurrences, and **22 of them are the two grep COMMAND LINES quoted in this
section**, which carry every alternative of the pattern once each. Those are the
tool, not a claim. The remaining 14 are dispositioned here, every one settled by
a command in this document or restated as an open question:

- `never force` twice in the attack-list row: that is the CLAIM UNDER REVIEW,
  quoted from .github/workflows/release.yml:349, and HRB-3 settles it with
  mutation E (32 tests, 31 pass, 1 fail, the lab residue), which is the finding
  that the claim is unwitnessed rather than an endorsement of it.
- `never` in "never from `inputs.version`" in positive 2: settled by the two
  cited lines, .github/workflows/release.yml:381 and
  .github/workflows/release.yml:387, where the tag name is built from
  `package.json`.
- `never` in "never live at the same time" in positive 3: settled by the
  `needs:` edge and the workflow-level concurrency block at
  .github/workflows/release.yml:112. It is a reading of two YAML keys, NOT an
  execution, and positive 3 labels it that way.
- `never` in HRB-5's "NOT moved, NOT deleted and NOT reused": settled by the
  captured `git push` rejection and the identical before and after sha in the
  same block.
- `always()` at positive 1 where it names the GitHub function: a token, not a
  claim.
- `always` in "not simply insensitive": settled by the two control rows,
  mutations G and I.
- `cannot be added silently` in HRB-4: settled by mutation G, 32 tests, 28 pass,
  4 fail, three named tests red.
- `cannot` in HRB-6's "a check in a file the dispatcher chooses is not a check":
  this is an ARGUMENT and not a measurement, and it is restated here as one. I
  did not test whether any repository setting restricts dispatch refs; HRB-7
  records that I could not read repository settings at all through this proxy.
- `is covered` and `not covered` in the derivation-scope paragraphs of HRB-1,
  HRB-4 and HRB-5: these are statements of a LIMIT, which is the form the
  fix-round contract's item 3 asks for, not claims of coverage.
- `needs an edit` in "What this review does NOT establish" item 1: settled by
  the whole finding set, every one of which names the edit it requires;
  and it is the weaker direction of the claim, so it invites the next reader to
  find a dispatch-only path rather than closing the question.

### Wrap-insensitive form, same scope

```
$ tr '\n' ' ' < delivery/review/clean-room-m3-p12-hazard.md \
  | grep -oEi 'cannot be|impossible|needs a|is covered|catches|would catch|recovers|anyway|always|never|no way to' | wc -l
36
```

| form | occurrences |
|---|---|
| line-visible | 36 |
| wrap-insensitive total | 36 |
| **missed by wrap** | **0** |

So the line-based form missed nothing in this document, and the dispositions
above are complete rather than complete-as-far-as-one-grep-could-see.

## What this review does NOT establish

The arbitrator reads this first, so it is written as flatly as I can.

1. **It does not establish that the two gates are insufficient in practice at
   this head.** I could not reach a tag or a release without a publish by any
   dispatch of `ca9ae71`. Every finding needs an edit to `release.yml` first.
2. **It does not establish GitHub's semantics for `continue-on-error`.** I
   measured that four such edits are invisible to the test suite. Whether
   job-level `continue-on-error` lets a dependent job run is documented
   behaviour I did NOT execute, and HRB-1's conclusion is written so that it
   does not depend on that row.
3. **It does not establish the repository's default workflow permission.** The
   endpoint is blocked through this container's proxy, HTTP 403, captured in
   HRB-7. So it does not establish that exactly one job in this repository can
   write to it; it establishes that exactly one DECLARES it.
4. **It does not walk the acceptance criteria.** Criteria 1 to 9 are the second
   reviewer's lane. Where I touched one, for example criterion 6 in HRB-5, I am
   reporting on the WITNESS and not ruling on whether the criterion is met.
5. **It ran nothing on GitHub.** No dispatch, no publish, no tag, no release,
   no workflow triggered. Every execution in this document is local: the test
   suite, the mutation lab, and scratch git repositories.
6. **It does not enumerate every way to create a ref or a release with a
   `contents: write` token.** HRB-4 executes three evasions and claims three,
   not completeness.
7. **It does not review `scripts/release-verify.sh` itself.** I read the
   registry-install arm at scripts/release-verify.sh:299 only far enough to
   establish that the post-publish step really does observe the registry, which
   is what HRB-1 turns on. Its correctness is M3-P10's, already reviewed.
8. **It does not establish that the suite result generalises off this
   toolchain.** `npm test` on node v26.6.0 with `dist/` built, from a worktree
   under `/tmp/claude-0`, reported 818 tests, 818 pass, 0 fail, 0 SKIPPED,
   exit 0. Standing warning 1's last block says a green suite from a scratchpad
   worktree is not evidence for a clone elsewhere, and I did not run it
   elsewhere.
