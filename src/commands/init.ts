import { spawnSync } from "node:child_process";
import {
  existsSync,
  lstatSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  realpathSync,
  statSync,
  writeFileSync,
} from "node:fs";
import type { Stats } from "node:fs";
import { join, resolve } from "node:path";
import { EX_USAGE } from "../cli.ts";
import { CHARTER_DIRECTORY, ROOT_CHARTER_FILE } from "../charter.ts";
import { MODES_FILENAME, packageRoot } from "../modes.ts";
import { classifyEntry } from "../task.ts";
import {
  DEFAULT_SHARED_REF,
  DEFAULT_SHARED_REMOTE,
  SHARED_EXCLUSION_FIELD,
} from "../exclusion.ts";
import { FLEET_DIRS, FLEET_IGNORED } from "../fleet.ts";
import { DURABLE_STATUS_DIR } from "../status.ts";
import { readOwnVersion } from "../version.ts";

/**
 * THE PUBLISHED KERNEL NAME (DR-0008, decided 2026-08-05: public npmjs under
 * the `@tiphys` scope, `@tiphys/kernel` and `@tiphys/claude-code-plugin`).
 *
 * WHY THE NAME IS A CONSTANT AND THE VERSION IS DERIVED, since a reader will
 * reasonably ask why the two halves of one pin are sourced differently. The
 * version is the half that changes on every release, and a hardcoded one drifts
 * silently the first time it is bumped somewhere else, which is exactly the
 * failure the M1-P2 placeholder was left open against; so it is read from the
 * running kernel's own `package.json` by the same walk `tiphys version` uses,
 * and a fleet home is therefore pinned to the kernel that initialized it. The
 * name is the half DR-0008 fixed permanently, because a published npm name
 * cannot be taken back, which is why the plan marks that decision costly.
 */
export const KERNEL_PACKAGE_NAME = "@tiphys/kernel";

/**
 * The documented deterministic machine identity for fleet-scoped commits
 * (kernel plan v1, M1-P2 step 2; EXT-F-02 reviewer Option B). It is set as
 * command-scoped GIT_AUTHOR_* and GIT_COMMITTER_* environment variables on
 * the bootstrap commit invocation only; init never reads or requires user
 * git identity and never touches user or global git configuration.
 */
export const MACHINE_IDENTITY_NAME = "Tiphys Fleet";
export const MACHINE_IDENTITY_EMAIL = "fleet@tiphys.invalid";

/**
 * Durable directories receive a .gitkeep so the bootstrap commit tracks
 * them: git cannot track an empty directory, and without a tracked entry
 * the durable layout (SC-002) would not survive a clone of the fleet repo.
 * The ignored ephemera (state/, worktrees/, projects/) get no keep file:
 * they are recreated locally and are deliberately not repository content.
 *
 * `status` JOINED THIS LIST AT M4-P18 AND IT IS THE HALF OF M4-D-13 THAT IS
 * VISIBLE IN THE LAYOUT. The status pointer used to live beside its stream
 * under the ignored `state/` prefix, where the sentence that says where the
 * pipeline stands could be neither committed nor pushed; the split moved it
 * here. It is created at init rather than on first emit so that a fleet home
 * carries the durable directory from its bootstrap commit, and so a CLONE of
 * one carries it too: `tiphys resume` rebuilds the EPHEMERAL three and does
 * not, and must not, fabricate durable content (src/commands/resume.ts).
 */
const DURABLE_KEEP_DIRS = ["charter", "decisions", "tasks", DURABLE_STATUS_DIR] as const;

function runGit(
  cwd: string,
  args: string[],
  extraEnv?: Record<string, string>,
): { status: number | null; stderr: string } {
  const result = spawnSync("git", ["-C", cwd, ...args], {
    encoding: "utf8",
    env: extraEnv === undefined ? process.env : { ...process.env, ...extraEnv },
  });
  return { status: result.status, stderr: result.stderr ?? "" };
}

/**
 * THE OPT-IN FLAG FOR THE SHARED EXCLUSION REGISTER (M4-P21 criterion 1).
 *
 * The layer is DECLARED, never inferred, and the declaration lives in the
 * fleet home's own `package.json` because that file is already the fleet's
 * owner-controlled pin file. Without this flag `init` writes exactly the
 * package.json it wrote before, with no `tiphys` section at all, so a fleet
 * created today behaves exactly as it did and `src/exclusion.ts` returns
 * before spawning anything. That default is the H-D carve-out in the plan's
 * hazard table: a fleet that cannot reach a remote is not forced to switch
 * the layer off globally, because it was never on.
 */
