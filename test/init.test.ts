import { strict as assert } from "node:assert";
import { spawnSync } from "node:child_process";
import {
  existsSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  statSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const sourceEntry = fileURLToPath(new URL("../bin/tiphys.ts", import.meta.url));

function runCli(
  args: string[],
  opts: { cwd?: string; env?: NodeJS.ProcessEnv } = {},
) {
  return spawnSync(process.execPath, [sourceEntry, ...args], {
    encoding: "utf8",
    ...opts,
  });
}

function makeTempDir(t: { after(fn: () => void): void }): string {
  const dir = mkdtempSync(join(tmpdir(), "tiphys-p2-init-"));
  t.after(() => {
    rmSync(dir, { recursive: true, force: true });
  });
  return dir;
}

function gitIn(dir: string, args: string[], env?: NodeJS.ProcessEnv) {
  return spawnSync("git", ["-C", dir, ...args], { encoding: "utf8", env });
}

const FLEET_DIRS = ["charter", "decisions", "state", "tasks", "worktrees", "projects"];
const FLEET_FILES = ["backlog.md", "package.json", ".gitignore"];

test("init creates the fleet layout and a git repo with a bootstrap commit", (t) => {
  const fleet = join(makeTempDir(t), "fleet");
  const result = runCli(["init", fleet]);
  assert.equal(result.status, 0, result.stderr);
  for (const name of FLEET_DIRS) {
    assert.ok(statSync(join(fleet, name)).isDirectory(), `${name}/ missing`);
  }
  for (const name of FLEET_FILES) {
    assert.ok(statSync(join(fleet, name)).isFile(), `${name} missing`);
  }
  assert.ok(existsSync(join(fleet, ".git")), ".git missing");
  const revList = gitIn(fleet, ["rev-list", "--count", "HEAD"]);
  assert.equal(revList.status, 0, revList.stderr);
  assert.ok(Number(revList.stdout.trim()) >= 1, "no bootstrap commit");
});

test("init on an initialized fleet exits nonzero and reports already initialized", (t) => {
  const fleet = join(makeTempDir(t), "fleet");
  assert.equal(runCli(["init", fleet]).status, 0);
  const second = runCli(["init", fleet]);
  assert.notEqual(second.status, 0);
  assert.match(second.stderr, /already initialized/);
});

test("init in a cloned fleet home still exits 1 and names tiphys resume as the remedy", (t) => {
  /* M4-P16 criterion 6, and it asserts on the REMEDY TOKEN rather than on the
     exit code. The exit code was already 1 before this phase existed
     (src/commands/init.ts:84 tests a `some()` over a marker set containing
     `.git`, which a clone satisfies), so an exit-code assertion here is green
     against the dangerous state and proves nothing. What was missing is that
     the reader was told to stop without being told what to do instead, and
     `tiphys resume` is what they should run. */
  const root = makeTempDir(t);
  const origin = join(root, "origin-fleet");
  assert.equal(runCli(["init", origin]).status, 0);
  const clone = join(root, "clone");
  const cloned = gitIn(root, ["clone", "--quiet", origin, clone], {
    ...process.env,
    GIT_AUTHOR_NAME: "Tiphys Test",
    GIT_AUTHOR_EMAIL: "test@tiphys.invalid",
    GIT_COMMITTER_NAME: "Tiphys Test",
    GIT_COMMITTER_EMAIL: "test@tiphys.invalid",
  });
  assert.equal(cloned.status, 0, cloned.stderr);

  /* PRECONDITION, asserted rather than assumed: the clone really is missing
     the ephemeral directories, which is what makes it the case criterion 6 is
     about rather than an ordinary re-init. */
  for (const name of ["state", "worktrees", "projects"]) {
    assert.equal(
      existsSync(join(clone, name)),
      false,
      `precondition violated: ${name}/ came across in the clone`,
    );
  }

  const result = runCli(["init", clone]);
  assert.equal(result.status, 1, result.stdout);
  assert.match(result.stderr, /already initialized/);
  assert.match(result.stderr, /tiphys resume/);
  /* And it still refuses to write: a remedy in the message is not a licence to
     act on the directory it just declined. */
  for (const name of ["state", "worktrees", "projects"]) {
    assert.equal(existsSync(join(clone, name)), false, `init created ${name}/ after refusing`);
  }
});

test("init refuses a non-empty directory that is not a fleet home", (t) => {
  const dir = join(makeTempDir(t), "occupied");
  mkdirSync(dir);
  writeFileSync(join(dir, "unrelated.txt"), "content\n");
  const result = runCli(["init", dir]);
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /not empty/);
  assert.ok(!existsSync(join(dir, "backlog.md")), "init wrote into a refused dir");
});

