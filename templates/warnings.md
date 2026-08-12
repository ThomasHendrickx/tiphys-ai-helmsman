# Environment warnings

This is R-083a's template half; its accumulation half is the work-history
schema's `environment-warnings[]`.

Place this file at the fleet root as `warnings.md`. `tiphys spawn` appends it
VERBATIM to every brief it assembles (`src/brief.ts`, R-083b), so what is
written here is what every agent reads. No heading is added, no banner, no
rewriting; the only byte the kernel may insert is one newline between the
brief and this file.

Markdown rather than YAML is a justified exception recorded in kernel plan M3
section 1.5: the only consumer appends it into instruction prose, so a
structured form would need a renderer whose sole output is the prose this file
already holds.

## What belongs here

One entry per environment fact that has already cost someone time. Each entry
states the fact, how it was MEASURED, and what to do instead. A warning with no
measurement behind it is a rumour, and a brief full of rumours is skimmed.

An entry is added the moment it is discovered, not at the end of a phase. The
matching field in the work-history contract is `environment-warnings[]`
(`schemas/work-history.schema.json`), which is the accumulation half of the
same requirement this template is the template half of.

## Entries, as they stand in this repository

These are real and are kept here as the worked example rather than as
placeholders. Replace them with your own project's; do not ship them unread.

1. **Several node versions may be installed and which one you get depends on
   how the shell was started.** Measured: a login shell resolved `node` to
   v22.22.2, and a stripped environment (`env -i bash -c`, and some subagent
   and hook contexts) resolved it to v20.20.2. Node 20 has no TypeScript type
   stripping, so a TypeScript test suite fails there in a way that does not
   look like a version problem. Check `node --version` in the shell that
   actually runs the command, and prefer an absolute path or an explicit PATH
   prefix over trusting the ambient one.

2. **Running the suite without building first can silently skip tests while
   still exiting 0.** Measured at one head on node v26.6.0: with `dist/` built,
   504 tests, 504 pass, 0 skipped; with `dist/` removed, 504 tests, 495 pass,
   9 skipped. Both runs exit 0. A skipped test is not a passing test, so quote
   the SKIPPED count beside the pass count. The complete sentence names the
   toolchain, the build state and the invocation, because the three axes skip
   different tests and they compose.

3. **`git checkout --` is destructive in a tree holding uncommitted work,
   including when it names a single path.** An implementer used it to clean up
   one probe file and lost four rounds of uncommitted edits, having read a
   warning about it beforehand. There is no safe narrow form: commit, or copy
   out of the tree, before experimenting.

4. **A mutation harness killed by a timeout leaves the mutant installed.** A
   modified source file is exactly what a mutation round expects to see, so the
   one available signal is the one you have trained yourself to ignore. Restore
   by copying from a pristine copy rather than from git, put the restore in a
   shell `trap`, and print AND COMPARE a checksum on both sides.

5. **Concurrent git operations against one clone contend on ref locks**, and
   the real transient message names a ref rather than a lock file. Never derive
   a retry signature from a hand-written example; capture real stderr under
   forced contention.

6. **A tool may be absent locally and present in CI.** Use a deterministic
   PATH in tests rather than assuming either, and do not read an authenticated
   API path and a git path as having the same authority: they can differ in one
   container.

7. **Tests that create scratch git repositories must set command-scoped
   `GIT_AUTHOR_*` and `GIT_COMMITTER_*`**, because CI runners have no git
   identity, and must never touch user or global configuration.
