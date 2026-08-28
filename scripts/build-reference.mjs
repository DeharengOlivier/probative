#!/usr/bin/env node
/**
 * Rebuild reference/ from the Official Journal.
 *
 * The Regulation is the ground truth of this tool, so it is fetched from the
 * Publications Office rather than transcribed, flattened to text, indexed into
 * addressable provisions, and hashed. Nothing here paraphrases: the index holds
 * the official wording verbatim.
 *
 *   node scripts/build-reference.mjs            rebuild from the local copy
 *   node scripts/build-reference.mjs --fetch    re-download first
 *
 * EUR-Lex sits behind a JavaScript challenge, so the fetch goes through the
 * Publications Office content-negotiation endpoint, which serves the same
 * document without one.
 */
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const referenceDirectory = join(root, 'reference');
const SOURCE_URL = 'http://publications.europa.eu/resource/celex/32024R2847';
const SOURCE_XHTML = join(referenceDirectory, 'regulation-2024-2847.source.xhtml');
const SOURCE_TEXT = join(referenceDirectory, 'regulation-2024-2847.en.txt');
const INDEX = join(referenceDirectory, 'loci.json');

const ARTICLES = [3, 6, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24, 25, 26,
  27, 28, 29, 30, 31, 32, 33, 34, 52, 64, 71];

async function fetchSource() {
  const response = await fetch(SOURCE_URL, {
    headers: { Accept: 'application/xhtml+xml', 'Accept-Language': 'eng' },
  });
  if (!response.ok) throw new Error(`fetch failed: HTTP ${response.status}`);
  const body = await response.text();
  if (body.length < 100000) throw new Error(`fetch returned only ${body.length} bytes; expected the full Regulation`);
  writeFileSync(SOURCE_XHTML, body, 'utf8');
  console.log(`fetched ${body.length} bytes from ${SOURCE_URL}`);
}

