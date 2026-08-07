# Arbitration: M2-P8 credential scoping, round one

- date: 2026-08-06
- head: `af56782fbb50d8e56788f2f927277177f26aeb7a` (branch claude/m2-p8-credential-scoping)
- arbitrated by: the orchestrator, under DR-0012 clause 6
- outcome: **FIX-ROUND-NEEDED.** One medium from the hazard contract;
  criteria contract APPROVE. First fix round.

## The verdicts

| | criteria (Sonnet, CR-1350..) | hazard (Opus, H1/O1) |
|---|---|---|
| verdict | APPROVE | FIX-ROUND-NEEDED |
| high / medium / low | 0 / 0 / 3 | 0 / 1 / 1 |

Both contracts agree the SHIPPED code has no credential leak: the allowlist
held against ~25 smuggling channels (NODE_OPTIONS, LD_PRELOAD, GIT_ASKPASS,
GIT_CONFIG_COUNT-family, SSH_ASKPASS, and the rest), all five store pointers
are redirected override-last, both children are scrubbed, and PR creation was
correctly moved out of the payload (R-008). The criteria contract re-ran the
M1 exit test end to end under the scrub and confirmed it. The medium is that
the gate's own anti-widening PROBE is weaker than the allowlist it checks.

## The mechanism (CR-H1, medium)

**The gate verifies the child env against a set derived from the allowlist
under test, so its verdict is believed, not probed, for every name outside
the one gh-token denylist.** The environment "stray" check derives its
permitted set from the same allowlist the gate builds the child from, so in a
real run it is tautological (nothing outside the allowlist can appear by
construction). The only allowlist-independent check is the four gh token
names. Constructed: admitting `GH_TOKEN` to the allowlist reddens, but
admitting `GIT_ASKPASS`, `GIT_SSH_COMMAND`, the `GIT_CONFIG_COUNT` family,
`NODE_OPTIONS`, `LD_PRELOAD`, `SSH_ASKPASS` all stay GREEN. And the work
history's claim that the store probes are a name-independent backstop is
false for the git env-injection vector: `git config --get-all
credential.helper` resolves an env-injected helper while the scrub's
`--global`/`--system` probes see nothing.

This is the phase's own declared hazard (a scrub that can be believed rather
than probed) in the one phase where being wrong is a security defect. It is a
fixable gap, not inherent residue: MECHANISMS.md's denylist tier prescribes
walking the consuming program's closed documented vocabulary. The phase
walked gh's and not git's/ssh's/node's.

**Fix at the mechanism:** a bounded vocabulary walk mirroring the gh walk,
covering the credential- and code-execution-capable env names of git
(`GIT_ASKPASS`, `GIT_SSH_COMMAND`, `GIT_PROXY_COMMAND`, the
`GIT_CONFIG_COUNT`/`_KEY_n`/`_VALUE_n` injection family, `GIT_CONFIG_GLOBAL`
/`_SYSTEM` if not already redirected), ssh (`SSH_ASKPASS`), and node
(`NODE_OPTIONS`, `NODE_EXTRA_CA_CERTS`, `LD_PRELOAD`, `BASH_ENV`/`ENV`), each
asserted absent from the constructed child; plus correct the overstated
module comment and the false store-probe backstop claim in the work history.
Red witnesses: admitting each of at least two structurally different names
(e.g. `GIT_ASKPASS` and `NODE_OPTIONS`) reddens the gate; and the git
env-injection helper is detected. The allowlist itself is already correct, so
this hardens the PROBE, not the scrub.

## O1 (low, folded in)

The three redirected directory targets (home, xdg-config, gh-config) are only
`mkdir`'d, not re-emptied, so a leftover store file from a prior same-taskId
incarnation survives a rebuild. Bounded (scrub root removed on
completion/rollback, only an equally-unprivileged prior child could write
there), so not an escalation path. Recursively re-empty the directory targets
as the file targets already are, or record the bound in a comment.

## The criteria lows

All three are non-code: branch one commit behind main (rebase at merge, which
this round does), a work-history citation quoting a code comment as a test
title (correct it), and the standing `Claude <noreply>` commit identity that
does not survive squash. Nothing to fix beyond the citation.

## Fix-round contract, binding

Name the mechanism (the probe derives its permitted set from the allowlist
under test, so it only bites the one gh denylist), not the seven channel
instances. Publish the derivation: the vocabulary walked, its source, and
what it does not cover. Red witnesses under at least two structurally
different admitted names plus the git env-injection helper. Claim grep last,
raw output, commit named. Update the branch onto main first. Both toolchains.
Suggested tier: strongest under the model rule (Opus), because this is the
security phase.
