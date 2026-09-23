/**
 * THE DUAL-REVIEW DECORRELATION CHECK (kernel plan M3, M3-P9 step 3b,
 * criteria 7 and 7b; M3R-004, DR-0012, T-001, T-007).
 *
 * The orchestrator's `decorrelated-review` duty, made into a command with an
 * exit code. A kernel that can REPRESENT the delegated-merge regime but cannot
 * DETECT a run that quietly used one model family twice reproduces the exact
 * failure class T-001 exists to prevent, this time invisible because the
 * kernel's own artifacts never looked.
 *
 * THE COMPARISON IS NOT HERE. It is the Kind B derived check
 * `dual-review-decorrelation` in `src/checks.ts`, registered for artifact type
 * `verdict`, and this script is only the runner around it. That split is what
 * makes criterion 7's last direction a real witness rather than a simulated
 * one: DEREGISTERING the check makes the shared-family fixture pass, because
 * there is then nothing left that would object to it, and that is the shape
 * section 2.3 rule 3 asks a Kind B criterion to be falsified by.
 *
 * IT RUNS TWO CHECKS, BY ID, AND THAT IS DELIBERATE. M4-P10 added the second,
 * `verdict-pair-approves`, which is DR-0012 condition 2 made into a predicate.
 * Before it this gate could not see a verdict's VALUE at all, so two properly
 * decorrelated reviews that both REFUSED the merge passed green. The two counts
 * are printed SEPARATELY, because deregistering either one is its own Kind B
 * witness and a reader must be able to tell which guard was absent.
 *
 * BY ID, AND NOT THROUGH `runChecks`, is the older half of the same decision.
 * `runChecks` would
 * run every check registered for `verdict`, including the three cross-document
 * COMPLETENESS checks M3-P7 ships, which resolve `plan.yaml` and
 * `work-history.yaml` out of the context. Those are real rules and they are not
 * this gate's question; a script named for dual review that failed because a
 * plan document was absent would be reporting the wrong thing. So the check is
 * selected by id out of `registeredChecks()`, and how many checks were selected
 * is PRINTED, because "the guard ran and found nothing" and "no guard ran" must
 * not print the same line (SC-011).
 *
 * THE DIRECTORY NO LONGER SCOPES A SET OF VERDICTS TO ONE HEAD, AND THAT IS
 * M4-P10's FIRST CHANGE. Until then `schemas/verdict.schema.json` carried no
 * head field, so the join key was `phase` and the operator's choice of directory
 * was the only thing tying a pair to one commit, a reading declared in
 * delivery/work-history/m3-p9.md rather than absorbed. The schema now REQUIRES
 * `head`, forty lowercase hex digits, and the derived check groups by
 * `(phase, head)`. Two verdicts for two different heads in one directory are
 * now two groups of one and are refused; they used to be compared as a pair.
 *
 * TWO ARMS, and the second exists because of the gate contract rather than the
 * criterion. `--precondition <dir>` answers only "is there any verdict document
 * to compare", which is what `gate-registry.yaml` declares as this gate's
 * precondition: a merged head has no pair of verdicts, and a gate that cannot
 * reach a verdict must report not-applicable WITH A REASON rather than green,
 * which is M2-C-3 and SC-011 applied to M3's own check.
 */

import { mkdirSync, realpathSync, writeFileSync } from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";
import { dirname, join, resolve } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, "..");

const resultModule = await import(
  pathToFileURL(join(repoRoot, "src", "gates", "result.ts")).href
);
const taskModule = await import(
  pathToFileURL(join(repoRoot, "src", "task.ts")).href
);
const checksModule = await import(
  pathToFileURL(join(repoRoot, "src", "checks.ts")).href
);
/* M5-P3. THE REVIEW BUDGET IS READ FROM THE MERGE-PRECONDITIONS MODULE, never
   copied here: both review gates must classify one diff into one tier, and two
   copies of DR-0027's table would be two answers the day one of them is edited. */
const budgetModule = await import(
  pathToFileURL(join(repoRoot, "src", "gates", "merge-preconditions.ts")).href
);
const { makeGateResult, renderGateResult, exitCodeForStatus } = resultModule;
const {
  classifyReviewBudget,
  budgetPrecondition,
  missingReviewsSentence,
  REQUIRED_VERDICTS,
} = budgetModule;
const { refuseOpenForWrite } = taskModule;
const {
  registeredChecks,
  readReviewFamilies,
  reviewFamiliesProvenanceLine,
  loadCommittedVerdicts,
  describeVerdictCorpusSource,
  missingRegimeDocument,
  resolveAuditedHead,
  partitionByAuditedHead,
  describeOffHeadVerdicts,
  describeAdmittedVerdicts,
  resolveCorpusSource,
  REVIEW_FAMILIES_FIELD,
  CHARTER_DOCUMENT,
} = checksModule;

const GATE_ID = "check-dual-review";
const UNIT_LABEL = "review verdicts examined for decorrelation";
const CHECK_ID = "dual-review-decorrelation";
/* M4-P10 step 6. DR-0012 condition 2's predicate, run ALONGSIDE the
   decorrelation check rather than instead of it, and counted separately.
   Separately is the point: `0 registered check(s) named verdict-pair-approves`
   beside a green is what tells a reader that the deregistration witness is
   running rather than that the pair was examined and found clean, which is
   the same SC-011 distinction the existing line draws for its sibling. */
const PAIR_CHECK_ID = "verdict-pair-approves";
const EXIT_NOT_APPLICABLE = 20;
const EXIT_GATE_ERROR = 21;

/* M4-P11, DR-0038. THE PRECONDITION ID FOR THE DECLARED SINGLE-FAMILY ARM, AND
   IT IS A NEW ID RATHER THAN THE EXISTING ONE ON PURPOSE. This gate already has
   a not-applicable arm, for a directory carrying NO verdicts, and its reason
   says there is no pair of reviews to compare. Routing the exception through
   that arm would have made the record assert something false: there ARE two
   reviews here, they were read, and what is unmet is the CROSS-FAMILY part of
   DR-0012 condition 1. Two facts, two ids. */
const SINGLE_FAMILY_PRECONDITION = "single-family-declared";

