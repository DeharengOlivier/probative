import { test } from 'node:test';
import assert from 'node:assert/strict';
import { runPipeline } from '../../src/pipeline.mjs';
import { STATUS } from '../../src/rules/status.mjs';
import { copyFixture, FIXED_NOW } from '../helpers.mjs';

// Fixtures live inside this project's own git repository, so analysing them in
// place would pick up its commit. Copying them out keeps each test hermetic.
const run = (fixture) => {
  const scratch = copyFixture(fixture);
  try {
    return runPipeline(scratch.path, { nowOverride: FIXED_NOW });
  } finally {
    scratch.cleanup();
  }
};
const statusOf = (assessment, id) => assessment.controls.find((control) => control.id === id).status;

test('an unprepared repository reports gaps rather than failing', () => {
  const { assessment } = run('minimal-unprepared');
  assert.equal(assessment.summary.byStatus.verified, 0);
  assert.ok(assessment.summary.p0Gaps > 0);
  assert.equal(statusOf(assessment, 'CRA-NODE-010'), STATUS.ERROR, 'a missing lockfile must surface as an error, not as a silent absence');
  assert.equal(statusOf(assessment, 'CRA-NODE-020'), STATUS.MISSING);
  assert.equal(statusOf(assessment, 'CRA-NODE-080'), STATUS.MISSING);
});

test('a partially prepared repository earns credit only where evidence exists', () => {
  const { assessment } = run('partially-prepared');
  assert.equal(statusOf(assessment, 'CRA-NODE-010'), STATUS.VERIFIED, 'the lockfile covers the single top-level runtime dependency');
  assert.equal(statusOf(assessment, 'CRA-NODE-012'), STATUS.VERIFIED, 'dependabot.yml is a fact, not a heuristic');
  assert.equal(statusOf(assessment, 'CRA-NODE-030'), STATUS.PARTIAL, 'test execution alone is a weak signal');
  assert.equal(statusOf(assessment, 'CRA-NODE-020'), STATUS.MISSING);
  assert.equal(statusOf(assessment, 'CRA-NODE-040'), STATUS.MISSING);
});

test('a well-evidenced repository closes every P0 gap and still asks for expert review', () => {
  const { assessment } = run('well-evidenced');
  assert.equal(assessment.summary.p0Gaps, 0);
  assert.equal(statusOf(assessment, 'CRA-NODE-020'), STATUS.VERIFIED);
  assert.equal(statusOf(assessment, 'CRA-NODE-021'), STATUS.VERIFIED);
  assert.equal(statusOf(assessment, 'CRA-NODE-040'), STATUS.DECLARED);
  assert.equal(statusOf(assessment, 'CRA-NODE-041'), STATUS.DECLARED);
  assert.equal(statusOf(assessment, 'CRA-NODE-050'), STATUS.DECLARED);
  assert.equal(statusOf(assessment, 'CRA-NODE-004'), STATUS.NEEDS_EXPERT_REVIEW);
  assert.ok(assessment.summary.requiringExpertReview >= 5, 'a complete pack still routes legal determinations to a human');
});

test('security testing never reaches verified, because the tool runs nothing', () => {
  for (const fixture of ['partially-prepared', 'well-evidenced']) {
    const { assessment } = run(fixture);
    assert.notEqual(statusOf(assessment, 'CRA-NODE-030'), STATUS.VERIFIED, `${fixture} must not claim verified test evidence`);
  }
});

test('the engine never emits an overall compliance verdict', () => {
  for (const fixture of ['minimal-unprepared', 'partially-prepared', 'well-evidenced', 'hostile-repository']) {
    const { assessment, files } = run(fixture);
    assert.equal(assessment.verdict.kind, 'evidence-inventory');
    assert.ok(!('compliant' in assessment.summary));
    const rendered = Object.entries(files)
      .filter(([path]) => path.endsWith('.md'))
      .map(([, content]) => content).join('\n');
    for (const forbidden of [/\bis compliant\b/i, /\bfully compliant\b/i, /\bcertified compliant\b/i, /\bCE marking is affixed\b/i]) {
      assert.ok(!forbidden.test(rendered), `${fixture} rendered a compliance claim matching ${forbidden}`);
    }
  }
});

test('a declared field never produces the verified state', () => {
  const { assessment } = run('well-evidenced');
  const declaredOnly = ['CRA-NODE-002', 'CRA-NODE-003', 'CRA-NODE-024', 'CRA-NODE-042', 'CRA-NODE-062'];
  for (const id of declaredOnly) {
    assert.notEqual(statusOf(assessment, id), STATUS.VERIFIED, `${id} rests on a declaration and must not read as verified`);
  }
});

test('every control carries the verbatim text of the provision it cites', () => {
  const { assessment } = run('well-evidenced');
  for (const control of assessment.controls) {
    assert.ok(control.citations.length > 0, `${control.id} cites nothing`);
    for (const citation of control.citations) {
      assert.ok(citation.text && citation.text.length > 20, `${control.id} cites ${citation.locus} without text`);
      assert.ok(citation.reference.length > 0);
    }
  }
});

test('the Annex VII map and the coverage document agree on which points are covered', () => {
  const { files } = run('well-evidenced');
  const map = files['annex-vii-map.md'];
  const uncoveredInMap = [...map.matchAll(/^\| (Annex VII, point \d) \|.*\| not covered by this ruleset \|$/gm)].map((match) => match[1]);
  assert.deepEqual(uncoveredInMap, [], 'the rendered map disagrees with docs/coverage.md, which reports every Annex VII point as covered');
});

test('a control appears against an Annex VII point because it cites it', () => {
  const { files, assessment } = run('well-evidenced');
  const map = files['annex-vii-map.md'];
  // CRA-NODE-010 cites Annex VII point 2(b) and point 8; it must show against both.
  const control = assessment.controls.find((item) => item.id === 'CRA-NODE-010');
  assert.ok(control.citations.some((citation) => citation.locus === 'AnnexVII.8'));
  const pointEight = map.split('\n').find((line) => line.startsWith('| Annex VII, point 8 |'));
  assert.match(pointEight, /CRA-NODE-010/);
});

test('the executive summary heading matches the number of gaps it lists', () => {
  for (const fixture of ['minimal-unprepared', 'well-evidenced']) {
    const summary = run(fixture).files['executive-summary.md'];
    const heading = /^## The (\d+) gaps? to close first$/m.exec(summary);
    const rows = summary.split('## The')[1].split('\n##')[0].split('\n').filter((line) => /^\| \d+ \|/.test(line));
    assert.ok(heading, `${fixture} has no gap heading`);
    assert.equal(Number(heading[1]), rows.length, `${fixture} promises ${heading[1]} gaps and lists ${rows.length}`);
  }
});
