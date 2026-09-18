# Clean-room final sweep, CRITERIA contract: credential, execution and the audited credential route

- subject: the FINAL state of milestone M4 at `ad2428b76ef6f53f75b0d7f94c7db50463e077b7`
- group: credential, execution and the audited credential route (spawn, task, exec, adapters)
- paths: src/spawn.ts, src/task.ts, src/exec/env.ts, src/adapters/load.ts, src/gates/credentials.ts, src/hooks.ts
- phases walked: M4-P2, M4-P3, M4-P4, M4-P8, M4-P24
- review-contract: `criteria`. framing: `criteria-contract`. produced-by: Claude Opus (Anthropic).
- verdict: **FIX-ROUND-NEEDED**
- decisions governing: DR-0047 (one sweep at the final state), DR-0012 (dual
  cross-family review), DR-0027 (severity is reachability), DR-0039 (release
  verification may hold a credential the orchestrator never shares).

**Declared deviation from the one-head-one-phase shape.** The JSON verdict carries
`"phase": "M4-P2"` because the schema takes one phase id and this group spans five.
Every phase actually covered is named above and every criterion walked below carries
its phase in its id (`M4-P2-2`, `M4-P8-6`, and so on). This is declared here so it is
auditable rather than discovered.

---

## 1. Environment, and the complete sentence for every suite result

Read-only clone of `/home/user/tiphys-ai-helmsman`, detached at
`ad2428b76ef6f53f75b0d7f94c7db50463e077b7`. Nothing was pushed and nothing was
committed. Toolchain `/tmp/claude-0/n26/bin` first on PATH; `node --version` was
checked in the shell that ran each command and reported **v26.6.0** every time.

```
npm ci        exit 0
npm run build exit 0
git status --porcelain after build: EMPTY
```

**The complete sentence for the suite.** Invocation `npm test` (which is
`node --test "test/**/*.test.ts"`), interpreter node v26.6.0, `dist/` BUILT,
repository clone under `/tmp/claude-0/.../clone`:

```
tests 1341
pass  1339
fail  2
skipped 0
duration_ms 423038.683111
exit 1
```

**Both failures are environment- or load-dependent and neither is in this group.
Both were re-run in isolation at the same head, same interpreter, same build
state, and both pass.**

| test | file | full-suite | isolated re-run |
|---|---|---|---|
| `a precondition command exiting nonzero is error, not a skip, ...` | test/gates.test.ts:3571 | FAIL | `tests 1, pass 1, fail 0, skipped 0` |
| `two single passes released together surface one turn-end` | test/watcher.test.ts:1517 | FAIL | `tests 1, pass 1, fail 0, skipped 0` |

The first failure's message is the one the test itself writes for this case:

```
gate p11-attr wrote no record at /tmp/tiphys-gates-SjSHcX/evidence-attr-after-flag/p11-attr/result.json;
the run itself did not reach a verdict, which is an environment failure rather than a wrong verdict.
exit=21 stderr=tiphys gates run: the gate runner failed: Cannot find module 'ajv/dist/2020.js';
Require stack: - .../clone/src/validate.ts
```

**This closes an open item rather than raising a new one.**
delivery/work-history/credential-route-fixes.md:1118 records an intermittent
failure observed TWICE and explicitly not explained, with the failing test NAME
lost to `tail -12`, and names test/gates.test.ts:3558 (`readGateRecord`'s
`assert.fail`) as the LEAD. That is exactly the site that failed here, and the
name is now captured. Measured cause, stated only as far as it was measured:
`runCliUnprivileged` drops to an unprivileged uid and `grantTraversalWhenUnderTmp`
(test/gates.test.ts:3517) opens the `/tmp/claude-0` traversal chain; `stat -c %a
/tmp/claude-0` read **700** before my isolated run and **755** after it, so the
grant's effect does not persist for the duration of a seven-minute suite run in
this container. What is NOT established: what reverts it, and whether the same
mechanism explains the watcher failure. Naming one cause would be the over-claim
the claim grep exists to catch.

**The group's own test files are green.** Invocation
`node --test test/payload-credentials.test.ts test/adapter-load.test.ts
test/spawn.test.ts test/credentials-gate.test.ts test/next.test.ts`, node
v26.6.0, `dist/` built: `tests 86, pass 86, fail 0, skipped 0`.

`node src/gates/credentials.ts credential-scrub` exits 0 and writes
`status: green, units: 7, unitLabel: "credential sources probed"`.

---

## 2. What I tried to break, and what HELD

An APPROVE with no findings is a failed review; so is a FIX-ROUND-NEEDED that
does not say what survived. Everything in this section was RUN, not reasoned.

### 2.1 The two HIGH findings already fixed on `claude/credential-route-fixes`

I was asked to judge the fixes rather than re-find the instances.

**CR-B-002 (an extension whose reason is ABSENT was never refused). The fix
HOLDS, and it holds for all three shapes of `!usable`.** Measured through
`checkCredentialPolicy` (the audited route) at this head:

```
"MY_VAR"                                  -> refused: ... carries no reason field at all
{"name":"MY_VAR"}                         -> refused: ... carries no reason field at all
{"name":"MY_VAR","reason":"  "}           -> refused: ... carries a blank reason ("  ")
{"name":"MY_VAR","reason":"measured: needed"} -> ACCEPTED
refuseExtraAllowlist(["MY_VAR"], "reason-optional") -> ACCEPTED   (the library seam, by design)
```

The mechanism is closed at the layer the finding named: `refuseExtraAllowlist`
now computes a positive `usable` predicate (src/exec/env.ts:253) and branches on
`!usable`, so absent, blank and non-string all reach the refusal by different
routes and the message says which. The `reason-optional` arm is a deliberate,
documented weakening of `buildChildEnv` only, and the audited route passes
`reason-required` explicitly rather than by default (src/spawn.ts:338).

**CR-B-001 (compareHandover asserted a clean handover while comparing name sets
only). The fix HOLDS against the instance the finding named.** Control arm: an
adapter that keeps the name set byte-identical and only puts `HOME` and
`XDG_CONFIG_HOME` back to the real paths, and that invokes the kernel's hook:

```
spawn ok: false
reason: the reverter adapter launched with an environment that differs from the one the
        kernel handed it; the credential-store pointer(s) HOME, XDG_CONFIG_HOME did not
        have the harness-owned value the kernel handed over, observed child-side
meta.credentials.handover: {"status":"compared","added":[],"removed":[],
        "changedRedirections":["HOME","XDG_CONFIG_HOME"],"redirectionSource":"child"}
```

**The mechanism is NOT closed.** See finding CR-F-CRED-001: one variable changed
(the adapter writes the turn-end record itself instead of invoking the hook) and
the same leak returns with the record asserting it is clean.

### 2.2 Every credential refusal fires before third-party code is evaluated

This is the composition of M4-P8 step 5 with M4-P4's loader, and it is the single
most important thing in the group that held. A project-clone module that drops a
sentinel on import was set as `adapterSpecifier`; the sentinel proves EVALUATION,
not merely resolution.

```
payloadClass ABSENT:              ok=false sentinelEvaluated=false taskdir=false
payloadClass unrecognised:        ok=false sentinelEvaluated=false taskdir=false
project + allowPrCredentials:     ok=false sentinelEvaluated=false taskdir=false
extension with no reason:         ok=false sentinelEvaluated=false taskdir=false
extension naming GH_TOKEN:        ok=false sentinelEvaluated=false taskdir=false
```

Five refusals, five arms, nothing evaluated and nothing created. `spawnTask`
calls `checkCredentialPolicy` at src/spawn.ts:950, before `selectAdapter`, and
that ordering is load-bearing rather than tidy.

### 2.3 The default scrub, witnessed from inside the child

A real `GH_TOKEN` and a real `HTTPS_PROXY` were placed in the parent, then a
project payload was launched whose command IS `scripts/credential-witness.mjs`:

