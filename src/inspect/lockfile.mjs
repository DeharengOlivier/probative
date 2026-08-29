import { readRepoFile, repoFileExists } from '../util/fs.mjs';

/**
 * The lockfile is the only trustworthy source for a component inventory: it
 * carries the resolved version, the download URL and the integrity hash that
 * npm itself verified. Reading it means the tool never has to run an install to
 * know what ships, which is what keeps the whole pipeline offline.
 */

/**
 * Lockfiles this ruleset cannot read. Naming them matters: a pnpm or yarn
 * repository that is told to 'commit a package-lock.json' has been given advice
 * that breaks its install. The tool reports what it found and what it cannot do
 * with it, and leaves the choice of package manager alone.
 */
const FOREIGN_LOCKFILES = Object.freeze([
  { manager: 'pnpm', file: 'pnpm-lock.yaml' },
  { manager: 'yarn', file: 'yarn.lock' },
  { manager: 'bun', file: 'bun.lockb' },
  { manager: 'bun', file: 'bun.lock' },
  { manager: 'npm shrinkwrap', file: 'npm-shrinkwrap.json' },
]);

/** @returns {Array<{manager: string, file: string}>} Complexity: O(1). */
function detectForeignLockfiles(root) {
  return FOREIGN_LOCKFILES.filter(({ file }) => repoFileExists(root, file));
}

/** Turn 'node_modules/a/node_modules/@scope/b' into '@scope/b'. */
export function packagePathToName(path) {
  const segments = path.split('node_modules/');
  const last = segments[segments.length - 1];
  return last.replace(/\/$/, '');
}

/** Package URL per the purl specification; the npm scope becomes the namespace. */
export function toPurl(name, version) {
  if (!name) return null;
  const encodedVersion = version ? `@${encodeURIComponent(version)}` : '';
  if (name.startsWith('@')) {
    const [scope, bare] = name.split('/');
    if (!bare) return null;
    return `pkg:npm/${encodeURIComponent(scope)}/${encodeURIComponent(bare)}${encodedVersion}`;
  }
  return `pkg:npm/${encodeURIComponent(name)}${encodedVersion}`;
}

/** npm stores integrity as 'sha512-<base64>'; CycloneDX wants hex per algorithm. */
export function parseIntegrity(integrity) {
  if (typeof integrity !== 'string') return null;
  const [algorithm, base64] = integrity.split('-');
  if (!algorithm || !base64) return null;
  const algorithmMap = { sha1: 'SHA-1', sha256: 'SHA-256', sha384: 'SHA-384', sha512: 'SHA-512' };
  const mapped = algorithmMap[algorithm.toLowerCase()];
  if (!mapped) return null;
  try {
    return { alg: mapped, content: Buffer.from(base64, 'base64').toString('hex') };
  } catch {
    return null;
  }
}

/**
 * @returns {{present: boolean, error: string|null, lockfileVersion: number|null,
 *   components: Array<object>, topLevelNames: string[], counts: object, notes: string[]}}
 */
