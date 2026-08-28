import { existsSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { hashBytes, hashManifest } from '../util/hash.mjs';
import { inspectRepository } from '../inspect/index.mjs';

/**
 * Verification answers three separate questions, and reports them separately:
 * has the pack been altered, is it internally consistent, and does it still
 * describe the repository as it stands now.
 */
export function verifyPack(packDirectory, { repositoryRoot = null, nowOverride = null } = {}) {
  const directory = resolve(packDirectory);
  const problems = [];
  const checks = [];

  const packJsonPath = join(directory, 'pack.json');
  if (!existsSync(packJsonPath)) {
    return {
      ok: false, directory, checks,
      problems: [{ kind: 'structure', message: 'pack.json is missing; this directory is not a pack produced by this tool.' }],
      freshness: null,
    };
  }

  let pack;
  try {
    pack = JSON.parse(readFileSync(packJsonPath, 'utf8'));
  } catch (error) {
    return {
      ok: false, directory, checks,
      problems: [{ kind: 'structure', message: `pack.json is not valid JSON: ${error.message}` }],
      freshness: null,
    };
  }

  // 1. Integrity: every file listed still hashes to the recorded digest.
  let altered = 0;
  let absent = 0;
  for (const entry of pack.files ?? []) {
    const filePath = join(directory, entry.path);
    if (!existsSync(filePath)) {
      problems.push({ kind: 'integrity', message: `${entry.path} is listed in pack.json but absent from the directory.` });
      absent += 1;
      continue;
    }
    const actual = hashBytes(readFileSync(filePath));
    if (actual !== entry.hash) {
      problems.push({ kind: 'integrity', message: `${entry.path} has changed since the pack was produced.` });
      altered += 1;
    }
  }
  checks.push({ name: 'file digests', filesChecked: (pack.files ?? []).length, altered, absent, ok: altered === 0 && absent === 0 });

  // 2. The pack digest must match the file list it covers.
  const recomputedDigest = hashManifest(pack.files ?? []);
  const digestMatches = recomputedDigest === pack.packDigest;
  if (!digestMatches) {
    problems.push({ kind: 'integrity', message: 'The recorded pack digest does not match the list of files it covers.' });
  }
  checks.push({ name: 'pack digest', expected: pack.packDigest, actual: recomputedDigest, ok: digestMatches });

  // 3. SHA256SUMS must agree with pack.json, since the two are written together.
  const sumsPath = join(directory, 'SHA256SUMS');
  if (existsSync(sumsPath)) {
    const listed = new Map(readFileSync(sumsPath, 'utf8').split('\n').filter(Boolean).map((line) => {
      const [digest, ...rest] = line.split(/\s+/);
      return [rest.join(' '), `sha256:${digest}`];
    }));
    let disagreements = 0;
    for (const entry of pack.files ?? []) {
      if (entry.path === 'SHA256SUMS' || entry.path === 'pack.json') continue;
      if (listed.get(entry.path) !== entry.hash) disagreements += 1;
    }
    if (disagreements > 0) problems.push({ kind: 'integrity', message: `SHA256SUMS disagrees with pack.json for ${disagreements} file(s).` });
    checks.push({ name: 'SHA256SUMS agreement', disagreements, ok: disagreements === 0 });
  } else {
    problems.push({ kind: 'structure', message: 'SHA256SUMS is missing.' });
  }

  // 4. Freshness against the live repository, when one is given.
  let freshness = null;
  if (repositoryRoot) {
    const current = inspectRepository(repositoryRoot, { nowOverride });
    const commitMatches = current.git.commit === pack.subject.commit;
    const fingerprintMatches = current.stateFingerprint === pack.subject.stateFingerprint;
    freshness = {
      packCommit: pack.subject.commit,
      currentCommit: current.git.commit,
      commitMatches,
      packFingerprint: pack.subject.stateFingerprint,
      currentFingerprint: current.stateFingerprint,
      fingerprintMatches,
      stale: !fingerprintMatches,
    };
    if (!fingerprintMatches) {
      problems.push({
        kind: 'freshness',
        message: commitMatches
          ? 'The pack matches the current commit but the observed state has changed; regenerate it.'
          : `The pack was produced at commit ${pack.subject.commit ?? 'unknown'} and the repository is now at ${current.git.commit ?? 'unknown'}; the evidence is stale.`,
      });
    }
    checks.push({ name: 'freshness', ok: fingerprintMatches });
  }

  return {
    ok: problems.length === 0,
    directory,
    pack: { tool: pack.tool, ruleset: pack.ruleset, generatedAt: pack.generatedAt, subject: pack.subject, packDigest: pack.packDigest },
    checks,
    problems,
    freshness,
  };
}
