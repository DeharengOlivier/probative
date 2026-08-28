import { safeResolve } from '../util/fs.mjs';
import { hashFile, hashValue } from '../util/hash.mjs';
import { toIso } from '../util/time.mjs';

/**
 * An evidence record answers, for one artefact: what it is, where it came from,
 * how it was obtained, at which commit, and what it does not prove. A finding
 * without a record behind it is an opinion, and the pack does not carry those.
 */
function record({ id, type, source, commit, collectedAt, hash, outcome, limitations, command = null }) {
  return {
    id, type, source, command, commit, collectedAt, hash, outcome,
    limitations: limitations ?? null,
  };
}

const READ_ONLY_FILE = 'repository-file';

/**
 * @returns {{schemaVersion: string, generatedAt: string, commit: string|null,
 *   worktreeClean: boolean|null, stateFingerprint: string, records: object[],
 *   redaction: object, notes: string[]}}
 */
export function buildEvidenceManifest({ root, inventory, profileResult, sbom, sbomStats, now, redactionFindings }) {
  const collectedAt = toIso(now);
  const commit = inventory.git.commit;
  const records = [];

  const fileRecord = (id, relativePath, outcome, limitations) => {
    if (!relativePath) return;
    const absolute = safeResolve(root, relativePath);
    const hash = absolute ? hashFile(absolute) : null;
    records.push(record({
      id, type: READ_ONLY_FILE, source: relativePath, commit, collectedAt,
      hash, outcome, limitations,
    }));
  };

  fileRecord('package-manifest', inventory.package.present ? 'package.json' : null, 'read', 'Describes the repository package, not necessarily the artefact delivered to customers.');
  fileRecord('dependency-lockfile', inventory.lockfile.present ? 'package-lock.json' : null, 'read', 'Resolved dependency set at this commit. Build-time and vendored components are not covered.');
  fileRecord('security-policy', inventory.docs.securityPolicy.path, 'read', 'Presence and wording only. Enforcement of the policy is not observable.');
  fileRecord('readme', inventory.docs.readme.path, 'read', 'Keyword detection over headings; absence of a keyword is not absence of a practice.');
  fileRecord('changelog', inventory.docs.changelog.path, 'read', 'Vulnerability identifiers are matched textually.');
  fileRecord('security-txt', inventory.docs.securityTxt.path, 'read', null);
  fileRecord('license', inventory.docs.license.path, 'read', null);
  fileRecord('product-profile', profileResult.present ? profileResult.path : null, profileResult.valid ? 'read and validated' : 'read with schema errors', 'Manufacturer declarations. Nothing here is verified by this tool.');

  for (const workflow of inventory.ci.workflows) {
    fileRecord(`ci-workflow:${workflow.path}`, workflow.path, 'read', 'Scanned as text, not parsed as YAML. Detected signals are mentions, not proven behaviour.');
  }
  if (inventory.ci.dependencyUpdates.dependabot.path) {
    fileRecord('dependabot-config', inventory.ci.dependencyUpdates.dependabot.path, 'read', null);
  }
  if (inventory.ci.dependencyUpdates.renovate.path) {
    fileRecord('renovate-config', inventory.ci.dependencyUpdates.renovate.path, 'read', null);
  }

  records.push(record({
    id: 'git-state',
    type: 'command-output',
    source: 'git',
    command: 'git rev-parse HEAD; git status --porcelain; git tag --points-at HEAD',
    commit, collectedAt,
    hash: hashValue({ commit, dirty: inventory.git.dirty, tags: inventory.git.tagsAtHead }),
    outcome: inventory.git.available ? 'collected' : 'git unavailable',
    limitations: 'Read-only git invocations with a fixed argument list. No repository script, hook or alias is executed by this tool.',
  }));

  if (sbom) {
    records.push(record({
      id: 'generated-sbom',
      type: 'generated-artefact',
      source: 'sbom.cdx.json',
      command: 'cra-evidence collect (CycloneDX generated from package-lock.json)',
      commit, collectedAt,
      hash: hashValue(sbom),
      outcome: `CycloneDX ${sbom.specVersion} with ${sbomStats.componentCount} component(s)`,
      limitations: 'Derived from the lockfile without installing anything. Components added at build time or vendored into the repository are not represented.',
    }));
  }

  records.sort((a, b) => a.id.localeCompare(b.id));

  return {
    schemaVersion: '1.0.0',
    generatedAt: collectedAt,
    commit,
    worktreeClean: inventory.git.dirty === null ? null : !inventory.git.dirty,
    stateFingerprint: inventory.stateFingerprint,
    records,
    redaction: {
      applied: true,
      findings: summariseRedaction(redactionFindings ?? []),
    },
    notes: [
      'Every record is bound to the commit named above. If the commit changes, the evidence must be regenerated.',
      'No project script was executed and no network request was made while collecting this evidence.',
    ],
  };
}

function summariseRedaction(findings) {
  const counts = new Map();
  for (const item of findings) counts.set(item.rule, (counts.get(item.rule) ?? 0) + item.count);
  return [...counts.entries()].sort((a, b) => a[0].localeCompare(b[0])).map(([rule, count]) => ({ rule, count }));
}