/* THE MARKER THAT MAKES A DECLARED EXCEPTION VISIBLE AT BUNDLE LEVEL.
   `src/gates/release.ts:1050` already writes this exact string as a
   precondition-evidence entry for the sibling declared-none case, and
   `src/gates/run.ts` reads it to name declaring gates in the aggregate reason
   line. It is an EXACT ELEMENT of a structured array, never a pattern over the
   detail prose, and `test/single-family-exception.test.ts` asserts that the
   producer's constant and the runner's constant are the same string, so the two
   ends cannot drift apart silently. A boolean on `PreconditionRecord` would be
   the better home; `src/gates/schemas/gate-result.schema.json` is
   `additionalProperties: false` on that object and is not on this phase's
   files-to-touch list, so that is recorded as residue rather than done here. */
const DECLARED_EVIDENCE = "declared: true";

function usage() {
  return (
    "usage: node scripts/check-dual-review.mjs [--precondition [--review-budget]] <dir> " +
    "[--base <ref>] [--head <sha>] [--result <path>] [--evidence <dir>]"
  );
}

function parseArgs(argv) {
  const options = {
    directory: undefined,
    precondition: false,
    result: undefined,
    evidence: undefined,
    /* THE COMMIT UNDER AUDIT (CR-VS-001). Optional, and its ABSENCE is not the
       old behaviour: with no `--head` the audited commit is the one the context
       directory's own `HEAD` resolves to, which is what the checkout put there.
       The flag exists so the gate runner can pass the pull-request event's head
       sha explicitly, which `gate-registry.yaml`'s `parameters: [head]` now
       makes it do, exactly as it has always done for `scope`. */
    head: undefined,
    /* M5-P3. THE DIFF BASE, and with it the REVIEW BUDGET. When present the
       gate classifies `base...head` by DR-0027's table and a dual-tier change
       with fewer than two admitted verdicts is RED, where without it an empty
       corpus is the not-applicable it has always been. The registry declares
       `parameters: [base, head]`, so every runner invocation supplies it; the
       workflow step in .github/workflows/gates.yml does not, and keeps the
       M3-P9 meaning. */
    base: undefined,
    /* M5-P3. The precondition question for a runner that supplies `--base`:
       not "is there a verdict" (whose NO is exactly the mechanism that let an
       unreviewed shipped change read as not-applicable, T-040) but "is there a
       commit here whose review budget the gate can decide". */
    reviewBudget: false,
  };
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === "--precondition") {
      options.precondition = true;
      continue;
    }
    if (argument === "--review-budget") {
      options.reviewBudget = true;
      continue;
    }
    if (argument === "--base") {
      const value = argv[index + 1];
      if (value === undefined || value.startsWith("--")) {
        return { usageError: "--base requires a value" };
      }
      options.base = value;
      index += 1;
      continue;
    }
    if (argument === "--head") {
      const value = argv[index + 1];
      if (value === undefined || value.startsWith("--")) {
        return { usageError: "--head requires a value" };
      }
      options.head = value;
      index += 1;
      continue;
    }
    if (argument === "--result" || argument === "--evidence") {
      const value = argv[index + 1];
      if (value === undefined || value.startsWith("--")) {
        return { usageError: `${argument} requires a value` };
      }
      options[argument.slice(2)] = value;
      index += 1;
      continue;
    }
    if (argument.startsWith("--")) {
      return { usageError: `unknown option ${String(argument)}` };
    }
    if (options.directory !== undefined) {
      return { usageError: "exactly one directory argument is accepted" };
    }
    options.directory = argument;
  }
  if (options.directory === undefined) {
    return { usageError: "a directory argument is required" };
  }
  if (options.reviewBudget && !options.precondition) {
    return { usageError: "--review-budget qualifies --precondition and is refused without it" };
  }
  return { options };
}

/**
 * Every verdict document in the directory's committed record, and every
 * candidate in it that could not be examined.
 *
 * THIS NO LONGER RE-IMPLEMENTS THE SELECTION RULE, AND THAT IS THE POINT
 * (M4-P11 fix round 1, CR-M4P11-001). Until this round there were TWO
 * enumerations of the corpus, one here and one in `loadCommittedVerdicts`, and
 * the comment above this function said they were "deliberately the same
 * selection rule". Deliberate sameness maintained by hand is exactly how the
 * two halves of one decision drift, and both copies shared the same defect:
 * they read the WORKING TREE, out of one hard-coded directory, while the
 * declaration they are checked against is read from the git object database.
 *
 * So the second copy is gone. This calls the shipped loader, which decides
 * commit-or-worktree ONCE, reads every candidate blob of the whole subtree out
 * of the commit when there is one, and returns the source it used, so this
 * script prints WHICH set it examined instead of naming a directory it may not
 * have read.
 *
 * THE SUBTREE SENTENCE ABOVE WAS FALSE UNTIL THE DR-0047 SWEEP AND IS NOW TRUE
 * (CR-VS-002). `loadCommittedVerdicts` listed `delivery/review/` NON-recursively
 * while the falsifiers' loader listed `delivery/` recursively, so this comment
 * described the wrong corpus and an operator who believed it and filed verdicts
 * in a subdirectory got `0 verdict document(s)` and a not-applicable gate. Both
 * loaders now read the same depth, and the comment is left in place rather than
 * rewritten because the code was changed to match it.
 *
 * AND THE CORPUS IS NOW ANCHORED TO THE COMMIT UNDER AUDIT (CR-VS-001). A
 * verdict that names a different head, or a head that is not a commit here at
 * all, is EXCLUDED and NAMED. See `resolveAuditedHead` in `src/checks.ts` for
 * the mechanism and for the two arms that were reproduced green before it.
 * `unkeyed` verdicts, the ones whose head is PRESENT and unusable, are kept in
 * the set on purpose: dropping them would turn today's red into a quiet
 * not-applicable, and the derived check is the thing that refuses them.
 * KERNEL 0.2.1 (DR-0053, DR-0054) NARROWED THAT TO PRESENT-AND-UNUSABLE. A
 * verdict with NO head key is the shape of every verdict written before the
 * field existed, and keeping it to be refused made every run red on history a
 * consumer cannot change, so `partitionByAuditedHead` now EXCLUDES it by name
 * as `no-head` and it arrives here in `offHead`, never admitted.
 *
 * `unexaminable` IS THE HALF THIS LOOP USED TO THROW AWAY, AND THROWING IT AWAY
 * HERE COSTS MORE THAN IT DOES IN THE CHECK. This function decides both which
 * documents the checks are RUN OVER and, through `--precondition`, whether the
 * gate RUNS AT ALL. A directory whose only review documents fail to decode
 * therefore reported `0 verdict document(s)`, the precondition exited 1, and the
 * gate was NOT-APPLICABLE: the merge evidence was unreadable and the gate said
 * there was nothing to compare. So a candidate that passed the extension filter
 * and could not be read or decoded is carried out of here, the precondition
 * counts it as a reason to run, and `evaluate` refuses the directory with status
 * `error`, which is the same fail-closed rule `REGIME_DOCUMENTS` applies one
 * screen down: at this layer, could-not-determine is `error` and never green.
 */
