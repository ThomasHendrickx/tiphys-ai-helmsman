import { strict as assert } from "node:assert";
import { spawnSync } from "node:child_process";
import {
  existsSync,
  globSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, relative, resolve, sep } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

/**
 * THE PACKAGING HALF OF M4-P5 (kernel plan M4, criteria 3, 4 and 6).
 *
 * THE SUBJECT IS NOT THE ADAPTER, IT IS THE SECOND PACKAGE. DR-0040 put the
 * plugin in this repository as a second npm package, and the whole value of
 * that decision is that the two are still TWO: a plugin that ships inside the
 * kernel tarball makes them one, and a plugin whose tests nothing executes is
 * a package the suite gate is green over and asserted nothing about. Both of
 * those are silent. Neither shows up as a failing test; both show up only in
 * a listing nobody reads, which is why they are tests here.
 *
 * EVERY ASSERTION BELOW IS AGAINST REAL PROGRAM OUTPUT rather than against a
 * restatement of the configuration: the tarball assertions read what `npm
 * pack` actually lists, and the import assertion reads what `tsc` actually
 * emitted. A test that re-read `package.json` and agreed with it would be a
 * check that the file says what the file says.
 */

const repoRoot = dirname(dirname(fileURLToPath(import.meta.url)));
const pluginRoot = join(repoRoot, "plugin");
const pluginDistEntry = join(pluginRoot, "dist", "src", "index.js");

/** The package.json field the `suite` gate's invocation ultimately comes from. */
function rootPackageJson(): Record<string, unknown> {
  return JSON.parse(readFileSync(join(repoRoot, "package.json"), "utf8")) as Record<
    string,
    unknown
  >;
}

/**
 * What `npm pack` would put in the tarball, as npm itself reports it.
 *
 * `--ignore-scripts` deliberately, for the reason test/gates.test.ts:933
 * already records: without it `prepack` rebuilds `dist/` underneath a suite
 * whose other files are reading it.
 */
function packPaths(args: string[]): string[] {
  const packed = spawnSync("npm", ["pack", "--dry-run", "--json", "--ignore-scripts", ...args], {
    encoding: "utf8",
    cwd: repoRoot,
  });
  assert.equal(packed.status, 0, `npm pack ${args.join(" ")}: ${packed.stderr}`);
  const listing = JSON.parse(packed.stdout) as { files?: { path: string }[] }[];
  const paths = (listing[0]?.files ?? []).map((file) => file.path);
  assert.ok(paths.length > 0, `npm pack ${args.join(" ")} listed no files at all`);
  return paths;
}

/**
 * CRITERION 3, DIRECTION ONE. The dangerous state is the plugin published as
 * part of `@tiphys/kernel`, which makes two packages one and makes DR-0040's
 * whole point false.
 *
 * The assertion is written as "no path under the plugin workspace, by ANY
 * route" rather than as "the string plugin/ is absent", because the routes
 * look nothing alike in a listing. Three are covered: the source tree reached
 * directly through a `files` entry; the plugin COMPILED into the kernel's own
 * `dist`, which ships because `dist` is a `files` entry; and the workspace
 * LINK vendored into `dist/node_modules` by `npm run build:runtime-deps`,
 * which copies every non-dev entry of `node_modules/.package-lock.json` and
 * did copy the link until this phase taught it to skip links.
 *
 * MEASURED, AND STATED SO THE THIRD CLAUSE IS NOT READ AS STRONGER THAN IT
 * IS: `npm pack` does not list symlinks, so the vendored link did not reach
 * the tarball even with the exclusion removed. The link skip and the
 * `!dist/node_modules` entry are both belt and braces; the clauses that carry
 * criterion 3 are the first two, and both are demonstrated red in
 * delivery/work-history/m4-p5.md.
 */
test("the kernel tarball lists no path under the plugin workspace", () => {
  const paths = packPaths([]);
  const offending = paths.filter(
    (path) =>
      path === "plugin" ||
      path.startsWith("plugin/") ||
      path.startsWith("dist/plugin") ||
      path.includes("claude-code-plugin") ||
      path.startsWith("dist/node_modules/@tiphys"),
  );
  assert.deepEqual(
    offending,
    [],
    `the kernel tarball carries the plugin:\n${offending.join("\n")}`,
  );

  // The `files` array is the thing that decides this, so the test also states
  // what it is asserting about: a later edit that adds the plugin tree, or
  // that drops the dist/node_modules exclusion, has to pass the check above.
  const files = rootPackageJson()["files"];
  assert.ok(Array.isArray(files), "package.json files is an array");
  assert.ok(
    (files as string[]).includes("!dist/node_modules"),
    "package.json files still excludes dist/node_modules",
  );
});

