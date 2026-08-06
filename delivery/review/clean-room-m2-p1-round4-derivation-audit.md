# M2-P1 round 3: DERIVATION-AUDIT review (third contract, DR-0016)

Head under review: `4811d2e` (branch `claude/m2-p1-gate-contract-and-runner`).
Previous reviewed head: `411a320`.
Reviewer lab: `scratchpad/m2p1-v3-deriv`, detached at `4811d2e`, clean at start
(`git status --short` empty).
Toolchain: floor `node-v26.6.0-linux-x64` (`node --version` -> v26.6.0,
npm 11.18.0), checked in the shell that runs the commands.

Contract: audit the round-3 DERIVATION and the WITNESS MATRIX only. Not the
criteria (concurrent reviewer), not general hazards (two prior contracts).

Findings numbered from CR-940.

## Log (incremental, appended as work proceeds)

- [start] worktree verified at 4811d2e, clean. npm ci starting.

## Q1: is the closure argument sound?

**Method: sound. Published closure LIST: wrong in one member. Exclusion list:
incomplete, but unoccupied.**

### Q1a. I re-derived the closure with a script, not by eye

`closure.mjs` in this lab follows every relative specifier transitively from a
given entry and reports builtin specifiers per file.

    $ node closure.mjs src/gates/run.ts
    CLOSURE (8 files):
      src/fleet.ts  src/gates/manifest.ts  src/gates/pin.ts  src/gates/result.ts
      src/gates/run.ts  src/gates/validate.ts  src/lock.ts  src/task.ts

`src/fleet.ts` is a false positive of my own tool: `src/task.ts:11` is
`import type { Fleet }`, type-only and erased. `src/lock.ts` is NOT:

    $ grep -rnE 'from "\.\.?/' src/task.ts
    src/task.ts:11:import type { Fleet } from "./fleet.ts";
    src/task.ts:12:import { leaseStatus } from "./lock.ts";

Line 12 is a VALUE import. So the true runtime down-closure of `runGates` is
SEVEN files: `src/gates/{run,manifest,pin,result,validate}.ts`, `src/task.ts`,
`src/lock.ts`.

The work history's not-covered item 4 names the closure as
`src/gates/{run,manifest,pin,result,validate}.ts`, `src/commands/gates.ts`,
`src/task.ts`, `src/cli.ts`, `bin/tiphys.ts`, and then says the derivation
"does NOT cover `src/lock.ts`". **`src/lock.ts` is in the closure.** That is
the finding, CR-940 below.

Two smaller inaccuracies in the same list: `src/cli.ts` and `bin/tiphys.ts` are
in the UP-closure (they call `runGates`), not the down-closure; nothing
`runGates` executes lives there. Including them is harmless over-inclusion, but
including them while excluding their siblings is inconsistent, since
`src/cli.ts` imports all eight `src/commands/*` and transitively every module
item 4 lists as excluded:

    $ grep -nE '^import' src/cli.ts
    1: cmdDoctor  2: cmdGates  3: cmdInit  4: cmdLock
    5: cmdPool    6: cmdSpawn  7: cmdTeardown  8: cmdWatch  9: printVersion

### Q1b. Does the missed member have an OCCUPANT? NO.

`src/lock.ts` holds ELEVEN mutating call sites, so the omission is not trivial:

    $ grep -nE '\b(writeFileSync|unlinkSync|renameSync|linkSync|mkdirSync|rmSync)\s*\(' src/lock.ts
    214 writeFileSync  259 unlinkSync  301 unlinkSync  327 writeFileSync
    329 linkSync       340 unlinkSync  357 writeFileSync  359 renameSync
    362 unlinkSync     393 unlinkSync

But none is reachable from the gate call tree, on three independent grounds,
each with its command:

1. The only symbol `src/task.ts` imports from `src/lock.ts` is `leaseStatus`,
   and `leaseStatus` is READ-ONLY (`observeLease` then a pure classification,
   `src/lock.ts:607-622`). None of the eleven mutations is inside it.
