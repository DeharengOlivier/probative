import { test } from 'node:test';
import assert from 'node:assert/strict';
import { appendFileSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { runPipeline } from '../../src/pipeline.mjs';
import { verifyPack } from '../../src/verify/index.mjs';
import { writeTreeAtomic } from '../../src/util/fs.mjs';
import { copyFixture, copyFixtureAsGitRepo, FIXED_NOW, tempDirectory } from '../helpers.mjs';

function writePack(repositoryRoot, output) {
  const { files } = runPipeline(repositoryRoot, { nowOverride: FIXED_NOW });
  const destination = join(output, 'probative');
  writeTreeAtomic(destination, files);
  return destination;
}

test('a freshly written pack verifies', () => {
  const scratch = copyFixture('well-evidenced');
  const output = tempDirectory();
  try {
    const report = verifyPack(writePack(scratch.path, output.path));
    assert.equal(report.ok, true, JSON.stringify(report.problems));
    assert.ok(report.checks.every((check) => check.ok));
  } finally {
    scratch.cleanup();
    output.cleanup();
  }
});

test('altering one byte of a pack file is detected', () => {
  const scratch = copyFixture('well-evidenced');
  const output = tempDirectory();
  try {
    const pack = writePack(scratch.path, output.path);
    appendFileSync(join(pack, 'gaps.md'), '\nAll gaps closed.\n');
    const report = verifyPack(pack);
    assert.equal(report.ok, false);
    assert.ok(report.problems.some((problem) => problem.kind === 'integrity' && problem.message.includes('gaps.md')));
  } finally {
    scratch.cleanup();
    output.cleanup();
  }
});

test('removing a pack file is detected', () => {
  const scratch = copyFixture('well-evidenced');
  const output = tempDirectory();
  try {
    const pack = writePack(scratch.path, output.path);
    rmSync(join(pack, 'sbom.cdx.json'));
    const report = verifyPack(pack);
    assert.equal(report.ok, false);
    assert.ok(report.problems.some((problem) => problem.message.includes('absent from the directory')));
  } finally {
    scratch.cleanup();
    output.cleanup();
  }
});

test('rewriting SHA256SUMS to match a tampered file does not rescue the pack', () => {
  const scratch = copyFixture('well-evidenced');
  const output = tempDirectory();
  try {
    const pack = writePack(scratch.path, output.path);
    writeFileSync(join(pack, 'gaps.md'), '# Gaps\n\nNone.\n');
    const sums = readFileSync(join(pack, 'SHA256SUMS'), 'utf8')
      .split('\n').filter((line) => !line.endsWith('gaps.md')).join('\n');
    writeFileSync(join(pack, 'SHA256SUMS'), sums);
    const report = verifyPack(pack);
    assert.equal(report.ok, false, 'pack.json still records the original digest');
  } finally {
    scratch.cleanup();
    output.cleanup();
  }
});

test('a directory that is not a pack is reported as such', () => {
  const output = tempDirectory();
  try {
    const report = verifyPack(output.path);
    assert.equal(report.ok, false);
    assert.equal(report.problems[0].kind, 'structure');
  } finally {
    output.cleanup();
  }
});

test('a pack produced at another commit is reported as stale', () => {
  const repository = copyFixtureAsGitRepo('well-evidenced');
  const output = tempDirectory();
  try {
    const pack = writePack(repository.path, output.path);
    const fresh = verifyPack(pack, { repositoryRoot: repository.path, nowOverride: FIXED_NOW });
    assert.equal(fresh.ok, true, JSON.stringify(fresh.problems));
    assert.equal(fresh.freshness.stale, false);
    assert.equal(fresh.freshness.commitMatches, true);

    writeFileSync(join(repository.path, 'SECURITY.md'), '# Security\n\nNo policy.\n');
    repository.git(['add', '-A']);
    repository.git(['-c', 'commit.gpgsign=false', 'commit', '--quiet', '-m', 'weaken the policy']);

    const stale = verifyPack(pack, { repositoryRoot: repository.path, nowOverride: FIXED_NOW });
    assert.equal(stale.ok, false);
    assert.equal(stale.freshness.stale, true);
    assert.equal(stale.freshness.commitMatches, false);
    assert.ok(stale.problems.some((problem) => problem.kind === 'freshness'));
  } finally {
    repository.cleanup();
    output.cleanup();
  }
});

test('an uncommitted change to an evidence document also makes the pack stale', () => {
  const repository = copyFixtureAsGitRepo('well-evidenced');
  const output = tempDirectory();
  try {
    const pack = writePack(repository.path, output.path);
    writeFileSync(join(repository.path, 'SECURITY.md'), '# Security\n\nNo policy.\n');
    const report = verifyPack(pack, { repositoryRoot: repository.path, nowOverride: FIXED_NOW });
    assert.equal(report.freshness.commitMatches, true, 'the commit has not moved');
    assert.equal(report.freshness.stale, true, 'but the evidence has changed');
    assert.ok(report.problems.some((problem) => problem.message.includes('observed state has changed')));
  } finally {
    repository.cleanup();
    output.cleanup();
  }
});

test('a pack over a git repository records the commit and a clean worktree', () => {
  const repository = copyFixtureAsGitRepo('well-evidenced');
  try {
    const { assessment } = runPipeline(repository.path, { nowOverride: FIXED_NOW });
    assert.match(assessment.subject.commit, /^[0-9a-f]{40}$/);
    assert.equal(assessment.subject.worktreeClean, true);
    const control = assessment.controls.find((item) => item.id === 'CRA-NODE-001');
    assert.equal(control.status, 'verified');
  } finally {
    repository.cleanup();
  }
});

test('a dirty worktree is reported rather than passed over', () => {
  const repository = copyFixtureAsGitRepo('well-evidenced');
  try {
    writeFileSync(join(repository.path, 'README.md'), '# vaultkeeper\n\nedited\n');
    const { assessment, files } = runPipeline(repository.path, { nowOverride: FIXED_NOW });
    assert.equal(assessment.subject.worktreeClean, false);
    assert.equal(assessment.controls.find((item) => item.id === 'CRA-NODE-001').status, 'partial');
    assert.match(files['limitations.md'], /uncommitted changes/);
  } finally {
    repository.cleanup();
  }
});

test('the pack is written atomically: a failed write leaves the previous pack intact', () => {
  const scratch = copyFixture('well-evidenced');
  const output = tempDirectory();
  try {
    const pack = writePack(scratch.path, output.path);
    const original = readFileSync(join(pack, 'README.md'), 'utf8');
    assert.throws(() => writeTreeAtomic(pack, { 'README.md': 'replaced' }), /refusing to overwrite/);
    assert.equal(readFileSync(join(pack, 'README.md'), 'utf8'), original);
  } finally {
    scratch.cleanup();
    output.cleanup();
  }
});
