# CLEAN-ROOM DELTA RE-REVIEW (hazard contract): M2-P5 fix round one

Subject: branch claude/m2-p5-citation-linter @ 2d7efc3
Reviewer role: hazard-contract delta re-reviewer
Status: COMPLETE -- VERDICT APPROVE

## Setup
- WORKDIR recorded.
- Fetching branch and verifying head.

## Verified
- Head 2d7efc39ed08fc1e3f31436e967a56c6832f24a0 checked out exactly.
- origin/main (e1390f3) is ANCESTOR of HEAD -> current with main.
- Changed files vs main: delivery/work-history/m2-p5.md (A), gates.manifest.json (M), src/gates/citations.ts (A), src/gates/schemas/citation-config.schema.json (A), test/behaviors.json (M), test/citation-gate.test.ts (A).
- Read arbitration-m2-p5.md (M2-D-21, M2-D-22), clean-room-m2-p5-hazard.md (CR-1015..1027).

## Fix targets (from CR-1230 / arbitration)
- CR-1015 HIGH: gate red on own head (quoted vs made citations). M2-D-22.
- CR-1016 HIGH: whole-body vs file-scoped diff. M2-D-21 (per-hunk added/modified).
- CR-1017 HIGH: --head vs working tree (read git blobs at ref).
- CR-1018 MED: path traversal outside checkout.
- CR-1019 MED: malformed pin suffix reds.
- CR-1020/1021 MED: vacuous guard / vanish race (fold into hunk-scope rework).
- CR-1022 MED: concrete-path ambiguity across two roots.
- CR-520 class: six members must still error naming type and RETURN bounded.

## Environment / gates (floor toolchain v26.6.0, npm 11.18.0)
- npm ci exit 0; npm run build exit 0; git status --porcelain empty after build.
- Full suite `node --test test/**/*.test.ts`: 242 tests, 242 pass, 0 fail, 0 skipped, exit 0 (no flakes this run).

## CR-1015 decisive check (gate on own head)
- `node src/gates/citations.ts --result r1 --evidence . --base origin/main` -> GREEN, exit 0, units 3, evidence [delivery/work-history/m2-p5.md]. FIXED at top level.

## Made-vs-quoted (M2-D-22) constructed attacks
- CASE1 made-bad unquoted `src/nope.ts:1` -> RED (correct).
- CASE2 bad in inline backticks + real one -> GREEN (correct, quoted skipped).
- CASE3 bad in ``` fence + real outside -> GREEN (correct).
- F1/F2 unclosed ``` fence hides later made-bad citation -> GREEN. Consistent with CommonMark (unclosed fence runs to EOF); by-design boundary of M2-D-22, not a regression.
- F3 tilde fence not closed by ``` -> stays quoted, real outside resolves (correct fenceChar tracking).
- F4 double-backtick span w/ inner single backtick -> citation lands in a span, hidden (no false red).
- F5 4-space INDENTED code block containing `src/nope.ts:1` -> RED. Divergence: indented code blocks (a third Markdown quoting form) are NOT modeled; only fences + inline spans are. M2-D-22 scoped the decision to "code span or fence", so this is within the decided boundary, and it is diff-scoped (only newly-added indented citations red). Corpus convention is ``` fences. Classify LOW/bounded observation.

## CR-1016 hunk-scope (M2-D-21) - constructed, all correct
- H1 touch line far from pre-existing bad citation -> GREEN (bad not in hunk).
- H2 modify the bad-citation line -> RED.
- H3 insert adjacent line after bad citation -> not-applicable (bad NOT pulled into scope; --unified=0 hunk is +new only). No smuggle.
- H4 pure-deletion hunk at bad citation -> GREEN (deletion contributes no ADD range).
- H5 base before file existed -> whole file added -> bad citation in scope -> RED (true introduction).

## CR-1017 head-vs-tree - constructed, fully closed
- C1 --head REV2 tree REV2 -> green. C2 --head REV1(broken) tree REV2(fixed) -> RED (judges rev). C3 --head REV1 tree REV1 -> red. C4 dirty tree fixing on disk only, HEAD=REV1 -> RED (working tree ignored). Broken --head/--base ref -> error 21.

## CR-1018 traversal - closed structurally
- git cat-file -t "HEAD:src/../../outside.md" -> fatal (git tree has no .. entry). All 3 traversal members -> unresolved RED; control in-repo -> green.