test("init on a path that is an existing file exits 1 with a single reason line", (t) => {
  const filePath = join(makeTempDir(t), "occupied-file");
  writeFileSync(filePath, "content\n");
  const result = runCli(["init", filePath]);
  assert.equal(result.status, 1);
  assert.match(result.stderr, /exists and is not a directory/);
  assert.equal(
    result.stderr.trim().split("\n").length,
    1,
    `expected a single reason line, got: ${result.stderr}`,
  );
});

test("init gitignore tracks durable areas and ignores ephemera", (t) => {
  const fleet = join(makeTempDir(t), "fleet");
  assert.equal(runCli(["init", fleet]).status, 0);
  for (const ignored of ["state/anything", "worktrees/anything", "projects/anything"]) {
    const result = gitIn(fleet, ["check-ignore", ignored]);
    assert.equal(result.status, 0, `${ignored} should be ignored`);
  }
  for (const tracked of ["decisions/anything", "charter/anything"]) {
    const result = gitIn(fleet, ["check-ignore", tracked]);
    assert.equal(result.status, 1, `${tracked} should not be ignored`);
  }
});

test("init bootstrap commit uses the machine identity without global git config", (t) => {
  const tmp = makeTempDir(t);
  const home = join(tmp, "home");
  mkdirSync(home);
  const fleet = join(tmp, "fleet");
  const env: NodeJS.ProcessEnv = {
    ...process.env,
    HOME: home,
    XDG_CONFIG_HOME: join(home, ".config"),
    GIT_CONFIG_GLOBAL: join(home, "no-such-gitconfig"),
    GIT_CONFIG_SYSTEM: join(home, "no-such-system-gitconfig"),
  };
  delete env.GIT_AUTHOR_NAME;
  delete env.GIT_AUTHOR_EMAIL;
  delete env.GIT_COMMITTER_NAME;
  delete env.GIT_COMMITTER_EMAIL;
  const result = runCli(["init", fleet], { env });
  assert.equal(result.status, 0, result.stderr);
  const log = gitIn(fleet, ["log", "--format=%an|%ae|%cn|%ce", "-1"], env);
  assert.equal(log.status, 0, log.stderr);
  assert.equal(
    log.stdout.trim(),
    "Tiphys Fleet|fleet@tiphys.invalid|Tiphys Fleet|fleet@tiphys.invalid",
  );
  assert.ok(
    !existsSync(join(home, "no-such-gitconfig")),
    "a global git config file was created",
  );
  assert.deepEqual(
    readdirSync(home),
    [],
    "HOME gained files during init (global config touched)",
  );
});

test("init without a directory argument exits 64", () => {
  const result = runCli(["init"]);
  assert.equal(result.status, 64);
  assert.match(result.stderr, /usage: tiphys init/);
});

/**
 * M3-P10 step 3: the fleet-home kernel pin, replacing the M1-P2 placeholder.
 *
 * The placeholder was a DESCRIPTION field saying the pin "is added at M3 first
 * publish (kernel plan v1, M1-P2 step 2)", and its exact shape was verified
 * before it was replaced, which is what step 3 asks for.
 */