```
spawn ok: true
meta.credentials: {"payloadClass":"project","scrubMode":"scrubbed","extensions":[],
  "handover":{"status":"compared","added":[],"removed":[],"changedRedirections":[],
  "redirectionSource":"child"}}
CHILD envNames: ["GH_CONFIG_DIR","GIT_CONFIG_GLOBAL","GIT_CONFIG_NOSYSTEM",
                 "GIT_CONFIG_SYSTEM","HOME","PATH","XDG_CONFIG_HOME"]
CHILD verdict: green
CHILD GH_TOKEN present: false
CHILD HTTPS_PROXY present: false
```

The assertion is on a file the CHILD wrote, which is what M4-P8 criterion 5 asks
for and what DR-0039 condition 4 requires.

### 2.4 The extension vocabulary, probed name by name

```
GH_TOKEN             -> REFUSED      GITHUB_TOKEN         -> REFUSED
NODE_OPTIONS         -> REFUSED      GIT_CONFIG_KEY_0     -> REFUSED
HTTPS_PROXY          -> ACCEPTED     SSH_AUTH_SOCK        -> ACCEPTED
AWS_SECRET_ACCESS_KEY-> ACCEPTED     ANTHROPIC_API_KEY    -> ACCEPTED
```

The two walked vocabularies `refuseExtraAllowlist` consults both work. The third
(`EGRESS_ENV_VOCABULARY`) is deliberately not consulted; see CR-F-CRED-003.

### 2.5 Adapter selection, all the positive arms

Real `tiphys spawn` runs against a scratch fleet, reading
`tasks/<id>/executor.json`:

```
both roots present, --adapter both-adapter -> exit 0, record.adapter = fleet-home-copy
no flag, no fleet field                     -> exit 0, record.adapter = subprocess
fleet-home tiphys.adapter field only        -> exit 0, record.adapter = fleet-home-copy
flag + fleet field                          -> exit 0, record.adapter = flag-wins
bare specifier present only in project clone-> exit 1, MODULE_NOT_FOUND,
                                               sentinel NOT evaluated, no task dir
```

M4-P4 criteria 1, 3 and 6 hold at this head, measured rather than read.

---

## 3. Findings

### CR-F-CRED-001 (MEDIUM). An adapter that writes the turn-end record itself defeats the pointer comparison, and `meta.json` then asserts `redirectionSource: "child"` about an observation no child made

**Reproduced.** Two arms differing in ONE variable: whether the adapter invokes
`request.hookPath` or writes `tasks/<id>/turn-end` itself. Both revert `HOME` and
`XDG_CONFIG_HOME` to the parent's real values for the payload. A real gh store
was planted at the real `$HOME/.config/gh/hosts.yml`.

Arm E, the control, invokes the hook:

```
spawn ok: false
handover: {"status":"compared","changedRedirections":["HOME","XDG_CONFIG_HOME"],
           "redirectionSource":"child"}
```

Arm D, the finding, never invokes the hook and writes the turn-end record itself
carrying the values the kernel HANDED it:

```
spawn ok: true
meta.credentials: {"payloadClass":"project","scrubMode":"scrubbed","extensions":[],
  "handover":{"status":"compared","added":[],"removed":[],"changedRedirections":[],
  "redirectionSource":"child"}}
PAYLOAD HOME: /tmp/probe-cred2-cGk6Aw/realhome
PAYLOAD verdict: red
PROBE gh-configuration resolvable credential store reachable from inside the child
      environment: /tmp/probe-cred2-cGk6Aw/realhome/.config/gh/hosts.yml (49 bytes)
```

**The mechanism.** `turnEndEvidence` (src/spawn.ts:763) reads
`tasks/<id>/turn-end` and treats its `env` object as a CHILD-WRITTEN observation.
Nothing authenticates that file. The adapter is handed `hookPath`
(src/spawn.ts:1236), the turn-end path sits beside it, and the hook script is a
readable generated file that names its own output path as a literal
(src/hooks.ts:91). So the adapter can produce a record indistinguishable from the
kernel's own.

**What is new, stated narrowly so it is not confused with declared residue.**
That a dishonest adapter is not caught IS declared
(delivery/work-history/m4-p8.md item 3). Two things are not.

1. **The cost argument in src/hooks.ts:46-57 is refuted by measurement.** It says
   an adapter that reverted `HOME` for the payload "has to revert it for the
   payload and NOT for the hook, which means launching two children with two
   different environments and is a substantially different act". The cheaper act
   is ONE child plus a `writeFileSync`, which is strictly LESS work than the
   honest path, not more. The fix round's own not-covered item 3
   (delivery/work-history/credential-route-fixes.md:1356) names only the
   two-children variant. A prose claim a probe refutes is how the next reader
   re-derives the defect, which is this repository's own words for this shape.
2. **`redirectionSource: "child"` is a FALSE provenance claim in arm D.** The
   same comment defends the word by saying it is "a statement about where the
   observation came from rather than claiming the adapter was honest". In arm D
   that statement is wrong: the observation came from the adapter. This is
   CR-B-001's own mechanism, "a record whose status word is stronger than the
   check behind it", recurring one level up in the same record.

**Why MEDIUM and not HIGH, said plainly so the arbitration can disagree.**
CR-B-001 was graded HIGH for the same harm with an HONEST adapter. Here the
adapter must be actively dishonest, and "a dishonest adapter is not caught" is
declared. I am grading the FALSE RECORD and the REFUTED COST ARGUMENT, not the
leak. A reviewer who weights the positive assertion in `meta.json` as heavily as
CR-B-001's arbitration did would grade this HIGH, and I would not argue hard.

**Concrete fix.** Make the record say only what it can support, and stop the
value from being free. Two edits, either of which alone helps:
(a) have `writeTurnEndHook` bake a per-task nonce into the generated hook, write
it into the record, and have `turnEndEvidence` accept `observed` as
`source: "child"` only when the nonce matches; a record without it becomes
`source: "adapter"`, which already exists as a weaker value and already flows
into `redirectionSource`;
(b) failing that, withdraw the cost sentence at src/hooks.ts:46-57 and rename the
value so the record cannot read as provenance the kernel verified (for instance
`turn-end-record` rather than `child`), and say in `CredentialHandoverRecord`
that the turn-end record is adapter-reachable.

### CR-F-CRED-002 (MEDIUM). A path-shaped `--adapter` specifier evaluates project-clone code inside the orchestrator process; M4-P4 criterion 2's dangerous state is reachable and the loader's module comment says it is not

**Reproduced at this head.** This is CR-B-004, raised as MEDIUM by
delivery/review/clean-room-retro-B-criteria.md:284 and judged NOT CLOSED by
delivery/work-history/credential-route-fixes.md:653. I re-measured rather than
carrying the claim. A module in the PROJECT CLONE drops a sentinel on import:

```
ARM: bare specifier (criterion 2)     exit=1  MODULE_NOT_FOUND
   SENTINEL (module evaluated) = false   task dir created = false
ARM: absolute path specifier          exit=1  executor launch failed: probe
   SENTINEL (module evaluated) = TRUE    task dir created = false
ARM: fleet-home-relative "./projects/demo/evil.mjs"   exit=1
   SENTINEL (module evaluated) = TRUE    task dir created = false
```

**The composition defect, which is what this sweep is for.** M4-P4 criterion 2
is MET: it is written about a BARE specifier in the project clone's
`node_modules`, and that arm refuses without evaluating. The criterion's stated
DANGEROUS STATE is wider than the criterion: "a project clone under review
supplying the code that runs in the orchestrator's own process". That state is
reachable. `createRequire(fleet.packageJsonPath).resolve` roots BARE lookups at
the fleet home and constrains a path-shaped specifier not at all; the project
clone lives BELOW the fleet home at `<fleet>/projects/<name>`, so a fleet-relative
path reaches it.

src/adapters/load.ts:24 then states, without qualification, "resolution is rooted
at `<fleet home>/package.json` and NOTHING here ever consults the project clone,
the kernel's own checkout, or `process.cwd()` at the moment of the import". The
measurement above refutes that as a whole-module claim. The process this runs in
is the one DR-0012 delegates merge authority to.