/**
 * CRITERION 3, DIRECTION TWO. A plugin nobody can install is the other way to
 * fail this: the tarball has to carry the compiled adapter AND the manifest,
 * and the manifest lives under a DOTTED directory, which npm has its own
 * opinions about.
 */
test("the plugin tarball lists the compiled adapter and the plugin manifest", {
  skip: existsSync(pluginDistEntry)
    ? false
    : "plugin/dist/src/index.js is absent; run npm run build first (CI builds before it tests)",
}, () => {
  const paths = packPaths(["--workspace", "@tiphys/claude-code-plugin"]);
  for (const wanted of [
    "package.json",
    "dist/src/index.js",
    "dist/src/adapter.js",
    ".claude-plugin/plugin.json",
  ]) {
    assert.ok(paths.includes(wanted), `${wanted} missing from:\n${paths.join("\n")}`);
  }
});

/**
 * CRITERION 4, THE SILENT MEMBER. The `suite` gate runs the `test` SCRIPT
 * rather than a pattern of its own (CLAUDE.md standing warning 12's third
 * axis), and that script's glob is `test/**\/*.test.ts`. Plugin tests placed
 * under `plugin/test/` would therefore never run, and the suite would stay
 * green while the second package was untested: a green bundle over a gate
 * that asserted nothing, which is hazard H-C one package over.
 *
 * WHY THIS RESOLVES THE GLOB RATHER THAN RUNNING THE SUITE. Re-entering
 * `node --test` over the whole glob from inside a test costs one child
 * process per test file and asserts the same property. The glob is what
 * decides which files are reached, so the glob is what is evaluated, with
 * Node's own matcher and the pattern read out of `package.json` rather than
 * retyped.
 *
 * BOTH DIRECTIONS, because a matcher that returned everything would pass the
 * first assertion alone: the plugin's tests ARE reached at their real path,
 * and a path under `plugin/` is NOT, which is the placement the plan names as
 * the trap.
 */
test("the suite invocation the suite gate runs reaches the plugin's tests", (t) => {
  const scripts = rootPackageJson()["scripts"] as Record<string, string>;
  const testScript = scripts["test"];
  assert.equal(typeof testScript, "string", "package.json has a test script");
  const quoted = /"([^"]+)"/.exec(testScript);
  assert.ok(quoted, `the test script does not carry a quoted glob: ${testScript}`);
  const pattern = quoted[1] as string;

  const matched = new Set(
    globSync(pattern, { cwd: repoRoot }).map((path) => path.split(sep).join("/")),
  );
  for (const wanted of ["test/plugin-package.test.ts", "test/plugin-adapter.test.ts"]) {
    assert.ok(
      matched.has(wanted),
      `${wanted} is not reached by ${pattern}; matched:\n${[...matched].sort().join("\n")}`,
    );
  }
  // ARM TWO, AGAINST A SYNTHETIC TREE, AND IT IS WHAT MAKES ARM ONE MEAN
  // ANYTHING. Asserting that `plugin/test/...` is absent from a listing of
  // the REAL tree is a guard that cannot go red: no such file exists, so the
  // assertion holds whatever the pattern is, including a pattern widened to
  // reach everywhere. So the pattern is applied to a tree built for the
  // purpose, where both placements exist and only one may match.
  const probe = realpathSync(mkdtempSync(join(tmpdir(), "tiphys-p5-glob-")));
  t.after(() => {
    rmSync(probe, { recursive: true, force: true });
  });
  mkdirSync(join(probe, "test"), { recursive: true });
  mkdirSync(join(probe, "plugin", "test"), { recursive: true });
  writeFileSync(join(probe, "test", "reached.test.ts"), "");
  writeFileSync(join(probe, "plugin", "test", "unreached.test.ts"), "");
  const probed = new Set(
    globSync(pattern, { cwd: probe }).map((path) => path.split(sep).join("/")),
  );
  assert.ok(
    probed.has("test/reached.test.ts"),
    `${pattern} did not reach test/reached.test.ts: ${[...probed].join(", ")}`,
  );
  assert.equal(
    probed.has("plugin/test/unreached.test.ts"),
    false,
    `${pattern} reaches into plugin/test/, so a plugin test placed there would run ` +
      "and this test would not detect the trap it exists for",
  );

  // The other half of the same fact: the plugin workspace holds no test tree
  // at all, so nothing is sitting in the unreached place today.
  assert.equal(
    readdirSync(pluginRoot).includes("test"),
    false,
    "the plugin workspace has grown a test/ directory that the suite glob cannot reach",
  );
});

