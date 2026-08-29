import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseCorrigenda, compareWithShipped } from '../../scripts/check-upstream.mjs';

const projectRoot = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const shipped = JSON.parse(readFileSync(join(projectRoot, 'reference', 'corrigenda.json'), 'utf8'));

// The shape EUR-Lex actually serves, tags and repeated tabs included.
const row = (celex, langs) => `<td/> Corrected by <a href="x">${celex}</a>${langs ? ` (${langs})` : ''} <td data-sort>`;
const page = (...rows) => `<html><body>${rows.join('')}${rows.join('')}</body></html>`;

test('a corrigendum with no language list is read as affecting English', () => {
  const [entry] = parseCorrigenda(page(row('32024R2847R(02)', null)));
  assert.equal(entry.languages, null);
  assert.equal(entry.affectsEnglish, true, 'no list means every language; the silent case must be the alarming one');
});

test('a corrigendum limited to other languages does not affect English', () => {
  const [entry] = parseCorrigenda(page(row('32024R2847R(03)', 'FR, HU')));
  assert.equal(entry.languages, 'FR, HU');
  assert.equal(entry.affectsEnglish, false);
});

test('an English-only corrigendum affects English', () => {
  const [entry] = parseCorrigenda(page(row('32024R2847R(01)', 'EN')));
  assert.equal(entry.affectsEnglish, true);
});

test('rows repeated across tabs are deduplicated, keeping the language list', () => {
  const html = `<html>${row('32024R2847R(05)', null)}${row('32024R2847R(05)', 'SK')}</html>`;
  const entries = parseCorrigenda(html);
  assert.equal(entries.length, 1);
  assert.equal(entries[0].languages, 'SK');
});

test('a page with no corrigendum rows yields nothing, so the caller can refuse to pass', () => {
  assert.deepEqual(parseCorrigenda('<html><body>nothing here</body></html>'), []);
});

// --- the conditions this check exists for -----------------------------------

test('a brand new corrigendum is reported as unexpected', () => {
  const upstream = parseCorrigenda(page(row('32024R2847R(08)', null)));
  const { unexpected, missing } = compareWithShipped(upstream, shipped);
  assert.deepEqual(unexpected, ['32024R2847R(08)']);
  assert.deepEqual(missing, ['32024R2847R(08)'], 'it affects English and is not applied');
});

test('a new corrigendum in another language is unexpected but not missing', () => {
  const upstream = parseCorrigenda(page(row('32024R2847R(09)', 'PT')));
  const { unexpected, missing } = compareWithShipped(upstream, shipped);
  assert.deepEqual(unexpected, ['32024R2847R(09)']);
  assert.deepEqual(missing, []);
});

test('the corrigenda currently published upstream are all accounted for', () => {
  const upstream = ['01', '02', '03', '04', '05', '06', '07']
    .map((n) => row(`32024R2847R(${n})`, { '01': 'EN', '03': 'FR, HU', '05': 'SK', '06': 'FR', '07': 'DE' }[n] ?? null));
  const { unexpected, missing } = compareWithShipped(parseCorrigenda(page(...upstream)), shipped);
  assert.deepEqual(unexpected, []);
  assert.deepEqual(missing, []);
});

test('the entrypoint guard resolves a relative invocation, or the check silently passes', () => {
  const source = readFileSync(join(projectRoot, 'scripts', 'check-upstream.mjs'), 'utf8');
  assert.doesNotMatch(source, /import\.meta\.url === `file:\/\/\$\{process\.argv\[1\]\}`/,
    'string-concatenating argv[1] never matches a relative path, so nothing would run');
  assert.match(source, /pathToFileURL\(process\.argv\[1\]\)/);
});
