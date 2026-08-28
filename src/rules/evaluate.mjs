import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { CHECKS } from './checks.mjs';
import { GAP_STATUSES, STATUS, STATUS_MEANING, STATUS_ORDER } from './status.mjs';
import { toIso } from '../util/time.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const packageRoot = join(here, '..', '..');

export const DEFAULT_RULESET = 'cra-node-mvp-1.0.0';

export function loadRuleset(name = DEFAULT_RULESET) {
  return JSON.parse(readFileSync(join(packageRoot, 'rules', `${name}.json`), 'utf8'));
}

export function loadLoci() {
  return JSON.parse(readFileSync(join(packageRoot, 'reference', 'loci.json'), 'utf8'));
}

const PRIORITY_WEIGHT = { P0: 0, P1: 1, P2: 2 };
const STATUS_WEIGHT = { error: 0, missing: 1, stale: 2, partial: 3, needs_expert_review: 4, declared: 5, verified: 6, not_applicable: 7 };

/**
 * Run every control of the ruleset against the collected evidence.
 *
 * The engine never produces an overall verdict. It reports, per control, what
 * was observed, what was declared, and what a human still has to decide.
 */
export function evaluate({ inventory, profileResult, sbom, sbomStats, sbomWarnings = [], now, rulesetName = DEFAULT_RULESET, toolVersion }) {
  const ruleset = loadRuleset(rulesetName);
  const reference = loadLoci();
  const context = {
    inventory,
    profileResult,
    profile: profileResult.profile,
    sbom,
    sbomStats,
    sbomWarnings,
    now,
    loci: reference.loci,
  };

  const results = ruleset.controls
    .filter((control) => control.status === 'active')
    .map((control) => {
      const implementation = CHECKS[control.check];
      let outcome;
      if (!implementation) {
        outcome = { status: STATUS.ERROR, summary: `No implementation is registered for check '${control.check}'.`, findings: [] };
      } else {
        try {
          outcome = implementation(context, control);
        } catch (error) {
          outcome = { status: STATUS.ERROR, summary: `The check failed: ${error.message}`, findings: [] };
        }
      }
      const family = ruleset.families.find((item) => item.id === control.family) ?? null;
      return {
        id: control.id,
        title: control.title,
        family: control.family,
        familyTitle: family?.title ?? control.family,
        annexViiSection: family?.annexViiSection ?? null,
        priority: control.priority,
        status: outcome.status,
        summary: outcome.summary,
        findings: outcome.findings ?? [],
        intent: control.intent,
        limitations: control.limitations,
        remediation: control.remediation,
        expertReviewWhen: control.expertReviewWhen ?? [],
        // Only an unconditional review requirement, or a status the engine could
        // not resolve, counts towards the summary. Conditional triggers stay
        // documented per control instead of inflating a headline number.
        requiresExpertReview: outcome.status === STATUS.NEEDS_EXPERT_REVIEW
          || (control.expertReviewWhen ?? []).some((reason) => reason.startsWith('always')),
        citations: control.loci.map((locus) => ({
          locus,
          reference: reference.loci[locus]?.ref ?? locus,
          text: reference.loci[locus]?.text ?? null,
        })),
      };
    });

  const byStatus = Object.fromEntries(STATUS_ORDER.map((status) => [status, results.filter((r) => r.status === status).length]));

  const gaps = results
    .filter((result) => GAP_STATUSES.includes(result.status))
    .sort((a, b) => (PRIORITY_WEIGHT[a.priority] - PRIORITY_WEIGHT[b.priority])
      || (STATUS_WEIGHT[a.status] - STATUS_WEIGHT[b.status])
      || a.id.localeCompare(b.id))
    .map((result) => ({
      id: result.id, title: result.title, priority: result.priority, status: result.status,
      summary: result.summary, remediation: result.remediation,
      citations: result.citations.map((citation) => citation.reference),
    }));

  const expertReview = results
    .filter((result) => result.requiresExpertReview)
    .map((result) => ({ id: result.id, title: result.title, status: result.status, reasons: result.expertReviewWhen }));

  return {
    schemaVersion: '1.0.0',
    generatedAt: toIso(now),
    tool: { name: 'probative', version: toolVersion },
    ruleset: {
      id: ruleset.rulesetId, version: ruleset.version, introducedOn: ruleset.introducedOn,
      regulation: ruleset.regulation, scope: ruleset.scope,
    },
    subject: {
      product: inventory.package.name ?? null,
      version: inventory.package.version ?? null,
      commit: inventory.git.commit,
      worktreeClean: inventory.git.dirty === null ? null : !inventory.git.dirty,
      stateFingerprint: inventory.stateFingerprint,
    },
    profile: {
      present: profileResult.present,
      valid: profileResult.valid,
      schemaErrors: profileResult.errors ?? [],
    },
    verdict: {
      // Deliberately not a compliance verdict. Article 32 conformity assessment
      // and the Article 28 declaration are acts of the manufacturer, not of a tool.
      kind: 'evidence-inventory',
      statement: 'This is an inventory of technical evidence and declarations. It is not a conformity assessment, not an EU declaration of conformity, and not a legal opinion on compliance.',
    },
    summary: {
      controlsEvaluated: results.length,
      byStatus,
      openGaps: gaps.length,
      p0Gaps: gaps.filter((gap) => gap.priority === 'P0').length,
      requiringExpertReview: expertReview.length,
    },
    statusMeanings: STATUS_MEANING,
    controls: results,
    gaps,
    expertReview,
    warnings: sbomWarnings,
  };
}
