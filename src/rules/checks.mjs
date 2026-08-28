import { STATUS } from './status.mjs';
import { declared } from '../profile/index.mjs';
import { monthsBetween, parseSupportDate } from '../util/time.mjs';

/** Article 14 applies before the rest of the Regulation; Article 71(2). */
export const ARTICLE_14_APPLICATION_DATE = '2026-09-11';
export const GENERAL_APPLICATION_DATE = '2027-12-11';
/** Article 14(2): the final report clock starts when a fix exists, not when the vulnerability is found. */
const VULNERABILITY_TRACK_DEADLINES = 'early warning within 24 hours, vulnerability notification within 72 hours, final report no later than 14 days after a corrective or mitigating measure is available';
/** Article 14(4): the final report clock starts at the 72-hour notification, not at the incident. */
const INCIDENT_TRACK_DEADLINES = 'early warning within 24 hours, incident notification within 72 hours, final report within one month after that notification';
const SUPPORT_PERIOD_FLOOR_MONTHS = 60; // Article 13(8), third subparagraph
const UPDATE_AVAILABILITY_FLOOR_YEARS = 10; // Article 13(9)

const result = (status, summary, findings = [], extra = {}) => ({ status, summary, findings, ...extra });
const finding = (label, value, detail = null) => ({ label, value, ...(detail ? { detail } : {}) });

/** Present means: set, non-empty, and not the placeholder 'undetermined'. */
function has(profile, path) {
  const value = declared(profile, path);
  if (value === null || value === undefined) return false;
  if (typeof value === 'boolean') return true;
  if (Array.isArray(value)) return value.length > 0;
  if (typeof value === 'string') return value.trim() !== '' && value.trim() !== 'undetermined';
  return true;
}