export function committedVerdictPaths(directory, requestedHead) {
  const loaded = loadCommittedVerdicts(directory);
  if (!loaded.ok) {
    return { ok: false, reason: loaded.reason };
  }
  const anchor = resolveAuditedHead(directory, requestedHead, loaded.source);
  /* THE ANCHOR IS CARRIED, NEVER APPLIED SILENTLY. `error` is returned as a
     value rather than thrown or folded into an empty corpus, because an empty
     corpus is what the not-applicable arm is made of and "the commit under
     audit could not be established" must never be reported as "there is
     nothing to compare" (M2-C-3). */
  if (anchor.kind === "error") {
    return { ok: false, reason: anchor.reason, anchor };
  }
  const partition =
    anchor.kind === "anchored"
      ? partitionByAuditedHead(directory, loaded.verdicts, anchor.head)
      : {
          onHead: [...loaded.verdicts],
          admitted: [],
          offHead: [],
          unkeyed: [],
          unkeyedVerdicts: [],
        };
  /* KEPT: the verdicts about this commit, AND the ones that do not say what
     they reviewed. Only a verdict that names a DIFFERENT commit is excluded.
     Dropping an unkeyed verdict would convert the derived check's red into a
     quiet not-applicable, which is the shrinking-corpus shape this file has
     paid for three times. */
  const kept = [...partition.onHead, ...partition.unkeyedVerdicts];
  return {
    ok: true,
    anchor,
    /* M5-P3. How many verdicts were ADMITTED to the audited group, which is
       the number the review budget is measured against. Unkeyed verdicts are
       kept in `paths` for the check to refuse and are NOT counted here: a
       document that does not say what it reviewed is not a review of this. On
       the unanchored arm every loaded verdict is kept and counted, which is
       the old behaviour for a context with no repository. */
    admittedCount: anchor.kind === "anchored" ? partition.admitted.length : partition.onHead.length,
    offHead: partition.offHead,
    offHeadLines:
      anchor.kind === "anchored" ? describeOffHeadVerdicts(partition.offHead, anchor.head) : [],
    /* THE ADMISSIONS, PRINTED FOR THE SAME REASON THE EXCLUSIONS ARE. A green
       reached because the verdicts name the audited commit and a green reached
       because they name an ancestor whose whole gap is paperwork are different
       facts, and the second is the one a reader has to be able to audit: it is
       the relaxation, and an unprinted relaxation is indistinguishable from the
       equality anchor that could never pass. */
    admittedLines:
      anchor.kind === "anchored" ? describeAdmittedVerdicts(partition.admitted, anchor.head) : [],
    paths: kept.map((entry) => ({ path: entry.path, instance: entry.record })),
    /* M4-P10 FIX ROUND 2's CHANNEL, NOW READ OFF THE SHIPPED LOADER INSTEAD OF
       OFF THIS FILE'S OWN LOOP. The loop is gone (see above), so the candidates
       that could not be examined arrive as `Diagnostic` records and this layer
       wants their sentences. Dropping the channel with the loop would have
       reverted the fail-closed rule: a directory whose only review documents
       fail to decode reported `0 verdict document(s)`, the precondition exited 1,
       and the gate was NOT-APPLICABLE. */
    unexaminable: loaded.unexaminable.map((diagnostic) => diagnostic.message),
    source: loaded.source,
  };
}

/**
 * Run the decorrelation check over every committed verdict in one directory.
 *
 * EXPORTED so `test/dual-review.test.ts` can deregister the check and call this
 * again IN PROCESS, which is criterion 7's Kind B witness. A witness that
 * re-implemented the loop in the test would be asserting about a copy.
 */
/**
 * THIS IS WHERE THE FAIL-CLOSED TEETH LIVE, and it is a deliberate placement
 * rather than the original design. The derived check treats an ABSENT charter
 * as "this context declares no delivery mode" and reports it, because it runs
 * on any verdict with any context and a verdict fixture directory is not a
 * project workspace. THIS caller is different: it is the command DR-0012's
 * grant runs through, and a merge check that cannot determine the regime must
 * never report green. So the refusal is here, where the merge decision is
 * made, and not in a check that has to be usable somewhere else.
 *
 * THE LIST AND THE PROBE ARE NO LONGER THIS FILE'S (FIX ROUND 2, DV-001).
 * Until this round `REGIME_DOCUMENTS` was a second copy of the list and
 * `classifyEntry` was a second probe of the fact, and that probe read the
 * WORKING TREE while `establishDelegatedRegime` read the COMMIT. Both answered
 * correctly about their own source, so the disagreement was never reported: a
 * `charter.yaml` written into a working tree and committed nowhere passed this
 * refusal, reached a check that found no charter in the commit, and was
 * reported GREEN on a committed pair sharing one `produced-by`. Measured, one
 * context, one variable changed (the head this script is run from): red exit 1
 * before the round that introduced it, green exit 0 after. So the list and the
 * probe now live once, in `src/checks.ts`, beside the check that consumes the
 * answer, and this file calls them.
 *
 * ORDERED AFTER THE DECLARATION READING, DELIBERATELY. Both are `error` and a
 * context with nothing committed satisfies both, so the order decides only
 * which reason a reader is given. DR-0038's "an exception read from an
 * uncommitted file is error, never permission" is the more specific of the
 * two, and it is the one that names what the operator actually did.
 *
 * THE SOURCE IS THE ONE THE CORPUS WAS READ FROM, passed rather than
 * re-resolved, so this refusal cannot be about a different commit than the
 * verdicts it is refusing to judge.
 */