**Concrete fix.** In `loadAdapter`, before `requireFromFleet.resolve`, refuse a
specifier that is path-shaped (`isAbsolute(specifier)` or it begins `./` or
`../`) unless the resolved real path is inside the fleet home AND outside
`<fleet>/projects/`, with a reason naming the resolved path and the project tree.
Both halves are needed: an absolute specifier can point anywhere, and a relative
one can walk down into `projects/`. If the owner decides an operator-typed
absolute specifier must stay allowed, that is a decision record, and the module
comment must be narrowed to "bare specifiers" either way, because a comment
asserting a property the code does not have is what this repository keeps paying
for.

### CR-F-CRED-003 (LOW). The audited-route refusal consults two of the three walked vocabularies, so the one name measured as the 403-to-200 difference crosses into a project payload, and nothing in `src/` ever reads the record back

**Reproduced.** A project payload with
`extraAllowlist: [{name: "HTTPS_PROXY", reason: "probe: reviewer test"}]`:

```
spawn ok: true
meta.credentials.extensions: [{"name":"HTTPS_PROXY","reason":"probe: reviewer test"}]
CHILD HTTPS_PROXY value: http://127.0.0.1:35835
CHILD verdict: red
```

The value the child received is this container's real agent proxy.
delivery/work-history/m4-p8.md:116 measured that exact name as arm A HTTP 403
against arm B HTTP 200 from `api.github.com/user` inside a scrubbed child, and
CLAUDE.md standing warning 6 records that this proxy substitutes real credentials
outbound. So the name buys reach that no token variable had to cross for.

**This is declared residue, and I am raising what the declaration does not
cover.** `EGRESS_ENV_VOCABULARY`'s comment (src/gates/credentials.ts:202) states
that the gate cannot see a per-invocation extension and explains why
`isDangerousEnvName` was deliberately left unchanged. CR-B-005 (LOW) names the
`meta.json` half. What neither says is that the record is **write-only**:
`grep -rn` over `src/` finds no reader of `credentials.extensions` outside the
writer, there is no task-meta schema (`ls schemas/` has no entry for it, and
delivery/work-history/credential-route-fixes.md:1356 item 5 confirms `meta.json`
is unvalidated), and no gate in `gate-registry.yaml` asserts on it. The audited
half of the audited route is therefore a free-text sentence nothing checks. The
child-side tripwire DOES fire (`CHILD verdict: red`, egress source `resolvable`),
but only when the payload happens to BE the witness script, which no real agent
payload is.

**Concrete fix.** Cheapest useful edit: have `spawnTask` set a boolean on the
credential record when any extension name satisfies `isEgressEnvName`, and add a
`gates.manifest.json` gate that walks `tasks/*/meta.json` and reddens on an
egress extension whose reason is shorter than some floor or absent from a
declared register. That is a real check on the record rather than a reading aid,
and it closes the half the `credential-scrub` gate structurally cannot see.

### CR-F-CRED-004 (LOW). `SSH_AUTH_SOCK` is accepted by the audited route and greens the environment tripwire, although it is the ssh agent channel and `SSH_ASKPASS` from the same walk is refused

**Partly reproduced, and the unverified half is named.** Measured behaviour:

```
refuseExtraAllowlist([{name:"SSH_AUTH_SOCK", reason:"probe"}], "reason-required") -> ACCEPTED
probeCredentialSources({PATH, HOME, SSH_AUTH_SOCK}) environment source ->
  {"outcome":"clean","detail":"3 variable(s), all inside the constructed contract,
   no gh token, no walked-vocabulary variable and no walked proxy variable"}
```

`DANGEROUS_ENV_VOCABULARY` (src/gates/credentials.ts:183) declares its ssh row as
walked from `ssh(1)` and `ssh-add(1)` and lists `SSH_ASKPASS` alone.
`SSH_AUTH_SOCK` is the agent socket, which is a signing capability rather than a
password prompt, so it is the stronger of the two.

**What I could NOT verify, stated rather than asserted.** This container has no
`ssh` binary and no `man` page (`ssh -V` -> command not found; `man 1 ssh`
returns nothing), so I could not confirm from `ssh(1)` itself that
`SSH_AUTH_SOCK` sits in the same documented ENVIRONMENT section the walk claims
to have covered. I am raising it as an open question with the measured behaviour
attached, not as a confirmed gap in the walk. It matters because
MECHANISMS.md permits a denylist only when it DERIVES from a closed documented
vocabulary and publishes the walk; an incomplete walk weakens that permission
even where the allowlist still holds the line.

**Concrete fix.** Re-run the ssh(1) walk on a machine that has the page, and
either add `SSH_AUTH_SOCK` to `DANGEROUS_ENV_VOCABULARY` or record in the
per-name comment why it was walked past.

---

## 4. Criterion walk

`met` is about the FINAL state at `ad2428b`, not about the phase head. Evidence is
what I RAN or READ.

### M4-P2 (`launch` becomes async, completion becomes checked)

| id | verdict | how |
|---|---|---|
| M4-P2-1 | MET | `npm run build` exit 0; `git status --porcelain` empty afterwards. |
| M4-P2-2 | MET | test/spawn.test.ts and test/payload-credentials.test.ts green; read src/spawn.ts:1388-1413, the `!evidence.ok` arm returns `ok:false` naming the adapter and the turn-end reason and performs NO `rmSync`; the scrub-root removal at src/spawn.ts:1437 is reached only after `evidence.ok`. |
| M4-P2-3 | MET | `turnEndEvidence` (src/spawn.ts:763) has four distinct refusals, absent / unreadable / unparseable / wrongly-shaped, not an `existsSync`. Read and exercised through the green group suite. |
| M4-P2-4 | MET | src/spawn.ts:1259 covers a rejected promise with the "did not report whether the payload started" text and rolls nothing back; `launch-failed` at src/spawn.ts:1272 does roll back. Both arms are distinct in source and both are covered by the green test/spawn.test.ts. |
| M4-P2-5 | MET | Read `await runStepAsync(...)` at src/spawn.ts:1229; sentinel test green in test/spawn.test.ts. |
| M4-P2-6 | MET | RAN: `grep -n runStepAsync src/watcher.ts` -> lines 30 (import) and 861 (call); `grep -c` = 2; the only definition is `export async function runStepAsync` at src/task.ts:667. |
| M4-P2-7 | MET | RAN: "every spawn behavior resolves by name to a test in this file" and "every spawn behavior in the registry still resolves by name to a test title", both green. |
| M4-P2-8 | **NOT MET at the whole-suite level, met for the group** | `npm test` exits 1 with 1341/1339/2/0. Both failures are outside this group and both pass in isolation at this head (section 1). Recorded as not met rather than waved through, because "exit 0" is what the criterion says. |

### M4-P3 (the request contract widens)

| id | verdict | how |
|---|---|---|
| M4-P3-1 | MET | Read src/spawn.ts:82-145: `briefPath: string` non-optional; `role`, `declaredTier`, `phaseId` each `string \| undefined`. |
| M4-P3-2 | MET | Green test "an adapter requirement the spawn cannot meet refuses before a worktree, a branch, a task directory or a pool record exists". |
| M4-P3-3 | MET | Green test "an adapter requiring a field the request contract has no name for is refused as a contract defect, not as a missing value"; `checkAdapterContract` runs before `checkAdapterRequirements` at src/spawn.ts:984/991. |
| M4-P3-4 | MET | Green test "the launch record a real spawn wrote validates under --type executor-record, one missing adapter is refused naming the field". |
| M4-P3-5 | MET | Green test in test/schemas.test.ts:683 region (the `additionalProperties` dangerous-instance witness with the smuggled `model` field). |
| M4-P3-6 | MET | Green test "the launch record echoes the requested tier and role byte for byte from the flags". |
| M4-P3-7 | MET | RAN: `node --test --test-name-pattern=vendor test/schemas.test.ts` -> "no vendor model name appears in the kernel's shipped source, schemas, roles or configuration", 1 pass 0 fail 0 skipped. |
| M4-P3-8 | MET | Same behaviour-resolution tests as M4-P2-7. |
| M4-P3-9 | **PARTLY MET** | build exit 0 and clean; `npm ci` exit 0; the suite half fails for the reason under M4-P2-8. |

### M4-P4 (adapter selection and the public entry point)

