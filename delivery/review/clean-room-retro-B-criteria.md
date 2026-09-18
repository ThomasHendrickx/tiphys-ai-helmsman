# Clean-room review, retrospective: group B, spawn and the credential route

- subject: `main` at `0eaf4532c9fda42609481234c4a3fc800367cc76`
- phases covered: **M4-P3** (merged `4460fde`), **M4-P4** (merged `e85a3f2`),
  **M4-P8** (merged `d5bc932`)
- review contract: **criteria**
- framing: `criteria-contract`
- produced by: Claude Opus 5 (Anthropic)
- verdict: **FIX-ROUND-NEEDED**
- `phase` in the JSON verdict is set to `M4-P3` because the schema takes one
  phase and this review covers three. The deviation is declared in the brief
  and is repeated here so it is auditable rather than discovered.

## Why this review exists and what is different about it

These three phases are already on `main`. They were merged without the
clean-room review their diffs required. This is the review they never got, so
a finding cannot block a merge that already happened: severity below means
**how fast this must be fixed on a new branch**, and under DR-0027 every file
in this group is inside the shipped npm package, so reachability is about a
real caller rather than about which tree the file is in.

One correction to the brief, recorded because it is a fact about `main`:
`delivery/tuition/T-041-sixteen-phases-carrying-shipped-code-merged-with-no-clean-room-review.md`
**does not exist on `main` at `0eaf453`**. `ls delivery/tuition/` stops at
`T-040-the-merge-authority-gate-has-never-been-fed.md`. I could not read it,
so nothing below leans on it.

## Toolchain and suite

Clone: `git clone --no-local` of the working repository, then
`git fetch origin main && git checkout main && git reset --hard origin/main`,
landing at `0eaf4532c9fda42609481234c4a3fc800367cc76`. Interpreter
`/tmp/claude-0/n26/bin/node`, `node --version` reported **v26.6.0** in the
shell that ran every command below.

`npm ci` exit 0, `npm run build` exit 0, `git status --porcelain` empty after
the build. Suite result is quoted in full at the end of this document, with
interpreter, build state, invocation, pass count and SKIPPED count, per the
standing warning.

## What I tried to break, and how it held

Everything below was RUN, not reasoned about. The probes live at
`/tmp/claude-0/-home-user/49c9c4fa-6f01-5020-aa81-c87700265964/scratchpad/retro-B-criteria/probes/`
and each drives `spawnTask` against a real scratch fleet created by
`tiphys init`, with a real git upstream and clone, and a real payload.

Held, with the captures in the criteria walk below:

- The project clone is not a resolution root for a BARE specifier. The planted
  `evil-adapter` in the clone's `node_modules` was not resolved and its
  on-import sentinel was never written.
- With the same package name in BOTH roots, the fleet home's copy won and the
  project copy's sentinel was never written.
- A loaded adapter naming itself `subprocess` is refused and creates nothing.
- An adapter declaring `requires: ["role"]` spawned without a role refuses with
  nothing created; declaring `requires: ["modelName"]` refuses with a
  structurally different sentence, also with nothing created.
- `GH_TOKEN`, `GITHUB_TOKEN`, `NODE_OPTIONS` and `GIT_CONFIG_KEY_0` are all
  refused as allowlist extensions however persuasive the reason.
- The `exports` map does not widen: from a scratch consumer, four deep
  subpaths all fail `ERR_PACKAGE_PATH_NOT_EXPORTED` while the package name
  resolves.
- Removing `additionalProperties` from `schemas/executor-record.schema.json`
  makes a smuggled `model` field validate at exit 0; restoring it refuses. The
  keyword is doing work.

Did not hold, and each is a finding below: a name-set handover check that
cannot see a redirection being undone; an extension with no recorded reason;
a handover comparison that never runs on two of four launch arms; and a
path-shaped adapter specifier that reaches the project clone.

## Findings at a glance

| id | severity | what breaks | reproduced |
|---|---|---|---|
| CR-B-001 | high | an honest adapter that changes the VALUE of HOME passes the name-set handover check; `meta.json` asserts a clean handover while the child reads the real gh credential store | yes |
| CR-B-002 | high | an allowlist extension with no reason is accepted on the audited route, in two forms, and the bare-string form loses the variable NAME in `meta.json` too | yes, two members |
| CR-B-003 | medium | the handover comparison never runs and nothing is recorded on the `incomplete` and failed-completion-precondition arms | yes, two members |
| CR-B-004 | medium | a path-shaped `--adapter` specifier evaluates project-clone code in the orchestrator process, which the loader's own comment says cannot happen | yes, two members |
| CR-B-005 | low | `meta.json` does not distinguish an egress-granting extension from a benign one | yes |

## Findings

### CR-B-001 (HIGH). An honest adapter defeats the handover check by changing a VALUE, and `meta.json` then asserts a clean handover while the child reads the real gh credential store

`compareHandover` (src/spawn.ts:342) compares NAME SETS only, and the comment
above it gives the reason: a value comparison would put credential material
into a record an operator reads. That reason is sound for most names and is
wrong for exactly five: `CREDENTIAL_STORE_REDIRECTIONS`
(src/exec/env.ts:212) are the whole M2R-004 defense, and their harness-owned
VALUES are the load-bearing part. `src/exec/env.ts`'s module comment says so
in terms: a dropped `HOME` "does not remove the home directory; the child's
tools fall back to the real one". The handover check cannot see that
happening.

Reproduced. `probes/home-revert.mjs` plants a real store at
`/root/.config/gh/hosts.yml` and runs an adapter that keeps the name set
byte-identical and only puts `HOME` and `XDG_CONFIG_HOME` back to the real
paths, then reports the names it launched with truthfully:

```
spawn ok: true
meta.credentials: {"payloadClass":"project","scrubMode":"scrubbed","extensions":[],
  "handover":{"status":"compared","added":[],"removed":[]}}
child HOME: /root
child gh-configuration probe: {"source":"gh-configuration","outcome":"resolvable",
  "detail":"credential store reachable from inside the child environment:
  /root/.config/gh/hosts.yml (48 bytes), /root/.config/gh/hosts.yml (48 bytes)"}
child verdict: red
```

The spawn SUCCEEDS. The record does not merely fail to say a credential
reached the payload; it POSITIVELY ASSERTS a clean comparison. That is the
phase's own hazard class, "a credential reaches a project payload and no
artifact says so", with the artifact saying the opposite.

**This is not the residue the work history declares.** Item 3 of
delivery/work-history/m4-p8.md:589 says "A dishonest adapter is not caught by
the kernel". This adapter is HONEST: it reported exactly the name set it
launched with, the kernel compared it, and the comparison passed. The declared
residue does not cover it.

Concrete fix, in order of increasing strength:

1. Minimum: compare the five `CREDENTIAL_STORE_REDIRECTIONS` by VALUE as well
   as by name. Those five values are harness-owned paths inside the task
   directory and carry no credential material, so the stated reason for not
   comparing values does not apply to them. Extend `LaunchOutcome.completed`
   with `launchedRedirections?: Readonly<Record<string, string>>` restricted to
   those five names, refuse in `spawnTask` when any reported value differs from
   the handed one, and add a fourth `status` value (for example
   `values-unreported`) so a record where the adapter reported names and no
   redirection values does not read as `compared`.
2. Better, and it is what DR-0039 condition 4 actually asks for: make the
   witness child-observed rather than adapter-reported. `writeTurnEndHook`
   (src/hooks.ts) is written BY THE KERNEL and runs in the same child
   environment, so have it record `$HOME` and `$XDG_CONFIG_HOME` into the
   turn-end record and have `turnEndEvidence` compare them against
   `scrubRoot(dir)`. That raises the cost from free to lying in two places.

### CR-B-002 (HIGH). The audited route accepts an allowlist extension with NO recorded reason, in two structurally different forms, and one of them loses the variable NAME as well

DR-0039 condition 2 is "Every name that must cross goes through
`extraAllowlist`, each with a written reason", and the owner's selected option
text says "enforced by code, not by a promise". M4-P8 criterion 4 is the code
half. `refuseExtraAllowlist` (src/exec/env.ts:174) refuses a blank reason with

