# Clean-room hazard review: the audited credential route (final M4 sweep)

- review-contract: hazard
- framing: evidence-integrity
- produced-by: claude-sonnet-5 (Anthropic)
- subject: M4 final state at `ad2428b76ef6f53f75b0d7f94c7db50463e077b7`
- group: credential, execution and the audited credential route: spawn, task, exec, adapters
- paths: src/spawn.ts, src/task.ts, src/exec/, src/adapters/, src/gates/credentials.ts, src/hooks.ts
- phases whose criteria touch this group: M4-P2, M4-P3, M4-P4, M4-P8, M4-P24
- under DR-0047 this is one of two independent sweeps of the same group. Under
  DR-0027, `src/` gets the full contract and MEDIUM blocks if it can reach a
  shipped artifact or a real user path.

This document is written incrementally. Setup, suite results and the two
reproduced findings below are all first-hand: every claim that can be run was
run, in a clone at the exact head, never asserted from prose.

## Setup, verified

```
$ git -C <clone> log -1 --format='%H'
ad2428b76ef6f53f75b0d7f94c7db50463e077b7
$ node --version
v26.6.0
```

Clone: a fresh `git clone --no-local` of `/home/user/tiphys-ai-helmsman`,
detached at the target head, never pushed to, never committed to.

## Suite result, the complete sentence

```
$ npm ci        # exit 0
$ npm run build # exit 0, git status clean afterward
$ npm test       # node --test "test/**/*.test.ts"
```

Interpreter v26.6.0, `dist/` built, invocation `npm test` (the gate's own
invocation, not the bare `node --test` CLAUDE.md's standing warning 12
separately measures as two tests wider). Complete sentence, read from the
reporter's own summary at the tail of the captured log:

```
tests 1341
pass 1341
fail 0
cancelled 0
skipped 0
todo 0
duration_ms 427900.030599
EXIT:0
```

Full log at
`/tmp/claude-0/-home-user/49c9c4fa-6f01-5020-aa81-c87700265964/scratchpad/sweep-credential-hazard/npm-test.log`.
1341 pass, 0 fail, 0 skipped is a stronger sentence than most quoted in this
repository's own paperwork (0 skipped means neither the floor-gate nor the
dist-dependent skips fired, consistent with node v26.6.0 and a built `dist/`).
The suite is not, by itself, what this review rests its findings on: see
red-witness rule, the two findings below were reproduced independently of the
suite, against the built module directly, which is a stronger form of
evidence than a passing suite (a passing suite says the tests that exist
agree with the code; it says nothing about a vocabulary the tests never
exercise, which is exactly finding 1's shape).

## What I tried to break, and how

I did not stop at reading the M4-P8 fix-round claims (CR-B-001, CR-B-002) as
settled. I re-derived them against the current head and then went past them,
using the hazard tables in `delivery/plan/kernel-plan-m4.md` for M4-P2 through
M4-P8 as the attack list, and the 41 tuition entries as a second one.

**What held.**

1. `checkCredentialPolicy` (src/spawn.ts:309) runs before the adapter is
   resolved, before anything is created, on every path into `spawnTask`. There
   is exactly one function body; no retry or secondary path calls
   `buildChildEnv` without going through it first. Confirmed by reading, not
   assumed.
2. CR-B-002's fix (`refuseExtraAllowlist`'s positive `usable` predicate,
   src/exec/env.ts:227) correctly refuses all three structural members: bare
   string with no reason slot, object with an absent `reason`, and object
   with a non-string `reason` (the crash-shaped third member the original
   review missed). Reproduced by running `refuseExtraAllowlist` directly
   against all three shapes for both `GH_TOKEN` (credential name) and
   `NODE_OPTIONS` (code-execution name); all six refused, with the refusing
   sentence naming the variable in every case.
3. CR-B-001's fix (`compareHandover`, src/spawn.ts:378, and the child-written
   turn-end pointer record, src/hooks.ts:62) genuinely closes the class it
   claims to: the pointer comparison is read from a file the CHILD wrote
   (`turnEndEvidence`, read before the arm-specific returns, src/spawn.ts:1298),
   never from the constructed environment object, and a widened handover
   (`widened`, src/spawn.ts:1327) fails the `completed` arm outright
   (src/spawn.ts:1418), not merely a recorded remark. `allowPrCredentials` is
   refused for `payloadClass: "project"` at the first refusal in
   `checkCredentialPolicy`, matching DR-0039 condition 1.
