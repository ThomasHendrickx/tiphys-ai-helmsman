/**
 * THE DUAL-REVIEW DECORRELATION TESTS (kernel plan M3, M3-P9 criteria 7
 * and 7b; M3R-004, DR-0012, T-001, T-007).
 *
 * FIVE DIRECTIONS from criterion 7 and two more from 7b, each driven by real
 * verdict FIXTURES under `witness/fixtures/dual-review/` rather than by
 * documents this file builds, so what is exercised is a document a reviewer
 * could actually have written.
 *
 * THE CONTEXT IS ASSEMBLED FROM SHIPPED ARTIFACTS. Each staged directory
 * carries the repository's own `assurance-modes.yaml` and a charter derived
 * from `templates/charter.example.yaml`, because the check reads the declared
 * mode's `merge-authority` rather than assuming one. Copying the real documents
 * instead of writing a two-line stand-in is section 2.3 rule 4: a fixture that
 * simplifies the thing under test stops testing it.
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
  readdirSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import assert from "node:assert/strict";
import test from "node:test";

const repoRoot = dirname(dirname(fileURLToPath(import.meta.url)));
const cliEntry = join(repoRoot, "bin", "tiphys.ts");
const scriptPath = join(repoRoot, "scripts", "check-dual-review.mjs");
const fixturesDir = join(repoRoot, "witness", "fixtures", "dual-review");

const checksModule = (await import(new URL("../src/checks.ts", import.meta.url).href)) as {
  registeredChecks: () => readonly { id: string; type: string; requiresContext: boolean }[];
  deregisterCheck: (id: string) => boolean;
  registerCheck: (check: unknown) => void;
  dualReviewDecorrelation: { id: string };
  DECORRELATION_DIMENSIONS: readonly string[];
  DELEGATED_MERGE_AUTHORITY: string;
};

const scriptModule = (await import(
  new URL("../scripts/check-dual-review.mjs", import.meta.url).href
)) as {
  evaluate: (directory: string) => {
    status: string;
    units: number;
    lines: string[];
    checksRun: number;
    distinctViolations?: number;
  };
  CHECK_ID: string;
};

const yamlModule = (await import("yaml")) as unknown as {
  parse: (text: string) => unknown;
};

/**
 * Stage a context directory: the real mode document, a charter declaring
 * `mode`, and the named verdict fixtures under `delivery/review/`.
 *
 * The charter is the SHIPPED TEMPLATE with one line changed, so the only thing
 * that differs between the delegated arm and the owner arm is the declared
 * mode, which is exactly the variable criterion 7's fifth direction is about.
 */
function stageContext(mode: string, fixtures: string[]): string {
  const dir = mkdtempSync(join(tmpdir(), "tiphys-dual-review-"));
  mkdirSync(join(dir, "delivery", "review"), { recursive: true });
  copyFileSync(join(repoRoot, "assurance-modes.yaml"), join(dir, "assurance-modes.yaml"));
  const charter = readFileSync(
    join(repoRoot, "templates", "charter.example.yaml"),
    "utf8",
  );
  const retargeted = charter.replace(/^delivery-mode: .*$/m, `delivery-mode: ${mode}`);
  assert.notEqual(retargeted, charter === retargeted ? "" : charter, "charter mode line not found");
  writeFileSync(join(dir, "charter.yaml"), retargeted);
  for (const fixture of fixtures) {
    copyFileSync(join(fixturesDir, fixture), join(dir, "delivery", "review", fixture));
  }
  return dir;
}

/** Run the shipped script against a staged context. */
function runScript(dir: string): { status: number; output: string } {
  const run = spawnSync(process.execPath, [scriptPath, dir], {
    cwd: repoRoot,
    encoding: "utf8",
  });
  return { status: run.status ?? -1, output: `${run.stdout}${run.stderr}` };
}

