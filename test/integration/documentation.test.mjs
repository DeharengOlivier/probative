import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { projectRoot } from '../helpers.mjs';

test('docs/coverage.md is regenerated from the ruleset and has not drifted', () => {
  const path = join(projectRoot, 'docs', 'coverage.md');
  const committed = readFileSync(path, 'utf8');
  execFileSync('node', [join(projectRoot, 'scripts', 'generate-coverage-doc.mjs')], { cwd: projectRoot, stdio: 'ignore' });
  const regenerated = readFileSync(path, 'utf8');
  if (committed !== regenerated) {
    writeFileSync(path, committed, 'utf8');
    assert.fail('docs/coverage.md is stale; run `npm run docs` and commit the result');
  }
});

test('the shipped regulation text matches the digests recorded beside it', () => {
  const sums = readFileSync(join(projectRoot, 'reference', 'SHA256SUMS'), 'utf8');
  execFileSync('shasum', ['-a', '256', '-c', 'SHA256SUMS'], { cwd: join(projectRoot, 'reference'), stdio: 'ignore' });
  for (const file of ['regulation-2024-2847.en.txt', 'loci.json']) {
    assert.ok(sums.includes(file), `${file} is not covered by SHA256SUMS`);
  }
});

test('the locus index records the digest of the text it was derived from', () => {
  const reference = JSON.parse(readFileSync(join(projectRoot, 'reference', 'loci.json'), 'utf8'));
  const sums = readFileSync(join(projectRoot, 'reference', 'SHA256SUMS'), 'utf8');
  assert.ok(sums.includes(reference.sourceSha256), 'loci.json was derived from a text that is no longer the one shipped');
  assert.equal(reference.celex, '32024R2847');
});

test('every quoted provision is non-empty and carries a citation form', () => {
  const reference = JSON.parse(readFileSync(join(projectRoot, 'reference', 'loci.json'), 'utf8'));
  assert.ok(Object.keys(reference.loci).length > 250);
  for (const [locus, entry] of Object.entries(reference.loci)) {
    assert.ok(entry.ref && entry.ref.length > 3, `${locus} has no citation form`);
    assert.ok(entry.text && entry.text.trim().length > 10, `${locus} has no text`);
  }
});

test('the public documentation states the boundary on its first screen', () => {
  const readme = readFileSync(join(projectRoot, 'README.md'), 'utf8').slice(0, 1200);
  assert.match(readme, /does not assess conformity/);
  assert.match(readme, /no legal conclusion about compliance/);
  const skill = readFileSync(join(projectRoot, 'SKILL.md'), 'utf8');
  assert.match(skill, /never write, and never let a summary imply/i);
});

test('no shipped document claims the tool establishes compliance', () => {
  const forbidden = [/\bmakes you compliant\b/i, /\bensures compliance\b/i, /\bguarantees compliance\b/i, /\bCRA certified\b/i, /\bcompliance score\b/i];
  for (const file of ['README.md', 'SKILL.md', 'SECURITY.md', 'docs/scope-and-disclaimer.md', 'docs/coverage.md', 'docs/rule-authoring.md']) {
    const content = readFileSync(join(projectRoot, file), 'utf8');
    for (const pattern of forbidden) {
      assert.ok(!pattern.test(content), `${file} matches ${pattern}`);
    }
  }
});

test('the package declares no runtime dependency', () => {
  const manifest = JSON.parse(readFileSync(join(projectRoot, 'package.json'), 'utf8'));
  assert.deepEqual(manifest.dependencies, {});
  assert.deepEqual(manifest.devDependencies, {});
});

/**
 * Regression battery for the citation-boundary defect found on 28 August 2026:
 * Article 71 is the last article, so its final paragraph swallowed the whole
 * Official Journal footnote apparatus. A citation that carries thirty-eight
 * unrelated legal acts is worse than no citation.
 */
test('no cited provision leaks the Official Journal footnote apparatus', () => {
  const reference = JSON.parse(readFileSync(join(projectRoot, 'reference', 'loci.json'), 'utf8'));
  for (const [locus, entry] of Object.entries(reference.loci)) {
    assert.ok(!/^Done at /m.test(entry.text), `${locus} runs past the signature block`);
    assert.ok(!/For the European Parliament/.test(entry.text), `${locus} includes the signature block`);
    assert.ok(!/OJ C \d+, \d+\.\d+\.\d{4}, p\. \d+\./.test(entry.text), `${locus} includes an Official Journal footnote`);
  }
});

test('the application dates are citable and say what the tool claims they say', () => {
  const reference = JSON.parse(readFileSync(join(projectRoot, 'reference', 'loci.json'), 'utf8'));
  const article71 = reference.loci['Art.71.2'];
  assert.match(article71.text, /apply from 11 December 2027/);
  assert.match(article71.text, /Article 14 shall apply from 11 September 2026/);
  assert.match(article71.text, /Chapter IV \(Articles 35 to 51\) shall apply from 11 June 2026/);
  assert.ok(article71.text.length < 800, 'the paragraph should end at the enacting terms');
});

