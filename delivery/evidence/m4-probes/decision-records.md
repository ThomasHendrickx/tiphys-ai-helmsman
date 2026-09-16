# Probe: decision-records (DR-0037..DR-0043)

Started 2026-09-15. Incremental. Branch plan/pstack-borrow-review at f7576f4.

## Citation audit (40 tokens, all in range; semantic check per token)

- 40/40 resolve within file length.
- WRONG LINE (silent): DR-0037:74 cites DR-0029:50 for "Tiphys owns the
  PROCESS. The project owns the PREDICATE". That sentence is at DR-0029:38.
- WRONG LINE (silent, BLANK): DR-0041:142 cites m4-intake.md:753 as "the
  section that carries" the subprocess-adapter control. Line 753 is empty. The
  control is the H-A hazard row at m4-intake.md:808.
- OFF-TARGET: DR-0038:45 cites STATE.md:82 for "owner overrode the check by
  decision record and BOTH reviewers escalated". STATE.md:82-89 only says the
  check hard-requires two families. The source is
  delivery/verification/dr-0034-premise-check.md:110-112.
- WEAK: DR-0038:79 -> DR-0035:49 (table header); DR-0043:24 -> package.json:22
  (an entry inside files, key is :17); DR-0042:92 -> m4-intake.md:117 (the
  cross-env item is :119-122).
- Hit rate: 34/40 land on the line under discussion.

## Claim grep

Line-based == wrap-insensitive per file (6,6,6,4,2,0,4). 28 hits. Audited in
the structured output; the unsupported ones are DR-0037:10 (cannot be
unpublished, true but uncaptured), DR-0037:53 (cannot be run as written,
contradicted an hour later by DR-0042), DR-0041:105 (never applicable, backed
by a captured ls-files probe: ok), DR-0043:100 (anyway, owner quote).

## Byte check

node scripts/check-authored-bytes.mjs exit 0. Zero em dashes, zero non-ASCII.

## Owner-word audit

- DR-0037: quote present. Part 1 matches. Part 2 generalises one sentence about
  pulse into a kernel-wide amendment of A-2, labelled "vetoable: no".
- DR-0038: NO owner words. Decided line == orchestrator recommendation at
  m4-intake.md:743 ("offered rather than decided"). Narrows DR-0012 cond 1.
- DR-0039: NO owner quote; one paraphrase. Four conditions orchestrator-added.
- DR-0040, DR-0042, DR-0043: quote present, decided line matches.
- DR-0041: orchestrator decision, labelled as such.

## Measured while probing

- ThomasHendrickx/tiphys-ai-helmsman-fleet: private, size 0, BUT branches
  probe-lease-a, tiphys/lease, tiphys/lease-r1; commits ddc5b10 "lease
  holder-A" 23:11:06Z and 0782bc9 "lease holder-A-arm" 23:15:09Z by
  probe@invalid. DR-0037 (committed 22:19Z) says empty and deliberately not
  initialized. True at write time, false now, unrecorded anywhere.
- STATE.md untouched this session (last 3b40118). STATE.md:1613 old A-2;
  STATE.md:79 still recommends making pulse private. No DR-0037..43 in it.
- git ls-files | grep -ci plugin returns 1 (DR-0040 says 0; self-hit).
- DR-0043 grep reproduces per tree; gates.manifest.json (1 hit) omitted.
- All five session commits carry "Co-Authored-By: Claude Opus 5" against
  CLAUDE.md convention 7.
- DR-0036 carries no supersession note pointing at DR-0037; DR-0041 carries
  none pointing at DR-0042 (DR-0012 shows the in-file pattern this repo uses).
- m4-intake.md:742 (M4-D-16 row) still says read-only "was treated as
  forbidden" with no DR-0042 pointer.
