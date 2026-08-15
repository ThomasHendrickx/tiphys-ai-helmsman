# M3 exit test E0.4: the designated subject change

- date: 2026-08-15
- author: exit-test runner, dispatch A
- status: recorded BEFORE stage E1 begins, in the same commit as the
  supervision rules.
- discharges: E0.4 of delivery/plan/kernel-plan-m3.md:5095.

## The designation

The plan designates the subject itself rather than leaving it to the run: add a
`kernel-artifacts` check to `tiphys doctor` that FAILs when the resolved kernel
package is missing any of `roles/`, `schemas/`, `checklists/` or `AGENTS.md`,
promoted to FAIL under the `full` profile
(delivery/plan/kernel-plan-m3.md:5098).

Against E0.4's criteria:

| criterion | how the designated subject meets it |
|---|---|
| in scope for the kernel | it is a check in the kernel's own `doctor` command |
| genuinely wanted | M3 has just made `roles/`, `schemas/`, `checklists/` and `AGENTS.md` load-bearing, and nothing checks that an installed kernel actually carries them |
| small enough for one phase | one check function plus its profile promotion |
| touching at most three source files | `src/commands/doctor.ts` and its test, plus the behaviors registry; the file count is recorded again in the E1.6 evidence from the actual diff rather than predicted here |
| requiring no owner decision | the behaviour is fully specified by the plan sentence above |
| at least one behavior demonstrable red without it | remove one of the four artifacts from a staged install and the check must FAIL; with the check absent, `doctor` reports PASS on that same staged install |

## The fallback rule does NOT fire, re-measured rather than taken on report

E0.4's fallback applies only if the subject is already built by the time the
run happens. The orchestrator reported it is not; this runner re-measured on
its own worktree at d5d87f7 rather than accepting that, because the brief says
to and because a fallback that fires unnoticed would silently change the
subject.

Command and full output, run in the exit-test worktree at
d5d87f7baf4ad31ab77ab074a5f0b588da189217:

```
$ grep -rn "kernel-artifacts" src/ test/ schemas/
test/behaviors.json:728:  "pack-contains-kernel-artifacts": "the pack listing carries every declared kernel artifact, and every FILE inside each shipped directory",
$ echo $?
0
```

One hit, and it is an unrelated behavior id belonging to the pack-listing
check, not a `doctor` check. The `doctor` command's own check names were read
directly as a second, independent source: `src/commands/doctor.ts` at this head
returns records named `node`, `git`, `gh`, `layout`, `remote`, `lock`,
`beacon`, `identity` and `retention`, and no record named `kernel-artifacts`.
Both sources agree that the subject is not built, so the fallback does not
fire and the plan's designated subject stands.

What that measurement does NOT cover: it searched `src/`, `test/` and
`schemas/` only, which are the trees the brief named. A `kernel-artifacts`
check implemented outside those three trees, for example under `scripts/` or
`bin/`, would not appear in it. The second source above narrows that gap for
the `doctor` command specifically, since a doctor check has to be reachable
from `src/commands/doctor.ts` to appear in its output, but it does not close it
for any other consumer of that string.

## Consequence carried forward to E1.6

The subject touches `src/commands/doctor.ts`, so `red-witness` IS triggered on
the exit head and must be GREEN there rather than not-applicable
(delivery/plan/kernel-plan-m3.md:5227). A not-applicable at E1.6 would be the
vacuous pass this exit test exists to refuse. This is recorded here, before E1,
because E0.4's fallback could have designated a change that does not touch
`src/`, and in that case the designation record would have had to say so and
E1.6 would have expected not-applicable-with-a-reason instead. It did not, so
it does not.
