import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { assertValid, validate } from '../../src/util/schema.mjs';
import { PROFILE_SCHEMA, loadProfile, profileTemplate } from '../../src/profile/index.mjs';
import { fixturePath, projectRoot } from '../helpers.mjs';

test('reports type, pattern, minimum and unexpected-property violations', () => {
  const schema = { type: 'object', required: ['a'], additionalProperties: false,
    properties: { a: { type: 'string', pattern: '^x' }, b: { type: 'integer', minimum: 1 } } };
  const errors = validate(schema, { a: 'y', b: 0, c: true });
  assert.equal(errors.length, 3);
  assert.deepEqual(errors.map((error) => error.path).sort(), ['$.a', '$.b', '$.c']);
  assert.deepEqual(validate(schema, { a: 'xy', b: 2 }), []);
});

test('refuses a schema keyword it does not implement, rather than ignoring it', () => {
  const errors = validate({ type: 'object', patternProperties: {} }, {});
  assert.ok(errors.some((error) => /unsupported keyword 'patternProperties'/.test(error.message)));
});

test('resolves $ref into $defs', () => {
  const schema = { $defs: { name: { type: 'string', minLength: 2 } }, type: 'object', properties: { n: { $ref: '#/$defs/name' } } };
  assert.deepEqual(validate(schema, { n: 'ok' }), []);
  assert.equal(validate(schema, { n: 'x' }).length, 1);
});

test('the shipped profile schema stays inside the supported keyword subset', () => {
  // Validating an arbitrary document exercises every branch of the schema; an
  // unsupported keyword would surface here rather than silently passing.
  const errors = validate(PROFILE_SCHEMA, JSON.parse(profileTemplate()));
  assert.ok(!errors.some((error) => /unsupported keyword/.test(error.message)), JSON.stringify(errors.filter((e) => /unsupported/.test(e.message))));
});

test('the blank template names exactly the fields that must be answered', () => {
  const errors = validate(PROFILE_SCHEMA, JSON.parse(profileTemplate()));
  assert.deepEqual(errors.map((error) => error.path).sort(), [
    '$.manufacturer.legalName',
    '$.manufacturer.singlePointOfContact',
    '$.product.commercialName',
    '$.product.intendedPurpose',
    '$.regulatoryPosition.determinedBy',
    '$.vulnerabilityHandling.reportingContact',
  ]);
});

test('the well-evidenced fixture profile validates', () => {
  const loaded = loadProfile(fixturePath('well-evidenced'));
  assert.equal(loaded.present, true);
  assert.deepEqual(loaded.errors, []);
  assert.equal(loaded.valid, true);
});

test('a missing profile is a normal state, not a failure', () => {
  const loaded = loadProfile(fixturePath('minimal-unprepared'));
  assert.equal(loaded.present, false);
  assert.equal(loaded.profile, null);
  assert.deepEqual(loaded.errors, []);
});

test('every ruleset control resolves to a locus of the shipped regulation text', () => {
  const ruleset = JSON.parse(readFileSync(join(projectRoot, 'rules', 'cra-node-mvp-1.0.0.json'), 'utf8'));
  const reference = JSON.parse(readFileSync(join(projectRoot, 'reference', 'loci.json'), 'utf8'));
  const families = new Set(ruleset.families.map((family) => family.id));
  for (const control of ruleset.controls) {
    assert.ok(families.has(control.family), `${control.id} names an unknown family`);
    assert.ok(control.loci.length > 0, `${control.id} cites nothing`);
    for (const locus of control.loci) {
      assert.ok(reference.loci[locus], `${control.id} cites unknown locus ${locus}`);
    }
    assert.ok(control.remediation && control.limitations, `${control.id} lacks remediation or limitations`);
    assert.ok(['P0', 'P1', 'P2'].includes(control.priority), `${control.id} has an invalid priority`);
  }
});

test('assertValid raises a readable error listing the paths', () => {
  assert.throws(
    () => assertValid({ type: 'object', required: ['a'] }, {}, 'thing'),
    /thing failed schema validation:\n {2}\$\.a: required property is missing/,
  );
});