test("init writes a fleet package.json depending on the published kernel at an exact pin", (t) => {
  const fleet = join(makeTempDir(t), "fleet");
  /* THE EXIT CODE THIS ASSERTS IS GIT'S, ONE LAYER DOWN, which is why the
     witness for this behavior declares consumesExternalOutput and cites
     witness/captures/init-git-bootstrap-exit-codes.txt. `tiphys init` spawns
     `git init`, `git add -A` and `git commit`, reads ONLY their `status`, and
     returns 1 on any nonzero, so a 0 here is a claim about real git exit codes
     and not about this test's own arithmetic. The capture is real output from
     git 2.43.0 in a scratch tree and is read below rather than described, so an
     expectation that drifted from git's behaviour would redden (red-witness
     rule (f), and CLAUDE.md warning 10 on never deriving a signature from
     hand-written examples). */
  const capture = readFileSync(
    fileURLToPath(new URL("../witness/captures/init-git-bootstrap-exit-codes.txt", import.meta.url)),
    "utf8",
  );
  assert.match(capture, /git version 2\.\d+/);
  assert.equal((capture.match(/^EXIT=0$/gm) ?? []).length, 3, "the capture no longer shows three successful git commands");
  assert.match(capture, /^EXIT=1$/m);
  assert.equal(runCli(["init", fleet]).status, 0);
  const manifest = JSON.parse(readFileSync(join(fleet, "package.json"), "utf8")) as {
    dependencies?: Record<string, string>;
    description?: string;
  };

  const kernel = JSON.parse(
    readFileSync(fileURLToPath(new URL("../package.json", import.meta.url)), "utf8"),
  ) as { name: string; version: string };

  /* THE NAME IS DR-0008's, and it is read from the kernel's own manifest rather
     than typed here, so a rename would redden this test in the same act. */
  assert.deepEqual(Object.keys(manifest.dependencies ?? {}), [kernel.name]);

  /* THE VERSION IS THE RUNNING KERNEL'S, not a number in the source. A fleet
     home is pinned to the kernel that initialized it. Comparing against the
     manifest rather than against a literal is what keeps this test from having
     to be edited on every release, which is the same reason CLAUDE.md gives for
     deriving counts at run time instead of pinning them. */
  assert.equal(manifest.dependencies?.[kernel.name], kernel.version);

  /* EXACT, WITH NO RANGE PREFIX. Blueprint section 3 makes the pin the upgrade
     mechanism, so a caret or a tilde here would mean a fleet home silently
     changed kernel between two `npm install` runs. `0.1.0` and `^0.1.0` both
     satisfy a naive equality against a version string only if the prefix is
     never added, so the prefix is asserted absent in its own right. */
  assert.match(manifest.dependencies?.[kernel.name] ?? "", /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/);

  /* THE PLACEHOLDER IS GONE. Its own text named the moment it was to be
     replaced, so a description still promising the pin later, beside a pin that
     is already there, is the drift this leg catches. */
  assert.equal(
    /placeholder|is added at M3/.test(manifest.description ?? ""),
    false,
    `the M1-P2 placeholder text survives beside the pin: ${String(manifest.description)}`,
  );
});

/* ------------------------------------------------------------------ */
/* M5-P6, DR-0058: init closes the charter-only gap                    */
/* ------------------------------------------------------------------ */

const { missingRegimeDocument } = (await import(
  new URL("../src/checks.ts", import.meta.url).href
)) as {
  missingRegimeDocument: (dir: string) => { document: string } | undefined;
};
const { decodeDocument } = (await import(
  new URL("../src/validate.ts", import.meta.url).href
)) as {
  decodeDocument: (
    text: string,
    label: string,
  ) => { ok: true; value: unknown } | { ok: false; reason: string };
};

const kernelFile = (relative: string): string =>
  fileURLToPath(new URL(`../${relative}`, import.meta.url));

const SCRATCH_IDENTITY = {
  GIT_AUTHOR_NAME: "Tiphys Test",
  GIT_AUTHOR_EMAIL: "test@tiphys.invalid",
  GIT_COMMITTER_NAME: "Tiphys Test",
  GIT_COMMITTER_EMAIL: "test@tiphys.invalid",
};

/** A project repository the way a consumer has one: a git work tree with files. */
function makeProject(t: { after(fn: () => void): void }): string {
  const repo = join(makeTempDir(t), "project");
  mkdirSync(repo);
  assert.equal(gitIn(repo, ["init", "--quiet", "--initial-branch=main"]).status, 0);
  writeFileSync(join(repo, "README.md"), "# a project that already exists\n");
  return repo;
}

