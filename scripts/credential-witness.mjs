#!/usr/bin/env node
//
// credential-witness.mjs: the payload that probes its OWN environment from
// INSIDE the child (kernel plan M4, M4-P8 step 7).
//
// WHY THIS EXISTS, AND WHAT IT REFUTES. The shipped `credential-scrub` gate
// builds its own child environment by calling `buildChildEnv` with its own
// scrub root and no extension, and probes THAT. So it tests the
// CONSTRUCTION: what the kernel's function returns when the gate calls it.
// It has never observed a real spawn. An adapter that receives a scrubbed
// environment from the kernel and then adds a name to it before launching
// leaves `buildChildEnv`'s return value completely unchanged, so the gate
// stays green and every artifact says the child was scrubbed.
//
// A witness taken from the object the kernel RETURNED cannot go red against
// that adapter, because it is reading the wrong side of the handover. This
// payload reads the only side that settles it: `process.env` of the process
// that actually ran, plus the credential sources resolvable from inside it.
//
// It follows scripts/stub-payload.sh's pattern in the one respect that
// matters here: it writes its facts to A PATH THE HARNESS CHOSE, rather
// than to stdout, because whether `tiphys spawn` forwards a payload's
// stdout is not a contract the plan states.
//
// THE PATH ARRIVES AS argv, NEVER AS AN ENVIRONMENT VARIABLE, and that is
// deliberate rather than incidental: a variable would have to be added to
// the allowlist in src/exec/env.ts, and M4-P8's grounding forbids the
// default list gaining any name. The command is the one channel that
// crosses the spawn boundary without widening the environment. Passing an
// absent or empty path is a usage error, exit 64, and writes nothing.
//
// usage: node scripts/credential-witness.mjs <output-path>
//
// Output (JSON, one object):
//   argv0        the interpreter that ran this payload
//   cwd          the working directory the adapter launched it in
//   envNames     every name present in this child, sorted
//   env          every name and value present in this child
//   probes       probeCredentialSources(process.env), the gate's own probe
//                vocabulary, run from inside the child
//   verdict      verdictFromProbes(probes).status
//
// `env` carries VALUES and this file is a test payload, never a shipped
// default: it writes to a caller-named path in a scratch directory and the
// caller is the harness. The values are what makes a leak DEMONSTRABLE
// rather than merely nameable, which is the difference between "GH_TOKEN is
// present" and "GH_TOKEN is present and carries the parent's value".

import { writeFileSync } from "node:fs";

const EX_USAGE = 64;

const outputPath = process.argv[2];
if (outputPath === undefined || outputPath.length === 0) {
  process.stderr.write(
    "credential-witness: usage: node scripts/credential-witness.mjs <output-path>\n",
  );
  process.exit(EX_USAGE);
}

// RESOLVED RELATIVE TO THIS FILE, so the payload works from whatever
// working directory the adapter launched it in (the task worktree, which is
// not this repository). A bare specifier would be resolved against the
// child's cwd and would not be found there.
const credentialsModule = await import(
  new URL("../src/gates/credentials.ts", import.meta.url).href
);

const probes = credentialsModule.probeCredentialSources(process.env);

writeFileSync(
  outputPath,
  `${JSON.stringify(
    {
      argv0: process.argv[0],
      cwd: process.cwd(),
      envNames: Object.keys(process.env).sort(),
      env: { ...process.env },
      probes,
      verdict: credentialsModule.verdictFromProbes(probes).status,
    },
    null,
    2,
  )}\n`,
);
