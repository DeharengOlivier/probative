import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, rmSync, renameSync } from 'node:fs';
import { join } from 'node:path';
import { inspectRepository } from '../../src/inspect/index.mjs';
import { copyFixture, copyFixtureAsGitRepo, FIXED_NOW } from '../helpers.mjs';

/**
 * Regression battery for the freshness defect found on 28 August 2026: the
 * fingerprint covered document paths only, so a security policy stripped of its
 * content still read as the same state and `verify --against` called a stale
 * pack fresh. The invariant is now: any change to a document that can produce
 * evidence changes the fingerprint.
 */
const fingerprint = (root) => inspectRepository(root, { nowOverride: FIXED_NOW }).stateFingerprint;

function withFixture(name, body) {
  const scratch = copyFixture(name);
  try {
    body(scratch.path);
  } finally {
    scratch.cleanup();
  }
}

test('the fingerprint is stable when nothing changes', () => {
  withFixture('well-evidenced', (root) => {
    assert.equal(fingerprint(root), fingerprint(root));
  });
});

test('emptying the security policy changes the fingerprint', () => {
  withFixture('well-evidenced', (root) => {
    const before = fingerprint(root);
    writeFileSync(join(root, 'SECURITY.md'), '# Security\n');
    assert.notEqual(fingerprint(root), before);
  });
});

test('changing the changelog changes the fingerprint', () => {
  withFixture('well-evidenced', (root) => {
    const before = fingerprint(root);
    writeFileSync(join(root, 'CHANGELOG.md'), '# Changelog\n\n## 4.3.0\n');
    assert.notEqual(fingerprint(root), before);
  });
});

test('changing a workflow changes the fingerprint', () => {
  withFixture('well-evidenced', (root) => {
    const before = fingerprint(root);
    writeFileSync(join(root, '.github/workflows/ci.yml'), 'name: ci\non: push\njobs: {}\n');
    assert.notEqual(fingerprint(root), before);
  });
});

test('changing the product profile changes the fingerprint', () => {
  withFixture('well-evidenced', (root) => {
    const before = fingerprint(root);
    const profilePath = join(root, 'cra-evidence.profile.json');
    const profile = JSON.parse(readFileSync(profilePath, 'utf8'));
    profile.supportPeriod.endDate = '2029-01';
    writeFileSync(profilePath, JSON.stringify(profile, null, 2));
    assert.notEqual(fingerprint(root), before);
  });
});

test('deleting an evidence document changes the fingerprint', () => {
  withFixture('well-evidenced', (root) => {
    const before = fingerprint(root);
    rmSync(join(root, '.well-known/security.txt'));
    assert.notEqual(fingerprint(root), before);
  });
});

test('renaming a document to a path the tool does not recognise changes the fingerprint', () => {
  withFixture('well-evidenced', (root) => {
    const before = fingerprint(root);
    renameSync(join(root, 'SECURITY.md'), join(root, 'SECURITY-OLD.md'));
    assert.notEqual(fingerprint(root), before);
  });
});

test('a change outside the evidence set leaves the fingerprint alone', () => {
  withFixture('well-evidenced', (root) => {
    const before = fingerprint(root);
    writeFileSync(join(root, 'NOTES-not-evidence.txt'), 'scratch notes\n');
    assert.equal(fingerprint(root), before, 'the fingerprint must track evidence, not every byte in the tree');
  });
});

test('the fingerprint records one digest per evidence document', () => {
  withFixture('well-evidenced', (root) => {
    const inventory = inspectRepository(root, { nowOverride: FIXED_NOW });
    const paths = inventory.evidenceFileDigests.map((entry) => entry.path);
    assert.ok(paths.includes('SECURITY.md'));
    assert.ok(paths.includes('package-lock.json'));
    assert.ok(paths.includes('.github/workflows/release.yml'));
    assert.ok(paths.includes('cra-evidence.profile.json'));
    for (const entry of inventory.evidenceFileDigests) {
      assert.match(entry.hash, /^(sha256:[0-9a-f]{64}|absent|unreadable)$/);
    }
  });
});

/**
 * Regression battery for the subdirectory defect found on 28 August 2026:
 * git walks up until it finds a repository, so analysing a subdirectory
 * silently adopted the enclosing repository's commit and clean-tree state. The
 * behaviour is right for a monorepo package and misleading otherwise, so the
 * pack now says which of the two it is.
 */
test('analysing a repository root records that the commit describes it', () => {
  const repository = copyFixtureAsGitRepo('well-evidenced');
  try {
    const inventory = inspectRepository(repository.path, { nowOverride: FIXED_NOW });
    assert.equal(inventory.git.analysedPathIsRepositoryRoot, true);
    assert.ok(!inventory.notes.some((note) => note.includes('subdirectory of the git repository')));
  } finally {
    repository.cleanup();
  }
});

test('analysing a subdirectory says the commit describes the whole repository', () => {
  const repository = copyFixtureAsGitRepo('well-evidenced');
  try {
    const inventory = inspectRepository(join(repository.path, 'docs'), { nowOverride: FIXED_NOW });
    assert.equal(inventory.git.analysedPathIsRepositoryRoot, false);
    assert.ok(inventory.notes.some((note) => note.includes('subdirectory of the git repository')),
      'a commit borrowed from an enclosing repository must be flagged, not presented as the subject');
  } finally {
    repository.cleanup();
  }
});

test('outside any repository the flag is null rather than a false claim', () => {
  withFixture('minimal-unprepared', (root) => {
    const inventory = inspectRepository(root, { nowOverride: FIXED_NOW });
    assert.equal(inventory.git.available, false);
    assert.equal(inventory.git.analysedPathIsRepositoryRoot, null);
  });
});
