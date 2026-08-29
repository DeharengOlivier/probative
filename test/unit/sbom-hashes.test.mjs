import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { parseIntegrity } from '../../src/inspect/lockfile.mjs';
import { runPipeline } from '../../src/pipeline.mjs';
import { fixturePath, FIXED_NOW } from '../helpers.mjs';

/**
 * CycloneDX accepts a hash only as the hex digest of the length its algorithm
 * produces. A digest of any other length makes the whole document invalid, so
 * one malformed integrity in a lockfile would cost the reader the entire bill
 * of materials rather than one component. What cannot be read as a digest is
 * therefore not emitted as one.
 */

/** The pattern CycloneDX 1.6 holds hash content to. */
const CDX_HASH_CONTENT = /^(?:[a-f0-9]{32}|[a-f0-9]{40}|[a-f0-9]{64}|[a-f0-9]{96}|[a-f0-9]{128})$/i;

const base64Of = (bytes) => Buffer.from(bytes).toString('base64');
const digestOf = (algorithm, text) => createHash(algorithm).update(text).digest('base64');

test('a digest of the length its algorithm produces is kept', () => {
  const cases = [
    ['sha1', 'SHA-1', 40],
    ['sha256', 'SHA-256', 64],
    ['sha384', 'SHA-384', 96],
    ['sha512', 'SHA-512', 128],
  ];
  for (const [npmAlgorithm, cdxAlgorithm, hexLength] of cases) {
    const parsed = parseIntegrity(`${npmAlgorithm}-${digestOf(npmAlgorithm, 'left-pad@1.3.0')}`);
    assert.equal(parsed.alg, cdxAlgorithm);
    assert.equal(parsed.content.length, hexLength);
    assert.match(parsed.content, CDX_HASH_CONTENT);
  }
});

test('a digest of the wrong length for its algorithm is not a digest', () => {
  // The lenient reading used to emit these as SHA-512, which is how a
  // hand-edited lockfile turned into a bill of materials no validator accepts.
  assert.equal(parseIntegrity('sha512-YWJj'), null);
  assert.equal(parseIntegrity(`sha512-${digestOf('sha256', 'x')}`), null);
  assert.equal(parseIntegrity(`sha1-${digestOf('sha512', 'x')}`), null);
  assert.equal(parseIntegrity(`sha512-${base64Of(new Uint8Array(63))}`), null);
  assert.equal(parseIntegrity(`sha512-${base64Of(new Uint8Array(65))}`), null);
});

test('a truncated or padded base64 body is not a digest either', () => {
  // The padding character ends the encoded data. Anything after it decodes to
  // nothing, which is exactly how a 88-character string can hold 14 bytes.
  assert.equal(parseIntegrity(`sha512-${base64Of(Buffer.from('minimist@1.2.8'))}${'A'.repeat(68)}`), null);
  assert.equal(parseIntegrity('sha512-'), null);
  assert.equal(parseIntegrity('sha512-!!!!'), null);
});

test('an unknown algorithm is still refused', () => {
  assert.equal(parseIntegrity('md5-YWJj'), null);
  assert.equal(parseIntegrity(undefined), null);
  assert.equal(parseIntegrity('no-separator-here'), null);
});

for (const fixture of ['well-evidenced', 'partially-prepared', 'hostile-repository']) {
  test(`every hash in the bill of materials of ${fixture} is one a validator accepts`, () => {
    const { files } = runPipeline(fixturePath(fixture), { nowOverride: FIXED_NOW });
    const sbom = JSON.parse(files['sbom.cdx.json']);
    const hashes = sbom.components.flatMap((component) => component.hashes ?? []);
    for (const hash of hashes) {
      assert.match(hash.alg, /^SHA-(?:1|256|384|512)$/);
      assert.match(hash.content, CDX_HASH_CONTENT, `${hash.alg} content is not a digest of a valid length`);
    }
  });
}

test('a component whose integrity cannot be read is marked, not silently unhashed', () => {
  const { files } = runPipeline(fixturePath('well-evidenced'), { nowOverride: FIXED_NOW });
  const sbom = JSON.parse(files['sbom.cdx.json']);
  for (const component of sbom.components) {
    if (component.hashes) continue;
    const properties = component.properties ?? [];
    assert.ok(
      properties.some((property) => property.name === 'cra:integrity:missing'),
      `${component.name} has no hash and does not say so`,
    );
  }
});
