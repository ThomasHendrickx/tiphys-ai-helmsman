# Arbitration, M3-P12: both reviewers said APPROVE and the arbitrator is sending a fix round anyway

- date: 2026-08-15
- arbitrator: orchestrator
- reviews: delivery/review/clean-room-m3-p12-criteria.md:1 and
  delivery/review/clean-room-m3-p12-hazard.md:1, both landing in THIS pull
  request under DR-0031
- head reviewed by both: `ca9ae71`
- outcome: **FIX ROUND 1 DISPATCHED**, round 1 of a hard cap of 2

## The disagreement, stated plainly because it is with the reviewers

Both returned APPROVE. The hazard reviewer found seven findings and disposed of
every one as TRACKED, on an argument that is correct as far as it goes:

> I could not reach DR-0032's forbidden state by any DISPATCH of this workflow
> at this head. Every finding needs an edit to `release.yml` first, which under
> DR-0027 makes them tracked items rather than blockers.

That reasoning is sound and it is being overruled for a reason the reviewer was
not positioned to weigh.

**DR-0027's tracked-item clause is about a gap reachable only by a future editor
OF THE GUARD ITSELF. This phase IS the guard.** Its entire deliverable is the
coupling between "a version was published" and "a tag exists". A finding that
the coupling is not actually asserted is not a gap in a guard's edges, it is the
guard's centre being decorative. The cap exists to stop grinding, and this is
round 1 of 2 on a phase that has had none.

The second reason is that the spec asked for exactly this. Its own "does NOT
establish" section reads: *"It does not claim the two conditions are sufficient,
only that each covers a failure the other does not. The adversarial reviewer
should look for a third."* HRB-2 IS the third. Commissioning a search, getting
the answer, and filing it is not a use of the tracked register.

## Four mechanisms, which is what the round is dispatched against

### N1: a safety property stated in PROSE and asserted by NOTHING

HRB-1 and HRB-3 are one defect. `needs: release` reads the release job's
CONCLUSION, and nothing couples that conclusion to `npm publish` having
succeeded. Measured by the reviewer: `continue-on-error` on the publish step,
`continue-on-error` on the job, `|| true` on the publish line, and DELETING the
post-publish registry verification are each invisible to the entire suite, with
controls that do redden, so the harness is not merely insensitive. Separately,
"nothing here retries and nothing here forces" is a comment: adding `--force`
to the tag push reddens no test.

This repository has now paid for this shape at least five times under the name
"a guard whose condition does not test the property that matters". Here it is
one level up: the property is not tested at all, only described.

### N2: the gates observe INTENT and a CONCLUSION, never the REGISTRY

HRB-2, the third failure mode. Gate 2 records operator intent, written before
`npm ci` even runs. Gate 1 records a runner conclusion. Neither observes whether
the version is actually on the registry. They coincide today only because one
unasserted step installs `$NAME@$VERSION` from it.

This is the M2 mechanism from M3-P10 exactly: **a check that MODELS the thing it
should READ.** The reviewer states HRB-1's fix closes this too, roughly twenty
lines, which is the argument for doing it now rather than recording it.

### N3: an anchor selected by SPELLING rather than by PROPERTY

HRB-4. `GIT_TAG_COMMAND` and `GH_RELEASE_COMMAND` select by command spelling, so
`git push origin "$SHA:refs/tags/v9.9.9"` and a `uses: softprops/action-gh-release`
step inside the write-granted job are both invisible. A new write-capable JOB
cannot evade, which is the half the phase got right; a new STEP in the existing
job can.

This is the round-2 search-scope mechanism one level along, and the phase closed
it for jobs while leaving it open for steps. Neither new predicate publishes an
exclusion list, unlike the inherited ones it was modelled on.

### N4: a witness member that does not redden against the DANGEROUS state

HRB-5. With the remote probe removed, `git push` refuses on its own and the
remote tag is unchanged, so that member reddens against the absent feature
rather than the dangerous one. Both members lean partly on a message regexp.
This is the red-witness stronger form, and it is notable that the same
implementer applied it correctly and unprompted elsewhere in this phase.

## Not in the round

- **HRB-6** (nothing restricts which ref may exercise the write grant) is an
  OWNER ACTION: the durable fix is a repository setting, not a code change. It
  is pre-existing for the publish path and this phase extends it to
  `contents: write`. To the register and to the owner.
- **HRB-7** is UNMEASURED and honestly so: the endpoint is 403 through this
  container's proxy and the reviewer says it could not settle it either way.
- **CR-P12-01 and CR-P12-02**, informational, reach nothing.

## What both reviewers established that the round must not undo

The hazard reviewer ran attacks that FAILED, and they are worth as much as the
findings. The expression evaluator holds against `!=`, `always()` and a bare
literal. No dispatch input can steer a write: the tag name derives from
`package.json`, never from `inputs.version`, and no `${{ }}` appears in any
`run:` body of either job. The two jobs cannot overlap. It also closed two of
the implementer's own open questions by reading `actions/checkout@v4`'s shipped
source, and found that `fetch-depth: 0` is load-bearing for the local tag check
in a way its comment does not say.

## What this arbitration does NOT establish

- **It does not re-derive either review.** Their measurements are taken as
  reported; the disagreement above is about disposition, not about facts.
- **It does not claim four mechanisms are all of them.** HRB-7 is unmeasured and
  the reviewer said so.
- **It does not predict one round closes them.** The cap is two and the second
  is the last.