const SHARED_EXCLUSION_FLAG = "--shared-exclusion";

/** The project arm's flag (M5-P6, DR-0058); see `initProject` below. */
export const PROJECT_FLAG = "--project";

/** The shipped, project-owned gate registry starting point (DR-0058, I-9). */
export const GATE_REGISTRY_TEMPLATE = join("templates", "gate-registry.example.yaml");

const INIT_USAGE = `usage: tiphys init <dir> [${SHARED_EXCLUSION_FLAG}] | tiphys init ${PROJECT_FLAG} <repo>`;

/**
 * tiphys init <dir> [--shared-exclusion]: create a fleet home in an empty or
 * absent directory (kernel plan v1, M1-P2 step 2). Substrate-neutral: pure
 * filesystem and git (DR-0007).
 */
export function cmdInit(args: string[]): number {
  if (args[0] === PROJECT_FLAG) {
    return initProject(args.slice(1));
  }
  const rest = args.filter((arg) => arg !== SHARED_EXCLUSION_FLAG);
  const sharedExclusion = args.length !== rest.length;
  const [dir, ...extra] = rest;
  if (dir === undefined || extra.length > 0) {
    process.stderr.write(`${INIT_USAGE}\n`);
    return EX_USAGE;
  }
  const root = resolve(dir);

  if (existsSync(root)) {
    if (!statSync(root).isDirectory()) {
      process.stderr.write(
        `tiphys init: ${root} exists and is not a directory\n`,
      );
      return 1;
    }
    const entries = readdirSync(root);
    if (entries.length > 0) {
      const fleetMarkers = new Set<string>([...FLEET_DIRS, "backlog.md", ".git"]);
      const looksInitialized = entries.some((entry) => fleetMarkers.has(entry));
      if (looksInitialized) {
        /* THE REMEDY TOKEN IS THE POINT OF THIS LINE (M4-P16 criterion 6).
           The exit code was already 1 and already correct, so a reader who
           got here learned only that init refused. A CLONE of a fleet home
           lands here too, because the marker set contains `.git`, and that
           reader's actual next step is `tiphys resume`, which rebuilds the
           three gitignored directories the clone does not carry. Naming it
           here is the difference between a refusal and an instruction. */
        process.stderr.write(
          `tiphys init: ${root} is already initialized; run tiphys resume to rebuild the ephemeral directories a clone does not carry\n`,
        );
      } else {
        process.stderr.write(
          `tiphys init: ${root} is not empty and not a fleet home, refusing\n`,
        );
      }
      return 1;
    }
  } else {
    mkdirSync(root, { recursive: true });
  }

  for (const name of [...FLEET_DIRS, DURABLE_STATUS_DIR]) {
    mkdirSync(join(root, name), { recursive: true });
  }
  for (const name of DURABLE_KEEP_DIRS) {
    writeFileSync(join(root, name, ".gitkeep"), "");
  }
  writeFileSync(join(root, "backlog.md"), "# Backlog\n");
  /* THE FLEET-HOME KERNEL PIN (kernel plan M3, M3-P10 step 3), replacing the
     M1-P2 placeholder whose own text said the pin "is added at M3 first
     publish" (kernel plan v1, M1-P2 step 2). The pin is EXACT, with no range
     prefix: blueprint section 3 makes the npm spine's pin the upgrade
     mechanism, so a caret here would mean a fleet home silently changed kernel
     between two `npm install` runs, which is the opposite of what the pin is
     for. `readOwnVersion()` is the same reader `tiphys version` uses, so the
     fleet home is pinned to the kernel that initialized it rather than to a
     number typed here. */
  const fleetPackageJson: Record<string, unknown> = {
    name: "tiphys-fleet-home",
    version: "0.0.0",
    private: true,
    description:
      "Tiphys fleet home. The kernel dependency below is an exact pin; changing it is how this fleet upgrades (blueprint section 3).",
    dependencies: {
      [KERNEL_PACKAGE_NAME]: readOwnVersion(),
    },
  };
  if (sharedExclusion) {
    /* The declared form is written out in full rather than as `true` so the
       owner can see, and edit, the remote and the ref this fleet's shared
       lease lives on. The ref is a BRANCH because only refs/heads/* is
       pushable against the remote this kernel is built for (CLAUDE.md
       standing warning 14, re-measured for M4-P21). */
    fleetPackageJson["tiphys"] = {
      sharedExclusion: {
        remote: DEFAULT_SHARED_REMOTE,
        ref: DEFAULT_SHARED_REF,
      },
    };
  }
  writeFileSync(
    join(root, "package.json"),
    `${JSON.stringify(fleetPackageJson, null, 2)}\n`,
  );
  writeFileSync(join(root, ".gitignore"), `${FLEET_IGNORED.join("\n")}\n`);

  const steps: { args: string[]; env?: Record<string, string> }[] = [
    { args: ["init", "--initial-branch=main"] },
    { args: ["add", "-A"] },
    {
      args: ["commit", "-m", "tiphys init: fleet home bootstrap"],
      env: {
        GIT_AUTHOR_NAME: MACHINE_IDENTITY_NAME,
        GIT_AUTHOR_EMAIL: MACHINE_IDENTITY_EMAIL,
        GIT_COMMITTER_NAME: MACHINE_IDENTITY_NAME,
        GIT_COMMITTER_EMAIL: MACHINE_IDENTITY_EMAIL,
      },
    },
  ];
  for (const step of steps) {
    const result = runGit(root, step.args, step.env);
    if (result.status !== 0) {
      process.stderr.write(
        `tiphys init: git ${step.args[0]} failed with exit ${String(result.status)}; ${root} is left partially initialized, remove it and re-run init\n${result.stderr}`,
      );
      return 1;
    }
  }

  process.stdout.write(`initialized fleet home at ${root}\n`);
  if (sharedExclusion) {
    process.stdout.write(
      `declared ${SHARED_EXCLUSION_FIELD} on ${DEFAULT_SHARED_REMOTE} at ${DEFAULT_SHARED_REF}\n`,
    );
  }
  /* THE NEXT STEPS ARE PRINTED, NOT LEFT TO BE KNOWN (M5-P6, DR-0058). The
     fleet home needs nothing more from the kernel: measured against this
     layout, every fleet-scoped command resolves roles, schemas, checklists
     and the mode document from the kernel's own install. What remains is the
     project's charter and, in the PROJECT repository, the one kernel file the
     merge gates read from a commit. Both are named here so that neither is an
     undocumented manual step. */
  process.stdout.write(
    `next: write the project charter as ${join(root, CHARTER_DIRECTORY, "<project>.yaml")}\n`,
  );
  process.stdout.write(
    `next: in the project repository run tiphys init ${PROJECT_FLAG} <repo>\n`,
  );
  return 0;
}

