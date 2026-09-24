# Clean-room HAZARD review: M5-P6 kernel half

Reviewer: clean-room hazard subagent (no authorship of this branch).
Subject: branch claude/m5-p6-scale-out-proof
Requested head: 520ba00dbe2da1ed47b9ff698928968aadcd1183
Fetched head (git rev-parse origin/claude/m5-p6-scale-out-proof at fetch time): 520ba00dbe2da1ed47b9ff698928968aadcd1183
Head did NOT move during review; checked out detached at this sha in the isolated
worktree /home/user/tiphys-ai-helmsman/.claude/worktrees/agent-ae6f6086ed6cf4648.
Merge base with origin/main: 1eb41bf4468e1ae675322f723657ad1ca149c13b.
Toolchain: node --version = v26.6.0 (scratch toolchain at
/tmp/claude-0/f149de39-a9f2-5914-a54c-2f28bb0a8a27/scratchpad/node-v26.6.0-linux-x64/bin,
prefixed on PATH per call).

Scope actually reviewed: src/commands/conflicts.ts, the DR-0058 change to
src/commands/init.ts (both the unchanged fleet arm and the new `--project` arm),
templates/gate-registry.example.yaml, test/conflicts.test.ts, test/init.test.ts,
and the witness files under witness/. Not reviewed as primary subject: the
hemma-specific step-3 onboarding (not written yet, per the task brief), and the
rest of the pre-existing kernel (src/checks.ts, src/gates/scope.ts) except where
needed to establish whether a pattern in the new code is a NEW defect or one it
inherited from an existing, already-accepted mechanism.

Governing plan section: delivery/plan/value-delivery-plan.yaml:395 (id: M5-P6).
Governing decision: delivery/decisions/DR-0058-m5-p6-closes-the-charter-only-gap-in-init.md.

Status: review in progress, findings appended as found.

---

## Baseline probes (establish the commands work as documented)

Probe 0a, happy path `init --project` against a fresh one-commit repo:

```
node bin/tiphys.ts init --project <scratch-repo>
```
Output: wrote assurance-modes.yaml, reported charter.yaml absent, reported
gate-registry.yaml absent naming the template. Exit 0. Matches the docstring.

Probe 0b, re-run against the identical copy: `present assurance-modes.yaml:
identical to kernel 0.2.1's copy`. Exit 0. Idempotent as documented.

Probe 0c, `tiphys validate --type gate-registry templates/gate-registry.example.yaml`:
exit 0, no diagnostics. The shipped template is schema-valid, so a project that
copies it does not immediately break (mitigates hidden-bootstrap-handwork for
I-9).

---

## CR-KH-001 (HIGH): `tiphys conflicts` reports a real, literal file overlap as DISJOINT when the two declarations spell the same path differently

`sharedEntries` (src/commands/conflicts.ts:200) compares entries with plain
string equality (`a === b`) and a `startsWith` prefix test for directories. It
performs NO path normalization: no collapsing of a `./` prefix, no collapsing
of a doubled `/`, no case folding. The phase declaration schema
(src/gates/schemas/phase-declaration.schema.json) places no constraint on
`filesToTouch` entries beyond `type: string`, so two conforming declarations
can legally name the identical repository file with different spellings.