## CR-1019 malformed pin - closed
- P2 64-upper, P3 63-lower, P4 valid+trailing, P5 @sha1: -> all RED naming malformed suffix/trailing. P1 valid -> green.

## CR-520 class - closed/strengthened (git-object substrate)
- M1 working-tree FIFO at cited-target path -> gate reads git object -> green, BOUNDED. M2 FIFO at document path -> green, BOUNDED. M3 git-tree cited target -> error naming type, exit 21, RETURN. M4 committed symlink cited -> read as blob content ("/etc/passwd" string), green, BOUNDED, no fs follow. Whole script 3.2s. Delivered tests (FIFO/git-tree/inventory-FIFO) pass, bounded.

## CR-1022 concrete-path ambiguity - closed
- Default config disjoint: findAmbiguousGlobs=[]; bin/fm-lock.sh -> external only. Overlap config w/ two DIFFERENT globs -> classify=ambiguous [kernel,other] (was first-match external). 3-way -> [a,b,c]. resolveCitation reds ambiguous.

## CR-1020 vacuous guard - closed
- V0 empty required -> RED. V1 self-only -> RED (was green units 1). V3 quoted-only -> RED. V2 self+real -> green. V4 external-only -> not-applicable (escalated policy).

## CR-1021 vanish race - closed by construction
- diff list and content reads both taken from fixed git objects at headSha; a path listed changed but cat-file-missing at headSha is an ERROR (citations.ts:1279-1291), not a benign skip. Immutable objects remove the two-clock race.

## Integration
- Record validates against delivered gate-result schema (via loadSchema/validate): r1.json VALID; live green + error records VALID.
- `tiphys gates run --only citations --base origin/main --head HEAD`: aggregate GREEN, exit 0, gate spawned, record ingested, summary counts correct. Aggregate-level confirmation of CR-1015.
- CLI: --base absent -> error 21 (M2-C-3 named); missing --result/--evidence -> usage 64; unknown flag -> usage 64.

## Read-site derivation (independent, item-3 check FIRST)
- Registered gate (runCitationsGate -> readGitBlob/gitTargetReader) reads ONLY git objects at the head SHA resolved once (resolveRev). Filesystem readRegularFileIfPresent sites are (241) the fixed schema path and (781,1026) the one-shot inventory only; walk (960/972/979) is inventory only. No working-tree content read in the gate path. Matches work-history table (lines 906-922).
- Not covered by me: run.ts runner internals (M2-P1, not this phase); Windows path semantics; exhaustive CommonMark fuzz beyond constructed members; one-shot inventory git-substrate (intentionally filesystem).

## Red-witness (arbitration-specified)
- W1 doc that BOTH makes and quotes src/nope.ts:1 -> RED on MADE only (one detail), units 1. Correct witness.
- W2 quoted bad in a freshly-added (in-hunk) line -> green (quoted exclusion applies in-scope too).

## Work-history / fix-round contract
- Mechanism named (whole-body-vs-hunk; made-vs-quoted; working-tree-vs-git-object). Derivation published (read-site table + gate-on-own-base run + git cat-file behaviour). What-not-covered stated (git internals; run.ts). Claim grep run 3x (lines 693,1325,1388), hits addressed.

## Scope / hygiene
- 6 files vs main, all P5 list + standing append-only registries (behaviors.json, gates.manifest.json) + work history. PASS.
- Non-ASCII grep exit 1 (clean) on all authored files. No em dashes.
- Full floor suite 242/242, 0 flakes (prior review had 6 real-clock flakes; base advanced past them upstream).

## FINDINGS
- No unresolved HIGH or MEDIUM. All of CR-1015/1016/1017/1018/1019/1020/1021/1022 and the CR-520 class verified closed at the mechanism with captured evidence.
- LOW (bounded observation, non-blocking): F5. A citation inside a 4-space INDENTED code block (a third CommonMark quoting form) is treated as MADE and reds. M2-D-22 scoped "quoted" to inline code spans and fenced blocks only, so this is within the settled decision boundary. Direction is FALSE-RED only (never false-green: indented citations are always checked, never hidden), it is diff-scoped (only a newly-added indented unresolvable citation reds), and the repository convention is triple-backtick fences. Self-correcting (author fences or fixes). No action required for merge; could be tracked.

## VERDICT: APPROVE
