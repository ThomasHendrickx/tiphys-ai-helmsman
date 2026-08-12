/**
 * THE TUITION FLOW (kernel plan M3, M3-P8; R-091, R-098).
 *
 * Kind A witnesses remove and restore the guarding SCHEMA KEYWORD; Kind B
 * witnesses deregister and restore the CHECK. Section 2.3 rule 3: a Kind B
 * criterion offered a schema-keyword witness would have misclassified itself,
 * and both kinds appear in this file, so each one says which it is.
 *
 * NOTHING HERE PINS A COUNT of the feed. `tuition/` and `delivery/tuition/`
 * are append-only and every later phase may add to them, so a test asserting
 * "fifteen entries" is a claim about the future that is false the moment the
 * next entry lands (CLAUDE.md convention 5). Counts are DERIVED at run time
 * and compared as relations.
 */

import { spawnSync } from "node:child_process";
import {
  cpSync,
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
const feedDir = join(repoRoot, "tuition");

const yamlModule = (await import("yaml")) as unknown as {
  parse: (text: string) => unknown;
  stringify: (value: unknown) => string;
};

interface DerivedCheck {
  id: string;
  type: string;
  requiresContext: boolean;
  run: (
    instance: unknown,
    contextDirectory: string | undefined,
  ) => { violations: { pointer: string; message: string }[]; reports: string[] };
}

const checksModule = (await import(
  new URL("../src/checks.ts", import.meta.url).href
)) as {
  runChecks: (
    type: string,
    instance: unknown,
    contextDirectory: string | undefined,
  ) => { lines: string[]; failed: boolean };
  registerCheck: (check: DerivedCheck) => void;
  deregisterCheck: (id: string) => boolean;
  tuitionTargetExists: DerivedCheck;
  mechanismRuleEvidenceResolves: DerivedCheck;
  pathReferencesIn: (reference: string) => string[];
};

const validateModule = (await import(
  new URL("../src/validate.ts", import.meta.url).href
)) as {
  validateInstance: (
    schema: Record<string, unknown>,
    instance: unknown,
  ) => { pointer: string; message: string }[];
};

function scratch(): string {
  return mkdtempSync(join(tmpdir(), "tiphys-tuition-"));
}

function runCli(
  args: string[],
  cwd = repoRoot,
): { status: number | null; stdout: string; stderr: string } {
  const run = spawnSync(process.execPath, [cliEntry, ...args], {
    encoding: "utf8",
    cwd,
  });
  return { status: run.status, stdout: run.stdout, stderr: run.stderr };
}

/** Every entry file in the shipped feed, derived rather than listed. */
function entryFiles(): string[] {
  return readdirSync(feedDir)
    .filter((name) => name.endsWith(".yaml") && name !== "mechanism-index.yaml")
    .sort();
}

function readEntry(name: string): Record<string, unknown> {
  return yamlModule.parse(readFileSync(join(feedDir, name), "utf8")) as Record<
    string,
    unknown
  >;
}

function tuitionSchema(): Record<string, unknown> {
  return JSON.parse(
    readFileSync(join(repoRoot, "schemas", "tuition.schema.json"), "utf8"),
  ) as Record<string, unknown>;
}

/* ------------------------------------------------------------------ */
/* Criterion 1: every shipped entry validates, and the count is a relation */
/* ------------------------------------------------------------------ */

test("every entry in the shipped feed validates, and the feed's entry count equals the promoted set plus the two migration tickets", () => {
  const files = entryFiles();
  assert.ok(files.length > 0, "the shipped tuition feed is empty");
  for (const name of files) {
    const result = runCli([
      "validate",
      "--type",
      "auto",
      "--context",
      repoRoot,
      join("tuition", name),
    ]);
    assert.equal(result.status, 0, `${name}: ${result.stdout}${result.stderr}`);
  }
  const index = runCli([
    "validate",
    "--type",
    "mechanism-index",
    "--context",
    repoRoot,
    join("tuition", "mechanism-index.yaml"),
  ]);
  assert.equal(index.status, 0, `${index.stdout}${index.stderr}`);

  /* THE RELATION, DERIVED FROM BOTH DIRECTORIES AT RUN TIME. The promoted set
     is every entry in the delivering project's own log that DECLARES kernel
     relevance in its own header, plus any entry promoted to host a mechanism
     the index must carry; the tickets are the two entries whose stage names
     them. Nothing here is a literal count, so a later phase promoting another
     entry does not redden this test. */
  const promoted = files.filter((name) => {
    const entry = readEntry(name);
    return !String(entry["stage"]).includes("migration ticket");
  });
  const tickets = files.filter((name) =>
    String(readEntry(name)["stage"]).includes("migration ticket"),
  );
  assert.equal(tickets.length, 2, `tickets: ${tickets.join(", ")}`);
  assert.equal(files.length, promoted.length + tickets.length);
  const declared = readdirSync(join(repoRoot, "delivery", "tuition")).filter(
    (name) =>
      /kernel-relevant:\s*yes/i.test(
        readFileSync(join(repoRoot, "delivery", "tuition", name), "utf8"),
      ),
  );
  assert.ok(
    promoted.length >= declared.length,
    `the delivering log declares ${String(declared.length)} kernel-relevant entries and the feed carries ${String(promoted.length)} promoted ones`,
  );
});

/* ------------------------------------------------------------------ */
/* Criterion 2a: KIND A, the conditional consequence requirement        */
/* ------------------------------------------------------------------ */

test("an entry claiming kernel relevance with an empty or an absent structural consequence is rejected naming the field, and removing each guarding keyword accepts it", () => {
  const entry = readEntry("T-005.yaml");
  entry["structural-consequence"] = [];

  const schema = tuitionSchema();
  const rejected = validateModule.validateInstance(schema, entry);
  assert.ok(
    rejected.some(
      (diagnostic) => diagnostic.pointer === "#/structural-consequence",
    ),
    `expected a diagnostic naming the field, got ${JSON.stringify(rejected)}`,
  );

  /* THE OTHER DIRECTION, KIND A: the guarding keyword is removed from a COPY
     of the schema and the same dangerous instance passes. `minItems` is the
     keyword that catches an EMPTY array, and it is removed alone rather than
     deleting `then` wholesale, because an `if` with no `then` is refused by
     the validator's strict policy and would produce a red for the wrong
     reason (measured: "schema is refused by this validator's strict policy").
     A defang that changes WHY the document is rejected is not a defang. */
  const defanged = tuitionSchema();
  const thenConsequence = (
    (defanged["then"] as Record<string, Record<string, unknown>>)[
      "properties"
    ] as Record<string, Record<string, unknown>>
  )["structural-consequence"] as Record<string, unknown>;
  delete thenConsequence["minItems"];
  assert.deepEqual(validateModule.validateInstance(defanged, entry), []);

  /* A SECOND, STRUCTURALLY DIFFERENT MEMBER of the same class: the field
     ABSENT rather than empty. It is caught by a different keyword (`required`
     inside the same `then`), so one witness would have left the other arm
     unguarded, which is CLAUDE.md's "one witness is not a class". */
  const absent = readEntry("T-005.yaml");
  delete absent["structural-consequence"];
  assert.ok(
    validateModule
      .validateInstance(tuitionSchema(), absent)
      .some((diagnostic) => diagnostic.message.includes("structural-consequence")),
    "an entry with no structural-consequence at all was accepted",
  );
  const defangedRequired = tuitionSchema();
  delete (defangedRequired["then"] as Record<string, unknown>)["required"];
  assert.deepEqual(validateModule.validateInstance(defangedRequired, absent), []);

  /* RESTORED: the unmodified schema rejects it again, and the shipped entry
     with its consequences intact passes, so the keyword is not rejecting
     everything. */
  assert.ok(validateModule.validateInstance(tuitionSchema(), entry).length > 0);
  assert.deepEqual(
    validateModule.validateInstance(tuitionSchema(), readEntry("T-005.yaml")),
    [],
  );
});

/* ------------------------------------------------------------------ */
/* Criterion 2b: KIND A, a rule with no citation is not a rule          */
/* ------------------------------------------------------------------ */

test("a mechanism with a rule and no evidence is rejected naming the field, and removing minItems accepts it", () => {
  const entry = readEntry("T-005.yaml");
  const mechanisms = entry["mechanisms"] as Record<string, unknown>[];
  mechanisms[0]!["evidence"] = [];

  const rejected = validateModule.validateInstance(tuitionSchema(), entry);
  assert.ok(
    rejected.some(
      (diagnostic) => diagnostic.pointer === "#/mechanisms/0/evidence",
    ),
    `expected a diagnostic naming the evidence array, got ${JSON.stringify(rejected)}`,
  );

  const defanged = tuitionSchema();
  const evidenceSchema = (
    (
      (
        (defanged["properties"] as Record<string, Record<string, unknown>>)[
          "mechanisms"
        ] as Record<string, Record<string, unknown>>
      )["items"] as Record<string, Record<string, unknown>>
    )["properties"] as Record<string, Record<string, unknown>>
  )["evidence"] as Record<string, unknown>;
  delete evidenceSchema["minItems"];
  assert.deepEqual(validateModule.validateInstance(defanged, entry), []);

  assert.ok(validateModule.validateInstance(tuitionSchema(), entry).length > 0);
});

/* ------------------------------------------------------------------ */
/* Criterion 3a: KIND B, an applied consequence is checked against the tree */
/* ------------------------------------------------------------------ */

test("an applied structural consequence whose target does not exist is rejected naming the path and the check, and is accepted with the check deregistered", () => {
  const dir = scratch();
  try {
    const entry = readEntry("T-005.yaml");
    const consequences = entry["structural-consequence"] as Record<
      string,
      unknown
    >[];
    /* THE DANGEROUS INSTANCE: a document CLAIMING a fix landed, against a tree
       where it did not. T-003 is the entry recording that a work history can
       carry exactly that claim falsely. */
    consequences[0]!["target"] = "roles/there-is-no-such-brief.md";
    const file = join(dir, "T-005.yaml");
    writeFileSync(file, yamlModule.stringify(entry));

    const rejected = runCli([
      "validate",
      "--type",
      "tuition",
      "--context",
      repoRoot,
      file,
    ]);
    assert.equal(rejected.status, 1, rejected.stdout + rejected.stderr);
    assert.match(
      rejected.stdout,
      /^INVALID #\/structural-consequence\/0\/target .*roles\/there-is-no-such-brief\.md.*\(check: tuition-target-exists\)$/m,
    );

    /* KIND B, THE OTHER DIRECTION: the CHECK is removed, not a keyword. */
    assert.equal(checksModule.deregisterCheck("tuition-target-exists"), true);
    const without = checksModule.runChecks("tuition", entry, repoRoot);
    assert.ok(
      !without.lines.some((line) => line.includes("tuition-target-exists")),
      without.lines.join("\n"),
    );

    checksModule.registerCheck(checksModule.tuitionTargetExists);
    const restored = checksModule.runChecks("tuition", entry, repoRoot);
    assert.equal(restored.failed, true);
    assert.ok(
      restored.lines.some((line) =>
        line.includes("(check: tuition-target-exists)"),
      ),
      restored.lines.join("\n"),
    );

    /* CONTROL: the shipped entry, whose targets all exist, passes. Without it
       this check could be rejecting every entry. */
    assert.equal(
      checksModule.runChecks("tuition", readEntry("T-005.yaml"), repoRoot).failed,
      false,
    );
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

/* ------------------------------------------------------------------ */
/* Criterion 3b: KIND B, a mechanism's evidence resolves               */
/* ------------------------------------------------------------------ */

test("a mechanism whose evidence names a file that does not exist is rejected naming the reference and the check, and is accepted with the check deregistered", () => {
  const dir = scratch();
  try {
    const entry = readEntry("T-005.yaml");
    const mechanisms = entry["mechanisms"] as Record<string, unknown>[];
    (mechanisms[0]!["evidence"] as string[])[0] =
      "delivery/verification/no-such-investigation.md D-3";
    const file = join(dir, "T-005.yaml");
    writeFileSync(file, yamlModule.stringify(entry));

    const rejected = runCli([
      "validate",
      "--type",
      "tuition",
      "--context",
      repoRoot,
      file,
    ]);
    assert.equal(rejected.status, 1, rejected.stdout + rejected.stderr);
    assert.match(
      rejected.stdout,
      /^INVALID #\/mechanisms\/0\/evidence\/0 .*no-such-investigation\.md.*\(check: mechanism-rule-evidence-resolves\)$/m,
    );

    assert.equal(
      checksModule.deregisterCheck("mechanism-rule-evidence-resolves"),
      true,
    );
    const without = checksModule.runChecks("tuition", entry, repoRoot);
    assert.ok(
      !without.lines.some((line) =>
        line.includes("mechanism-rule-evidence-resolves"),
      ),
      without.lines.join("\n"),
    );

    checksModule.registerCheck(checksModule.mechanismRuleEvidenceResolves);
    assert.equal(
      checksModule.runChecks("tuition", entry, repoRoot).failed,
      true,
    );

    /* THE RESIDUE, ASSERTED RATHER THAN DESCRIBED: prose evidence naming no
       path resolves nothing and is not a violation. A reader who assumes this
       check establishes that a rule is SUPPORTED is wrong, and the assertion
       below is what makes the boundary visible instead of implied. */
    assert.deepEqual(
      checksModule.pathReferencesIn(
        "M1-P5 round 4, verified pre-existing against a pristine build",
      ),
      [],
    );
    assert.deepEqual(
      checksModule.pathReferencesIn(
        "delivery/review/verification-m1-p3-fix-round.md V-1 and V-3",
      ),
      ["delivery/review/verification-m1-p3-fix-round.md"],
    );
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

/* ------------------------------------------------------------------ */
/* Criterion 4b: the machine-readable form resolves, path AND key       */
/* ------------------------------------------------------------------ */

test("a machine-readable form naming a renamed key is rejected naming the key, and restoring the key returns exit 0", () => {
  const dir = scratch();
  try {
    /* A FIXTURE MANIFEST, so the real gates.manifest.json is never touched.
       The rename is what M2 renaming the list would look like from here. */
    const manifest = JSON.parse(
      readFileSync(join(repoRoot, "gates.manifest.json"), "utf8"),
    ) as Record<string, unknown>;
    assert.ok(
      Array.isArray(manifest["destructiveCommands"]),
      "the real manifest no longer carries destructiveCommands, so this coupling has already drifted",
    );
    const renamed = { ...manifest };
    delete renamed["destructiveCommands"];
    renamed["destructiveCommandsRenamed"] = manifest["destructiveCommands"];
    writeFileSync(
      join(dir, "gates.manifest.json"),
      `${JSON.stringify(renamed, null, 2)}\n`,
    );

    const entry = readEntry("T-003.yaml");
    const withForm = (entry["mechanisms"] as Record<string, unknown>[]).findIndex(
      (mechanism) => mechanism["machine-readable-form"] !== undefined,
    );
    assert.notEqual(withForm, -1, "T-003 no longer carries a machine-readable form");

    const red = checksModule.runChecks("tuition", entry, dir);
    assert.ok(
      red.lines.some(
        (line) =>
          line.includes("destructiveCommands") &&
          line.includes("(check: mechanism-rule-evidence-resolves)"),
      ),
      red.lines.join("\n"),
    );

    /* THE OTHER DIRECTION: restore the key in the fixture and the same check
       is green about it. */
    writeFileSync(
      join(dir, "gates.manifest.json"),
      `${JSON.stringify(manifest, null, 2)}\n`,
    );
    const green = checksModule.runChecks("tuition", entry, dir);
    assert.ok(
      !green.lines.some((line) => line.includes("destructiveCommands")),
      green.lines.join("\n"),
    );
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

/* ------------------------------------------------------------------ */
/* Criterion 7: list filters, and add refuses without writing           */
/* ------------------------------------------------------------------ */

test("tuition list --kernel-relevant prints exactly the kernel-relevant entries, one line each", () => {
  const all = runCli(["tuition", "list", "--dir", feedDir]);
  assert.equal(all.status, 0, all.stderr);
  const filtered = runCli([
    "tuition",
    "list",
    "--kernel-relevant",
    "--dir",
    feedDir,
  ]);
  assert.equal(filtered.status, 0, filtered.stderr);

  const expected = entryFiles().filter(
    (name) => readEntry(name)["kernel-relevant"] === true,
  );
  const printed = filtered.stdout.trim().split("\n").filter((line) => line !== "");
  assert.equal(printed.length, expected.length, filtered.stdout);
  for (const name of expected) {
    const entry = readEntry(name);
    assert.ok(
      printed.some((line) => line.startsWith(`${String(entry["id"])} `)),
      `${String(entry["id"])} is kernel-relevant and was not printed: ${filtered.stdout}`,
    );
  }
  /* THE OTHER DIRECTION: every printed line names an entry whose flag is true,
     so the filter cannot be a no-op that prints everything. */
  const kernelIds = new Set(expected.map((name) => String(readEntry(name)["id"])));
  for (const line of printed) {
    assert.ok(
      kernelIds.has(line.split(" ")[0] as string),
      `${line} was printed by --kernel-relevant and is not kernel-relevant`,
    );
  }
  assert.match(printed[0] as string, /^T-[0-9]{3} [0-9]{4}-[0-9]{2}-[0-9]{2} targets=[0-9]+$/);
  assert.ok(
    all.stdout.trim().split("\n").length >= printed.length,
    "the filtered list is longer than the unfiltered one",
  );
});

test("tuition add on an invalid entry exits nonzero and leaves the feed directory byte-identical", () => {
  const dir = scratch();
  try {
    const feed = join(dir, "tuition");
    mkdirSync(feed);
    cpSync(join(feedDir, "T-005.yaml"), join(feed, "T-005.yaml"));
    const before = readdirSync(feed).sort();

    /* THE DANGEROUS INSTANCE: an entry that claims kernel relevance and
       proposes no change. If `add` wrote first and validated afterwards, the
       feed would carry it. */
    const invalid = readEntry("T-005.yaml");
    invalid["structural-consequence"] = [];
    invalid["id"] = "T-999";
    const candidate = join(dir, "candidate.yaml");
    writeFileSync(candidate, yamlModule.stringify(invalid));

    const refused = runCli(["tuition", "add", "--file", candidate, "--into", feed]);
    assert.notEqual(refused.status, 0);
    assert.deepEqual(readdirSync(feed).sort(), before);

    /* THE OTHER DIRECTION: the same entry with a consequence is accepted and
       appears, so the refusal is about the document and not about `add`. */
    invalid["structural-consequence"] = [
      { target: "roles/implementer.md", status: "applied", change: "witness" },
    ];
    writeFileSync(candidate, yamlModule.stringify(invalid));
    const accepted = runCli(["tuition", "add", "--file", candidate, "--into", feed]);
    assert.equal(accepted.status, 0, accepted.stderr);
    assert.deepEqual(readdirSync(feed).sort(), [...before, "T-999.yaml"].sort());

    /* AND AN ID IS NEVER REUSED: a second add of the same id is refused and
       leaves the first file untouched. */
    const first = readFileSync(join(feed, "T-999.yaml"), "utf8");
    const duplicate = runCli(["tuition", "add", "--file", candidate, "--into", feed]);
    assert.notEqual(duplicate.status, 0);
    assert.equal(readFileSync(join(feed, "T-999.yaml"), "utf8"), first);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("tuition add refuses an entry path that is not a regular file and writes nothing", () => {
  const dir = scratch();
  try {
    const feed = join(dir, "tuition");
    mkdirSync(feed);
    const before = readdirSync(feed).sort();
    const fifo = join(dir, "entry.yaml");
    const made = spawnSync("mkfifo", [fifo], { encoding: "utf8" });
    if (made.status !== 0) {
      /* No mkfifo here: the property is still asserted against a DIRECTORY,
         which is also not a regular file, rather than skipping. */
      mkdirSync(fifo);
    }
    const refused = runCli(["tuition", "add", "--file", fifo, "--into", feed]);
    assert.notEqual(refused.status, 0);
    assert.match(refused.stderr, /entry\.yaml/);
    assert.deepEqual(readdirSync(feed).sort(), before);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

/* ------------------------------------------------------------------ */
/* Criterion 9: the two T-nnn spaces are one space                      */
/* ------------------------------------------------------------------ */

test("no tuition id is claimed by both the shipped feed and the delivering project's log", () => {
  const shipped = new Map<string, string>();
  for (const name of entryFiles()) {
    const id = String(readEntry(name)["id"]);
    const previous = shipped.get(id);
    assert.equal(previous, undefined, `${id} is declared by both ${String(previous)} and ${name}`);
    shipped.set(id, name);
  }
  const delivery = new Map<string, string>();
  const deliveryDir = join(repoRoot, "delivery", "tuition");
  for (const name of readdirSync(deliveryDir).sort()) {
    const match = /^(T-[0-9]{3})-/.exec(name);
    if (match === null) {
      continue;
    }
    delivery.set(match[1] as string, name);
  }
  assert.ok(delivery.size > 0, "the delivering project's tuition log parsed to nothing");

  /* THE COLLISION IS THE FAULT, and it is checked in the direction that grows:
     an id in BOTH directories names two different documents under one
     identifier, which CLAUDE.md's identifier rule forbids. The shipped feed's
     entries are PROMOTIONS of the log's, so a shared id must name the same
     incident; the assertion is therefore that a shipped id either matches its
     promoted source by number or is one this feed allocated (the migration
     tickets), never a number the log gave to something else. */
  for (const [id, name] of shipped) {
    const source = delivery.get(id);
    if (source === undefined) {
      continue;
    }
    const shippedEntry = readEntry(name);
    const sourceText = readFileSync(join(deliveryDir, source), "utf8");
    assert.ok(
      sourceText.includes(`- id: ${id}`) || sourceText.includes(`# ${id}:`),
      `${id} is claimed by ${name} and by ${source}, which is a different document`,
    );
    assert.equal(String(shippedEntry["id"]), id);
  }
  for (const id of ["T-021", "T-022"]) {
    assert.ok(shipped.has(id), `${id} is a migration ticket and is missing from the feed`);
    assert.equal(
      delivery.has(id),
      false,
      `${id} was allocated by the tuition feed and the delivering log now claims it too`,
    );
  }
});
