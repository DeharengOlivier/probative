#!/usr/bin/env node
/**
 * Ask the Official Journal whether the text this tool ships is still the text
 * in force.
 *
 * Rebuilding the index from the local copy proves only that the build is
 * reproducible. It cannot see a corrigendum published last month, and a
 * corrigendum is exactly how the wording this tool quotes stops being the
 * wording that applies. This is the check that can actually fail for the right
 * reason, so it is the one the schedule runs.
 *
 *   node scripts/check-upstream.mjs
 *
 * Exit 0 when the shipped reference is current, 1 when it is not, 2 when the
 * sources could not be reached (an unreachable registry is not a clean bill of
 * health and must not be reported as one).
 */
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const referenceDirectory = join(root, 'reference');

const RECORD_URL = 'https://eur-lex.europa.eu/legal-content/EN/ALL/?uri=CELEX:32024R2847';
const SOURCE_URL = 'http://publications.europa.eu/resource/celex/32024R2847';

/**
 * Pull the corrigenda out of the Regulation's EUR-Lex record.
 *
 * A row reads 'Corrected by 32024R2847R(03) (FR, HU)'. A language list means
 * the corrigendum touches only those versions; no list means every version,
 * English included. Absence of a list is therefore the dangerous case, not the
 * harmless one, so it defaults to affecting English.
 *
 * @param {string} html the record page, tags included
 * @returns {Array<{celex: string, languages: string|null, affectsEnglish: boolean}>}
 * Complexity: O(size of the page).
 */
export function parseCorrigenda(html) {
  const text = html.replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ');
  const found = new Map();
  const pattern = /Corrected by\s+(32024R2847R\(\d{2}\))(?:\s*\(([A-Z]{2}(?:,\s*[A-Z]{2})*)\))?/g;
  for (const match of text.matchAll(pattern)) {
    const [, celex, languages = null] = match;
    const affectsEnglish = languages === null || /\bEN\b/.test(languages);
    // The same row is repeated in several tabs; keep the most specific reading.
    const existing = found.get(celex);
    if (!existing || (existing.languages === null && languages !== null)) {
      found.set(celex, { celex, languages: languages ?? null, affectsEnglish });
    }
  }
  return [...found.values()].sort((a, b) => a.celex.localeCompare(b.celex));
}

/** @returns {{missing: string[], unexpected: string[]}} */
export function compareWithShipped(upstream, shipped) {
  const applied = new Set(shipped.corrigenda.map((c) => c.celex));
  const known = new Set([...applied, ...(shipped.notAffectingEnglish ?? []).map((c) => c.celex)]);
  return {
    missing: upstream.filter((c) => c.affectsEnglish && !applied.has(c.celex)).map((c) => c.celex),
    unexpected: upstream.filter((c) => !known.has(c.celex)).map((c) => c.celex),
  };
}

async function get(url, headers = {}) {
  const response = await fetch(url, { headers, signal: AbortSignal.timeout(30000) });
  if (!response.ok) throw new Error(`HTTP ${response.status} from ${url}`);
  return response.text();
}

// process.argv[1] is the path as invoked, relative and unencoded. Comparing it
// to import.meta.url by string concatenation never matches, which would leave
// this check exiting 0 without running anything.
const invokedDirectly = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (invokedDirectly) {
  const shipped = JSON.parse(readFileSync(join(referenceDirectory, 'corrigenda.json'), 'utf8'));
  const index = JSON.parse(readFileSync(join(referenceDirectory, 'loci.json'), 'utf8'));
  let problems = 0;

  let record;
  try {
    record = await get(RECORD_URL);
  } catch (error) {
    console.error(`could not reach the Official Journal record: ${error.message}`);
    process.exit(2);
  }

  const upstream = parseCorrigenda(record);
  if (upstream.length === 0) {
    console.error('no corrigendum rows were found on the record page; the page layout changed and this check is blind');
    process.exit(2);
  }
  const { missing, unexpected } = compareWithShipped(upstream, shipped);
  console.log(`upstream corrigenda: ${upstream.map((c) => `${c.celex}${c.languages ? ` (${c.languages})` : ''}`).join(', ')}`);
  for (const celex of unexpected) {
    console.error(`NEW corrigendum ${celex} is not recorded in reference/corrigenda.json`);
    problems += 1;
  }
  for (const celex of missing) {
    console.error(`corrigendum ${celex} affects the English text and is not applied`);
    problems += 1;
  }

  try {
    const body = await get(SOURCE_URL, { Accept: 'application/xhtml+xml', 'Accept-Language': 'eng' });
    const shippedXhtml = readFileSync(join(referenceDirectory, 'regulation-2024-2847.source.xhtml'), 'utf8');
    if (createHash('sha256').update(body).digest('hex') !== createHash('sha256').update(shippedXhtml).digest('hex')) {
      console.error('the document served by the Publications Office no longer matches the shipped copy; rebuild with --fetch and review the diff');
      problems += 1;
    } else {
      console.log('the as-published document is byte-identical to the shipped copy');
    }
  } catch (error) {
    console.error(`could not reach the Publications Office: ${error.message}`);
    process.exit(2);
  }

  console.log(`index built from ${index.correctedFile}, ${index.corrigendaApplied.length} corrigenda applied`);
  process.exit(problems === 0 ? 0 : 1);
}
