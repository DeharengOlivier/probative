import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { readRepoFile } from '../util/fs.mjs';
import { validate } from '../util/schema.mjs';
import { stringify } from '../util/json.mjs';

const here = dirname(fileURLToPath(import.meta.url));
export const PROFILE_FILENAME = 'cra-evidence.profile.json';
export const PROFILE_SCHEMA = JSON.parse(readFileSync(join(here, '..', '..', 'schemas', 'product-profile.schema.json'), 'utf8'));

/**
 * Load the manufacturer's declarations. A missing profile is a normal, expected
 * state: the pack is then produced from observations only, and every declared
 * control reports 'missing' rather than failing the run.
 *
 * @returns {{present: boolean, valid: boolean, profile: object|null, errors: Array, path: string}}
 */
export function loadProfile(root, { filename = PROFILE_FILENAME } = {}) {
  const raw = readRepoFile(root, filename);
  if (raw === null) {
    return { present: false, valid: false, profile: null, errors: [], path: filename };
  }
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch (error) {
    return { present: true, valid: false, profile: null, path: filename,
      errors: [{ path: '$', message: `not valid JSON: ${error.message}` }] };
  }
  const errors = validate(PROFILE_SCHEMA, parsed);
  return { present: true, valid: errors.length === 0, profile: errors.length === 0 ? parsed : parsed, errors, path: filename };
}

/** Read a value at a dotted path, returning null for anything absent or blank. */
export function declared(profile, path) {
  if (!profile) return null;
  let cursor = profile;
  for (const key of path.split('.')) {
    if (cursor === null || typeof cursor !== 'object') return null;
    cursor = cursor[key];
  }
  if (cursor === undefined) return null;
  if (typeof cursor === 'string' && cursor.trim() === '') return null;
  return cursor;
}

/**
 * A blank profile carrying the schema pointer and every field the ruleset can
 * consume, so filling it in is a matter of answering, not of guessing structure.
 */
export function profileTemplate() {
  return stringify({
    $schema: './node_modules/cra-evidence/schemas/product-profile.schema.json',
    schemaVersion: '1.0.0',
    product: {
      commercialName: '', identifier: null, intendedPurpose: '', securityEnvironment: null,
      foreseeableMisuse: null, deliveryForm: 'npm-package', integratedIntoOtherProducts: null,
    },
    manufacturer: {
      legalName: '', tradeName: null, postalAddress: null, email: null, website: null,
      singlePointOfContact: '', establishedInUnion: null,
    },
    regulatoryPosition: {
      role: 'undetermined', roleJustification: null, placedOnUnionMarket: null,
      placingOnMarketDate: null, productClassification: 'undetermined',
      classificationJustification: null, conformityAssessmentModule: 'undetermined',
      euDeclarationOfConformityUrl: null, harmonisedStandardsApplied: [],
      determinedBy: '', determinedOn: null,
    },
    supportPeriod: {
      endDate: null, rationale: null, expectedProductLifetimeYears: null,
      securityUpdateAvailabilityYears: null, publishedAt: null,
    },
    vulnerabilityHandling: {
      reportingContact: '', disclosurePolicyUrl: null, advisoryChannelUrl: null,
      securityUpdatesSeparateFromFeatures: null, updateDistributionMechanism: null,
      automaticSecurityUpdates: null,
      incidentReporting: {
        procedureDocumented: null, procedureLocation: null, responsibleRole: null,
        singleReportingPlatformPrepared: null, csirtCoordinator: null,
      },
    },
    riskAssessment: {
      documentReference: null, lastUpdated: null, coversAnnexIPartI: null,
      notApplicableRequirements: [],
    },
    technicalDocumentation: { location: null, retentionYears: null, updateProcess: null },
    userInformation: {
      location: null, secureInstallationInstructions: null,
      secureDecommissioningInstructions: null, sbomDisclosedToUsers: null,
    },
    notes: null,
  });
}