Reproduced live, two structurally different members of the class (the
red-witness rule's "one witness is not a class" answered):

Member 1, a `./` prefix on one side, none on the other. Fixtures:
```
m9-p1.json: filesToTouch: ["./src/a.ts"]
m9-p2.json: filesToTouch: ["src/a.ts"]
```
Command: `node bin/tiphys.ts conflicts m9-p1.json m9-p2.json`
Captured output (verbatim, transliterated: none needed, all ASCII):
```
conflicts: 2 declaration(s): M9-P1 (.../m9-p1.json), M9-P2 (.../m9-p2.json)
append-only, union-resolved, never an overlap: test/behaviors.json, gates.manifest.json, delivery/requirements/clause-map.json
DISJOINT M9-P1 M9-P2
conflicts: 0 overlapping pair(s), 1 disjoint pair(s), 0 overlapping path(s)
semantic coupling: NOT CHECKED. ...
```
Exit code: 0.

Member 2, a doubled slash on one side. Fixtures:
```
m9-p3.json: filesToTouch: ["src/foo.ts"]
m9-p4.json: filesToTouch: ["src//foo.ts"]
```
Command: `node bin/tiphys.ts conflicts m9-p3.json m9-p4.json`
Captured output: identical shape, `DISJOINT M9-P3 M9-P4`, exit 0.

Both pairs name the SAME filesystem path (`src/a.ts`, `src/foo.ts` respectively
under a normal repository root). The command's own acceptance criterion
(p6-prepass, delivery/plan/value-delivery-plan.yaml:441) is: "exits nonzero and
names every overlapping literal path for an overlapping fixture pair ... exits
0 with zero overlaps for a disjoint pair." These pairs ARE literally the same
path and the command exits 0 as though they were disjoint. This is distinct
from, and worse than, the false-disjointness hazard the command's own
docstring and SEMANTIC_COUPLING_OBLIGATION disclaim: that disclaimer covers
SEMANTIC coupling between genuinely different files. Here the files are not
merely semantically related, they are the SAME file, and the command's whole
job (per its own docstring, "computes exactly that and nothing more") is
literal overlap. A dispatcher that trusts a DISJOINT verdict here (which is
exactly the use this command is built for, per M5-P6 step 3's un-written
"dispatch them concurrently" step) would launch two phases that both write the
same file concurrently, believing them proven disjoint.

Would an existing test catch it: no. test/conflicts.test.ts has no case with
two spellings of one path; every overlap fixture uses byte-identical strings
or a directory-vs-file pair (test/conflicts.test.ts:92). Grepped the whole
file for `\./` and normalization keywords: no hits.

Context, not a mitigation: this exact defect shape (no normalization, literal
`===` and `startsWith` only) already exists in the pre-existing scope gate,
`isAllowed` at src/gates/scope.ts:518-520. So the new command is consistent
with an existing, already-shipped pattern rather than introducing a wholly
novel mechanism. That does not satisfy p6-prepass, whose criterion is written
against this command specifically, and it means a reviewer who assumes the
scope gate's own coverage protects here would be wrong: the scope gate is
never invoked by `conflicts`.

Red witness shape: a conflicts.test.ts case with two declarations whose
`filesToTouch` name the same path with different spellings (`./x` vs `x`, or a
doubled slash), asserting the pair is reported OVERLAP with the concrete
shared path, and that the run exits 1. Demonstrated red on this head (real
capture above) and would go green once `sharedEntries` normalizes both sides
(e.g. via `node:path`'s `normalize` plus a POSIX-separator pass) before
comparing.

---

## CR-KH-002 (MEDIUM): `init --project` refuses a symlinked repository root with a false diagnostic ("is not a directory")

src/commands/init.ts:289-298:
```
let isDirectory = false;
try {
  isDirectory = lstatSync(root).isDirectory();
} catch { isDirectory = false; }
if (!isDirectory) {
  process.stderr.write(`tiphys init ${PROJECT_FLAG}: ${root} is not a directory\n`);
  return 1;
}
```
`lstatSync` does not follow the FINAL path component if it is a symlink, so
`isDirectory()` is false for a symlink even when its target is a directory
(and even when that target is the top level of a git work tree). This is
exactly the "repo root that is itself a symlink" case named in the review
brief.

Reproduced:
```
git init -b main .../repo1                       # commit made
ln -s .../repo1 .../repo1-link
node bin/tiphys.ts init --project .../repo1-link
```
Captured output:
```
tiphys init --project: .../repo1-link is not a directory
```
Exit 1. The message is FALSE: `.../repo1-link` is, by any operator-visible
test (`ls -ld`, `test -d`), a directory. The real defect a few lines later
(realpathSync(root) compared against `git rev-parse --show-toplevel`) is
written correctly and WOULD have accepted this case had it been reached: I
verified separately that a symlinked ANCESTOR directory (not the root itself)
resolves and writes correctly (probe below), so the intended design already
tolerates symlinks in principle.

Contrast probe, symlinked ancestor (not the root) works correctly:
```
git init -b main .../realdir/repo2
ln -s .../realdir .../realdir-link
node bin/tiphys.ts init --project .../realdir-link/repo2
```
Output: `wrote assurance-modes.yaml: ...`, exit 0, and the file was verified
present on disk at the REAL path `.../realdir/repo2/assurance-modes.yaml` (not
under the symlink), confirming `realpathSync` resolution is otherwise correct.
So the bug is narrowly the `lstatSync` directory check, which should be
`statSync` (follow symlinks) given the rest of the function already
anticipates and correctly handles symlinked ancestors.

Severity: medium, not high. It is an over-refusal (fails closed, not open):
no data is written or clobbered, and the operator gets a wrong but
non-catastrophic error. It would bite any project checked out through a
symlink farm (common with some worktree or package-manager layouts) and the
false message ("is not a directory") would send an operator debugging in the
wrong direction.

Would an existing test catch it: no. test/init.test.ts has a "path that is an
existing file" case (line 125, for the FLEET arm, not `--project`) and no
symlinked-root case anywhere for `--project`. Grepped test/init.test.ts for
`symlink`: only the assurance-modes.yaml-is-a-symlink case (line 347), which
is a different path (the TARGET file, not the repo root).

Red witness shape: a test that creates a repo, a symlink to it, runs
`init --project <symlink>`, and asserts EITHER success (if symlinked roots
should be accepted, consistent with the symlinked-ancestor behavior already
shipped) or a diagnostic that correctly identifies the entry as a symlink
rather than falsely claiming it is not a directory.

---

## CR-KH-003 (LOW-MEDIUM, not reproduced as a race, mechanism-level finding): TOCTOU window between the existence/type check and the write or read of the project's assurance-modes.yaml

src/commands/init.ts:321-352. The sequence is:
```
existing = lstatSync(target)          // check 1: establish absent / symlink / file
...
if (existing === undefined) {
  writeFileSync(target, kernelBytes)  // window A
} else if (existing.isSymbolicLink()) { refuse }
else if (!existing.isFile()) { refuse }
else if (!readFileSync(target).equals(kernelBytes)) {  // window B
  refuse
}
```
Between the `lstatSync` and the subsequent `writeFileSync` (window A) or
`readFileSync` (window B), nothing re-establishes that `target` is still the
same filesystem object. `writeFileSync`/`readFileSync` follow symlinks by
default (no `O_NOFOLLOW`/`lstat`-based open), so a process that replaces
`target` with a symlink in that window would cause `tiphys init --project` to
write or read through the attacker's link. This defeats the guarantee stated
in the command's own docstring at src/commands/init.ts:271: "A symbolic link
at that path is refused by name."

This is a mechanism-level finding, not a demonstrated race: I did not attempt
to win the race (a reliable reproduction needs a tight concurrent loop and
was judged not worth the time budget for a local single-operator CLI tool run
once per onboarding). Severity is capped at low-medium because the threat
model is narrow: an attacker needs local write access to the exact target
path at the moment an operator runs `tiphys init --project`, which already
implies a compromised or shared environment where much worse is possible.
Flagging it because the review brief specifically asked for TOCTOU between
check and write, and because the code's own comment promises a guarantee the
window can defeat.

Would an existing test catch it: no. No concurrency test exists for this path
(grepped test/init.test.ts for "race" and "TOCTOU": no hits).

Red witness shape: would need a harness that pauses between the lstat and the
write (e.g. a `fs` monkeypatch or a `--test` mock) to force the interleaving
deterministically, since a real filesystem race is not reliably reproducible
in CI. Not attempted here; recorded as an open mechanism rather than a closed
finding, per the fix-round contract's "state what the derivation did not
cover."

---

## CR-KH-004 (LOW): `initProject` crashes uncaught if the kernel's own assurance-modes.yaml disappears between `packageRoot()`'s check and the subsequent read

src/commands/init.ts:309-317:
```
kernelRoot = packageRoot();                 // internally does readdirSync(dir).includes(MODES_FILENAME)
...
const source = join(kernelRoot, MODES_FILENAME);
const kernelBytes = readFileSync(source);   // not wrapped in try/catch
```
`packageRoot()` (src/modes.ts:39) walks upward until a directory's `readdirSync`
listing includes `assurance-modes.yaml`, then returns that directory; it does
not itself read the file. The subsequent `readFileSync(source)` in
`initProject` has no try/catch, so if the file is removed, becomes unreadable,
or the installation is otherwise damaged between the two calls, the command
crashes with a raw Node stack trace and an unspecified exit code instead of
the command's own documented, attributed error convention (exit 1 with a
`tiphys init --project: ...` line). Every other failure path in this function
uses that convention; this is the one uncaught throw.

Severity: low. The kernel's own install is not attacker-controlled in the
normal case, and the window is narrow (a filesystem race on the kernel's own
package, not the project's). Included because it is a real code-level gap the
brief asked to probe (a copy operation with an unguarded read) and because it
is cheap to fix (wrap in try/catch, matching the pattern already used for
`packageRoot()`'s own thrown error two lines above).

Would an existing test catch it: no such fixture exists in test/init.test.ts
(no test removes or corrupts the kernel's own assurance-modes.yaml mid-run).

---

## CR-KH-005 (MEDIUM-HIGH): DR-0058 commits `init --project` to producing three of the four bootstrap items; the shipped code produces one, and the narrowing is recorded only in a work-history paragraph, not as a decision update

DR-0058's "What changes" section (delivery/decisions/DR-0058-m5-p6-closes-the-charter-only-gap-in-init.md)
states plainly: "Three of the four items are kernel files that init can link
or locate. The fourth is a project-owned registry..." and instructs the
reviewer: "a reviewer checks that init produces every item the intake named
(I-7 to I-10), and that no item moved into an undocumented manual step."

The intake (delivery/verification/m5-hemma-intake.md:203-206) names the four
items precisely: I-7 `assurance-modes.yaml`, I-8 `schemas/` beside the context
documents, I-9 the gate registry, I-10 the `.gitignore` line `.ctx-*/`. Per
the decision, I-9 alone is the project-owned exception; I-7, I-8 and I-10 were
committed to init.

Read against the actual diff: `initProject` (src/commands/init.ts:277-372)
produces ONLY I-7 (writes assurance-modes.yaml). It does not create, link, or
even report on a `schemas/` presence (I-8), and it writes no `.gitignore` line
in the project repository at all (I-10; the only `.gitignore` write in this
file, src/commands/init.ts:199, is in the unrelated fleet-home arm). Grepped
src/commands/init.ts for "schemas" and ".ctx-": no functional hits (only an
unrelated comment mentioning "schemas" in prose at line 232).

This narrowing IS disclosed, but only inside delivery/work-history/m5-p6.md
(lines 443, 451): "I-8 `schemas/` is not copied. Its only context read is
src/checks.ts:746, which runs only when an assurance-modes DOCUMENT is
validated with --context; the regime read does not use it." and "I-10 is not
produced. No kernel code creates `.ctx-*` (grep above)." I independently
verified the I-10 half of that claim: `grep -rn '\.ctx-' src/ roles/
.claude/skills/ AGENTS.md` returns zero hits on this head, so nothing in the
current kernel produces or consumes that gitignore line, which is real
support for treating I-10 as inapplicable rather than hidden handwork. The
I-8 half is a narrower, harder-to-fully-verify claim: `charterModeEnumMatchesModes`
(src/checks.ts:730) does read `schemas/charter.schema.json` from context, but
only when something invokes an `assurance-modes` document check WITH
`--context` (`tiphys mode show`, or `tiphys validate --type assurance-modes
--context <dir>`); the merge-readiness document check itself
(`missingRegimeDocument`, src/checks.ts:4881: `REGIME_DOCUMENTS = [CHARTER_DOCUMENT,
MODES_DOCUMENT]`) does not require `schemas/`. So whether hemma's actual gate
registry (not written yet) ever exercises that context-requiring check is an
open question the shipped gate-registry.example.yaml template does not
answer either way: the three placeholder gates it ships (unit-tests,
typecheck, lint) never invoke `tiphys mode show` or `tiphys validate --type
assurance-modes --context`.

The hazard is not that the narrowing is wrong (it may well be correct; the
I-10 half is independently confirmed here). The hazard is procedural and
matches the phase's own hidden-bootstrap-handwork class: a binding decision
record still reads, unamended, as committing init to three items; the actual
scope reduction to one item lives only in prose inside a work-history file,
which CLAUDE.md's own precedence order places BELOW decision records (section
"The governing documents, in precedence order"). A later reader (including
whoever writes hemma's un-written step 3) consulting DR-0058 alone would
reasonably expect `init --project` to already produce a `schemas/` link and
would be surprised, mid-onboarding, to find it does not. If the I-8 narrowing
turns out to be wrong once hemma's real gate registry is written (i.e. if
hemma's gates DO need `schemas/` present), the fallback is exactly the hazard
DR-0058 exists to close: an operator hand-places a `schemas -> .../kernel/schemas`
symlink before init, undeclared, the pulse-fleet precedent repeating itself.

Would an existing test catch it: partially. test/init.test.ts:368 asserts
`init --project` never WRITES charter.yaml or gate-registry.yaml, which is
correct and intentional (I-9's project-owned design). No test asserts
anything about `schemas/` or `.gitignore` at all, so there is no test that
would fail if a future reader "fixed" the code to match DR-0058's literal
text (adding a schemas/ copy), meaning there is also no witness pinning the
CURRENT (narrowed) behavior as deliberate versus accidental.

Recommendation (not a code fix, a paperwork one): amend DR-0058, or raise a
short follow-on decision record, stating the I-8/I-10 narrowing explicitly as
a decision with its evidence (the two greps and the REGIME_DOCUMENTS citation
above), so the next reader does not have to reconstruct it from work-history
prose. This is cheap and matches the durability rule this repository already
binds itself to.

---

## Minor / non-findings checked and cleared

- Bare repository: `git init --bare` target refused with "not the top level of
  a git work tree" (git rev-parse --show-toplevel fails against a bare repo,
  status nonzero), exit 1. Correct.
- Linked worktree (`git worktree add`): accepted and written correctly, exit 0.
  Correct; `git rev-parse --show-toplevel` inside a linked worktree returns
  that worktree's own root, which matches `realpathSync(root)`.
- Subdirectory of a repository: refused by name ("not the top level of a git
  work tree"), exit 1. Matches test/init.test.ts:383/397 and my own probe.
  Correct.
- Existing, byte-identical assurance-modes.yaml: reported present, not
  rewritten (verified via stdout match and a second run). Correct.
- Existing, differing assurance-modes.yaml: refused, original bytes verified
  unchanged after the refusal (`cat` after the run showed the original
  "different content" string). Correct, matches test/init.test.ts:357.
- Pre-existing symlink at the target path: refused by name before any write
  (`... is a symbolic link ...`), exit 1, verified the link itself was left in
  place. Correct, matches test/init.test.ts:347. (Contrast with CR-KH-003,
  which is about a symlink introduced AFTER the check, not before it.)
- Usage errors: `init --project` with no repo arg, and `conflicts` with fewer
  than two declaration paths, and `conflicts --append-only` given a
  flag-shaped value, all exit 64 (EX_USAGE) with a usage line on stderr; none
  reads as a success (exit 0) or as a data-level refusal (exit 1). Correct,
  and distinct exit codes are preserved as the conflicts.ts docstring
  promises (0 / 1 / 2 / 64 all distinct).
- `conflicts` on an unreadable/missing/malformed declaration: exits 2 (EXIT_INPUT),
  never prints a DISJOINT line, prints "NO VERDICT", still prints the semantic
  coupling obligation as the last line. Verified against the existing test
  suite's assertions (test/conflicts.test.ts:169-231); did not need to
  re-probe live since the tests already drive the real CLI per their own
  file-header claim, which I spot-checked is true (spawnSync against
  bin/tiphys.ts, not a mock).
- Duplicate phase id across two declaration files: exits 2, named by both
  paths in the stderr message, no OVERLAP/DISJOINT line for the pair. Matches
  test/conflicts.test.ts:219; not independently re-run live (test already
  drives the real CLI).
- Directory-vs-file overlap detection (`witness/` matching `witness/m9-p2.json`):
  IS correctly detected as an overlap by the shipped code and is covered by
  test/conflicts.test.ts:92-116. This is the one normalization-adjacent case
  that DOES work; CR-KH-001 is about spelling variants of the SAME path, a
  different and uncovered case.
- The append-only exemption (`test/behaviors.json` etc.) correctly exempts
  only FILE entries, never a directory-marked entry, matching the code
  comment's stated intent; verified by reading sharedEntries' `!isDirectory(concrete)
  && exempt.has(concrete)` condition and cross-checking against
  test/conflicts.test.ts:137-168 (not independently re-probed live, as the
  logic is simple and the existing tests already exercise it against the real
  CLI).
- Gate-registry template: validates against its declared schema (probe 0c
  above), names no kernel command among its three placeholder gates (asserted
  by test/init.test.ts:403, which reads the kernel's own gate registry at run
  time rather than pinning names, in keeping with CLAUDE.md binding convention
  5's ban on hand-pinned counts against a registry).

---

## Verdict

FIX-ROUND-NEEDED for the kernel half.

CR-KH-001 (the conflicts command's false-disjointness on differently-spelled
identical paths) is reproduced, exactly on-hazard for this phase's own
false-disjointness class, and undermines the literal-overlap guarantee that is
this command's entire stated job. That alone is enough to withhold approval.
CR-KH-005 (the DR-0058 commitment vs. shipped scope gap, disclosed only in
work-history prose) compounds it: it is the phase's own named
hidden-bootstrap-handwork hazard, applied to the kernel fix itself, and it
needs at minimum a decision-record update before this can be called settled,
independent of whether the underlying technical narrowing turns out to be
correct.

CR-KH-002, CR-KH-003 and CR-KH-004 are real but lower-severity; none of them
alone would block, but CR-KH-002 in particular is a cheap, clearly-scoped fix
(swap `lstatSync` for `statSync` in one place) that should ride along with
whichever round fixes CR-KH-001.

---

# Re-verification at 45a0d54

Head requested: 45a0d549d420b67a41770ae99d7d76eb36971d7c (branch
claude/m5-p6-scale-out-proof). Fetched sha matched exactly; checked out
detached in the same isolated worktree. Head did not move during this
re-verification. Delta reviewed: `git log --oneline 520ba00..45a0d54`, six
commits: `290f083` (open round), `e7422bc` (the code fix), `498f404` (root
vanishing between resolution and stat), `4165a66` (hemma intake update),
`81b17a3` (work history), `d9fae6f` (verification and claim grep), `45a0d54`
(DR-0058 addendum). Toolchain: node --version = v26.6.0 (same scratch
toolchain as the first review). This session's git-detection guard rejected
several compound commands (PATH= assignments piped into npm, multi-command
heredocs) that were unrelated to git; every command below is the plain,
single-purpose form that was accepted, run from this worktree.

## Item 3 first: what the round's own derivation did NOT cover

Read from delivery/work-history/m5-p6.md:748-797 and :893-897 before looking
at any row, per the fix-round contract's binding order. The implementer
named, in writing:

- Case: `src/A.ts` and `src/a.ts` still compare as different (deliberate, git
  is case-sensitive).
- A directory entry written WITHOUT its trailing slash (`witness` instead of
  `witness/`) still reads as a file entry and misses the directory-vs-file
  overlap; unchanged, matches the pre-existing scope-gate grammar.
- A trailing slash on what is really a file, and a symlinked path inside the
  repository tree, both need the tree to resolve; `conflicts` reads only the
  declarations, never the tree. Not addressed.
- Only src/commands/conflicts.ts was searched for the CR-KH-001 fix;
  src/gates/scope.ts has the identical unnormalized-comparison shape and was
  read, not changed, and is recorded as a follow-up (its failure mode is a
  fail-CLOSED red rather than a false-green, which is why it was left).
- For CR-KH-002/003/004: the fleet arm of init (`cmdInit`, unchanged) and the
  paths inside `packageRoot()` (src/modes.ts) were not re-derived, because
  neither was touched and no review named them.
- CR-KH-003's own residue, stated by the round itself: O_NOFOLLOW and O_EXCL
  guard only the FINAL path component. A directory component of the target
  (the repository root, or anything above it) replaced by a link between the
  root's resolution and the write is still followed. The interleaving itself
  was not forced; the tests exercise each guard against the state it produces
  (a dangling link already present), not a live race. `fsConstants.O_NOFOLLOW`
  is also noted as undefined on Windows, where the read silently falls back to
  a following open.

This is an honest, mechanical item-3 statement: it names real, still-open
gaps rather than claiming completeness. Nothing in it reads as the "cannot be
forced here" shape the claim-grep exists to catch. I ran the grep myself
against the fix-round section as an independent check:

```
grep -nEi 'cannot be|impossible|needs a|is covered|catches|would catch|recovers|anyway|always|never|no way to' delivery/work-history/m5-p6.md
```
Hits inside the fix-round section (lines 633 to 966) reproduce the same two
the implementer's own grep reported (a `never` inside a description of the
root-vanishing case, and a `needs a` inside the CR-005 residue line at
:929), both already read above as accurate statements, not overclaims.

## CR-KH-001: FIXED, re-verified live, plus one new spelling

Re-ran my original two reproductions against this head, unmodified fixture
files:

```
$ node bin/tiphys.ts conflicts m9-p1.json m9-p2.json     # ./src/a.ts vs src/a.ts
tiphys conflicts: .../m9-p1.json (phase M9-P1): filesToTouch entry "./src/a.ts"
is not a canonical path: it has a . or .. segment. ...
conflicts: NO VERDICT: 1 of 2 declaration(s) could not be used, so no pair has
been shown disjoint
semantic coupling: NOT CHECKED. ...
exit=2
```
```
$ node bin/tiphys.ts conflicts m9-p3.json m9-p4.json     # src/foo.ts vs src//foo.ts
tiphys conflicts: .../m9-p4.json (phase M9-P4): filesToTouch entry "src//foo.ts"
is not a canonical path: it has an empty segment (a doubled /, or a / with
nothing before it). ...
conflicts: NO VERDICT: ...
exit=2
```
Both now exit 2 with NO VERDICT and the obligation still printed last. FIXED:
neither pair is read as DISJOINT any more; the defective entry is named by
declaration path, phase id, field and value.

New spelling, not in the implementer's tested list (`./src/a.ts`, `src//a.ts`,
`src/./a.ts`, `src/x/../a.ts`, `/src/a.ts`, `src\a.ts`, `src//`): case
variation, `src/A.ts` against `src/a.ts`.
```
$ node bin/tiphys.ts conflicts m9-p5.json m9-p6.json
conflicts: 2 declaration(s): M9-P5 (.../m9-p5.json), M9-P6 (.../m9-p6.json)
append-only, union-resolved, never an overlap: test/behaviors.json, gates.manifest.json, delivery/requirements/clause-map.json
DISJOINT M9-P5 M9-P6
conflicts: 0 overlapping pair(s), 1 disjoint pair(s), 0 overlapping path(s)
semantic coupling: NOT CHECKED. ...
exit=0
```
Reproduced the disclosed residue exactly: RESIDUE ACCEPTED. This is not a new
finding; it is the exact case the round's own item-3 statement names as
deliberately unaddressed ("git paths are case-sensitive, and so is this
comparison"). On a case-sensitive filesystem (this container, and every git
server this kernel targets) `src/A.ts` and `src/a.ts` genuinely are two
different files, so calling them disjoint is correct there. The residue is
real only on a case-INSENSITIVE filesystem, which this kernel does not target
for its own repository and which the round did not claim to cover. I accept
the disposition.

Independent check against real production data (not requested by name, run
because CR-KH-001's fix is a REFUSAL and a refusal that fires on real
declarations would itself be a new defect): a script driving `readDeclaration`
against every file in delivery/plan/phase-declarations/ on this head:
```
declarations: 57 refused: 0 total entries (deduped, ok ones): 770
```
Zero refusals across all 57 real declarations, matching the shape of the
implementer's own claim (57 declarations, 0 non-canonical) in
delivery/work-history/m5-p6.md:721; my entry count (770) is one more than
theirs (769), consistent with at least one entry having been added to a
declaration between their measurement at `e7422bc` and this head (this
round's own declaration additions are exactly such a case). Not a discrepancy
worth chasing further: it moves in the direction more entries were added, not
fewer, and zero were refused either time.

Unit tests re-run directly (node v26.6.0, no prior build; sources run
type-stripped per CLAUDE.md standing warning 12/note under Gates):
```
$ node --test --test-name-pattern "canonical" test/conflicts.test.ts
tests 2
pass 2
fail 0
```
```
$ node --test --test-name-pattern "real m5-p2 and m5-p3" test/conflicts.test.ts
tests 1
pass 1
fail 0
```

Disposition: FIXED.

## CR-KH-002: FIXED, re-verified live; new probe (dangling symlink root) also correct

Re-ran the symlinked-root probe from the first review:
```
$ node bin/tiphys.ts init --project .../repo1-link
present assurance-modes.yaml: identical to kernel 0.2.1's copy
project charter.yaml: absent; the project writes its charter at .../repo1/charter.yaml ...
project gate-registry.yaml: absent; ...
exit=0
```
The charter path printed is the REAL path (`.../repo1/charter.yaml`), not the
symlink path, confirming `realRoot` is used consistently downstream. FIXED:
no false "is not a directory" any more.

New probe, not run in the first review: a DANGLING symlink as the root
(neither reviewed nor, per the round's own coverage statement, exercised
before this):
```
$ ln -s .../does-not-exist-xyz .../dangling-link
$ node bin/tiphys.ts init --project .../dangling-link
tiphys init --project: .../dangling-link could not be resolved (ENOENT); a
symbolic link must point at an existing directory
exit=1
```
Correctly attributed, no crash, no stack trace. Matches
test/init.test.ts:501-507's dangling-link case, which I also ran directly:
```
$ node --test --test-name-pattern "symbolic link to a repository" test/init.test.ts
tests 1
pass 1
fail 0
```

Regression check on the three cases the fix touches by construction (root
resolution): re-ran all three from the first review, unchanged behavior
confirmed:
- bare repository: still refused, "not the top level of a git work tree", exit 1.
- subdirectory of a repository: still refused, same message, exit 1.
- a plain regular file as root (new probe): refused, "is not a directory",
  exit 1, no crash (`statSync` on a resolved regular-file real path correctly
  reports `isDirectory() === false` rather than throwing).

Disposition: FIXED.

## CR-KH-003: RESIDUE ACCEPTED (mechanism narrowed, not closed; matches the round's own stated scope)

The round adds `readProjectCopy` (O_NOFOLLOW open, fstat-must-be-file, then
read from the descriptor) and `createCopyExclusively` (`wx`, O_CREAT|O_EXCL).
Re-verified both directly:
```
$ node --test --test-name-pattern "created exclusively" test/init.test.ts
tests 1
pass 1
fail 0
```
That single test (test/init.test.ts:530) exercises exactly the two windows my
original finding named: a dangling link pre-staged at the target before the
exclusive create (EEXIST, target of the link never created), and a symlink to
an IDENTICAL kernel copy read back as empty (refused as differing, not
accepted as present). Live re-check of the ALREADY-COVERED pre-existing-symlink
case (present before `init --project` runs, which is the one case my first
review already showed correct) still holds:
```
$ ln -s /etc/hostname .../fr1test/assurance-modes.yaml
$ node bin/tiphys.ts init --project .../fr1test
tiphys init --project: .../fr1test/assurance-modes.yaml is a symbolic link; ...
exit=1
```
And the ordinary paths (fresh write, then idempotent re-read of an identical
copy) still work through the new O_NOFOLLOW/wx code:
```
$ node bin/tiphys.ts init --project .../fr1test        # after removing the symlink
wrote assurance-modes.yaml: ...
exit=0
$ node bin/tiphys.ts init --project .../fr1test        # re-run
present assurance-modes.yaml: identical to kernel 0.2.1's copy
exit=0
```

What is FIXED: the two windows CR-KH-003 named directly (a symlink appearing
at the target between the lstat and the write; a symlink appearing at the
target between the lstat and the read) are closed for the FINAL path
component, which is exactly the window my finding described.

What is RESIDUE, disclosed by the round itself and independently plausible
from reading the code again: O_NOFOLLOW and O_EXCL do not protect a
DIRECTORY component of the path (the resolved repository root, or anything
above it) from being replaced by a link between `realpathSync` and the later
`openSync`/`writeFileSync` calls. I did not attempt to force this interleaving
live (it needs a mutation lab or an fs mock to hit deterministically, which
the round itself says it did not build either); this remains an open
mechanism, stated as such rather than closed, consistent with both my
original finding's own caveat and the round's account. I accept this
disposition because the round did what it said it would (close the two named
windows) and did not overclaim total closure.

Disposition: RESIDUE ACCEPTED (not FIXED in full, not a new open finding either;
narrower than the pre-fix state, and honestly scoped).

## CR-KH-004: FIXED, re-verified via the round's own constructed fixture

```
$ node --test --test-name-pattern "unreadable kernel" test/init.test.ts
tests 1
pass 1
fail 0
```
Read the test (test/init.test.ts:510-528): it stages a full kernel copy with
`assurance-modes.yaml` replaced by a DIRECTORY, spawns the real CLI from that
staged kernel against a real project repo, and asserts exit 1, an attributed
`tiphys init --project: the kernel's own <path> could not be read: ...` line,
NO stack trace (`assert.doesNotMatch(result.stderr, /^\s+at /m)`), and nothing
written to the project. This is a real subprocess run against a real staged
directory, not a mock; it exercises the exact crash site my original finding
named (the previously-uncaught `readFileSync(source)`). I did not additionally
re-stage a kernel by hand, since the test already does the real thing my
finding asked for and passes.

Disposition: FIXED.

## CR-KH-005: FIXED at the decision-record level

`git show 45a0d54` is a 22-line addition to
delivery/decisions/DR-0058-m5-p6-closes-the-charter-only-gap-in-init.md
itself, titled "Addendum, 2026-09-24: what the implementation found", naming
CR-KH-005 by id, stating the decision is unchanged, and giving the corrected
disposition of I-7 to I-10 with the same evidence as the work-history prose
(I-7 needed and produced; I-8 and I-9 as before; I-10 confirmed absent from
the kernel by grep). Critically, this is now IN THE DECISION RECORD, not only
in delivery/work-history/m5-p6.md, which was my finding's exact objection: a
future reader consulting DR-0058 alone now sees the narrowed scope and why,
rather than having to reconstruct it from work-history prose the decision
hierarchy places below the DR itself.

Verified the addendum's own citation resolves: delivery/verification/m5-hemma-intake.md:244
opens "### 4e. Addendum after DR-0058 (M5-P6 kernel half and its fix round
1)", and is cross-referenced from the I-5 row at line 201 and the Q-8/Q-9
rows further down, so the addendum is not a dangling pointer.

I did not re-derive the I-8 claim's own correctness from scratch a second
time (that its only context read is src/checks.ts:746, inside a check the
merge regime does not invoke); I re-read the same citation and it still names
the same line and the same reasoning as fix round 1's work-history entry, and
verifying kernel semantics beyond the DR-0058 paper trail is outside what a
hazard re-verification of the KERNEL HALF owes. What was asked (put the
disposition where CLAUDE.md's document hierarchy makes it authoritative) is
done.

Disposition: FIXED.

## New defects introduced by this round: none found

Specifically probed the three areas named for this re-verification:

- **The refusal of non-canonical paths** (`nonCanonicalReason`,
  src/commands/conflicts.ts:181): re-derived by reading every comparison site
  in the file (already reproduced above as part of item 3) and independently
  ran it against all 57 real, currently-committed phase declarations with
  zero refusals. Also spot-checked that a legitimate directory entry
  (`witness/`) and a legitimate single-segment file entry are still accepted
  (implicit in the 0-refused result over real data, which includes both
  shapes).
- **The realpath/statSync root** (src/commands/init.ts:339-353): re-verified
  symlinked root (accepted, writes at the real path), dangling symlink root
  (attributed ENOENT refusal, no crash), bare repository (still refused),
  subdirectory of a repository (still refused), and a plain regular file as
  root (refused as "not a directory", no crash). All five behave correctly;
  none regressed and none crashed.
- **The `wx` and `O_NOFOLLOW` writes** (`readProjectCopy`,
  `createCopyExclusively`, src/commands/init.ts:290-321): re-verified the
  fresh-write path, the idempotent identical-copy path, and the
  pre-existing-symlink-refusal path, all three still correct; ran the round's
  own unit test for both functions directly, which additionally covers the
  EEXIST-on-a-dangling-link and read-through-a-link-returns-empty cases my
  first review did not reach.

No crash, no false accept, no false refuse, and no new false-DISJOINT or
false-overlap shape was found in any of these three areas.

## Suite re-verification

`npm run build`'s postbuild step (`build:runtime-deps`) failed in this
worktree with `ENOENT: node_modules/.package-lock.json`, an environment gap
(this worktree has no `npm ci` run in it), not a code defect on this head;
`tsc -b` itself is invoked earlier in the same script and I did not isolate
its own exit code from the combined script's. This does not block
re-verification, because CLAUDE.md's own note states sources run
type-stripped with no prior build needed for the suite, and I relied on that
path throughout (every CLI probe and every test run above used
`node bin/tiphys.ts` or `node --test` directly against `.ts` sources on node
v26.6.0). Ran both full test files directly:
```
$ node --test test/conflicts.test.ts test/init.test.ts
tests 35
pass 35
fail 0
cancelled 0
skipped 0
```
This is the two files most relevant to the kernel half, not the full 1515-test
suite the work history claims; I did not re-run the whole suite, so "1515
pass" itself is not independently re-verified here, only the two files this
round touched.

## Verdict

APPROVE for the kernel half, at head 45a0d549d420b67a41770ae99d7d76eb36971d7c.

All five original findings are closed or correctly, honestly narrowed:
CR-KH-001, CR-KH-002 and CR-KH-004 are FIXED and reproduced live against the
exact original repros plus new probes. CR-KH-003 is RESIDUE ACCEPTED: the two
windows it named are closed, the remaining directory-component race is
disclosed rather than hidden, and the round did not overclaim closure.
CR-KH-005 is FIXED at the level that matters, the decision record itself now
carries the disposition, closing my original objection precisely. No new
defect was found in the three areas this re-verification was asked to probe
(non-canonical refusal, root resolution, wx/O_NOFOLLOW writes), against both
the original repro fixtures and fresh probes (dangling symlink root, plain
file root, a new path spelling, 57 real declarations). The item-3 statement
in the work history is honest and matches independent re-derivation.
