# M6-P7 arbitration (tier `pair`)

## Round 0 (head e77ff1d, M6-P7 with M6-P5 and `main` merged in)

Review A, kernel-launched, strongest tier (claude-opus-5, $6.60):
m6-p7-hazard-a.json, FIX-ROUND-NEEDED. CR-M6P7A-01 medium: an executor's
declared `environment` is applied after the credential-store redirection, so
an executor declaring HOME gives the reviewer the kernel's real HOME and its
git credentials (measured with the stub executor). Lows: CR-M6P7A-02 (the
`-c` key names are not checked against captured CLI output), CR-M6P7A-03
(`review-executor` read from the current directory, not the repository
root; fails closed).

Ruled: fix round 1 for A-01 only. A-02 and A-03 recorded, no change (the
owner's narrowing rule after M6-P5: a fix round carries the mediums).
Then, at the fixed head, review B (full) and a short final-head check of the
fix; a fix proven red-then-green by its named test needs no re-check beyond
that.

## Fix round 1 (head f99b8d7)

CR-M6P7A-01 fixed (edb73de): a declared credential-store pointer is refused
before anything is created, and the join sets the five pointers back last.
Named test in test/codex-review.test.ts (behavior
m6-p7-harness-environment-credential-store-pointer), red with the old
src/review.ts (the reviewer read the kernel's HOME and its credentials),
green after. Witness spec, three members, each red by hand. Suite 1245
pass, 0 fail, 0 skipped (node v26.6.0, dist built, `npm test`).

Open item from the fixer, ruled low, no change: an executor that appends to
its own `environment` array inside `command()` passes the refusal. The
executor module runs inside the kernel's process with the kernel's
environment, so it could pass a token in argv just as well; the refusal
bounds an honest executor's declaration, as DR-0065's grant bounds an honest
reviewer.

At f99b8d7: check C (the fix, strongest, kernel-launched, $2.41): APPROVE,
m6-p7-hazard-c.json. Low CR-M6P7C-01: the executor's `environment` array is
bound by reference, so an executor that changes it inside `command()` passes
the refusal; C agrees with the ruling above (low, no change). Review B at
f99b8d7 was killed by a container restart before it wrote a record.

## Final-head reviews (code head 1b8de3e)

- reviews: delivery/review/m6-p7-hazard-b.json, delivery/review/m6-p7-hazard-d.json

The final M6-P5 head `fcc026b` (reviewed under M6-P5) merged in at 1b8de3e,
without conflict. Two kernel-launched strongest-tier reviews at 1b8de3e:

- B ($6.44, full review against DR-0065 and the plan's five hazards):
  APPROVE. It mutated the guards for hazards 3 and 4 and saw each red. Three
  lows, no change (fix rounds carry mediums):
  CR-M6P7B-01, Codex accepts an unknown `-c` key silently, so the grant's
  keys are proven only against CLI 0.159.2 (the work history says so);
  CR-M6P7B-02, the "names no review-executor" refusal has no test of its own
  (the code path fails closed);
  CR-M6P7B-03, the credential-store pointer guard reads only the object form
  of an `environment` entry; the reviewer's probe shows the allowlist guard
  refuses the bare-string form, so the two guards together refuse both.
- D ($1.53, final-head check): APPROVE, no finding. The merge brought exactly
  M6-P5's delta outside delivery/; CR-M6P7A-01's named test green and one
  witness member red by hand; codex-review and gate-registry tests 27 pass.

Known limit, already reported to the owner: Codex 0.159.2 emits no served
model, so a Codex review's family is not observed and it does not count
toward a pair.

## CI fix (code head d879764)

- reviews: delivery/review/m6-p7-hazard-e.json, delivery/review/m6-p7-hazard-f.json

Pull request #234's `pull_request` run 36793799175 (head `bcff075`) was red
on `red-witness`, rule (g): the classification witness
`witness/m6-p7-review-executor-from-charter.json` declared one dangerous
state. The fix adds a second member (`src/review.ts`, the arm that refuses an
unreadable `charter.yaml`, mutated into a silent fallback), shown red against
the same named test. The same round replaced a `$comment` that M6-P7 had
added to `schemas/charter.schema.json` with a one-line `description` (plan
criterion p4-diet), found by the final-report compilation. Work history "CI
fix"; local red-witness at d879764 green (455 witnesses, 4 own).

Two kernel-launched strongest-tier delta checks at d879764, both APPROVE with
no finding: E ($1.61) and F ($1.65). Each confirmed the delta is the witness
spec and the schema line, applied the new member by hand (red), and ran the
red-witness gate as CI runs it (green).