function commitAll(repo: string): void {
  const env = { ...process.env, ...SCRATCH_IDENTITY };
  assert.equal(gitIn(repo, ["add", "-A"], env).status, 0);
  const made = gitIn(repo, ["commit", "--quiet", "-m", "project state"], env);
  assert.equal(made.status, 0, made.stderr);
}

test("init --project writes a byte-identical copy of the kernel assurance-modes.yaml into the project root", (t) => {
  const repo = makeProject(t);
  const result = runCli(["init", "--project", repo]);
  assert.equal(result.status, 0, result.stderr);
  const written = join(repo, "assurance-modes.yaml");
  /* A COPY, a regular file, not a link: a committed link carries its target
     path rather than the document (measured for M5-P6). */
  assert.equal(lstatSync(written).isSymbolicLink(), false, "init wrote a symbolic link");
  assert.ok(lstatSync(written).isFile(), "assurance-modes.yaml is not a regular file");
  assert.ok(
    readFileSync(written).equals(readFileSync(kernelFile("assurance-modes.yaml"))),
    "the project copy differs from the kernel's assurance-modes.yaml",
  );
  assert.match(result.stdout, /^wrote assurance-modes\.yaml: /m);
  /* Idempotent on an identical copy. */
  const again = runCli(["init", "--project", repo]);
  assert.equal(again.status, 0, again.stderr);
  assert.match(again.stdout, /^present assurance-modes\.yaml: identical/m);
});

test("a project prepared by init --project and its own charter satisfies the merge regime from the commit", (t) => {
  /* THE DANGEROUS STATE this guards, asserted first as a precondition: a
     project carrying only its charter, which is what charter-only onboarding
     looked like before this phase, is MISSING a regime document, and the
     missing one is the kernel's, not the project's. */
  const bare = makeProject(t);
  writeFileSync(join(bare, "charter.yaml"), readFileSync(kernelFile("templates/charter.example.yaml")));
  commitAll(bare);
  assert.equal(
    missingRegimeDocument(bare)?.document,
    "assurance-modes.yaml",
    "precondition violated: a charter-only project already satisfies the regime",
  );

  const repo = makeProject(t);
  writeFileSync(join(repo, "charter.yaml"), readFileSync(kernelFile("templates/charter.example.yaml")));
  const result = runCli(["init", "--project", repo]);
  assert.equal(result.status, 0, result.stderr);
  commitAll(repo);
  assert.equal(missingRegimeDocument(repo), undefined, "the regime still misses a document after init --project");
  /* And the committed bytes ARE the modes document, which is what a link
     would fail: git's own output, read back rather than assumed. */
  const shown = gitIn(repo, ["show", "HEAD:./assurance-modes.yaml"]);
  assert.equal(shown.status, 0, shown.stderr);
  assert.equal(shown.stdout, readFileSync(kernelFile("assurance-modes.yaml"), "utf8"));
});

test("init --project refuses a symbolic link at assurance-modes.yaml and leaves it in place", (t) => {
  const repo = makeProject(t);
  const link = join(repo, "assurance-modes.yaml");
  symlinkSync(kernelFile("assurance-modes.yaml"), link);
  const result = runCli(["init", "--project", repo]);
  assert.equal(result.status, 1, result.stdout);
  assert.match(result.stderr, /symbolic link/);
  assert.ok(lstatSync(link).isSymbolicLink(), "init replaced the link it refused");
});

test("init --project refuses a differing assurance-modes.yaml and does not overwrite it", (t) => {
  const repo = makeProject(t);
  const path = join(repo, "assurance-modes.yaml");
  writeFileSync(path, "kind: assurance-modes\n# a project's older copy\n");
  const before = readFileSync(path);
  const result = runCli(["init", "--project", repo]);
  assert.equal(result.status, 1, result.stdout);
  assert.match(result.stderr, /differs from kernel .* was not overwritten/);
  assert.ok(readFileSync(path).equals(before), "init overwrote a differing copy");
});

