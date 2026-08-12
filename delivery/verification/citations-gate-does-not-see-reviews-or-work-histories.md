# The citations gate never checks reviews or work histories

- date: 2026-08-12
- author: orchestrator
- verdict: **CONFIRMED by reading the gate's own configuration.** Two
  independent clean-room reviewers raised it on the same day; this document
  establishes it from the registry rather than from their reports.
- severity: MEDIUM as a process gap. It blocks nothing today, and it is the
  reason a whole class of wrong citations has been passing. A THIRD limit was
  found while writing this document and is recorded below: the gate registry
  itself cannot be cited by line. See delivery/STATE.md:103 for the merge
  precondition this interacts with.
- measured at: `origin/main` c75152b.

## The evidence

The `citations` gate's precondition, read from `gate-registry.yaml` at the
repository root, is a `diff-touches` over exactly six paths. The gate itself is
implemented at src/gates/citations.ts:1.

(The registry path is written in backticks deliberately, and finding out why
added a third limit to this document. Written as a citation it is RED:
`gate-registry.yaml:1 matches no declared root (local or external)`. The
resolver has no root covering repository-root files, so **the canonical gate
registry cannot be cited by line from any document the gate checks.** That is
the same shape as the note already in CLAUDE.md that a phase's rows named a
file at the repository root and no grep saw it.)

```
"precondition": {
  "id": "citations-diff-touches-documents",
  "kind": "diff-touches",
  "paths": [
    "delivery/plan/",
    "delivery/verification/",
    "delivery/decisions/",
    "delivery/tuition/",
    "delivery/requirements/",
    "delivery/STATE.md"
  ]
}
```

**`delivery/review/` and `delivery/work-history/` are not in that list.** So a
pull request changing only reviews or only work histories does not even RUN the
gate, and a pull request that also touches a listed path runs it over the
listed documents only.

That second half was observed directly rather than inferred. A run on this very
branch, with FIVE changed documents of which one was a new
`delivery/review/` file, reported:

```
linted 4 changed document(s) at a929b61edda34fa22ac8fd48dc37ac72ce28039a:
18 citation(s) resolved, 0 self-citation(s), 0 unverifiable-external
```

Four, not five. The review document was skipped, silently, on a green run.

## Why this matters more than the path count suggests

The two excluded trees are the two with the HIGHEST citation density in this
repository. A clean-room review's entire value is that its claims are anchored
to `path:line`; a work history is the artifact a later reviewer trusts. Those
are precisely the documents where a wrong citation does the most damage, and
they are the two that are never machine-checked.

It is not theoretical. Contract H-A reports NINE wrong citations found by hand
in the material it reviewed. Nothing in the pipeline would have caught any of
them.

**And the gate would not catch them even if the trees were added**, which is
the second half of this finding and the one that is easy to miss. The gate
resolves that a path and line EXIST. It cannot check that the line says what
the citing sentence claims. A confidently wrong line number is green. This was
demonstrated on the orchestrator's own work an hour before this document was
written: `delivery/STATE.md:47` was written from memory in the harness
arbitration, line 47 is an unrelated bullet, and the correct line is 103. It
was caught by opening the file. Had the review tree been in scope, the gate
would have passed it.

So adding the two trees buys the ABSENT-path and absent-line cases, and buys
nothing against the wrong-line case, which is the one a human is most likely to
produce. Saying so here stops the fix being oversold when someone makes it.

## What this does NOT cover

- **No fix is proposed and none was attempted.** Adding the two trees is a
  registry edit whose immediate consequence is that many existing documents
  become subject to a check they have never passed, and H-A's nine wrong
  citations say some will redden. That is a change with real fallout and it
  owes its own branch, witness and review. It must not be slipped into a phase
  in flight.
- **The size of the fallout is UNMEASURED.** Nobody has run the linter over the
  two excluded trees to count how many citations across the repository would
  fail. That count is the thing anyone scoping the fix should get first, and it
  is cheap: point the linter at those trees on a scratch branch and read the
  number. It was not done here because this document is a finding and not a
  scoping exercise.
- **It says nothing about the OTHER gates' preconditions.** Only `citations`
  was read. Whether any other gate has a path list that omits a tree it should
  cover is an open question of exactly the same shape, and a one-command
  enumeration over gate-registry.yaml would settle it. Not run.
- **The two reviewers' reports are not the evidence here.** They prompted the
  check; the configuration and the observed four-of-five lint are the evidence.
  Their characterisation was accurate, and it is recorded that it was confirmed
  independently rather than repeated.

## Disposition

Recorded as an unowned finding against `main`. It blocks nothing in flight.
Whoever picks it up should measure the fallout first, and should not claim the
fix closes the wrong-line case, because it does not.
