import { readFileSync, readdirSync, realpathSync, statSync, existsSync, mkdirSync, rmSync, renameSync, writeFileSync } from 'node:fs';
import { join, relative, resolve, sep } from 'node:path';

/**
 * Paths never read, whatever the repository asks for. Two reasons: they hold
 * secrets (credentials, environment files), or they are caches whose size makes
 * the walk unbounded.
 */
export const DENIED_DIRECTORIES = Object.freeze([
  'node_modules', '.git', '.venv', 'venv', '__pycache__', '.cache', '.npm',
  'dist', 'build', 'coverage', '.next', '.nuxt', '.turbo', '.gradle',
  '.terraform', '.ssh', '.gnupg', '.aws', '.claude', '.codex', '.cursor',
]);

export const DENIED_FILE_PATTERNS = Object.freeze([
  /^\.env($|\.)/i, /(^|[.-])secrets?\.(json|ya?ml|toml|env)$/i,
  /\.(pem|key|p12|pfx|jks|keystore|ppk)$/i, /^id_(rsa|dsa|ecdsa|ed25519)$/i,
  /^\.netrc$/i, /^\.npmrc$/i, /^\.pypirc$/i, /^credentials$/i,
  /^\.htpasswd$/i, /\.kdbx$/i,
]);

/** Hard ceilings so a hostile repository cannot exhaust memory or time. */
/**
 * Directories whose contents describe something other than the product itself:
 * test material, worked examples, vendored copies of other people's code.
 *
 * This is a RELEVANCE filter, not a safety filter. These directories are walked
 * and they appear in the file inventory, because they are genuinely part of the
 * repository. What they must never do is stand as evidence about the product:
 * a SECURITY.md inside a test fixture says nothing about the product's own
 * vulnerability handling, and counting it produces a false positive in exactly
 * the direction that matters least to a manufacturer and most to a market
 * surveillance authority. Keep it separate from DENIED_DIRECTORIES, which
 * exists for a different reason (never read this at all).
 *
 * Deliberately absent: `spec` and `specs`. In a JavaScript repository they
 * usually hold tests, but everywhere else they hold specifications, which are
 * evidence. Excluding real evidence is the worse error, so they stay in.
 * Generated output (dist, build, coverage, .next, ...) is already excluded one
 * level earlier by DENIED_DIRECTORIES and is never walked.
 */
export const NON_EVIDENCE_DIRECTORIES = Object.freeze([
  'test', 'tests', '__tests__', 'testdata', 'test-data', 'testing',
  'fixture', 'fixtures', '__fixtures__', '__mocks__',
  'example', 'examples', 'sample', 'samples', 'demo', 'demos',
  'vendor', 'vendored', 'third_party', 'third-party',
  'node_modules', 'bower_components',
]);

const NON_EVIDENCE_SET = new Set(NON_EVIDENCE_DIRECTORIES);

/**
 * Whether a repository-relative path may stand as evidence about the product.
 *
 * Matches whole path SEGMENTS, never substrings, so `src/latest/`, `contest/`
 * and a file called `test.md` all remain evidence. Only directory segments are
 * considered: a file named after an excluded directory is not one.
 *
 * @param {string} relativePath repository-relative, forward slashes
 * @returns {boolean}
 * Complexity: O(number of path segments).
 */
export function isEvidencePath(relativePath) {
  if (!relativePath) return true;
  const segments = relativePath.split('/');
  segments.pop(); // the file name itself is never a directory
  return !segments.some((segment) => NON_EVIDENCE_SET.has(segment.toLowerCase()));
}

/**
 * Splits candidate evidence paths into those that count and those that do not.
 * The excluded list is returned rather than discarded so that the pack can say
 * out loud what it ignored; a silent filter in a compliance tool is a trap.
 *
 * @param {string[]} paths
 * @returns {{kept: string[], excluded: string[]}}
 */
export function partitionByEvidenceRelevance(paths) {
  const kept = [];
  const excluded = [];
  for (const path of paths) (isEvidencePath(path) ? kept : excluded).push(path);
  return { kept, excluded };
}

