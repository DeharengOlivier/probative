import { existsSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { runPipeline, TOOL_VERSION } from './pipeline.mjs';
import { inspectRepository } from './inspect/index.mjs';
import { verifyPack } from './verify/index.mjs';
import { loadLoci, loadRuleset, DEFAULT_RULESET } from './rules/evaluate.mjs';
import { PROFILE_FILENAME, profileTemplate } from './profile/index.mjs';
import { writeTreeAtomic } from './util/fs.mjs';
import { stringify } from './util/json.mjs';
import { GAP_STATUSES } from './rules/status.mjs';

export const EXIT = Object.freeze({
  OK: 0,
  USAGE: 1,
  RUNTIME: 2,
  VERIFICATION_FAILED: 3,
  P0_GAPS: 4,
});

const USAGE = `probative ${TOOL_VERSION} - prepare CRA technical evidence from a Node.js repository

  This tool prepares technical evidence and declarations. It does not assess
  conformity, does not issue an EU declaration of conformity, and states no
  legal conclusion about compliance with Regulation (EU) 2024/2847.

Usage
  probative run [path] --out <dir>     Produce the full evidence pack
  probative inspect [path]             Read-only inventory of the repository
  probative sbom [path] --out <file>   CycloneDX bill of materials only
  probative verify <pack> [--against <repo>]
                                          Check pack integrity and freshness
  probative profile init [path]        Create a blank product profile
  probative cite <locus>               Print the official text of a provision
  probative rules                      List the controls of the ruleset

Options
  --out <path>        Destination directory or file
  --json              Machine-readable output on stdout
  --force             Overwrite an existing pack
  --include-dev       Include development dependencies in the bill of materials
  --ruleset <name>    Ruleset to apply (default: ${DEFAULT_RULESET})
  --now <iso>         Pin the clock, for byte-identical output
  --against <repo>    Repository to check a pack's freshness against
  --fail-on-p0        Exit ${EXIT.P0_GAPS} when a P0 gap is open, for use in CI
  --profile <file>    Product profile filename (default: ${PROFILE_FILENAME})
  -h, --help          This message
  -v, --version       Version only

Everything runs locally. No project script is executed and no network request is made.
`;

function parseArguments(argv) {
  const options = { positional: [], json: false, force: false, includeDev: false, failOnP0: false };
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    switch (argument) {
      case '--json': options.json = true; break;
      case '--force': options.force = true; break;
      case '--include-dev': options.includeDev = true; break;
      case '--fail-on-p0': options.failOnP0 = true; break;
      case '-h': case '--help': options.help = true; break;
      case '-v': case '--version': options.version = true; break;
      case '--out': options.out = argv[++index]; break;
      case '--ruleset': options.ruleset = argv[++index]; break;
      case '--now': options.nowOverride = argv[++index]; break;
      case '--against': options.against = argv[++index]; break;
      case '--profile': options.filename = argv[++index]; break;
      default:
        if (argument.startsWith('-')) throw new UsageError(`unknown option '${argument}'`);
        options.positional.push(argument);
    }
  }
  return options;
}

class UsageError extends Error {}

function resolveRoot(candidate) {
  const root = resolve(candidate ?? '.');
  if (!existsSync(root)) throw new UsageError(`path does not exist: ${root}`);
  return root;
}