2. `leaseStatus`'s sole consumer in `task.ts` is `checkHoldership`
   (`src/task.ts:345`), and `run.ts` does not import it:

       $ sed -n '5,11p' src/gates/run.ts
       classifyEntry, readRegularFileIfPresent, refuseOpenForWrite, runStep, singleLine

       $ grep -rn 'checkHoldership' src/ bin/ test/
       src/spawn.ts:9  src/spawn.ts:278  src/task.ts:345
       src/teardown.ts:8  src/teardown.ts:334

   Both call sites are outside the closure.
3. `src/lock.ts` has NO module-level side effects, so mere import executes
   nothing:

       $ grep -nE '^[a-zA-Z]' src/lock.ts | grep -vE ':(import|export|const |type |interface |function |declare )'
       (no output)

So the derivation's INVENTORY is unaffected: no twelfth row hides in
`src/lock.ts`. What is wrong is the derivation's stated SCOPE, and per this
contract's own rubric a hole with no occupant is a LOW.

### Q1c. Is the exclusion list complete? No. Is the hole occupied? No.

The published exclusion grep is `require(`, `await import(`, `import(`,
`globalThis[`, `process.binding`. It omits at least six further routes to a
module or a symbol by name. I ran the extended form over the closure INCLUDING
`src/lock.ts`, plus the two over-included files:

    $ grep -nE 'createRequire|node:module|\beval\s*\(|new Function|Function\s*\(\s*["'"'"']|process\.getBuiltinModule|import\.meta\.resolve|module\.constructor|__proto__|Reflect\.(get|apply)|process\.binding|globalThis\[|require\s*\(|import\s*\(' <closure + lock.ts + cli.ts + bin>
    src/gates/validate.ts:135: * Own-property test. `properties["__proto__"]` resolves through the prototype
    src/gates/validate.ts:137: * `__proto__` as a DECLARED property and lets it through

Two hits, both PROSE in a comment about JSON-schema own-property handling.
Neither is a module-access escape.

Two further routes that would defeat the NAME-based half of the argument even
without dynamic module access, both also empty:

    $ grep -nE 'import \* as' <same set>              (no output, exit 1)
    $ grep -nE '\b(fs|fsp|cp|child_process)\s*\[' <same set>   (no output, exit 1)

A namespace import (`import * as fs`) would make every mutation invisible to a
named-symbol grep; there is none. Computed member access on an fs binding would
do the same; there is none.

**Verdict on Q1: the name-independence argument HOLDS today.** Every filesystem
mutation reachable from `runGates` must come through a statically named
`node:fs` binding, because the closure has no dynamic module access, no
namespace import, and no computed access on an fs binding. The exclusion list
that was published is not itself complete, and the closure list has a genuine
missing member; neither has an occupant.

## Q2: are the 11 rows real and the 6 correctly classified?

**Yes. The row set reproduces exactly; no twelfth row; the 5 unguarded-but-safe
rows check out.**

Published grep re-run verbatim over the published closure:

    $ grep -nE '\b(spawnSync|mkdirSync|renameSync|rmSync|unlinkSync|writeFileSync)\s*\(' <closure>
    run.ts:249 mkdir   run.ts:352 write   run.ts:388 spawn(git)  run.ts:524 spawn(pre)
    run.ts:694 rmSync  run.ts:707 spawn(gate)  run.ts:1070 write wx
    run.ts:1141 rename run.ts:1193 unlink  commands/gates.ts:155 write
    task.ts:272 write
    count=11

ELEVEN, the same eleven, same operations, same order. NOTE: the line numbers in
the work-history table are the PRE-fix ones (240/287/323/459/587/600/954/1012/
1064); at the merged head they are 249/352/388/524/694/707/1070/1141/1193. A
later reader following the table's citations lands on the wrong lines. Cosmetic,
recorded as a low.

**Twelfth-row hunt.** I widened the pattern from six symbols to twenty-nine
mutating `node:fs`/`node:child_process` APIs and added the closure member the
derivation missed:

    $ grep -nE '\b(spawnSync|spawn|exec|execSync|execFile|execFileSync|fork|mkdirSync|mkdtempSync|renameSync|rmSync|rmdirSync|unlinkSync|writeFileSync|appendFileSync|copyFileSync|cpSync|openSync|writeSync|truncateSync|ftruncateSync|symlinkSync|linkSync|chmodSync|chownSync|utimesSync|createWriteStream|writeFile|opendirSync)\s*\(' <closure> src/lock.ts

