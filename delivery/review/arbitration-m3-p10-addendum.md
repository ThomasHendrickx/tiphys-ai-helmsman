# Arbitration addendum, M3-P10: the cap is spent, and the phase merges

- date: 2026-08-14
- arbitrator: orchestrator
- supersedes nothing in delivery/review/arbitration-m3-p10.md:1; it continues it
- head: `a730903`
- outcome: **MERGES**, at DR-0027's hard two-round cap, with residues recorded

## What happened after the first arbitration

| step | outcome |
|---|---|
| fix round 1 | three mechanisms addressed; derivations published; a SECOND site of the manifest walk found in `package.json` that the reviewer had noticed and not charged |
| delta verification | **NOT VERIFIED.** M2 and M3 closed. M1 OPEN, one HIGH |
| fix round 2 | mechanism closed at the level the verification attacked, plus two sites nobody attacked, plus one defect inside its own correction |

**Round 1's verification is the reason this phase is safe to merge, and it is worth
saying why in one sentence: the pull request was CI-GREEN at the round-1 head
while carrying a HIGH that would have published on every dispatch.** That is the
second consecutive phase where a green bundle and a real defect coexisted at a
fix-round head. Both were found by a verification, neither by a gate.

## The defect round 1 introduced, because it is the transferable part

Round 1 closed "a guard is asserted by its TEXT rather than EVALUATED" and
re-introduced the same mechanism one size smaller INSIDE THE CODE THAT CLOSED
IT. The new evaluating test selected the publish step with
`steps.find(s => s.run.includes("npm publish"))`, first match. The verifier
inserted a decoy step carrying the expected condition, deleted the real publish
step's condition entirely, and all three tests stayed green.

`release.yml` already contained a second step whose body reads "npm publish did
NOT run", so the match survived only by ordering. And round 1's own work history
DECLARES that exact mislabel for its evidence classifier. The implementer found
the defect in its evidence and did not look for it in its guard.

That is the fifth consecutive round of T-020's pattern
(delivery/tuition/T-020-four-rounds-each-reintroduced-the-mechanism-they-closed.md:1),
and the fifth is the first one caught by a verification rather than by the next
review round.

## What round 2 did beyond its brief, which is the reason it is trusted

Three things, none of which it was asked for:

1. **It found the mechanism inside its own correction.** Counting publish STEPS
   was one scope too wide: a `yarn publish` added to the same guarded step left
   the count at one and passed, because the step really was guarded while the
   claim is that one artifact publishes once. It now counts invocations, and it
   recorded the discovery rather than quietly patching it.
2. **Its derivation found a site nobody attacked.** `[0]` on `npm pack --json`
   in two files, reporting one member of a set as the package. There are no
   workspaces here, and it wrote that down as a fact to check rather than a
   reason not to fix it.
3. **It corrected a false claim against itself.** It nearly wrote that
   `gates.yml` is outside this phase's declaration. It is not: `gates.yml` is on
   `filesToTouch` and this branch touches it. The real reasons are the
   dispatch's instruction and the tracked-findings routing. Found by running the
   settling command for a claim-grep hit, which is the claim grep doing exactly
   what it exists for.

Its witnesses meet the standard the round was set: neither member of the
identification witness mutates a condition line, because that was the member it
already had. One adds a second real publish step in the same job, so every
condition byte is identical and only the COUNT changes; the other adds a second
job, so the SCOPE changes.

## Why there is no third verification, stated as an argument rather than assumed

The cap is spent, so a verification could not lead to a fix round on this
branch. It could still lead to abandonment, or to a follow-on phase, so "it
could change nothing" would be a false reason and is not the one being given.

The real reason is that **a strictly stronger witness is available and cheap,
and round 2 named its absence itself: no workflow has ever been run.** Every
check on this machinery so far, by three agents across two reviews and a
verification, has been static analysis of YAML and shell. The release workflow
can be dispatched in REHEARSAL, which executes every step on a real runner,
including the pre-publish release verification that round 1 moved ahead of the
publish, and stops before the irreversible action. That is an end-to-end
execution rather than another reading, and it closes the one exclusion every
piece of evidence in this phase shares.

So the sequence is: merge, observe the post-merge push run to completion, then
rehearse the workflow, and only then does the owner's publish become the next
question.

## DR-0012's literal condition is NOT met, and that is stated rather than papered over

DR-0012 delegates merge authority conditional on two independent clean-room
reviews of the SAME HEAD both returning APPROVE with no unresolved high or
medium finding. That is not what happened. The reviews are at `8d056f6`, one
APPROVE and one REQUEST CHANGES, and the head being merged is `a730903`.

DR-0027 is what governs here and it is later: it caps a branch at two fix
rounds, after which the phase merges with findings recorded or is abandoned.
The choice being made is the first, and the reasoning is the three points above
plus the residues below being either unreachable or routed to an owner.

Recording the deviation matters more than the deviation. A merge that quietly
claims a condition it does not meet is how a delegated authority stops meaning
anything.

## Merged carrying these

Every one is also going to delivery/review/tracked-findings-register.md.

| id | what | why not blocking |
|---|---|---|
| DV-3 | `${{ }}` into `actions/github-script`'s `with: script:` is invisible to the interpolation assertion | declared by the round; no such site exists at this head |
| DV-4 | a zero-dependency tree reads as "run npm ci" when npm install did run | not reachable here (3 dependencies) and `scripts/` does not ship |
| DV-5 | npm puts `dev:true` on the `vendor/x` lock key rather than the `node_modules/x` link key, so a dev `file:` dependency reads as production | not reachable at this head; the shipped set was verified unchanged, 10 of 10 |
| DV-7 | what the pre-publish step executes is a re-pack, not the published bytes, because `npm publish` repacks | no divergence demonstrated; `npm publish <tarball>` would close it |
| HRB-4 | `== false` coercion; the input is now a `confirm` string that the verifier measured failing closed on all nine off-table values | reachability was never established, by the reviewer or by either round, and it is not being claimed now |
| round-1 residues | the `.npmrc` registry-redirect gap (records do not carry which registry answered); workspaces, npm aliases and `auto-install-peers` untested | each is a gap in coverage rather than a wrong answer at this head |
| criterion 6 | the M3 exit test | its own dispatch, blocked on the publish |

## DV-8 is NOT this phase's and is the one that needs an owner

`gates.yml` interpolates `github.head_ref` into a shell inside a
`$(printf | sed)`. `claude/m3-p1-"$(id)"` is a legal ref name, `on: pull_request`
is unfiltered, and there is no `permissions:` key on the job. The verifier
established that it is exploitable, not merely shaped like a risk.

This branch touches `gates.yml` and was told not to touch that line, because a
last round is not where a security fix in an unrelated concern belongs. It goes
to the register and to the owner. The verifier's finding against the ROUND was
precisely that it lived only in a work history, and that is now fixed.

## What this addendum does NOT establish

- **No workflow has been executed.** Every claim about `release.yml` in this
  phase, from three agents, is static. The rehearsal above is the plan for
  closing that and it has not happened yet.
- **It does not claim the mechanism class is exhausted.** Round 2's derivation
  was scoped to four files and it said so, and it named the search forms it used
  rather than the forms that exist: a `for` loop with a `break` matches none of
  them.
- **It does not re-derive round 2.** Unlike round 1, round 2 has no independent
  verification, which is the cost of the cap and is recorded here as a cost
  rather than presented as a completed check.