/**
 * THE PROJECT ARM, `tiphys init --project <repo>` (M5-P6, DR-0058).
 *
 * WHY IT EXISTS. The fleet home is not where the kernel's configuration is
 * consumed. The merge-authority regime reads `charter.yaml` AND
 * `assurance-modes.yaml` from the COMMIT of the repository the gates run in
 * (REGIME_DOCUMENTS and `missingRegimeDocument` in src/checks.ts; the merge
 * gate's `--context` defaults to the working directory). The charter is the
 * project's. `assurance-modes.yaml` is the KERNEL's closed vocabulary
 * (DR-0020), and until this arm nothing produced it in a project: the only
 * onboarded project carried hand-placed kernel files instead.
 *
 * A COPY, NOT A LINK, AND NOT A RESOLUTION THROUGH THE INSTALL. Measured for
 * M5-P6: a committed symbolic link passes the regime's presence probe
 * (`git cat-file -t` says `blob`) and then yields its TARGET PATH as the
 * document body, so the regime would be present and wrong. Resolving the file
 * from the operator's installed kernel instead would make a merge decision
 * depend on the operator's machine rather than on the commit being merged,
 * which is what the commit-sourced read exists to prevent. So the file is
 * written as a byte-identical copy of the initializing kernel's own document,
 * to be committed with the project.
 *
 * IT NEVER OVERWRITES. An identical copy is reported present. A differing one
 * is refused, because replacing the vocabulary a project's merges are judged
 * under is an upgrade and must be deliberate. A symbolic link at that path is
 * refused by name, for the reason above. The project's own documents, the
 * charter and the gate registry, are REPORTED and never written: a registry
 * the kernel wrote would be predicates the project did not choose.
 *
 * Exit codes: 0 the kernel configuration is in place, 1 refused, 64 usage.
 */
