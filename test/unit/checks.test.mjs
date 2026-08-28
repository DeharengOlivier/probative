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

// --- Article 14 has two reporting tracks, not one ----------------------------
// Art. 14(1)-(2): actively exploited vulnerability. 24h early warning, 72h
// vulnerability notification, final report no later than 14 days AFTER A
// CORRECTIVE OR MITIGATING MEASURE IS AVAILABLE.
// Art. 14(3)-(5): severe incident. 24h early warning, 72h incident
// notification, final report within ONE MONTH AFTER THE 72-HOUR NOTIFICATION.
// The anchors differ, so a single procedure cannot satisfy both by accident.

function reportingContext(incidentReporting) {
  return { ...baseContext, profile: { vulnerabilityHandling: { incidentReporting } } };
}

const fullyDeclared = {
  responsibleRole: 'Head of Security',
  csirtCoordinator: 'CIRCL, Luxembourg',
  singleReportingPlatformPrepared: true,
  activelyExploitedVulnerability: { procedureDocumented: true, procedureLocation: 'runbook IR-014a' },
  severeIncident: { procedureDocumented: true, procedureLocation: 'runbook IR-014b', severityCriteriaDocumented: true },
  impactedUserNotificationDocumented: true,
};

test('Article 14: nothing declared is missing', () => {
  const outcome = CHECKS.incidentReportingReadiness({ ...baseContext, profile: null });
  assert.equal(outcome.status, STATUS.MISSING);
});

test('Article 14: only the actively exploited vulnerability track is partial', () => {
  const outcome = CHECKS.incidentReportingReadiness(reportingContext({
    ...fullyDeclared, severeIncident: { procedureDocumented: false },
  }));
  assert.equal(outcome.status, STATUS.PARTIAL);
  assert.match(outcome.summary, /severe incident/i);
});

test('Article 14: only the severe incident track is partial', () => {
  const outcome = CHECKS.incidentReportingReadiness(reportingContext({
    ...fullyDeclared, activelyExploitedVulnerability: { procedureDocumented: false },
  }));
  assert.equal(outcome.status, STATUS.PARTIAL);
  assert.match(outcome.summary, /actively exploited vulnerabilit/i);
});

test('Article 14: both tracks without an owner or a CSIRT is partial', () => {
  const noOwner = CHECKS.incidentReportingReadiness(reportingContext({ ...fullyDeclared, responsibleRole: null }));
  assert.equal(noOwner.status, STATUS.PARTIAL);
  const noCsirt = CHECKS.incidentReportingReadiness(reportingContext({ ...fullyDeclared, csirtCoordinator: null }));
  assert.equal(noCsirt.status, STATUS.PARTIAL);
});

test('Article 14: the severity criteria of Article 14(5) are their own question', () => {
  const outcome = CHECKS.incidentReportingReadiness(reportingContext({
    ...fullyDeclared,
    severeIncident: { procedureDocumented: true, severityCriteriaDocumented: false },
  }));
  assert.equal(outcome.status, STATUS.PARTIAL, 'without the severity test you cannot know an incident is reportable');
  assert.match(outcome.summary, /severit/i);
});

test('Article 14: the duty to inform impacted users under 14(8) is asked', () => {
  const outcome = CHECKS.incidentReportingReadiness(reportingContext({
    ...fullyDeclared, impactedUserNotificationDocumented: false,
  }));
  assert.equal(outcome.status, STATUS.PARTIAL);
  assert.match(outcome.summary, /user/i);
});

test('Article 14: a complete declaration still needs expert review, never verified', () => {
  const outcome = CHECKS.incidentReportingReadiness(reportingContext(fullyDeclared));
  assert.equal(outcome.status, STATUS.NEEDS_EXPERT_REVIEW);
  assert.notEqual(outcome.status, STATUS.VERIFIED, 'a manufacturer declaration is never verified');
});

test('Article 14: both final report deadlines are quoted with their own anchor', () => {
  const shown = CHECKS.incidentReportingReadiness(reportingContext(fullyDeclared))
    .findings.map((f) => `${f.label}: ${f.value} ${f.detail ?? ''}`).join('\n');
  assert.match(shown, /14 days after a corrective or mitigating measure is available/i);
  assert.match(shown, /one month after/i);
  assert.match(shown, /24 hours/);
  assert.match(shown, /72 hours/);
});

test('Article 14: a pre-two-track declaration is reported, never silently accepted or dropped', () => {
  const outcome = CHECKS.incidentReportingReadiness(reportingContext({
    procedureDocumented: true,
    procedureLocation: 'internal runbook IR-014',
    responsibleRole: 'Head of Security',
    csirtCoordinator: 'CIRCL, Luxembourg',
  }));
  assert.equal(outcome.status, STATUS.PARTIAL, 'one undifferentiated procedure does not answer two tracks');
  assert.match(outcome.summary, /restate|does not say which|both tracks/i);
});

test('Article 14: the rule cites both tracks', () => {
  const ruleset = loadRuleset();
  const control = ruleset.controls.find((c) => c.id === 'CRA-NODE-080');
  for (const locus of ['Art.14.1', 'Art.14.2', 'Art.14.3', 'Art.14.4', 'Art.14.5', 'Art.14.8']) {
    assert.ok(control.loci.includes(locus), `CRA-NODE-080 does not cite ${locus}`);
  }
});