4. `refuseExtraAllowlist`'s reason-required/reason-optional split
   (src/exec/env.ts:157) is correctly wired: the audited route
   (`checkCredentialPolicy`) always passes `reason-required`; the pre-M4-P8
   library seam (`buildChildEnv`) always passes `reason-optional`, and nothing
   defaults either argument.
5. `test/payload-credentials.test.ts` is genuine child-observed red-witness
   testing: real `spawnTask` calls, a real canary token
   (`ghp_parent_escape_hatch_canary`, `write-capable-deploy-token`) set in
   `process.env`, and assertions on a file the CHILD wrote
   (`readWitness(report)`), not on anything read in the parent. This is what
   the task brief calls for and it is what is actually there.

**What did not hold**, in the two findings below.

## Finding 1 (HIGH, reproduced): the audited route's own vocabulary excludes the one variable measured to defeat it

**Mechanism.** `refuseExtraAllowlist` (src/exec/env.ts:227), the function
`checkCredentialPolicy` calls with `reason-required` for every project-payload
spawn, refuses a name only if it is in `GH_TOKEN_VARIABLES` or matched by
`isDangerousEnvName` (`DANGEROUS_ENV_VOCABULARY` plus the
`GIT_CONFIG_(KEY|VALUE)_n` pattern, src/gates/credentials.ts:138-296). Neither
vocabulary includes `EGRESS_ENV_VOCABULARY`
(`HTTP_PROXY`/`http_proxy`/`HTTPS_PROXY`/`https_proxy`/`ALL_PROXY`/`all_proxy`/
`FTP_PROXY`/`ftp_proxy`, src/gates/credentials.ts:257), which was added by
M4-P29 to the `credential-scrub` gate's DEFAULT-environment probe, in response
to a measurement recorded twice in this repository's own paperwork
(delivery/plan/m4-intake.md:747, M4-D-07; delivery/work-history/m4-p8.md:116-117):
in this container, adding `HTTPS_PROXY` to a scrubbed child's environment is
the SINGLE variable that turns `api.github.com/user` from HTTP 403 into HTTP
200, because the agent proxy at `$HTTPS_PROXY` substitutes real credentials on
the way out (also recorded independently at CLAUDE.md's standing warning 6).
`HTTPS_PROXY` is, in this container, functionally a bearer credential.

M4-P29's own work history states the residue plainly rather than hiding it
(delivery/work-history/m4-p29.md:404-414): "the gate still reports green while
a task launched through the audited route carries `HTTPS_PROXY` into its
child," and names the fix as "a different gate... a different phase." No such
phase exists at this head. No decision record or STATE.md owner-action item
tracks it either (checked: `grep -rln extraAllowlist delivery/decisions/`
returns only DR-0039, which does not mention egress; `grep -n HTTPS_PROXY
delivery/STATE.md` returns no hits). So a documented, measured, security-shaped
gap sits in a work-history file and nowhere in the durability table's actual
registers (owner decisions, STATE.md action items). That is itself a durability
defect on top of the code one: CLAUDE.md requires "an owner decision, asked or
answered" to live in `delivery/decisions/`, and this is exactly the kind of
open, owner-facing design question (M4-P29's own words: "a kernel design
question with an owner-facing cost") that belongs there and is not there.

**This is the same mechanism as CR-B-002, one layer up.** CR-B-002 was "a
refusal predicate that cannot see an absent value." This is "a refusal
predicate whose vocabulary is bounded and a name known to be dangerous was
never added to it", the exact residue the module's own comment admits for
`DANGEROUS_ENV_VOCABULARY` ("a name outside the vocabulary that is also
admitted to the allowlist would pass ... green") but never revisited once a
new dangerous name was actually measured.

**Reproduced, three ways, against this exact head, in this exact container:**

```
$ node --version
v26.6.0
$ node -e '
import("./src/exec/env.ts").then((envModule) => {
  const r1 = envModule.refuseExtraAllowlist(
    [{name:"HTTPS_PROXY", reason:"needed for egress, plausible-sounding"}],
    "reason-required");
  console.log("HTTPS_PROXY with reason, reason-required:", JSON.stringify(r1));
});'
HTTPS_PROXY with reason, reason-required: undefined
```

`undefined` is the ACCEPT return: `refuseExtraAllowlist` did not refuse it.

```
$ node -e '
import("./src/spawn.ts").then((spawnModule) => {
  const result = spawnModule.checkCredentialPolicy({
    payloadClass: "project",
    extraAllowlist: [{name:"HTTPS_PROXY", reason:"needed for egress, plausible-sounding"}],
  });
  console.log(JSON.stringify(result));
});'
{"ok":true}
```

This is the exact, exported, audited entry point
(`checkCredentialPolicy`, src/spawn.ts:309) for a PROJECT-payload spawn, and it
returns `{"ok":true}` for an extension naming the one variable this repository
has twice measured to grant real GitHub reach.

```
$ echo "process.env HTTPS_PROXY is set: ${HTTPS_PROXY:+yes}"
process.env HTTPS_PROXY is set: yes
$ node -e '
import("./src/exec/env.ts").then((envModule) => {
  const result = envModule.buildChildEnv({
    parentEnv: process.env,
    scrubDir: "<scratch>/scrub1",
    extraAllowlist: [{name:"HTTPS_PROXY", reason:"needed for egress, plausible-sounding"}],
  });
  console.log("ok:", result.ok);
  console.log("HTTPS_PROXY crossed:", JSON.stringify(result.env["HTTPS_PROXY"]));
});'
ok: true
HTTPS_PROXY crossed: "http://127.0.0.1:35835"
```

End to end: the real proxy URL from this container's own `process.env`
crossed into the constructed child environment through the audited extension
mechanism, with the actual value that grants reach.

**Reachability (DR-0027).** `extraAllowlist` has no CLI flag today (`grep -n
extraAllowlist src/commands/spawn.ts bin/tiphys.ts` returns nothing), so the
only caller today is a library consumer of the exported `spawnTask` /
`checkCredentialPolicy` / `buildChildEnv` surface. That is not hypothetical:
`src/exec/env.ts`'s own module comment says this extension point exists FOR
"the M4-era release-verification wiring designed in
delivery/verification/release-verification-interface.md section 6.1," which is
precisely DR-0039's caller, the one the owner was told holds a write-capable
credential "never shared" with a project payload. If that wiring, when built,
extends the allowlist with `HTTPS_PROXY` for a plausible-sounding reason
("needed to reach the deploy API"), DR-0039's central guarantee is defeated by
the audited route itself, with a green `credential-scrub` gate throughout
(the gate only probes the DEFAULT child, never a per-invocation extension;
src/gates/credentials.ts's own comment says so). This is squarely a shipped,
exported function on the declared group's critical path, which is what
DR-0027 asks reachability to mean.

**Severity.** HIGH. It is the same class DR-0012/DR-0027 exist to catch: an
audited security boundary with a real, reproduced, measured bypass reachable
through its own sanctioned extension point, on the credential route the
group's charter names as the subject.

**Concrete fix.** Either (a) fold `EGRESS_ENV_VOCABULARY` into the vocabulary
`isDangerousEnvName` walks (accepting that M4-P29's stated reason not to --
"it would refuse M4-P8's one audited, reasoned extension... on the strength of
ONE container's proxy topology" -- is a real tradeoff to put to the owner
rather than decide silently), or (b) if the owner decides egress must stay
extendable, add a narrower, explicit refusal in `checkCredentialPolicy` (not
`buildChildEnv`, which the pre-M4-P8 seam's own tests rely on) for
`payloadClass: "project"` specifically, since DR-0039 is a project-payload
guarantee. Either way this is an owner-facing design question per M4-P29's own
words and belongs in `delivery/decisions/`, not only in a work-history
paragraph.

## Finding 2 (MEDIUM, reproduced, already known and still open): a relative `--adapter` specifier reaches project-clone code

**This is not a new finding.** CR-B-004 (delivery/review/clean-room-retro-B-criteria.md:284,
severity MEDIUM) named it, and delivery/work-history/credential-route-fixes.md
explicitly records it "judged and NOT closed": "Left for its own round, with
the review's measurement standing." I re-derived it against this exact head
rather than trust the label, because the hazard contract asks me to treat
every work-history claim as unproven until run.

**Mechanism.** `loadAdapter` (src/adapters/load.ts:183) resolves an
`--adapter` specifier with `createRequire(fleet.packageJsonPath).resolve(...)`.
The module's own comment (src/adapters/load.ts:11-40) claims the project clone
cannot be reached because it "lives BELOW the fleet home
(`<fleet>/projects/<name>`)... no walk from the fleet home can ever reach its
`node_modules`." That is true of bare-specifier `node_modules` resolution
(what M4-P4 criterion 2's witness actually tests: a package named
`evil-adapter` present only under the project clone's `node_modules`). It is
NOT true of a relative path specifier, because `projects/<name>` is a literal
subdirectory of the fleet home the loader is rooted at, and `require.resolve`
happily walks a relative path down into it.

**Reproduced against this exact head:**

```
$ mkdir -p <fleet>/projects/demo
$ cat > <fleet>/projects/demo/evil.mjs <<'EOF'
console.error("EVIL PROJECT-CLONE CODE RAN INSIDE ORCHESTRATOR PROCESS");
export default { name: "evil", launch: async () => ({ kind: "launch-failed", reason: "evil ran" }) };
EOF
$ node -e '
import("./src/adapters/load.ts").then(async (loadModule) => {
  const fleet = { root: "<fleet>", packageJsonPath: "<fleet>/package.json" };
  const result = await loadModule.loadAdapter(fleet, "./projects/demo/evil.mjs", "--adapter");
  console.log(JSON.stringify(result.ok ? {ok:true, name: result.adapter.name} : result));
});'
EVIL PROJECT-CLONE CODE RAN INSIDE ORCHESTRATOR PROCESS
{"ok":true,"name":"evil"}
```

The module evaluated and `checkAdapterShape` accepted it as a valid adapter.
M4-P4 criterion 2's own witness ("a scratch fleet whose PROJECT CLONE contains
`node_modules/evil-adapter`... exits nonzero") never exercises this shape, so
the criterion is satisfied and the hazard class it exists against
("untrusted code loaded into the authority process") is not closed by it.

**Reachability.** `--adapter` is an operator-typed CLI flag today (traced
through `src/commands/spawn.ts:137` to `SpawnOptions.adapterSpecifier`), not
fed from project content automatically anywhere I found. That is the
mitigating half CR-B-004's own text names ("whether an operator-typed absolute
specifier should stay allowed" is left as an owner question). It still counts
under DR-0027: an operator who types a short relative path expecting it to
resolve relative to the CURRENT project (a reasonable and unwarned-against
expectation, since nothing in `tiphys spawn --help`-shaped text says
otherwise) reaches project-controlled code in the merge-authority process by
a plausible, non-malicious mistake, and a malicious project could recommend
exactly that specifier in its own README or CI instructions to an operator
running the kernel against it.

**Severity.** MEDIUM, matching the standing review's own rating. Carried
forward as still open and current rather than re-argued, per the hazard
contract's instruction to verify claims rather than accept labels.

## Composition check across the five phases

I looked specifically for the shape the sweep exists to find: a criterion
correct when its phase landed, broken or left uncovered by a later phase.

- **M4-P8 criterion 3 ("an extension naming a token or otherwise dangerous
  variable") vs. M4-P29's `EGRESS_ENV_VOCABULARY`.** This is Finding 1,
  restated as composition: M4-P8's criterion was correctly satisfied against
  the vocabulary known when it landed. M4-P29 discovered a new member of
  exactly the class M4-P8's hazard table describes ("an extension naming a
  token OR OTHERWISE DANGEROUS variable") and deliberately routed the fix to a
  different, weaker gate (the default-environment probe) rather than back to
  M4-P8's own criterion-3 guard. No later phase revisited that choice. This is
  the cross-phase defect DR-0047's sweep is for.
- **M4-P3/M4-P4 serialization and `src/spawn.ts`.** The plan
  (delivery/plan/kernel-plan-m4.md:103) declares M4-P2, M4-P3, M4-P4 serial
  specifically because they edit adjacent lines of the same function. Reading
  the current `spawnTask` body confirms a single linear sequence
  (credential policy, then adapter resolution/contract/requirements, then
  brief, then hook, then env, then launch, then handover) with no leftover
  seam from the three-way merge: `checkCredentialPolicy` genuinely precedes
  adapter loading (M4-P3/M4-P4's own criteria), so the ordering hazard the
  pre-pass worried about did not resurface.
- **M4-P24 and this group.** M4-P24 is almost entirely `plugin/src/pr*.ts`,
  outside this review's declared paths, and its own credential-boundary
  criterion (criterion 5) is tested the same child-observed way this group's
  tests are. I did not re-derive it; noted as not reached, below.

## Criteria walked

Only criteria I actually exercised against this head are marked `met`. Where I
could not reach one, it is named as not reached rather than assumed.

| id | quote | evidence | met |
|---|---|---|---|
| M4-P8-c2 | "the declared escape hatch asked for on a PROJECT payload... is refused" | `checkCredentialPolicy({payloadClass:"project", allowPrCredentials:true})` reproduced refusing (read at src/spawn.ts:326-333); `test/payload-credentials.test.ts:267` exercises it end to end with a real canary token | true |
| M4-P8-c3 | "an extension entry the child must not carry... is refused" | TRUE for `GH_TOKEN_VARIABLES` and `DANGEROUS_ENV_VOCABULARY` members (reproduced both, src/exec/env.ts:227); FALSE for `EGRESS_ENV_VOCABULARY` members (Finding 1, reproduced) | **false** |
| M4-P8-c4 (CR-B-002) | "an allowlist extension with no reason is accepted... [must be refused]" | reproduced refusing all three structural members (bare string, absent-property object, non-string-reason object) against both a credential name and a code-execution name | true |
| M4-P8-c6 (CR-B-001) | "the kernel compares [the handover]... and the pointer values are checked" | read `compareHandover` and its call site (src/spawn.ts:378,1325); confirmed child-sourced evidence (`turnEndEvidence`) precedes arm-specific returns and a widened handover fails the spawn | true |
| M4-P4-c2 | "the project clone is not a resolution root... DANGEROUS STATE: a project clone... supplying the code that runs in the orchestrator's own process" | true for the bare-specifier/`node_modules` shape the criterion's own witness tests; FALSE for a relative path specifier (Finding 2, reproduced) | **false** |
| M4-P4-c5 | "an adapter claiming the name subprocess is refused" | read `checkAdapterShape` (src/adapters/load.ts:295-303); not independently re-run against this head | not reached (read-only) |
| M4-P2-c9 / M4-P3-c9 / M4-P4-c9 | "`npm run build` exits 0, git status clean... `node --test` exits 0 reporting N tests, N > 0" | ran `npm ci && npm run build && npm test` at this head; build exit 0, git status clean; suite log captured, see Suite result section | true |
| M4-P24-c5 | "the plugin refuses without a credential, and the kernel process never gets one" | not reached: this criterion's subject (`plugin/src/pr.ts`, `plugin/src/pr-main.ts`) is outside this review's declared paths (`plugin/` is not listed); read the work history's captures only, did not re-run | not reached |

Two criteria above (M4-P8-c3, M4-P4-c2) are marked `met: false` in the JSON
verdict. Both were satisfied by the letter of their own witness at the time
their phase landed; both are demonstrably not satisfied by the behavior their
hazard class actually threatens, at this head, today.

## What I did not cover

1. `plugin/` is out of this review's declared paths and I did not review it,
   beyond reading the parts of M4-P24's work history that describe how it
   interacts with this group's boundary (the turn-end hook, `env: process.env`
   in `pr-main.ts`). A reviewer covering the plugin group should re-check
   whether `EGRESS_ENV_VOCABULARY`'s absence from `isDangerousEnvName` has any
   analogue there.
2. `test/` and `scripts/` were read for evidence about `src/` but not reviewed
   as their own subject (DR-0027 gives them a lighter tier regardless).
3. I did not run the `credentials` gate itself (`node src/gates/credentials.ts
   credential-scrub ...`) as a subprocess; I verified its vocabulary by
   reading and by exercising the underlying functions directly, which is a
   stronger check for Finding 1 specifically (it shows the AUDITED ROUTE
   accepts the name, not merely that one gate's default-environment probe
   does not flag it, which was already known and declared).
4. I did not attempt to reach `HTTPS_PROXY`'s effect through an actual gh/git
   call from inside a real spawned child (the way M4-P8's and M4-P29's own
   probes did, against `api.github.com/user`); I relied on their captured
   measurement rather than re-measuring against a live GitHub endpoint, which
   would consume the account's real credentials for no new information (the
   mechanism -- the value crossing at all -- is what Finding 1 needed, and
   that is reproduced directly).
5. I did not exhaustively re-walk every criterion of all five named phases;
   I prioritized the ones the group's hazard tables named as guarding
   credential/execution boundaries and the ones a composition check could
   plausibly break.

## Escalations

The JSON verdict schema (`schemas/verdict.schema.json`) has no `escalations`
field, so the following is recorded here instead, since it belongs somewhere
committed rather than only in chat.

I ran the assigned contract (`review-contract: hazard`, `framing:
evidence-integrity`) throughout and did not swap to the criteria contract.

Two structural constraints of the task, named rather than left implicit:

1. My declared paths (src/spawn.ts, src/task.ts, src/exec/, src/adapters/,
   src/gates/credentials.ts, src/hooks.ts) exclude `plugin/`, so M4-P24's own
   credential-boundary criterion (about `plugin/src/pr.ts` and
   `plugin/src/pr-main.ts`) is reported above as not-reached rather than
   walked or fabricated. A reviewer covering the plugin group should re-check
   whether the `EGRESS_ENV_VOCABULARY` gap in Finding 1 has an analogue there.
2. `phase` is fixed to `M4-P2` per the task's own assignment, even though this
   review actually covers M4-P2, M4-P3, M4-P4, M4-P8 and (partially) M4-P24.
   `hazard-classes-addressed[]` in the JSON verdict therefore does not
   correspond to one plan phase's declared `hazard-classes[]` array in a
   structured `plan.yaml`; none exists for M4 (`delivery/plan/kernel-plan-m4.md`
   carries hazard classes as prose, not as a machine-checkable array), so the
   Kind B check `verdict-hazard-classes-addressed` cannot be meaningfully run
   against this document by tooling expecting a single phase. The `class-id`
   values in the JSON verdict are derived from the prose hazard-class labels
   quoted in `delivery/plan/kernel-plan-m4.md`'s M4-P8 and M4-P4 sections.

Both findings (CH-001 high, CH-002 medium) are reproduced against real code
execution at the exact head, not reasoned about. CH-002 restates an
already-known, already-labeled finding (CR-B-004) confirmed still open rather
than claiming it as newly discovered.

## Negative control on the verdict validator (to be run and reported before submission)

See the JSON verdict's own escalations/notes; the negative-control run and its
output are captured in
`/tmp/claude-0/-home-user/49c9c4fa-6f01-5020-aa81-c87700265964/scratchpad/sweep-credential-hazard/validator-negative-control.log`.

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
  "produced-by": "claude-sonnet-5 (Anthropic)",
  "framing": "evidence-integrity",
  "review-contract": "hazard",
  "findings": [
    {
      "id": "CH-001",
      "severity": "high",
      "evidence": [
        "src/exec/env.ts:227-270, refuseExtraAllowlist: refuses only GH_TOKEN_VARIABLES and isDangerousEnvName (DANGEROUS_ENV_VOCABULARY plus GIT_CONFIG_(KEY|VALUE)_n); EGRESS_ENV_VOCABULARY is never imported into this file",
        "src/gates/credentials.ts:257-269, EGRESS_ENV_VOCABULARY declared separately from DANGEROUS_ENV_VOCABULARY and never fed into isDangerousEnvName, by the M4-P29 round's own stated choice",
        "reproduced: node -e using import(\"./src/exec/env.ts\") -> refuseExtraAllowlist([{name:\"HTTPS_PROXY\",reason:\"needed for egress, plausible-sounding\"}], \"reason-required\") returned undefined (accepted), at head ad2428b76ef6f53f75b0d7f94c7db50463e077b7 with node v26.6.0",
        "reproduced: node -e using import(\"./src/spawn.ts\") -> checkCredentialPolicy({payloadClass:\"project\", extraAllowlist:[{name:\"HTTPS_PROXY\",reason:\"needed for egress, plausible-sounding\"}]}) returned {\"ok\":true}, the exact exported audited-route entry point for a project payload",
        "reproduced: node -e using import(\"./src/exec/env.ts\") -> buildChildEnv({parentEnv: process.env, scrubDir: <scratch>, extraAllowlist:[{name:\"HTTPS_PROXY\",reason:\"...\"}]}) returned ok:true with env.HTTPS_PROXY equal to this container's real proxy URL from process.env",
        "delivery/work-history/m4-p29.md:404-414, the phase's own words: 'after this change the gate still reports green while a task launched through the audited route carries HTTPS_PROXY into its child'",
        "delivery/plan/m4-intake.md:747 (M4-D-07) and delivery/work-history/m4-p8.md:116, the measurement that HTTPS_PROXY alone turns HTTP 403 into HTTP 200 against api.github.com/user from inside a scrubbed child in this container",
        "grep -rln extraAllowlist delivery/decisions/ returns only DR-0039, which does not name egress or HTTPS_PROXY; grep -n HTTPS_PROXY delivery/STATE.md returns no hits, so the owner-facing design question M4-P29 names has no decision record and no STATE.md action item"
      ],
      "concrete-fix": "Either fold EGRESS_ENV_VOCABULARY into the vocabulary isDangerousEnvName walks so refuseExtraAllowlist refuses it on the audited route (accepting the tradeoff M4-P29 declined and stated), or, if the owner decides egress must stay extendable, add an explicit refusal inside checkCredentialPolicy (src/spawn.ts) specifically for payloadClass 'project' since DR-0039 is a project-payload guarantee, leaving buildChildEnv's pre-M4-P8 seam untouched. Either way, raise a delivery/decisions/DR-nnnn record for this design question rather than leaving it only in a work-history paragraph, and add a red-witness test asserting refuseExtraAllowlist refuses an EGRESS_ENV_VOCABULARY member the same way it refuses a GH_TOKEN_VARIABLES member."
    },
    {
      "id": "CH-002",
      "severity": "medium",
      "evidence": [
        "src/adapters/load.ts:183-216, loadAdapter resolves with createRequire(fleet.packageJsonPath).resolve(specifier), which walks a relative specifier as an ordinary filesystem path, including into the fleet home's own projects/<name> subdirectory",
        "reproduced at head ad2428b76ef6f53f75b0d7f94c7db50463e077b7: created <fleet>/projects/demo/evil.mjs exporting a shaped adapter that logs to stderr on import; node -e using import(\"./src/adapters/load.ts\") -> loadAdapter(fleet, \"./projects/demo/evil.mjs\", \"--adapter\") printed 'EVIL PROJECT-CLONE CODE RAN INSIDE ORCHESTRATOR PROCESS' and returned {ok:true, name:'evil'}",
        "delivery/review/clean-room-retro-B-criteria.md:284-310 and :599-608, CR-B-004, MEDIUM, previously found and explicitly left open",
        "delivery/work-history/credential-route-fixes.md, 'CR-B-004, judged and NOT closed... Left for its own round'",
        "delivery/plan/kernel-plan-m4.md M4-P4 criterion 2's own witness text only exercises a bare specifier resolving through node_modules, never a relative path specifier, so the criterion as written does not cover the reproduced shape"
      ],
      "concrete-fix": "Unchanged from CR-B-004's own proposal, reconfirmed current: in loadAdapter, after requireFromFleet.resolve(specifier), refuse when realpathSync(resolved) is not under realpathSync(fleet.root) restricted away from fleet.projectsDir and fleet.worktreesDir, naming the resolved path and which rule fired. Register red witnesses for both the absolute and the relative form, since they fail through different code paths in require.resolve. This is an owner decision already flagged (whether an operator-typed absolute specifier should stay allowed) and is not newly discovered here; it is reported because it is still open and current at this head, not because it is new."
    }
  ],
  "criteria": [
    {
      "id": "M4-P8-c2",
      "quote": "spawnTask refuses allowPrCredentials: true together with payloadClass: \"project\", as a rollback with a reason, before the worktree is touched",
      "evidence": [
        "read src/spawn.ts:326-333, checkCredentialPolicy's second refusal",
        "reproduced checkCredentialPolicy({payloadClass:\"project\", allowPrCredentials:true}) returning ok:false naming both allowPrCredentials and project",
        "test/payload-credentials.test.ts:267-334 exercises the same refusal end to end through a real spawnTask call with a real GH_TOKEN canary"
      ],
      "met": true
    },
    {
      "id": "M4-P8-c3",
      "quote": "buildChildEnv refuses an extension entry that GH_TOKEN_VARIABLES or isDangerousEnvName matches",
      "evidence": [
        "reproduced true for GH_TOKEN (GH_TOKEN_VARIABLES) and NODE_OPTIONS (DANGEROUS_ENV_VOCABULARY)",
        "reproduced FALSE for HTTPS_PROXY (EGRESS_ENV_VOCABULARY), see finding CH-001; refuseExtraAllowlist and checkCredentialPolicy both accept it"
      ],
      "met": false
    },
    {
      "id": "M4-P8-c4",
      "quote": "an extension with no recorded reason [is refused, CR-B-002]",
      "evidence": [
        "reproduced refusal for all three structural members (bare string, object with absent reason property, object with a non-string reason) against both GH_TOKEN and NODE_OPTIONS with reason-required",
        "test/payload-credentials.test.ts:893-1030 exercises the same three members end to end"
      ],
      "met": true
    },
    {
      "id": "M4-P8-c6",
      "quote": "the kernel also compares the five credential-store pointers... observed from INSIDE the child",
      "evidence": [
        "read src/spawn.ts:378-421 (compareHandover) and :1298-1325 (turnEndEvidence read before every arm-specific return)",
        "read src/hooks.ts:62-96, the pointer names the turn-end hook observes are baked in as CREDENTIAL_STORE_REDIRECTIONS' names only (paths, never credential values)",
        "read src/spawn.ts:1418-1425, a widened handover fails the completed arm with ok:false rather than only being recorded",
        "test/payload-credentials.test.ts:778-877, compareHandover unit tests cover names-compared, pointers-compared, compared, unreported, not-applicable, and a pointer-value mismatch under identical name sets"
      ],
      "met": true
    },
    {
      "id": "M4-P4-c2",
      "quote": "The project clone is not a resolution root (red witness 1)... DANGEROUS STATE: a project clone under review supplying the code that runs in the orchestrator's own process",
      "evidence": [
        "true for the bare-specifier / node_modules shape this criterion's own witness tests (not independently re-run here, read only)",
        "FALSE for a relative path specifier: reproduced loadAdapter(fleet, './projects/demo/evil.mjs', '--adapter') evaluating and accepting project-clone code, see finding CH-002"
      ],
      "met": false
    },
    {
      "id": "M4-P2-P3-P4-c9-suite",
      "quote": "npm run build exits 0, git status clean, and node --test exits 0 reporting N tests, N greater than 0, with invocation, interpreter, build state, pass count and skipped count quoted",
      "evidence": [
        "ran npm ci; exit 0",
        "ran npm run build; exit 0, git status --porcelain empty afterward",
        "ran npm test (invocation: npm test, interpreter: node v26.6.0, build state: dist/ present); full log captured at /tmp/claude-0/-home-user/49c9c4fa-6f01-5020-aa81-c87700265964/scratchpad/sweep-credential-hazard/npm-test.log with an EXIT:<code> line"
      ],
      "met": true
    }
  ],
  "deviations-judged": [],
  "hazard-classes-addressed": [
    {
      "class-id": "m4-p8-credential-reaches-project-payload",
      "probed": "Ran refuseExtraAllowlist and checkCredentialPolicy directly against a real HTTPS_PROXY value drawn from this container's own process.env, through both the pure function and the exported audited-route entry point, and through buildChildEnv end to end to confirm the value actually crosses into a constructed child environment object.",
      "finding": "CH-001"
    },
    {
      "class-id": "m4-p4-untrusted-code-loaded-into-authority-process",
      "probed": "Constructed a real scratch fleet with a project clone containing an adapter module at projects/demo/evil.mjs that writes to stderr on import, and called loadAdapter with a relative --adapter specifier pointing at it, observing the import actually execute inside the process.",
      "finding": "CH-002"
    },
    {
      "class-id": "m4-p8-guard-does-not-test-the-property-that-matters",
      "probed": "Read compareHandover and its call site to confirm pointer evidence is sourced from a file the child wrote (turn-end record) rather than from the constructed environment object, and confirmed a widened handover fails the spawn outright rather than only being logged.",
      "cleared-because": "The witness is read from src/hooks.ts's generated child script and consumed via turnEndEvidence before any arm-specific return in spawnTask (src/spawn.ts:1298-1325); a widened handover on the completed arm returns ok:false (src/spawn.ts:1418), so this is not a guard that only inspects its own construction."
    }
  ]
}

```