export function evaluate(directory, requestedHead, options = {}) {
  /* M5-P3. THE BUDGET IS DECIDED FIRST, and a below-dual change never reads
     the corpus. That order is deliberate: a paperwork change in a context
     whose regime documents are absent is not a merge-regime question at all,
     and refusing it with `error` for a missing charter would force the pair
     rule's instrument onto a change the pair rule does not govern. */
  let budget;
  if (options.base !== undefined) {
    const classified = classifyReviewBudget(directory, options.base, requestedHead ?? "HEAD");
    if (!classified.ok) {
      return { status: "error", units: 0, lines: [classified.reason], checksRun: 0 };
    }
    budget = classified.budget;
    if (budget.tier !== "dual") {
      return { status: "not-applicable", units: 0, lines: [], checksRun: 0, budget };
    }
  }
  const found = committedVerdictPaths(directory, requestedHead);
  if (!found.ok) {
    return { status: "error", units: 0, lines: [found.reason], checksRun: 0 };
  }
  /* M4-P11. THE DECLARATION IS READ HERE AS WELL AS IN THE CHECK, THROUGH THE
     SAME EXPORTED READER, and that is one reader with two callers rather than
     two readers. This caller needs the reading for a different purpose: the
     check decides whether `produced-by` must differ, and this decides what the
     GATE RECORD says. An unreadable declaration is ERROR here rather than red,
     because a merge gate that cannot establish whether an exception applies has
     not reached a verdict (M2-C-3), and red would be a verdict. */
  const familyReading = readReviewFamilies(directory);
  if (familyReading.kind === "error") {
    return { status: "error", units: 0, lines: [familyReading.reason], checksRun: 0 };
  }
  const missingRegime = missingRegimeDocument(directory, found.source);
  if (missingRegime !== undefined) {
    return { status: "error", units: 0, checksRun: 0, lines: [missingRegime.reason] };
  }
  const singleFamily =
    familyReading.kind === "declared" && familyReading.families.length === 1
      ? familyReading
      : undefined;

  /* THE SECOND FAIL-CLOSED REFUSAL AT THIS LAYER, AND IT IS THE SAME RULE AS
     THE ONE ABOVE RATHER THAN A NEW ONE. `REGIME_DOCUMENTS` refuses a directory
     whose merge regime cannot be determined; this refuses one whose review
     evidence cannot be READ. Both are could-not-determine, and the status for
     could-not-determine at the layer DR-0012's grant runs through is `error`,
     never green and never not-applicable. The paths are named, because the
     reported defect was that the dropped document appeared nowhere in the
     gate's output.

     THE SET IS NAMED BY ITS SOURCE RATHER THAN BY A HARD-CODED DIRECTORY
     (M4-P11). M4-P10 wrote `join(directory, REVIEW_DIRECTORY)` because there
     was one arm and it read the working tree. There are two arms now, this
     file no longer imports `REVIEW_DIRECTORY`, and a sentence that named a
     directory while the corpus had been read out of a commit would be the
     same unfalsifiable record `describeVerdictCorpusSource` exists to stop. */
  if (found.unexaminable.length > 0) {
    return {
      status: "error",
      units: 0,
      checksRun: 0,
      lines: [
        `${String(found.unexaminable.length)} document(s) ` +
          `${describeVerdictCorpusSource(found.source)} could not be examined, so whether a review ` +
          `refusing this head is among them is unknown and no merge verdict can be reached: ` +
          found.unexaminable.join("; "),
      ],
    };
  }
  /* M5-P3, criterion p3-missing-is-red. A dual-tier change with fewer than
     two ADMITTED verdicts is RED, and the sentence carries the missing count.
     Placed after every could-not-determine refusal above, because those are
     `error` and an error must never be downgraded to a verdict; placed before
     the checks, because with fewer than two reviews there is no pair for them
     to judge and the answer is already known. The anchor is required: on the
     unanchored arm (no repository) no commit is under audit and "admitted for
     this commit" has no meaning, which is `error`, never a count. */
  if (budget !== undefined) {
    if (found.anchor === undefined || found.anchor.kind !== "anchored") {
      return {
        status: "error",
        units: 0,
        checksRun: 0,
        lines: [
          `a review budget was requested with --base and no commit under audit could be established` +
            `${describeAnchor(found.anchor)}, so how many reviews this change carries is unknown`,
        ],
      };
    }
    if (found.admittedCount < REQUIRED_VERDICTS) {
      return {
        status: "red",
        units: found.admittedCount,
        checksRun: 0,
        pairChecksRun: 0,
        source: found.source,
        anchor: found.anchor,
        offHeadLines: found.offHeadLines ?? [],
        admittedLines: found.admittedLines ?? [],
        lines: [`INVALID #/verdicts ${missingReviewsSentence(budget, found.admittedCount, found.anchor.head)}`],
        missing: REQUIRED_VERDICTS - found.admittedCount,
        budget,
        read: found.paths.map((entry) => ({
          path: entry.path,
          verdict: typeof entry.instance["verdict"] === "string" ? entry.instance["verdict"] : "(unreadable)",
          producedBy:
            typeof entry.instance["produced-by"] === "string" ? entry.instance["produced-by"] : "(unreadable)",
          head: typeof entry.instance["head"] === "string" ? entry.instance["head"] : "(unreadable)",
        })),
      };
    }
  }
  const registered = registeredChecks();
  const selected = registered.filter((check) => check.id === CHECK_ID);
  const pairSelected = registered.filter((check) => check.id === PAIR_CHECK_ID);
  const running = [...selected, ...pairSelected];
  /* DEDUPLICATED, and the reason is a property of the rule rather than tidiness.
     Decorrelation is a property of a SET, so every verdict in a group reports
     the same violation about the same pair, and a two-verdict group would print
     each finding twice. What a reader needs is the DISTINCT set of things wrong
     with this directory. The per-verdict provenance is kept in the line so
     nothing is lost: the same violation seen from two verdicts differs in its
     trailing path and stays two lines. */
  const seen = new Set();
  /* THE EXCLUSIONS ARE CARRIED ON THEIR OWN CHANNEL AND NOT MIXED IN HERE
     (CR-VS-001). A corpus holding two approving reviews of another commit is
     not a RED branch: it is a branch with no reviews of this commit and some
     reviews of something else, and those are different facts with different
     statuses. `main` prints them as EXCLUDED lines and puts them in the
     evidence; what must never happen again is the third possibility, that they
     are neither reported nor counted. */
  const lines = [];
  const violations = new Set();
  for (const { path, instance } of found.paths) {
    for (const check of running) {
      const outcome = check.run(instance, directory);
      for (const violation of outcome.violations) {
        const line = `INVALID ${violation.pointer} ${violation.message} (check: ${check.id}) [${path}]`;
        violations.add(`${violation.pointer} ${violation.message}`);
        if (!seen.has(line)) {
          seen.add(line);
          lines.push(line);
        }
      }
      for (const report of outcome.reports) {
        if (!seen.has(report)) {
          seen.add(report);
          lines.push(report);
        }
      }
    }
  }
  lines.sort();

  /* M4-P11, AND THIS BLOCK IS A RE-MEASUREMENT RATHER THAN A PRECAUTION.
     delivery/verification/m4-prototype-probes.md:123 flagged one claim it had
     NOT run: that a VACUOUS third status looked constructible, because the
     never-green-by-omission rewrite in `makeGateResult` fires only for
     `status === "green"`. Re-measured here, and the reading was right on both
     arms and worse than it said:

       ARM 1, the constructor, handed not-applicable with units 0:
         status=not-applicable units=0 vacuous=undefined. No rewrite. A gate CAN
         report an exception having examined nothing.
       ARM 2, both derived checks deregistered against a real declared context:
         checksRun=0 pairChecksRun=0 status=green units=2, and the declaration
         still in force. `main` would have emitted "not-applicable by
         declaration" with two units while ZERO guards ran, so neither falsifier
         had been evaluated.

     Arm 2 is the dangerous one: an exception GRANTED with nothing checked is
     the same fact as a green gate that never looked, one status along, and
     M2-C-2's rewrite cannot see it because the status is not green.

     BOTH REFUSALS ARE ERROR, NEVER RED AND NEVER not-applicable (M2-C-3). This
     path has not reached a verdict about decorrelation; it has failed to run
     one, and those are different facts. */
  if (singleFamily !== undefined && violations.size === 0) {
    if (found.paths.length < 2) {
      return {
        status: "error",
        units: found.paths.length,
        source: found.source,
        lines: [
          `${CHARTER_DOCUMENT} declares a single review family and only ${String(found.paths.length)} verdict ` +
            `document(s) were read ${describeVerdictCorpusSource(found.source)} ; DR-0038 relaxes WHICH FAMILIES ` +
            `produced the two reviews and never HOW MANY reviews there are, so an exception reported over fewer ` +
            `than two reviews would assert that a pair was examined when it was not`,
          ...lines,
        ],
        checksRun: selected.length,
        pairChecksRun: pairSelected.length,
      };
    }
    if (selected.length === 0) {
      return {
        status: "error",
        units: found.paths.length,
        source: found.source,
        lines: [
          `${CHARTER_DOCUMENT} declares a single review family and ${String(selected.length)} registered check(s) ` +
            `named ${CHECK_ID} ran, so neither of DR-0038's two falsifiers was evaluated; the falsifiers live inside ` +
            `that check, and an exception granted by a guard that did not run is the never-green-by-omission shape ` +
            `with a different status word`,
          ...lines,
        ],
        checksRun: selected.length,
        pairChecksRun: pairSelected.length,
      };
    }
  }

  return {
    status: violations.size > 0 ? "red" : "green",
    units: found.paths.length,
    lines,
    /* THE SOURCE TRAVELS WITH THE RESULT (M4-P11 fix round 1). `main`'s
       not-applicable arm has to name the set it found empty, and the only
       honest name for that set is the one the loader actually used. */
    source: found.source,
    /* AND SO DOES THE ANCHOR (CR-VS-001), FOR THE SAME REASON ONE SCOPE IN.
       "No verdict document exists" and "no verdict document is about THIS
       commit, and here are the two that are about another one" are different
       facts, and the not-applicable arm printed the first for both until the
       sweep. */
    anchor: found.anchor,
    offHeadLines: found.offHeadLines ?? [],
    admittedLines: found.admittedLines ?? [],
    /* THE EXCEPTION IS REPORTED ONLY WHEN IT WAS ACTUALLY RELIED ON, and
       "relied on" is derived rather than asserted. Both falsifiers live inside
       the derived check and each produces a violation, so a single-family
       declaration that survives to a zero-violation run is one whose falsifiers
       passed, which can only happen when every committed verdict carries the one
       declared family. Two verdicts with DIFFERENT families under a one-family
       declaration is falsifier 1 and is red, so there is no arm where the
       declaration exists, the run is clean, and the exception was NOT the reason
       produced-by stopped mattering. */
    singleFamily: violations.size === 0 ? singleFamily : undefined,
    distinctViolations: violations.size,
    checksRun: selected.length,
    pairChecksRun: pairSelected.length,
    /* THE VALUES, NOT ONLY THE COUNT (M4-P10 step 6). A gate that printed only
       "2 verdict(s) examined" was the shape that let two REFUSING reviews read
       as a satisfied precondition, and it is also what keeps the one unchecked
       dimension invisible: `produced-by` is compared as a STRING, so two values
       naming ONE vendor pass as decorrelated. Nothing here refuses that, and
       refusing it is M4-P11's declared scope; what this line buys is that a
       reader of the gate's own output can SEE both values and judge, rather
       than having to open two files to find out what was compared. */
    read: found.paths.map((entry) => ({
      path: entry.path,
      verdict: typeof entry.instance["verdict"] === "string" ? entry.instance["verdict"] : "(unreadable)",
      producedBy:
        typeof entry.instance["produced-by"] === "string"
          ? entry.instance["produced-by"]
          : "(unreadable)",
      head: typeof entry.instance["head"] === "string" ? entry.instance["head"] : "(unreadable)",
    })),
    verdicts: found.paths.map((entry) => entry.path),
    budget,
  };
}

