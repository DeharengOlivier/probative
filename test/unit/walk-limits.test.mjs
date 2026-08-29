import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { LIMITS, walkRepo } from '../../src/util/fs.mjs';
import { inspectCi } from '../../src/inspect/ci.mjs';
import { inspectDocs } from '../../src/inspect/docs.mjs';

/**
 * The walk is bounded so that a pathological repository cannot make the tool
 * run for ever. A bound that stops silently is worse than no bound at all
 * here: the pack would report an inventory it did not finish collecting, and
 * the reader would have no way of telling the difference between "there is no
 * workflow" and "the walk stopped before reaching one".
 */

function scratchRepo(build) {
  const directory = mkdtempSync(join(tmpdir(), 'probative-walk-'));
  build(directory);
  return { path: directory, cleanup: () => rmSync(directory, { recursive: true, force: true }) };
}

const nested = (root, depth) => {
  let current = root;
  for (let level = 0; level < depth; level += 1) {
    current = join(current, `level${level}`);
    mkdirSync(current);
  }
  writeFileSync(join(current, 'deep.txt'), 'at the bottom\n');
  return current;
};

test('a walk that fits under both ceilings is not reported as truncated', () => {
  const repo = scratchRepo((dir) => {
    for (let i = 0; i < 5; i += 1) writeFileSync(join(dir, `file${i}.txt`), 'x');
  });
  try {
    const { files, truncated } = walkRepo(repo.path);
    assert.equal(files.length, 5);
    assert.equal(truncated, false);
  } finally {
    repo.cleanup();
  }
});

test('the entry ceiling stops the walk and says so', () => {
  const repo = scratchRepo((dir) => {
    for (let i = 0; i < 12; i += 1) writeFileSync(join(dir, `file${String(i).padStart(2, '0')}.txt`), 'x');
  });
  try {
    const { files, truncated } = walkRepo(repo.path, { maxEntries: 4 });
    assert.equal(files.length, 4);
    assert.equal(truncated, true);
  } finally {
    repo.cleanup();
  }
});

test('the last entry that fits is kept, and the walk is still complete', () => {
  const repo = scratchRepo((dir) => {
    for (let i = 0; i < 4; i += 1) writeFileSync(join(dir, `file${i}.txt`), 'x');
  });
  try {
    const { files, truncated } = walkRepo(repo.path, { maxEntries: 4 });
    assert.equal(files.length, 4);
    assert.equal(truncated, false);
  } finally {
    repo.cleanup();
  }
});

test('the depth ceiling stops the walk and says so', () => {
  const repo = scratchRepo((dir) => nested(dir, LIMITS.maxDepth + 1));
  try {
    const { files, truncated } = walkRepo(repo.path);
    assert.deepEqual(files, []);
    assert.equal(truncated, true);
  } finally {
    repo.cleanup();
  }
});

test('a tree exactly at the depth ceiling is walked in full', () => {
  const repo = scratchRepo((dir) => nested(dir, LIMITS.maxDepth));
  try {
    const { files, truncated } = walkRepo(repo.path);
    assert.equal(files.length, 1);
    assert.equal(truncated, false);
  } finally {
    repo.cleanup();
  }
});

test('the document inventory says when the walk did not finish', () => {
  const repo = scratchRepo((dir) => {
    mkdirSync(join(dir, 'docs'));
    writeFileSync(join(dir, 'README.md'), '# a repository\n');
    for (let i = 0; i < 12; i += 1) writeFileSync(join(dir, `file${String(i).padStart(2, '0')}.txt`), 'x');
  });
  try {
    const docs = inspectDocs(repo.path, { walk: walkRepo(repo.path, { maxEntries: 3 }) });
    assert.ok(
      docs.notes.some((note) => /walk/i.test(note) && /incomplete/i.test(note)),
      `no note about the truncated walk: ${JSON.stringify(docs.notes)}`,
    );
  } finally {
    repo.cleanup();
  }
});

test('the CI inventory says when the walk did not finish', () => {
  // Without this note, a repository whose walk stops before .github is reached
  // is reported as having no continuous integration at all, which is a
  // statement the tool never observed.
  const repo = scratchRepo((dir) => {
    mkdirSync(join(dir, '.github', 'workflows'), { recursive: true });
    writeFileSync(join(dir, '.github', 'workflows', 'ci.yml'), 'name: ci\non: push\njobs: {}\n');
    for (let i = 0; i < 12; i += 1) writeFileSync(join(dir, `file${String(i).padStart(2, '0')}.txt`), 'x');
  });
  try {
    const walk = walkRepo(repo.path, { maxEntries: 2 });
    assert.equal(walk.truncated, true);
    const ci = inspectCi(repo.path, { walk });
    assert.ok(
      ci.notes.some((note) => /walk/i.test(note) && /incomplete/i.test(note)),
      `no note about the truncated walk: ${JSON.stringify(ci.notes)}`,
    );
  } finally {
    repo.cleanup();
  }
});

test('an inspector handed no walk performs its own', () => {
  const repo = scratchRepo((dir) => {
    mkdirSync(join(dir, '.github', 'workflows'), { recursive: true });
    writeFileSync(join(dir, '.github', 'workflows', 'ci.yml'), 'name: ci\non: push\njobs: {}\n');
  });
  try {
    const ci = inspectCi(repo.path);
    assert.equal(ci.provider, 'github-actions');
    assert.equal(ci.workflowCount, 1);
    assert.deepEqual(ci.notes, []);
  } finally {
    repo.cleanup();
  }
});
