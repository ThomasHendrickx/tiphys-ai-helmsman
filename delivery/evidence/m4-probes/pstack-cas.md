# PROBE: git push --force-with-lease as a cross-environment CAS register

Key: pstack-cas
Started: (see first timestamp below)
Scratch: /tmp/claude-0/m4-probes/pstack-cas/
Remote under test: ThomasHendrickx/tiphys-ai-helmsman-fleet (real, private, empty)
Kernel repo refs: NOT TOUCHED. Read-only reads of src/ only.

## Failure arm, declared BEFORE any result

This probe can distinguish exactly three outcomes and will label each:

- WORKS: a captured command with exit 0 for the winner and a captured
  command with NONZERO exit plus a stderr string that names the ref and
  the stale-info condition for the loser.
- REFUSED: a captured nonzero exit whose stderr shows the remote or the
  proxy rejecting the operation (403, auth, pre-receive hook). This is a
  finding AGAINST M4-D-11 and will be reported as such.
- COULD NOT TEST: I will use those words. Specifically, if the remote is
  unreachable, or if I cannot get two pushes close enough together to
  observe contention, I will say "I could not test it" and not infer.

Ambiguity test for item 3 is stated in advance so it cannot be
rationalised after the fact: the loser's refusal is a CAS only if its
stderr differs from a network failure's stderr by a string I can grep
for deterministically. I will run a real network-failure arm (unroutable
remote) and diff the two.

## Log

Tue Sep 15 23:10:16 UTC 2026

### R1. Setup (exit codes captured)

    git --version                       -> git version 2.43.0, exit 0
    git clone <fleet> envA              -> exit 0, "warning: You appear to have cloned an empty repository."
    git clone <fleet> envB              -> exit 0, same warning
    git -C envA ls-remote origin        -> exit 0, ZERO refs (remote genuinely empty)

Two distinct lease commits built with plumbing (no checkout, no branch):
  A = ddc5b1030535d47dc113778aef6e193aa477ae24
  B = e6f90e1e08c30578f341fdae370a92ffd7bfccc9

### R2. FIRST RACE: BOTH PUSHES REFUSED BY THE TRANSPORT, 403

    ./race.sh refs/tiphys-probe/lease "" $A $B race1

A rc=1, B rc=1. IDENTICAL stderr from both:

    fatal: expected 'acknowledgments', received 'packfile'
    warning: push negotiation failed; proceeding anyway with push
    error: RPC failed; HTTP 403 curl 22 The requested URL returned error: 403
    send-pack: unexpected disconnect while reading sideband packet
    fatal: the remote end hung up unexpectedly
    Everything up-to-date

Remote after: still zero refs.

This is NOT a CAS result. Nobody won. Reads work (ls-remote exit 0),
writes are refused. Diagnosing whether this is repo-level (app not
installed on the -fleet repo, compare STATE.md A-6) or a general push
block, before drawing any conclusion about --force-with-lease.

### R3. The 403 is NAMESPACE-scoped, and --dry-run LIES ABOUT IT

Real pushes of the same commit from the same clone, one variable changed:

    git -c push.negotiate=false -C envA push origin $A:refs/tiphys-probe/lease  -> RC=1, HTTP 403
    git -c push.negotiate=false -C envA push origin $A:refs/notes/tiphys-probe  -> RC=1, HTTP 403
    git -c push.negotiate=false -C envA push origin $A:refs/tags/tiphys-probe   -> RC=1, HTTP 403
    git -c push.negotiate=false -C envA push origin $A:refs/heads/tiphys/lease  -> RC=0, "* [new branch]"

The SAME four with --dry-run: ALL FOUR RC=0, all four printed
"* [new reference]" / "* [new tag]" / "* [new branch]".

So --dry-run reported success for three pushes that really fail. This is
an INDEPENDENT second instance of CLAUDE.md standing warning 14, which
recorded the same lie for --delete. The trap is wider than deletion:
push --dry-run does not probe the authorization it appears to probe.

    curl .../info/refs?service=git-receive-pack -> HTTP 200 on BOTH repos

so the write advertisement is authorized; the refusal happens on the
RPC POST.