function writeEvidence(options, lines) {
  if (options.evidence === undefined) {
    return [];
  }
  const path = join(options.evidence, "dual-review.txt");
  const refusal = refuseOpenForWrite(path);
  if (refusal !== undefined) {
    process.stderr.write(`tiphys ${GATE_ID}: ${refusal}\n`);
    return [];
  }
  try {
    mkdirSync(options.evidence, { recursive: true });
    writeFileSync(path, `${lines.join("\n")}\n`);
  } catch (error) {
    process.stderr.write(
      `tiphys ${GATE_ID}: evidence could not be written: ${String(error)}\n`,
    );
    return [];
  }
  return [path];
}

function emit(options, fields) {
  const result = makeGateResult({
    gate: GATE_ID,
    status: fields.status,
    units: fields.units,
    unitLabel: UNIT_LABEL,
    startedAt: fields.startedAt,
    endedAt: new Date().toISOString(),
    detail: fields.detail,
    ...(fields.precondition === undefined ? {} : { precondition: fields.precondition }),
    evidence: writeEvidence(options, fields.evidenceLines ?? [fields.detail]),
  });
  process.stdout.write(
    `${GATE_ID}: ${result.status} (${String(result.units)} ${result.unitLabel})\n`,
  );
  if (result.detail !== "") {
    process.stdout.write(`${result.detail}\n`);
  }
  if (options.result !== undefined) {
    const refusal = refuseOpenForWrite(options.result);
    if (refusal !== undefined) {
      process.stderr.write(`tiphys ${GATE_ID}: ${refusal}\n`);
      return EXIT_GATE_ERROR;
    }
    writeFileSync(options.result, renderGateResult(result));
  }
  return exitCodeForStatus(result.status);
}