function initProject(args: string[]): number {
  const [dir, ...extra] = args;
  if (dir === undefined || extra.length > 0) {
    process.stderr.write(`${INIT_USAGE}\n`);
    return EX_USAGE;
  }
  const root = resolve(dir);
  const rootType = classifyEntry(root);
  if (rootType.kind === "absent") {
    process.stderr.write(`tiphys init ${PROJECT_FLAG}: ${root} does not exist\n`);
    return 1;
  }
  let isDirectory = false;
  try {
    isDirectory = lstatSync(root).isDirectory();
  } catch {
    isDirectory = false;
  }
  if (!isDirectory) {
    process.stderr.write(`tiphys init ${PROJECT_FLAG}: ${root} is not a directory\n`);
    return 1;
  }
  const top = spawnSync("git", ["-C", root, "rev-parse", "--show-toplevel"], {
    encoding: "utf8",
  });
  if (top.status !== 0 || resolve(top.stdout.trim()) !== realpathSync(root)) {
    process.stderr.write(
      `tiphys init ${PROJECT_FLAG}: ${root} is not the top level of a git work tree; the merge gates read the kernel file from a commit of the project repository, so it must be written at that repository's root\n`,
    );
    return 1;
  }

  let kernelRoot: string;
  try {
    kernelRoot = packageRoot();
  } catch (error) {
    process.stderr.write(`tiphys init ${PROJECT_FLAG}: ${String((error as Error).message)}\n`);
    return 1;
  }
  const source = join(kernelRoot, MODES_FILENAME);
  const kernelBytes = readFileSync(source);
  const target = join(root, MODES_FILENAME);
  const version = readOwnVersion();

  let existing: Stats | undefined;
  try {
    existing = lstatSync(target);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") {
      process.stderr.write(
        `tiphys init ${PROJECT_FLAG}: ${target} could not be examined: ${String(error)}\n`,
      );
      return 1;
    }
  }
  if (existing === undefined) {
    writeFileSync(target, kernelBytes);
    process.stdout.write(
      `wrote ${MODES_FILENAME}: a copy of kernel ${version}'s ${source}; commit it, the merge gates read it from the commit\n`,
    );
  } else if (existing.isSymbolicLink()) {
    process.stderr.write(
      `tiphys init ${PROJECT_FLAG}: ${target} is a symbolic link; a committed link carries its target path, not the document, so the merge gates would read the wrong bytes. Replace it with the file, not a link\n`,
    );
    return 1;
  } else if (!existing.isFile()) {
    process.stderr.write(
      `tiphys init ${PROJECT_FLAG}: ${target} exists and is not a regular file, refusing\n`,
    );
    return 1;
  } else if (!readFileSync(target).equals(kernelBytes)) {
    process.stderr.write(
      `tiphys init ${PROJECT_FLAG}: ${target} differs from kernel ${version}'s ${MODES_FILENAME} and was not overwritten; replacing it is an upgrade and must be deliberate\n`,
    );
    return 1;
  } else {
    process.stdout.write(
      `present ${MODES_FILENAME}: identical to kernel ${version}'s copy\n`,
    );
  }

  /* The project's own documents are REPORTED, never written. */
  const charter = join(root, ROOT_CHARTER_FILE);
  process.stdout.write(
    classifyEntry(charter).kind === "absent"
      ? `project ${ROOT_CHARTER_FILE}: absent; the project writes its charter at ${charter} (read from the commit by the merge gates)\n`
      : `project ${ROOT_CHARTER_FILE}: present\n`,
  );
  const registry = join(root, "gate-registry.yaml");
  process.stdout.write(
    classifyEntry(registry).kind === "absent"
      ? `project gate-registry.yaml: absent; the project writes its own, starting from ${join(kernelRoot, GATE_REGISTRY_TEMPLATE)}\n`
      : `project gate-registry.yaml: present\n`,
  );
  return 0;
}