| id | verdict | how |
|---|---|---|
| M4-P4-1 | MET | RAN a real `tiphys spawn --adapter`: `record.adapter = fleet-home-copy` and `flag-wins` in `tasks/<id>/executor.json`. |
| M4-P4-2 | MET **as written**, and its dangerous state is REACHABLE | Bare-specifier arm: exit 1, MODULE_NOT_FOUND naming the fleet home, sentinel NOT evaluated, no task dir. See CR-F-CRED-002 for the path-shaped forms. |
| M4-P4-3 | MET | RAN both roots present: `record.adapter = fleet-home-copy`. |
| M4-P4-4 | MET | Green test "a module that is not an adapter is refused before a worktree, a branch, a task directory or a pool record exists"; four shape refusals read at src/adapters/load.ts:248-294. |
| M4-P4-5 | MET | Green test "a loaded adapter claiming the built-in adapter name is refused and the built-in one still launches"; src/adapters/load.ts:295. |
| M4-P4-6 | MET | RAN three arms: `subprocess`, `fleet-home-copy`, `flag-wins`. |
| M4-P4-7 | MET | Green test "a consumer importing the executor contract from the package name type-checks and loads against the built dist", 0 skipped with `dist/` built. |
| M4-P4-8 | MET | Green test "the kernel entry point publishes the adapter contract and the exports map refuses every internal subpath"; RAN: `package.json` `exports` is `{".": {...}, "./package.json": ...}` with no wildcard. |
| M4-P4-9 | **PARTLY MET** | build, `git status`, `npm ci` all as stated; the suite half as under M4-P2-8. |

### M4-P8 (the credential path for an agent payload)

| id | verdict | how |
|---|---|---|
| M4-P8-1 | MET | `node --test test/payload-credentials.test.ts` inside the group run: all green, 0 skipped, node v26.6.0, `dist/` built. |
| M4-P8-2 | MET | RAN: `project + allowPrCredentials -> ok=false`, reason names both fields, no task dir, no worktree, adapter never evaluated. Green test covers the orchestrator direction. |
| M4-P8-3 | MET | RAN: `GH_TOKEN` and `NODE_OPTIONS` (and `GITHUB_TOKEN`, `GIT_CONFIG_KEY_0`) each refused with a reason naming the entry, by the two different halves of the vocabulary. |
| M4-P8-4 | MET, and STRONGER than written | `reason: ""` refused; and since the fix round an ABSENT reason is refused too, which is the CR-B-002 repair. Reason appears verbatim in `meta.json` (`{"name":"HTTPS_PROXY","reason":"probe: reviewer test"}`). |
| M4-P8-5 | MET | RAN a real spawn whose payload is `scripts/credential-witness.mjs` with a real `GH_TOKEN` in the parent: child-written report, `verdict: green`, `GH_TOKEN present: false`. |
| M4-P8-6 | **NOT MET at the final state** | The comparison exists and is stronger than "by NAME SET" (it now compares the five pointers by value), and it refuses correctly against the adapter that invokes the hook. It does NOT refuse against an adapter that writes the turn-end record itself, and the record then positively asserts a clean, child-sourced handover. Reproduced; CR-F-CRED-001. |
| M4-P8-7 | NOT REACHED | PROTOTYPE-DEPENDENT. The name list rests on a probe run in a specific container at a specific time; I did not re-run that probe and cannot confirm the count in a real task's `meta.json` equals the work history's, because no task from that probe survives at this head. Reported as not reached rather than guessed. |

### M4-P24 (the three loop gaps)

Only criteria 5 and 6 are inside this group's paths; 1 to 4 are
`src/commands/next.ts`, walked here because the phase is named.

| id | verdict | how |
|---|---|---|
| M4-P24-1 | MET | Green test "next exits 3 while an in-flight item exists and 0 only when every category is empty". |
| M4-P24-2 | MET | Green test "the next command source contains no absolute path literal". |
| M4-P24-3 | MET | Green tests for the squash-merged member and the landed-in-another-PR member, plus the undelivered control. Two structurally different members, which is the class rule. |
| M4-P24-4 | MET | Green test "next prints the whole cannot-see block and the same exit code when the network is unreachable". |
| M4-P24-5 | MET | Green tests "pr open and pr merge each exit nonzero with exactly one line when the credential is absent" and "the pull-request credential never reaches a kernel adapter child, probed from inside the child" (the probe is child-side, which is what DR-0039 condition 4 requires). |
| M4-P24-6 | MET | Green test "no kernel code path under src or bin names either plugin pull-request command"; RAN independently: `grep -rnE '"pr open"\|pr-open\|prOpen\|"pr merge"\|pr-merge' src/ bin/` -> no hits. |

---

## 5. Composition findings: defects visible only ACROSS phases

1. **CR-F-CRED-001 is a composition defect and could not have been found by a
   per-phase review.** M4-P8 shipped the name-set comparison. The credential-route
   fix round added the pointer comparison and the child-written hook. M4-P2, two
   phases earlier, made the turn-end record the completion precondition and put it
   at a path the adapter is told about. The three together create an artifact the
   kernel trusts for TWO different purposes and that the adapter can write. No
   single phase's diff shows that.
2. **CR-F-CRED-002 is a criterion that is narrower than the danger it names, and
   the gap widened after the phase landed.** M4-P4 criterion 2 tests a bare
   specifier. Nothing later narrowed the specifier grammar, and the module comment
   generalised the criterion's guarantee to the module.
3. **CR-F-CRED-003 is two correct carve-outs composing.** M4-P29 deliberately kept
   `EGRESS_ENV_VOCABULARY` out of `isDangerousEnvName` so that M4-P8's one audited
   extension would not be refused by a data edit in another file. M4-P8
   deliberately made the extension record data rather than a comment. Each is
   right. Together they permit the highest-capability name in this container to
   cross into a project payload with the only audit being a free-text sentence
   nothing reads.
4. **What did NOT compose badly, worth recording because I looked.** The refusal
   ORDER survived four phases of edits to `src/spawn.ts`: M4-P8's credential
   checks still run ahead of M4-P4's loader and M4-P3's contract checks, and all
   five refusal arms leave the adapter module unevaluated (section 2.2). The
   import cycle `src/exec/env.ts` <-> `src/gates/credentials.ts` that M4-P8
   created is still safe: nothing reads an imported binding at module-evaluation
   time, and both import orders are exercised by the green
   test/payload-credentials.test.ts.

---

## 6. Tuition shapes present again

- **T-008's postscript / the red-witness rule one level up (a guard whose
  condition does not test the property that matters).** CR-F-CRED-001: the
  pointer comparison tests a file the adversary can write.
- **T-005 (one mechanism, never a second).** HELD. `GH_TOKEN_VARIABLES` and
  `isDangerousEnvName` are imported by `src/exec/env.ts` rather than copied, and
  `runStepAsync` has exactly one definition.
- **T-003 lesson 4 (assertions anchored by real captured output).** HELD in the
  group's tests; and my own findings are anchored to captured runs rather than to
  reasoning.
- **T-006 (the over-claim that survives being documented).** Present again:
  src/hooks.ts:46-57's cost sentence and src/adapters/load.ts:24's
  "NOTHING here ever consults the project clone". Both are the exact shape the
  claim grep exists to catch, and both are inside `src/` where the grep, which
  runs over `delivery/work-history/`, cannot see them.
- **T-001 / T-007 (decorrelation).** The three assigned fields are set as
  instructed and I ran the criteria contract, not the hazard one.

---

## 7. What I did NOT reach, and why

1. **M4-P8 criterion 7** (the prototype-dependent name list). Not reached. I did
   not re-run the prototype probe and I did not establish whether it can be
   re-run from here; no task from that probe survives at this head, so the count
   join the criterion asks for had nothing to join against.
2. **macOS, and a second runner.** One platform, one interpreter, one day:
   Linux, node v26.6.0, in this container.
3. **The plugin package.** `packages/claude-code-plugin/` is outside the declared
   paths; M4-P24 criteria 5 and 6 were walked through the kernel's own tests only.
4. **CI arms.** I did not observe any GitHub Actions run. Everything here is
   local, so nothing in this document is evidence about the `push` arm (T-009).