ATTRIBUTION, STATED AS UNCERTAIN: refs/tags/* is a namespace GitHub
plainly allows in normal use, so a 403 on it points at the agent proxy
at $HTTPS_PROXY rather than at GitHub. I COULD NOT TEST that directly:
I cannot bypass the proxy to reach GitHub and compare. Treat "custom ref
namespaces are unusable" as a property of THIS CONTAINER, measured, and
as UNKNOWN for a real developer machine.

CONSEQUENCE FOR M4-D-11: the phrase "a dedicated ref" must be read as
"a dedicated BRANCH under refs/heads/". Everything below uses that.

### R4. CREATE race (both expect the ref ABSENT): exactly one won

    ./race.sh refs/heads/tiphys/lease-r1 "" $A $B race2

Both launched against a shared spin barrier, 0.5s of pre-warm, released
by one touch(1).

    A rc=1:
      ! [remote rejected] ddc5b10... -> tiphys/lease-r1 (cannot lock ref
        'refs/heads/tiphys/lease-r1': reference already exists)
      error: failed to push some refs to '...'
    B rc=0:
      * [new branch]      e6f90e1... -> tiphys/lease-r1

Remote afterwards: e6f90e1 (B). EXACTLY ONE WINNER.

### R5. UPDATE race (both observed the SAME value, both swap): exactly one won

Both clones read the ref, both got e6f90e1e08c30578f341fdae370a92ffd7bfccc9,
both built a child commit, both pushed with expect=e6f90e1.

    A rc=0:
      e6f90e1..1b11039  1b110395... -> tiphys/lease-r1
    B rc=1:
      ! [remote rejected] a750c49... -> tiphys/lease-r1 (cannot lock ref
        'refs/heads/tiphys/lease-r1': is at 1b110395e8e4d4056df7bbd0590662aa9d5f2027
        but expected e6f90e1e08c30578f341fdae370a92ffd7bfccc9)
      error: failed to push some refs to '...'

Remote afterwards: 1b11039 (A). EXACTLY ONE WINNER, and the loser's
message names BOTH the actual and the expected value, which is a fencing
token for free. Winner alternated between the two races (B then A), so
no systematic ordering bias was observed in two trials. Two trials is
not a distribution; I am not claiming fairness, only that neither side
is structurally starved.

### R6. What --force-with-lease ADDS, isolated

Ref at 1b11039 (A holds). B builds an ORPHAN takeover commit 1ae4edb,
which is not a descendant, so an ordinary push cannot land it.

    T1 plain push                               RC=1  ! [rejected] ... (fetch first)
    T2 --force-with-lease=REF:<STALE e6f90e1>   RC=1  ! [rejected] ... (stale info)      ref UNCHANGED
    T3 --force-with-lease=REF:<CORRECT 1b11039> RC=0  + 1b11039...1ae4edb (forced update)

So the takeover a stale-lease scheme needs is a FORCED update, and
--force-with-lease is exactly the thing that makes that forced update
safe. Plain push cannot express takeover; --force alone expresses it
unsafely; --force-with-lease=<explicit sha> expresses it as a CAS.

TWO DISTINCT REFUSAL MECHANISMS, both observed, and they are not the same:

  (stale info)                 = git's own check against the ref value the
                                 remote ADVERTISED on this connection. Client
                                 side, nothing sent.
  [remote rejected] cannot     = the remote's atomic ref transaction refusing
  lock ref ... but expected      because the ref moved BETWEEN the advertisement
                                 and the transaction. Server side.

R5's loser got the SERVER-side one. That is the load-bearing observation:
the atomicity is enforced at the remote, not merely optimistically at the
client, so the race window between read and write is closed by the server.

### R7. THE TRAP: the BARE form does NOT protect. Measured.

`--force-with-lease` with no explicit expected value uses the LOCAL
remote-tracking ref, so any fetch first silently re-arms the lease.

Ref at 1ae4edb, B is the live holder. A is stale and believes it holds
1b11039. A runs an ordinary fetch, then the bare form:

    git -C envA fetch origin refs/heads/tiphys/lease-r1:... --force   RC=0
    git -C envA push --force-with-lease origin febd503:REF            RC=0
      + 1ae4edb...febd503 (forced update)

A CLOBBERED THE LIVE HOLDER WITH NO REFUSAL AT ALL. This is the
"guard that cannot go red" shape. Any M4 implementation MUST pass an
explicit `<refname>:<sha>` expectation; the bare form is a guard that
a routine fetch disarms.

### R8. AMBIGUITY (probe question 3): a refusal IS distinguishable, with care

Real failure arms captured as files under arms/ :

    ARM            RC   stderr signature
    winner         0    "+ ... (forced update)"
    servercas      1    "! [remote rejected] ... cannot lock ref ... but expected <sha>"
    serverlost     1    "! [remote rejected] ... cannot lock ref ... reference already exists"
    staleinfo      1    "! [rejected] ... (stale info)"
    ns403          1    "error: RPC failed; HTTP 403 curl 22"
    netdns         128  "fatal: unable to access ... Could not resolve host"
    netrefused     128  "fatal: unable to access ... Couldn't connect to server"
    netnorepo      128  "remote: access denied by the git proxy ... 403"

classify.sh, written failure-arm-first (anything not positively
recognised is INDETERMINATE), run over all eight:

    winner WON | servercas LOST | serverlost LOST | staleinfo LOST
    ns403 INDETERMINATE | netdns INDETERMINATE | netrefused INDETERMINATE
    netnorepo INDETERMINATE

VERDICT ON QUESTION 3: yes, a lost race is mechanically distinguishable
from a network failure, BUT NOT BY EXIT CODE ALONE. The ns403 arm is a
transport failure that also exits 1, so "nonzero means I lost" is WRONG
and would make a caller believe another environment holds the lease when
in fact nothing does. The discriminator has to be the stderr signature,
and the third state INDETERMINATE has to exist. A two-state
"won / lost" API over this primitive is a defect.

### R9. STALE HOLDER (probe question 4)

Half 1, the SAFETY half. A holds refs/heads/tiphys/lease-r2 with
durationSeconds=6 and renews every 2s by pushing a child commit with
expect=<current>. B observes c156ed1, waits 5s, judges A stale (WRONGLY:
A is alive), and attempts takeover with expect=c156ed1.

    renewer: renew1 rc=0 -> 87a4ec4
             renew2 rc=0 -> 3f522f9
             renew3 rc=0 -> f161d97
             renew4 rc=0 -> fa3808e
    B takeover of a LIVE renewing holder: RC=1
      ! [rejected] 1b995af -> tiphys/lease-r2 (stale info)

THE LOAD-BEARING RESULT: B's freshness judgement was WRONG and no double
holder resulted. Renewal moves the ref, so a stale expectation cannot
land. Safety does not depend on the freshness rule being right; the
freshness rule only controls how fast a genuinely dead holder is
reclaimed. That is the opposite of the file lease, where a wrong
judgement produces two holders.

Half 2, the LIVENESS half. The renewer exits (A "vanishes"). B measures
on ITS OWN clock:

    B elapsed=7s, ref fa3808e -> fa3808e, unchanged=YES
    observed lease: {"holderId":"A-renew-4","acquiredAtEpoch":1789514183,"durationSeconds":6}
    B takeover of a VANISHED holder: RC=0
      + fa3808e...4b1c3bd (forced update)

Evidence B used: THE REF VALUE DID NOT MOVE for longer than the holder's
declared renewal interval. No process probing, no pid, no signal, no
/proc. That satisfies C-2: liveness is lease freshness, and freshness
here is "the register changed".

### R10. CLOCK DEPENDENCE (probe question 5): the scheme need not have any

A claims with acquiredAtEpoch set ONE YEAR in the future (1821050230 vs
B's 1789514230), simulating a fast clock. Two decision rules, same data:

    RULE 1, compare timestamps (what src/lock.ts isExpired does):
      expiresAt by A's clock = 1821050236, B's now = 1789514230
      verdict: expired=False -> WAIT FOREVER

    RULE 2, locally-measured no-change interval:
      elapsed on B's clock = 9s > declared renewal interval 6s
      ref unchanged = YES
      verdict: takeover.  Takeover RC=0, + af1ea7d...e3df60c

So the CAS scheme has NO clock dependence PROVIDED the freshness rule is
written as a locally-measured DURATION over the register, not as a
comparison of a remote timestamp against the local clock. durationSeconds
travels as a number of seconds, which is clock-free; acquiredAt is an
absolute timestamp, which is not. Carrying acquiredAt at all is a trap: it
invites rule 1.

And even rule 1's failure mode is bounded by the CAS: skew the other way
(A's clock slow) makes B judge a live lease expired, and the CAS then
refuses the takeover, so the damage is delay, not a double holder.

NO SERVER-SIDE CLOCK IS AVAILABLE as an escape:

    GET /repos/.../commits/<sha>  -> HTTP 200
      author.date    = 2026-09-15T23:18:54Z
      committer.date = 2026-09-15T23:18:54Z
      server-receipt field: NONE

Both dates are the holder's own clock written into the object. The API
exposes no push-receipt timestamp on a commit, so "ask the server what
time it received this" is not on the table.

### R11. RED WITNESS (probe question 6): today's lease does not exclude

Built a real fleet home with EXACTLY src/fleet.ts:28's FLEET_IGNORED
(`state/`, `worktrees/`, `projects/`), pushed it, and cloned it TWICE
from the one remote so the "two directories, of course" objection does
not apply.

Control first, so the witness can be seen to be able to fail:

    node redwitness2.mjs <kernel> homeA homeB
      PRECONDITION FAILED: not a clone: .../homeA     exit 2

The witness, using the REAL src/lock.ts via computed-URL dynamic import
(CLAUDE.md standing warning 4), node v22.22.2, no build needed:

    PRECONDITION OK: one remote .../tiphys-ai-helmsman-fleet.git
                     one head 970cd5bdc98686c8bf89973cdbe41d6b67507c7f
    [ {"home":"fleet1","ok":true,"holderId":"414d4f41-...","hostname":"vm"},
      {"home":"fleet2","ok":true,"holderId":"ef79f137-...","hostname":"vm"} ]
    BOTH CLONES OF THE SAME FLEET HOLD THE LEASE: true      exit 0

And the lock cannot travel to close it:

    git -C fleet1 check-ignore -v state/orchestrator.lock
      .gitignore:1:state/   state/orchestrator.lock        RC=0
    git -C fleet1 add -A ; git -C fleet1 status --porcelain
      (empty)

Note also both leases carry hostname "vm". Even if some future code DID
compare lease.hostname (src/lock.ts:415 writes it, nothing reads it),
it would not separate these two environments.

THIS IS THE DANGEROUS STATE the M4 test must redden against: two
acquireLease calls against two clones of one fleet, both ok:true. A test
that merely asserts "a second acquire in the SAME directory fails" is
green today and worthless, which is the T-003 shape.

### R12. Latency, for scoping

Full claim cycle (ls-remote + build commit + force-with-lease push),
5 consecutive trials, all rc=0:

    1939 ms, 1894 ms, 1762 ms, 1881 ms, 2165 ms

So a renewal interval below roughly 10s is not practical over this
transport, and a lease duration in the src/lock.ts range (900s, renew at
half-life) is comfortable.

### WHAT I DID NOT COVER

1. Whether the custom-namespace 403 (R3) is GitHub or the agent proxy. I
   cannot bypass the proxy. UNKNOWN for a normal developer machine.
   recentRelayFailures was [] after the 403s, so the proxy did not log it
   as a relay failure, which argues for GitHub but does not settle it.
2. Two REAL machines. Both "environments" are two clones on ONE host,
   ONE filesystem, ONE clock, ONE hostname ("vm"). The clock-skew result
   (R10) is simulated by writing a skewed timestamp into the lease, not
   by skewing a real clock. Network partition between the two claimants
   and the remote was NOT tested at all.
3. Branch protection. The fleet repo has no protected branches and no
   default branch yet. A repo whose ruleset covers `refs/heads/**` would
   change the R4/R5 results, and the lease branch would be caught by it.
   NOT TESTED.
4. Concurrency beyond N=2, and more than 2 trials per race. I ran two
   races and each had one winner. That is not a fairness distribution and
   I do not claim one.
5. Non-fast-forward GC. Every losing/abandoned lease commit becomes
   unreachable on the remote after a forced update. Whether GitHub
   eventually reclaims them, and whether a long-running lease branch
   accumulates cost, was NOT measured.
6. Whether a pre-receive hook or GitHub ruleset could make the refusal
   message differ from the two signatures classify.sh recognises. If it
   can, classify.sh would return INDETERMINATE, which is the safe
   direction, but I did not force that case.
7. `--atomic` multi-ref pushes, and whether a lease plus a payload can be
   swapped as one transaction. Not tested.

### LEFTOVER STATE I CANNOT CLEAN UP (owner action)

CLAUDE.md standing warning 14: this container cannot delete a remote ref.
These refs now exist on ThomasHendrickx/tiphys-ai-helmsman-fleet and I
cannot remove them:

    refs/heads/probe-lease-a
    refs/heads/probe-fleet-home
    refs/heads/tiphys/lease-r1
    refs/heads/tiphys/lease-r2
    refs/heads/tiphys/lease-r3

The kernel repository's refs were NOT touched. Reads of its src/ only.

CORRECTION to the leftover list above, from the final ls-remote: there
are SIX, not five. `refs/heads/tiphys/lease` was also created (R3's
successful arm) and I omitted it. Full measured list:

    970cd5b  refs/heads/probe-fleet-home
    ddc5b10  refs/heads/probe-lease-a
    ddc5b10  refs/heads/tiphys/lease
    302528d  refs/heads/tiphys/lease-r1
    4b1c3bd  refs/heads/tiphys/lease-r2
    e3df60c  refs/heads/tiphys/lease-r3
    ddc5b10  HEAD (the repo had no default branch; the first push set it)

That last line is a real side effect worth flagging: pushing to an empty
repository set its default branch to the probe branch.

### VERDICT

M4-D-11's mechanism WORKS against this project's real remote, with three
conditions that are not in the recommendation as written:

1. The ref must be under refs/heads/ IN THIS CONTAINER (R3).
2. The expectation must be an EXPLICIT sha. The bare --force-with-lease
   is disarmed by any fetch and clobbers a live holder silently (R7).
3. The caller needs THREE outcomes, not two. Nonzero does not mean lost
   (R8).

The strongest result is R9: the CAS makes lease safety independent of the
freshness judgement, which is exactly the property the file lease lacks
(R11) and exactly what C-2 needs.