/**
 * THE MANIFEST PARSES, AND IT AGREES WITH THE PACKAGE.
 *
 * WHY THIS IS A TEST AND NOT A REVIEW NOTE. M4-P1 measured that a nonexistent
 * `--plugin-dir` makes the harness fail OPEN at exit 0
 * (delivery/verification/m4-prototype-probes.md:319 records the same
 * measurement's scope), so a manifest the harness cannot read is not a loud
 * failure: the session simply runs with no plugin and says nothing. Nothing
 * else in this repository reads this file, so without this test a manifest
 * broken by an edit would reach a tarball.
 *
 * WHAT THIS DOES NOT ASSERT, stated so the test is not read as stronger than
 * it is: that the HARNESS accepts it. Nothing in this suite starts a Claude
 * Code session. The shape is the one the M4 probes built and loaded
 * successfully (delivery/evidence/m4-probes/pretooluse-write-block.md:84), and
 * the name and version are this package's own.
 */
test("the plugin manifest parses and its version matches the package", () => {
  const manifest = JSON.parse(
    readFileSync(join(pluginRoot, ".claude-plugin", "plugin.json"), "utf8"),
  ) as Record<string, unknown>;
  const pkg = JSON.parse(readFileSync(join(pluginRoot, "package.json"), "utf8")) as Record<
    string,
    unknown
  >;
  assert.equal(typeof manifest["name"], "string");
  assert.notEqual(manifest["name"], "");
  assert.equal(manifest["version"], pkg["version"]);
  assert.equal(typeof manifest["description"], "string");

  // M4-P6 declares the hooks. Until it does, a `hooks` pointer here would name
  // a file that does not exist, which is the manifest equivalent of a guard
  // that cannot go red, so its ABSENCE is asserted rather than assumed.
  assert.equal(
    Object.hasOwn(manifest, "hooks"),
    false,
    "the manifest declares hooks; M4-P6 owns that edit and this assertion moves with it",
  );
});

/**
 * Every module specifier a JavaScript or TypeScript file imports from, with
 * comments removed first.
 *
 * THE COMMENT STRIPPING IS NOT COSMETIC. These files document the very thing
 * they are being checked for, so a raw text grep for a climbing relative path
 * matches the prose that warns against it and reddens for the wrong reason.
 * The check has to look at SPECIFIERS, and a specifier lives after `from` or
 * inside `import(` and never inside a comment.
 */
function importedSpecifiers(source: string): string[] {
  const code = source.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/(^|[^:])\/\/[^\n]*/g, "$1");
  const found: string[] = [];
  const patterns = [
    // THE GAP BEFORE `from` EXCLUDES QUOTES AND SEMICOLONS ON PURPOSE. A lazy
    // `[\s\S]*?` there reaches across statements: `export const X = "a";`
    // would start a match and run on to the NEXT import's `from`, consuming
    // that import and leaving it unexamined. Excluding the two characters that
    // can only end a statement or begin a string keeps each match inside one
    // import or export clause, which is the only place a specifier can be.
    /(?:^|[\s;}])(?:import|export)\s[^;'"]*?\sfrom\s*["']([^"']+)["']/g,
    /\bimport\s*\(\s*["']([^"']+)["']\s*\)/g,
    /(?:^|[\s;}])import\s+["']([^"']+)["']/g,
    /\brequire\s*\(\s*["']([^"']+)["']\s*\)/g,
  ];
  for (const pattern of patterns) {
    for (const match of code.matchAll(pattern)) {
      const specifier = match[1];
      if (specifier !== undefined) {
        found.push(specifier);
      }
    }
  }
  return found;
}

