import { test } from 'node:test';
import assert from 'node:assert/strict';
import { symlinkSync, writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { isDeniedFile, readRepoFile, safeResolve, walkRepo } from '../../src/util/fs.mjs';
import { copyFixture, fixturePath } from '../helpers.mjs';

test('refuses a path that escapes the repository root', () => {
  const root = fixturePath('minimal-unprepared');
  assert.equal(safeResolve(root, '../../etc/passwd'), null);
  assert.equal(safeResolve(root, '/etc/passwd'), null);
  assert.ok(safeResolve(root, 'package.json'));
});

test('refuses to read through a symlink pointing outside the root', () => {
  const scratch = copyFixture('minimal-unprepared');
  try {
    symlinkSync('/etc/passwd', join(scratch.path, 'escape.txt'));
    assert.equal(safeResolve(scratch.path, 'escape.txt'), null);
    assert.equal(readRepoFile(scratch.path, 'escape.txt'), null);
  } finally {
    scratch.cleanup();
  }
});

test('never walks into a symlinked directory', () => {
  const scratch = copyFixture('minimal-unprepared');
  try {
    mkdirSync(join(scratch.path, 'real'));
    writeFileSync(join(scratch.path, 'real', 'inside.txt'), 'x');
    symlinkSync(join(scratch.path, 'real'), join(scratch.path, 'linked'));
    const { files } = walkRepo(scratch.path);
    assert.ok(files.includes('real/inside.txt'));
    assert.ok(!files.some((file) => file.startsWith('linked/')));
  } finally {
    scratch.cleanup();
  }
});

test('denies files whose name marks them as credential material', () => {
  for (const name of ['.env', '.env.production', 'id_rsa', 'server.pem', 'secrets.json', '.npmrc']) {
    assert.equal(isDeniedFile(name), true, `${name} should be denied`);
  }
  for (const name of ['package.json', 'SECURITY.md', 'environment.md']) {
    assert.equal(isDeniedFile(name), false, `${name} should be allowed`);
  }
});

test('the hostile fixture .env is never read', () => {
  const root = fixturePath('hostile-repository');
  assert.equal(readRepoFile(root, '.env'), null);
  const { files } = walkRepo(root);
  assert.ok(!files.includes('.env'));
});
