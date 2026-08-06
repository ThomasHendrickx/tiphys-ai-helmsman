import { strict as assert } from "node:assert";
import { spawnSync } from "node:child_process";
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  utimesSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";

/**
 * Unit import through a computed URL: a literal relative import from test/
 * into src/ crosses the project-reference boundary and fails the build under
 * rewriteRelativeImportExtensions (TS2878, CLAUDE.md warning 4).
 *
 * MEASURED, not inherited: the first version of this file used the computed
 * URL for the VALUES and a literal `import type` for the types, and the build
 * failed with TS2878 pointing at the type import. The rule is about the
 * import PATH, so a type-only import is not exempt, and the types are
 * therefore restated here.
 */
interface PinFile {
  path: string;
  sha256: string;
  size: number;
  mtimeMs: number;
}
interface Pin {
  roots: string[];
  takenAt: string;
  files: PinFile[];
}
type PinDifference =
  | { path: string; kind: "added" }
  | { path: string; kind: "removed" }
  | { path: string; kind: "changed"; fields: string[] };

const { comparePins, takePin } = (await import(
  new URL("../src/gates/pin.ts", import.meta.url).href
)) as {
  takePin: (roots: string[]) => Pin;
  comparePins: (a: Pin, b: Pin) => PinDifference[];
};

function scratch(): string {
  return mkdtempSync(join(tmpdir(), "tiphys-pin-"));
}

/**
 * A BYTE-IDENTICAL REWRITE. This is the T-004 shape, not a convenient
 * fixture: the incident's forensics describe `src/lock.ts` being replaced
 * with PRISTINE content 42.8 seconds into a failing run. The content hash
 * is unchanged by construction (the same bytes are written back), so a
 * content-only pin passes it, and every value the pin has would be lost at
 * exactly the shape the incident had.
 */
function byteIdenticalRewrite(path: string): void {
  const body = readFileSync(path);
  writeFileSync(path, body);
  const later = Date.now() / 1000 + 5;
  utimesSync(path, later, later);
}

test("a byte-identical rewrite that changes only mtime is one difference naming the path and mtimeMs, and no rewrite is none", () => {
  const dir = scratch();
  try {
    const root = join(dir, "src");
    mkdirSync(root);
    writeFileSync(join(root, "a.ts"), "export const a = 1;\n");
    writeFileSync(join(root, "b.ts"), "export const b = 2;\n");

    // DIRECTION 1: nothing happens between the pins.
    const quietStart = takePin([root]);
    const quietEnd = takePin([root]);
    assert.deepEqual(comparePins(quietStart, quietEnd), []);

    // DIRECTION 2: the dangerous state. Same bytes back, new mtime.
    const start = takePin([root]);
    byteIdenticalRewrite(join(root, "a.ts"));
    const end = takePin([root]);

    const differences = comparePins(start, end);
    assert.equal(differences.length, 1);
    const only = differences[0] as PinDifference;
    assert.equal(only.path, join(root, "a.ts"));
    assert.equal(only.kind, "changed");
    assert.deepEqual(
      only.kind === "changed" ? only.fields : [],
      ["mtimeMs"],
    );

    // The content hash really is unchanged: this is what makes the witness
    // a witness rather than a restatement of "the file changed".
    const before = start.files.find((f) => f.path === join(root, "a.ts"));
    const after = end.files.find((f) => f.path === join(root, "a.ts"));
    assert.equal(before?.sha256, after?.sha256);
    assert.equal(before?.size, after?.size);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("comparePins reports added and removed paths", () => {
  const dir = scratch();
  try {
    const root = join(dir, "src");
    mkdirSync(root);
    writeFileSync(join(root, "kept.ts"), "kept\n");
    writeFileSync(join(root, "gone.ts"), "gone\n");
    const start = takePin([root]);

    rmSync(join(root, "gone.ts"));
    writeFileSync(join(root, "new.ts"), "new\n");
    const end = takePin([root]);

    const differences = comparePins(start, end);
    assert.deepEqual(
      differences.map((d) => `${d.kind} ${d.path}`).sort(),
      [
        `added ${join(root, "new.ts")}`,
        `removed ${join(root, "gone.ts")}`,
      ].sort(),
    );
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

/**
 * M2-C-6 at the pin. The dangerous state is a REAL named pipe, made with
 * mkfifo, not a stand-in: opening one with no peer blocks in the kernel and
 * no try/catch sees it, so the only way to demonstrate the guard is to place
 * one and observe that the call RETURNS.
 */
test("takePin refuses a named pipe inside a root naming the path and the type", () => {
  const dir = scratch();
  try {
    const root = join(dir, "src");
    mkdirSync(root);
    writeFileSync(join(root, "ok.ts"), "fine\n");

    const made = spawnSync("mkfifo", [join(root, "beacon")], {
      encoding: "utf8",
    });
    assert.equal(made.status, 0, `mkfifo failed: ${made.stderr}`);

    // The assertion below only executes because the call RETURNED. A guard
    // that opened the pipe would hang here and the harness timeout would
    // report a code rather than this line failing.
    assert.throws(
      () => takePin([root]),
      (error: Error) => {
        assert.match(error.message, /beacon/);
        assert.match(error.message, /named pipe/);
        return true;
      },
    );

    // BOTH DIRECTIONS: with the same path as a regular file the pin is taken.
    rmSync(join(root, "beacon"));
    writeFileSync(join(root, "beacon"), "now a regular file\n");
    const pin = takePin([root]);
    assert.equal(pin.files.length, 2);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
