# Arbitration addendum, M3-P12: the round asserted rather than rewrote, and that is why it merges without a verification

- date: 2026-08-15
- arbitrator: orchestrator
- continues delivery/review/arbitration-m3-p12.md:1
- head: `4b8699a`
- outcome: **MERGES.** One fix round spent of a cap of two.

## The overrule was right, and the round is the evidence

The arbitration overruled two reviewers to send this round. The strongest
confirmation is what the round did NOT have to change:

```
git diff ca9ae71 4b8699a -- .github/workflows/release.yml   # non-comment lines: 0
```

Re-measured by the orchestrator rather than taken on report. **The executable
content of the release workflow is byte-identical to the head both reviewers
approved.** The workflow was correct and unasserted, which is exactly what the
arbitration claimed: the guard's centre was decorative, not its behaviour wrong.
Every edit to that file in this round is a comment; the 2449 inserted lines are
`test/license-gate.test.ts`, `witness/` and `test/behaviors.json`.

Had the round rewritten the workflow, the overrule would have been a scope
widening dressed as a correction. It did not.

## Why there is no delta verification, stated as an argument

The previous phase's round 1 WAS verified and the verification found a HIGH that
CI was green over, so the default here is to verify. Three things override it,
and the third is the real one.

1. **The blast radius is bounded by the measurement above.** A defect introduced
   by this round cannot be a defect in the release path, because the release
   path did not change. It can only be a guard that fails to guard.
2. **The round attacked that exact class in its own new code, and found two.**
   The force predicate had the hole it exists to close, `(?:^|\s)\+[^\s]*:`
   requiring whitespace before a `+` that a quoted refspec does not have, and a
   member consequently STAYED GREEN. The sibling hole, `--force(?:=|\s|$)`
   missing `--force-with-lease`, came from the same audit. The harness reported
   STAYED GREEN rather than exiting quietly, which is the harness doing the job
   a verifier would have been sent to do.
3. **A STRICTLY STRONGER WITNESS IS ALREADY SCHEDULED.** DR-0033 requires a
   FRESH REHEARSAL of `release.yml` on the new `main` tip before the publish,
   because a gate result is evidence only for the configuration it ran under and
   this phase changes that configuration. That rehearsal EXECUTES the workflow
   on a real runner. Another static reading is a weaker instrument than an
   execution that is happening anyway.

## What the round did that is worth recording beyond the fix

- **N1's fix names neither job.** It asserts over the transitive `needs` closure
  of whichever job holds the write grant, derived from the graph, and asserts
  the closure non-empty so a closure of one cannot make it vacuous. That is
  select-by-property applied to the mechanism that produced N3.
- **N2's derivation over-matched and the round REPORTED that rather than tuning
  it away.** Three steps resolve a version from the registry; only one reads the
  published package. The `npm@11.18.0` pin is a false positive of its own
  predicate and is written down as one.
- **The tag job deliberately does NOT read the registry, for a measured
  reason.** delivery/STATE.md:1 records a packument 404 persisting four minutes
  after a successful publish. An `npm view` gate would therefore fail on exactly
  the publishes it exists to anchor. That is this morning's probe-lag finding
  being used correctly by a later phase, which is what the register is for.
- **N3's fix is an ALLOW-LIST, not a wider predicate**, after its own derivation
  came back incomplete and the round named that as the finding rather than
  widening the regexp until the output looked right.
- **N4 audited all 21 members of all 10 specs**, not the one the reviewer named.

## Merged carrying these

| id | what | why not blocking |
|---|---|---|
| HRB-6 | nothing restricts which ref may exercise the write grant | OWNER ACTION: the durable fix is a repository setting, not code. Pre-existing for the publish path, extended by this phase to `contents: write` |
| HRB-7 | the minimal-grant claim rests on a repository default the reviewer could not read, the endpoint being 403 through this container's proxy | UNMEASURED and honestly so, in both directions |
| CR-P12-01, CR-P12-02 | informational | reach nothing |
| N1 residue | `continue-on-error` runtime semantics were never executed, by the reviewer or the round | the fix asserts an ABSENCE, so it does not depend on knowing the semantics |
| N2 residue | whether `release-verify.sh`'s registry arm is CORRECT, and registry lag | out of this phase; lag is recorded in the register |

## What this addendum does NOT establish

- **It does not claim the four mechanisms are closed as classes.** Each
  derivation states its own gaps and N3's states that no derivation can
  enumerate every way to write a ref with a write token, which is why that fix
  is an allow-list.
- **It does not re-derive the round.** The executable-diff measurement is the
  orchestrator's; everything else is taken as reported.
- **No workflow has run at this head.** The rehearsal DR-0033 requires is the
  thing that will change that, and it has not happened yet.
