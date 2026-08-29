import { test } from 'node:test';
import { createHash } from 'node:crypto';
import assert from 'node:assert/strict';
import { inspectLockfile, packagePathToName, parseIntegrity, toPurl } from '../../src/inspect/lockfile.mjs';
import { inspectPackage } from '../../src/inspect/npm.mjs';
import { fixturePath } from '../helpers.mjs';

test('builds a purl for plain and scoped packages', () => {
  assert.equal(toPurl('minimist', '1.2.8'), 'pkg:npm/minimist@1.2.8');
  assert.equal(toPurl('@scope/name', '2.0.0'), 'pkg:npm/%40scope/name@2.0.0');
  assert.equal(toPurl(null, '1.0.0'), null);
});

test('reads the package name out of a nested node_modules path', () => {
  assert.equal(packagePathToName('node_modules/left-pad'), 'left-pad');
  assert.equal(packagePathToName('node_modules/a/node_modules/@s/b'), '@s/b');
});

test('converts npm integrity to the CycloneDX hash shape', () => {
  // The digest is a real one: this test used to pass 'sha512-YWJj', three
  // bytes, and assert that they came out as a SHA-512. They do not any more,
  // and the length cases live in test/unit/sbom-hashes.test.mjs.
  const digest = createHash('sha512').update('left-pad@1.3.0').digest();
  const parsed = parseIntegrity(`sha512-${digest.toString('base64')}`);
  assert.equal(parsed.alg, 'SHA-512');
  assert.equal(parsed.content, digest.toString('hex'));
  assert.equal(parseIntegrity('md5-YWJj'), null);
  assert.equal(parseIntegrity(undefined), null);
});

test('separates production, development and top-level components', () => {
  const root = fixturePath('partially-prepared');
  const packageInfo = inspectPackage(root);
  const lockfile = inspectLockfile(root, packageInfo);
  assert.equal(lockfile.present, true);
  assert.equal(lockfile.error, null);
  assert.equal(lockfile.lockfileVersion, 3);
  assert.equal(lockfile.counts.total, 3);
  assert.equal(lockfile.counts.development, 2);
  assert.equal(lockfile.counts.production, 1);
  assert.deepEqual(lockfile.topLevelNames, ['c8', 'left-pad']);
  assert.deepEqual(lockfile.unresolvedTopLevel, []);
});

test('reports a missing lockfile as an error, not as an empty inventory', () => {
  const root = fixturePath('minimal-unprepared');
  const lockfile = inspectLockfile(root, inspectPackage(root));
  assert.equal(lockfile.present, false);
  // Wording deliberately changed: the message must say a lockfile is missing
  // without prescribing a package manager, so this asserts the behaviour rather
  // than the sentence.
  assert.match(lockfile.error, /no lockfile/i);
  assert.doesNotMatch(lockfile.error, /npm install/i);
  assert.deepEqual(lockfile.components, []);
});

test('notes components that carry no integrity hash', () => {
  const root = fixturePath('hostile-repository');
  const lockfile = inspectLockfile(root, inspectPackage(root));
  assert.ok(lockfile.notes.some((note) => note.includes('no integrity hash')));
});