Returns the same 11 rows plus 10 in `src/lock.ts` (and one comment line), all
of which Q1b shows unreachable from the gate call tree. **No twelfth row.**

**The 6 guarded rows: the guard call sites exist and are where claimed.**

    $ grep -n 'guardedWrite\|writeInsideClaim\|mkdirInsideClaim\|refuseUnlessHolder' src/gates/run.ts
    294 refuseUnlessHolder (def)      310 writeInsideClaim (def)
    335 mkdirInsideClaim (def)        347 guardedWrite (def)
    590  mkdirInsideClaim   <- row 1a
    623  refuseUnlessHolder <- row 4, precondition dispatch
    682  refuseUnlessHolder <- rows 5 and 6, clear + gate dispatch
    1132 refuseUnlessHolder <- row 8, rename
    1378 mkdirInsideClaim   <- row 1b
    713 719 1114 1255 1384 writeInsideClaim <- row 2

Six kinds, six askers of one predicate, as the table says.

**The 5 rows classified safe, each checked rather than accepted:**

- Row 2 (352): `guardedWrite`'s only caller is `writeInsideClaim` (line 318),
  which asks `refuseUnlessHolder` first. Confirmed by the grep above: no
  `guardedWrite(` call site other than 318.
- Row 7 (1070): `writeFileSync(claimPath, body, { flag: "wx" })`. O_EXCL, self
  guarding, correct.
- Row 9 (1193): inside `releaseEvidenceDirectory`, which reads `claimHolder`
  and returns false unless it is its own runId. Read the body; correct.