```
const reason = extensionReason(entry);
if (reason !== undefined && reason.trim().length === 0) { ...refuse... }
```

The `reason !== undefined` guard is exactly what lets an absent reason through.
Both members reproduced through `spawnTask`, on a project payload, with the
variable reaching the child:

**Member 1, the bare-string form** (`probes/bare-string.mjs`):

```
spawn result: ok
meta.credentials: { "payloadClass": "project", "scrubMode": "scrubbed",
                    "extensions": [ {} ],
                    "handover": {"status":"compared","added":[],"removed":[]} }
child saw TIPHYS_PROBE_SECRET = "s3cr3t-value-from-parent"
child envNames: [...,"TIPHYS_PROBE_SECRET",...]
```

The audit record is `{}`. It does not name the variable, so an operator
reading the task directory cannot tell WHICH name was widened, only that one
was. `credentialRecord.extensions` is built with `entry.name` / `entry.reason`
(src/spawn.ts:1022) rather than with the module's own `extensionName` /
`extensionReason` accessors, which is where the name is lost.

**Member 2, the object form with `reason` absent** (`probes/p8-noreason.mjs`),
and this is the shape a JavaScript plugin produces:

```
spawn ok: true
meta.credentials: {"payloadClass":"project","scrubMode":"scrubbed",
                   "extensions":[{"name":"VERCEL_TOKEN"}], ...}
child VERCEL_TOKEN: "write-capable-deploy-token"
```

A write-capable deploy token crossed into a PROJECT payload with no reason
recorded, and the spawn succeeded. `{name:"X", reason:""}` is refused;
`{name:"X"}` is not. The direct unit probe (`probes/p8-c34.mjs`) shows the pair
side by side:

```
REFUSED   {"name":"SOMETHING","reason":""}   -> ...carries no reason...
REFUSED   {"name":"SOMETHING","reason":"   "} -> ...carries no reason...
ACCEPTED  "BARE_STRING_NO_REASON" (bare string) -> crossed: BARE_STRING_NO_REASON
ACCEPTED  {"name":"NOREASONPROP"}            -> crossed: NOREASONPROP
```

**The work history records half of this and then argues it away with a
compile-time claim the same phase rejected one field over.**
delivery/work-history/m4-p8.md:621 item 8 says the bare-string form accepts an
entry with no reason, and then: "The audited route cannot produce one:
`SpawnOptions.extraAllowlist` is typed to the object form and a string does not
typecheck there." The measurement above is that the audited route DOES produce
one. It does not mention the object-with-omitted-reason member at all, and it
does not mention that the NAME is lost. And the phase's own reasoning for
making `payloadClass` a RUNTIME check is the refutation of its own argument
here: test/payload-credentials.test.ts says "the consumer that reaches this
seam is a JavaScript plugin, and a missing field there is `undefined`, not a
compile error". That is true of `reason` for exactly the same reason.

Concrete fix, two edits, both small:

1. In `src/spawn.ts`, have `checkCredentialPolicy` run an additional,
   route-specific refusal after `refuseExtraAllowlist`: for every entry,
   `extensionReason(entry)` must be a string with non-empty `trim()`. Refuse
   naming the entry, with `; nothing was created`. Leave `buildChildEnv`'s
   tolerance of the bare string alone so `test/credentials-gate.test.ts` keeps
   working; the AUDITED route is the one that must demand a reason.
2. In `src/spawn.ts:1022`, build `credentialRecord.extensions` with
   `extensionName(entry)` and `extensionReason(entry)` instead of `entry.name`
   and `entry.reason`, so the record can never be `{}` whatever shape arrives.

Witnesses: the two members above are structurally different (a string with no
`reason` property to read, and an object whose `reason` property is absent),
which satisfies the one-witness-is-not-a-class rule.

### CR-B-003 (MEDIUM). The handover comparison never runs, and nothing is recorded, on two of the four launch arms

The comparison sits at src/spawn.ts:1190, AFTER the `launch-failed` return,
AFTER the `incomplete` return and AFTER the completion-precondition return. On
either of the last two arms the child has already run with whatever
environment the adapter chose, and `meta.json` carries no `handover` key at
all. Criterion 6 requires the comparison "recorded in `meta.json`"; on these
arms there is nothing to read.

Reproduced twice, two structurally different members.

Member 1, the adapter widens and reports `incomplete`
(`probes/widen-incomplete.mjs`):

```
=== outcome kind reported by adapter: completed ===
spawn ok: false reason: ...added LEAKED_SECRET...
meta.credentials: {... "handover":{"status":"compared","added":["LEAKED_SECRET"],...},"refusal":"..."}
child LEAKED_SECRET: "leaked-from-parent"

=== outcome kind reported by adapter: incomplete ===
spawn ok: false reason: the adapter chose to report incomplete
meta.credentials: {"payloadClass":"project","scrubMode":"scrubbed","extensions":[]}
child LEAKED_SECRET: "leaked-from-parent"
```

Same widening, same child, same leak. One arm records it; the other records
nothing.

Member 2, the adapter widens, reports `completed` WITH an honest
`launchedEnvNames`, and the completion precondition fails
(`probes/widen-noevidence.mjs`):

```
spawn ok: false reason: ...the turn-end record ... was never written...
meta.credentials: {"payloadClass":"project","scrubMode":"scrubbed","extensions":[]}
child LEAKED_SECRET: "leaked-from-parent"
```

Here the kernel HAD both name sets in hand and returned before comparing them.

Nothing in delivery/work-history/m4-p8.md addresses these arms: `grep -niE
'incomplete|turn-end|completion precondition'` over that file returns nothing,
and the criterion-6 section at delivery/work-history/m4-p8.md:385 walks only
the `completed` path.

Concrete fix: move the comparison up. Immediately after `launched.ok` is
established, compute
`compareHandover(childEnv, outcome.kind === "completed" ? outcome.launchedEnvNames : undefined)`,
assign it to `credentialRecord.handover`, and write `meta.json` before each of
the `launch-failed`, `incomplete` and completion-precondition returns (on
`launch-failed` the rollback removes the task directory, so record the
comparison in the returned reason instead). Add
`launchedEnvNames?: readonly string[]` to the `incomplete` arm of
`LaunchOutcome` so an honest adapter that could not confirm completion can
still report what it launched with.

### CR-B-004 (MEDIUM). A path-shaped `--adapter` specifier evaluates project-clone code inside the orchestrator process, and the loader's own comment says it cannot

src/adapters/load.ts's module comment states, without qualification, "So
resolution is rooted at `<fleet home>/package.json` and NOTHING here ever
consults the project clone, the kernel's own checkout, or `process.cwd()` at
the moment of the import." Measurement refutes that as a whole-module claim.
`probes/p4-abs.mjs` writes an adapter into the PROJECT CLONE that drops a
sentinel on import:

```
spec "/tmp/probe-p4abs-.../fleet/projects/demo/evil.mjs" -> ok=false reason=executor launch failed: probe
   project-clone code evaluated: true
spec "./projects/demo/evil.mjs"                          -> ok=false reason=executor launch failed: probe
   project-clone code evaluated: true
```

Both an absolute specifier and a fleet-home-relative one resolve and EVALUATE.
`createRequire` roots BARE specifier lookups at the fleet home, which is what
criterion 2 tests; it does not constrain a path-shaped specifier at all. The
dangerous state criterion 2 names, "a project clone under review supplying the
code that runs in the orchestrator's own process", is therefore reachable.