/**
 * Name the commit under audit, or say plainly that none was taken.
 *
 * SC-011 APPLIED TO THE ANCHOR. A gate line that does not say which commit its
 * verdict is about is unfalsifiable by the person reading it, which is exactly
 * what `describeVerdictCorpusSource` exists for one object along. The
 * `unanchored` sentence is the important one: it is the only arm where the old
 * behaviour survives, and it must never be mistaken for an anchored green.
 */
/**
 * Name the route by which the corpus was admitted, in the gate's own detail.
 *
 * WHY THE GREEN SENTENCE CARRIES THIS AND NOT ONLY THE STDOUT LINES. The record
 * written to `--result` is what a reviewer reads after the fact, and a green
 * reached through the ANCESTRY allowance is the one that has to be auditable:
 * it is the relaxation. A detail that said only "2 verdict(s) for the commit
 * under audit X" over verdicts that all name X-1 would be true and would hide
 * the only thing worth checking, which is the SC-011 shape this file applies to
 * the corpus source and to the exclusions already.
 */
function describeAdmissions(lines) {
  const ancestors = lines.filter((line) => line.includes("an ancestor of the commit under audit"));
  if (ancestors.length === 0) {
    return "";
  }
  return (
    `; ${String(ancestors.length)} of ${String(lines.length)} verdict(s) were admitted by ANCESTRY rather than by ` +
    `naming this commit, their gap to it being paperwork only: ${ancestors.join("; ")}`
  );
}

function describeAnchor(anchor) {
  if (anchor === undefined) {
    return "";
  }
  if (anchor.kind === "anchored") {
    return ` for the commit under audit ${anchor.head} (from ${anchor.how})`;
  }
  if (anchor.kind === "unanchored") {
    return (
      " with NO COMMIT UNDER AUDIT, because this context has no resolvable git ref and no --head was given" +
      `, so whether these documents review this work was NOT established: ${anchor.reason}`
    );
  }
  return ` with NO COMMIT UNDER AUDIT: ${anchor.reason}`;
}

