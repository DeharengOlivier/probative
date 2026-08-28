import { test } from 'node:test';
import assert from 'node:assert/strict';
import { appendFileSync, existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { main, EXIT } from '../../src/cli.mjs';
import { copyFixture, fixturePath, FIXED_NOW, tempDirectory } from '../helpers.mjs';

function invoke(argv) {
  const out = { text: '', write(chunk) { this.text += chunk; } };
  const err = { text: '', write(chunk) { this.text += chunk; } };
  const code = main(argv, { out, err });
  return { code, out: out.text, err: err.text };
}

test('running with no command prints usage and a usage exit code', () => {
  const { code, out } = invoke([]);
  assert.equal(code, EXIT.USAGE);
  assert.match(out, /prepare CRA technical evidence/);
});

test('the usage text states the product boundary before anything else', () => {
  const { out } = invoke(['--help']);
  assert.match(out, /does not assess\s+conformity/);
  assert.match(out, /states no\s+legal conclusion/);
  assert.match(out, /No project script is executed and no network request is made/);
});

test('an unknown command and an unknown option both fail as usage errors', () => {
  assert.equal(invoke(['frobnicate']).code, EXIT.USAGE);
  assert.equal(invoke(['inspect', '--wat']).code, EXIT.USAGE);
});

test('inspect is read-only and prints an inventory', () => {
  const { code, out } = invoke(['inspect', fixturePath('well-evidenced'), '--now', FIXED_NOW]);
  assert.equal(code, EXIT.OK);
  assert.match(out, /vaultkeeper 4\.2\.0/);
  assert.match(out, /Fingerprint {4}sha256:/);
});

test('inspect --json emits parseable canonical JSON', () => {
  const { out } = invoke(['inspect', fixturePath('well-evidenced'), '--json', '--now', FIXED_NOW]);
  const inventory = JSON.parse(out);
  assert.equal(inventory.package.name, 'vaultkeeper');
  assert.ok(inventory.stateFingerprint.startsWith('sha256:'));
});

test('cite prints the verbatim text of a provision', () => {
  const { code, out } = invoke(['cite', 'AnnexI.PartII.5']);
  assert.equal(code, EXIT.OK);
  assert.match(out, /Annex I, Part II, point \(5\)/);
  assert.match(out, /coordinated vulnerability disclosure/);
  assert.match(out, /data\.europa\.eu\/eli\/reg\/2024\/2847/);
});

test('cite rejects an unknown locus instead of inventing one', () => {
  const { code, err } = invoke(['cite', 'AnnexI.PartII.99']);
  assert.equal(code, EXIT.USAGE);
  assert.match(err, /unknown locus/);
});

test('rules lists every control with the provisions it cites', () => {
  const { code, out } = invoke(['rules']);
  assert.equal(code, EXIT.OK);
  assert.match(out, /cra-node-mvp 1\.0\.0, 24 controls/);
  assert.match(out, /CRA-NODE-080/);
  assert.match(out, /cites Art\.14\.1/);
});

test('profile init writes a template naming the fields to answer', () => {
  const scratch = copyFixture('minimal-unprepared');
  try {
    const { code, out } = invoke(['profile', 'init', scratch.path]);
    assert.equal(code, EXIT.OK);
    assert.match(out, /product\.commercialName/);
    const written = JSON.parse(readFileSync(join(scratch.path, 'probative.profile.json'), 'utf8'));
    assert.equal(written.schemaVersion, '1.0.0');
    assert.equal(written.regulatoryPosition.role, 'undetermined');
    assert.equal(invoke(['profile', 'init', scratch.path]).code, EXIT.USAGE, 'an existing profile is not replaced without --force');
  } finally {
    scratch.cleanup();
  }
});

test('run writes a pack and reports the gaps to close first', () => {
  const output = tempDirectory();
  try {
    const destination = join(output.path, 'pack');
    const { code, out } = invoke(['run', fixturePath('partially-prepared'), '--out', destination, '--now', FIXED_NOW]);
    assert.equal(code, EXIT.OK);
    assert.match(out, /Evidence pack written to/);
    assert.match(out, /Close these first:/);
    assert.match(out, /not a conformity assessment/);
    for (const file of ['README.md', 'assessment.json', 'gaps.md', 'annex-vii-map.md', 'SHA256SUMS', 'pack.json']) {
      assert.ok(existsSync(join(destination, file)), `${file} is missing from the pack`);
    }
  } finally {
    output.cleanup();
  }
});

test('--fail-on-p0 gives CI a distinct exit code', () => {
  const output = tempDirectory();
  try {
    const failing = invoke(['run', fixturePath('minimal-unprepared'), '--out', join(output.path, 'a'), '--now', FIXED_NOW, '--fail-on-p0']);
    assert.equal(failing.code, EXIT.P0_GAPS);
    const passing = invoke(['run', fixturePath('well-evidenced'), '--out', join(output.path, 'b'), '--now', FIXED_NOW, '--fail-on-p0']);
    assert.equal(passing.code, EXIT.OK);
  } finally {
    output.cleanup();
  }
});

test('verify reports a tampered pack with a distinct exit code', () => {
  const output = tempDirectory();
  try {
    const destination = join(output.path, 'pack');
    invoke(['run', fixturePath('well-evidenced'), '--out', destination, '--now', FIXED_NOW]);
    assert.equal(invoke(['verify', destination]).code, EXIT.OK);
    appendFileSync(join(destination, 'gaps.md'), 'tampered');
    const { code, out } = invoke(['verify', destination]);
    assert.equal(code, EXIT.VERIFICATION_FAILED);
    assert.match(out, /FAIL file digests/);
  } finally {
    output.cleanup();
  }
});

test('sbom emits a CycloneDX document on stdout', () => {
  const { code, out } = invoke(['sbom', fixturePath('well-evidenced'), '--now', FIXED_NOW]);
  assert.equal(code, EXIT.OK);
  const sbom = JSON.parse(out);
  assert.equal(sbom.bomFormat, 'CycloneDX');
  assert.equal(sbom.specVersion, '1.6');
});

test('sbom fails loudly when there is no lockfile', () => {
  const { code, out } = invoke(['sbom', fixturePath('minimal-unprepared'), '--now', FIXED_NOW]);
  assert.equal(code, EXIT.RUNTIME);
  assert.match(out, /No bill of materials could be produced/);
});

test('a path that does not exist is a usage error, not a crash', () => {
  const { code, err } = invoke(['inspect', '/nonexistent-path-for-tests']);
  assert.equal(code, EXIT.USAGE);
  assert.match(err, /path does not exist/);
});