5. **`SSH_AUTH_SOCK` against `ssh(1)`.** No ssh binary and no man page here; the
   documentation half of CR-F-CRED-004 is unverified and is labelled as such.
6. **The two suite failures' root cause.** The gates one is attributed to the
   traversal grant not persisting; what reverts `/tmp/claude-0` to 700 is not
   established, and the watcher failure is not explained at all.
7. **The credential boundary below the environment.** The whole group is an
   ENVIRONMENT boundary. A scrubbed child runs at the same uid and keeps read
   access to an absolute credential path, which delivery/work-history/m4-p8.md
   item 1 declares and nothing here changes.

## 8. Escalations

None requiring the owner. CR-F-CRED-002's fix has an owner-facing half (whether
an operator-typed absolute `--adapter` stays allowed) that the retro review
already flagged; the orchestrator can dispatch the fix round and raise that as a
decision record if the implementer needs it.

---

## 9. The verdict document, its validation, and the negative control on the instrument

The JSON verdict is at
`/tmp/claude-0/final-sweep/verdict-final-credential-criteria.json`.

```
$ node bin/tiphys.ts validate --type auto /tmp/claude-0/final-sweep/verdict-final-credential-criteria.json
SKIPPED dual-review-decorrelation no context
SKIPPED verdict-criteria-complete no context
SKIPPED verdict-deviations-judged no context
SKIPPED verdict-hazard-classes-addressed no context
SKIPPED verdict-pair-approves no context
exit=1
```

**Read that carefully, because the exit code is not what it looks like.** There
is NO `INVALID` line, so the SCHEMA half passed. The nonzero exit is the
documented behaviour of the Kind B mechanism: src/checks.ts:16 states that a
check needing a context it was not given prints `SKIPPED <id> no context` and
the command exits nonzero, precisely so a cross-document rule can never pass by
not running. `--type verdict` gives the identical result.

**The context cannot be supplied in this repository, and that is a fact rather
than an excuse.** `readVerdictPlanPhase` (src/checks.ts:2216) reads `plan.yaml`
from the context directory; `find . -name plan.yaml -not -path ./node_modules/*`
returns NOTHING at this head. The delivery plan is markdown
(`delivery/plan/kernel-plan-m4.md`), not a `plan.yaml` under
`schemas/plan.schema.json`. So the five Kind B checks are structurally
unreachable for any verdict about an M4 phase, and every verdict in this sweep
will exit 1 the same way. The orchestrator should expect that and not read it as
a malformed document.

### Negative control on my own instrument

A validator that cannot go red has told me nothing about my document. Three
fields were flipped, one at a time, each of which the schema should refuse:

```
head abbreviated to "ad2428b"
  INVALID #/head value "ad2428b" does not match the required pattern ^[0-9a-f]{40}$

verdict flipped to "APPROVE" while a medium finding is present
  INVALID # value does not satisfy the requirements its own shape triggers here
  INVALID #/verdict value "APPROVE" is not one of the permitted values "FIX-ROUND-NEEDED"

concrete-fix removed from findings[0]
  INVALID #/findings/0/concrete-fix required property concrete-fix is missing
```

All three red, each naming the field. The second is the one that matters most
here: it confirms the M4-P10 widening to `medium` is live, so my FIX-ROUND-NEEDED
is enforced by the schema and not only by my judgement.

### The three assigned fields, and the two grouping fields

```
"review-contract": "criteria"
"framing":         "criteria-contract"
"produced-by":     "Anthropic Claude (Opus family)"
"phase":           "M4-P2"
"head":            "ad2428b76ef6f53f75b0d7f94c7db50463e077b7"
```

I ran the CRITERIA contract as assigned. I did not run the hazard contract and I
did not silently swap. The head is the full forty lowercase hex digits, copied
rather than abbreviated.

## The JSON verdict, embedded rather than landed

This verdict reads FIX-ROUND-NEEDED. `check-dual-review` reads the TOP LEVEL of
`delivery/review/` non-recursively as its corpus, so landing this file there as its
own `verdict-*.json` would correctly turn that gate red. It is embedded here
instead, so the evidence lands without the gate reading it as a committed verdict.