- Row 10 (commands/gates.ts:155): the `--result` path of `gates self-check`.
  Reachable with an evidence-directory argument, but only as a SEPARATE process
  invocation, which is exactly not-covered item 1 (a gate's own write). Honest.
- Row 11 (task.ts:272): `writeTaskMeta`. Not imported by the closure:
      $ grep -rn 'writeTaskMeta\|setTaskStatus\|checkHoldership' src/gates/ src/commands/gates.ts bin/
      (no output, exit 1)
  `run.ts` imports exactly `classifyEntry, readRegularFileIfPresent,
  refuseOpenForWrite, runStep, singleLine` from `task.ts`. Correct.

## Q3: is the witness matrix honest?

I re-ran the matrix MYSELF. Pristine snapshot taken first:

    $ md5sum src/gates/run.ts run.ts.PRISTINE
    12500fa2b980adb0431151f8ff1dcac8  (both)

which is byte-identical to the md5 the work history publishes, so the tree I am
measuring is the tree it measured. `--test-name-pattern` precedes the path in
every run; the harness aborts a row unless the pattern selects exactly ONE test.

    CONTROL  W1 [ok]   W2 [ok]   W3 [ok]   W4 [ok]   P6test [ok]

    D1 (git show 411a320:src/gates/run.ts, the round-2 source)
             W1 [FAIL] W2 [FAIL] W3 [FAIL] W4 [FAIL] P6test [ok]

    D2 (the PRIOR REVIEW'S SUGGESTED FIX, reconstructed by ME from its
        description onto D1: one claimHolder check at the top of runOneGate,
        returning an error result when the holder is not this runId)
             W1 [ok]   W2 [ok]   W3 [FAIL] W4 [FAIL] P6test [ok]

**D2 REPRODUCES.** I did not copy the implementer's patch; I wrote the review's
fix myself against the round-2 source (`d2Holder` at run.ts:522-523 in the
defanged copy) and got the claimed split exactly: green on the two members the
review constructed, RED on the two it did not. The claim that the review's own
fix would have shipped a hole is MEASURED, not argued, and the DR-0016
fresh-implementer dispatch is paid for by this row.

Restoration after every defang is by copy, never `git checkout --`; md5 checked
back to `12500fa2b980adb0431151f8ff1dcac8` after each.

### The rest of the matrix, re-run by me

    P2 (minus the row-4 precondition-dispatch guard)   nothing red   AS CLAIMED
    P4 (minus the row-8 rename guard)                  nothing red   AS CLAIMED
    P6 (`!(counts.green > 0)` -> `counts.green === 0`) CR-901 test only, AS CLAIMED
    P7 (minus row 1a AND rows 5-6)  W1 W2 W3 W4 all FAIL  AS CLAIMED

Every row I ran reproduces the published result. Restoration md5 after each:
`12500fa2b980adb0431151f8ff1dcac8`.

### My own construction attempt on P2 and P4 (the two unwitnessed guards)

The contract asked for up to ten minutes on ONE construction. I spent it on
row 4 (the precondition-dispatch guard) and came back empty-handed, and I can
say WHY rather than only that I failed.

First the structural reason, with the command:

    $ grep -n 'evaluatePrecondition(' src/gates/run.ts
    410:function evaluatePrecondition(      (definition)
    634:    const outcome = evaluatePrecondition(entry.precondition, options, cwd);

One call site. It is dominated by the row-1a guard at line 590, and the code
BETWEEN 590 and the row-4 guard at 623 (`src/gates/run.ts:596-617`) is joins, a
`requiredParameters` filter and an early return: **no subprocess dispatch, no
await, no I/O that another process could interleave with in-process.** So a
theft cannot land in that window in-process, which is why P2 is green.

Then the empirical attempt, which is the part that is not a reading. If row 4's
guard has any independent cover value it should show up when its dominator is
also removed, so I ran a combination the implementer did not:

    X1 = minus row 1a mkdir guard AND minus row 4 precondition guard
         W1 [ok]  W2 [ok]  W3 [ok]  W4 [FAIL]
    X2 = minus row 1a mkdir guard ONLY (the published P1)
         W1 [ok]  W2 [ok]  W3 [ok]  W4 [FAIL]

**Identical.** Removing row 4's guard on top of its dominator's removal changes
nothing. So row 4's guard is not merely unwitnessed alone, it is unwitnessed in
combination with the only guard that shadows it. That CONFIRMS the work
history's label ("defense in depth with an accurate label") rather than
refuting it: the round did not overclaim, and it did not quietly present P2 and
P4 as coverage.

Row 8 (P4) I did not construct, and the reason it is unreachable is the same
shape: `writeSummaryAtomically` does the holdership-checked staged write at
line 1114 and the rename at 1141, with only a `refuseOpenForWrite` stat
between; nothing this runner dispatches is still alive at that point. Reaching
it with the claim lost needs a second runner racing, which is the work
history's own not-covered item 6 and remains unwitnessed. **Scope of my
attempt: in-process constructions using the existing fixture vocabulary
(programs the runner itself dispatches). I did NOT attempt a genuine two-process
race, and an unwitnessed guard there is unchanged from round 2.**

**Verdict on Q3: the matrix is HONEST.** Six published rows re-run, six
reproduce. The two green rows are labelled green and are labelled defense in
depth, not coverage. P7's redundancy statement is correct and I did not find a
row that overstates.

## Q4: CR-901's witness and CR-903's removal

**CR-901.** The witness reddens under exactly the defang claimed:

    P6 (`counts.green === 0`)  gate-aggregate-nonenumerable-nan-green [FAIL]
                               W1 W2 W3 W4 all [ok]

so the test discriminates the two forms and discriminates ONLY them. The
"unwitnessable" label round 2 shipped was wrong and is now corrected with a
measurement. Guard site confirmed at `src/gates/run.ts:1024`.

**CR-903.** The field is gone and had no reader:

    $ git diff 411a320 -- src/gates/run.ts | grep -E '^[-+].*refused'
    -  refused?: boolean;
    -    return { runId, exitCode: EXIT_GATE_ERROR, reason: claimRefusal, refused: true };
    +  // CR-903. A `refused?: boolean` used to sit here with one producer ...

    $ grep -rn '\.refused\|refused:' src/ test/ bin/ --include=*.ts
    (10 hits, ALL unrelated: string literals in src/lock.ts, src/pool.ts,
     a parameter name in test/exit-test-local.test.ts, assertion messages in
     test/teardown.test.ts. NONE is a member access on a RunOutcome.)

One producer removed, zero readers, confirmed independently. The sole consumer
of `runGates` is `src/commands/gates.ts:112` and it reads `runId`, `exitCode`,
`summary`, `reason`.

## Also: gates, registry, scope, claim grep

**Gates, both toolchains, `node --version` checked in the running shell:**

    floor   v26.6.0 (npm 11.18.0)   npm ci exit 0, npm run build exit 0,
                                    clean git status after build
                                    npm test -> tests 201, pass 201, fail 0,
                                    skipped 0, todo 0
    default v22.22.2 (via bash -lc) npm test -> tests 201, pass 199, fail 0,
                                    skipped 2, todo 0

Both match the work history's claim exactly (201/201/0 and 201/199/2).

**Registry:**

    registry entries: 207
    test titles found: 201
    unresolved by description->title: 0

207 with zero unresolved, as claimed. Append-only confirmed: the single deleted
line is the pre-existing key `gate-aggregate-total-over-bad-counts` re-emitted
with a trailing comma, same key and same description; the five genuinely new
keys are `gate-claim-lost-no-record-delete`, `gate-claim-lost-no-dispatch`,
`gate-claim-stolen-by-precondition`, `gate-claim-lost-no-mkdir`,
`gate-aggregate-nonenumerable-nan-green`. No rewrite.

**Scope:**

    $ git diff --name-only 411a320
    delivery/work-history/m2-p1.md  src/gates/run.ts
    test/behaviors.json             test/gates.test.ts

Four files, all in the envelope. Pure ASCII:
`grep -rlP '[^\x00-\x7F]'` over all four returns nothing (exit 1).

**Claim grep byte-identity.** The work history ran it against `e2c05b8`; HEAD
is `4811d2e`, whose only change is the commit that ADDS the claim-grep section.
The two objects differ in md5 for that reason. The four substantive hits are
unchanged at the same line numbers (1946, 2070, 2153, 2215) at HEAD; running
the grep on the HEAD object returns 13 hits in the round-3 section, of which 9
are the claim-grep section quoting its own four hits back. That is expected
self-reference, not drift. No new unsettled claim entered the file.

## Findings

**CR-940 (LOW): the stated derivation scope names a closure member as excluded.**
Not-covered item 4 says the derivation "does NOT cover `src/lock.ts`".
`src/lock.ts` IS in the runtime import closure of `runGates`, via
`src/task.ts:12`, a VALUE import of `leaseStatus`, and it holds ten mutating
call sites. This is the exact failure shape the fix-round contract's item 3
exists to catch, and it is the reviewer's first check, so it is worth naming
even though it is empty. It IS empty: Q1b gives three independent commands
showing no lock.ts mutation is reachable from the gate call tree, and the
twelfth-row hunt over the widened symbol set finds nothing. Hole with no
occupant. Suggested disposition: correct the sentence in the work history to
read that `src/lock.ts` is in the closure and was checked and found unreachable,
with the three commands. No code change.

**CR-941 (LOW): the no-dynamic-access exclusion list is not complete.**
`require(`, `import(`, `globalThis[`, `process.binding` omit at least
`createRequire` / `node:module`, `eval(`, `new Function`,
`process.getBuiltinModule`, and `import.meta.resolve`. Separately, the
NAME-independence half has two routes the published greps do not exclude at
all: a namespace import (`import * as fs`) and computed member access on an fs
binding (`fs["writeFileSync"]`), either of which would make a mutation
invisible to the six-symbol grep without any dynamic module access. All eight
are empty over the closure plus `src/lock.ts` (commands in Q1c; the only hits
are two prose lines in a `validate.ts` comment about `__proto__`). Hole with no
occupant. Suggested disposition: paste the widened grep.

**CR-942 (LOW, cosmetic): the inventory table cites pre-fix line numbers.**
The table's citations (240, 287, 323, 459, 587, 600, 954, 1012, 1064) are the
positions before the fix; at the merged head they are 249, 352, 388, 524, 694,
707, 1070, 1141, 1193. The row SET is identical, so nothing is wrong with the
derivation; a later reader following a citation lands elsewhere.

No medium and no high. Nothing found makes the spine unsafe for the seven
phases that build on it.

## VERDICT: APPROVE

Three lows, all paperwork, none blocking. The two questions this contract
exists to answer both come back positive: the closure argument holds today,
and the witness matrix is honest, including its load-bearing D2 row, which I
reconstructed from the review's description and reproduced.
