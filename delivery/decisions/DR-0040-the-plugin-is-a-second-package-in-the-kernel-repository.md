# DR-0040: the Claude Code plugin is a second package in the kernel repository, not a second repository

- id: DR-0040
- project: tiphys-kernel
- task: M4 intake, open decision M4-D-02
- question: Does `@tiphys/claude-code-plugin` live in this repository as an npm
  workspace, in its own repository, or only as a CLI driver that never
  implements `ExecutorAdapter`?
- reversibility: **asymmetric, and that asymmetry is the argument.** Splitting
  one repository into two later is mechanical. Merging two repositories into
  one later costs history reconciliation, two CI configurations and two gate
  registries.
- vetoable: yes. Nothing depends on this until the first plugin file is
  written, and the owner was given the counter-case before agreeing.
- revert-cost: before any plugin code exists, near zero. After the adapter
  workstream's first phase, it is a repository split plus a CI rebuild.
- status: **DECIDED BY THE OWNER, 2026-09-15**, after being shown the case
  against it.
- decided: one repository, two published packages
- date: 2026-09-15

## What DR-0008 already settled, and what it did not

DR-0008 settled the NAMES: two packages, `@tiphys/kernel` and
`@tiphys/claude-code-plugin`, published to public npmjs
(delivery/decisions/DR-0008-release-registry.md:38). It said nothing about
repository layout, and nothing has since. Measured: `package.json` carries no
`workspaces` field, and `git ls-files | grep -ci plugin` scoped to `src/ bin/
test/ package.json` returns 0, so the question was open by construction rather
than by omission. (Unscoped, that grep now returns 1: this record. A baseline
that counts itself is not a baseline, which a review caught.)

## The decision, in the owner's terms

> I am fine with your thinking on the 2 packages in one repo for now

The "for now" is load-bearing and is preserved here: this is a starting layout
chosen because it is cheap to leave, not a permanent judgment that one
repository is correct.

## Why one repository

**The plugin cannot be built without changing the kernel, so "plugin change"
and "kernel change" are the same change most of the time.** Three measured
gaps, each of which lands in `src/`:

1. **Nothing can select an adapter from outside the process.** The adapter is
   chosen as `options.adapter ?? subprocessAdapter` inside `spawnTask`
   (src/spawn.ts:463). Probed: `grep -rn '"--adapter"' src/ bin/` exits 1, and
   `grep -rn adapter src/cli.ts bin/tiphys.ts` exits 1.
2. **`launch` is synchronous.** Its return type is `LaunchOutcome`, not a
   promise (src/spawn.ts:108), and the call site runs it inside a synchronous
   step. An agent turn is long; a subprocess is short. This is the largest
   kernel-side edit the plugin implies.
3. **The brief's path never crosses the seam.** `ExecutorRequest` carries seven
   fields and the brief is not among them (src/spawn.ts:62), although an agent
   payload's whole input is its brief.

**Two repositories would force one change into two pull requests, and this
project has already paid for that exact shape.** DR-0031 requires a pull
request to be a unit of self-contained value carrying ALL its evidence. The
recorded failure is on `main` at `bdec27d`, where review evidence was present
for code that was absent, and neither the gate nor any review caught it.

**The kernel publishes no library entry point today.** package.json:14 has
`bin` and no `main`, no `exports`, no `types`, and there is no `src/index.ts`.
A plugin in a separate repository could not import `ExecutorAdapter` at all
without first adding a public API surface to `@tiphys/kernel` and releasing it.
A workspace defers that release rather than requiring it up front, which is a
real sequencing saving and not merely tidiness.

## The case against, recorded because the owner was shown it

Stated at full strength rather than as a strawman, because "for now" means this
gets revisited and the next reader should not have to reconstruct it:

1. **A separate published package conventionally gets a separate repository.**
   One repository publishing two packages is the less common shape and costs a
   workspace configuration that does not exist yet.
2. **It does not scale to several harnesses.** If a Codex plugin and a Cursor
   plugin follow, three adapters inside the kernel repository is clutter, and
   each one drags the kernel's gate registry, CI and branch conventions over
   work that has nothing to do with the kernel.
3. **Release cadence is coupled.** A plugin fix cannot ship without the
   repository's whole gate bundle running.

**The split cost, corrected after review.** Saying a later split is
"mechanical" is too cheap. By the time it happens the plugin's phases have
produced work histories, reviews and phase declarations under `delivery/`, all
citing this repository's paths, and its branches were audited by a scope gate
that derives phase ids from this repository's convention
(src/gates/schemas/phase-declaration.schema.json:18). A split is a history
filter PLUS re-homing every one of those artifacts and its citations. The
asymmetry argument survives that, because merging two repositories is still
worse, but the number is not zero.

**The answer to all three is the reversibility asymmetry, not a rebuttal.**
Point 2 is the strongest and it is not yet real: there is one harness adapter
and it has no code. Splitting when it becomes real is mechanical; having
started split and wanting to merge is not.

## What this decides and what it does not

**Decided:** one repository, two packages, the plugin as an npm workspace.

**NOT decided, and each is plan work:**

- Whether the plugin imports `ExecutorAdapter` through a workspace link or the
  kernel gains a published `exports` map anyway. The first is enough for
  development; the second is required the moment anyone consumes the plugin
  from outside this repository.
- Whether plugin phases are audited by the same scope gate, which derives a
  phase id from the branch name and hardcodes this repository's convention in a
  shipped schema (src/gates/schemas/phase-declaration.schema.json:18).
- Whether the plugin's gates are the kernel's gates. Under DR-0029 the project
  owns its predicates, and the plugin is arguably a second project inside one
  repository.

## The review trigger

This decision is revisited, not assumed, when EITHER of these becomes true:

1. A second harness adapter is actually being written, not merely anticipated.
2. The plugin's pull requests start being blocked by kernel gates that have
   nothing to do with the plugin.

Either is an argument to split, and splitting is cheap by construction.
