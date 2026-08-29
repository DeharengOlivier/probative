import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { inspectLockfile } from '../../src/inspect/lockfile.mjs';

function repoWith(files) {
  const root = mkdtempSync(join(tmpdir(), 'probative-eco-'));
  for (const [path, content] of Object.entries(files)) {
    mkdirSync(dirname(join(root, path)), { recursive: true });
    writeFileSync(join(root, path), content);
  }
  return root;
}
function withRepo(files, assertions) {
  const root = repoWith(files);
  try { assertions(inspectLockfile(root, JSON.parse(files['package.json']))); }
  finally { rmSync(root, { recursive: true, force: true }); }
}

const manifest = '{"name":"app","version":"1.0.0","dependencies":{"lodash":"^4.17.21"}}';

// Telling a pnpm user to commit a package-lock.json breaks their install. The
// tool must name what it found and say plainly that it cannot read it.
for (const [manager, file, content] of [
  ['pnpm', 'pnpm-lock.yaml', "lockfileVersion: '9.0'\n"],
  ['yarn', 'yarn.lock', '# yarn lockfile v1\n'],
  ['bun', 'bun.lockb', 'binary'],
  ['npm shrinkwrap', 'npm-shrinkwrap.json', '{"lockfileVersion":3}'],
]) {
  test(`a ${manager} repository is told which lockfile was found, not to switch package manager`, () => {
    withRepo({ 'package.json': manifest, [file]: content }, (lockfile) => {
      assert.equal(lockfile.present, false);
      assert.ok(lockfile.error, 'an unreadable ecosystem is still an error, not a silent pass');
      assert.match(lockfile.error, new RegExp(file.replace('.', '\\.')), `the error does not name ${file}`);
      assert.deepEqual(lockfile.otherEcosystems.map((e) => e.file), [file]);
      assert.doesNotMatch(lockfile.error, /run 'npm install'|npm install/i,
        'advising npm install would break this repository');
    });
  });
}

test('several foreign lockfiles are all reported', () => {
  withRepo({ 'package.json': manifest, 'pnpm-lock.yaml': 'x', 'yarn.lock': 'y' }, (lockfile) => {
    assert.deepEqual(lockfile.otherEcosystems.map((e) => e.file).sort(), ['pnpm-lock.yaml', 'yarn.lock']);
  });
});

test('no lockfile at all says so without naming a foreign one', () => {
  withRepo({ 'package.json': manifest }, (lockfile) => {
    assert.equal(lockfile.present, false);
    assert.deepEqual(lockfile.otherEcosystems, []);
    assert.match(lockfile.error, /no lockfile/i);
  });
});

test('an npm repository is unaffected by the ecosystem detection', () => {
  withRepo({
    'package.json': manifest,
    'package-lock.json': JSON.stringify({
      name: 'app', lockfileVersion: 3,
      packages: { '': { name: 'app' }, 'node_modules/lodash': { version: '4.17.21', resolved: 'https://registry.npmjs.org/lodash/-/lodash-4.17.21.tgz', integrity: 'sha512-AAAA' } },
    }),
  }, (lockfile) => {
    assert.equal(lockfile.present, true);
    assert.equal(lockfile.error, null);
    assert.deepEqual(lockfile.otherEcosystems, []);
    assert.equal(lockfile.components.length, 1);
  });
});

test('a pnpm lockfile beside a readable npm one does not disturb the inventory', () => {
  withRepo({
    'package.json': manifest,
    'pnpm-lock.yaml': 'x',
    'package-lock.json': JSON.stringify({
      name: 'app', lockfileVersion: 3,
      packages: { '': { name: 'app' }, 'node_modules/lodash': { version: '4.17.21' } },
    }),
  }, (lockfile) => {
    assert.equal(lockfile.error, null);
    assert.deepEqual(lockfile.otherEcosystems.map((e) => e.file), ['pnpm-lock.yaml'],
      'the finding is still recorded so the pack can say the repository is mixed');
  });
});