/** Stage, run, tear down. */
function withContext<T>(mode: string, fixtures: string[], body: (dir: string) => T): T {
  const dir = stageContext(mode, fixtures);
  try {
    return body(dir);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

const DECORRELATED = ["decorrelated-criteria.yaml", "decorrelated-hazard.yaml"];
const SHARED_FAMILY = ["decorrelated-criteria.yaml", "shared-family-hazard.yaml"];
const SHARED_FRAMING = ["decorrelated-criteria.yaml", "shared-framing-hazard.yaml"];
const SHARED_CONTRACT = ["decorrelated-criteria.yaml", "shared-contract-criteria.yaml"];

/* ------------------------------------------------------------------ */
/* The fixtures are real verdicts, not stand-ins                        */
/* ------------------------------------------------------------------ */

test("every dual-review fixture validates against the shipped verdict schema", () => {
  /* IF THE FIXTURES WERE NOT VALID VERDICTS the seven directions below would be
     exercising the check against documents no reviewer could produce, and every
     result would be about a shape that cannot occur. */
  const names = readdirSync(fixturesDir).filter((name) => name.endsWith(".yaml"));
  assert.ok(names.length >= 5, `only ${String(names.length)} fixtures were found`);
  for (const name of names) {
    const run = spawnSync(
      process.execPath,
      [cliEntry, "validate", "--type", "verdict", join(fixturesDir, name)],
      { cwd: repoRoot, encoding: "utf8" },
    );
    const output = `${run.stdout}${run.stderr}`;
    /* THE EXIT CODE IS NONZERO HERE AND THAT IS THE VALIDATOR WORKING, not a
       fixture defect. Four checks registered for `verdict` require a context
       and this invocation deliberately gives none, so each reports
       `SKIPPED <id> no context` and the command exits 1 rather than passing by
       not running. What this test is about is the SCHEMA, so what it asserts is
       that no line is an `INVALID`, and that every line that is there is a
       skip. Asserting exit 0 would have forced a `--context` that has nothing
       to do with the question. */
    assert.doesNotMatch(output, /INVALID/, `${name}: ${output}`);
    for (const line of output.split("\n").filter((entry) => entry.trim() !== "")) {
      assert.match(line, /^SKIPPED [a-z-]+ no context$/, `${name}: ${line}`);
    }
  }
});

test("the fixtures are refused when the schema is not satisfied, so the check above is not vacuous", () => {
  /* THE ARM THAT MAKES THE TEST ABOVE MEAN SOMETHING. "No INVALID lines" is
     also what a validator that validates nothing prints. */
  const dir = mkdtempSync(join(tmpdir(), "tiphys-verdict-invalid-"));
  try {
    const broken = readFileSync(
      join(fixturesDir, "decorrelated-criteria.yaml"),
      "utf8",
    ).replace(/^review-contract: criteria$/m, "review-contract: improvised");
    const path = join(dir, "broken.yaml");
    writeFileSync(path, broken);
    const run = spawnSync(
      process.execPath,
      [cliEntry, "validate", "--type", "verdict", path],
      { cwd: repoRoot, encoding: "utf8" },
    );
    assert.notEqual(run.status, 0);
    assert.match(`${run.stdout}${run.stderr}`, /INVALID #\/review-contract/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("the fixture framings name framings the shipped checklist actually declares", () => {
  /* A framing id that no checklist declares would make the decorrelation
     fixtures assert over a vocabulary that does not exist. */
  const checklist = yamlModule.parse(
    readFileSync(join(repoRoot, "checklists", "clean-room.yaml"), "utf8"),
  ) as { framings: { id: string }[] };
  const declared = new Set(checklist.framings.map((framing) => framing.id));
  for (const name of readdirSync(fixturesDir).filter((entry) => entry.endsWith(".yaml"))) {
    const verdict = yamlModule.parse(
      readFileSync(join(fixturesDir, name), "utf8"),
    ) as { framing: string };
    assert.ok(declared.has(verdict.framing), `${name} names framing ${verdict.framing}`);
  }
});

/* ------------------------------------------------------------------ */
/* Criterion 7, the five directions                                     */
/* ------------------------------------------------------------------ */

test("two verdicts for one head with distinct produced-by and framing exit 0", () => {
  withContext("full", DECORRELATED, (dir) => {
    const run = runScript(dir);
    assert.equal(run.status, 0, run.output);
    assert.match(run.output, /check-dual-review: green \(2 review verdicts examined/);
    /* AND THE GUARD ACTUALLY RAN. A green beside "0 registered check(s)" is a
       different fact from a green beside "1", and conflating them is how a
       deregistered check reads as a passing one. */
    assert.match(run.output, /1 registered check\(s\) named dual-review-decorrelation ran over 2 verdict\(s\)/);
  });
});

test("two verdicts sharing a produced-by model family exit nonzero naming the duplicated value", () => {
  withContext("full", SHARED_FAMILY, (dir) => {
    const run = runScript(dir);
    assert.equal(run.status, 1, run.output);
    assert.match(
      run.output,
      /produced-by value family-a occurs in 2 of the 2 verdicts for phase M3-P9/,
    );
    assert.match(run.output, /not decorrelated on produced-by/);
  });
});

test("two verdicts sharing a framing exit nonzero naming the duplicated value", () => {
  withContext("full", SHARED_FRAMING, (dir) => {
    const run = runScript(dir);
    assert.equal(run.status, 1, run.output);
    assert.match(
      run.output,
      /framing value criteria-contract occurs in 2 of the 2 verdicts for phase M3-P9/,
    );
    assert.match(run.output, /not decorrelated on framing/);
    /* AND NOT for the wrong reason: these two DO differ on model family. */
    assert.doesNotMatch(run.output, /not decorrelated on produced-by/);
  });
});

test("one verdict for a head exits nonzero saying a delegated grant needs two", () => {
  withContext("full", [DECORRELATED[0] as string], (dir) => {
    const run = runScript(dir);
    assert.equal(run.status, 1, run.output);
    assert.match(
      run.output,
      /only 1 verdict document\(s\) exist under delivery\/review for phase M3-P9/,
    );
  });
});

test("a mode whose merge-authority is owner exits 0 on the very pair that reddens under a delegated grant", () => {
  /* THE APPLICABILITY DIRECTION, and the fixtures are IDENTICAL to the
     shared-family case above. Only the charter's declared mode differs, so the
     result isolates the applicability rule rather than confounding it with a
     different pair of documents. */
  withContext("direct-pr", SHARED_FAMILY, (dir) => {
    const run = runScript(dir);
    assert.equal(run.status, 0, run.output);
    /* IT SAYS SO, rather than passing silently. "Nothing to check here" and
       "everything checked and fine" must never print the same line (SC-011). */
    assert.match(
      run.output,
      /mode direct-pr declares merge-authority owner, which is not a delegated grant/,
    );
  });

  /* AND THE MODE DOCUMENT REALLY SAYS THAT, read rather than assumed, so this
     test is not asserting against a memory of the shipped data. */
  const modes = yamlModule.parse(
    readFileSync(join(repoRoot, "assurance-modes.yaml"), "utf8"),
  ) as { modes: { id: string; "merge-authority": string }[] };
  assert.equal(
    modes.modes.find((mode) => mode.id === "direct-pr")?.["merge-authority"],
    "owner",
  );
  assert.equal(
    modes.modes.find((mode) => mode.id === "full")?.["merge-authority"],
    checksModule.DELEGATED_MERGE_AUTHORITY,
  );
});

test("deregistering dual-review-decorrelation makes the shared-family fixture pass, and restoring it makes it fail again", () => {
  /* THE KIND B WITNESS (section 2.3 rule 3). Not a schema keyword: a Kind B
     criterion offered a keyword witness would have misclassified itself. The
     script's own `evaluate` is called, not a copy of its loop, so what is shown
     to depend on the registration is the shipped code path. */
  withContext("full", SHARED_FAMILY, (dir) => {
    const before = scriptModule.evaluate(dir);
    assert.equal(before.status, "red");
    assert.equal(before.checksRun, 1);

    assert.equal(checksModule.deregisterCheck("dual-review-decorrelation"), true);
    try {
      const during = scriptModule.evaluate(dir);
      assert.equal(during.status, "green");
      assert.equal(during.checksRun, 0);
      assert.deepEqual(during.lines, []);
    } finally {
      checksModule.registerCheck(checksModule.dualReviewDecorrelation);
    }

    const after = scriptModule.evaluate(dir);
    assert.equal(after.status, "red");
    assert.equal(after.checksRun, 1);
  });
});

test("dual-review-decorrelation is registered in the shipped registry for the verdict type and requires a context", () => {
  /* THE OTHER HALF of the witness above, and it has to be a separate assertion.
     The script exits 0 when no check is registered, which is what makes the
     deregistration witness real; that same property means a green from the
     script is only evidence if the check is there. This is what says it is. */
  const found = checksModule
    .registeredChecks()
    .filter((check) => check.id === "dual-review-decorrelation");
  assert.equal(found.length, 1, "the check is not registered exactly once");
  assert.equal(found[0]?.type, "verdict");
  /* requiresContext TRUE, so running the validator with no `--context` prints
     `SKIPPED dual-review-decorrelation no context` and exits nonzero rather
     than passing by not running. */
  assert.equal(found[0]?.requiresContext, true);
});

/* ------------------------------------------------------------------ */
/* Criterion 7b: contract distinctness, witnessed separately            */
/* ------------------------------------------------------------------ */

test("two verdicts whose produced-by and framing both differ and whose review-contract is the same exit nonzero", () => {
  /* T-007's WHOLE FINDING is that model decorrelation and contract
     decorrelation are different properties and this project had the second by
     accident. So this pair satisfies DR-0012's condition and T-001's, and fails
     only on the contract, which is why it is witnessed separately from the
     other two dimensions rather than folded in with them. */
  withContext("full", SHARED_CONTRACT, (dir) => {
    const run = runScript(dir);
    assert.equal(run.status, 1, run.output);
    assert.match(
      run.output,
      /review-contract value criteria occurs in 2 of the 2 verdicts for phase M3-P9/,
    );
    assert.match(run.output, /not decorrelated on review-contract/);
    /* AND NOT ON THE OTHER TWO: this pair is decorrelated on both. If either of
       those also fired, this fixture would not be isolating the fifth
       dimension. */
    assert.doesNotMatch(run.output, /not decorrelated on produced-by/);
    assert.doesNotMatch(run.output, /not decorrelated on framing/);
  });
});

test("the same pair with one criteria contract and one hazard contract exits 0", () => {
  withContext("full", DECORRELATED, (dir) => {
    assert.equal(runScript(dir).status, 0);
  });
  /* AND THE TWO FIXTURES REALLY DIFFER ONLY WHERE CLAIMED, read out of the
     documents rather than asserted about them. */
  const read = (name: string) =>
    yamlModule.parse(readFileSync(join(fixturesDir, name), "utf8")) as Record<
      string,
      unknown
    >;
  const a = read("decorrelated-criteria.yaml");
  const b = read("shared-contract-criteria.yaml");
  assert.notEqual(a["produced-by"], b["produced-by"]);
  assert.notEqual(a["framing"], b["framing"]);
  assert.equal(a["review-contract"], b["review-contract"]);
});

/* ------------------------------------------------------------------ */
/* The vacuity arms: a check that cannot reach its subject              */
/* ------------------------------------------------------------------ */

test("a directory with no verdict document reports not-applicable with a reason rather than green", () => {
  withContext("full", [], (dir) => {
    const run = spawnSync(process.execPath, [scriptPath, dir], {
      cwd: repoRoot,
      encoding: "utf8",
    });
    /* EXIT 20 IS not-applicable in the gate exit-code table, and the runner
       cross-checks the record's status against the process exit code, so this
       is the only pair that can be reported here. Green would be the vacuous
       pass M2-C-3 and SC-011 exist against. */
    assert.equal(run.status, 20, `${run.stdout}${run.stderr}`);
    assert.match(run.stdout, /check-dual-review: not-applicable/);
    assert.match(run.stdout, /there is no pair of reviews to compare/);
  });
});

test("the precondition arm answers only whether a verdict document exists, and it says no for this repository", () => {
  withContext("full", DECORRELATED, (dir) => {
    const met = spawnSync(process.execPath, [scriptPath, "--precondition", dir], {
      cwd: repoRoot,
      encoding: "utf8",
    });
    assert.equal(met.status, 0, `${met.stdout}${met.stderr}`);
    assert.match(met.stdout, /2 verdict document\(s\)/);
  });
  withContext("full", [], (dir) => {
    const unmet = spawnSync(process.execPath, [scriptPath, "--precondition", dir], {
      cwd: repoRoot,
      encoding: "utf8",
    });
    assert.equal(unmet.status, 1, `${unmet.stdout}${unmet.stderr}`);
  });

  /* AND AGAINST THIS REPOSITORY, whose `delivery/review/` holds prose reviews
     and no verdict document. The registry entry's `$comment` states this as a
     present-tense fact and a document asserting a present-tense fact that
     nothing checks is tuition T-006. */
  const here = spawnSync(process.execPath, [scriptPath, "--precondition", "."], {
    cwd: repoRoot,
    encoding: "utf8",
  });
  assert.equal(here.status, 1, `${here.stdout}${here.stderr}`);
  assert.match(here.stdout, /0 verdict document\(s\)/);
});

test("the merge-path caller refuses a directory that declares no regime, rather than treating the grant as absent", () => {
  /* AN UNKNOWN APPLICABILITY MUST NEVER RESOLVE TO "does not apply", and this
     is the arm that would turn the whole rule off silently: a directory with no
     charter reads, to a careless implementation, exactly like one whose mode
     does not delegate.

     THE REFUSAL IS AT THIS CALLER AND NOT INSIDE THE CHECK, which is a design
     decision with a measured price behind it. The check runs on ANY verdict
     with ANY context, and M3-P7's verdict contexts carry a plan and a work
     history and no charter; a check that reddened on an absent charter reddened
     eight of that phase's tests, one of them its own acceptance criterion. So
     the check REPORTS an absent charter and this command, which is the one
     DR-0012's grant runs through, refuses outright. Exit 21 is `error` in the
     gate exit-code table: not green, and not a red that could be read as "the
     reviews are correlated". */
  for (const document of ["charter.yaml", "assurance-modes.yaml"]) {
    withContext("full", SHARED_FAMILY, (dir) => {
      rmSync(join(dir, document));
      const run = runScript(dir);
      assert.equal(run.status, 21, `${document}: ${run.output}`);
      assert.match(run.output, /check-dual-review: error/);
      assert.match(run.output, new RegExp(`${document} does not exist`));
      assert.match(run.output, /reports error, never green/);
    });
  }
});

test("a charter that is PRESENT and wrong is a violation, which an absent one deliberately is not", () => {
  /* THE OTHER HALF of the distinction above, and it is what stops the report
     arm from being a hole: a document that EXISTS and is wrong is a different
     fact from one that does not exist, and only the first is something this
     project can be said to have got wrong. */
  withContext("full", SHARED_FAMILY, (dir) => {
    const charter = readFileSync(join(dir, "charter.yaml"), "utf8");
    writeFileSync(
      join(dir, "charter.yaml"),
      charter.replace(/^delivery-mode: .*$/m, "delivery-mode: invented"),
    );
    const run = runScript(dir);
    assert.equal(run.status, 1, run.output);
    assert.match(run.output, /declares delivery mode invented, which .* does not define/);
  });
  withContext("full", SHARED_FAMILY, (dir) => {
    writeFileSync(join(dir, "charter.yaml"), "delivery-mode: [unclosed\n");
    const run = runScript(dir);
    assert.equal(run.status, 1, run.output);
    assert.match(run.output, /the charter is present and could not be read/);
  });
});

test("the check REPORTS rather than fails when a context declares no delivery mode, and says so in a line a green run cannot be confused with", () => {
  /* THE ARM THAT KEEPS M3-P7's CONTEXTS WORKING. A verdict validated against a
     context that is not a project workspace is not evaluated against a
     merge-authority regime, and the run says which of those two happened.
     SC-011: "nothing to check here" and "everything checked and fine" must
     never print the same line. */
  withContext("full", SHARED_FAMILY, (dir) => {
    rmSync(join(dir, "charter.yaml"));
    const run = spawnSync(
      process.execPath,
      [
        cliEntry,
        "validate",
        "--type",
        "verdict",
        "--context",
        dir,
        join(dir, "delivery", "review", "decorrelated-criteria.yaml"),
      ],
      { cwd: repoRoot, encoding: "utf8" },
    );
    const output = `${run.stdout}${run.stderr}`;
    assert.doesNotMatch(output, /INVALID .*dual-review-decorrelation/, output);
    assert.match(output, /REPORT dual-review-decorrelation .* declares no delivery mode/);
    assert.match(output, /were NOT evaluated against a\s+merge-authority regime|were NOT evaluated against a merge-authority regime/);
  });
});

test("a verdict that is not among the committed reviews cannot be cleared by the pair that is", () => {
  /* DR-0012 condition 1 says the two reviews are WRITTEN TO delivery/review AND
     COMMITTED. Without this arm the check would pass on any document handed to
     it beside a well-decorrelated directory, which is a green about a file the
     grant has nothing to do with. */
  withContext("full", DECORRELATED, (dir) => {
    const stray = {
      kind: "verdict",
      phase: "M3-P9",
      verdict: "APPROVE",
      "produced-by": "family-c",
      framing: "fix-round",
      "review-contract": "criteria",
      findings: [],
      criteria: [
        { id: "1", quote: "q", evidence: ["e"], met: true },
      ],
      "deviations-judged": [],
    };
    const strayPath = join(dir, "stray-verdict.json");
    writeFileSync(strayPath, JSON.stringify(stray, null, 2));
    const run = spawnSync(
      process.execPath,
      [cliEntry, "validate", "--type", "verdict", "--context", dir, strayPath],
      { cwd: repoRoot, encoding: "utf8" },
    );
    assert.notEqual(run.status, 0, `${run.stdout}${run.stderr}`);
    assert.match(
      `${run.stdout}${run.stderr}`,
      /this verdict is not among the 2 verdict document\(s\) committed under delivery\/review for phase M3-P9/,
    );
  });
});

/* ------------------------------------------------------------------ */
/* The gate wiring                                                      */
/* ------------------------------------------------------------------ */

test("check-dual-review is declared on the pull request arm with a precondition the runner can evaluate", () => {
  const registry = yamlModule.parse(
    readFileSync(join(repoRoot, "gate-registry.yaml"), "utf8"),
  ) as {
    gates: {
      id: string;
      events?: string[];
      applicability?: string;
      precondition?: { kind: string; command?: string[] };
    }[];
  };
  const entry = registry.gates.find((gate) => gate.id === "check-dual-review");
  assert.ok(entry !== undefined, "the gate is not declared in gate-registry.yaml");
  assert.deepEqual(entry.events, ["pull_request"]);
  assert.equal(entry.applicability, "conditional");
  assert.equal(entry.precondition?.kind, "command-exit-zero");
  /* THE PRECONDITION COMMAND IS THIS SCRIPT'S OWN ARM, so what the runner
     evaluates and what the workflow evaluates are the same question. */
  assert.ok(
    (entry.precondition?.command ?? []).includes("--precondition"),
    "the precondition does not use the script's precondition arm",
  );

  const workflow = yamlModule.parse(
    readFileSync(join(repoRoot, ".github", "workflows", "gates.yml"), "utf8"),
  ) as { jobs: Record<string, { steps: { run?: string; if?: string }[] }> };
  const step = (workflow.jobs["gates"]?.steps ?? []).find((candidate) =>
    (candidate.run ?? "").includes("check-dual-review.mjs"),
  );
  assert.ok(step !== undefined, "no workflow step runs the dual-review check");
  /* THE STEP'S EVENT NARROWING MATCHES THE GATE'S DECLARED EVENTS. An `if:`
     that CONTRADICTED the registry would be the defang; one that agrees with it
     is the wiring. */
  assert.equal(step.if, "github.event_name == 'pull_request'");
  assert.match(step.run as string, /--precondition/);
});

test("the check's declared dimensions are the three the criteria name, read from the shipped module", () => {
  /* DERIVED, NOT PINNED BY COUNT. If a later phase adds a sixth dimension this
     asserts the three that exist today are still among them, rather than that
     there are exactly three (CLAUDE.md:233). */
  for (const dimension of ["produced-by", "framing", "review-contract"]) {
    assert.ok(
      checksModule.DECORRELATION_DIMENSIONS.includes(dimension),
      `${dimension} is not a declared decorrelation dimension`,
    );
  }
  assert.equal(scriptModule.CHECK_ID, "dual-review-decorrelation");
});
