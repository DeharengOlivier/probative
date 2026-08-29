import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { runPipeline } from '../../src/pipeline.mjs';
import { inspectRepository } from '../../src/inspect/index.mjs';
import { LIMITS } from '../../src/util/fs.mjs';
import { copyFixture, FIXED_NOW } from '../helpers.mjs';

/**
 * A pack that reports an inventory it did not finish collecting is the one
 * failure this tool cannot afford: the reader has no way of telling "the
 * repository has none" from "the walk stopped before reaching it". The bound
 * on the walk is necessary; announcing when it bit is what makes it honest.
 */

/** A branch deeper than the walk is allowed to go, which truncates the walk. */
function buryATree(root) {
  let current = root;
  for (let level = 0; level <= LIMITS.maxDepth; level += 1) {
    current = join(current, `level${level}`);
    mkdirSync(current);
  }
  writeFileSync(join(current, 'buried.md'), '# too deep to be seen\n');
}

test('a repository too deep to walk in full says so in its inventory', () => {
  const scratch = copyFixture('well-evidenced');
  try {
    buryATree(scratch.path);
    const inventory = inspectRepository(scratch.path, { nowOverride: FIXED_NOW });
    const incomplete = inventory.notes.filter((note) => /walk stopped/i.test(note));
    assert.equal(incomplete.length, 2, `expected both inventories to admit it: ${JSON.stringify(inventory.notes)}`);
    assert.ok(incomplete.some((note) => /document inventory/i.test(note)));
    assert.ok(incomplete.some((note) => /CI inventory/i.test(note)));
  } finally {
    scratch.cleanup();
  }
});

test('the pack carries that admission where a reader will meet it', () => {
  const scratch = copyFixture('well-evidenced');
  try {
    buryATree(scratch.path);
    const { files } = runPipeline(scratch.path, { nowOverride: FIXED_NOW });
    const everything = Object.values(files).join('\n');
    assert.match(everything, /walk stopped at its bounds/i);
    assert.match(everything, /CI inventory may be incomplete/i);
  } finally {
    scratch.cleanup();
  }
});

test('a repository the walk finished claims nothing about being incomplete', () => {
  const scratch = copyFixture('well-evidenced');
  try {
    const inventory = inspectRepository(scratch.path, { nowOverride: FIXED_NOW });
    assert.equal(inventory.notes.filter((note) => /walk stopped/i.test(note)).length, 0);
  } finally {
    scratch.cleanup();
  }
});

test('what the walk did not reach changes no control status', () => {
  // The bound must cost the repository nothing it had already earned: the
  // controls are decided by what was found, and a buried file changes none.
  const scratch = copyFixture('well-evidenced');
  try {
    const before = runPipeline(scratch.path, { nowOverride: FIXED_NOW }).assessment;
    buryATree(scratch.path);
    const after = runPipeline(scratch.path, { nowOverride: FIXED_NOW }).assessment;
    const statuses = (assessment) => assessment.controls.map((control) => `${control.id}:${control.status}`);
    assert.deepEqual(statuses(after), statuses(before));
  } finally {
    scratch.cleanup();
  }
});