```json
{
  "kind": "verdict",
  "phase": "M4-P2",
  "head": "ad2428b76ef6f53f75b0d7f94c7db50463e077b7",
  "verdict": "FIX-ROUND-NEEDED",
  "produced-by": "Anthropic Claude (Opus family)",
  "framing": "criteria-contract",
  "review-contract": "criteria",
  "findings": [
    {
      "id": "CR-F-CRED-001",
      "severity": "medium",
      "evidence": [
        "Reproduced, two arms differing in one variable. Arm D, an adapter that reverts HOME and XDG_CONFIG_HOME for the payload and writes tasks/<id>/turn-end ITSELF instead of invoking request.hookPath: spawn ok: true; meta.credentials.handover = {\"status\":\"compared\",\"added\":[],\"removed\":[],\"changedRedirections\":[],\"redirectionSource\":\"child\"}; the payload's own probe reports PAYLOAD HOME: /tmp/probe-cred2-cGk6Aw/realhome and gh-configuration resolvable, credential store reachable from inside the child environment: /tmp/probe-cred2-cGk6Aw/realhome/.config/gh/hosts.yml (49 bytes).",
        "Arm E, the control, identical revert but the adapter invokes the kernel hook: spawn ok: false, reason 'the reverter adapter launched with an environment that differs from the one the kernel handed it; the credential-store pointer(s) HOME, XDG_CONFIG_HOME did not have the harness-owned value the kernel handed over, observed child-side', changedRedirections: [\"HOME\",\"XDG_CONFIG_HOME\"].",
        "src/spawn.ts:763 turnEndEvidence reads tasks/<id>/turn-end and treats its env object as a child-written observation; nothing authenticates the file, and the adapter is handed hookPath at src/spawn.ts:1236, with the turn-end path beside it and named as a literal inside the generated hook at src/hooks.ts:91.",
        "src/hooks.ts:46 claims the attack 'means launching two children with two different environments and is a substantially different act'. Measured: the cheaper act is one child plus one writeFileSync, strictly less work than the honest path.",
        "delivery/work-history/credential-route-fixes.md:1356 item 3 declares only the two-children variant as uncovered residue."
      ],
      "concrete-fix": "Bake a per-task nonce into the generated hook in writeTurnEndHook (src/hooks.ts:99), write it into the turn-end record, and have turnEndEvidence accept observed as source 'child' only when the nonce matches; a record without it falls back to the existing weaker 'adapter' value, which already flows into redirectionSource. Failing that, withdraw the cost sentence at src/hooks.ts:46 and rename the value to 'turn-end-record' so the record cannot read as provenance the kernel verified, and state in CredentialHandoverRecord that the turn-end record is adapter-reachable.",
      "analysis": "This is CR-B-001's own mechanism, a record whose status word is stronger than the check behind it, recurring one level up inside the same record after CR-B-001 was fixed. That a dishonest adapter is not caught is declared residue; what is not declared is that meta.json POSITIVELY asserts redirectionSource 'child' about an observation no child made, and that the cost argument defending the design is refuted by measurement. Graded medium rather than high because the adapter must be actively dishonest, where CR-B-001's was honest; a reviewer weighting the false positive assertion as the arbitration did for CR-B-001 would grade this high and I would not argue hard against that."
    },
    {
      "id": "CR-F-CRED-002",
      "severity": "medium",
      "evidence": [
        "Reproduced at head ad2428b76ef6f53f75b0d7f94c7db50463e077b7. A module in the PROJECT CLONE drops a sentinel on import. Arm 'bare specifier': exit=1, MODULE_NOT_FOUND naming the fleet home, SENTINEL (module evaluated) = false, task dir created = false. Arm 'absolute path specifier': exit=1, SENTINEL (module evaluated) = TRUE. Arm 'fleet-home-relative ./projects/demo/evil.mjs': exit=1, SENTINEL (module evaluated) = TRUE.",
        "src/adapters/load.ts:24 states without qualification that 'NOTHING here ever consults the project clone, the kernel's own checkout, or process.cwd() at the moment of the import'. The two TRUE rows above refute that as a whole-module claim.",
        "src/adapters/load.ts:188 createRequire(fleet.packageJsonPath).resolve constrains BARE lookups only; the project clone lives below the fleet home at <fleet>/projects/<name>, so a fleet-relative path reaches it.",
        "M4-P4 criterion 2 in delivery/plan/kernel-plan-m4.md:625 names the DANGEROUS STATE as 'a project clone under review supplying the code that runs in the orchestrator's own process'. That state is reachable while the criterion as written is met.",
        "Previously raised as CR-B-004 at delivery/review/clean-room-retro-B-criteria.md:284 and judged NOT CLOSED at delivery/work-history/credential-route-fixes.md:653. Re-measured here rather than carried."
      ],
      "concrete-fix": "In loadAdapter (src/adapters/load.ts:183), before requireFromFleet.resolve, refuse a path-shaped specifier (isAbsolute(specifier), or one beginning './' or '../') unless the resolved real path is inside the fleet home AND outside <fleet>/projects/, with a reason naming the resolved path and the project tree. Both halves are needed: an absolute specifier can point anywhere and a relative one can walk down into projects/. Independently, narrow the module comment at src/adapters/load.ts:24 to say 'bare specifiers', because a comment asserting a property the code does not have is how the next reader re-derives the defect."
    },
    {
      "id": "CR-F-CRED-003",
      "severity": "low",
      "evidence": [
        "Reproduced. A project payload spawned with extraAllowlist [{name: 'HTTPS_PROXY', reason: 'probe: reviewer test'}]: spawn ok: true; meta.credentials.extensions = [{\"name\":\"HTTPS_PROXY\",\"reason\":\"probe: reviewer test\"}]; the child-written report shows CHILD HTTPS_PROXY value: http://127.0.0.1:35835, this container's real agent proxy.",
        "refuseExtraAllowlist consults GH_TOKEN_VARIABLES and isDangerousEnvName and NOT isEgressEnvName. Measured name by name through checkCredentialPolicy: GH_TOKEN REFUSED, GITHUB_TOKEN REFUSED, NODE_OPTIONS REFUSED, GIT_CONFIG_KEY_0 REFUSED, HTTPS_PROXY ACCEPTED.",
        "delivery/work-history/m4-p8.md:116 measured HTTPS_PROXY as the difference between HTTP 403 (arm A) and HTTP 200 (arm B) against api.github.com/user from inside a scrubbed child.",
        "The record is write-only: grep over src/ finds no reader of the credentials extension record outside its writer, ls schemas/ carries no task-meta schema, and delivery/work-history/credential-route-fixes.md:1356 item 5 records meta.json as unvalidated.",
        "The child-side egress tripwire does fire when probed directly (environment source outcome 'resolvable', detail 'network-egress variable(s) from the walked proxy vocabulary present in the child environment: HTTPS_PROXY'), but only when the payload IS scripts/credential-witness.mjs, which no real agent payload is."
      ],
      "concrete-fix": "Set a boolean on the credential record in spawnTask (src/spawn.ts:1130 region) when any extension name satisfies isEgressEnvName, and add a gate to gates.manifest.json that walks tasks/*/meta.json and reddens on an egress extension that is not in a declared register. That makes the audited half of the audited route a check rather than a free-text sentence, and it closes the half the credential-scrub gate structurally cannot see."
    },
    {
      "id": "CR-F-CRED-004",
      "severity": "low",
      "evidence": [
        "Measured: refuseExtraAllowlist([{name: 'SSH_AUTH_SOCK', reason: 'probe'}], 'reason-required') returns undefined, that is ACCEPTED.",
        "Measured: probeCredentialSources({PATH, HOME, SSH_AUTH_SOCK}) returns for the environment source {\"outcome\":\"clean\",\"detail\":\"3 variable(s), all inside the constructed contract, no gh token, no walked-vocabulary variable and no walked proxy variable\"}.",
        "src/gates/credentials.ts:183 declares the ssh row of DANGEROUS_ENV_VOCABULARY as walked from ssh(1) and ssh-add(1) and lists SSH_ASKPASS alone. SSH_AUTH_SOCK is the agent socket, a signing capability rather than a password prompt.",
        "NOT VERIFIED, and said so rather than asserted: this container has no ssh binary and no man page (ssh -V returns 'command not found'; man 1 ssh returns nothing), so I could not confirm from ssh(1) itself that SSH_AUTH_SOCK sits in the ENVIRONMENT section the walk claims to have covered."
      ],
      "concrete-fix": "Re-run the ssh(1) walk on a machine that has the manual page and either add SSH_AUTH_SOCK to DANGEROUS_ENV_VOCABULARY (src/gates/credentials.ts:183) or record in that constant's per-name comment why it was walked past, so the published walk stays complete for the program it names."
    }
  ],
  "criteria": [
    {
      "id": "M4-P2-1",
      "quote": "`npm run build` exits 0 and `git status` is clean afterwards.",
      "evidence": [
        "RAN npm run build, exit 0; git status --porcelain afterwards printed nothing."
      ],
      "met": true
    },
    {
      "id": "M4-P2-2",
      "quote": "Fabricated completion is refused (red witness 1). A test adapter that returns {kind: \"completed\", exitCode: 0} WITHOUT invoking hookPath makes spawnTask return ok: false with a reason naming the adapter name and the absent turn-end path; the task worktree still exists; the scrub root still exists and still contains its five redirect targets.",
      "evidence": [
        "READ src/spawn.ts:1388 to :1413: the !evidence.ok arm returns ok:false naming the adapter, the exit code and the turn-end reason, and performs no removal; the scrub-root rmSync at src/spawn.ts:1437 is reached only after evidence.ok.",
        "RAN node --test over test/spawn.test.ts and test/payload-credentials.test.ts: 86 tests, 86 pass, 0 fail, 0 skipped, node v26.6.0, dist built."
      ],
      "met": true
    },
    {
      "id": "M4-P2-3",
      "quote": "A turn-end file that exists but does not parse is also refused.",
      "evidence": [
        "READ src/spawn.ts:763 to :823: turnEndEvidence has four distinct refusals (absent, unreadable, unparseable, wrongly-shaped), not an existsSync, and each says which one it was. Exercised through the green group suite."
      ],
      "met": true
    },
    {
      "id": "M4-P2-4",
      "quote": "A rejected promise rolls nothing back (red witness 2).",
      "evidence": [
        "READ src/spawn.ts:1259: the !launched.ok arm carries the 'did not report whether the payload started' text and rolls nothing back; the structurally different counterpart, a RETURNED launch-failed, rolls back at src/spawn.ts:1272. Both arms are green in test/spawn.test.ts."
      ],
      "met": true
    },
    {
      "id": "M4-P2-5",
      "quote": "C-3 is witnessed, not asserted. A test adapter that resolves only after its payload has written a sentinel file makes spawnTask return after that sentinel exists.",
      "evidence": [
        "READ src/spawn.ts:1229: the launch goes through await runStepAsync. The sentinel test in test/spawn.test.ts is green in the group run."
      ],
      "met": true
    },
    {
      "id": "M4-P2-6",
      "quote": "The kernel exports exactly one async step runner: grep -c \"runStepAsync\" src/watcher.ts returns the import-site count only, and no function definition remains in that file.",
      "evidence": [
        "RAN grep -n runStepAsync src/watcher.ts: line 30 (import) and line 861 (call site); grep -c returns 2.",
        "RAN grep -rn 'function runStepAsync' src/: the single definition is src/task.ts:667."
      ],
      "met": true
    },
    {
      "id": "M4-P2-7",
      "quote": "test/spawn.test.ts's existing spawn behaviors all still resolve by name, derived from test/behaviors.json at run time and never from a pinned count.",
      "evidence": [
        "RAN: the tests 'every spawn behavior resolves by name to a test in this file' and 'every spawn behavior in the registry still resolves by name to a test title' both pass."
      ],
      "met": true
    },
    {
      "id": "M4-P2-8",
      "quote": "node --test exits 0 and reports N tests with N greater than 0, quoting invocation, interpreter, build state, pass count and skipped count.",
      "evidence": [
        "RAN npm test (node --test \"test/**/*.test.ts\"), interpreter node v26.6.0, dist/ BUILT, clone under /tmp/claude-0: tests 1341, pass 1339, fail 2, skipped 0, exit 1.",
        "The two failures are test/gates.test.ts:3571 and test/watcher.test.ts:1517, neither in this group, and both pass in isolation at the same head, same interpreter, same build state (1 test, 1 pass, 0 fail, 0 skipped each).",
        "The gates failure is the site delivery/work-history/credential-route-fixes.md:1118 named as a lead for its unexplained intermittent failure; stat -c %a /tmp/claude-0 read 700 before the isolated run and 755 after it, so the test's own traversal grant does not persist across a full suite run in this container."
      ],
      "met": false
    },
    {
      "id": "M4-P3-1",
      "quote": "ExecutorRequest carries briefPath: string, and role, declaredTier and phaseId, each string | undefined. briefPath is NOT optional.",
      "evidence": [
        "READ src/spawn.ts:82 to :145: briefPath is a non-optional string; role, declaredTier and phaseId are each string | undefined."
      ],
      "met": true
    },
    {
      "id": "M4-P3-2",
      "quote": "A declared requirement that is unmet creates nothing (red witness 1).",
      "evidence": [
        "RAN the green test 'an adapter requirement the spawn cannot meet refuses before a worktree, a branch, a task directory or a pool record exists'."
      ],
      "met": true
    },
    {
      "id": "M4-P3-3",
      "quote": "A requirement naming a field that does not exist is refused at load, not at launch (red witness 1, second member).",
      "evidence": [
        "RAN the green test 'an adapter requiring a field the request contract has no name for is refused as a contract defect, not as a missing value'.",
        "READ src/spawn.ts:984 and :991: checkAdapterContract runs before checkAdapterRequirements, which is what keeps the two answers distinct."
      ],
      "met": true
    },
    {
      "id": "M4-P3-4",
      "quote": "tiphys validate --type executor-record <file> exits 0 on a record subprocessAdapter actually wrote, and exits nonzero naming the field on a record missing adapter.",
      "evidence": [
        "RAN the green test 'the launch record a real spawn wrote validates under --type executor-record, one missing adapter is refused naming the field, and --type auto cannot resolve it'."
      ],
      "met": true
    },
    {
      "id": "M4-P3-5",
      "quote": "Kind A dangerous-instance witness on the schema. The schema's additionalProperties: false is removed, a record carrying an undeclared model field is accepted, and the keyword is restored and the same record refused.",
      "evidence": [
        "READ test/schemas.test.ts:683 to :700, which stages the removal and restores it around a smuggled { ...record, model: \"some-vendor-model\" }; the file is green in the full suite run."
      ],
      "met": true
    },
    {
      "id": "M4-P3-6",
      "quote": "ExecutorRecord carries requestedTier and requestedRole copied VERBATIM from the request, and a test asserts byte equality between the flag value and the recorded value.",
      "evidence": [
        "RAN the green test 'the launch record echoes the requested tier and role byte for byte from the flags'."
      ],
      "met": true
    },
    {
      "id": "M4-P3-7",
      "quote": "grep -rniE '<the eleven vendor tokens named in the intake>' src/ bin/ schemas/ roles/ *.yaml returns the same four hits as before this phase, and the count is asserted by a TEST rather than by a grep in a work history.",
      "evidence": [
        "RAN node --test --test-name-pattern=vendor test/schemas.test.ts: 'no vendor model name appears in the kernel's shipped source, schemas, roles or configuration', tests 1, pass 1, fail 0, skipped 0."
      ],
      "met": true
    },
    {
      "id": "M4-P3-8",
      "quote": "Every pre-existing spawn-* behavior in test/behaviors.json still resolves by name. Counts are derived at run time, never pinned.",
      "evidence": [
        "RAN the same two behaviour-resolution tests cited for M4-P2-7; both green."
      ],
      "met": true
    },
    {
      "id": "M4-P3-9",
      "quote": "npm run build exits 0, git status clean, and node --test exits 0 reporting N tests, N greater than 0, with invocation, interpreter, build state, pass count and skipped count quoted.",
      "evidence": [
        "Build and git status halves met (exit 0, empty porcelain). The suite half is not met for the reason recorded under M4-P2-8; the two failures are outside this group and pass in isolation."
      ],
      "met": false
    },
    {
      "id": "M4-P4-1",
      "quote": "tiphys spawn --adapter <specifier> ... resolves the specifier with Node module resolution rooted at the FLEET HOME. Witnessed by a real spawn against a scratch fleet, with the loaded adapter's name appearing in tasks/<id>/executor.json.",
      "evidence": [
        "RAN a real tiphys spawn against a scratch fleet: exit 0 and tasks/<id>/executor.json carried adapter = 'fleet-home-copy', and in a second arm adapter = 'flag-wins'."
      ],
      "met": true
    },
    {
      "id": "M4-P4-2",
      "quote": "The project clone is not a resolution root (red witness 1). ... tiphys spawn --adapter evil-adapter exits nonzero naming the fleet home as the resolution root, creates no task directory, and the module is never evaluated.",
      "evidence": [
        "RAN the bare-specifier arm: exit 1, message names the fleet home as 'the ONLY resolution root the kernel uses for adapters', MODULE_NOT_FOUND, sentinel NOT written, no task directory. The criterion as written holds.",
        "The criterion's stated DANGEROUS STATE is wider than the criterion and IS reachable: an absolute path specifier and a fleet-home-relative one both evaluated project-clone code (sentinel written). Raised as CR-F-CRED-002 rather than marking this criterion unmet, because the criterion's own test is the bare form."
      ],
      "met": true
    },
    {
      "id": "M4-P4-3",
      "quote": "Both roots present, the fleet home wins (red witness 1, second member, and the SILENT one).",
      "evidence": [
        "RAN a scratch fleet with the same adapter package name installed in BOTH the fleet home and the project clone, with different name values: exit 0 and tasks/<id>/executor.json carried adapter = 'fleet-home-copy'."
      ],
      "met": true
    },
    {
      "id": "M4-P4-4",
      "quote": "A module that is not an adapter is refused before anything is created. Three shapes, each asserted.",
      "evidence": [
        "RAN the green test 'a module that is not an adapter is refused before a worktree, a branch, a task directory or a pool record exists'.",
        "READ src/adapters/load.ts:248 to :294: no module object, no default export, a non-object default, no launch member, a non-function launch, and a fourth declared check on a usable name."
      ],
      "met": true
    },
    {
      "id": "M4-P4-5",
      "quote": "An adapter claiming the name subprocess is refused.",
      "evidence": [
        "RAN the green test 'a loaded adapter claiming the built-in adapter name is refused and the built-in one still launches'; READ src/adapters/load.ts:295."
      ],
      "met": true
    },
    {
      "id": "M4-P4-6",
      "quote": "The default is explicit in the record, not silent. ... Three arms, one assertion each.",
      "evidence": [
        "RAN all three arms against a scratch fleet: no flag and no field gave executor.json adapter = 'subprocess'; a fleet-home tiphys.adapter field alone gave 'fleet-home-copy'; flag plus field gave 'flag-wins'."
      ],
      "met": true
    },
    {
      "id": "M4-P4-7",
      "quote": "@tiphys/kernel exposes ExecutorAdapter, ExecutorRequest, ExecutorRecord and LaunchOutcome through exports, and a test that imports them from the PACKAGE NAME against the built dist/ exits 0.",
      "evidence": [
        "RAN the green test 'a consumer importing the executor contract from the package name type-checks and loads against the built dist', 0 skipped with dist/ built."
      ],
      "met": true
    },
    {
      "id": "M4-P4-8",
      "quote": "The exports map does not widen the package. src/spawn.ts's internals, src/exec/env.ts and src/task.ts are NOT reachable through the package name.",
      "evidence": [
        "RAN the green test 'the kernel entry point publishes the adapter contract and the exports map refuses every internal subpath'.",
        "RAN a read of package.json exports: {\".\": {types, default}, \"./package.json\": \"./package.json\"} with no wildcard subpath."
      ],
      "met": true
    },
    {
      "id": "M4-P4-9",
      "quote": "npm run build exits 0, git status clean afterwards, npm ci exits 0 against the lockfile, and node --test exits 0 reporting N tests, N greater than 0, with the complete four-part sentence.",
      "evidence": [
        "npm ci exit 0, npm run build exit 0, git status clean. The suite half is not met for the reason under M4-P2-8."
      ],
      "met": false
    },
    {
      "id": "M4-P8-1",
      "quote": "node --test test/payload-credentials.test.ts exits 0 and reports N tests, N > 0, on node v26.6.0 with dist/ built, invoked as stated.",
      "evidence": [
        "RAN node --test over the group's five files including test/payload-credentials.test.ts: tests 86, pass 86, fail 0, skipped 0, node v26.6.0, dist/ built."
      ],
      "met": true
    },
    {
      "id": "M4-P8-2",
      "quote": "A spawnTask call with payloadClass: \"project\" and allowPrCredentials: true returns {ok: false} whose reason names both fields, and creates no worktree; the same call with payloadClass: \"orchestrator\" returns {ok: true}.",
      "evidence": [
        "RAN through the library seam: 'project + allowPrCredentials: ok=false sentinelEvaluated=false taskdir=false', reason begins 'allowPrCredentials is the declared escape hatch from the credential scrub ... may not be combined with payloadClass \"project\"'.",
        "The orchestrator direction is covered by the green test in test/payload-credentials.test.ts."
      ],
      "met": true
    },
    {
      "id": "M4-P8-3",
      "quote": "buildChildEnv returns {ok: false} for an extension entry named GH_TOKEN and for an extension entry named NODE_OPTIONS, each reason naming the entry. TWO STRUCTURALLY DIFFERENT MEMBERS.",
      "evidence": [
        "RAN refuseExtraAllowlist name by name: GH_TOKEN REFUSED (gh token half), GITHUB_TOKEN REFUSED, NODE_OPTIONS REFUSED (dangerous-vocabulary half), GIT_CONFIG_KEY_0 REFUSED (the numbered injection pattern). Each reason names the entry."
      ],
      "met": true
    },
    {
      "id": "M4-P8-4",
      "quote": "An extension entry with reason: \"\" is refused naming the entry; the same entry with a non-empty reason is accepted and the reason appears verbatim in meta.json.",
      "evidence": [
        "RAN four shapes through the audited route: bare string REFUSED ('no reason field at all'), {name} REFUSED ('no reason field at all'), {name, reason: '  '} REFUSED ('a blank reason'), {name, reason: 'measured: needed'} ACCEPTED.",
        "RAN a real spawn with {name: 'HTTPS_PROXY', reason: 'probe: reviewer test'}: meta.credentials.extensions = [{\"name\":\"HTTPS_PROXY\",\"reason\":\"probe: reviewer test\"}], verbatim.",
        "The final state is STRONGER than the criterion: an ABSENT reason is refused too, which is the CR-B-002 repair and which I re-measured rather than assumed."
      ],
      "met": true
    },
    {
      "id": "M4-P8-5",
      "quote": "The child-written probe file exists after a real spawn and its contents are the assertion.",
      "evidence": [
        "RAN a real spawnTask whose payload is scripts/credential-witness.mjs with a real GH_TOKEN and a real HTTPS_PROXY in the parent: the child wrote its report, envNames = [GH_CONFIG_DIR, GIT_CONFIG_GLOBAL, GIT_CONFIG_NOSYSTEM, GIT_CONFIG_SYSTEM, HOME, PATH, XDG_CONFIG_HOME], verdict green, GH_TOKEN present false, HTTPS_PROXY present false."
      ],
      "met": true
    },
    {
      "id": "M4-P8-6",
      "quote": "The spawn refuses when the environment the adapter reports launching with differs from the environment the kernel handed it. Compared by NAME SET, recorded in meta.json.",
      "evidence": [
        "The comparison exists and is stronger than written: since the credential-route fix round it also compares the five CREDENTIAL_STORE_REDIRECTIONS by value (src/spawn.ts:378).",
        "It refuses correctly against an adapter that reverts HOME and invokes the kernel hook: spawn ok false, changedRedirections [\"HOME\",\"XDG_CONFIG_HOME\"].",
        "It does NOT refuse against an adapter that reverts HOME and writes tasks/<id>/turn-end itself: spawn ok true, handover status 'compared', changedRedirections [], redirectionSource 'child', while the payload read a real gh credential store. Reproduced; CR-F-CRED-001."
      ],
      "met": false
    },
    {
      "id": "M4-P8-7",
      "quote": "PROTOTYPE-DEPENDENT. The name list from step 1, each with its reason, is recorded in the work history with the captured probe output that established it, and the count in meta.json equals the count in the work history.",
      "evidence": [
        "NOT REACHED. The criterion joins a work-history count to a real task's meta.json produced by the prototype probe of M4-P8 step 1. No task from that probe survives at this head, so the join had nothing to join against, and I did not re-run the probe: it was taken in a specific container at a specific time and I did not establish whether it can be re-run from this read-only clone. Reported as not reached rather than guessed."
      ],
      "met": false
    },
    {
      "id": "M4-P24-1",
      "quote": "tiphys next in a fleet home prints exactly one next action and exits 3 while any in-flight item exists. It exits 0 only when every in-flight category is empty.",
      "evidence": [
        "RAN node --test test/next.test.ts: 16 tests, 16 pass, 0 fail, 0 skipped, including 'next exits 3 while an in-flight item exists and 0 only when every category is empty' and 'next prints exactly one next action line in every state'."
      ],
      "met": true
    },
    {
      "id": "M4-P24-2",
      "quote": "It derives its working directory from the fleet home and contains no absolute path literal. Asserted by a test that greps the new source for /home/ and /tmp/ and requires zero hits.",
      "evidence": [
        "RAN the green test 'the next command source contains no absolute path literal'."
      ],
      "met": true
    },
    {
      "id": "M4-P24-3",
      "quote": "The delivered-elsewhere predicate. A branch whose commits have landed on main under different shas is reported DELIVERED, not OPEN. RED WITNESS member A: a squash-merged branch. Member B, structurally different: a branch whose commits landed inside ANOTHER branch's pull request.",
      "evidence": [
        "RAN the three green tests: the squash-merged member, the landed-in-another-pull-request member, and the genuinely undelivered control. Two structurally different members plus a control, which is what the class rule asks for."
      ],
      "met": true
    },
    {
      "id": "M4-P24-4",
      "quote": "It prints what it CANNOT see as a named list: open pull requests, CI conclusions, and post-merge push runs. RED WITNESS: with the network unreachable, the cannot-see block is still printed and the exit code is unchanged.",
      "evidence": [
        "RAN the green test 'next prints the whole cannot-see block and the same exit code when the network is unreachable', plus the adjacent 'next counts a category it could not read as work remaining rather than as empty'."
      ],
      "met": true
    },
    {
      "id": "M4-P24-5",
      "quote": "The plugin's pr open and pr merge each exit nonzero with one line when the credential is absent, and the KERNEL process never receives that credential. Asserted by running the kernel's own credential-scrub probe from INSIDE the adapter's child environment.",
      "evidence": [
        "RAN the green tests 'pr open and pr merge each exit nonzero with exactly one line when the credential is absent', 'the pull-request credential never reaches a kernel adapter child, probed from inside the child', and 'pr merge refuses without a --number, before any credential is read and with no child built'. The probe is child-side, which is what DR-0039 condition 4 requires."
      ],
      "met": true
    },
    {
      "id": "M4-P24-6",
      "quote": "Neither pr open nor pr merge is invoked by any kernel code path in M4. Asserted by a test grepping src/ and bin/ for the plugin's command names and requiring zero hits.",
      "evidence": [
        "RAN the green test 'no kernel code path under src or bin names either plugin pull-request command'.",
        "RAN independently: grep -rnE '\"pr open\"|pr-open|prOpen|\"pr merge\"|pr-merge' src/ bin/ returned no hits."
      ],
      "met": true
    }
  ],
  "deviations-judged": []
}
```