This is item 4 of delivery/work-history/m4-p4.md:574, declared honestly as
"No test covers either form, and the loader does not refuse them" and
"Whether an absolute specifier should be refused is a design question this
phase did not settle". I am raising it from declared-and-unmeasured to
measured. Two things sharpen it beyond the operator-authority argument the work
history offers. First, `selectAdapter` routes the fleet-home
`tiphys.adapter` FIELD through the same `loadAdapter`, so the field can name a
path into the clone too. Second, the credential scrub is environment-only and
the child runs at the same uid (DR-0039's measured note), so a payload can
write `<fleet>/package.json`; the specifier is then not operator input at all.

Concrete fix: after `requireFromFleet.resolve(specifier)` in `loadAdapter`,
refuse when `realpathSync(resolved)` is not under `realpathSync(fleet.root)`,
or is under `fleet.projectsDir` or `fleet.worktreesDir`, naming the resolved
path, the fleet root and which of the two rules fired. Register two witnesses,
the absolute form and the relative form, because they fail through different
code in `require.resolve`. If the owner decides an operator-typed absolute
specifier should stay allowed, the `projects/` and `worktrees/` exclusion is
the half that must land regardless, and the module comment must be corrected
either way: a prose claim a probe refutes is how the next reader re-derives
the defect.

### CR-B-005 (LOW). An egress name crosses through the audited route and `meta.json` does not distinguish it from a benign widening

`refuseExtraAllowlist` checks `GH_TOKEN_VARIABLES` and `isDangerousEnvName`
and deliberately not `isEgressEnvName`; src/gates/credentials.ts:222 records
why (adding the proxy names to `DANGEROUS_ENV_VOCABULARY` would refuse M4-P8's
one audited extension as a side effect of a data edit). Measured here:

```
ACCEPTED  {"name":"HTTPS_PROXY","reason":"egress, measured to grant GitHub reach"}  -> crossed: HTTPS_PROXY
```

M4-P8's own arm A/arm B table (delivery/work-history/m4-p8.md:116) measured
that this one name takes a child from HTTP 403 to HTTP 200 against
`api.github.com/user`. The decision to permit it is recorded and I am not
reopening it. What is missing is that `meta.json` records an egress-granting
extension identically to a benign one, so the artifact an operator reads
cannot rank them.

Concrete fix: in `src/spawn.ts`'s `credentialRecord.extensions` construction,
add `egress: true` (from `isEgressEnvName(name)`) to any entry the egress
vocabulary matches, and state in `TaskCredentialRecord`'s doc comment that the
flag is a reading aid rather than a refusal. No behaviour changes; the record
gains the one bit that separates the two cases.

## Criteria walk

Every criterion of all three phases, one at a time. "Not reached" appears where
I could not walk one, with the reason.

### M4-P3, `delivery/plan/kernel-plan-m4.md:456`

| # | met | what I ran or read |
|---|---|---|
| 1 | YES | src/spawn.ts:104 `briefPath: string`, src/spawn.ts:113/126/139 the three `string \| undefined`. |
| 2 | YES | `probes/p3-requires.mjs`: refusal names adapter and field; `tasks/t`, `worktrees/t` and the pool record all absent; `git worktree list` one line; `git branch --list` unchanged. With `role` supplied the spawn reaches launch. |
| 3 | YES | same probe: `requires: ["modelName"]` refuses with "which the executor request contract has no field for" and enumerates the eleven requirable fields. Structurally different sentence from criterion 2's. Nothing created. |
| 4 | YES | real `executor.json` from a real spawn validates at exit 0; the same record with `adapter` deleted gives `INVALID #/adapter required property adapter is missing`, exit 1. |
| 5 | YES | red witness run: `additionalProperties` deleted, smuggled `model` validates exit 0; keyword restored, `INVALID #/model property model is not permitted here`, exit 1. |
| 6 | YES | `--tier strongest --role implementer` produced `"requestedTier": "strongest"`, `"requestedRole": "implementer"`, byte-equal, and no resolved-model field. |
| 7 | YES, with a declared deviation | test/schemas.test.ts:745 derives the file set at run time and asserts a NAMED hit set, not a count. Deviation 2 of the work history explains why "four hits" was not reproducible; the substituted form is stronger. |
| 8 | YES | all fifteen declared behaviors resolve by name in `test/behaviors.json` (1158 entries); no count is pinned. |
| 9 | YES | `npm run build` exit 0, `git status --porcelain` empty, suite sentence below. |

### M4-P4, `delivery/plan/kernel-plan-m4.md:604`

| # | met | what I ran or read |
|---|---|---|
| 1 | YES | `probes/p4-default.mjs` arm C: `--adapter flag-one` against a scratch fleet gives `executor.json` `"adapter": "flag-adapter"`. |
| 2 | **PARTLY** | bare specifier: refused naming the fleet home, no task directory, sentinel absent. Path-shaped specifier: project-clone code evaluated. See CR-B-004. |
| 3 | YES | both roots carrying `evil-adapter`: fleet sentinel written, project sentinel not, and the loaded adapter is the fleet copy. |
| 4 | YES (read) + name check RUN | `checkAdapterShape` refuses all three shapes plus an unusable `name`; the impostor probe confirms no task directory after a load-time refusal. |
| 5 | YES | probe: an adapter naming itself `subprocess` is refused with the misattribution reason; `tasks/t` absent. |
| 6 | YES | three arms run: no flag no field gives `subprocess`; field only gives `fleet-default-adapter`; both gives `flag-adapter`. |
| 7 | YES | scratch consumer against built `dist/`: `@tiphys/kernel` resolves, exporting `BUILT_IN_ADAPTER_NAME` and `requirableRequestFields`, types included. |
| 8 | YES | same consumer: four deep subpaths all `ERR_PACKAGE_PATH_NOT_EXPORTED`. |
| 9 | YES | `npm ci`, `npm run build` exit 0, clean `git status`, suite sentence below. |

### M4-P8, `delivery/plan/kernel-plan-m4.md:1396`

| # | met | what I ran or read |
|---|---|---|
| 1 | YES | `test/payload-credentials.test.ts` runs as part of the suite below on v26.6.0 with `dist/` built; its eight tests pass. |
| 2 | YES | `probes/bare-string.mjs` family and the shipped test: `payloadClass:"project"` + `allowPrCredentials:true` refuses naming both fields, creates no worktree and runs no payload; `orchestrator` succeeds. |
| 3 | YES | direct probe: `GH_TOKEN` refused as a gh token variable, `NODE_OPTIONS` refused through the walked vocabulary, plus `GITHUB_TOKEN` and `GIT_CONFIG_KEY_0`. Two different halves of the vocabulary. |
| 4 | **NO** | `reason: ""` and `reason: "   "` are refused; a bare string and `{name:"X"}` are not, and the record loses the name for the first. See CR-B-002. |
| 5 | YES | `scripts/credential-witness.mjs` wrote a real report from inside the child on every probe; its contents are what CR-B-001 and CR-B-002 assert on. |
| 6 | **NO** | met on the `completed` + evidence-ok arm only. Not recorded on the `incomplete` arm or the failed-completion-precondition arm (CR-B-003), and defeated by a value change on the arm where it does run (CR-B-001). |
| 7 | YES (read, not re-run) | delivery/work-history/m4-p8.md:110 carries the four-arm table with captured HTTP codes and arm D's verbatim refusal; the name list is one name. I did NOT re-run the network probe: this container's egress is proxied and a re-measurement would be a different measurement, not a confirmation. |

## Deviations judged

1. **M4-P3 deviation 1**, the phase declaration did not exist on `main`. Serves
   the plan's intent: the plan lists the file as files-to-touch (create) and the
   brief was wrong. Creating it was the only way to make the scope gate
   satisfiable.
2. **M4-P3 deviation 2**, criterion 7's token list and "four hits" are not
   reproducible from the intake. Serves the plan's intent. The implementer did
   not pin a number, derived the file set at run time, and split the branch
   prefix into its own named baseline, which is stronger than the criterion as
   written. The plan text should be revised.
3. **M4-P8 deviations 1 to 3**, three scope-declaration entries added at head
   (`src/commands/spawn.ts`, `test/spawn.test.ts`,
   `test/credentials-gate.test.ts`). All three are forced by the plan's own
   steps: a required `payloadClass` makes every call site a compile error, and
   the two tests over-assert on a document this phase extends. Legal at head
   since M3-P11 (src/gates/scope.ts:110) and printed by name. Judged as serving
   the plan.

## Fix-round contract item 3, the reviewer's first check

All three work histories state what their derivation did NOT cover, and two of
the three do it well.

- **M4-P3**: delivery/work-history/m4-p3.md:750 names three exclusions, one of
  them structural (the grep stops being able to enumerate adapters at all from
  M4-P4 on, which is why the non-array guard is a refusal and not a type).
  Exemplary.
- **M4-P4**: delivery/work-history/m4-p4.md:548 names ten regions, each
  described as deliberately outside the work rather than searched and found
  empty. Item 4 is the one CR-B-004 turns into a measurement.
- **M4-P8**: delivery/work-history/m4-p8.md:568 names nine. Item 8 is the one
  CR-B-002 shows understates itself, and the sentence that does it is a
  "cannot" claim resting on a type rather than on a captured command. The
  binding claim grep does not catch it: the phrase is "cannot produce", and the
  grep's vocabulary carries "cannot be". That is a gap in the grep's word list
  rather than in this phase, and it is worth one word.

## Suite

**The complete sentence.** Interpreter node **v26.6.0** (`node --version` in the
shell that ran it), `dist/` **built** (`npm run build` exit 0 immediately
before, `git status --porcelain` empty), invocation **`npm test`**, which
`package.json` expands to `node --test "test/**/*.test.ts"`. Result:

```
i tests 1282
i suites 0
i pass 1282
i fail 0
i cancelled 0
i skipped 0
i todo 0
i duration_ms 365348.450887
NPM_TEST_EXIT=0
```

**Transliteration, declared.** The capture above is verbatim except that
Node's reporter glyph U+2139 was replaced by `i`, 8 occurrences in the block
quoted. The wider capture also carries U+2714 (1282 occurrences), rendered `x`
nowhere here because no failure line is quoted. Nothing else in any captured
output in this document was changed.

**A first run at this head reported failures and is NOT evidence about
`main`.** I ran the suite twice. The first run ended with an assertion failure
in `test/gates.test.ts` at the `runCliUnprivileged` region (`readGateRecord`,
test/gates.test.ts:3558, called from test/gates.test.ts:3659), whose captured
stderr carried `ERR_MODULE_NOT_FOUND` for
`.../clone/src/validate.ts` under the unprivileged uid. **That run is
contaminated by me**: I mutated `schemas/executor-record.schema.json` in the
working tree while it was in progress, as the criterion-5 red witness, which
alone disqualifies it. It did not reproduce: the second full run, with the tree
restored and nothing concurrent, is the 1282/1282/0 quoted above, and
`node --test test/gates.test.ts` alone afterwards reports `tests 54, pass 54,
fail 0, skipped 0`, exit 0. I am recording the failure rather than dropping it,
and I am NOT claiming to have proved its cause: the region it failed in is the
one standing warning 1 flags for interpreter-path traversal under
`/tmp/claude-0`, and my probes were running concurrently, so two plausible
causes exist and I separated neither.

## What I could not reach

- **M4-P8 criterion 7's network measurement.** I read the four-arm table at
  delivery/work-history/m4-p8.md:110 and did not re-run it. Outbound HTTPS here
  goes through an agent proxy whose credential substitution is documented in
  CLAUDE.md standing warning 6, so a re-measurement would be a different
  measurement rather than a confirmation. Reported as read, not as run.
- **`delivery/tuition/T-041-...`**, the entry the brief asked me to read first.
  It is not on `main` at `0eaf453`.
- **M4-P4 criterion 4's three malformed shapes** were read in
  `checkAdapterShape` and exercised only through the name-collision arm, which
  shares the same refusal path and post-conditions. The three shape arms
  themselves I read rather than ran.
- **Any platform other than Linux**, and any interpreter other than v26.6.0.
- **Whether a fleet home whose PARENT carries a `node_modules` can reach the
  project clone by the upward walk.** delivery/work-history/m4-p4.md:566 raises
  it as open and I did not close it either.

## Verdict document

`/tmp/claude-0/retro-review/verdict-retro-B-criteria.json`, conforming to
`schemas/verdict.schema.json`. Validated:

```
$ node bin/tiphys.ts validate --type verdict /tmp/claude-0/retro-review/verdict-retro-B-criteria.json
SKIPPED dual-review-decorrelation no context
SKIPPED verdict-criteria-complete no context
SKIPPED verdict-deviations-judged no context
SKIPPED verdict-hazard-classes-addressed no context
SKIPPED verdict-pair-approves no context
VALIDATE_EXIT=1
```

**The exit 1 is the context-less skip, not a schema failure, and the two are
distinguishable from the output.** src/commands/validate.ts:460 prints every
schema diagnostic and returns 1 BEFORE `runChecks` is reached, so the absence
of any `INVALID` line is what says the document validates against
`schemas/verdict.schema.json`. src/checks.ts:5331 then prints
`SKIPPED <id> no context` and src/commands/validate.ts:471 fails the run,
deliberately, because a Kind B check with nothing to compare against is a
fail-closed skip. The five skipped checks are the cross-document ones
(criteria completeness against the plan, deviations against the work history,
hazard classes, and the two dual-review comparisons); they need a `--context`
the orchestrator supplies when it pairs this verdict with the other reviewer's.

The three assigned fields are set as the brief assigns them:
`"review-contract": "criteria"`, `"framing": "criteria-contract"`,
`"produced-by": "Claude Opus 5 (Anthropic)"`. I ran the criteria contract and
did not swap to the hazard one.


## The JSON verdict, embedded rather than committed at the corpus root

**IT IS NOT AT THE TOP LEVEL OF `delivery/review/`, AND THAT IS DELIBERATE AND
MEASURED RATHER THAN AN OVERSIGHT.** `check-dual-review` reads its corpus from
the top level of that directory, non-recursively. Committing this verdict there
was tried on a scratch commit and the gate went RED, correctly, for three
reasons it printed by name: only one verdict exists and DR-0012 condition 2 is a
property of the PAIR; the verdict reads FIX-ROUND-NEEDED so the pair does not
approve the head; and four findings sit unresolved at medium or high.

The gate is right on all three counts. A verdict that says FIX-ROUND-NEEDED is
not evidence a head may merge, and landing it at the corpus root would assert
that it is. It lands there when a fix round has closed the findings and a
re-review can honestly say APPROVE.

Moving it to a subdirectory to keep the gate quiet would be defeating a guard by
file placement, which src/checks.ts:3039 records this repository already being
bitten by once. So it is embedded HERE instead, in the document a later reviewer
reads, where it is durable, auditable, and making no claim to the gate.

```json
{
  "kind": "verdict",
  "phase": "M4-P3",
  "head": "0eaf4532c9fda42609481234c4a3fc800367cc76",
  "verdict": "FIX-ROUND-NEEDED",
  "produced-by": "Claude Opus 5 (Anthropic)",
  "framing": "criteria-contract",
  "review-contract": "criteria",
  "findings": [
    {
      "id": "CR-B-001",
      "severity": "high",
      "evidence": [
        "src/spawn.ts:342 compareHandover compares NAME SETS only; the five CREDENTIAL_STORE_REDIRECTIONS at src/exec/env.ts:212 are defended by their VALUES, which the comparison never reads.",
        "Reproduced, probes/home-revert.mjs on node v26.6.0 against a real scratch fleet: an adapter that keeps the name set byte-identical and only restores HOME and XDG_CONFIG_HOME to the real paths gives 'spawn ok: true'.",
        "meta.credentials recorded {\"payloadClass\":\"project\",\"scrubMode\":\"scrubbed\",\"extensions\":[],\"handover\":{\"status\":\"compared\",\"added\":[],\"removed\":[]}} while the child-written probe reported 'child HOME: /root'.",
        "The same child probe reported gh-configuration outcome 'resolvable', detail 'credential store reachable from inside the child environment: /root/.config/gh/hosts.yml (48 bytes)', and verdict 'red'.",
        "The adapter is HONEST: it reported exactly the names it launched with, so delivery/work-history/m4-p8.md:589 item 3 ('a dishonest adapter is not caught') does not cover this."
      ],
      "concrete-fix": "Compare the five CREDENTIAL_STORE_REDIRECTIONS by VALUE as well as by name: add launchedRedirections?: Readonly<Record<string,string>> to the completed arm of LaunchOutcome in src/spawn.ts restricted to those five names, refuse in spawnTask when any reported value differs from the handed one, and add a fourth CredentialHandoverRecord status (for example values-unreported) so a record where names were reported and redirection values were not does not read as 'compared'. Stronger and preferred, because it is what DR-0039 condition 4 asks for: have writeTurnEndHook (src/hooks.ts), which the kernel writes and which runs in the same child environment, record $HOME and $XDG_CONFIG_HOME into the turn-end record, and have turnEndEvidence compare them against scrubRoot(dir).",
      "analysis": "Those five values are harness-owned paths inside the task directory and carry no credential material, so the stated reason for not comparing values (keeping credential material out of a record an operator reads) does not apply to them. The failure is worse than an omission: meta.json positively asserts a clean comparison while the child reached the real store, which is the phase's own hazard class with the artifact saying the opposite."
    },
    {
      "id": "CR-B-002",
      "severity": "high",
      "evidence": [
        "src/exec/env.ts:174 refuseExtraAllowlist guards the blank-reason refusal with 'reason !== undefined', so an absent reason is never reached.",
        "Member 1, bare string, reproduced through spawnTask with probes/bare-string.mjs: spawn succeeded, the child saw TIPHYS_PROBE_SECRET = \"s3cr3t-value-from-parent\", and meta.credentials recorded \"extensions\": [ {} ] with no name and no reason.",
        "Member 2, object form with reason absent, reproduced with probes/p8-noreason.mjs: spawn ok true, meta.credentials recorded \"extensions\":[{\"name\":\"VERCEL_TOKEN\"}], and the child saw VERCEL_TOKEN = \"write-capable-deploy-token\" on a payloadClass \"project\" spawn.",
        "Unit probe probes/p8-c34.mjs, four adjacent lines: REFUSED {\"name\":\"SOMETHING\",\"reason\":\"\"}; REFUSED {\"name\":\"SOMETHING\",\"reason\":\"   \"}; ACCEPTED \"BARE_STRING_NO_REASON\" (bare string) -> crossed; ACCEPTED {\"name\":\"NOREASONPROP\"} -> crossed.",
        "src/spawn.ts:1022 builds credentialRecord.extensions with entry.name / entry.reason rather than the module's extensionName / extensionReason accessors, which is where the bare-string form loses its name.",
        "delivery/work-history/m4-p8.md:621 item 8 records half of this and argues it away with 'The audited route cannot produce one: SpawnOptions.extraAllowlist is typed to the object form and a string does not typecheck there', which the two reproductions above refute.",
        "The same phase rejected that compile-time argument one field over: test/payload-credentials.test.ts states 'the consumer that reaches this seam is a JavaScript plugin, and a missing field there is undefined, not a compile error', which is why payloadClass is a runtime check."
      ],
      "concrete-fix": "Two edits in src/spawn.ts. (1) In checkCredentialPolicy, after the existing refuseExtraAllowlist call, add a route-specific refusal: for every entry, extensionReason(entry) must be a string whose trim() is non-empty; refuse naming the entry and ending '; nothing was created'. Leave buildChildEnv's tolerance of the bare-string form alone so test/credentials-gate.test.ts keeps working, because it is the AUDITED route that must demand a reason. (2) At src/spawn.ts:1022 build credentialRecord.extensions with extensionName(entry) and extensionReason(entry) instead of entry.name and entry.reason, so the record can never be {} whatever shape arrives. Register both members above as witnesses; they are structurally different, a string with no reason property to read and an object whose reason property is absent.",
      "analysis": "DR-0039 condition 2 requires every name that crosses to carry a written reason, and the owner's selected option text says 'enforced by code, not by a promise'. M4-P8 criterion 4 is that code, and it is not met for either member. The credential itself is still gated by the two vocabularies, so what is lost is the AUDIT, which is exactly the hazard the phase names."
    },
    {
      "id": "CR-B-003",
      "severity": "medium",
      "evidence": [
        "The comparison at src/spawn.ts:1190 sits after the launch-failed return, after the incomplete return, and after the completion-precondition return, so two arms never reach it.",
        "Member 1, probes/widen-incomplete.mjs, one adapter, two reported outcomes. completed: 'spawn ok: false ... added LEAKED_SECRET', meta.credentials carries handover {status compared, added [LEAKED_SECRET]} and a refusal. incomplete: 'spawn ok: false reason: the adapter chose to report incomplete', meta.credentials is {\"payloadClass\":\"project\",\"scrubMode\":\"scrubbed\",\"extensions\":[]} with NO handover key. In both arms the child report shows LEAKED_SECRET = \"leaked-from-parent\".",
        "Member 2, probes/widen-noevidence.mjs: the adapter widens, reports completed WITH an honest launchedEnvNames, and the turn-end record is removed so the completion precondition refuses first. meta.credentials again carries no handover key while the child saw LEAKED_SECRET. The kernel had both name sets in hand and returned before comparing them.",
        "grep -niE 'incomplete|turn-end|completion precondition' over delivery/work-history/m4-p8.md returns nothing, and the criterion-6 walk at delivery/work-history/m4-p8.md:385 covers only the completed path."
      ],
      "concrete-fix": "In src/spawn.ts, move the comparison up: immediately after launched.ok is established, compute compareHandover(childEnv, outcome.kind === \"completed\" ? outcome.launchedEnvNames : undefined), assign it to credentialRecord.handover, and write meta.json before each of the launch-failed, incomplete and completion-precondition returns (on launch-failed the rollback removes the task directory, so carry the comparison in the returned reason instead). Add launchedEnvNames?: readonly string[] to the incomplete arm of LaunchOutcome so an adapter that could not confirm completion can still report what it launched with.",
      "analysis": "Criterion 6 requires the comparison 'recorded in meta.json'. On these two arms the widening reached the child and the artifact carries nothing about it, which is the hazard class restated. The spawn does fail on both arms, but for an unrelated reason, so an operator reading the task directory learns nothing about the environment."
    },
    {
      "id": "CR-B-004",
      "severity": "medium",
      "evidence": [
        "src/adapters/load.ts's module comment states without qualification 'NOTHING here ever consults the project clone, the kernel's own checkout, or process.cwd() at the moment of the import'.",
        "Reproduced, probes/p4-abs.mjs, an adapter written into the PROJECT CLONE that drops a sentinel on import. Absolute specifier '/tmp/probe-p4abs-.../fleet/projects/demo/evil.mjs': 'project-clone code evaluated: true'. Fleet-home-relative specifier './projects/demo/evil.mjs': 'project-clone code evaluated: true'.",
        "Control, from the same session: a BARE specifier planted only in the project clone is refused and its sentinel is never written (probes/p4-roots.mjs, criterion 2 arm), so createRequire roots bare lookups at the fleet home and constrains a path-shaped specifier not at all.",
        "selectAdapter routes the fleet-home tiphys.adapter FIELD through the same loadAdapter, so the field can name a path into the clone too.",
        "delivery/work-history/m4-p4.md:574 item 4 declares this as unmeasured and unrefused; this review measures it."
      ],
      "concrete-fix": "In loadAdapter (src/adapters/load.ts), after requireFromFleet.resolve(specifier), refuse when realpathSync(resolved) is not under realpathSync(fleet.root), or is under fleet.projectsDir or fleet.worktreesDir, with a reason naming the resolved path, the fleet root and which of the two rules fired. Register two witnesses, the absolute form and the relative form, because they fail through different code in require.resolve. Correct the module comment either way: if the owner decides an operator-typed absolute specifier stays allowed, the projects/ and worktrees/ exclusion must still land, and the comment must stop making a claim a probe refutes.",
      "analysis": "The work history's operator-authority argument holds for a human typing --adapter and does not hold for the fleet-home field: the credential scrub is environment-only and the child runs at the same uid (DR-0039's measured note), so a payload can write <fleet>/package.json, and the specifier is then not operator input. This makes the dangerous state criterion 2 names, a project clone under review supplying the code that runs in the orchestrator's own process, reachable."
    },
    {
      "id": "CR-B-005",
      "severity": "low",
      "evidence": [
        "refuseExtraAllowlist checks GH_TOKEN_VARIABLES and isDangerousEnvName and deliberately not isEgressEnvName; src/gates/credentials.ts:222 records the reason.",
        "Measured, probes/p8-c34.mjs: ACCEPTED {\"name\":\"HTTPS_PROXY\",\"reason\":\"egress, measured to grant GitHub reach\"} -> crossed: HTTPS_PROXY.",
        "delivery/work-history/m4-p8.md:116 measured that this one name takes a child from HTTP 403 to HTTP 200 against api.github.com/user.",
        "meta.json records an egress-granting extension identically to a benign one: probes/npm-token.mjs shows extensions entries carrying only name and reason."
      ],
      "concrete-fix": "In src/spawn.ts's credentialRecord.extensions construction, add egress: true (from isEgressEnvName(name)) to any entry the egress vocabulary matches, add the optional field to CredentialExtensionRecord in src/task.ts, and state in TaskCredentialRecord's doc comment that the flag is a reading aid and not a refusal. No behaviour changes.",
      "analysis": "The decision to permit an egress name through the audited route is recorded and I am not reopening it. What is missing is that the artifact an operator reads cannot rank an extension that grants network reach above one that does not."
    }
  ],
  "criteria": [
    {
      "id": "M4-P3-1",
      "quote": "ExecutorRequest carries briefPath: string, and role, declaredTier and phaseId, each string | undefined. briefPath is NOT optional",
      "evidence": [
        "Read src/spawn.ts:104: briefPath: string, non-optional.",
        "Read src/spawn.ts:113, :126, :139: role, declaredTier and phaseId each string | undefined."
      ],
      "met": true
    },
    {
      "id": "M4-P3-2",
      "quote": "A declared requirement that is unmet creates nothing (red witness 1). ... An adapter declaring requires: [\"role\"] spawned WITHOUT --role makes tiphys spawn exit nonzero naming the adapter and the field, and afterwards: tasks/<id>/ does not exist, git worktree list is unchanged, git branch --list is unchanged, and no pool record exists.",
      "evidence": [
        "Ran probes/p3-requires.mjs against a real scratch fleet on node v26.6.0. Reason: 'the needs-role adapter requires role, and this spawn supplied no value for it; nothing was created'.",
        "All four post-conditions asserted: tasks/t exists=false, worktrees/t exists=false, no pool record, 'worktree list lines: 1', 'branches: * main'.",
        "The other direction: the same adapter with role supplied reached launch (it failed later at the completion precondition, which is downstream of the launch)."
      ],
      "met": true
    },
    {
      "id": "M4-P3-3",
      "quote": "A requirement naming a field that does not exist is refused at load, not at launch (red witness 1, second member). An adapter declaring requires: [\"modelName\"] is refused with a reason naming the unknown field, and the refusal happens before anything is created.",
      "evidence": [
        "Same probe: 'the needs-model adapter declares a requirement on modelName, which the executor request contract has no field for; the requirable fields are taskId, worktree, command, hookPath, recordPath, briefPath, deadlineSeconds, env, role, declaredTier, phaseId'.",
        "Structurally different from criterion 2's sentence, which is the point the plan makes. Post-conditions: tasks/t exists=false, worktrees/t exists=false, one worktree line, branches unchanged.",
        "Read src/spawn.ts:212 checkAdapterContract and src/spawn.ts:871, which runs it before checkAdapterRequirements with a comment saying the order is load-bearing."
      ],
      "met": true
    },
    {
      "id": "M4-P3-4",
      "quote": "tiphys validate --type executor-record <file> exits 0 on a record subprocessAdapter actually wrote (captured from a real spawn, not hand-written), and exits nonzero naming the field on a record missing adapter.",
      "evidence": [
        "Captured a real executor.json from a real spawn (probes/p3-record.mjs): {\"adapter\":\"subprocess\",\"launchedAt\":\"2026-09-18T04:33:45.371Z\",\"deadline\":\"2026-09-18T04:35:15.371Z\",\"requestedTier\":\"strongest\",\"requestedRole\":\"implementer\"}.",
        "node bin/tiphys.ts validate --type executor-record <real> -> exit 0, no output.",
        "Same record with adapter deleted -> 'INVALID #/adapter required property adapter is missing', exit 1.",
        "Read the type-table row at src/commands/validate.ts:129."
      ],
      "met": true
    },
    {
      "id": "M4-P3-5",
      "quote": "Kind A dangerous-instance witness on the schema. The schema's additionalProperties: false is removed, a record carrying an undeclared model field is accepted, and the keyword is restored and the same record refused.",
      "evidence": [
        "Ran the red witness in my clone: with additionalProperties deleted from schemas/executor-record.schema.json, a record carrying \"model\": \"some-vendor-model-v3\" validates at exit 0.",
        "Keyword restored: the same record gives 'INVALID #/model property model is not permitted here', exit 1.",
        "git status --porcelain empty afterwards, so the clone is byte-identical to origin/main."
      ],
      "met": true
    },
    {
      "id": "M4-P3-6",
      "quote": "ExecutorRecord carries requestedTier and requestedRole copied VERBATIM from the request, and a test asserts byte equality between the flag value and the recorded value. It carries no resolved model.",
      "evidence": [
        "Real spawn with declaredTier 'strongest' and role 'implementer' produced \"requestedTier\": \"strongest\" and \"requestedRole\": \"implementer\", byte-equal.",
        "No model field in the captured record, and schemas/executor-record.schema.json has additionalProperties false with no model property, which criterion 5's witness shows is load-bearing.",
        "Read src/spawn.ts's ExecutorRecord doc comment stating the record is written before the payload starts."
      ],
      "met": true
    },
    {
      "id": "M4-P3-7",
      "quote": "grep -rniE '<the eleven vendor tokens named in the intake>' src/ bin/ schemas/ roles/ *.yaml returns the same four hits as before this phase, and the count is asserted by a TEST rather than by a grep in a work history",
      "evidence": [
        "Read test/schemas.test.ts:745 to :847. VENDOR_MODEL_TOKENS holds exactly eleven tokens; shippedSurfaceFiles() walks src, bin, schemas, roles and root *.yaml at run time rather than listing them; the assertion is assert.deepEqual(hits, []) plus a NAMED five-file branch-prefix baseline, not a count.",
        "Non-vacuity control present in the test: the same pattern is asserted to match 'model: claude-3-OPUS-20240229' and not to match 'model: a-tier-name'.",
        "The test passed in the full suite run below.",
        "Deviation declared at delivery/work-history/m4-p3.md:406: the intake names no eleven-token list and no token set reproduces four hits; the implementer implemented the intent with a declared constant and did not pin the number."
      ],
      "met": true
    },
    {
      "id": "M4-P3-8",
      "quote": "Every pre-existing spawn-* behavior in test/behaviors.json still resolves by name. Counts are derived at run time, never pinned.",
      "evidence": [
        "Read test/behaviors.json: 1158 entries, an object keyed by behavior name.",
        "All seven M4-P3 behaviors present by name: spawn-request-carries-brief-path, spawn-adapter-requirement-unmet-creates-nothing, spawn-adapter-requirement-unknown-field-refused, executor-record-validates, executor-record-rejects-undeclared-fields, executor-record-echoes-requested-tier, kernel-carries-no-vendor-model-names.",
        "The full suite run below is green, which includes the behavior-resolution checks."
      ],
      "met": true
    },
    {
      "id": "M4-P3-9",
      "quote": "npm run build exits 0, git status clean, and node --test exits 0 reporting N tests, N greater than 0, with invocation, interpreter, build state, pass count and skipped count quoted.",
      "evidence": [
        "npm ci exit 0, npm run build exit 0, git status --porcelain empty afterwards, on node v26.6.0.",
        "npm test (node --test \"test/**/*.test.ts\"), dist built, node v26.6.0: tests 1282, pass 1282, fail 0, skipped 0, exit 0.",
        "A first run of the same command reported failures and is recorded in the markdown as contaminated by my own mid-run working-tree mutation; node --test test/gates.test.ts alone afterwards reports tests 54, pass 54, fail 0, skipped 0, exit 0."
      ],
      "met": true
    },
    {
      "id": "M4-P4-1",
      "quote": "tiphys spawn --adapter <specifier> ... resolves the specifier with Node module resolution rooted at the FLEET HOME. Witnessed by a real spawn against a scratch fleet, with the loaded adapter's name appearing in tasks/<id>/executor.json.",
      "evidence": [
        "Ran probes/p4-default.mjs arm C on a real scratch fleet: an adapter installed at <fleet>/node_modules/flag-one, selected with adapterSpecifier 'flag-one', produced tasks/t/executor.json with \"adapter\": \"flag-adapter\".",
        "Read src/adapters/load.ts's loadAdapter: createRequire(fleet.packageJsonPath) is the rooting, then import(pathToFileURL(resolved).href)."
      ],
      "met": true
    },
    {
      "id": "M4-P4-2",
      "quote": "The project clone is not a resolution root (red witness 1). A scratch fleet whose PROJECT CLONE contains node_modules/evil-adapter and whose FLEET HOME does not: tiphys spawn --adapter evil-adapter exits nonzero naming the fleet home as the resolution root, creates no task directory, and the module is never evaluated.",
      "evidence": [
        "Ran probes/p4-roots.mjs with evil-adapter planted only in the project clone. Refusal names the fleet home: 'could not be resolved from the fleet home /tmp/probe-p4c2-.../fleet, which is the ONLY resolution root the kernel uses for adapters ... (MODULE_NOT_FOUND)'. tasks/t exists false, worktrees/t exists false, and the on-import SENTINEL was NOT written, so the module was never evaluated.",
        "The criterion holds for a BARE specifier and fails for a path-shaped one: probes/p4-abs.mjs shows both an absolute specifier and './projects/demo/evil.mjs' evaluating project-clone code, 'project-clone code evaluated: true' in both arms. Recorded as CR-B-004.",
        "src/adapters/load.ts's module comment claims the stronger property, 'NOTHING here ever consults the project clone', which the probe refutes."
      ],
      "met": false
    },
    {
      "id": "M4-P4-3",
      "quote": "Both roots present, the fleet home wins (red witness 1, second member, and the SILENT one). Same scratch fleet, but evil-adapter exists in BOTH trees with different name values. The spawn succeeds and tasks/<id>/executor.json carries the FLEET HOME copy's name.",
      "evidence": [
        "Ran probes/p4-roots.mjs with evil-adapter in both trees, named 'project-copy' and 'fleet-copy'. The loaded adapter was the fleet copy: fleet-sentinel written true, proj-sentinel false, and the launch reason came from the fleet copy's launch.",
        "This is the silent member: both copies resolve, so only the sentinel and the record distinguish them."
      ],
      "met": true
    },
    {
      "id": "M4-P4-4",
      "quote": "A module that is not an adapter is refused before anything is created. Three shapes, each asserted: a module with no default export; a module exporting an object with no launch; a module exporting launch as a non-function. Each exits nonzero naming the specifier and the missing member, and afterwards no task directory, no worktree, no branch and no pool record exists.",
      "evidence": [
        "READ rather than run for the three shapes: src/adapters/load.ts's checkAdapterShape refuses each of the three, plus a fourth check on an unusable name, and every reason names the specifier and the member.",
        "The post-conditions were RUN through the sibling load-time refusal (criterion 5's impostor arm): tasks/t exists false after a refusal raised inside checkAdapterShape, which is the same return path.",
        "Read src/spawn.ts:859: selectAdapter runs before pool create, so a shape refusal cannot arrive after creation.",
        "Reported as read-not-run for the three shapes themselves."
      ],
      "met": true
    },
    {
      "id": "M4-P4-5",
      "quote": "An adapter claiming the name subprocess is refused.",
      "evidence": [
        "Ran probes/p4-roots.mjs criterion 5 arm: an adapter installed in the fleet home naming itself 'subprocess' is refused with 'names itself subprocess, which is the built-in adapter's name; a loaded adapter may not claim it, because the launch record's adapter field would then no longer say which one ran'.",
        "tasks/t exists false afterwards.",
        "Read src/adapters/load.ts's BUILT_IN_ADAPTER_NAME and the comment on why it lives in the loader rather than in src/spawn.ts."
      ],
      "met": true
    },
    {
      "id": "M4-P4-6",
      "quote": "The default is explicit in the record, not silent. With no --adapter and no fleet-home field, the spawn proceeds on subprocessAdapter and the record says subprocess; with a fleet-home package.json field and no flag, the record names the field's adapter; with both, the FLAG wins.",
      "evidence": [
        "Ran probes/p4-default.mjs, three arms on three scratch fleets. Arm A, no flag no field: record adapter 'subprocess'. Arm B, tiphys.adapter field only: record adapter 'fleet-default-adapter'. Arm C, field plus flag: record adapter 'flag-adapter'.",
        "All three spawns returned ok true."
      ],
      "met": true
    },
    {
      "id": "M4-P4-7",
      "quote": "@tiphys/kernel exposes ExecutorAdapter, ExecutorRequest, ExecutorRecord and LaunchOutcome through exports, and a test that imports them from the PACKAGE NAME (not a relative path) against the built dist/ exits 0.",
      "evidence": [
        "Built a scratch consumer with node_modules/@tiphys/kernel symlinked to the clone and ran import(\"@tiphys/kernel\") against the built dist/: RESOLVED, exporting BUILT_IN_ADAPTER_NAME and requirableRequestFields (the four names are TYPE exports and so carry no runtime binding).",
        "Read package.json: main ./dist/src/index.js, types ./dist/src/index.d.ts, exports { \".\": { types, default }, \"./package.json\" }.",
        "Read src/index.ts: the four types plus requirableRequestFields and BUILT_IN_ADAPTER_NAME, and nothing else."
      ],
      "met": true
    },
    {
      "id": "M4-P4-8",
      "quote": "The exports map does not widen the package. src/spawn.ts's internals, src/exec/env.ts and src/task.ts are NOT reachable through the package name; a test importing one of them by package subpath fails.",
      "evidence": [
        "Same scratch consumer, four subpaths, all refused: @tiphys/kernel/dist/src/spawn.js, @tiphys/kernel/dist/src/exec/env.js and @tiphys/kernel/dist/src/task.js each ERR_PACKAGE_PATH_NOT_EXPORTED, and @tiphys/kernel/spawn likewise.",
        "The exports map carries no wildcard subpath, which is the dangerous state the criterion names."
      ],
      "met": true
    },
    {
      "id": "M4-P4-9",
      "quote": "npm run build exits 0, git status clean afterwards, npm ci exits 0 against the lockfile, and node --test exits 0 reporting N tests, N greater than 0, with the complete four-part sentence.",
      "evidence": [
        "npm ci exit 0 against the lockfile, npm run build exit 0, git status --porcelain empty afterwards.",
        "Complete sentence: node v26.6.0, dist built, invocation npm test (node --test \"test/**/*.test.ts\"), tests 1282, pass 1282, fail 0, skipped 0, exit 0."
      ],
      "met": true
    },
    {
      "id": "M4-P8-1",
      "quote": "node --test test/payload-credentials.test.ts exits 0 and reports N tests, N > 0, on node v26.6.0 with dist/ built, invoked as stated.",
      "evidence": [
        "test/payload-credentials.test.ts ran as part of the full suite on node v26.6.0 with dist/ built: 1282 tests, 1282 pass, 0 fail, 0 skipped, exit 0.",
        "Its eight behaviors resolve by name in test/behaviors.json (payload-credentials-escape-hatch-refused-on-project, -payload-class-required, -extension-vocabulary-refused, -extension-reason-is-data, -child-written-witness, -handover-name-set-compared, -vocabulary-single-source, -handover-three-states).",
        "I did not invoke that one file on its own; the criterion's invocation is therefore read as satisfied by the containing suite rather than by the exact command."
      ],
      "met": true
    },
    {
      "id": "M4-P8-2",
      "quote": "A spawnTask call with payloadClass: \"project\" and allowPrCredentials: true returns {ok: false} whose reason names both fields, and creates no worktree; the same call with payloadClass: \"orchestrator\" returns {ok: true}.",
      "evidence": [
        "Read src/spawn.ts:302 checkCredentialPolicy: three ordered refusals, the payload-class check first so that an omission is not read as permission, and the pairing refusal naming both allowPrCredentials and payloadClass \"project\", ending 'nothing was created'.",
        "Read src/spawn.ts:832: the policy check runs before the adapter is even resolved, so a refused spawn loads no third-party module.",
        "The shipped test at test/payload-credentials.test.ts asserts all four post-conditions including that no child ran (the probe file does not exist), and it passed in the suite run.",
        "Verified the runtime-omission arm indirectly: PayloadClass is validated against a declared array with includes(), so an undefined from a JavaScript consumer is refused rather than defaulted."
      ],
      "met": true
    },
    {
      "id": "M4-P8-3",
      "quote": "buildChildEnv returns {ok: false} for an extension entry named GH_TOKEN and for an extension entry named NODE_OPTIONS, each reason naming the entry. TWO STRUCTURALLY DIFFERENT MEMBERS.",
      "evidence": [
        "Ran probes/p8-c34.mjs directly against buildChildEnv on node v26.6.0. GH_TOKEN: 'the allowlist extension entry GH_TOKEN is a documented gh token variable and may never cross into a child environment'. NODE_OPTIONS: 'the allowlist extension entry NODE_OPTIONS is in the walked credential- or code-execution-capable vocabulary'.",
        "Two further members confirmed: GITHUB_TOKEN through GH_TOKEN_VARIABLES and GIT_CONFIG_KEY_0 through the numbered-injection regex at src/gates/credentials.ts:282.",
        "Both refused whatever reason accompanied them, which is the ordered name-first property the source comment claims.",
        "Read src/gates/credentials.ts:114, which records the export-from-here choice plan step 4 required."
      ],
      "met": true
    },
    {
      "id": "M4-P8-4",
      "quote": "An extension entry with reason: \"\" is refused naming the entry; the same entry with a non-empty reason is accepted and the reason appears verbatim in meta.json.",
      "evidence": [
        "The named half holds: probes/p8-c34.mjs shows reason \"\" and reason \"   \" both refused naming SOMETHING, and probes/npm-token.mjs shows two non-empty reasons appearing verbatim in meta.json ('release verification needs to read the registry', 'deploy status').",
        "The criterion is NOT met for an entry with no reason at all. Bare string: meta.credentials recorded \"extensions\": [ {} ] while TIPHYS_PROBE_SECRET crossed into the child. Object form with reason absent: meta recorded [{\"name\":\"VERCEL_TOKEN\"}] while a write-capable token crossed into a project payload and the spawn succeeded.",
        "Recorded as CR-B-002, with the concrete fix."
      ],
      "met": false
    },
    {
      "id": "M4-P8-5",
      "quote": "The child-written probe file exists after a real spawn and its contents are the assertion. RED WITNESS: a mutant that has the adapter add GH_TOKEN to the environment AFTER receiving it from the kernel leaves buildChildEnv's return value unchanged and reddens this criterion.",
      "evidence": [
        "scripts/credential-witness.mjs wrote a real report from inside the child on every probe I ran; its envNames, env and probes fields are what CR-B-001 and CR-B-002 assert on.",
        "Example capture: 'child envNames: [\"GH_CONFIG_DIR\",\"GIT_CONFIG_GLOBAL\",\"GIT_CONFIG_NOSYSTEM\",\"GIT_CONFIG_SYSTEM\",\"HOME\",\"PATH\",\"TIPHYS_PROBE_SECRET\",\"XDG_CONFIG_HOME\"]'.",
        "The probe is what caught CR-B-001: it reported gh-configuration 'resolvable' and verdict 'red' on a spawn the kernel returned ok true for, which is exactly the property this criterion exists for.",
        "Read src/gates/credentials.ts:678 to :697: the shipped gate builds its OWN environment with no extension and probes the construction, so it cannot see a real spawn, which is the distinction the criterion draws."
      ],
      "met": true
    },
    {
      "id": "M4-P8-6",
      "quote": "The spawn refuses when the environment the adapter reports launching with differs from the environment the kernel handed it. Compared by NAME SET, recorded in meta.json.",
      "evidence": [
        "Met on the completed-plus-evidence-ok arm: probes/widen-incomplete.mjs completed arm refuses with 'added LEAKED_SECRET' and records handover {status compared, added [LEAKED_SECRET]} plus a refusal string in meta.json.",
        "NOT recorded on the incomplete arm: same adapter, same widening, same leak into the child, meta.credentials carries no handover key at all.",
        "NOT recorded on the failed-completion-precondition arm either, although the adapter reported an honest launchedEnvNames and the kernel had both sets in hand (probes/widen-noevidence.mjs). Recorded as CR-B-003.",
        "Defeated on the arm where it does run by an adapter that changes a VALUE and not a NAME: probes/home-revert.mjs, spawn ok true, handover recorded as compared with empty lists, child HOME /root, child gh-configuration resolvable. Recorded as CR-B-001."
      ],
      "met": false
    },
    {
      "id": "M4-P8-7",
      "quote": "PROTOTYPE-DEPENDENT. The name list from step 1, each with its reason, is recorded in the work history with the captured probe output that established it, and the count in meta.json equals the count in the work history.",
      "evidence": [
        "READ, not re-run. delivery/work-history/m4-p8.md:110 carries the four-arm table with captured HTTP codes (arm A 403, arm B 200 with HTTPS_PROXY, arm C 200 with CURL_CA_BUNDLE added, arm D refused) and arm D's verbatim refusal with the ls output showing nothing was created. The name list is one name.",
        "I did NOT re-run the network measurement: outbound HTTPS here goes through an agent proxy that substitutes credentials (CLAUDE.md standing warning 6), so a re-measurement would be a different measurement rather than a confirmation.",
        "Reported as read rather than as verified by re-execution, which is why this entry says so explicitly."
      ],
      "met": true
    }
  ],
  "deviations-judged": [
    {
      "deviation": "M4-P3 deviation 1: the phase declaration delivery/plan/phase-declarations/m4-p3.json did not exist on main, contrary to the dispatch brief, so the implementer created it from the plan's own files-to-touch list.",
      "serves-plan-intent": true,
      "reasoning": "The plan lists the file as files-to-touch (create) and the brief was wrong about main. The scope gate reads the declaration from the merge base (src/gates/scope.ts:877) and reddens without it, so creating it was the only way to make the gate satisfiable. The implementer stated the consequence, that the branch's scope gate stays red until the orchestrator lands it on main, rather than working around it."
    },
    {
      "deviation": "M4-P3 deviation 2: criterion 7 cites eleven vendor tokens the intake does not name and a four-hit baseline no token set reproduces, so the implementer implemented the intent with a declared constant, asserted the hit set BY NAME, and added a separate named branch-prefix baseline.",
      "serves-plan-intent": true,
      "reasoning": "The substituted form is stronger than the criterion as written. It derives the file set at run time rather than listing it, asserts a named set rather than a count, and carries a non-vacuity control. Pinning four would have been a claim about every future phase, which is the rule-5 failure mode. The implementer did not improvise a different criterion and raised the plan-text revision with the orchestrator. The plan text should be revised to match."
    },
    {
      "deviation": "M4-P8 deviations 1 to 3: three scope-declaration entries added at the head, src/commands/spawn.ts, test/spawn.test.ts and test/credentials-gate.test.ts.",
      "serves-plan-intent": true,
      "reasoning": "All three are forced by the plan's own steps rather than chosen. Step 2 makes payloadClass required with no default, which makes every call site a compile error, and the CLI is the only production one; the two test files over-assert on a document this phase extends (a pinned meta key set) and drive spawnTask through the library seam with allowPrCredentials. Head amendments are legal since M3-P11 (src/gates/scope.ts:110) and are printed by name for sign-off, which is what happened."
    }
  ]
}
```