function main(argv) {
  const startedAt = new Date().toISOString();
  const parsed = parseArgs(argv);
  if (parsed.options === undefined) {
    process.stderr.write(`tiphys ${GATE_ID}: ${parsed.usageError}\n${usage()}\n`);
    return EXIT_GATE_ERROR;
  }
  const options = parsed.options;

  /* THE PRECONDITION ARM. No gate record and no evidence: it answers one
     question with an exit code, which is what `kind: command-exit-zero`
     consumes. */
  if (options.precondition && options.reviewBudget) {
    /* M5-P3. THE PRECONDITION A BUDGET-AWARE RUNNER EVALUATES. Met when the
       context resolves a commit, because then the gate itself, handed `--base`
       and `--head`, decides from the DIFF what review is owed and reports its
       own evaluated precondition when the answer is "none". Unmet only when
       there is no commit here to audit at all. The verdict-count question this
       arm replaces is the one T-040 measured answering NO on every head of
       three milestones: its unmet arm is exactly how a shipped change with no
       review became not-applicable, so it cannot be the question that decides
       whether the gate runs. */
    const source = resolveCorpusSource(options.directory);
    if (source.kind !== "commit") {
      process.stdout.write(
        `${GATE_ID}: no commit resolves in ${options.directory}, so there is no change whose review budget can be decided: ${source.reason}\n`,
      );
      return 1;
    }
    process.stdout.write(
      `${GATE_ID}: ${options.directory} resolves ${source.ref} to ${source.refSha}; the review budget is decided by the gate from its --base and --head\n`,
    );
    return 0;
  }

  if (options.precondition) {
    const found = committedVerdictPaths(options.directory, options.head);
    if (!found.ok) {
      process.stderr.write(`tiphys ${GATE_ID}: ${found.reason}\n`);
      /* AN UNESTABLISHED ANCHOR MAKES THE GATE APPLICABLE, WHICH IS THE
         OPPOSITE DIRECTION FROM EVERY OTHER FAILURE AT THIS ARM (CR-VS-001).
         Exit 1 here means "do not run me", and answering that about a run
         whose SUBJECT could not be established is a not-applicable reached by
         not looking, the exact shape the paragraph below is about. Exit 0 so
         the gate runs and `evaluate` refuses it with `error`. */
      return found.anchor !== undefined && found.anchor.kind === "error" ? 0 : 1;
    }
    /* AN UNEXAMINABLE CANDIDATE MAKES THE GATE APPLICABLE, WHICH IS THE
       OPPOSITE OF WHAT DROPPING IT DID. Exit 1 here means "no pair of reviews
       exists, do not run me", and answering that about a directory whose
       documents could not be read is a not-applicable reached by not looking.
       The gate runs and `evaluate` then refuses it with `error`. */
    const unexaminable = found.unexaminable.length;
    process.stdout.write(
      `${GATE_ID}: ${String(found.paths.length)} verdict document(s) ${describeVerdictCorpusSource(found.source)}` +
        describeAnchor(found.anchor) +
        (found.offHead.length > 0
          ? `, and ${String(found.offHead.length)} verdict document(s) about another commit or declaring no head, which are not evidence about this one`
          : "") +
        (unexaminable > 0 ? `, and ${String(unexaminable)} candidate(s) that could not be examined` : "") +
        "\n",
    );
    /* THE COUNT IS THE ANCHORED ONE (CR-VS-001), and that is what makes the two
       arms agree. The workflow step runs this arm and then the gate, so a
       precondition counting verdicts about ANOTHER commit would report the gate
       applicable and the gate would then report not-applicable, whose exit code
       fails a `set -e` step. Both arms now ask the same question. */
    return found.paths.length + unexaminable > 0 ? 0 : 1;
  }

  const run = evaluate(options.directory, options.head, { base: options.base });
  if (run.status === "error") {
    return emit(options, {
      status: "error",
      units: 0,
      startedAt,
      detail: run.lines.join("; "),
    });
  }

  /* M5-P3, criterion p3-paperwork-budget. A change below the dual-review tier
     is not forced through the two-verdict rule, and it says which tier and
     which paths put it there, as an EVALUATED precondition (SC-011) rather than
     as a silence. */
  if (run.status === "not-applicable" && run.budget !== undefined) {
    const precondition = budgetPrecondition(run.budget);
    return emit(options, {
      status: "not-applicable",
      units: 0,
      startedAt,
      detail: precondition.reason,
      precondition,
      evidenceLines: [`directory: ${options.directory}`, precondition.reason, ...precondition.evidence],
    });
  }

  /* M5-P3, criterion p3-missing-is-red. Fewer than two admitted reviews of a
     dual-tier change is RED with the missing count, and every verdict that WAS
     read and excluded is named with the route that excluded it, because "no
     review exists" and "two reviews exist and both reviewed older shipped
     bytes" are different facts with the same status. */
  if (run.missing !== undefined) {
    process.stdout.write(
      `${GATE_ID}: ${String(run.units)} verdict document(s) admitted${describeAnchor(run.anchor)}\n`,
    );
    for (const line of run.admittedLines ?? []) {
      process.stdout.write(`${GATE_ID}: ADMITTED ${line}\n`);
    }
    for (const line of run.offHeadLines ?? []) {
      process.stdout.write(`${GATE_ID}: EXCLUDED ${line}\n`);
    }
    for (const line of run.lines) {
      process.stdout.write(`${line}\n`);
    }
    return emit(options, {
      status: "red",
      units: run.units,
      startedAt,
      detail:
        run.lines.join("; ") +
        ((run.offHeadLines ?? []).length > 0
          ? `; ${String(run.offHeadLines.length)} committed verdict document(s) are NOT evidence about this commit: ${run.offHeadLines.join("; ")}`
          : ""),
      evidenceLines: [
        `directory: ${options.directory}`,
        `anchor:${describeAnchor(run.anchor)}`,
        ...(run.admittedLines ?? []).map((line) => `ADMITTED ${line}`),
        ...(run.offHeadLines ?? []).map((line) => `EXCLUDED ${line}`),
        ...run.lines,
      ],
    });
  }

  if (run.units === 0) {
    /* NOT-APPLICABLE WITH A REASON, never green. A merged head has no pair of
       verdicts to compare, and a gate that cannot reach its subject reporting
       green is the vacuous pass M2-C-3 and SC-011 both exist against. */
    return emit(options, {
      status: "not-applicable",
      units: 0,
      startedAt,
      /* THE DESCRIBER IS THE PHRASE-FORM ONE (CR-VS-006). This sentence was
         built with `describeVerdictCorpusSource`, which returns a trailing
         PARENTHETICAL, so the shipped line read "no verdict document is
         (corpus: ... read from commit ...)", which is not a sentence. Its
         sibling `describeContextDocumentSource` returns the phrase form the
         sentence was written for. */
      detail:
        `no verdict document was found ${describeVerdictCorpusSource(run.source)}` +
        describeAnchor(run.anchor) +
        ", so there is no pair of reviews to compare" +
        (run.offHeadLines.length > 0
          ? `; ${String(run.offHeadLines.length)} committed verdict document(s) review other work and are NOT evidence about this commit: ${run.offHeadLines.join("; ")}`
          : ""),
      evidenceLines: [
        `directory: ${options.directory}`,
        `anchor:${describeAnchor(run.anchor)}`,
        ...run.offHeadLines,
      ],
    });
  }

  /* HOW MANY GUARDS RAN IS PRINTED. With the check deregistered this reads
     `0 registered check(s)` beside a green, which is exactly what a reader
     needs in order not to mistake the deregistration witness for an assertion.
     `test/dual-review.test.ts` asserts the check IS registered in the shipped
     registry, so the two facts are separated rather than conflated. */
  /* THE ANCHOR IS PRINTED BEFORE THE COUNTS, because the counts mean nothing
     until a reader knows which commit they are counts ABOUT (CR-VS-001). */
  process.stdout.write(
    `${GATE_ID}: ${String(run.units)} verdict document(s)${describeAnchor(run.anchor)}\n`,
  );
  for (const line of run.admittedLines ?? []) {
    process.stdout.write(`${GATE_ID}: ADMITTED ${line}\n`);
  }
  for (const line of run.offHeadLines ?? []) {
    process.stdout.write(`${GATE_ID}: EXCLUDED ${line}\n`);
  }
  process.stdout.write(
    `${GATE_ID}: ${String(run.checksRun)} registered check(s) named ${CHECK_ID} ran over ${String(run.units)} verdict(s)\n`,
  );
  process.stdout.write(
    `${GATE_ID}: ${String(run.pairChecksRun)} registered check(s) named ${PAIR_CHECK_ID} ran over ${String(run.units)} verdict(s)\n`,
  );
  for (const entry of run.read ?? []) {
    process.stdout.write(
      `${GATE_ID}: verdict ${entry.verdict} at head ${entry.head} produced-by ${entry.producedBy} [${entry.path}]\n`,
    );
  }
  for (const line of run.lines) {
    process.stdout.write(`${line}\n`);
  }

  /* M4-P11, DR-0038's ARM. The owner's decision, implemented rather than
     redesigned: the check reports a status that is NEITHER GREEN NOR RED and
     states plainly that the reviews were two and the families were one.

     THE STATUS WORD IS `not-applicable`, AND IT IS NOT A FIFTH ONE. The
     vocabulary at src/gates/result.ts:47 is four words with a closed exit-code
     table, and the M4 probe measured what adding a fifth costs: one type error,
     eleven lines, and a bundle that printed "every applicable gate is green"
     and exited 0 with the new status present, because the aggregation is `if`
     chains and not an exhaustive switch
     (delivery/verification/m4-prototype-probes.md:109). A word the aggregate
     silently counts as green is the exact thing DR-0038 forbids. `not-applicable`
     is already neither green nor red, already has an exit code, and is already
     excluded from the green bucket by every arm of `decideAggregate`. What was
     MISSING is visibility, and that is the runner change this phase makes:
     `src/gates/run.ts` now names every gate whose not-applicable carries a
     declaration, in the aggregate reason line and in summary.json.

     `met: false` READS ODDLY AND IS RIGHT. The precondition of RUNNING the
     cross-family comparison is that the environment has more than one family.
     The declaration is what establishes that it does not. So the precondition
     was EVALUATED and found UNMET, which is exactly what SC-011 says
     not-applicable asserts, and the id names the declaration so a reader is
     never left to guess which precondition that was. */
  if (run.singleFamily !== undefined) {
    const provenance = reviewFamiliesProvenanceLine(run.singleFamily.provenance);
    const family = run.singleFamily.declaredAs.join(", ");
    return emit(options, {
      status: "not-applicable",
      units: run.units,
      startedAt,
      detail:
        `not-applicable by declaration (${DECLARED_EVIDENCE}): ${String(run.units)} verdict(s) were read and ` +
        `compared on framing and review-contract, and ${CHARTER_DOCUMENT} declares that exactly one model family ` +
        `(${family}) is available here, so DR-0012 condition 1's CROSS-FAMILY requirement was not evaluated: ` +
        `the reviews were two and the families were one; reason: ${run.singleFamily.reason}; ${provenance}`,
      precondition: {
        id: SINGLE_FAMILY_PRECONDITION,
        met: false,
        reason:
          `${CHARTER_DOCUMENT} declares ${REVIEW_FAMILIES_FIELD}.available with exactly one entry (${family}), so ` +
          `two reviews on different model families are not obtainable in this environment and the cross-family ` +
          `requirement of DR-0012 condition 1 was not evaluated`,
        evidence: [
          DECLARED_EVIDENCE,
          `declaration: ${CHARTER_DOCUMENT} at ${run.singleFamily.provenance.refSha}`,
          `blob sha256: ${run.singleFamily.provenance.sha256}`,
          `declared families: ${family}`,
          `verdicts read: ${String(run.units)}`,
          ...(run.read ?? []).map(
            (entry) => `  ${entry.path}: produced-by ${entry.producedBy}`,
          ),
        ],
      },
      evidenceLines: [
        `directory: ${options.directory}`,
        DECLARED_EVIDENCE,
        `declaration: ${CHARTER_DOCUMENT} at ${run.singleFamily.provenance.refSha}`,
        `blob sha256: ${run.singleFamily.provenance.sha256}`,
        `declared families: ${family}`,
        `reason: ${run.singleFamily.reason}`,
        `verdicts examined: ${String(run.units)}`,
        ...(run.read ?? []).map(
          (entry) => `  ${entry.path}: verdict ${entry.verdict}, head ${entry.head}, produced-by ${entry.producedBy}`,
        ),
        ...run.lines,
      ],
    });
  }

  return emit(options, {
    status: run.status,
    units: run.units,
    startedAt,
    detail:
      run.status === "green"
        ? `${String(run.units)} verdict(s)${describeAnchor(run.anchor)} examined by ${String(run.checksRun)} registered check(s) named ${CHECK_ID} and ${String(run.pairChecksRun)} named ${PAIR_CHECK_ID}; no decorrelation violation and the pair approves${describeAdmissions(run.admittedLines ?? [])}`
        : run.lines.filter((line) => line.startsWith("INVALID")).join("; "),
    evidenceLines: [
      `directory: ${options.directory}`,
      `anchor:${describeAnchor(run.anchor)}`,
      ...(run.admittedLines ?? []).map((line) => `ADMITTED ${line}`),
      ...(run.offHeadLines ?? []),
      `registered checks named ${CHECK_ID}: ${String(run.checksRun)}`,
      `registered checks named ${PAIR_CHECK_ID}: ${String(run.pairChecksRun)}`,
      `verdicts examined: ${String(run.units)}`,
      ...(run.read ?? []).map(
        (entry) => `  ${entry.path}: verdict ${entry.verdict}, head ${entry.head}, produced-by ${entry.producedBy}`,
      ),
      ...run.lines,
    ],
  });
}

