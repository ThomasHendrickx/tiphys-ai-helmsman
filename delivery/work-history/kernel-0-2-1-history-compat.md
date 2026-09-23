# Work history: kernel 0.2.1, old history validates again

Branch: claude/kernel-0-2-1-history-compat, cut from origin/main at 6dc5b06.
Not a phase branch (the phase pattern test prints false).

Owner rule (DR-0054): Tiphys judges current and future work, never history.

## Log

- Branch created from origin/main 6dc5b06. Reading mandated material next.
- Read DR-0053 and DR-0054 (on origin/claude/m5-orchestrator-paperwork-2,
  not copied), DR-0012, DR-0038, DR-0047, CLAUDE.md.
- Toolchain for every command below unless stated: node v26.6.0 at
  /tmp/claude-0/f149de39-a9f2-5914-a54c-2f28bb0a8a27/scratchpad/node-v26.6.0-linux-x64/bin,
  `npm ci` exit 0, `npm run build` exit 0.

## Reproduction of the defect

The 49 pulse verdicts (`delivery/review/*-criteria*.yaml`, `*-hazard*.yaml`
in /home/user/pulse at d4e491b) were copied to scratch and each run through
`node bin/tiphys.ts validate --type verdict <file>` with no context.

| kernel | files with at least one INVALID line |
|---|---|
| v0.1.0 (tag, scratch worktree, its own `npm ci`) | 7 |
| origin/main 6dc5b06 | 49 |

Diagnostic counts on main (a file can carry several):

| diagnostic | files |
|---|---|
| `INVALID #/head required property head is missing` | 49 |
| `INVALID #/verdict value "APPROVE" is not one of the permitted values "FIX-ROUND-NEEDED"` with `INVALID # value does not satisfy the requirements its own shape triggers here` | 10 |
| the seven v0.1.0 failures (below) | 7 |

The seven that were already invalid under v0.1.0 are the same seven on main:
m3-p14-hazard-round2, m3-p14-hazard, m3-p2-hazard, m3-p3-hazard-round3,
m3-p3-hazard-round4, m3-p6-hazard, m3-p7-hazard. Each declares
`kind: finding`, not `kind: verdict`, and has the shape of a findings list
rather than a verdict: no `phase`, `framing`, `review-contract`, `criteria`
or `deviations-judged`, and every finding carries `concrete-edit` where the
verdict schema names the field `concrete-fix`. They are not verdicts written
to an older verdict schema; they are a different document type validated as
a verdict. They are not forced green here. Note that `kind: finding` means
the gates' corpus loader skips them as non-verdicts (readVerdictKind), so
they do not affect any merge gate either.

The ten APPROVE rejections are: m1-p1-criteria, m1-p2-criteria,
m3-p11-criteria-round2, m3-p13-criteria-round2, m3-p13-hazard-round2,
m3-p18-criteria-round2, m3-p2-criteria, m3-p3-criteria-round4,
m3-p7-criteria, m3-p7-hazard-round2.

A pre-existing fact that is NOT this defect and is recorded so the owner's
"validation returns false" is not over-read: `tiphys validate --type verdict`
with no `--context` exits 1 on EVERY verdict, on v0.1.0 and on main alike,
because the context-requiring derived checks print `SKIPPED ... no context`
and a skipped check is a failure by design (src/commands/validate.ts:480).
Measured on main with a head added to a pulse verdict: no INVALID line,
five SKIPPED lines, rc=1. So after this change the pulse history carries no
INVALID line, and the command still exits 1 without a context. See open
questions.

Severities in the ten (grep of `severity:` per file): every one reads
`verdict: APPROVE` beside at least one `medium` finding and no `high` or
`critical` finding. So all ten satisfied v0.1.0's escalation rule
([high, critical]) and are rejected only by M4-P10's widening to medium.
