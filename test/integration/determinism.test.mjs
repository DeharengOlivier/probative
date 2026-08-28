import { test } from 'node:test';
import assert from 'node:assert/strict';
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { runPipeline } from '../../src/pipeline.mjs';
import { copyFixture, fixturePath, FIXED_NOW } from '../helpers.mjs';

test('two runs over the same tree with a pinned clock are byte identical', () => {
  const first = runPipeline(fixturePath('well-evidenced'), { nowOverride: FIXED_NOW }).files;
  const second = runPipeline(fixturePath('well-evidenced'), { nowOverride: FIXED_NOW }).files;
  assert.deepEqual(Object.keys(first).sort(), Object.keys(second).sort());
  for (const path of Object.keys(first)) {
    assert.equal(first[path], second[path], `${path} differs between two identical runs`);
  }
});

test('SOURCE_DATE_EPOCH pins the clock the same way as --now', () => {
  const previous = process.env.SOURCE_DATE_EPOCH;
  process.env.SOURCE_DATE_EPOCH = String(Math.floor(new Date(FIXED_NOW).getTime() / 1000));
  try {
    const viaEnvironment = runPipeline(fixturePath('well-evidenced'), {}).files['assessment.json'];
    const viaFlag = runPipeline(fixturePath('well-evidenced'), { nowOverride: FIXED_NOW }).files['assessment.json'];
    assert.equal(viaEnvironment, viaFlag);
  } finally {
    if (previous === undefined) delete process.env.SOURCE_DATE_EPOCH;
    else process.env.SOURCE_DATE_EPOCH = previous;
  }
});

test('changing the repository changes the pack digest', () => {
  const scratch = copyFixture('well-evidenced');
  try {
    const before = runPipeline(scratch.path, { nowOverride: FIXED_NOW });
    writeFileSync(join(scratch.path, 'CHANGELOG.md'), '# Changelog\n\n## 4.3.0\n\n### Security\n\n- Fixed CVE-2026-22222.\n');
    const after = runPipeline(scratch.path, { nowOverride: FIXED_NOW });
    assert.notEqual(before.inventory.stateFingerprint, after.inventory.stateFingerprint);
    assert.notEqual(
      JSON.parse(before.files['pack.json']).packDigest,
      JSON.parse(after.files['pack.json']).packDigest,
    );
  } finally {
    scratch.cleanup();
  }
});

test('the state fingerprint ignores the wall clock', () => {
  const early = runPipeline(fixturePath('well-evidenced'), { nowOverride: '2026-01-01T00:00:00Z' });
  const late = runPipeline(fixturePath('well-evidenced'), { nowOverride: '2026-12-31T23:59:59Z' });
  assert.equal(early.inventory.stateFingerprint, late.inventory.stateFingerprint);
  assert.notEqual(early.assessment.generatedAt, late.assessment.generatedAt);
});
