import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { compact } from './json.mjs';

const ALGORITHM = 'sha256';

/** Hash of a string or buffer, prefixed so the algorithm travels with the digest. */
export function hashBytes(input) {
  return `${ALGORITHM}:${createHash(ALGORITHM).update(input).digest('hex')}`;
}

/** Hash of a file's bytes. Returns null when the file cannot be read. */
export function hashFile(absolutePath) {
  try {
    return hashBytes(readFileSync(absolutePath));
  } catch {
    return null;
  }
}

/** Hash of a value's canonical JSON form, so key order never changes the digest. */
export function hashValue(value) {
  return hashBytes(compact(value));
}

/** Hash over an ordered list of (path, hash) pairs, used for pack-level digests. */
export function hashManifest(entries) {
  const lines = [...entries]
    .sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0))
    .map((entry) => `${entry.hash}  ${entry.path}`)
    .join('\n');
  return hashBytes(lines + '\n');
}
