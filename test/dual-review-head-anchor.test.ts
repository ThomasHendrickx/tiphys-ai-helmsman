/**
 * THE COMMIT UNDER AUDIT, AND THE CORPUS DEPTH THAT DECIDES WHICH DOCUMENTS
 * REACH IT (DR-0047 final approval sweep: CR-VS-001, CR-VS-002, CR-VS-003,
 * CR-VS-006, CR-FS-GATES-01).
 *
 * THE MECHANISM THESE WITNESSES GUARD, stated one level up from any finding:
 * a gate whose verdict is about EVIDENCE THE CALLER SUPPLIED, with no check
 * that the evidence is about the thing being audited. `check-dual-review`
 * grouped review verdicts by the head THE VERDICTS THEMSELVES DECLARE, and
 * nothing compared that to the commit the gate was running against.
 *
 * EVERY CONTEXT HERE IS A REAL GIT REPOSITORY, staged in two commits, because
 * the two-commit shape is the real one: a review names the commit it read, and
 * committing the review produces a different commit. The reviewed commit is
 * therefore a REAL object, which is what lets these tests tell the two refusal
 * routes apart instead of collapsing them into "the sha is wrong".
 *
 * `src` and `scripts` are imported through the computed-URL dynamic import
 * pattern (CLAUDE.md standing warning 4).
 */

