import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CHECKS } from '../../src/rules/checks.mjs';
import { STATUS, STATUS_MEANING, STATUS_ORDER } from '../../src/rules/status.mjs';
import { loadRuleset } from '../../src/rules/evaluate.mjs';

const now = new Date('2026-08-28T12:00:00Z');
const emptyInventory = {
  package: { name: null, version: null, devDependencies: {}, scriptCategories: {}, bugsUrl: null },
  git: { commit: null, shortCommit: null, dirty: null, tagsAtHead: [] },
  lockfile: { present: false, error: null, components: [], topLevelNames: [], unresolvedTopLevel: [], counts: {} },
  docs: {
    securityPolicy: { present: false, path: null, analysis: null },
    securityTxt: { present: false, path: null, hasContactField: false },
    readme: { present: false, path: null, mentionsInstallation: false, mentionsConfiguration: false },
    changelog: { present: false, path: null, entryCount: 0, securityEntryCount: 0, cveReferences: [], ghsaReferences: [] },
    advisories: { count: 0 },
    secureConfigurationDocs: { signals: [], matchedFiles: [] },
  },
  ci: { provider: 'none', workflowCount: 0, workflows: [], signals: {}, dependencyUpdates: { dependabot: { present: false, path: null, ecosystems: [] }, renovate: { present: false, path: null } } },
};
const baseContext = {
  inventory: emptyInventory, profile: null, profileResult: { present: false, valid: false, profile: null, errors: [] },
  sbom: null, sbomStats: { componentCount: 0, componentsWithoutHash: 0, topLevelCovered: 0, topLevelDeclared: 0, excludedDevelopmentComponents: 0, dependencyEdges: 0 },
  now, loci: {},
};

test('every status in the vocabulary carries a written meaning', () => {
  for (const status of STATUS_ORDER) {
    assert.ok(STATUS_MEANING[status], `${status} has no meaning`);
  }
  assert.equal(Object.keys(STATUS_MEANING).length, STATUS_ORDER.length);
});

test('no status in the vocabulary asserts compliance', () => {
  const forbidden = /compliant|conform|certified|approved/i;
  for (const [status, meaning] of Object.entries(STATUS_MEANING)) {
    assert.ok(!forbidden.test(status), `status name ${status} implies a legal conclusion`);
    assert.ok(!/\bis compliant\b|\bcertified\b/i.test(meaning), `meaning of ${status} implies a legal conclusion`);
  }
});

test('an empty repository yields missing, never verified', () => {
  const ruleset = loadRuleset();
  for (const control of ruleset.controls) {
    const outcome = CHECKS[control.check](baseContext, control);
    assert.ok(STATUS_ORDER.includes(outcome.status), `${control.id} produced unknown status ${outcome.status}`);
    assert.notEqual(outcome.status, STATUS.VERIFIED, `${control.id} claimed verified with no evidence at all`);
    assert.ok(outcome.summary.length > 0, `${control.id} produced no summary`);
  }
});

test('the support period end date check enforces month granularity', () => {
  const withProfile = (endDate) => ({ ...baseContext, profile: { supportPeriod: { endDate, publishedAt: 'the purchase page' } } });
  assert.equal(CHECKS.supportPeriodEndDate(withProfile('2031-06')).status, STATUS.DECLARED);
  assert.equal(CHECKS.supportPeriodEndDate(withProfile('2031-06-15')).status, STATUS.DECLARED);
  assert.equal(CHECKS.supportPeriodEndDate(withProfile('2031')).status, STATUS.ERROR);
  assert.equal(CHECKS.supportPeriodEndDate(withProfile(null)).status, STATUS.MISSING);
});

test('a support period that has already ended reads as stale', () => {
  const context = { ...baseContext, profile: { supportPeriod: { endDate: '2025-01', publishedAt: 'x' } } };
  const outcome = CHECKS.supportPeriodEndDate(context);
  assert.equal(outcome.status, STATUS.STALE);
});

test('the five-year floor of Article 13(8) is applied as arithmetic', () => {
  const context = (endDate, lifetime = null) => ({
    ...baseContext,
    profile: { supportPeriod: { endDate, expectedProductLifetimeYears: lifetime }, regulatoryPosition: { placingOnMarketDate: '2026-01-15' } },
  });
  assert.equal(CHECKS.supportPeriodDuration(context('2031-02')).status, STATUS.DECLARED);
  assert.equal(CHECKS.supportPeriodDuration(context('2029-01')).status, STATUS.PARTIAL);
  assert.equal(CHECKS.supportPeriodDuration(context('2029-01', 3)).status, STATUS.NEEDS_EXPERT_REVIEW);
  assert.equal(CHECKS.supportPeriodDuration(context(null)).status, STATUS.MISSING);
});

test('the ten-year update availability floor rises with the remaining support period', () => {
  const context = (years, endDate) => ({ ...baseContext, profile: { supportPeriod: { securityUpdateAvailabilityYears: years, endDate } } });
  assert.equal(CHECKS.securityUpdateAvailability(context(10, '2031-06')).status, STATUS.DECLARED);
  assert.equal(CHECKS.securityUpdateAvailability(context(5, '2031-06')).status, STATUS.PARTIAL);
  assert.equal(CHECKS.securityUpdateAvailability(context(12, '2045-01')).status, STATUS.PARTIAL);
  assert.equal(CHECKS.securityUpdateAvailability(context(null)).status, STATUS.MISSING);
});

test('an exclusion citing a locus that does not exist is an error, not a pass', () => {
  const context = {
    ...baseContext,
    loci: { 'AnnexI.PartI.2.i': { ref: 'Annex I, Part I, point (2)(i)' } },
    profile: { riskAssessment: { notApplicableRequirements: [{ locus: 'AnnexI.PartI.99', justification: 'invented' }] } },
  };
  assert.equal(CHECKS.notApplicableJustifications(context).status, STATUS.ERROR);
});

test('no declared exclusion means the Article 13(4) duty does not arise', () => {
  assert.equal(CHECKS.notApplicableJustifications({ ...baseContext, profile: { riskAssessment: { notApplicableRequirements: [] } } }).status, STATUS.NOT_APPLICABLE);
});

test('Article 14 readiness reports the application date and stays missing without a procedure', () => {
  const outcome = CHECKS.incidentReportingReadiness(baseContext);
  assert.equal(outcome.status, STATUS.MISSING);
  assert.ok(outcome.findings.some((f) => f.value === '2026-09-11'));
  assert.match(outcome.summary, /2026-09-11/);
});

test('a risk assessment older than 24 months reads as stale', () => {
  const context = { ...baseContext, profile: { riskAssessment: { documentReference: 'RA-1', coversAnnexIPartI: true, lastUpdated: '2023-01-01' } } };
  assert.equal(CHECKS.riskAssessment(context).status, STATUS.STALE);
});

test('a check that throws is reported as an error rather than crashing the run', () => {
  const control = { id: 'X', check: 'productVersionIdentifiable', loci: [], priority: 'P1', expertReviewWhen: [] };
  const broken = { ...baseContext, inventory: null };
  assert.throws(() => CHECKS[control.check](broken, control));
});
