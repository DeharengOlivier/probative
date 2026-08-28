import { realpathSync } from 'node:fs';
import { inspectGit } from './git.mjs';
import { inspectPackage } from './npm.mjs';
import { inspectLockfile } from './lockfile.mjs';
import { inspectDocs } from './docs.mjs';
import { inspectCi } from './ci.mjs';
import { resolveNow, toIso } from '../util/time.mjs';
import { hashFile, hashManifest, hashValue } from '../util/hash.mjs';
import { safeResolve } from '../util/fs.mjs';

export const INVENTORY_SCHEMA_VERSION = '1.0.0';

/**
 * Read-only inventory of a repository. Runs no project script, opens no network
 * connection, and makes no compliance judgement: every field is an observation.
 */
export function inspectRepository(root, options = {}) {
  const absoluteRoot = realpathSync(root);
  const now = resolveNow(options);

  const git = inspectGit(absoluteRoot);
  const npmPackage = inspectPackage(absoluteRoot);
  const lockfile = inspectLockfile(absoluteRoot, npmPackage);
  const docs = inspectDocs(absoluteRoot);
  const ci = inspectCi(absoluteRoot);

  const notes = [...git.notes, ...npmPackage.notes, ...lockfile.notes, ...docs.notes, ...ci.notes];

  const inventory = {
    schemaVersion: INVENTORY_SCHEMA_VERSION,
    generatedAt: toIso(now),
    // The path is deliberately not recorded: it leaks the operator's directory
    // layout into a document meant to leave the organisation.
    repositoryName: npmPackage.name ?? null,
    git,
    package: npmPackage,
    lockfile,
    docs,
    ci,
    notes,
  };

  // Identity of the observed state, independent of when the run happened.
  //
  // The digest covers the CONTENT of every document that can produce evidence,
  // not merely its path: a security policy emptied of its substance has to read
  // as a changed state, otherwise `verify --against` would call a stale pack
  // fresh. Two runs over the same tree still produce the same fingerprint.
  const evidencePaths = [
    'package.json', 'package-lock.json',
    docs.securityPolicy.path, docs.readme.path, docs.changelog.path,
    docs.securityTxt.path, docs.license.path, docs.contributing.path,
    ci.dependencyUpdates.dependabot.path, ci.dependencyUpdates.renovate.path,
    ...ci.workflows.map((workflow) => workflow.path),
    ...docs.existingSbom.paths,
    options.filename ?? 'probative.profile.json',
  ].filter(Boolean);

  const contentDigests = [...new Set(evidencePaths)].sort().map((path) => {
    const absolute = safeResolve(absoluteRoot, path);
    return { path, hash: absolute ? (hashFile(absolute) ?? 'absent') : 'unreadable' };
  });
  inventory.evidenceFileDigests = contentDigests;

  inventory.stateFingerprint = hashValue({
    git: { commit: git.commit, dirty: git.dirty },
    package: { name: npmPackage.name, version: npmPackage.version, scripts: npmPackage.scripts },
    lockfile: { version: lockfile.lockfileVersion, components: lockfile.components.map((c) => `${c.name}@${c.version}`) },
    ci: { signals: ci.signals },
    documents: hashManifest(contentDigests),
  });

  return inventory;
}
