#!/usr/bin/env node
/**
 * docs/coverage.md is generated from the ruleset and the regulation index, so
 * it cannot drift away from what the tool actually checks. A test asserts the
 * committed file matches this output; run this script after changing a rule.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const ruleset = JSON.parse(readFileSync(join(root, 'rules', 'cra-node-mvp-1.0.0.json'), 'utf8'));
const reference = JSON.parse(readFileSync(join(root, 'reference', 'loci.json'), 'utf8'));

const cell = (value) => String(value ?? '-').replace(/\|/g, '\\|').replace(/\s+/g, ' ').trim();
const truncate = (text, length) => (text.length > length ? `${text.slice(0, length - 3)}...` : text);

const controlsCiting = (prefix) => ruleset.controls.filter((control) => control.loci.some((locus) => locus === prefix || locus.startsWith(`${prefix}.`)));

function coverageTable(title, points, note) {
  const rows = points.map((locus) => {
    const entry = reference.loci[locus];
    const controls = controlsCiting(locus);
    return `| ${cell(entry.ref)} | ${cell(truncate(entry.text, 150))} | ${controls.length > 0 ? controls.map((c) => c.id).join(', ') : '**not covered**'} |`;
  });
  return `## ${title}\n\n${note}\n\n| Provision | Requirement | Controls |\n| --- | --- | --- |\n${rows.join('\n')}\n`;
}

const partI = Object.keys(reference.loci).filter((k) => /^AnnexI\.PartI\.\d+(\.[a-z])?$/.test(k)).sort(byPoint);
const partII = Object.keys(reference.loci).filter((k) => /^AnnexI\.PartII\.\d+$/.test(k)).sort(byPoint);
const annexII = Object.keys(reference.loci).filter((k) => /^AnnexII\.\d+$/.test(k)).sort(byPoint);
const annexVII = Object.keys(reference.loci).filter((k) => /^AnnexVII\.\d+$/.test(k)).sort(byPoint);

function byPoint(a, b) {
  const parse = (key) => key.split('.').map((part) => (/^\d+$/.test(part) ? Number(part) : part));
  const left = parse(a);
  const right = parse(b);
  for (let index = 0; index < Math.max(left.length, right.length); index += 1) {
    if (left[index] === right[index]) continue;
    if (left[index] === undefined) return -1;
    if (right[index] === undefined) return 1;
    return left[index] < right[index] ? -1 : 1;
  }
  return 0;
}

const covered = new Set(ruleset.controls.flatMap((control) => control.loci));
const document = `# Coverage

Generated from \`rules/${ruleset.rulesetId}-${ruleset.version}.json\` and
\`reference/loci.json\`. Do not edit by hand; run \`npm run docs\`.

This tool prepares technical evidence. It does not assess conformity and states
no legal conclusion about compliance with Regulation (EU) 2024/2847.

A provision marked **not covered** is one this ruleset says nothing about. That
is not a statement that it does not apply to your product.

${coverageTable(
  'Annex I, Part II - vulnerability handling requirements',
  partII,
  'This is where a repository can genuinely carry evidence, and where most of the ruleset sits.',
)}
${coverageTable(
  'Annex I, Part I - product security properties',
  partI,
  `**Almost none of this is observable in a repository.** Part I follows from the cybersecurity risk assessment required by Article 13(2) and (3), which states whether and how each point applies. The ruleset therefore records whether an assessment exists (CRA-NODE-060) and whether exclusions are justified as Article 13(4) requires (CRA-NODE-061). It does not, and should not, claim to evidence the properties themselves.`,
)}
${coverageTable(
  'Annex II - information and instructions to the user',
  annexII,
  'Checked point by point by CRA-NODE-050, against declarations and detected documents rather than against what accompanies the delivered product.',
)}
${coverageTable(
  'Annex VII - content of the technical documentation',
  annexVII,
  'The structure of the evidence pack follows this Annex, because it is the structure Article 31 makes a market surveillance authority ask for.',
)}
## Controls

| Control | Priority | Family | Cites |
| --- | --- | --- | --- |
${ruleset.controls.map((control) => `| ${control.id} | ${control.priority} | ${control.family} | ${control.loci.join(', ')} |`).join('\n')}

## Numbers

- ${ruleset.controls.length} controls across ${ruleset.families.length} families.
- ${covered.size} distinct provisions cited.
- ${reference.loci ? Object.keys(reference.loci).length : 0} provisions indexed and citable offline with \`probative cite\`.
- ${partII.filter((locus) => controlsCiting(locus).length > 0).length} of ${partII.length} Annex I, Part II points covered.
- ${annexVII.filter((locus) => controlsCiting(locus).length > 0).length} of ${annexVII.length} Annex VII points covered.
`;

writeFileSync(join(root, 'docs', 'coverage.md'), document, 'utf8');
console.log('docs/coverage.md regenerated');
