# M2-P8 credential-scoping: CLEAN-ROOM HAZARD review (second contract)

- Reviewer role: hazard reviewer, T-007 focus (find what criteria cannot describe)
- Declared hazard: a scrub that can be BELIEVED rather than PROBED; an allowlist
  widened by an implementer to turn a red gate green
- Subject: branch claude/m2-p8-credential-scoping @ af56782fbb50d8e56788f2f927277177f26aeb7a (checked out, verified)
- Merge base: 4c9bfbc
- Prior findings: CR-1365 (first contract; not in tree, reviewed independently)

## VERDICT: FIX-ROUND-NEEDED
One MEDIUM finding (H1). One LOW observation (O1). No credential leak exists in
the SHIPPED code (the allowlist is tight and sound); the MEDIUM is that the
gate's central anti-widening mechanism, and two in-artifact claims about it,
do not hold beyond gh's four token names, which is precisely this phase's
declared hazard.

## Gates (floor toolchain node v26.6.0, first on PATH)
- npm ci: exit 0 (EBADENGINE expected). npm run build: exit 0; git status clean after.
- Full suite: 10/10 NEW credential tests PASS. 4 failures, ALL in UNTOUCHED files
  (test/doctor.test.ts:93, test/watcher.test.ts:189/193/196), the named
  liveness/watcher real-clock family; host heavily loaded (7-9s/test). Work
  history documented 3 (93/189/193) with merge-base reproduction; I observed a
  4th (196: "a resident watcher and a concurrent single pass never both surface
  a wake", same untouched watcher.test.ts, same concurrency/real-clock family).
  Not attributable to this diff (diff touches no watcher/doctor/liveness file).
- No schema files changed (KNOWN confirmed; no schema-count failure).

## PRIMARY FINDING

### H1 (MEDIUM) - anti-widening tripwire covers gh's 4 token names ONLY; git/ssh/node credential+exec env vocabulary is not tripwired, and the stated store-probe backstop is false for the git env-injection vector
File: src/gates/credentials.ts:82-87 (GH_TOKEN_VARIABLES), :170-200 (environment
source probe), :262-290 (git-global/system probes); module comment :48-53;
work history delivery/work-history/m2-p8.md:313-322.

The scrub gate's environment-source probe does two things: (1) a derived-denylist
tripwire on gh's four documented token env vars, and (2) a "stray" check for any
name outside `permitted`. In a REAL gate run `permitted = permittedChildEnvNames()`
is derived from the SAME allowlist the gate constructs the child from
(credentials.ts:167 -> buildChildEnv), so the stray arm is TAUTOLOGICAL: built.env
contains only allowlisted+redirected names by construction, so no stray can ever
appear. The ONLY allowlist-independent check in a real run is the 4-name gh
tripwire. The stray arm does real work only in tests, where a hand-built env with
extra names is passed.

Consequence: for the declared hazard ("an allowlist widened to turn a red gate
green"), the gate makes widening cost a red for gh's four tokens ONLY. Every other
documented credential-resolving or code-executing env channel passes GREEN when
admitted to the allowlist.

Constructed evidence (attack/widen-probe2.mjs, real gh-free PATH = git+node):
```
[GH_TOKEN admitted (the ONE defended)] envProbe=resolvable  VERDICT=red
[GIT_ASKPASS admitted] envProbe=clean  VERDICT=green
[GIT_SSH_COMMAND admitted] envProbe=clean  VERDICT=green
[GIT_CONFIG_COUNT family admitted] envProbe=clean  VERDICT=green
[NODE_OPTIONS admitted] envProbe=clean  VERDICT=green
[LD_PRELOAD admitted] envProbe=clean  VERDICT=green
[SSH_ASKPASS admitted] envProbe=clean  VERDICT=green
```

The work history's backstop claim (m2-p8.md:320-322) is: "the store probes, which
do not depend on names at all" catch what the tripwire misses. This is FALSE for
the git env-injection vector. git's own GIT_CONFIG_COUNT/GIT_CONFIG_KEY_n/
GIT_CONFIG_VALUE_n vocabulary injects credential.helper at a scope the scrub's
--global/--system probes cannot see (attack/gitconfig-count.sh):
```
--- what git ACTUALLY resolves (no scope) ---
!echo password=PR_CAPABLE_TOKEN
exit: 0
--- what the scrub gate probes: --global ---   exit: 1  (reports clean)
--- what the scrub gate probes: --system ---   exit: 1  (reports clean)
```
So a GIT_CONFIG_COUNT-injected credential.helper (a PR-capable credential, since
a helper can return a GitHub PAT) is BOTH un-tripwired AND invisible to the two
git store probes. GIT_ASKPASS/SSH_ASKPASS/GIT_SSH_COMMAND/GIT_PROXY_COMMAND/
NODE_OPTIONS/LD_PRELOAD are not stores at all, so no store probe covers them
either.

Why this is a fixable gap, not inherent residue: MECHANISMS.md's denylist tier
prescribes "where a denylist is unavoidable, DERIVE it by walking the consuming
program's closed documented vocabulary once." The phase walked gh's token vocab
but NOT git's or ssh's credential/exec env vocabulary, even though the scrub
ALREADY treats git credential.helper (from config files, sources 3/4) as in-scope
and red. The asymmetry is concrete: a git credential.helper in a FILE reddens the
gate, but the same helper injected via GIT_CONFIG_COUNT env passes green. The fix
is a bounded vocabulary walk mirroring the gh walk (GIT_ASKPASS, SSH_ASKPASS,
GIT_SSH_COMMAND, GIT_PROXY_COMMAND, GIT_CONFIG_COUNT/GIT_CONFIG_KEY_n/
GIT_CONFIG_VALUE_n, and the general code-exec vars NODE_OPTIONS/LD_PRELOAD/
BASH_ENV/ENV), added to the tripwire and reddened under >=2 structurally
different members.

Overstated in-code claim (also correct per the "never overstate; an overstated
claim is how a defect hides" rule): the module comment credentials.ts:48-53 says
the tripwire "makes 'an allowlist widened by an implementer to turn a red gate
green' (this phase's declared hazard) cost a red instead of succeeding" without
the 4-name qualification. It should say it defends gh's four token env names only,
and name the remaining classes.

MECHANISM (not the instance): the gate verifies the child environment against a
`permitted` set DERIVED FROM the alllist under test, so its environment verdict
is believed (trusts the allowlist) rather than probed (independently dangerous)
for every name outside the single derived gh-token denylist. That is verbatim the
declared hazard for this phase.

## LOW OBSERVATION

### O1 (LOW) - "cannot smuggle configuration in" holds only for the 2 file targets, not the 3 directory targets
File: src/exec/env.ts:184-208; module comment :194-195.
buildChildEnv re-writes the two file redirect targets (gitconfig-global,
gitconfig-system) EMPTY on every build, but the three directory targets (home,
xdg-config, gh-config) are only mkdir'd (recursive, no clear). The comment "a
leftover from an earlier incarnation cannot smuggle configuration in" is true
only for the file targets. A hosts.yml/.netrc/.git-credentials left inside a
directory target by a PRIOR incarnation of the same task id survives a rebuild.
Bounded: spawn removes the scrub root on completion (spawn.ts:~503) and rollback
(:357); it is LEFT only on an "incomplete" outcome, and only an equally-
unprivileged prior child could have written there (no real credential in a
scrubbed child), so this is not a credential-escalation path. Worth a one-line
correction to the comment or a recursive re-empty of the directory targets.

## ATTACK TABLE (channel, construction, outcome)
| Channel | Construction | Outcome |
|---|---|---|
| NODE_OPTIONS/NODE_EXTRA_CA_CERTS/LD_PRELOAD/BASH_ENV/ENV/GIT_SSH_COMMAND/GIT_PROXY_COMMAND/GIT_ASKPASS/SSH_ASKPASS/GIT_CONFIG_COUNT+KEY+VALUE/GIT_DIR/GIT_WORK_TREE/SSH_AUTH_SOCK/XDG_DATA_HOME/XDG_CACHE_HOME/GIT_CREDENTIAL_CACHE_SOCKET/CURL_HOME/NETRC/GH_*/npm_config_*/AWS_* all set in parent | buildChildEnv(parent) (attack/build-env.mjs) | NONE cross; leaked count 0. Allowlist SOUND for current code. |
| gh's 4 token vars admitted to allowlist | permittedChildEnvNames([n]) (attack/four-tokens.mjs) | RED for all four (tripwire complete for gh ENV tokens). GH_HOST alone -> green (correct; no token). |
| GIT_ASKPASS/SSH_ASKPASS/GIT_SSH_COMMAND/GIT_CONFIG_COUNT-family/NODE_OPTIONS/LD_PRELOAD admitted to allowlist | widen-probe2.mjs | GREEN. MISSED. (H1) |
| GIT_CONFIG_COUNT credential.helper resolution vs scrub's scoped probes | gitconfig-count.sh | git resolves helper (exit 0); --global & --system see nothing (exit 1). Store-probe backstop FALSE. (H1) |
| PATH pass-through | env dump (spawn test) shows dump.PATH === parent PATH | Full parent PATH crosses. A pre-existing malicious gh/git-credential-* shim on PATH would be inherited AND the gate's own git/gh probes would run through it; but that requires prior compromise of a PATH dir, out of the scrub's threat model, and every credential store is redirected so a shim has nothing real to read. Noted, not a finding. |
| repo-local .git/config credential helper in the worktree | reasoned + code | The scrub GATE runs in its evidence dir, has NO worktree, so it structurally cannot probe repo-local config (out of the environment-scrub's scope). At spawn time a worktree .git/config helper resolves against the redirected HOME (empty stores); an absolute-path or !command helper could reach outside, but a payload that can write .git/config already runs arbitrary code and can read absolute paths directly - the scrub never claims filesystem sandboxing. Not a new capability. Noted. |
| Self-poisoning: payload writes hosts.yml into redirected GH_CONFIG_DIR that the hook child then reads | code (spawn.ts builds ONE childEnv, passes it to BOTH launches) | Payload and hook SHARE one scrub root. But both are equally unprivileged (no real token to write), and the root is removed at task end. See O1 for the rebuild-not-cleared directory-target nuance. Sibling TASKS have distinct scrub roots (per-taskId). Not an escalation path. |
| Moved PR creation (full mode) | diff of stub-payload.sh + m1-exit-test.sh | gh pr create REMOVED from payload; performed by the harness (m1-exit-test.sh A6) in the orchestrator's own env, OUTSIDE the scrubbed child. Payload path cannot reach a PR credential in either mode (local: file:// remote only). Correct per R-008. |

## INTEGRATION PROBES (M2-P1)
- credential-scrub direct: green, units=6 (sources, not names), well-formed
  GateResult, real subprocess probes (git config x2, gh-if-present), exit 0.
- credential-token absent-token: not-applicable, exit 20, detail names A-3 +
  TIPHYS_IMPLEMENTER_TOKEN, never green.
- credential-token token-present: error, exit 21 (suite test credential-token-
  fails-closed passed; fail-closed per M2-C-3 / T-003 lesson 4).
- tiphys gates run over the manifest: "declared 3 applicable 2 verdict 2 green 2
  red 0 not-applicable 1 error 0 vacuous 0", exit 0. Both credential records in
  the bundle well-formed; credential-token not-applicable names A-3 via
  precondition id "implementer-token-present-owner-action-a-3".
- M2-C-6: reads via readRegularFileIfPresent, writes preceded by
  refuseOpenForWrite (delivered helpers, no second implementation). Verified.
- T-005 one-mechanism: spawn and the gate both call buildChildEnv with
  parentEnv=process.env; only scrubDir location differs, which does not affect
  which names cross or which pointers redirect. No drift. Confirmed by
  attack/build-env.mjs (mechanism) matching the spawn test (integration).

## ATTEMPTED, NOT CONSTRUCTED (with reasons)
- Live token probe (credential-token green path): owner-blocked (A-3 not
  provisioned; TIPHYS_IMPLEMENTER_TOKEN absent; container gh API unusable per
  warning 6). Correctly deferred; gate fails closed. Not constructible here.
- gh CLI resolution arm of the gh-configuration probe: no gh binary on this
  container's default PATH, so the `gh auth status` branch is not exercised
  locally; the file-store branch is exercised. The tests stage a gh-free PATH
  deliberately (warning 6). Left to CI/exit-test.

## What is SOLID (so a fix round stays targeted)
Allowlist mechanism (no smuggling channel crosses); redirection (all 5,
override-last); both children scrubbed with hook witnessed separately;
PR-creation moved to harness (R-008); credential-token fail-closed + A-3 naming;
runner integration + well-formed results; M2-C-6 reuse; T-005 one-mechanism.
The fix is scoped to H1 (extend the derived tripwire to git/ssh/node vocabulary;
correct the module comment and the work-history store-probe backstop claim) and
optionally O1 (directory-target clearing / comment correction).