/** Flatten the XHTML to text while preserving one block per line. */
function flatten(xhtml) {
  let text = xhtml.replace(/<(script|style)[^>]*>[\s\S]*?<\/\1>/gi, '');
  text = text.replace(/<\/(p|div|td|tr|h[1-6]|li|table)>/gi, '\n');
  text = text.replace(/<br\s*\/?>/gi, '\n');
  text = text.replace(/<[^>]+>/g, '');
  text = text.replace(/&(#\d+|#x[0-9a-f]+|[a-z]+);/gi, (match, entity) => {
    if (entity.startsWith('#x')) return String.fromCodePoint(parseInt(entity.slice(2), 16));
    if (entity.startsWith('#')) return String.fromCodePoint(Number(entity.slice(1)));
    return { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' }[entity.toLowerCase()] ?? match;
  });
  text = text.replace(/[ \t ]+/g, ' ');
  text = text.replace(/\n\s*\n+/g, '\n');
  return text;
}

function buildIndex(lines) {
  const loci = {};
  const trimmed = lines.map((line) => line.trim());
  const findLine = (predicate, from = 0, to = trimmed.length) => {
    for (let index = from; index < to; index += 1) if (predicate(trimmed[index], index)) return index;
    return -1;
  };

  const annexStart = findLine((line) => line === 'ANNEX I');

  // Articles: 'Article N' on its own line, followed by the title, then numbered paragraphs.
  const articleStarts = new Map();
  trimmed.forEach((line, index) => {
    const match = /^Article (\d+)$/.exec(line);
    if (match && trimmed[index + 1] && !/^\d/.test(trimmed[index + 1])) {
      const number = Number(match[1]);
      if (!articleStarts.has(number)) articleStarts.set(number, index);
    }
  });

  const articleBlock = (number) => {
    const start = articleStarts.get(number);
    if (start === undefined || start > annexStart) return null;
    const later = [...articleStarts.values()].filter((index) => index > start && index < annexStart);
    return { start, end: later.length > 0 ? Math.min(...later) : annexStart };
  };

  for (const number of ARTICLES) {
    const block = articleBlock(number);
    if (!block) continue;
    const title = trimmed[block.start + 1];
    const paragraphs = {};
    let current = null;
    let buffer = [];
    for (const line of trimmed.slice(block.start + 2, block.end)) {
      // The enacting terms end at the signature block. Everything after it is
      // the Official Journal's footnote apparatus, which would otherwise be
      // swallowed into the last article's final paragraph.
      if (/^Done at /.test(line)) break;
      const match = /^(\d+)\.\s+(.*)$/.exec(line);
      if (match) {
        if (current) paragraphs[current] = buffer.join('\n').trim();
        current = match[1];
        buffer = [match[2]];
      } else if (current) {
        buffer.push(line);
      }
    }
    if (current) paragraphs[current] = buffer.join('\n').trim();

    const children = Object.keys(paragraphs);
    for (const key of children) {
      loci[`Art.${number}.${key}`] = {
        kind: 'article_paragraph', ref: `Article ${number}(${key})`, label: title, text: paragraphs[key],
      };
    }
    if (children.length > 0) {
      loci[`Art.${number}`] = {
        kind: 'article', ref: `Article ${number}`, label: title,
        text: `${title}\n\n${children.map((key) => `${key}. ${paragraphs[key]}`).join('\n\n')}`,
        children: children.map((key) => `Art.${number}.${key}`),
      };
    }
  }

  // Article 3 definitions.
  const definitionsBlock = articleBlock(3);
  if (definitionsBlock) {
    const segment = trimmed.slice(definitionsBlock.start, definitionsBlock.end).join('\n');
    for (const match of segment.matchAll(/‘([^’]+)’ means ([^\n]+)/g)) {
      const term = match[1];
      const slug = term.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
      loci[`Art.3.def.${slug}`] = {
        kind: 'definition', ref: `Article 3, '${term}'`, label: term,
        text: `'${term}' means ${match[2]}`,
      };
    }
  }

  // Annexes.
  const annexNames = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII'];
  const annexPositions = annexNames
    .map((name) => ({ name, index: findLine((line) => line === `ANNEX ${name}`) }))
    .filter((entry) => entry.index >= 0);
  const annexRange = (name) => {
    const position = annexPositions.findIndex((entry) => entry.name === name);
    if (position < 0) return null;
    return {
      start: annexPositions[position].index,
      end: position + 1 < annexPositions.length ? annexPositions[position + 1].index : trimmed.length,
    };
  };

  const parsePoints = (segment, prefix, reference, label) => {
    let current = null;
    let sub = null;
    let buffer = [];
    const flush = () => {
      if (current === null) return;
      const key = sub === null ? `${prefix}.${current}` : `${prefix}.${current}.${sub}`;
      const text = buffer.join('\n').trim();
      if (text) loci[key] = { kind: 'annex_point', ref: reference(current, sub), label, text };
      buffer = [];
    };
    for (const line of segment) {
      const numbered = /^\((\d+)\)$/.exec(line) ?? /^(\d+)\.$/.exec(line);
      const lettered = /^\(([a-z])\)$/.exec(line);
      if (numbered) { flush(); current = numbered[1]; sub = null; }
      else if (lettered && current !== null) { flush(); sub = lettered[1]; }
      else buffer.push(line);
    }
    flush();
  };

  const annexOne = annexRange('I');
  const partTwo = findLine((line) => line.startsWith('Part II'), annexOne.start, annexOne.end);
  const partOne = findLine((line) => line.startsWith('Part I '), annexOne.start, annexOne.end);
  parsePoints(trimmed.slice(partOne + 1, partTwo), 'AnnexI.PartI',
    (point, letter) => `Annex I, Part I, point (${point})${letter ? `(${letter})` : ''}`,
    'Essential cybersecurity requirements - product properties');
  parsePoints(trimmed.slice(partTwo + 1, annexOne.end), 'AnnexI.PartII',
    (point, letter) => `Annex I, Part II, point (${point})${letter ? `(${letter})` : ''}`,
    'Vulnerability handling requirements');

  for (const [name, prefix, label] of [
    ['II', 'AnnexII', 'Information and instructions to the user'],
    ['V', 'AnnexV', 'EU declaration of conformity'],
    ['VII', 'AnnexVII', 'Content of the technical documentation'],
  ]) {
    const range = annexRange(name);
    parsePoints(trimmed.slice(range.start + 3, range.end), prefix,
      (point, letter) => `Annex ${name}, point ${point}${letter ? `(${letter})` : ''}`, label);
  }

  for (const [name, key, label] of [
    ['III', 'AnnexIII', 'Important products with digital elements'],
    ['IV', 'AnnexIV', 'Critical products with digital elements'],
  ]) {
    const range = annexRange(name);
    loci[key] = { kind: 'annex', ref: `Annex ${name}`, label,
      text: trimmed.slice(range.start + 2, range.end).filter(Boolean).join('\n') };
  }

  // The chapeau of Annex I, Part II is repeated into its first point by the
  // flattening; strip it so the point reads as it does in the Official Journal.
  const chapeau = 'Manufacturers of products with digital elements shall:';
  for (const entry of Object.values(loci)) {
    if (entry.text.startsWith(chapeau)) entry.text = entry.text.slice(chapeau.length).trim();
  }

  return Object.fromEntries(Object.entries(loci).sort(([a], [b]) => a.localeCompare(b)));
}

const sha256 = (buffer) => createHash('sha256').update(buffer).digest('hex');

if (process.argv.includes('--fetch')) await fetchSource();

const xhtml = readFileSync(SOURCE_XHTML, 'utf8');
const text = flatten(xhtml);
writeFileSync(SOURCE_TEXT, text, 'utf8');

const loci = buildIndex(text.split('\n'));
const empty = Object.entries(loci).filter(([, entry]) => !entry.text || entry.text.trim().length < 10);
if (empty.length > 0) throw new Error(`${empty.length} provisions came out empty: ${empty.map(([key]) => key).join(', ')}`);

writeFileSync(INDEX, `${JSON.stringify({
  regulation: 'Regulation (EU) 2024/2847 (Cyber Resilience Act)',
  celex: '32024R2847',
  eli: 'http://data.europa.eu/eli/reg/2024/2847/oj',
  oj: 'OJ L, 2024/2847, 20.11.2024',
  retrievedFrom: SOURCE_URL,
  sourceFile: 'regulation-2024-2847.en.txt',
  sourceSha256: sha256(readFileSync(SOURCE_TEXT)),
  loci,
}, null, 2)}\n`, 'utf8');

const sums = ['regulation-2024-2847.en.txt', 'regulation-2024-2847.source.xhtml', 'loci.json']
  .map((file) => `${sha256(readFileSync(join(referenceDirectory, file)))}  ${file}`).join('\n');
writeFileSync(join(referenceDirectory, 'SHA256SUMS'), `${sums}\n`, 'utf8');

console.log(`indexed ${Object.keys(loci).length} provisions`);
