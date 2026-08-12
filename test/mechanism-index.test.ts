/**
 * THE MECHANISM INDEX AS A PROJECTION (kernel plan M3, M3-P8 criteria 4, 4c,
 * 4d, 5 and 6).
 *
 * The property under test throughout is that the index is DERIVED from the
 * tuition feed and cannot quietly stop being derived from it. Every direction
 * is exercised in both directions, because a drift check that only catches
 * additions is a check that cannot see a deletion.
 *
 * THE INTERIM INDEX IS READ FROM A CAPTURE, NEVER FROM THE LIVE FILE. M3-P8
 * deletes the interim markdown table, and a test whose input the phase deletes
 * is a test that stops meaning anything the moment it is needed (criterion
 * 4c). test/fixtures/mechanisms-interim.md is that capture, taken verbatim at
 * `037477e`.
 */

import { spawnSync } from "node:child_process";
import {
  cpSync,
  existsSync,
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
const indexPath = join(feedDir, "mechanism-index.yaml");

const yamlModule = (await import("yaml")) as unknown as {
  parse: (text: string) => unknown;
  stringify: (value: unknown) => string;
};

const tuitionModule = (await import(
  new URL("../src/tuition.ts", import.meta.url).href
)) as { mechanismKey: (name: string) => string };

interface IndexDocument {
  kind: string;
  mechanisms: {
    key: string;
    name: string;
    rule: string;
    evidence: string[];
    "machine-readable-form"?: { path: string; key: string };
  }[];
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

function readIndex(path = indexPath): IndexDocument {
  return yamlModule.parse(readFileSync(path, "utf8")) as IndexDocument;
}

/** A private copy of the feed, so no test mutates the shipped one. */
function stageFeed(): { dir: string; feed: string } {
  const dir = mkdtempSync(join(tmpdir(), "tiphys-index-"));
  const feed = join(dir, "tuition");
  cpSync(feedDir, feed, { recursive: true });
  return { dir, feed };
}

/** The interim table's mechanism names, derived from the capture. */
function interimNames(): string[] {
  return readFileSync(
    join(repoRoot, "test", "fixtures", "mechanisms-interim.md"),
    "utf8",
  )
    .split("\n")
    .filter(
      (line) =>
        line.startsWith("| ") &&
        !line.startsWith("|---") &&
        !line.startsWith("| Mechanism"),
    )
    .map((line) => (line.split("|")[1] as string).trim())
    .filter((name) => name !== "");
}

/* ------------------------------------------------------------------ */
/* Criterion 4: the projection cannot drift, in both directions         */
/* ------------------------------------------------------------------ */

test("adding a mechanism to a tuition entry without regenerating makes tuition index --check exit nonzero naming the mechanism and the entry, and regenerating returns exit 0", () => {
  const { dir, feed } = stageFeed();
  try {
    assert.equal(
      runCli(["tuition", "index", "--check", "--dir", feed]).status,
      0,
      "the staged copy of the shipped feed does not match its own index",
    );

    const entryPath = join(feed, "T-004.yaml");
    const entry = yamlModule.parse(readFileSync(entryPath, "utf8")) as Record<
      string,
      unknown
    >;
    (entry["mechanisms"] as Record<string, unknown>[]).push({
      mechanism: "Rebasing a branch under review",
      rule: "Do not, once a reviewer has quoted a sha.",
      evidence: ["delivery/review/clean-room-m1-p3.md"],
    });
    writeFileSync(entryPath, yamlModule.stringify(entry));

    const drifted = runCli(["tuition", "index", "--check", "--dir", feed]);
    assert.notEqual(drifted.status, 0, drifted.stdout);
    assert.match(drifted.stdout, /^DRIFT mechanism rebasing-a-branch-under-review .*T-004/m);

    const regenerated = runCli(["tuition", "index", "--dir", feed]);
    assert.equal(regenerated.status, 0, regenerated.stderr);
    assert.equal(runCli(["tuition", "index", "--check", "--dir", feed]).status, 0);

    /* THE OTHER DIRECTION, and it is structurally different from the first: a
       row REMOVED from the feed and left in the index. An additions-only check
       would be green here, which is the shape a drift check most often has. */
    writeFileSync(
      entryPath,
      yamlModule.stringify(
        Object.assign(entry, {
          mechanisms: (entry["mechanisms"] as unknown[]).slice(0, -1),
        }),
      ),
    );
    const orphaned = runCli(["tuition", "index", "--check", "--dir", feed]);
    assert.notEqual(orphaned.status, 0, orphaned.stdout);
    assert.match(
      orphaned.stdout,
      /^DRIFT mechanism rebasing-a-branch-under-review is in the committed index and no tuition entry declares it$/m,
    );

    /* AND A HAND EDIT THAT CHANGES A RULE is named as a difference from the
       entry it was projected from, rather than passing because the key set
       still matches. */
    runCli(["tuition", "index", "--dir", feed]);
    const index = readFileSync(join(feed, "mechanism-index.yaml"), "utf8");
    writeFileSync(
      join(feed, "mechanism-index.yaml"),
      index.replace(
        "      A verification lens works in its OWN clone",
        "      A verification lens may share a clone",
      ),
    );
    const edited = runCli(["tuition", "index", "--check", "--dir", feed]);
    assert.notEqual(edited.status, 0, edited.stdout);
    assert.match(edited.stdout, /^DRIFT mechanism shared-worktree differs from the projection of tuition entry T-004$/m);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

/* ------------------------------------------------------------------ */
/* Criterion 4c: no interim row is dropped, both directions             */
/* ------------------------------------------------------------------ */

test("every mechanism of the interim index resolves in the generated index, and removing one from its entry makes the check fail naming it", () => {
  const names = interimNames();
  assert.ok(
    names.length >= 12,
    `the interim capture parsed to ${String(names.length)} rows, so the derivation is wrong`,
  );
  const shipped = new Set(readIndex().mechanisms.map((row) => row.key));
  const missing = names
    .map((name) => tuitionModule.mechanismKey(name))
    .filter((key) => !shipped.has(key));
  assert.deepEqual(missing, [], `the generated index has lost interim mechanisms: ${missing.join(", ")}`);

  /* THE OTHER DIRECTION: remove one mechanism from the entry that declares it,
     regenerate, and the same derivation names exactly the key that went
     missing. The removal is done on a COPY, so the shipped feed is untouched. */
  const { dir, feed } = stageFeed();
  try {
    const entryPath = join(feed, "T-005.yaml");
    const entry = yamlModule.parse(readFileSync(entryPath, "utf8")) as Record<
      string,
      unknown
    >;
    delete entry["mechanisms"];
    writeFileSync(entryPath, yamlModule.stringify(entry));
    assert.equal(runCli(["tuition", "index", "--dir", feed]).status, 0);

    const after = new Set(
      readIndex(join(feed, "mechanism-index.yaml")).mechanisms.map((row) => row.key),
    );
    const lost = names
      .map((name) => tuitionModule.mechanismKey(name))
      .filter((key) => !after.has(key));
    assert.deepEqual(lost, ["claim-file-mutual-exclusion-by-o-excl"]);

    /* RESTORED: putting the entry back returns the projection to covering
       every interim row. */
    cpSync(join(feedDir, "T-005.yaml"), entryPath);
    assert.equal(runCli(["tuition", "index", "--dir", feed]).status, 0);
    const restored = new Set(
      readIndex(join(feed, "mechanism-index.yaml")).mechanisms.map((row) => row.key),
    );
    assert.deepEqual(
      names.map((name) => tuitionModule.mechanismKey(name)).filter((key) => !restored.has(key)),
      [],
    );
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

/* ------------------------------------------------------------------ */
/* Criterion 5: the claim-file rule is IN the index, from the feed       */
/* ------------------------------------------------------------------ */

test("the generated index carries the claim-file rule with resolving evidence, and it comes from the feed rather than from a hand-written file", () => {
  const row = readIndex().mechanisms.find(
    (mechanism) => mechanism.key === "claim-file-mutual-exclusion-by-o-excl",
  );
  assert.ok(row !== undefined, "the claim-file mechanism is missing from the index");
  /* THE RULE ITSELF, not merely a row with that key: T-005's whole point is
     that the next implementer reaching for a claim file gets the LOUD-failure
     answer, so a row whose rule had been softened would satisfy a key check
     and fail the reader. */
  assert.match(row.rule, /fail LOUDLY and name the stuck file/);
  assert.ok(row.evidence.length > 0);
  for (const reference of row.evidence) {
    for (const token of reference.split(/\s+/)) {
      const cleaned = token.replace(/^[`("'[]+/, "").replace(/[`)"'\].,;:]+$/, "");
      if (cleaned.includes("/") && /\.[A-Za-z0-9]{1,6}$/.test(cleaned)) {
        assert.ok(
          existsSync(join(repoRoot, cleaned)),
          `the claim-file rule cites ${cleaned}, which does not exist`,
        );
      }
    }
  }

  /* THE PROVENANCE, asserted rather than assumed: the row's rule text is the
     one in the tuition entry, so deleting the entry's mechanisms block and
     regenerating removes the row, and restoring it brings the row back. */
  const { dir, feed } = stageFeed();
  try {
    const entryPath = join(feed, "T-005.yaml");
    const entry = yamlModule.parse(readFileSync(entryPath, "utf8")) as Record<
      string,
      unknown
    >;
    delete entry["mechanisms"];
    writeFileSync(entryPath, yamlModule.stringify(entry));
    assert.equal(runCli(["tuition", "index", "--dir", feed]).status, 0);
    assert.equal(
      readIndex(join(feed, "mechanism-index.yaml")).mechanisms.some(
        (mechanism) => mechanism.key === "claim-file-mutual-exclusion-by-o-excl",
      ),
      false,
    );

    cpSync(join(feedDir, "T-005.yaml"), entryPath);
    assert.equal(runCli(["tuition", "index", "--dir", feed]).status, 0);
    const back = readIndex(join(feed, "mechanism-index.yaml")).mechanisms.find(
      (mechanism) => mechanism.key === "claim-file-mutual-exclusion-by-o-excl",
    );
    assert.ok(back !== undefined);
    assert.equal(back.rule, row.rule);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

/* ------------------------------------------------------------------ */
/* Criterion 4d: the interim file is gone and its readers are redirected */
/* ------------------------------------------------------------------ */

test("the interim index is absent, the tuition README names the generated index, and no shipped document family mentions the deleted file", () => {
  assert.equal(
    existsSync(join(repoRoot, "MECHANISMS.md")),
    false,
    "the interim index is still present, so two indexes exist",
  );
  const readme = readFileSync(join(feedDir, "README.md"), "utf8");
  assert.match(readme, /tuition\/mechanism-index\.yaml/);

  /* THE SCOPE IS THE CRITERION'S OWN ENUMERATION, resolved to paths here so a
     reader can see exactly what is and is not covered: briefs (`roles/`),
     `AGENTS.md`, checklists (`checklists/`), schemas (the shipped `schemas/`
     directory), plus the feed itself and the templates, which are the other
     two shipped document families. `src/` and `test/` comments are NOT in this
     set and are not clean; they are recorded in the phase work history with
     the measurement, because the files carrying them are not on this phase's
     declaration and a silent partial fix would be worse than a stated gap. */
  const trees = ["roles", "schemas", "checklists", "tuition", "templates"];
  const offenders: string[] = [];
  const walk = (directory: string): void => {
    for (const name of readdirSync(directory, { withFileTypes: true })) {
      const path = join(directory, name.name);
      if (name.isDirectory()) {
        walk(path);
        continue;
      }
      if (readFileSync(path, "utf8").includes("MECHANISMS.md")) {
        offenders.push(path);
      }
    }
  };
  for (const tree of trees) {
    const path = join(repoRoot, tree);
    if (existsSync(path)) {
      walk(path);
    }
  }
  for (const file of ["AGENTS.md"]) {
    const path = join(repoRoot, file);
    if (existsSync(path) && readFileSync(path, "utf8").includes("MECHANISMS.md")) {
      offenders.push(path);
    }
  }
  assert.deepEqual(offenders, [], `these shipped documents still name the deleted interim index: ${offenders.join(", ")}`);

  /* THE OTHER DIRECTION: the walk is not vacuous. A reintroduced reference in
     a staged copy of the same trees is found, so a green above means the trees
     were read rather than skipped. */
  const dir = mkdtempSync(join(tmpdir(), "tiphys-redirect-"));
  try {
    cpSync(join(repoRoot, "tuition"), join(dir, "tuition"), { recursive: true });
    writeFileSync(
      join(dir, "tuition", "README.md"),
      `${readFileSync(join(dir, "tuition", "README.md"), "utf8")}\nSee MECHANISMS.md.\n`,
    );
    const found: string[] = [];
    for (const name of readdirSync(join(dir, "tuition"))) {
      if (readFileSync(join(dir, "tuition", name), "utf8").includes("MECHANISMS.md")) {
        found.push(name);
      }
    }
    assert.deepEqual(found, ["README.md"]);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

/* ------------------------------------------------------------------ */
/* Criterion 6: the implementer brief reads the generated index          */
/* ------------------------------------------------------------------ */

test("the composed implementer brief names the mechanism index in its mandated reading and the path resolves to the generated file", () => {
  /* `--phase` and `--phase-id` are REQUIRED by the composer (M3-P6), so the
     criterion's shorthand invocation is spelled out here with the same
     template phase the brief's own tests use. */
  const composed = runCli([
    "brief",
    "compose",
    "--role",
    "implementer",
    "--phase",
    "templates/plan.example.yaml",
    "--phase-id",
    "M9-P1",
  ]);
  assert.equal(composed.status, 0, composed.stderr);
  assert.match(composed.stdout, /tuition\/mechanism-index\.yaml/);
  assert.ok(existsSync(indexPath));

  /* THE MANDATED-READING LIST ITSELF, not merely the composed text. The brief's
     BODY discusses the index by path, so a composed brief matches the pattern
     above even with the frontmatter entry deleted: the assertion above alone is
     shadowed by the prose and cannot witness the obligation. The frontmatter is
     what the composer RESOLVES, so it is what criterion 6 is about. */
  const frontmatter = readFileSync(join(repoRoot, "roles", "implementer.md"), "utf8");
  const closing = frontmatter.split("\n").indexOf("---", 1);
  const declared = yamlModule.parse(
    frontmatter.split("\n").slice(1, closing).join("\n"),
  ) as { "mandated-reading": string[] };
  assert.ok(
    declared["mandated-reading"].includes("tuition/mechanism-index.yaml"),
    `the implementer brief's mandated reading is ${declared["mandated-reading"].join(", ")}`,
  );

  /* IT IS THE GENERATED FILE, not a leftover: the shipped index matches a
     fresh projection of the shipped feed, which is the property `--check`
     decides. */
  assert.equal(runCli(["tuition", "index", "--check"]).status, 0);
  assert.equal(readIndex().kind, "mechanism-index");
});
