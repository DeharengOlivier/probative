import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { runPipeline } from '../../src/pipeline.mjs';
import { LIMITS } from '../../src/util/fs.mjs';
import { copyFixture, FIXED_NOW } from '../helpers.mjs';

/**
 * A repository is somebody else's data, and the tool is pointed at it without
 * being asked whether it is well formed. None of these shapes is exotic: a
 * directory where a file was expected happens the first time somebody runs a
 * generator wrong, and a dangling link happens on every worktree that lost a
 * sibling. What matters is that the run finishes, says what it could not
 * read, and never turns an accident into an exception the operator has to
 * decipher.
 */

const shapes = {
  'package.json is a directory': (dir) => {
    rmSync(join(dir, 'package.json'), { force: true });
    mkdirSync(join(dir, 'package.json'));
  },
  'package-lock.json is a directory': (dir) => {
    rmSync(join(dir, 'package-lock.json'), { force: true });
    mkdirSync(join(dir, 'package-lock.json'));
  },
  '.github is a file': (dir) => {
    rmSync(join(dir, '.github'), { recursive: true, force: true });
    writeFileSync(join(dir, '.github'), 'not a directory\n');
  },
  'the readme is a link to a file outside the repository': (dir) => {
    const outside = join(dir, '..', `outside-${process.pid}.md`);
    writeFileSync(outside, '# not part of this repository\n');
    rmSync(join(dir, 'README.md'), { force: true });
    symlinkSync(outside, join(dir, 'README.md'));
  },
  'the readme is a dangling link': (dir) => {
    rmSync(join(dir, 'README.md'), { force: true });
    symlinkSync(join(dir, 'nowhere.md'), join(dir, 'README.md'));
  },
  'the readme is not valid UTF-8': (dir) => {
    writeFileSync(join(dir, 'README.md'), Buffer.from([0xff, 0xfe, 0x00, 0x41, 0xc3, 0x28]));
  },
  'a directory links to itself': (dir) => {
    mkdirSync(join(dir, 'docs'), { recursive: true });
    symlinkSync(join(dir, 'docs'), join(dir, 'docs', 'loop'));
  },
  'the security policy is larger than the read ceiling': (dir) => {
    writeFileSync(join(dir, 'SECURITY.md'), 'a'.repeat(LIMITS.maxFileBytes + 1024));
  },
};

for (const [label, mutate] of Object.entries(shapes)) {
  test(`a repository where ${label} still produces a pack`, () => {
    const scratch = copyFixture('well-evidenced');
    try {
      mutate(scratch.path);
      const { files, assessment } = runPipeline(scratch.path, { nowOverride: FIXED_NOW });
      assert.ok(Object.keys(files).length > 0, 'no pack was produced');
      assert.ok(assessment.controls.length > 0, 'no control was assessed');
      const everything = Object.values(files).join('\n');
      assert.ok(!everything.includes(scratch.path), 'the absolute path reached the pack');
      assert.ok(!everything.includes('not part of this repository'), 'content from outside the repository reached the pack');
    } finally {
      rmSync(join(scratch.path, '..', `outside-${process.pid}.md`), { force: true });
      scratch.cleanup();
    }
  });
}

test('a file above the read ceiling is treated as unread, not as empty', () => {
  // The distinction matters: a security policy too large to read is not a
  // repository without one, and the pack must not say it is.
  const scratch = copyFixture('well-evidenced');
  try {
    writeFileSync(join(scratch.path, 'SECURITY.md'), 'a'.repeat(LIMITS.maxFileBytes + 1024));
    const { files } = runPipeline(scratch.path, { nowOverride: FIXED_NOW });
    const everything = Object.values(files).join('\n');
    assert.ok(!/aaaaaaaaaa/.test(everything), 'the oversized file was read into the pack after all');
  } finally {
    scratch.cleanup();
  }
});
