# DR-0048: the audited credential route refuses egress names

- id: DR-0048
- status: DECIDED
- decided-by: orchestrator under DR-0016
- date: 2026-09-18
- supersedes: nothing
- relates-to: DR-0039, DR-0012

## The decision

`refuseExtraAllowlist` refuses any allowlist extension naming a member of the
egress vocabulary, on the same footing as the gh-token and dangerous
vocabularies it already walks. Where a payload must reach the network, that is
granted through a declared, machine-readable route, not a free-text `reason`
field.

## Why this is not an owner question

DR-0016 binds: escalate only when two or more options are genuinely comparable.
They are not, and the measurement is what makes them incomparable rather than a
judgment.

**The default scrubbed child already denies egress.** Measured 2026-09-18 at
`ad2428b` on node v26.6.0, `buildChildEnv` with no extension:

    default child env carries 7 names:
      GH_CONFIG_DIR GIT_CONFIG_GLOBAL GIT_CONFIG_NOSYSTEM GIT_CONFIG_SYSTEM
      HOME PATH XDG_CONFIG_HOME
      HTTPS_PROXY    absent by default
      HTTP_PROXY     absent by default
      ALL_PROXY      absent by default
      SSH_AUTH_SOCK  absent by default

Denying the proxy is not an accident of the allowlist, it is what the scrub is
for. So an extension that restores it does not add a capability the design
withheld by oversight, it removes the one the design exists to remove.

**Egress is the measured difference between refused and served.** M4-P8's own
arm table at delivery/work-history/m4-p8.md:116 records arm B, `HTTPS_PROXY`
added, as HTTP **200** against api.github.com/user from inside a scrubbed child,
where arm A with no extension took **403**. That is the owner's standing
constraint, that a write-capable credential must not reach an implementer,
turning on one variable name.

**Nothing in the shipped kernel passes an extension at all.** Measured the same
day:

    grep -rn "extraAllowlist:\s*\[" src/ bin/ plugin/src/ test/ scripts/ | grep -v "\[\]"

Its FULL output, seven hits:

    test/payload-credentials.test.ts:408:        extraAllowlist: [member.name],
    test/payload-credentials.test.ts:439:        extraAllowlist: [
    test/payload-credentials.test.ts:491:        extraAllowlist: [{ name: "TIPHYS_EXIT_TEST_MODE", reason: blank }],
    test/payload-credentials.test.ts:507:      extraAllowlist: [{ name: "TIPHYS_EXIT_TEST_MODE", reason }],
    test/payload-credentials.test.ts:926:          extraAllowlist: [member.entry],
    test/payload-credentials.test.ts:965:        extraAllowlist: [{ name: "VERCEL_TOKEN", reason }],
    test/credentials-gate.test.ts:612:    extraAllowlist: ["GIT_CONFIG_NOSYSTEM"],

Every hit is under `test/` and not one names a proxy variable. The shipped
surface threads the argument through src/spawn.ts:1214 without populating it.

**What this derivation does NOT cover**, because a search whose scope is wrong
returns an empty result indistinguishable from an absence: it matches only the
literal spelling `extraAllowlist: [`, so a caller building the array in a
variable first, or spreading one in, is invisible to it. It also covers this
repository only, and the kernel is a package other projects will call, so the
fix round owes the wider enumeration before it relies on this.

**The audit that was supposed to compensate is not read by anything.** The
extension record is written at src/spawn.ts:1146 as a name and a prose reason.
The sweep's criteria reviewer searched for a reader and found none: no gate, no
schema, no consumer in `src/`. A free-text field nothing parses is documentation,
not a control, and it was standing in for one.

Given those four, there is no second option to weigh. Writing the recommendation
out is what showed that, which is the test DR-0016 prescribes.

## What was deliberately declined before, and why this does not reopen it

M4-P29 kept the egress vocabulary out of the walk that
src/gates/credentials.ts:282 performs, and said so in the open. Its own words at
delivery/work-history/m4-p29.md:407 state the residue plainly: "after this
change the gate still reports green while a task launched through the audited
route carries `HTTPS_PROXY` into its child."

That phase was reasoning about a GATE over the constructed default, and it was
right that a probe of a default cannot see an argument no caller has passed yet.
Its proposed remedy was a further gate auditing the extension record in
`meta.json`. This decision takes a different one: **refuse at the predicate
rather than audit after the fact.** The reason is the fourth measurement above.
An audit whose output nothing reads is the weaker half of a control, and adding
a second gate to read a record is more machinery than declining the name.

This repository's rule that a decided record stays decided binds agents, and
M4-P29's account is a work history rather than a decision record, so nothing
here overturns a decision. What it
does is answer a question that phase explicitly left open and routed onward.

## Scope, stated so the fix round does not over-read it

The refusal is at the audited route. src/exec/env.ts:227 is the predicate, and
it is reached with `reason-required` from `spawnTask`. `buildChildEnv`'s spec
path passes `reason-optional` as a declared compatibility residue, and this
decision does not change that seam.

Two names beyond the egress list were measured accepted and are NOT settled
here, because they are a different question:

- `SSH_AUTH_SOCK`, an agent socket and therefore a signing capability, sits in
  neither vocabulary. The sweep raised it as an open question and could not
  verify the ssh(1) walk in this container, which has no ssh binary and no man
  page. It is left open for the round that can run the walk.
- `NODE_OPTIONS` is already refused, and is named here only so a later reader
  does not read the list above as exhaustive.

## The door this leaves open

A consumer running delivery for a project whose payload must reach the network
is a real future case, and this decision does not weld it shut. It rules out one
mechanism: granting egress through an argument whose only audit is prose nobody
parses. When that case arrives it gets a declared route with a reader, and that
is a plan question rather than a refusal to loosen here.