/** Every file under a directory whose name ends with one of the suffixes. */
function filesUnder(root: string, suffixes: string[]): string[] {
  const found: string[] = [];
  const walk = (dir: string): void => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const path = join(dir, entry.name);
      if (entry.isDirectory()) {
        walk(path);
      } else if (suffixes.some((suffix) => entry.name.endsWith(suffix))) {
        found.push(path);
      }
    }
  };
  walk(root);
  return found.sort();
}

/**
 * CRITERION 6. The plugin imports the kernel by PACKAGE NAME. A relative
 * import that climbs out of `plugin/` into the kernel's sources works inside
 * this workspace and breaks for every consumer who installs the two packages
 * from npm, and nothing about the workspace build says so.
 *
 * TWO ARMS, BECAUSE ONE OF THEM CANNOT SEE THE WHOLE CLASS. The plan's
 * criterion asserts on the COMPILED OUTPUT, and that arm is the one that
 * matches what a consumer actually runs. But `verbatimModuleSyntax` erases an
 * `import type` entirely, so a climbing TYPE import leaves no trace in the
 * emitted JavaScript at all and the compiled-output arm is green over it. The
 * type import is exactly the shape this file's own kernel import has, so the
 * arm that would miss it is the arm that matters most here. The SOURCE arm
 * catches it, and the compiled arm catches the value imports the next two
 * phases will add. Both arms are demonstrated red in
 * delivery/work-history/m4-p5.md, under two structurally different mutants.
 */
test("the plugin imports the kernel by package name in both its sources and its compiled output", () => {
  const roots: { label: string; files: string[] }[] = [
    { label: "source", files: filesUnder(join(pluginRoot, "src"), [".ts"]) },
  ];
  if (existsSync(pluginDistEntry)) {
    roots.push({
      label: "compiled output",
      files: filesUnder(join(pluginRoot, "dist"), [".js", ".d.ts"]),
    });
  }

  let inspected = 0;
  const escaping: string[] = [];
  for (const root of roots) {
    assert.ok(root.files.length > 0, `no ${root.label} files were found to inspect`);
    for (const file of root.files) {
      inspected += 1;
      for (const specifier of importedSpecifiers(readFileSync(file, "utf8"))) {
        if (!specifier.startsWith(".")) {
          continue;
        }
        const target = resolve(dirname(file), specifier);
        if (relative(pluginRoot, target).startsWith("..")) {
          escaping.push(`${relative(repoRoot, file)} imports ${specifier} (${root.label})`);
        }
      }
    }
  }
  assert.ok(inspected > 0, "nothing was inspected, so this test asserted nothing");
  assert.deepEqual(
    escaping,
    [],
    `the plugin reaches out of its own package by relative path:\n${escaping.join("\n")}`,
  );

  // AND THE PACKAGE NAME IS ACTUALLY USED. Zero climbing imports is also what
  // a plugin that imported nothing from the kernel would report, so the
  // absence above is only meaningful beside a present positive.
  const adapterSource = readFileSync(join(pluginRoot, "src", "adapter.ts"), "utf8");
  assert.ok(
    importedSpecifiers(adapterSource).includes("@tiphys/kernel"),
    "plugin/src/adapter.ts does not import @tiphys/kernel by package name",
  );
});

test("this phase's new behaviors are registered in test/behaviors.json", () => {
  /* BY NAME, NEVER BY COUNT (binding convention 5). `test/behaviors.json` is
     append-only and union-resolved, so a count here would be a claim about
     every future phase and false the moment the next one appends. */
  const behaviors = JSON.parse(
    readFileSync(join(repoRoot, "test", "behaviors.json"), "utf8"),
  ) as Record<string, string>;
  for (const id of [
    "plugin-package-not-in-kernel-tarball",
    "plugin-tests-run-under-npm-test",
    "plugin-imports-kernel-by-package-name",
    "plugin-adapter-satisfies-interface",
    "plugin-adapter-record-before-payload",
    "plugin-adapter-launch-failure-is-launch-failed",
    "plugin-spawn-writes-turn-end-both-exit-codes",
    // NOT in the plan's list of seven, and added rather than left out:
    // CLAUDE.md requires every new behaviour to resolve by name here, the
    // registry is append-only, and the plan's list is a floor rather than a
    // ceiling. The manifest test it names is witnessed in RW8.
    "plugin-manifest-parses-and-matches-package",
  ]) {
    assert.ok(
      Object.hasOwn(behaviors, id),
      `behavior ${id} does not resolve in test/behaviors.json`,
    );
  }
});
