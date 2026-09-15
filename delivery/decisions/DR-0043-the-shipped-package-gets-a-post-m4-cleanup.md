# DR-0043: the shipped package carries its build's history, and gets a post-M4 cleanup

- id: DR-0043
- project: tiphys-kernel
- task: owner-stated scope, raised 2026-09-15
- question: The published package's artifacts are written in the voice of this
  build and cite its private history. Is that shipped state acceptable, and if
  not, when is it fixed?
- reversibility: fully reversible; it is text
- vetoable: yes
- revert-cost: none before the pass runs
- status: **DECIDED BY THE OWNER, 2026-09-15.**
- decided: a cleanup pass runs after M4, not during it
- date: 2026-09-15

## The decision, in the owner's terms

> We will need a cleanup post M4 anyway to clear comments, prose, pulse
> references anyway to clean up the packages.

## The measured baseline, so the pass has a target rather than a feeling

Taken over the artifacts `package.json` actually ships (the `files` key at
package.json:17), on branch `plan/pstack-borrow-review`.

**Project names do NOT leak, and that is worth recording as the good half.**
`grep -rniE 'pulse|hemma|thomashendrickx'` over every shipped tree returns ZERO
hits. The concern the owner names as "pulse references" is, measurably, not
present in the package today. What IS present is one level more abstract.

**683 references to this build's own private history**, counted by
`grep -rnoE '\b(M1|M2|M3|M4|M5)-P[0-9]+\b|\bDR-[0-9]{4}\b|\b20[0-9]{2}-[0-9]{2}-[0-9]{2}\b|\bT-0[0-9]{2}\b|\bCR-[0-9]{3}\b|\bR-[0-9]{3}\b'`:

| shipped artifact | build-history references |
|---|---|
| `schemas/` | 303 |
| `tuition/` | 140 |
| `AGENTS.md` | 43 |
| `gate-registry.yaml` | 43 |
| `checklists/` | 40 |
| `templates/` | 37 |
| `roles/` | 35 |
| `assurance-modes.yaml` | 25 |
| `role-model-config.yaml` | 17 |

By kind: 183 requirement rows (`R-nnn`), 180 M3 phase ids, 139 tuition ids,
68 decision records, 38 M1 phase ids, 36 clean-room findings, 21 M2 phase ids,
18 dates.

**Why this matters, stated as the consumer's experience.** A project installing
`@tiphys/kernel` receives 683 pointers into a history it cannot read. `R-041`,
`M3-P7` and `DR-0028` resolve to nothing on their machine. Some are load-bearing
(a schema comment explaining WHY a field is closed), and some are archaeology.
The pass has to tell them apart rather than deleting on sight.

## Why AFTER M4 and not during

Three reasons, and the third is the one that makes it a decision rather than a
preference.

1. **The artifacts are still changing.** M4 edits schemas, role briefs and the
   gate registry. Cleaning prose that a later phase rewrites is wasted.
2. **The references are load-bearing DURING the build.** They are how a phase
   cites the finding it closes. Removing them mid-build removes the audit trail
   while the audit is running.
3. **The consumer who would be hurt is not in this orchestrator's scope.**
   **Corrected after review**: an earlier version said that consumer "does not
   exist yet", which delivery/STATE.md:65 refutes. The pilot is already
   consuming the published kernel in another session. What is true is narrower
   and still supports the timing: that consumer has not reported the references
   as a defect, this orchestrator cannot act on its behalf under DR-0037, and
   the M4 subject is this repository, for which the references RESOLVE.

## What the pass must do, so it is not "delete the comments"

Written now, while the reasoning is fresh, because a cleanup instructed as
"clear prose" will take the schema comments that explain closed vocabularies.

1. **Classify before deleting.** Every reference is CONTRACT (a consumer needs
   it), RATIONALE (a consumer benefits from it but it must be rewritten to
   stand alone), or ARCHAEOLOGY (only this build's readers need it).
2. **Rewrite rationale to stand alone.** A schema comment reading "closed at
   v0.1.0, extension deferred to M4's pilot consumer (DR-0020)" becomes a
   sentence that means something without DR-0020 in front of you.
3. **Never delete a stated LIMIT.** The most valuable prose in these artifacts
   is the sentences admitting what a thing does not do: "THIS CLAUSE IS A
   SPECIFICATION AND NOT A MECHANISM", "nothing in M3 counts fix rounds". Those
   are the opposite of clutter.
4. **The `tuition/` tree is a separate question.** It is the future
   cross-project tuition feed and its 140 references are to the failures it
   exists to transmit. Whether a downstream project wants this build's tuition
   at all is a design question, not a cleanup one.
5. **Keep a red witness.** The pass is a large text edit over shipped
   artifacts, and `brief-drift`, `agent-rules-drift` and `check-agents-references`
   all read them. Run the bundle, not a spot check.

## Scope note

This is M5 work or a standalone pass, not an M4 workstream. D-19 fixes M4's six
workstreams and this is none of them. It is recorded here so it is not
rediscovered, and so the M4 plan can stop worrying about prose it was going to
be told to remove anyway.
