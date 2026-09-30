import { strict as assert } from "node:assert";
import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const checker = fileURLToPath(new URL("../scripts/check-authored-bytes.mjs", import.meta.url));

function repository(files: Record<string, Buffer | string>): string {
  const root = mkdtempSync(join(tmpdir(), "tiphys-authored-bytes-"));
  assert.equal(spawnSync("git", ["init", "-q"], { cwd: root }).status, 0);
  for (const [path, bytes] of Object.entries(files)) {
    mkdirSync(join(root, path, ".."), { recursive: true });
    writeFileSync(join(root, path), bytes);
  }
  assert.equal(spawnSync("git", ["add", "-A"], { cwd: root }).status, 0);
  return root;
}

function run(root: string) {
  return spawnSync(process.execPath, [checker], { cwd: root, encoding: "utf8" });
}

function writeBlob(root: string, contents: string): string {
  const result = spawnSync("git", ["hash-object", "-w", "--stdin"], {
    cwd: root,
    input: contents,
    encoding: "utf8",
  });
  assert.equal(result.status, 0, result.stderr);
  return result.stdout.trim();
}

test("authored-byte checker rejects NUL SOH and non-ASCII tracked bytes", () => {
  const root = repository({
    "nul.txt": Buffer.from([0x61, 0x00, 0x62]),
    "soh.txt": Buffer.from([0x01]),
    "unicode.txt": Buffer.from([0xc3, 0xa9]),
  });
  const result = run(root);
  assert.equal(result.status, 1);
  assert.match(result.stderr, /nul\.txt:1: control byte 0x00/);
  assert.match(result.stderr, /soh\.txt:0: control byte 0x01/);
  assert.match(result.stderr, /unicode\.txt:0: non-ASCII byte 0xc3/);
});

test("authored-byte checker accepts ordinary tracked ASCII", () => {
  const result = run(repository({ "ordinary.txt": "plain ASCII\n" }));
  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.stderr, "");
});

test("authored-byte checker exempts only the owner input and vendored fixture paths", () => {
  const exempt = repository({
    "delivery/intake/orchestrated-delivery-process.md": Buffer.from([0x00, 0xc3]),
    "test/fixtures/json-schema-test-suite/example.json": Buffer.from([0x01, 0xff]),
  });
  assert.equal(run(exempt).status, 0);

  const nearMiss = repository({
    "delivery/intake/other.md": Buffer.from([0x00]),
    "test/fixtures/json-schema-test-suite-near/example.json": Buffer.from([0x01]),
  });
  const result = run(nearMiss);
  assert.equal(result.status, 1);
  assert.match(result.stderr, /delivery\/intake\/other\.md/);
  assert.match(result.stderr, /json-schema-test-suite-near/);
});

test("authored-byte checker reads tracked symlink text without following its target", () => {
  const root = repository({});
  const outside = join(dirname(root), "tiphys-authored-bytes-outside");
  writeFileSync(outside, Buffer.from([0x00]));
  symlinkSync(outside, join(root, "outside-link"));
  symlinkSync("missing-\u00e9", join(root, "broken-link"));
  assert.equal(spawnSync("git", ["add", "-A"], { cwd: root }).status, 0);

  const result = run(root);
  assert.equal(result.status, 1, result.stderr);
  assert.doesNotMatch(result.stderr, /outside-link/);
  assert.match(result.stderr, /broken-link:8: non-ASCII byte 0xc3/);
});

test("authored-byte checker fails closed on an unmerged index", () => {
  const root = repository({});
  const base = writeBlob(root, "base\n");
  const ours = writeBlob(root, "ours\n");
  const theirs = writeBlob(root, "theirs\n");
  const index = [
    `100644 ${base} 1\tconflicted.txt`,
    `100644 ${ours} 2\tconflicted.txt`,
    `100644 ${theirs} 3\tconflicted.txt`,
    "",
  ].join("\n");
  const update = spawnSync("git", ["update-index", "--index-info"], {
    cwd: root,
    input: index,
    encoding: "utf8",
  });
  assert.equal(update.status, 0, update.stderr);

  const result = run(root);
  assert.equal(result.status, 2, result.stderr);
  assert.match(result.stderr, /unsupported index entry/);
});

test("authored-byte checker refuses tracked worktree bytes that differ from the index", () => {
  const root = repository({ "tracked.txt": "plain ASCII\n" });
  writeFileSync(join(root, "tracked.txt"), Buffer.from([0x00]));

  const result = run(root);
  assert.equal(result.status, 2, result.stderr);
  assert.match(result.stderr, /tracked working tree differs from the index/);
});

/* ------------------------------------------------------------------ */
/* M6-P3: the check is a registry gate on both CI events                 */
/* ------------------------------------------------------------------ */

const FIXTURE_GIT_ENV = {
  GIT_AUTHOR_NAME: "fixture",
  GIT_AUTHOR_EMAIL: "fixture@example.invalid",
  GIT_COMMITTER_NAME: "fixture",
  GIT_COMMITTER_EMAIL: "fixture@example.invalid",
};

function runAsGate(root: string): { status: number | null; record: { status: string; units: number; detail: string } } {
  const out = mkdtempSync(join(tmpdir(), "tiphys-authored-bytes-gate-"));
  const run = spawnSync(
    process.execPath,
    [checker, "--result", join(out, "result.json"), "--evidence", join(out, "evidence")],
    { cwd: root, encoding: "utf8" },
  );
  const record = JSON.parse(readFileSync(join(out, "result.json"), "utf8")) as {
    status: string;
    units: number;
    detail: string;
  };
  return { status: run.status, record };
}

test("the authored-bytes registry gate records red naming the byte on a control character and green counting the tracked files on a clean tree, on both CI events", async () => {
  const clean = repository({ "a.md": "plain ASCII\n", "b.ts": "export const b = 1;\n" });
  assert.equal(
    spawnSync("git", ["commit", "-q", "-m", "fixture"], { cwd: clean, env: { ...process.env, ...FIXTURE_GIT_ENV } }).status,
    0,
  );
  const green = runAsGate(clean);
  assert.equal(green.status, 0, green.record.detail);
  assert.equal(green.record.status, "green");
  assert.equal(green.record.units, 2);

  const dirty = repository({ "a.md": "plain ASCII\n", "notes.md": Buffer.from([0x61, 0x00, 0x62, 0x0a]) });
  const red = runAsGate(dirty);
  assert.equal(red.status, 1, red.record.detail);
  assert.equal(red.record.status, "red");
  assert.match(red.record.detail, /notes\.md:1: control byte 0x00/);

  /* AND THE REGISTRY RUNS IT ON BOTH EVENTS: the push arm is where a byte
     that arrived on `main` by a merge is caught (T-009). */
  const registry = (await import("yaml")).parse(
    readFileSync(fileURLToPath(new URL("../gate-registry.yaml", import.meta.url)), "utf8"),
  ) as { gates: { id: string; command?: string[]; applicability: string; events: string[] }[] };
  const entry = registry.gates.find((gate) => gate.id === "authored-bytes");
  assert.ok(entry !== undefined, "gate-registry.yaml declares no authored-bytes gate");
  assert.deepEqual(entry.command, ["node", "scripts/check-authored-bytes.mjs"]);
  assert.equal(entry.applicability, "required");
  assert.deepEqual([...entry.events].sort(), ["pull_request", "push"]);
});