export const CHECKS = {
  productVersionIdentifiable(context) {
    const { inventory } = context;
    const version = inventory.package.version;
    const commit = inventory.git.commit;
    const findings = [
      finding('package.json version', version ?? 'not set'),
      finding('git commit', commit ? inventory.git.shortCommit : 'unavailable'),
      finding('tags at HEAD', inventory.git.tagsAtHead.length > 0 ? inventory.git.tagsAtHead.join(', ') : 'none'),
      finding('working tree', inventory.git.dirty === null ? 'unknown' : inventory.git.dirty ? 'has uncommitted changes' : 'clean'),
    ];
    if (!version && !commit) return result(STATUS.MISSING, 'Neither a package version nor a commit identifies this product.', findings);
    if (version && commit && inventory.git.dirty === false) {
      return result(STATUS.VERIFIED, `Version ${version} at commit ${inventory.git.shortCommit}, clean working tree.`, findings);
    }
    if (version && commit) {
      return result(STATUS.PARTIAL, `Version ${version} at commit ${inventory.git.shortCommit}, but the working tree is not clean.`, findings);
    }
    return result(STATUS.PARTIAL, version ? `Version ${version} is set, but no commit could be read.` : 'A commit is known but package.json declares no version.', findings);
  },

  declaredFields(context, control) {
    const { profile } = context;
    const options = control.checkOptions ?? {};
    const required = options.required ?? [];
    const recommended = options.recommended ?? [];
    const presentRequired = required.filter((path) => has(profile, path));
    const presentRecommended = recommended.filter((path) => has(profile, path));
    const findings = [...required, ...recommended].map((path) =>
      finding(path, has(profile, path) ? 'declared' : 'not declared'));

    if (presentRequired.length === 0) {
      return result(STATUS.MISSING, `Not declared: ${required.join(', ')}.`, findings);
    }
    if (presentRequired.length < required.length) {
      return result(STATUS.PARTIAL, `Declared ${presentRequired.length} of ${required.length} required fields.`, findings);
    }
    const status = options.expertReview ? STATUS.NEEDS_EXPERT_REVIEW : STATUS.DECLARED;
    const suffix = recommended.length > 0 ? ` ${presentRecommended.length} of ${recommended.length} recommended fields also declared.` : '';
    return result(status, `All required fields are declared.${suffix}`, findings);
  },

  regulatoryPositionDetermined(context) {
    const { profile } = context;
    const role = declared(profile, 'regulatoryPosition.role');
    const classification = declared(profile, 'regulatoryPosition.productClassification');
    const owner = declared(profile, 'regulatoryPosition.determinedBy');
    const findings = [
      finding('role', role ?? 'not declared'),
      finding('product classification', classification ?? 'not declared'),
      finding('determined by', owner ?? 'nobody named'),
      finding('determined on', declared(profile, 'regulatoryPosition.determinedOn') ?? 'no date'),
      finding('placed on the Union market', String(declared(profile, 'regulatoryPosition.placedOnUnionMarket') ?? 'not declared')),
    ];
    const decided = role && role !== 'undetermined';
    const classified = classification && classification !== 'undetermined';
    if (!decided && !classified) {
      return result(STATUS.MISSING, 'Neither the regulatory role nor the product classification has been determined.', findings);
    }
    if (!decided || !classified || !owner) {
      return result(STATUS.PARTIAL, 'The determination is incomplete: role, classification and a named owner are all required.', findings);
    }
    return result(STATUS.NEEDS_EXPERT_REVIEW, `Recorded as ${role}, classification ${classification}, determined by ${owner}. A competent reviewer must confirm it.`, findings);
  },

  sbomTopLevelCoverage(context) {
    const { inventory, sbomStats, sbom } = context;
    if (inventory.lockfile.error) {
      return result(STATUS.ERROR, inventory.lockfile.error, [finding('lockfile', 'unusable')]);
    }
    if (!sbom) {
      return result(STATUS.ERROR, 'No bill of materials was produced.', []);
    }
    const declaredCount = sbomStats.topLevelDeclared;
    const coveredCount = sbomStats.topLevelCovered;
    const findings = [
      finding('format', `CycloneDX ${sbom.specVersion}`),
      finding('components in the shipped scope', String(sbomStats.componentCount)),
      finding('development components excluded', String(sbomStats.excludedDevelopmentComponents)),
      finding('top-level dependencies declared in package.json', String(declaredCount)),
      finding('top-level dependencies present in the bill of materials', String(coveredCount)),
      finding('dependency edges reconstructed', String(sbomStats.dependencyEdges)),
    ];
    const unresolved = inventory.lockfile.unresolvedTopLevel ?? [];
    if (unresolved.length > 0) {
      findings.push(finding('declared but absent from the lockfile', unresolved.join(', ')));
      return result(STATUS.STALE, `The lockfile is out of date with package.json: ${unresolved.length} declared dependency(ies) are not resolved.`, findings);
    }
    const productionTopLevel = inventory.lockfile.topLevelNames.filter((name) =>
      !Object.prototype.hasOwnProperty.call(inventory.package.devDependencies ?? {}, name));
    if (productionTopLevel.length === 0 && sbomStats.componentCount === 0) {
      return result(STATUS.VERIFIED, 'The product declares no runtime dependency; the bill of materials covers the product component alone.', findings);
    }
    if (coveredCount >= productionTopLevel.length) {
      return result(STATUS.VERIFIED, `Machine-readable bill of materials covering all ${productionTopLevel.length} top-level runtime dependencies, which is the floor set by Annex I, Part II, point (1).`, findings);
    }
    return result(STATUS.PARTIAL, `Only ${coveredCount} of ${productionTopLevel.length} top-level runtime dependencies appear in the bill of materials.`, findings);
  },

  componentIntegrityCoverage(context) {
    const { sbomStats } = context;
    const total = sbomStats.componentCount;
    if (total === 0) return result(STATUS.NOT_APPLICABLE, 'The product ships no third-party component.', []);
    const withHash = total - sbomStats.componentsWithoutHash;
    const ratio = withHash / total;
    const findings = [
      finding('components with an integrity hash', `${withHash} of ${total}`),
      finding('coverage', `${Math.round(ratio * 100)}%`),
    ];
    if (ratio === 1) return result(STATUS.VERIFIED, 'Every shipped component carries an integrity hash recorded in the lockfile.', findings);
    if (ratio >= 0.9) return result(STATUS.PARTIAL, `${sbomStats.componentsWithoutHash} component(s) carry no integrity hash.`, findings);
    return result(STATUS.PARTIAL, `Integrity hashes are missing for ${sbomStats.componentsWithoutHash} of ${total} components.`, findings);
  },

  dependencyMonitoring(context) {
    const { inventory } = context;
    const updates = inventory.ci.dependencyUpdates;
    const auditInCi = inventory.ci.signals.dependencyAudit === true;
    const findings = [
      finding('Dependabot configuration', updates.dependabot.present ? `${updates.dependabot.path} (${updates.dependabot.ecosystems.join(', ') || 'ecosystem not parsed'})` : 'absent'),
      finding('Renovate configuration', updates.renovate.present ? updates.renovate.path : 'absent'),
      finding('dependency audit mentioned in CI', auditInCi ? 'yes' : 'no'),
    ];
    if ((updates.dependabot.present || updates.renovate.present) && auditInCi) {
      return result(STATUS.VERIFIED, 'An automated update service is configured and CI mentions a dependency audit.', findings);
    }
    if (updates.dependabot.present || updates.renovate.present) {
      return result(STATUS.VERIFIED, 'An automated dependency update service is configured in the repository.', findings);
    }
    if (auditInCi) {
      return result(STATUS.PARTIAL, 'A dependency audit is mentioned in CI, but no automated update service is configured.', findings);
    }
    return result(STATUS.MISSING, 'No dependency update service and no dependency audit were found.', findings);
  },

  disclosurePolicy(context) {
    const { inventory, profile } = context;
    const policy = inventory.docs.securityPolicy;
    const analysis = policy.analysis;
    const declaredUrl = declared(profile, 'vulnerabilityHandling.disclosurePolicyUrl');
    const findings = [
      finding('policy document', policy.present ? policy.path : 'absent'),
      finding('coordinated disclosure wording', analysis ? `${analysis.disclosureSignals.length} signal(s)` : 'none'),
      finding('acknowledgement window stated', analysis?.mentionsResponseTime ? 'yes' : 'no'),
      finding('reporting contact inside the policy', analysis?.hasContact ? 'yes' : 'no'),
      finding('policy URL in the product profile', declaredUrl ?? 'not declared'),
    ];
    if (!policy.present && !declaredUrl) {
      return result(STATUS.MISSING, 'No security policy document in the repository and no policy URL declared.', findings);
    }
    if (!policy.present) {
      return result(STATUS.DECLARED, 'A disclosure policy URL is declared but no policy document lives in the repository.', findings);
    }
    if (analysis.disclosureSignals.length >= 2 && analysis.hasContact) {
      return result(STATUS.VERIFIED, `${policy.path} is published and contains a reporting contact and coordinated disclosure wording. Whether the policy is enforced is outside what this tool can observe.`, findings);
    }
    return result(STATUS.PARTIAL, `${policy.path} exists but does not clearly set out a coordinated disclosure process.`, findings);
  },

  reportingContact(context) {
    const { inventory, profile } = context;
    const analysis = inventory.docs.securityPolicy.analysis;
    const securityTxt = inventory.docs.securityTxt;
    const declaredContact = declared(profile, 'vulnerabilityHandling.reportingContact');
    const repositoryContacts = [
      ...(analysis?.contactEmails ?? []),
      ...(analysis?.advisoryUrls ?? []),
    ];
    const findings = [
      finding('contacts found in the security policy', repositoryContacts.length > 0 ? repositoryContacts.join(', ') : 'none'),
      finding('security.txt', securityTxt.present ? `${securityTxt.path}${securityTxt.hasContactField ? ' with a Contact field' : ' without a Contact field'}` : 'absent'),
      finding('contact in the product profile', declaredContact ?? 'not declared'),
      finding('package.json bugs URL', inventory.package.bugsUrl ?? 'not set'),
    ];
    if (repositoryContacts.length > 0 || (securityTxt.present && securityTxt.hasContactField)) {
      return result(STATUS.VERIFIED, 'A vulnerability reporting address is published in the repository.', findings);
    }
    if (declaredContact) {
      return result(STATUS.DECLARED, 'A reporting contact is declared but does not appear in the repository.', findings);
    }
    return result(STATUS.MISSING, 'No vulnerability reporting address was found or declared.', findings);
  },

  publicDisclosureOfFixes(context) {
    const { inventory, profile } = context;
    const changelog = inventory.docs.changelog;
    const advisories = inventory.docs.advisories;
    const channel = declared(profile, 'vulnerabilityHandling.advisoryChannelUrl');
    const identifiers = [...changelog.cveReferences, ...changelog.ghsaReferences];
    const findings = [
      finding('changelog', changelog.present ? `${changelog.path} (${changelog.entryCount} entries)` : 'absent'),
      finding('security sections in the changelog', String(changelog.securityEntryCount)),
      finding('vulnerability identifiers referenced', identifiers.length > 0 ? identifiers.join(', ') : 'none'),
      finding('advisory files in the repository', String(advisories.count)),
      finding('advisory channel declared', channel ?? 'not declared'),
    ];
    const hasEvidence = identifiers.length > 0 || advisories.count > 0 || changelog.securityEntryCount > 0;
    if (hasEvidence && channel) {
      return result(STATUS.VERIFIED, 'Fixed vulnerabilities are referenced in the repository and an advisory channel is declared.', findings);
    }
    if (hasEvidence) {
      return result(STATUS.PARTIAL, 'The repository references fixed vulnerabilities, but no advisory channel is declared for users.', findings);
    }
    if (channel) {
      return result(STATUS.DECLARED, 'An advisory channel is declared. No published fix is referenced in this repository.', findings);
    }
    if (changelog.present) {
      return result(STATUS.PARTIAL, 'A changelog exists but contains no security section or vulnerability identifier. This is expected if no vulnerability has been fixed yet.', findings);
    }
    return result(STATUS.MISSING, 'No changelog, advisory or declared advisory channel was found.', findings);
  },

  secureUpdateDistribution(context) {
    const { inventory, profile } = context;
    const signals = inventory.ci.signals;
    const mechanism = declared(profile, 'vulnerabilityHandling.updateDistributionMechanism');
    const findings = [
      finding('build provenance mentioned in CI', signals.provenance ? 'yes' : 'no'),
      finding('artefact signing mentioned in CI', signals.signing ? 'yes' : 'no'),
      finding('publishing step mentioned in CI', signals.publishing ? 'yes' : 'no'),
      finding('distribution mechanism declared', mechanism ?? 'not declared'),
    ];
    const ciSignal = signals.provenance || signals.signing;
    if (ciSignal && mechanism) {
      return result(STATUS.PARTIAL, 'Provenance or signing is referenced in CI and a distribution mechanism is declared. Workflow text is a mention, not proof that an artefact was signed.', findings);
    }
    if (mechanism) return result(STATUS.DECLARED, 'A distribution mechanism is declared but no provenance or signing step was detected in CI.', findings);
    if (ciSignal) return result(STATUS.PARTIAL, 'CI mentions provenance or signing, but the distribution mechanism is not described in the product profile.', findings);
    return result(STATUS.MISSING, 'Neither a secure distribution mechanism nor a provenance or signing step was found.', findings);
  },

  securityTesting(context) {
    const { inventory } = context;
    const signals = inventory.ci.signals;
    const scriptCategories = inventory.package.scriptCategories ?? {};
    const findings = [
      finding('CI provider', inventory.ci.provider),
      finding('workflows', String(inventory.ci.workflowCount)),
      finding('test execution mentioned in CI', signals.testExecution ? 'yes' : 'no'),
      finding('dependency audit mentioned in CI', signals.dependencyAudit ? 'yes' : 'no'),
      finding('static analysis mentioned in CI', signals.staticAnalysis ? 'yes' : 'no'),
      finding('secret scanning mentioned in CI', signals.secretScanning ? 'yes' : 'no'),
      finding('test scripts in package.json', (scriptCategories.test ?? []).join(', ') || 'none'),
      finding('scheduled workflows', String(inventory.ci.workflows.filter((w) => w.triggersOnSchedule).length)),
    ];
    const strength = [signals.testExecution, signals.dependencyAudit, signals.staticAnalysis, signals.secretScanning].filter(Boolean).length;
    if (strength === 0) {
      return result(STATUS.MISSING, 'No test, audit or analysis step was detected in continuous integration.', findings);
    }
    if (strength >= 2) {
      return result(STATUS.PARTIAL, `Continuous integration references ${strength} kinds of security-relevant checks. These are textual signals; this tool runs nothing and reads no run history, so it cannot stand as the test report expected by Annex VII, point 6.`, findings);
    }
    return result(STATUS.PARTIAL, 'Continuous integration references test execution only. No dependency audit or static analysis was detected.', findings);
  },

  supportPeriodEndDate(context) {
    const { profile, now } = context;
    const raw = declared(profile, 'supportPeriod.endDate');
    const publishedAt = declared(profile, 'supportPeriod.publishedAt');
    const findings = [
      finding('declared end date', raw ?? 'not declared'),
      finding('where it is published', publishedAt ?? 'not declared'),
    ];
    if (!raw) return result(STATUS.MISSING, 'No support period end date is declared. Article 13(19) requires at least a month and a year.', findings);
    const parsed = parseSupportDate(raw);
    if (!parsed) {
      return result(STATUS.ERROR, `The declared end date '${raw}' is not a YYYY-MM or YYYY-MM-DD value, so the required month-and-year granularity cannot be confirmed.`, findings);
    }
    findings.push(finding('granularity', parsed.granularity));
    if (parsed.date.getTime() < now.getTime()) {
      return result(STATUS.STALE, `The declared support period ended on ${raw}. Vulnerability handling obligations under Article 13(8) run for the support period.`, findings);
    }
    if (!publishedAt) {
      return result(STATUS.PARTIAL, `End date ${raw} is declared, but where it is communicated to users at the time of purchase is not recorded.`, findings);
    }
    return result(STATUS.DECLARED, `Support period ends ${raw}, published at: ${publishedAt}.`, findings);
  },

  supportPeriodDuration(context) {
    const { profile } = context;
    const endRaw = declared(profile, 'supportPeriod.endDate');
    const startRaw = declared(profile, 'regulatoryPosition.placingOnMarketDate');
    const expectedLifetime = declared(profile, 'supportPeriod.expectedProductLifetimeYears');
    const findings = [
      finding('placing on the market', startRaw ?? 'not declared'),
      finding('support period end', endRaw ?? 'not declared'),
      finding('expected product lifetime', expectedLifetime === null ? 'not declared' : `${expectedLifetime} year(s)`),
    ];
    if (!endRaw || !startRaw) {
      return result(STATUS.MISSING, 'Both the placing on the market date and the support period end date are needed to check the five-year floor in Article 13(8).', findings);
    }
    const end = parseSupportDate(endRaw);
    const start = parseSupportDate(startRaw);
    if (!end || !start) return result(STATUS.ERROR, 'One of the two dates could not be parsed.', findings);
    const months = monthsBetween(start.date, end.date);
    findings.push(finding('declared support period', `${months} month(s)`));
    if (months >= SUPPORT_PERIOD_FLOOR_MONTHS) {
      return result(STATUS.DECLARED, `The declared support period is ${months} months, at or above the five-year floor.`, findings);
    }
    if (expectedLifetime !== null && expectedLifetime < 5) {
      return result(STATUS.NEEDS_EXPERT_REVIEW, `The declared support period is ${months} months. Article 13(8) allows this only where the product is expected to be in use for less than five years; a lifetime of ${expectedLifetime} year(s) is declared and must be justified.`, findings);
    }
    return result(STATUS.PARTIAL, `The declared support period is ${months} months, below the five-year floor in Article 13(8), and no shorter expected use time is declared.`, findings);
  },

  securityUpdateAvailability(context) {
    const { profile, now } = context;
    const years = declared(profile, 'supportPeriod.securityUpdateAvailabilityYears');
    const endRaw = declared(profile, 'supportPeriod.endDate');
    const findings = [finding('declared availability', years === null ? 'not declared' : `${years} year(s)`)];
    if (years === null) {
      return result(STATUS.MISSING, 'The availability period for issued security updates is not declared. Article 13(9) sets a ten-year floor.', findings);
    }
    let remainingYears = 0;
    const end = endRaw ? parseSupportDate(endRaw) : null;
    if (end) {
      remainingYears = Math.max(0, monthsBetween(now, end.date) / 12);
      findings.push(finding('remaining support period', `${remainingYears.toFixed(1)} year(s)`));
    }
    const floor = Math.max(UPDATE_AVAILABILITY_FLOOR_YEARS, remainingYears);
    findings.push(finding('applicable floor', `${floor.toFixed(1)} year(s)`));
    if (years >= floor) {
      return result(STATUS.DECLARED, `Security updates are declared to stay available for ${years} years, at or above the applicable floor.`, findings);
    }
    return result(STATUS.PARTIAL, `The declared availability of ${years} years is below the floor of ${floor.toFixed(1)} years set by Article 13(9).`, findings);
  },

  annexTwoCoverage(context) {
    const { profile, inventory } = context;
    const docs = inventory.docs;
    // One entry per point of Annex II, so a gap names the point it belongs to.
    const points = [
      { locus: 'AnnexII.1', label: 'Manufacturer name and contact details', covered: has(profile, 'manufacturer.legalName') && (has(profile, 'manufacturer.postalAddress') || has(profile, 'manufacturer.email') || has(profile, 'manufacturer.website')) },
      { locus: 'AnnexII.2', label: 'Single point of contact for vulnerability reports and where the disclosure policy is found', covered: has(profile, 'manufacturer.singlePointOfContact') && (has(profile, 'vulnerabilityHandling.disclosurePolicyUrl') || docs.securityPolicy.present) },
      { locus: 'AnnexII.3', label: 'Name, type and information enabling unique identification', covered: has(profile, 'product.commercialName') },
      { locus: 'AnnexII.4', label: 'Intended purpose, security environment, essential functionalities and security properties', covered: has(profile, 'product.intendedPurpose') && has(profile, 'product.securityEnvironment') },
      { locus: 'AnnexII.5', label: 'Known or foreseeable circumstances leading to significant cybersecurity risks', covered: has(profile, 'product.foreseeableMisuse') },
      { locus: 'AnnexII.6', label: 'Internet address of the EU declaration of conformity', covered: has(profile, 'regulatoryPosition.euDeclarationOfConformityUrl') },
      { locus: 'AnnexII.7', label: 'Type of security support and end date of the support period', covered: has(profile, 'supportPeriod.endDate') },
      { locus: 'AnnexII.8', label: 'Instructions for secure commissioning, updates and decommissioning', covered: has(profile, 'userInformation.secureInstallationInstructions') && has(profile, 'userInformation.secureDecommissioningInstructions') },
      { locus: 'AnnexII.9', label: 'Where the software bill of materials can be accessed, if disclosed', covered: declared(profile, 'userInformation.sbomDisclosedToUsers') !== null },
    ];
    const covered = points.filter((point) => point.covered);
    const findings = points.map((point) => finding(`${point.locus} - ${point.label}`, point.covered ? 'covered' : 'not covered'));
    if (covered.length === 0) return result(STATUS.MISSING, 'None of the nine Annex II points is covered.', findings);
    if (covered.length === points.length) {
      return result(STATUS.DECLARED, 'All nine Annex II points are covered by declarations. Whether this information actually accompanies the delivered product is outside what this tool observes.', findings);
    }
    return result(STATUS.PARTIAL, `${covered.length} of ${points.length} Annex II points are covered.`, findings);
  },

  secureUsageInstructions(context) {
    const { inventory, profile } = context;
    const docs = inventory.docs;
    const findings = [
      finding('installation section detected in the readme', docs.readme.mentionsInstallation ? 'yes' : 'no'),
      finding('configuration section detected in the readme', docs.readme.mentionsConfiguration ? 'yes' : 'no'),
      finding('secure configuration wording detected', String(docs.secureConfigurationDocs.signals.length)),
      finding('security-related documents', docs.secureConfigurationDocs.matchedFiles.join(', ') || 'none'),
      // Say out loud what the relevance filter dropped. A repository whose only
      // hardening guide sits under examples/ would otherwise read as missing
      // with no way for the reader to see why.
      ...((docs.secureConfigurationDocs.excludedNonEvidencePaths ?? []).length > 0
        ? [finding('candidates ignored as test or example material', docs.secureConfigurationDocs.excludedNonEvidencePaths.join(', '))]
        : []),
      finding('secure installation instructions declared', has(profile, 'userInformation.secureInstallationInstructions') ? 'yes' : 'no'),
      finding('secure decommissioning instructions declared', has(profile, 'userInformation.secureDecommissioningInstructions') ? 'yes' : 'no'),
    ];
    const declaredBoth = has(profile, 'userInformation.secureInstallationInstructions') && has(profile, 'userInformation.secureDecommissioningInstructions');
    const detected = docs.secureConfigurationDocs.signals.length > 0 || docs.secureConfigurationDocs.matchedFiles.length > 0;
    if (declaredBoth && detected) {
      return result(STATUS.PARTIAL, 'Secure usage instructions are declared and security documentation was detected. Keyword detection cannot confirm that the instructions cover Annex II, point 8 in full.', findings);
    }
    if (declaredBoth) return result(STATUS.DECLARED, 'Secure installation and decommissioning instructions are declared.', findings);
    if (detected) return result(STATUS.PARTIAL, 'Security-related documentation was detected but the Annex II, point 8 instructions are not declared.', findings);
    return result(STATUS.MISSING, 'No secure installation, update or decommissioning instructions were found or declared.', findings);
  },

  riskAssessment(context) {
    const { profile, now } = context;
    const reference = declared(profile, 'riskAssessment.documentReference');
    const lastUpdated = declared(profile, 'riskAssessment.lastUpdated');
    const coversPartI = declared(profile, 'riskAssessment.coversAnnexIPartI');
    const findings = [
      finding('risk assessment reference', reference ?? 'not declared'),
      finding('last updated', lastUpdated ?? 'not declared'),
      finding('states how Annex I, Part I applies', coversPartI === true ? 'yes' : coversPartI === false ? 'no' : 'not declared'),
    ];
    if (!reference) {
      return result(STATUS.MISSING, 'No cybersecurity risk assessment is referenced. Article 13(2) and (3) require one, and Annex VII, point 3 places it in the technical documentation.', findings);
    }
    if (coversPartI !== true) {
      return result(STATUS.PARTIAL, 'A risk assessment is referenced, but it is not recorded as stating whether and how Annex I, Part I applies, which Article 13(3) requires.', findings);
    }
    if (lastUpdated) {
      const parsed = parseSupportDate(lastUpdated);
      if (parsed && monthsBetween(parsed.date, now) > 24) {
        findings.push(finding('age', `${monthsBetween(parsed.date, now)} months`));
        return result(STATUS.STALE, `The referenced risk assessment was last updated ${lastUpdated}, more than 24 months ago. Article 13(3) requires it to be updated as appropriate during the support period.`, findings);
      }
    }
    return result(STATUS.NEEDS_EXPERT_REVIEW, 'A risk assessment is referenced and covers Annex I, Part I. Its adequacy is a judgement this tool cannot make.', findings);
  },

  notApplicableJustifications(context) {
    const { profile, loci } = context;
    const exclusions = declared(profile, 'riskAssessment.notApplicableRequirements') ?? [];
    if (!Array.isArray(exclusions) || exclusions.length === 0) {
      return result(STATUS.NOT_APPLICABLE, 'No essential requirement is declared as not applicable, so Article 13(4) does not add a documentation duty here.', []);
    }
    const findings = exclusions.map((item) => finding(item.locus, loci[item.locus] ? 'valid locus' : 'unknown locus', item.justification));
    const unknown = exclusions.filter((item) => !loci[item.locus]);
    if (unknown.length > 0) {
      return result(STATUS.ERROR, `${unknown.length} exclusion(s) cite a locus that does not exist in the Regulation: ${unknown.map((item) => item.locus).join(', ')}.`, findings);
    }
    return result(STATUS.NEEDS_EXPERT_REVIEW, `${exclusions.length} essential requirement(s) are declared not applicable, each with a justification. Article 13(4) makes every one of these a legal position to review.`, findings);
  },

  technicalDocumentation(context) {
    const { profile } = context;
    const location = declared(profile, 'technicalDocumentation.location');
    const retention = declared(profile, 'technicalDocumentation.retentionYears');
    const updateProcess = declared(profile, 'technicalDocumentation.updateProcess');
    const findings = [
      finding('location', location ?? 'not declared'),
      finding('retention', retention === null ? 'not declared' : `${retention} year(s)`),
      finding('update process', updateProcess ?? 'not declared'),
    ];
    if (!location) return result(STATUS.MISSING, 'The location of the technical documentation required by Article 31 is not recorded.', findings);
    if (retention !== null && retention < 10) {
      return result(STATUS.PARTIAL, `A retention of ${retention} years is below the ten-year floor in Article 13(13).`, findings);
    }
    if (!updateProcess || retention === null) {
      return result(STATUS.PARTIAL, 'The documentation location is recorded, but the update process or the retention period is not.', findings);
    }
    return result(STATUS.DECLARED, `Technical documentation is held at: ${location}, retained ${retention} years, updated through: ${updateProcess}.`, findings);
  },

  conformityRoute(context) {
    const { profile } = context;
    const module = declared(profile, 'regulatoryPosition.conformityAssessmentModule');
    const docUrl = declared(profile, 'regulatoryPosition.euDeclarationOfConformityUrl');
    const standards = declared(profile, 'regulatoryPosition.harmonisedStandardsApplied') ?? [];
    const findings = [
      finding('conformity assessment module', module ?? 'not declared'),
      finding('EU declaration of conformity', docUrl ?? 'not declared'),
      finding('harmonised standards applied', standards.length > 0 ? standards.join(', ') : 'none declared'),
    ];
    const decided = module && module !== 'undetermined';
    if (!decided && !docUrl) {
      return result(STATUS.MISSING, 'No conformity assessment route under Article 32 is recorded and no EU declaration of conformity is referenced.', findings);
    }
    if (!decided) return result(STATUS.PARTIAL, 'A declaration of conformity is referenced but the assessment route is not recorded.', findings);
    if (!docUrl) {
      return result(STATUS.NEEDS_EXPERT_REVIEW, `Route recorded as ${module}. No EU declaration of conformity is referenced yet; Annex VII, point 7 expects a copy in the technical documentation.`, findings);
    }
    return result(STATUS.NEEDS_EXPERT_REVIEW, `Route recorded as ${module}, declaration published at ${docUrl}. Whether the route is correct depends on the Annex III and IV classification.`, findings);
  },

  incidentReportingReadiness(context) {
    const { profile, now } = context;
    const base = 'vulnerabilityHandling.incidentReporting';
    const owner = declared(profile, `${base}.responsibleRole`);
    const csirt = declared(profile, `${base}.csirtCoordinator`);
    const platform = declared(profile, `${base}.singleReportingPlatformPrepared`);
    const userNotice = declared(profile, `${base}.impactedUserNotificationDocumented`) === true;
    const vulnerabilityTrack = declared(profile, `${base}.activelyExploitedVulnerability.procedureDocumented`) === true;
    const vulnerabilityLocation = declared(profile, `${base}.activelyExploitedVulnerability.procedureLocation`);
    const incidentTrack = declared(profile, `${base}.severeIncident.procedureDocumented`) === true;
    const incidentLocation = declared(profile, `${base}.severeIncident.procedureLocation`);
    const severityCriteria = declared(profile, `${base}.severeIncident.severityCriteriaDocumented`) === true;
    const undifferentiated = declared(profile, `${base}.procedureDocumented`) === true;

    const applicationDate = new Date(`${ARTICLE_14_APPLICATION_DATE}T00:00:00Z`);
    const daysUntil = Math.ceil((applicationDate.getTime() - now.getTime()) / 86400000);
    const findings = [
      finding('Article 14 applies from', ARTICLE_14_APPLICATION_DATE, daysUntil > 0 ? `in ${daysUntil} day(s)` : 'already in force'),
      finding('actively exploited vulnerability procedure',
        vulnerabilityTrack ? `documented at ${vulnerabilityLocation ?? 'an undeclared location'}` : 'not documented',
        `Article 14(2): ${VULNERABILITY_TRACK_DEADLINES}`),
      finding('severe incident procedure',
        incidentTrack ? `documented at ${incidentLocation ?? 'an undeclared location'}` : 'not documented',
        `Article 14(4): ${INCIDENT_TRACK_DEADLINES}`),
      finding('criteria for a severe incident documented', severityCriteria ? 'yes' : 'no',
        'Article 14(5) defines when an incident is severe and therefore reportable'),
      finding('procedure to inform impacted users documented', userNotice ? 'yes' : 'no', 'Article 14(8)'),
      finding('responsible role', owner ?? 'nobody named'),
      finding('coordinating CSIRT', csirt ?? 'not declared'),
      finding('single reporting platform prepared', platform === true ? 'yes' : platform === false ? 'no' : 'not declared'),
    ];
    if (undifferentiated) {
      findings.push(finding('undifferentiated declaration present', 'yes',
        'a single procedure declared without saying which of the two tracks it covers'));
    }

    if (!vulnerabilityTrack && !incidentTrack) {
      if (undifferentiated) {
        return result(STATUS.PARTIAL, 'One undifferentiated reporting procedure is declared. Article 14 carries two tracks with different triggers and different final report deadlines; restate the declaration for each track.', findings);
      }
      return result(STATUS.MISSING, `No Article 14 reporting procedure is documented for either track. Both apply from ${ARTICLE_14_APPLICATION_DATE}.`, findings);
    }
    if (!vulnerabilityTrack) {
      return result(STATUS.PARTIAL, `The severe incident track is documented but the actively exploited vulnerability track of Article 14(1) and (2) is not: ${VULNERABILITY_TRACK_DEADLINES}.`, findings);
    }
    if (!incidentTrack) {
      return result(STATUS.PARTIAL, `The vulnerability track is documented but the severe incident track of Article 14(3) and (4) is not: ${INCIDENT_TRACK_DEADLINES}.`, findings);
    }
    if (!owner || !csirt) {
      return result(STATUS.PARTIAL, 'Both tracks are documented but the declaration does not name both a responsible role and the coordinating CSIRT.', findings);
    }
    if (!severityCriteria) {
      return result(STATUS.PARTIAL, 'Both tracks are documented but the severity criteria of Article 14(5) are not, so nothing states when an incident becomes reportable.', findings);
    }
    if (!userNotice) {
      return result(STATUS.PARTIAL, 'Both tracks are documented but the Article 14(8) duty to inform impacted users of the vulnerability or incident is not.', findings);
    }
    return result(STATUS.NEEDS_EXPERT_REVIEW, `Both reporting tracks are documented, owned by ${owner}, coordinating CSIRT ${csirt}. The designated CSIRT and the deadlines must be confirmed for each Member State concerned.`, findings);
  },
};