// IDENTITY, NOT STRING EQUALITY (M4-P2 fix round, 2026-09-16). Measured on
// node v26.6.0: invoked through a symlinked directory in the path, or
// through a symlink to this file, process.argv[1] carries the caller's
// spelling while import.meta.url carries the canonical one, so the bare
// comparison is false and this gate silently does nothing and exits 0. A
// guard that cannot go red is the T-008 shape. This is the same form
// src/gates/deploy.ts:27 already uses, not a second dialect.
function invokedDirectly() {
  const entry = process.argv[1];
  if (entry === undefined) {
    return false;
  }
  try {
    return realpathSync(entry) === realpathSync(fileURLToPath(import.meta.url));
  } catch {
    return false;
  }
}

if (invokedDirectly()) {
  try {
    process.exitCode = main(process.argv.slice(2));
  } catch (error) {
    process.stderr.write(
      `tiphys ${GATE_ID}: ${String(error?.message ?? error).replace(/\s+/g, " ")}\n`,
    );
    process.exitCode = EXIT_GATE_ERROR;
  }
}

export {
  EXIT_NOT_APPLICABLE,
  CHECK_ID,
  PAIR_CHECK_ID,
  SINGLE_FAMILY_PRECONDITION,
  DECLARED_EVIDENCE,
};
