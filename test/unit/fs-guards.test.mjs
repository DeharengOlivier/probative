import { test } from 'node:test';
import assert from 'node:assert/strict';
import { symlinkSync, writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { isDeniedFile, normalisePathForComparison, readRepoFile, safeResolve, sameDirectory, walkRepo } from '../../src/util/fs.mjs';
import { copyFixture, fixturePath, tempDirectory } from '../helpers.mjs';

test('refuses a path that escapes the repository root', () => {
  const root = fixturePath('minimal-unprepared');
  assert.equal(safeResolve(root, '../../etc/passwd'), null);
  assert.equal(safeResolve(root, '/etc/passwd'), null);
  assert.ok(safeResolve(root, 'package.json'));
});

test('refuses to read through a symlink pointing outside the root', () => {
  const scratch = copyFixture('minimal-unprepared');
  const outside = tempDirectory();
  try {
    // A target that exists on every platform, rather than /etc/passwd, which on
    // Windows makes the link dangling and tests something else entirely.
    const target = join(outside.path, 'secret.txt');
    writeFileSync(target, 'not yours');
    symlinkSync(target, join(scratch.path, 'escape.txt'));
    assert.equal(safeResolve(scratch.path, 'escape.txt'), null);
    assert.equal(readRepoFile(scratch.path, 'escape.txt'), null);
  } finally {
    scratch.cleanup();
    outside.cleanup();
  }
});

test('refuses a dangling symlink whose target is outside the root', () => {
  const scratch = copyFixture('minimal-unprepared');
  try {
    // The target does not exist, so the path cannot be resolved. The link still
    // declares where it points, and that declaration is what must be judged:
    // falling back to the link's own in-root location calls an escape contained.
    symlinkSync(join(scratch.path, '..', '..', 'nowhere', 'secret.txt'), join(scratch.path, 'dangling.txt'));
    assert.equal(safeResolve(scratch.path, 'dangling.txt'), null);
    assert.equal(readRepoFile(scratch.path, 'dangling.txt'), null);
  } finally {
    scratch.cleanup();
  }
});

test('a dangling symlink that stays inside the root is not an escape', () => {
  const scratch = copyFixture('minimal-unprepared');
  try {
    symlinkSync(join(scratch.path, 'not-created-yet.txt'), join(scratch.path, 'inside.txt'));
    assert.ok(safeResolve(scratch.path, 'inside.txt'), 'pointing at a missing file inside the root is not a traversal');
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

// --- One directory, several spellings ---------------------------------------
// Windows spells the same directory in a short 8.3 form and a long one, with
// either slash and any case. git reports one, Node's tmpdir() the other, and a
// plain === then claims the analysed path is a subdirectory that it is not.
// The 8.3 expansion itself can only be exercised on Windows; these pin the rest.

test('the Windows comparison form is case-insensitive and slash-insensitive', () => {
  const asWindows = (p) => normalisePathForComparison(p, 'win32');
  assert.equal(asWindows('C:/Users/Runner/Repo'), asWindows('C:\\Users\\runner\\repo'));
  assert.equal(asWindows('D:\\a\\probative\\probative\\'), asWindows('D:/a/probative/probative'));
  assert.notEqual(asWindows('C:\\a\\b'), asWindows('C:\\a\\c'));
});

test('elsewhere the path is compared exactly, because case and backslash are significant', () => {
  const asPosix = (p) => normalisePathForComparison(p, 'linux');
  assert.equal(asPosix('/a/B'), '/a/B');
  assert.notEqual(asPosix('/a/B'), asPosix('/a/b'));
  assert.equal(asPosix('/a/we\\ird'), '/a/we\\ird', 'a backslash is an ordinary character here');
});

test('a directory is the same as itself however it is spelled locally', () => {
  const scratch = copyFixture('minimal-unprepared');
  try {
    assert.equal(sameDirectory(scratch.path, scratch.path), true);
    assert.equal(sameDirectory(scratch.path, join(scratch.path, '.')), true);
    assert.equal(sameDirectory(scratch.path, join(scratch.path, '..')), false);
  } finally {
    scratch.cleanup();
  }
});