test("init --project reports the project charter and gate registry and never writes them", (t) => {
  const repo = makeProject(t);
  const result = runCli(["init", "--project", repo]);
  assert.equal(result.status, 0, result.stderr);
  assert.equal(existsSync(join(repo, "charter.yaml")), false, "init wrote a charter");
  assert.equal(existsSync(join(repo, "gate-registry.yaml")), false, "init wrote a gate registry");
  assert.match(result.stdout, /^project charter\.yaml: absent; /m);
  const named = /^project gate-registry\.yaml: absent; the project writes its own, starting from (\S+)$/m.exec(
    result.stdout,
  );
  assert.ok(named, `the template is not named: ${result.stdout}`);
  assert.equal(named[1], kernelFile("templates/gate-registry.example.yaml"));
  assert.ok(existsSync(named[1] as string), "the named template does not exist");
});

test("init --project refuses a directory that is not the top level of a git work tree", (t) => {
  const plain = join(makeTempDir(t), "plain");
  mkdirSync(plain);
  const result = runCli(["init", "--project", plain]);
  assert.equal(result.status, 1, result.stdout);
  assert.match(result.stderr, /not the top level of a git work tree/);
  assert.equal(existsSync(join(plain, "assurance-modes.yaml")), false, "init wrote outside a repository");

  /* A SUBDIRECTORY of a repository is the quieter form: git works there, and a
     file written there is committed, but the merge gates read the modes
     document from the repository ROOT of the commit, so it would be missed. */
  const repo = makeProject(t);
  const nested = join(repo, "packages");
  mkdirSync(nested);
  const inner = runCli(["init", "--project", nested]);
  assert.equal(inner.status, 1, inner.stdout);
  assert.match(inner.stderr, /not the top level of a git work tree/);
  assert.equal(existsSync(join(nested, "assurance-modes.yaml")), false, "init wrote below the repository root");
});

test("the shipped gate registry template validates and names no kernel command", () => {
  const path = kernelFile("templates/gate-registry.example.yaml");
  const validated = runCli(["validate", "--type", "gate-registry", path]);
  assert.equal(validated.status, 0, validated.stdout + validated.stderr);
  const decoded = decodeDocument(readFileSync(path, "utf8"), path);
  assert.ok(decoded.ok, decoded.ok ? "" : decoded.reason);
  const gates = (decoded.value as { gates?: { id: string; command?: string[] }[] }).gates ?? [];
  assert.ok(gates.length > 0, "the template declares no gates");
  /* THE DANGEROUS STATE is the pulse-fleet one: the kernel's own registry
     standing in for the project's. The kernel's gate SCRIPTS are read from the
     kernel's registry at run time, not hand-listed, and none of them may be
     named by any template command. Gate ids are not compared: a project may
     well have a gate called typecheck. */
  const kernelRegistry = decodeDocument(
    readFileSync(kernelFile("gate-registry.yaml"), "utf8"),
    "gate-registry.yaml",
  );
  assert.ok(kernelRegistry.ok, kernelRegistry.ok ? "" : kernelRegistry.reason);
  const kernelScripts = new Set(
    ((kernelRegistry.value as { gates?: { command?: string[] }[] }).gates ?? [])
      .flatMap((gate) => gate.command ?? [])
      .filter((word) => /\.(ts|mjs|js)$/.test(word)),
  );
  assert.ok(kernelScripts.size > 0, "precondition violated: no kernel gate scripts were read");
  for (const gate of gates) {
    for (const word of gate.command ?? []) {
      assert.equal(kernelScripts.has(word), false, `${gate.id} runs the kernel's ${word}`);
    }
  }
});

test("init prints the next steps naming the fleet charter location and the project arm", (t) => {
  const fleet = join(makeTempDir(t), "fleet");
  const result = runCli(["init", fleet]);
  assert.equal(result.status, 0, result.stderr);
  assert.ok(
    result.stdout.split("\n").includes(`next: write the project charter as ${join(fleet, "charter", "<project>.yaml")}`),
    result.stdout,
  );
  assert.match(result.stdout, /^next: in the project repository run tiphys init --project <repo>$/m);
});