const COMMANDS = {
  run(options, out) {
    const root = resolveRoot(options.positional[1]);
    const destination = options.out ?? join(root, 'probative');
    const { assessment, files } = runPipeline(root, options);
    writeTreeAtomic(destination, files, { overwrite: options.force });

    if (options.json) {
      out.write(stringify({ pack: destination, summary: assessment.summary, gaps: assessment.gaps }));
    } else {
      out.write(`Evidence pack written to ${destination}\n\n`);
      out.write(`  Product        ${assessment.subject.product ?? 'unnamed'} ${assessment.subject.version ?? ''}\n`);
      out.write(`  Commit         ${assessment.subject.commit ?? 'unavailable'}${assessment.subject.worktreeClean === false ? ' (working tree not clean)' : ''}\n`);
      out.write(`  Ruleset        ${assessment.ruleset.id} ${assessment.ruleset.version}\n`);
      out.write(`  Controls       ${assessment.summary.controlsEvaluated}\n`);
      out.write(`  Open gaps      ${assessment.summary.openGaps} (${assessment.summary.p0Gaps} at P0)\n`);
      out.write(`  Expert review  ${assessment.summary.requiringExpertReview}\n\n`);
      if (assessment.gaps.length > 0) {
        out.write('Close these first:\n');
        for (const gap of assessment.gaps.slice(0, 5)) {
          out.write(`  [${gap.priority}] ${gap.id}  ${gap.title}\n         ${gap.remediation}\n`);
        }
        out.write('\n');
      }
      out.write('This pack prepares technical evidence. It is not a conformity assessment and states\nno legal conclusion about compliance.\n');
    }
    return options.failOnP0 && assessment.summary.p0Gaps > 0 ? EXIT.P0_GAPS : EXIT.OK;
  },

  inspect(options, out) {
    const root = resolveRoot(options.positional[1]);
    const inventory = inspectRepository(root, options);
    if (options.json) {
      out.write(stringify(inventory));
      return EXIT.OK;
    }
    out.write(`Repository inventory (read-only)\n\n`);
    out.write(`  Package        ${inventory.package.name ?? 'none'} ${inventory.package.version ?? ''}\n`);
    out.write(`  Commit         ${inventory.git.shortCommit ?? 'unavailable'}\n`);
    out.write(`  Lockfile       ${inventory.lockfile.present ? `v${inventory.lockfile.lockfileVersion}, ${inventory.lockfile.counts.total} components` : 'absent'}\n`);
    out.write(`  Security policy ${inventory.docs.securityPolicy.path ?? 'absent'}\n`);
    out.write(`  CI             ${inventory.ci.provider}, ${inventory.ci.workflowCount} workflow(s)\n`);
    out.write(`  Fingerprint    ${inventory.stateFingerprint}\n`);
    if (inventory.notes.length > 0) {
      out.write('\nNotes:\n');
      for (const note of inventory.notes) out.write(`  - ${note}\n`);
    }
    return EXIT.OK;
  },

  sbom(options, out) {
    const root = resolveRoot(options.positional[1]);
    const { sbom, sbomStats, sbomWarnings } = runPipeline(root, options);
    if (!sbom) {
      out.write(`No bill of materials could be produced.\n${sbomWarnings.map((w) => `  - ${w}`).join('\n')}\n`);
      return EXIT.RUNTIME;
    }
    if (options.out) {
      writeFileSync(resolve(options.out), stringify(sbom), 'utf8');
      out.write(`CycloneDX ${sbom.specVersion} written to ${resolve(options.out)} (${sbomStats.componentCount} components)\n`);
    } else {
      out.write(stringify(sbom));
    }
    return EXIT.OK;
  },

  verify(options, out) {
    const target = options.positional[1];
    if (!target) throw new UsageError('verify needs the path of a pack directory');
    const report = verifyPack(resolveRoot(target), {
      repositoryRoot: options.against ? resolveRoot(options.against) : null,
      nowOverride: options.nowOverride,
    });
    if (options.json) {
      out.write(stringify(report));
    } else {
      out.write(`Pack ${report.directory}\n`);
      for (const check of report.checks) out.write(`  ${check.ok ? 'ok  ' : 'FAIL'} ${check.name}\n`);
      if (report.problems.length > 0) {
        out.write('\nProblems:\n');
        for (const problem of report.problems) out.write(`  [${problem.kind}] ${problem.message}\n`);
      } else {
        out.write('\nThe pack is intact.\n');
      }
    }
    return report.ok ? EXIT.OK : EXIT.VERIFICATION_FAILED;
  },

  profile(options, out) {
    const action = options.positional[1];
    if (action !== 'init') throw new UsageError("profile takes one action: 'init'");
    const root = resolveRoot(options.positional[2]);
    const destination = join(root, options.filename ?? PROFILE_FILENAME);
    if (existsSync(destination) && !options.force) {
      throw new UsageError(`${destination} already exists; pass --force to replace it`);
    }
    writeFileSync(destination, profileTemplate(), 'utf8');
    out.write(`Product profile template written to ${destination}\n\n`);
    out.write('Six fields must be filled before the profile validates:\n');
    out.write('  product.commercialName, product.intendedPurpose, manufacturer.legalName,\n');
    out.write('  manufacturer.singlePointOfContact, regulatoryPosition.determinedBy,\n');
    out.write('  vulnerabilityHandling.reportingContact\n\n');
    out.write('Every field carries the provision of the Regulation that makes it relevant.\n');
    return EXIT.OK;
  },

  cite(options, out) {
    const locus = options.positional[1];
    const reference = loadLoci();
    if (!locus) {
      out.write(`${Object.keys(reference.loci).length} provisions are indexed. Examples:\n`);
      for (const key of ['AnnexI.PartII.1', 'AnnexI.PartII.5', 'AnnexII.7', 'AnnexVII.4', 'Art.13.8', 'Art.14.1']) {
        out.write(`  ${key}\n`);
      }
      return EXIT.OK;
    }
    const entry = reference.loci[locus];
    if (!entry) throw new UsageError(`unknown locus '${locus}'`);
    if (options.json) {
      out.write(stringify({ locus, ...entry, source: reference.sourceFile, sourceSha256: reference.sourceSha256 }));
      return EXIT.OK;
    }
    out.write(`${entry.ref} - ${reference.regulation}\n\n${entry.text}\n\nSource: ${reference.eli}\n`);
    return EXIT.OK;
  },

  rules(options, out) {
    const ruleset = loadRuleset(options.ruleset ?? DEFAULT_RULESET);
    if (options.json) {
      out.write(stringify(ruleset));
      return EXIT.OK;
    }
    out.write(`${ruleset.rulesetId} ${ruleset.version}, ${ruleset.controls.length} controls\n\n`);
    for (const family of ruleset.families) {
      const controls = ruleset.controls.filter((control) => control.family === family.id);
      if (controls.length === 0) continue;
      out.write(`${family.title}${family.annexViiSection ? ` (${family.annexViiSection})` : ''}\n`);
      for (const control of controls) {
        out.write(`  [${control.priority}] ${control.id}  ${control.title}\n`);
        out.write(`        cites ${control.loci.join(', ')}\n`);
      }
      out.write('\n');
    }
    return EXIT.OK;
  },
};

export function main(argv, { out = process.stdout, err = process.stderr } = {}) {
  let options;
  try {
    options = parseArguments(argv);
  } catch (error) {
    err.write(`probative: ${error.message}\n\n${USAGE}`);
    return EXIT.USAGE;
  }
  if (options.version) {
    out.write(`${TOOL_VERSION}\n`);
    return EXIT.OK;
  }
  const command = options.positional[0];
  if (options.help || !command) {
    out.write(USAGE);
    return command ? EXIT.OK : EXIT.USAGE;
  }
  const implementation = COMMANDS[command];
  if (!implementation) {
    err.write(`probative: unknown command '${command}'\n\n${USAGE}`);
    return EXIT.USAGE;
  }
  try {
    return implementation(options, out);
  } catch (error) {
    if (error instanceof UsageError) {
      err.write(`probative: ${error.message}\n`);
      return EXIT.USAGE;
    }
    err.write(`probative: ${error.message}\n`);
    return EXIT.RUNTIME;
  }
}
