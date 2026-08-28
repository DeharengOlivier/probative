import { test } from 'node:test';
import assert from 'node:assert/strict';
import { containsSecret, redact, redactDeep } from '../../src/util/redact.mjs';
import { CANARIES } from '../helpers.mjs';

test('redacts each canary shape used by the hostile fixture', () => {
  for (const [name, value] of Object.entries(CANARIES)) {
    if (name === 'injection') continue;
    const input = name === 'assigned' ? `password = "${value}"` : `value ${value} here`;
    const { text } = redact(input);
    assert.ok(!text.includes(value), `${name} survived redaction: ${text}`);
  }
});

test('redacts a private key block whole', () => {
  const input = '-----BEGIN RSA PRIVATE KEY-----\nMIIEsecretmaterial\n-----END RSA PRIVATE KEY-----';
  const { text, findings } = redact(input);
  assert.ok(!text.includes('MIIEsecretmaterial'));
  assert.ok(findings.some((finding) => finding.rule === 'private-key-block'));
});

test('keeps the assignment shape so the reader still sees which key was set', () => {
  const { text } = redact('api_key = "abcdefghijklmnop"');
  assert.match(text, /^api_key = "\[REDACTED:assigned-secret\]"$/);
});

test('strips credentials from a URL but keeps the host', () => {
  const { text } = redact('https://user:hunter2pass@registry.example.com/x');
  assert.ok(!text.includes('hunter2pass'));
  assert.ok(text.includes('registry.example.com'));
});

test('leaves ordinary prose untouched', () => {
  const input = 'The support period ends in 2031-06 and the contact is security@example.com.';
  assert.equal(redact(input).text, input);
  assert.equal(containsSecret(input), false);
});

test('redacts recursively through nested structures', () => {
  const findings = [];
  const output = redactDeep({ a: [{ b: `token ${CANARIES.github}` }], c: 3, d: null }, findings);
  assert.ok(!JSON.stringify(output).includes(CANARIES.github));
  assert.equal(output.c, 3);
  assert.equal(output.d, null);
  assert.ok(findings.length > 0);
});

test('handles empty and non-string input without throwing', () => {
  assert.deepEqual(redact(''), { text: '', findings: [] });
  assert.deepEqual(redact(null), { text: '', findings: [] });
});