export function inspectLockfile(root, packageInfo) {
  const notes = [];
  const otherEcosystems = detectForeignLockfiles(root);
  const raw = readRepoFile(root, 'package-lock.json');
  if (raw === null) {
    const found = otherEcosystems.map((e) => e.file).join(', ');
    return {
      present: false,
      error: found
        ? `this ruleset reads npm package-lock.json files only, and this repository uses ${found}; the component inventory could not be resolved here`
        : 'no lockfile was found, so the component inventory cannot be resolved offline',
      lockfileVersion: null, components: [], topLevelNames: [], unresolvedTopLevel: [], otherEcosystems,
      counts: { total: 0, production: 0, development: 0, optional: 0 }, notes,
    };
  }

  let lock;
  try {
    lock = JSON.parse(raw);
  } catch (error) {
    return {
      present: true, error: `package-lock.json is not valid JSON: ${error.message}`,
      lockfileVersion: null, components: [], topLevelNames: [], unresolvedTopLevel: [], otherEcosystems,
      counts: { total: 0, production: 0, development: 0, optional: 0 }, notes,
    };
  }

  const lockfileVersion = typeof lock.lockfileVersion === 'number' ? lock.lockfileVersion : null;
  if (lockfileVersion !== null && lockfileVersion < 2) {
    notes.push(`lockfileVersion ${lockfileVersion} does not record integrity for every component; run 'npm install' with npm 7 or later to upgrade the lockfile`);
  }
  if (!lock.packages || typeof lock.packages !== 'object') {
    return {
      present: true,
      error: `package-lock.json has no 'packages' map (lockfileVersion ${lockfileVersion ?? 'unknown'}); only npm 7+ lockfiles can be inventoried`,
      lockfileVersion, components: [], topLevelNames: [], unresolvedTopLevel: [], otherEcosystems,
      counts: { total: 0, production: 0, development: 0, optional: 0 }, notes,
    };
  }

  // Direct dependencies as declared by the manifest. Annex I, Part II, point (1)
  // sets the floor at these top-level dependencies.
  const declared = {
    ...(packageInfo?.dependencies ?? {}),
    ...(packageInfo?.optionalDependencies ?? {}),
    ...(packageInfo?.devDependencies ?? {}),
  };
  const topLevelNames = Object.keys(declared).sort();

  const components = [];
  const seen = new Set();
  for (const [path, entry] of Object.entries(lock.packages)) {
    if (path === '' || !entry || typeof entry !== 'object') continue;
    if (entry.link === true) continue; // workspace symlink; the real entry appears elsewhere
    const name = entry.name ?? packagePathToName(path);
    const version = typeof entry.version === 'string' ? entry.version : null;
    if (!name) continue;
    const key = `${name}@${version ?? 'unknown'}`;
    if (seen.has(key)) continue;
    seen.add(key);
    components.push({
      name,
      version,
      path,
      purl: toPurl(name, version),
      resolved: typeof entry.resolved === 'string' ? entry.resolved : null,
      integrity: typeof entry.integrity === 'string' ? entry.integrity : null,
      hash: parseIntegrity(entry.integrity),
      license: typeof entry.license === 'string' ? entry.license : null,
      dev: entry.dev === true,
      optional: entry.optional === true,
      devOptional: entry.devOptional === true,
      topLevel: Object.prototype.hasOwnProperty.call(declared, name),
      hasResolvedVersion: Boolean(version),
      registryResolved: typeof entry.resolved === 'string' && /^https:\/\/registry\.npmjs\.org\//.test(entry.resolved),
    });
  }
  components.sort((a, b) => (a.name === b.name ? String(a.version).localeCompare(String(b.version)) : a.name.localeCompare(b.name)));

  const missingIntegrity = components.filter((c) => !c.integrity && c.resolved);
  if (missingIntegrity.length > 0) {
    notes.push(`${missingIntegrity.length} component(s) have no integrity hash in the lockfile`);
  }
  const missingVersion = components.filter((c) => !c.hasResolvedVersion);
  if (missingVersion.length > 0) {
    notes.push(`${missingVersion.length} component(s) have no resolved version`);
  }
  const unresolvedTopLevel = topLevelNames.filter((name) => !components.some((c) => c.name === name));
  if (unresolvedTopLevel.length > 0) {
    notes.push(`declared dependencies absent from the lockfile: ${unresolvedTopLevel.join(', ')}; the lockfile is out of date with package.json`);
  }

  if (otherEcosystems.length > 0) {
    notes.push(`the repository also carries ${otherEcosystems.map((e) => e.file).join(', ')}; the inventory was resolved from package-lock.json only`);
  }

  return {
    present: true,
    error: null,
    lockfileVersion,
    otherEcosystems,
    components,
    topLevelNames,
    unresolvedTopLevel,
    counts: {
      total: components.length,
      production: components.filter((c) => !c.dev && !c.optional).length,
      development: components.filter((c) => c.dev).length,
      optional: components.filter((c) => c.optional).length,
      topLevel: components.filter((c) => c.topLevel).length,
    },
    notes,
  };
}