export const LIMITS = Object.freeze({
  maxFileBytes: 2 * 1024 * 1024,
  maxWalkEntries: 20000,
  maxDepth: 12,
});

export function isDeniedFile(name) {
  return DENIED_FILE_PATTERNS.some((pattern) => pattern.test(name));
}

/**
 * Resolve a repository-relative path and refuse anything that escapes the root,
 * including through a symlink. Returns null rather than throwing so callers can
 * record the refusal as evidence.
 */
export function safeResolve(root, relativePath) {
  const rootReal = realpathSync(root);
  const candidate = resolve(rootReal, relativePath);
  let real;
  try {
    real = realpathSync(candidate);
  } catch {
    // The path does not exist. Judge the lexical form, which is enough to
    // reject '../etc/passwd' before anything touches the filesystem.
    real = candidate;
  }
  if (real !== rootReal && !real.startsWith(rootReal + sep)) return null;
  return real;
}

/** Read a repository file as UTF-8, or null when denied, missing or oversized. */
export function readRepoFile(root, relativePath) {
  if (isDeniedFile(relativePath.split('/').pop() ?? '')) return null;
  const absolute = safeResolve(root, relativePath);
  if (!absolute) return null;
  try {
    const stats = statSync(absolute);
    if (!stats.isFile() || stats.size > LIMITS.maxFileBytes) return null;
    return readFileSync(absolute, 'utf8');
  } catch {
    return null;
  }
}

export function repoFileExists(root, relativePath) {
  const absolute = safeResolve(root, relativePath);
  if (!absolute) return false;
  try {
    return statSync(absolute).isFile();
  } catch {
    return false;
  }
}

/**
 * Walk the repository, skipping denied directories and never following a
 * symlink out of the root. Returns POSIX-style relative paths, sorted.
 */
export function walkRepo(root, { maxEntries = LIMITS.maxWalkEntries } = {}) {
  const rootReal = realpathSync(root);
  const found = [];
  const truncated = { value: false };

  const visit = (directory, depth) => {
    if (depth > LIMITS.maxDepth || found.length >= maxEntries) {
      truncated.value = true;
      return;
    }
    let entries;
    try {
      entries = readdirSync(directory, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries.sort((a, b) => (a.name < b.name ? -1 : 1))) {
      if (found.length >= maxEntries) {
        truncated.value = true;
        return;
      }
      if (entry.isSymbolicLink()) continue;
      const absolute = join(directory, entry.name);
      if (entry.isDirectory()) {
        if (DENIED_DIRECTORIES.includes(entry.name)) continue;
        visit(absolute, depth + 1);
      } else if (entry.isFile()) {
        if (isDeniedFile(entry.name)) continue;
        found.push(relative(rootReal, absolute).split(sep).join('/'));
      }
    }
  };

  visit(rootReal, 0);
  return { files: found.sort(), truncated: truncated.value };
}

/**
 * Write a directory tree atomically: build beside the destination, then swap.
 * A half-written evidence pack is worse than no pack at all.
 */
export function writeTreeAtomic(destination, files, { overwrite = false } = {}) {
  const target = resolve(destination);
  if (existsSync(target) && !overwrite) {
    throw new Error(`refusing to overwrite existing pack at ${target}; pass --force or choose another --out`);
  }
  const staging = `${target}.staging-${process.pid}`;
  rmSync(staging, { recursive: true, force: true });
  mkdirSync(staging, { recursive: true });
  for (const [relativePath, content] of Object.entries(files)) {
    const absolute = join(staging, relativePath);
    mkdirSync(resolve(absolute, '..'), { recursive: true });
    writeFileSync(absolute, content, 'utf8');
  }
  const backup = `${target}.previous-${process.pid}`;
  if (existsSync(target)) renameSync(target, backup);
  try {
    renameSync(staging, target);
  } catch (error) {
    if (existsSync(backup)) renameSync(backup, target);
    rmSync(staging, { recursive: true, force: true });
    throw error;
  }
  rmSync(backup, { recursive: true, force: true });
  return target;
}