test('the five-year support floor is quoted, not paraphrased', () => {
  const reference = JSON.parse(readFileSync(join(projectRoot, 'reference', 'loci.json'), 'utf8'));
  assert.match(reference.loci['Art.13.8'].text, /the support period shall be at least five years/);
  assert.match(reference.loci['Art.13.9'].text, /minimum of 10 years/);
  assert.match(reference.loci['Art.13.19'].text, /including at least the month and the year/);
  assert.match(reference.loci['AnnexI.PartII.1'].text, /at the very least the top-level dependencies/);
});

test('an article aggregate reproduces its own paragraphs and nothing else', () => {
  const reference = JSON.parse(readFileSync(join(projectRoot, 'reference', 'loci.json'), 'utf8'));
  const article = reference.loci['Art.31'];
  assert.ok(article.children.length > 0);
  for (const child of article.children) {
    assert.ok(article.text.includes(reference.loci[child].text.split('\n')[0]), `${child} is missing from its article`);
  }
  assert.ok(!article.text.includes('Article 32'));
});

test('the skill interview asks both Article 14 tracks with their own clock', () => {
  const skill = readFileSync(join(projectRoot, 'SKILL.md'), 'utf8');
  assert.match(skill, /actively exploited vulnerability/i);
  assert.match(skill, /severe incident/i);
  assert.match(skill, /14 days \*\*after a corrective or mitigating measure is\s+available\*\*/i,
    'the 14-day clock must be anchored on the availability of a fix');
  assert.match(skill, /within one month after that\s+notification/i,
    'the one-month clock must be anchored on the 72-hour notification');
  assert.match(skill, /Article 14\(5\)/);
  assert.match(skill, /Article 14\(8\)/);
});

test('GitHub Actions are pinned to immutable commit SHAs', () => {
  const workflow = readFileSync(join(projectRoot, '.github', 'workflows', 'ci.yml'), 'utf8');
  const uses = [...workflow.matchAll(/uses:\s*(\S+)/g)].map((m) => m[1]);
  assert.ok(uses.length > 0, 'no actions found, the pattern must have changed');
  for (const ref of uses) {
    assert.match(ref, /@[0-9a-f]{40}$/, `${ref} is pinned to a mutable tag, not a commit`);
  }
});

test('the security policy names a reporting channel that exists', () => {
  const policy = readFileSync(join(projectRoot, 'SECURITY.md'), 'utf8');
  assert.doesNotMatch(policy, /published on the project page/, 'no address is actually published there');
  assert.match(policy, /https:\/\/github\.com\/\S+\/security\/advisories\/new|[\w.+-]+@[\w.-]+\.\w+/,
    'a security policy without a reachable channel is a dead end');
});

test('the package says where it lives, so npm and the registry agree', () => {
  const pkg = JSON.parse(readFileSync(join(projectRoot, 'package.json'), 'utf8'));
  assert.ok(pkg.repository?.url?.startsWith('git+https://'), 'repository url missing or not https');
  assert.ok(pkg.homepage, 'homepage missing');
  assert.ok(pkg.bugs?.url, 'bugs url missing');
  assert.equal(pkg.publishConfig?.access, 'public', 'a scoped or private default would silently fail to publish');
});

test('the test script hands the runner file paths, not a glob it may not expand', () => {
  const pkg = JSON.parse(readFileSync(join(projectRoot, 'package.json'), 'utf8'));
  for (const [name, script] of Object.entries(pkg.scripts)) {
    if (!script.includes('--test')) continue;
    assert.doesNotMatch(script, /"[^"]*\*[^"]*"/,
      `${name} quotes a glob; Node only expands one itself from v22, so the shell must do it`);
  }
});

test('every Node version the CI exercises satisfies the engines floor', () => {
  const pkg = JSON.parse(readFileSync(join(projectRoot, 'package.json'), 'utf8'));
  const workflow = readFileSync(join(projectRoot, '.github', 'workflows', 'ci.yml'), 'utf8');
  const matrix = workflow.match(/node:\s*\[([^\]]+)\]/);
  assert.ok(matrix, 'the CI matrix must name the Node versions it claims to support');
  const versions = matrix[1].split(',').map((v) => v.trim().replace(/['"]/g, ''));
  const floor = pkg.engines.node.replace(/^>=/, '');
  const [floorMajor, floorMinor = '0'] = floor.split('.');
  for (const version of versions) {
    const [major, minor = '0'] = version.split('.');
    const satisfies = Number(major) > Number(floorMajor)
      || (Number(major) === Number(floorMajor) && Number(minor) >= Number(floorMinor));
    assert.ok(satisfies, `CI runs Node ${version} but engines requires ${pkg.engines.node}`);
  }
  assert.ok(versions.includes(floor) || versions.some((v) => v.startsWith(floorMajor)),
    `nothing in CI exercises the ${floorMajor}.x floor that engines promises`);
});