import { spawnSync } from "node:child_process";
import {
  copyFileSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import assert from "node:assert/strict";
import test from "node:test";

const repoRoot = dirname(dirname(fileURLToPath(import.meta.url)));
const scriptPath = join(repoRoot, "scripts", "check-dual-review.mjs");
const classGate = join(repoRoot, "src", "gates", "gate-classes.ts");
const fixturesDir = join(repoRoot, "witness", "fixtures", "dual-review");

const yamlModule = (await import("yaml")) as unknown as {
  parse: (text: string) => unknown;
};

/** A git identity supplied PER COMMAND (CLAUDE.md standing warning 5). */
const GIT_IDENTITY = {
  GIT_AUTHOR_NAME: "tiphys test",
  GIT_AUTHOR_EMAIL: "test@example.invalid",
  GIT_COMMITTER_NAME: "tiphys test",
  GIT_COMMITTER_EMAIL: "test@example.invalid",
};

function git(dir: string, args: string[]): string {
  const run = spawnSync("git", args, {
    cwd: dir,
    encoding: "utf8",
    env: { ...process.env, ...GIT_IDENTITY },
  });
  assert.equal(run.status, 0, `git ${args.join(" ")} failed: ${run.stderr}`);
  return (run.stdout ?? "").trim();
}

/**
 * Ask git the ancestry question the gate asks, as a THIRD-PARTY control.
 *
 * The tests below assert on the sentence the shipped gate prints, and a test
 * that also assumed the ancestry would pass for the wrong reason if the staging
 * ever stopped producing the history it means to. `merge-base --is-ancestor`
 * answers with an exit code, so 1 is an answer and anything else is a failure;
 * folding them together here would be the same collapse the implementation
 * refuses.
 */
function isAncestor(dir: string, candidate: string, descendant: string): boolean {
  const run = spawnSync("git", ["merge-base", "--is-ancestor", candidate, descendant], {
    cwd: dir,
    encoding: "utf8",
    env: { ...process.env, ...GIT_IDENTITY },
  });
  assert.ok(
    run.status === 0 || run.status === 1,
    `git merge-base --is-ancestor exited ${String(run.status)}: ${run.stderr}`,
  );
  return run.status === 0;
}

const scratchDirs: string[] = [];
function scratch(): string {
  const dir = mkdtempSync(join(tmpdir(), "tiphys-head-anchor-"));
  scratchDirs.push(dir);
  return dir;
}

test.after(() => {
  for (const dir of scratchDirs) {
    rmSync(dir, { recursive: true, force: true });
  }
});

/** A verdict to place: which fixture, where, and what it says it reviewed. */
interface Placed {
  file: string;
  /** Repository-relative directory. Default `delivery/review`. */
  directory?: string;
  as?: string;
  /** Literal `head:` value. `undefined` means the reviewed commit. */
  head?: string;
  verdict?: string;
  findings?: string;
}

interface Staged {
  /** The context directory, which is also the repository root here. */
  dir: string;
  /** The commit the placed verdicts say they reviewed. */
  reviewed: string;
  /** The repository's HEAD, which is a LATER commit than `reviewed`. */
  head: string;
}

/**
 * Stage a repository whose verdicts review its FIRST commit while its HEAD is
 * a SECOND one.
 *
 * The charter and the mode document are the repository's own shipped
 * artifacts, not stand-ins, because the check reads the declared mode's
 * `merge-authority` and a two-line substitute would stop testing that.
 */
function stage(placed: Placed[]): Staged {
  const dir = scratch();
  mkdirSync(join(dir, "delivery", "review"), { recursive: true });
  copyFileSync(join(repoRoot, "assurance-modes.yaml"), join(dir, "assurance-modes.yaml"));
  const charter = readFileSync(join(repoRoot, "templates", "charter.example.yaml"), "utf8");
  assert.match(charter, /^delivery-mode: full$/m, "the shipped template no longer declares mode full");
  writeFileSync(join(dir, "charter.yaml"), charter);
  git(dir, ["init", "-q", "."]);
  git(dir, ["add", "-A"]);
  git(dir, ["commit", "-q", "-m", "the commit the reviews read"]);
  const reviewed = git(dir, ["rev-parse", "HEAD"]);
  assert.match(reviewed, /^[0-9a-f]{40}$/);

  for (const entry of placed) {
    const directory = join(dir, entry.directory ?? join("delivery", "review"));
    mkdirSync(directory, { recursive: true });
    let body = readFileSync(join(fixturesDir, entry.file), "utf8");
    const target = entry.head ?? reviewed;
    const anchored = body.replace(/^head: .*$/m, `head: ${target}`);
    assert.notEqual(anchored, body, `${entry.file} has no single-line head to rewrite`);
    body = anchored;
    if (entry.verdict !== undefined) {
      const rewritten = body.replace(/^verdict: .*$/m, `verdict: ${entry.verdict}`);
      assert.notEqual(rewritten, body, `${entry.file} has no single-line verdict to rewrite`);
      body = rewritten;
    }
    if (entry.findings !== undefined) {
      const rewritten = body.replace(/^findings: \[\]$/m, entry.findings);
      assert.notEqual(rewritten, body, `${entry.file} has no empty findings list to rewrite`);
      body = rewritten;
    }
    writeFileSync(join(directory, entry.as ?? entry.file), body);
  }
  git(dir, ["add", "-A"]);
  /* `--allow-empty` SO THE ZERO-VERDICT ARM STAGES THE SAME SHAPE AS EVERY
     OTHER: two commits, HEAD later than the reviewed one. Without it a context
     with no verdicts would have one commit and the not-applicable sentence
     would be tested against a different staging than the rest of this file. */
  git(dir, ["commit", "-q", "--allow-empty", "-m", "the reviews, and therefore a different commit"]);
  const head = git(dir, ["rev-parse", "HEAD"]);
  assert.notEqual(head, reviewed, "the two commits must differ or this file tests nothing");
  return { dir, reviewed, head };
}

interface Run {
  exit: number;
  output: string;
  record: { status: string; units: number; detail: string };
}

/** Run the SHIPPED gate arm and read the record it wrote. */
function runGate(staged: Staged, head?: string): Run {
  const recordPath = join(staged.dir, "result.json");
  const run = spawnSync(
    process.execPath,
    [
      scriptPath,
      staged.dir,
      ...(head === undefined ? [] : ["--head", head]),
      "--result",
      recordPath,
      "--evidence",
      join(staged.dir, "evidence"),
    ],
    { cwd: repoRoot, encoding: "utf8" },
  );
  return {
    exit: run.status ?? -1,
    output: `${run.stdout ?? ""}${run.stderr ?? ""}`,
    record: JSON.parse(readFileSync(recordPath, "utf8")) as Run["record"],
  };
}

/** Run the SHIPPED precondition arm, which is what the workflow step asks. */
function runPrecondition(staged: Staged, head?: string): { exit: number; output: string } {
  const run = spawnSync(
    process.execPath,
    [scriptPath, "--precondition", staged.dir, ...(head === undefined ? [] : ["--head", head])],
    { cwd: repoRoot, encoding: "utf8" },
  );
  return { exit: run.status ?? -1, output: `${run.stdout ?? ""}${run.stderr ?? ""}` };
}

const PAIR: Placed[] = [
  { file: "decorrelated-criteria.yaml" },
  { file: "decorrelated-hazard.yaml" },
];

/* ------------------------------------------------------------------ */
/* CR-VS-001, the control: the anchored green arm                      */
/* ------------------------------------------------------------------ */

test("a decorrelated approving pair that names the commit under audit is green, and the green line names that commit", () => {
  /* THE CONTROL EVERY WITNESS BELOW NEEDS. Without it, "not-applicable" would
     be indistinguishable from a gate that can no longer go green at all, which
     is the T-008 shape one status along. */
  const staged = stage(PAIR);
  const run = runGate(staged, staged.reviewed);
  assert.equal(run.exit, 0, run.output);
  assert.equal(run.record.status, "green");
  assert.equal(run.record.units, 2);
  assert.match(
    run.record.detail,
    new RegExp(`for the commit under audit ${staged.reviewed}`),
    run.record.detail,
  );
  /* AND THE PRECONDITION AGREES WITH THE GATE. The workflow step runs the
     precondition and then the gate under `set -e`, so an arm where the
     precondition says "run me" and the gate says "not-applicable" is a failed
     CI job, not a clean skip. */
  assert.equal(runPrecondition(staged, staged.reviewed).exit, 0);
});

/* ------------------------------------------------------------------ */
/* CR-VS-001, member one of the class: REFUSAL BY RESOLUTION           */
/* ------------------------------------------------------------------ */

test("an approving pair naming a head that is not a commit at all is never green, and the excluded documents are named", () => {
  /* MEMBER ONE. The declared head is forty hex digits and names no object.
     Before the anchor this ran GREEN with 2 units at exit 0: the group was
     formed on the documents' own claim, so a claim about nothing formed a
     group of two about nothing. */
  const dead = "deadbeefdeadbeefdeadbeefdeadbeefdeadbeef";
  const staged = stage(PAIR.map((entry) => ({ ...entry, head: dead })));
  /* THE SHA IS NOT AN OBJECT HERE, ESTABLISHED RATHER THAN ASSUMED. A witness
     that assumed it would still pass if the fixture sha happened to exist. */
  const typed = spawnSync("git", ["cat-file", "-t", dead], {
    cwd: staged.dir,
    encoding: "utf8",
  });
  assert.notEqual(typed.status, 0, `${dead} unexpectedly resolves in the staged repository`);

  const run = runGate(staged, staged.head);
  assert.notEqual(run.exit, 0, run.output);
  assert.notEqual(run.record.status, "green");
  assert.equal(run.record.status, "not-applicable");
  assert.equal(run.record.units, 0);
  assert.match(
    run.record.detail,
    /does not resolve to a commit in this repository at all/,
    run.record.detail,
  );
  /* BOTH documents are named, not just counted. A dropped document that
     appears nowhere in the output is the failure this whole section is about. */
  for (const entry of PAIR) {
    assert.match(run.record.detail, new RegExp(entry.file.replace(/\./g, "\\.")));
  }
  /* AND THE PRECONDITION AGREES: there is nothing here to compare. */
  const pre = runPrecondition(staged, staged.head);
  assert.equal(pre.exit, 1, pre.output);
});

/* ------------------------------------------------------------------ */
/* CR-VS-001, member two of the class: REFUSAL BY COMPARISON           */
/* ------------------------------------------------------------------ */

test("an approving pair naming a real commit that is not the one under audit is never green, and is named as a review of other work", () => {
  /* MEMBER TWO, AND IT IS STRUCTURALLY DIFFERENT FROM MEMBER ONE RATHER THAN
     THE SAME SHAPE TWICE. Here the declared head RESOLVES: it is a real commit
     of this repository, with real content, and the reviews really did review
     it. What it is not is the commit being audited, NOR AN ANCESTOR OF IT.
     Member one fails at resolution and this one fails at comparison, and the
     two print different sentences.

     THE STAGING IS A SIBLING LINE, AND IT CHANGED IN ROUND 2 BECAUSE THE OLD
     ONE STOPPED BEING THIS MEMBER. Until round 2 this test staged a LATER
     commit on the same line, which made the declared head an ANCESTOR of the
     audited one; that shape is now its own member below (a shipped path differs
     across the gap) and it refuses by a different route. A commit on a branch
     cut from the reviewed commit is on neither side of the audited head, which
     is the comparison route stated without any ancestry in it. */
  const staged = stage(PAIR);
  git(staged.dir, ["checkout", "-q", "-b", "sibling", staged.reviewed]);
  writeFileSync(join(staged.dir, "sibling.txt"), "another line of work\n");
  git(staged.dir, ["add", "-A"]);
  git(staged.dir, ["commit", "-q", "-m", "a commit on another line"]);
  const sibling = git(staged.dir, ["rev-parse", "HEAD"]);
  git(staged.dir, ["checkout", "-q", "-"]);
  /* ESTABLISHED RATHER THAN ASSUMED, in both directions, because the whole
     claim of this member is that neither ancestry holds. */
  assert.equal(isAncestor(staged.dir, sibling, staged.head), false);
  assert.equal(isAncestor(staged.dir, staged.head, sibling), false);

  const anchored = stage(PAIR.map((entry) => ({ ...entry, head: sibling })));
  /* The verdicts above were staged against a DIFFERENT scratch repository, so
     the sibling sha they name is not an object there; restage them here. */
  for (const entry of PAIR) {
    const file = join(staged.dir, "delivery", "review", entry.file);
    writeFileSync(
      file,
      readFileSync(join(anchored.dir, "delivery", "review", entry.file), "utf8"),
    );
  }
  git(staged.dir, ["add", "-A"]);
  git(staged.dir, ["commit", "-q", "-m", "verdicts naming the sibling commit"]);
  const later = git(staged.dir, ["rev-parse", "HEAD"]);

  const run = runGate({ ...staged, head: later }, later);
  assert.notEqual(run.exit, 0, run.output);
  assert.notEqual(run.record.status, "green");
  assert.equal(run.record.status, "not-applicable");
  assert.match(
    run.record.detail,
    /is a commit in this repository and is neither the commit under audit .* nor an ancestor of it/,
    run.record.detail,
  );
  assert.match(run.record.detail, new RegExp(`under audit ${later}`), run.record.detail);
  /* THE MEMBERS PRINT DIFFERENT SENTENCES, which is what makes them members
     and not one shape repeated. */
  assert.doesNotMatch(run.record.detail, /does not resolve to a commit in this repository at all/);
  assert.doesNotMatch(run.record.detail, /path\(s\) outside delivery\/ differ between them/);
});

/* ------------------------------------------------------------------ */
/* ROUND 2, member three: AN ANCESTOR WITH A SHIPPED GAP               */
/* ------------------------------------------------------------------ */

test("an approving pair naming an ancestor is refused when shipped content differs across the gap, and the differing paths are named", () => {
  /* THE MEMBER THAT MAKES THE ANCESTRY ALLOWANCE SAFE, and without it the
     allowance is a hole rather than a fix. Round 1 anchored the corpus with
     `===`, which no real flow satisfies, because committing a verdict makes the
     audited commit a CHILD of the declared one. Round 2 admits an ancestor, and
     an ancestor admitted unconditionally is round 1's original defect wearing a
     different hat: an approving pair lands and every later descendant carries
     it, including descendants full of source nobody reviewed.

     This is that state exactly: the reviews are real, they name a real
     ancestor, and the audited commit carries a change to a path outside the
     paperwork root. */
  const staged = stage(PAIR);
  writeFileSync(join(staged.dir, "src.ts"), "export const nobodyRead = 2;\n");
  git(staged.dir, ["add", "-A"]);
  git(staged.dir, ["commit", "-q", "-m", "shipped work nobody reviewed"]);
  const later = git(staged.dir, ["rev-parse", "HEAD"]);
  /* THE ANCESTRY HOLDS, ESTABLISHED RATHER THAN ASSUMED. Without this the test
     would pass for the wrong reason if the staging ever stopped producing a
     linear history, which is the member-two failure one shape over. */
  assert.equal(isAncestor(staged.dir, staged.reviewed, later), true);

  const run = runGate({ ...staged, head: later }, later);
  assert.notEqual(run.exit, 0, run.output);
  assert.notEqual(run.record.status, "green");
  assert.equal(run.record.status, "not-applicable");
  assert.match(
    run.record.detail,
    /is an ancestor of the commit under audit .*, but 1 path\(s\) outside delivery\/ differ between them \(src\.ts\)/,
    run.record.detail,
  );
  /* AND IT IS NOT REFUSED BY EITHER OF THE OTHER ROUTES, which is what makes
     this a third member rather than a restatement of one of them. */
  assert.doesNotMatch(run.record.detail, /does not resolve to a commit in this repository at all/);
  assert.doesNotMatch(run.record.detail, /nor an ancestor of it/);
  assert.equal(runPrecondition({ ...staged, head: later }, later).exit, 1);
});

/* ------------------------------------------------------------------ */
/* ROUND 2, member four: THE GREEN CONTROL THE FIX EXISTS FOR          */
/* ------------------------------------------------------------------ */

test("an approving pair naming an ancestor whose whole gap is paperwork is green, and the green line says it was admitted by ancestry", () => {
  /* THE CONTROL WITHOUT WHICH THE THREE REFUSALS ARE INDISTINGUISHABLE FROM A
     GATE THAT CAN NO LONGER GO GREEN AT ALL, which is the defect round 2 is
     here to fix. Measured on round 1's base at d653022, this exact staging
     reported `not-applicable`, exit 20, 0 units.

     `stage` ALREADY PRODUCES THIS SHAPE, and that is the point rather than a
     convenience: the second commit is the verdicts themselves, under
     `delivery/review/`, which is the real flow. A further paperwork-only commit
     is added so the gap is more than the verdict documents and the allowance is
     not being tested only against the one commit that must obviously pass. */
  const staged = stage(PAIR);
  writeFileSync(join(staged.dir, "delivery", "work-history.md"), "more paperwork\n");
  git(staged.dir, ["add", "-A"]);
  git(staged.dir, ["commit", "-q", "-m", "more paperwork"]);
  const later = git(staged.dir, ["rev-parse", "HEAD"]);
  assert.equal(isAncestor(staged.dir, staged.reviewed, later), true);
  /* THE GAP IS PAPERWORK ONLY, ESTABLISHED FROM GIT rather than assumed from
     the staging, so a staging change that started writing outside `delivery/`
     would fail here rather than quietly weaken the control. */
  const gap = git(staged.dir, ["diff", "--name-only", `${staged.reviewed}..${later}`])
    .split("\n")
    .filter((line) => line !== "");
  assert.ok(gap.length >= 3, gap.join(" , "));
  assert.deepEqual(gap.filter((path) => !path.startsWith("delivery/")), []);

  const run = runGate({ ...staged, head: later }, later);
  assert.equal(run.exit, 0, run.output);
  assert.equal(run.record.status, "green");
  assert.equal(run.record.units, 2);
  /* THE RELAXATION IS DISCLOSED, never silent. A green that did not say it was
     reached by ancestry would be the unfalsifiable record this file refuses
     everywhere else: a reader could not tell it from an equal-head green. */
  assert.match(
    run.record.detail,
    /2 of 2 verdict\(s\) were admitted by ANCESTRY rather than by naming this commit, their gap to it being paperwork only/,
    run.record.detail,
  );
  assert.match(run.record.detail, new RegExp(`under audit ${later}`), run.record.detail);
  /* AND THE PRECONDITION AGREES, because the workflow runs it under `set -e`. */
  assert.equal(runPrecondition({ ...staged, head: later }, later).exit, 0);
});

test("a paperwork-only gap is still paperwork when a filename is not printable ASCII, which the default diff spelling would have called shipped content", () => {
  /* THE ONE FILENAME THAT BROKE THE ALLOWANCE, and it is the cannot-go-green
     shape one filename wide rather than a new class. `git diff --name-only`
     QUOTES a path outside printable ASCII, so `delivery/na<U+00EF>ve.md` arrives
     as a double-quoted, octal-escaped spelling that does not start with
     `delivery/`, and the gap reads as shipped content. Measured on git 2.43.0
     before the fix; `-z` prints the real path and is what the implementation
     now passes.

     THE NAME IS BUILT FROM AN ESCAPE, never written as a literal byte, because
     this file is authored source and the repository's authored bytes are pure
     ASCII. The escape is the data; the file stays ASCII. */
  const awkward = `delivery/na\u00efve.md`;
  assert.match(awkward, /^delivery\/na.ve\.md$/);
  const staged = stage(PAIR);
  writeFileSync(join(staged.dir, awkward), "paperwork with an awkward name\n");
  git(staged.dir, ["add", "-A"]);
  git(staged.dir, ["commit", "-q", "-m", "paperwork whose name is not printable ascii"]);
  const later = git(staged.dir, ["rev-parse", "HEAD"]);
  /* THE DANGEROUS SPELLING IS ESTABLISHED, not assumed: if a future git stopped
     quoting by default this test would be exercising nothing, and it would say
     so here rather than pass quietly. */
  const quoted = git(staged.dir, ["diff", "--name-only", `${staged.reviewed}..${later}`]);
  assert.match(quoted, /^"delivery\/na/m, quoted);

  const run = runGate({ ...staged, head: later }, later);
  assert.equal(run.exit, 0, run.output);
  assert.equal(run.record.status, "green");
  assert.equal(run.record.units, 2);
  assert.doesNotMatch(run.record.detail, /path\(s\) outside delivery\/ differ between them/);
});

test("an approving pair naming a DESCENDANT of the commit under audit is refused on its own route", () => {
  /* THE DIRECTION THE ALLOWANCE DELIBERATELY DOES NOT OPEN. Ancestry is
     admitted because the reviewers read the shipped content this commit
     carries. A verdict naming a commit BELOW the audited one reviewed a tree
     the audited commit does not contain, so nothing here establishes what those
     reviewers would have said about the smaller tree. It is refused, and it
     gets its own sentence rather than being folded into "not an ancestor",
     because a reader who wrote the head field backwards is owed the diagnosis. */
  const staged = stage(PAIR);
  writeFileSync(join(staged.dir, "delivery", "later.md"), "paperwork below\n");
  git(staged.dir, ["add", "-A"]);
  git(staged.dir, ["commit", "-q", "-m", "a descendant commit"]);
  const descendant = git(staged.dir, ["rev-parse", "HEAD"]);
  const pointed = stage(PAIR.map((entry) => ({ ...entry, head: descendant })));
  for (const entry of PAIR) {
    writeFileSync(
      join(staged.dir, "delivery", "review", entry.file),
      readFileSync(join(pointed.dir, "delivery", "review", entry.file), "utf8"),
    );
  }
  git(staged.dir, ["add", "-A"]);
  git(staged.dir, ["commit", "-q", "-m", "verdicts naming a later commit"]);
  const audited = staged.reviewed;
  assert.equal(isAncestor(staged.dir, audited, descendant), true);

  const run = runGate({ ...staged, head: audited }, audited);
  assert.notEqual(run.exit, 0, run.output);
  assert.notEqual(run.record.status, "green");
  assert.match(
    run.record.detail,
    /is a DESCENDANT of the commit under audit .*, so the reviewers read a tree this commit does not contain/,
    run.record.detail,
  );
});

test("with no --head the audited commit is the context's own HEAD, so the workflow step that passes no flag is anchored too", () => {
  /* THE DEFAULT IS THE ONE CI TAKES. `.github/workflows/gates.yml` runs this
     script as a direct step with no `--head`, so an anchor that existed only
     when the flag was passed would leave the CI path exactly as it was.

     BOTH DIRECTIONS ARE ASSERTED HERE, AND THAT IS ROUND 2's CHANGE. Until
     round 2 this test asserted only that the flagless run reported
     not-applicable, which was true of EVERY flagless run, including the real
     one: the default anchor is the context's HEAD and the verdicts name its
     parent. So the assertion was satisfied by the gate being unable to pass at
     all, and it would have gone on being satisfied. Now the flagless run is
     exercised on an arm that passes and an arm that refuses, and both name
     `staged.head` as the commit under audit, which is what the test is for. */
  const admitting = stage(PAIR);
  const green = runGate(admitting);
  assert.equal(green.record.status, "green", green.output);
  assert.match(
    green.record.detail,
    new RegExp(`for the commit under audit ${admitting.head}`),
    green.record.detail,
  );
  assert.equal(runPrecondition(admitting).exit, 0);

  const refusing = stage(PAIR);
  writeFileSync(join(refusing.dir, "src.ts"), "export const nobodyRead = 3;\n");
  git(refusing.dir, ["add", "-A"]);
  git(refusing.dir, ["commit", "-q", "-m", "shipped work nobody reviewed"]);
  const later = git(refusing.dir, ["rev-parse", "HEAD"]);
  const red = runGate(refusing);
  assert.equal(red.record.status, "not-applicable", red.output);
  assert.match(
    red.record.detail,
    new RegExp(`for the commit under audit ${later}`),
    red.record.detail,
  );
  assert.equal(runPrecondition(refusing).exit, 1);
});

test("a --head the repository cannot produce is error, never not-applicable and never green", () => {
  /* THE THIRD ROUTE, AND THE ONE THAT IS ABOUT THE CALLER RATHER THAN THE
     EVIDENCE. A caller that named a commit this repository does not have has
     not told the gate what to judge. M2-C-3: nothing was evaluated, so the
     status is `error`. */
  const staged = stage(PAIR);
  const run = runGate(staged, "deadbeefdeadbeefdeadbeefdeadbeefdeadbeef");
  assert.equal(run.record.status, "error", run.output);
  assert.match(run.record.detail, /does not resolve to a commit in/, run.record.detail);
  /* AND THE PRECONDITION LETS THE GATE RUN so that error is reported, rather
     than exiting 1 and having the workflow print "not applicable" over it. */
  const pre = runPrecondition(staged, "deadbeefdeadbeefdeadbeefdeadbeefdeadbeef");
  assert.equal(pre.exit, 0, pre.output);
});

test("the gate registry declares head as a parameter of check-dual-review, which is how the runner supplies the audited commit", () => {
  const registry = yamlModule.parse(
    readFileSync(join(repoRoot, "gate-registry.yaml"), "utf8"),
  ) as { gates: { id: string; parameters?: string[] }[] };
  const entry = registry.gates.find((gate) => gate.id === "check-dual-review");
  assert.ok(entry !== undefined, "check-dual-review is not declared in gate-registry.yaml");
  /* M5-P3 ADDS `base`, which is how the runner supplies the diff whose review
     budget the gate decides. `head` is still declared and still the audited
     commit; the pair is asserted exactly because a parameter the runner does
     not pass is a question the gate answers without its subject. */
  assert.deepEqual(entry.parameters, ["base", "head"]);
});

/* ------------------------------------------------------------------ */
/* CR-VS-002: the pair corpus reads the whole subtree                   */
/* ------------------------------------------------------------------ */

test("a verdict pair committed one directory down is read, rather than reported as an empty corpus", () => {
  /* MEMBER ONE OF THE DEPTH CLASS. Before this round the pair corpus was
     listed NON-recursively while the falsifiers' corpus was listed
     recursively, so `ls-tree` yielded the SUBTREE'S NAME, which the extension
     filter discarded, and the gate reported `0 verdict document(s)` and
     not-applicable while `git ls-files` listed both documents. */
  const staged = stage(
    PAIR.map((entry) => ({ ...entry, directory: join("delivery", "review", "sub") })),
  );
  const listed = git(staged.dir, ["ls-files", "delivery/review"]);
  assert.match(listed, /delivery\/review\/sub\/decorrelated-criteria\.yaml/, listed);

  const run = runGate(staged, staged.reviewed);
  assert.equal(run.record.status, "green", run.output);
  assert.equal(run.record.units, 2);
});

test("a committed third review refusing the audited head is counted even one directory down, so the pair cannot be approved over it", () => {
  /* MEMBER TWO OF THE DEPTH CLASS, AND IT IS THE FAIL-OPEN DIRECTION. Two
     APPROVE verdicts at the top level plus a committed FIX-ROUND-NEEDED review
     of the SAME phase and the SAME head one directory down. Before this round
     the refusal was neither counted nor mentioned and the gate was GREEN. */
  const staged = stage([
    ...PAIR,
    {
      file: "decorrelated-criteria.yaml",
      as: "refusing.yaml",
      directory: join("delivery", "review", "sub"),
      verdict: "FIX-ROUND-NEEDED",
      findings: [
        "findings:",
        "  - id: CR-001",
        "    severity: high",
        "    summary: the refusal this corpus must not be able to hide",
        "    files: [src/checks.ts]",
      ].join("\n"),
    },
  ]);
  const run = runGate(staged, staged.reviewed);
  assert.notEqual(run.exit, 0, run.output);
  assert.equal(run.record.status, "red", run.output);
  /* THE REFUSING DOCUMENT IS NAMED, not merely counted. */
  assert.match(`${run.output}${run.record.detail}`, /refusing\.yaml/, run.output);
});

/* ------------------------------------------------------------------ */
/* CR-VS-003: what produced-by actually compared                        */
/* ------------------------------------------------------------------ */

test("the green decorrelation report says produced-by was compared as a string and is not a cross-family assertion", () => {
  /* DISCLOSURE, NOT REFUSAL, and the reason is recorded at `producedByCaveat`:
     M4-P11 declined a closed family vocabulary with a reason that still holds,
     so what this round changes is the SENTENCE, which was being read as a
     cross-family claim it never established. */
  const staged = stage(PAIR);
  const run = runGate(staged, staged.reviewed);
  assert.equal(run.record.status, "green", run.output);
  assert.match(run.output, /are distinct on produced-by, framing, review-contract/, run.output);
  assert.match(
    run.output,
    /produced-by was compared as a canonicalised STRING and not as a model FAMILY/,
    run.output,
  );
});

/* ------------------------------------------------------------------ */
/* CR-VS-006: the not-applicable sentence is a sentence                 */
/* ------------------------------------------------------------------ */

test("the not-applicable detail is grammatical, because the corpus describer it uses is the parenthetical one", () => {
  /* The shipped line read "no verdict document is (corpus: ... read from
     commit ...)", which is the parenthetical describer fed to a sentence
     written for the phrase-form one. */
  const staged = stage([]);
  const run = runGate(staged, staged.reviewed);
  assert.equal(run.record.status, "not-applicable", run.output);
  assert.match(run.record.detail, /^no verdict document was found \(corpus: /, run.record.detail);
  assert.doesNotMatch(run.record.detail, /no verdict document is \(corpus: /);
});

/* ------------------------------------------------------------------ */
/* CR-FS-GATES-01: naming a gate is not the gate asserting anything     */
/* ------------------------------------------------------------------ */

/** Run the class gate over one declaration written into a scratch directory. */
function runClasses(gateClasses: Record<string, unknown>): { exit: number; detail: string } {
  const dir = scratch();
  mkdirSync(join(dir, "declarations"), { recursive: true });
  writeFileSync(
    join(dir, "declarations", "m9-p1.json"),
    `${JSON.stringify(
      {
        id: "M9-P1",
        branch: "claude/m9-p1-fixture",
        filesToTouch: ["src/fixture.ts"],
        declaredExtras: [],
        citations: [],
        gateClasses,
      },
      null,
      2,
    )}\n`,
  );
  const resultPath = join(dir, "result.json");
  const run = spawnSync(
    process.execPath,
    [
      classGate,
      "gate-classes",
      "--declarations",
      join(dir, "declarations"),
      "--registry",
      join(repoRoot, "gate-registry.yaml"),
      "--result",
      resultPath,
      "--phase",
      "m9-p1",
    ],
    { cwd: repoRoot, encoding: "utf8" },
  );
  const record = JSON.parse(readFileSync(resultPath, "utf8")) as { detail: string };
  assert.equal(run.status ?? -1, 0, `${run.stdout}${run.stderr}`);
  return { exit: run.status ?? -1, detail: record.detail };
}

test("a class satisfied only by a CONDITIONAL gate is named on the green arm, and a class satisfied by required gates is not", () => {
  /* TWO ARMS, BECAUSE THE DISCLOSURE MUST DISTINGUISH. A note that printed for
     every green declaration would be noise a reader learns to skip, which is
     the same uselessness as no note at all.

     The dangerous state, measured at the swept head: `gate-classes` printed
     "review: asserted by check-dual-review" and exited 0 while
     `check-dual-review --precondition .` exited 1 with "0 verdict
     document(s)", and because that gate is `conditional` its vacuity never
     reddened the bundle either. */
  const conditional = runClasses({
    correctness: { gates: ["suite", "typecheck"] },
    scope: { gates: ["scope"] },
    review: { gates: ["check-dual-review"] },
  });
  assert.match(
    conditional.detail,
    /class\(es\) are satisfied ONLY BY NAMING a gate, and this check never establishes that the named gate asserted anything on this head: review -> check-dual-review/,
    conditional.detail,
  );

  /* THE CONTROL. Every class satisfied by a gate the registry declares
     `required`, so nothing can report not-applicable, and the note is absent. */
  const required = runClasses({
    correctness: { gates: ["suite", "typecheck"] },
    scope: { gates: ["scope"] },
    review: { gates: ["citations"] },
  });
  assert.doesNotMatch(required.detail, /ONLY BY NAMING a gate/, required.detail);

  /* AND THE APPLICABILITY THE NOTE IS DERIVED FROM IS READ OFF THE REGISTRY,
     never hard-coded here: if a later phase makes `check-dual-review` required
     or `citations` conditional, this test follows the registry rather than
     asserting a stale fact about it. */
  const registry = yamlModule.parse(
    readFileSync(join(repoRoot, "gate-registry.yaml"), "utf8"),
  ) as { gates: { id: string; applicability?: string }[] };
  const byId = new Map(registry.gates.map((gate) => [gate.id, gate.applicability]));
  assert.equal(byId.get("check-dual-review"), "conditional");
  assert.equal(byId.get("citations"), "required");
});

/* ------------------------------------------------------------------ */
/* Registration                                                         */
/* ------------------------------------------------------------------ */

test("the DR-0047 sweep behaviors are registered in test/behaviors.json and resolve by name", () => {
  /* BY NAME, NEVER BY COUNT (CLAUDE.md's append-only registry rule): the file
     is append-only, so a count would be a claim about every future phase and
     false the moment the next one appends. */
  const behaviors = JSON.parse(
    readFileSync(join(repoRoot, "test", "behaviors.json"), "utf8"),
  ) as Record<string, string>;
  const ids = [
    "dual-review-head-anchored-green",
    "dual-review-head-unresolvable-never-green",
    "dual-review-head-other-commit-never-green",
    "dual-review-head-ancestor-shipped-gap-refused",
    "dual-review-head-evidence-only-ancestor-green",
    "dual-review-head-descendant-refused",
    "dual-review-head-awkward-paperwork-name-still-green",
    "dual-review-head-defaults-to-context-head",
    "dual-review-unresolvable-audited-head-is-error",
    "dual-review-registry-declares-head-parameter",
    "dual-review-pair-corpus-reads-the-subtree",
    "dual-review-nested-refusal-cannot-be-hidden",
    "dual-review-produced-by-string-disclosed",
    "dual-review-not-applicable-sentence-is-grammatical",
    "gate-classes-conditional-satisfier-disclosed",
    "sweep-head-anchor-behaviors-registered",
  ];
  const testNames = new Set<string>();
  const body = readFileSync(join(repoRoot, "test", "dual-review-head-anchor.test.ts"), "utf8");
  for (const match of body.matchAll(/\btest\(\s*(["'`])((?:\\.|(?!\1).)*)\1/g)) {
    testNames.add(match[2] as string);
  }
  assert.ok(
    testNames.size >= ids.length,
    `the test-name scan found only ${String(testNames.size)} names in this file`,
  );
  const unregistered = ids.filter((id) => !Object.prototype.hasOwnProperty.call(behaviors, id));
  assert.deepEqual(unregistered, [], `behaviors.json does not register ${unregistered.join(", ")}`);
  const unresolved = ids.filter((id) => !testNames.has(behaviors[id] as string));
  assert.deepEqual(
    unresolved,
    [],
    `registered rows naming no test in this file: ${unresolved.join(", ")}`,
  );
});
