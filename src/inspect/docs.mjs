import { readRepoFile, repoFileExists, walkRepo, partitionByEvidenceRelevance } from '../util/fs.mjs';
import { WALK_TRUNCATED_NOTE } from './walk-note.mjs';
import { redact } from '../util/redact.mjs';

const SECURITY_POLICY_PATHS = ['SECURITY.md', '.github/SECURITY.md', 'docs/SECURITY.md', 'SECURITY.rst', 'SECURITY.txt'];
const READMES = ['README.md', 'README.rst', 'README.txt', 'readme.md'];
const CHANGELOGS = ['CHANGELOG.md', 'CHANGELOG.rst', 'CHANGES.md', 'HISTORY.md', 'docs/CHANGELOG.md'];
const LICENSES = ['LICENSE', 'LICENSE.md', 'LICENSE.txt', 'LICENCE', 'LICENCE.md', 'COPYING'];
const CONTRIBUTING = ['CONTRIBUTING.md', '.github/CONTRIBUTING.md', 'docs/CONTRIBUTING.md'];
const SECURITY_TXT = ['.well-known/security.txt', 'security.txt'];

const EMAIL = /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/g;
const URL = /\bhttps?:\/\/[^\s<>()[\]"']+/g;

/** Wording that indicates a coordinated disclosure process rather than a bare inbox. */
const DISCLOSURE_SIGNALS = [
  /coordinated (?:vulnerability )?disclosure/i,
  /responsible disclosure/i,
  /disclosure polic/i,
  /embargo/i,
  /we (?:will )?(?:aim to )?(?:acknowledge|respond)[^.]{0,60}(?:within|in)\s+\d+\s*(?:business\s*)?(?:hours?|days?)/i,
  /report (?:a )?(?:security )?vulnerabilit/i,
  /security advisor/i,
];

const SUPPORTED_VERSIONS = [/supported versions/i, /security support/i, /support(?:ed)? until/i, /end[- ]of[- ](?:life|support)/i];

const SECURE_INSTALL_SIGNALS = [
  /secure (?:installation|configuration|deployment|setup)/i,
  /hardening/i,
  /security (?:considerations|configuration|checklist|best practices)/i,
  /production (?:deployment|checklist|configuration)/i,
  /threat model/i,
];

// A directory dedicated to SBOMs still only holds SBOMs if the file is one:
// without the extension anchor, `src/sbom/uuid.mjs` matched.
const SBOM_FILE = /(?:^|\/)(?:bom|sbom)[^/]*\.(?:json|xml)$|\.(?:cdx|spdx)\.(?:json|xml)$|(?:^|\/)sbom\/.*\.(?:json|xml)$/i;
const VEX_FILE = /(?:^|\/)[^/]*vex[^/]*\.(?:json|xml)$/i;

/**
 * A probative pack is self-describing: it always carries both of these files at
 * its own root. A pack written inside the repository it describes is the tool
 * speaking about itself, and nothing inside it is evidence about the product.
 * Without this, `probative run . --out cra-evidence/` produced a pack whose own
 * CycloneDX file came back as an SBOM shipped by the product, which changed the
 * observed state and made every self-contained pack fail its own freshness
 * check.
 */
const PACK_MARKERS = ['evidence-manifest.json', 'pack.json'];

/**
 * @param {string[]} files repository-relative paths
 * @returns {string[]} directories that hold a complete pack marker set
 * Complexity: O(number of files).
 */
function packDirectories(files) {
  const markersByDirectory = new Map();
  for (const file of files) {
    const separator = file.lastIndexOf('/');
    // The repository root is never a pack: treating it as one would blank the
    // entire inventory instead of excluding a subdirectory.
    if (separator === -1) continue;
    const name = file.slice(separator + 1);
    if (!PACK_MARKERS.includes(name)) continue;
    const directory = file.slice(0, separator);
    const seen = markersByDirectory.get(directory) ?? new Set();
    seen.add(name);
    markersByDirectory.set(directory, seen);
  }
  return [...markersByDirectory]
    .filter(([, seen]) => seen.size === PACK_MARKERS.length)
    .map(([directory]) => directory);
}

function firstExisting(root, candidates) {
  for (const candidate of candidates) if (repoFileExists(root, candidate)) return candidate;
  return null;
}

function analyseSecurityPolicy(text) {
  if (!text) return null;
  const emails = [...new Set(text.match(EMAIL) ?? [])].sort();
  const urls = [...new Set((text.match(URL) ?? []).map((u) => redact(u).text))].sort();
  const advisoryUrls = urls.filter((u) => /security\/advisories|\/security\/policy|huntr|hackerone|bugcrowd|openbugbounty/i.test(u));
  return {
    lengthBytes: Buffer.byteLength(text, 'utf8'),
    contactEmails: emails,
    contactUrls: urls.filter((u) => /report|security|vuln|contact|advisor/i.test(u)),
    advisoryUrls,
    hasContact: emails.length > 0 || advisoryUrls.length > 0,
    disclosureSignals: DISCLOSURE_SIGNALS.filter((p) => p.test(text)).map((p) => p.source),
    mentionsSupportedVersions: SUPPORTED_VERSIONS.some((p) => p.test(text)),
    mentionsResponseTime: /(?:within|in)\s+\d+\s*(?:business\s*)?(?:hours?|days?)/i.test(text),
  };
}

/**
 * @returns {object} factual document inventory; nothing here is a compliance judgement
 */
export function inspectDocs(root, { walk } = {}) {
  const notes = [];
  const { files, truncated } = walk ?? walkRepo(root);
  if (truncated) notes.push(WALK_TRUNCATED_NOTE('document'));

  const securityPolicyPath = firstExisting(root, SECURITY_POLICY_PATHS);
  const securityPolicyText = securityPolicyPath ? readRepoFile(root, securityPolicyPath) : null;
  const readmePath = firstExisting(root, READMES);
  const readmeText = readmePath ? readRepoFile(root, readmePath) : null;
  const changelogPath = firstExisting(root, CHANGELOGS);
  const changelogText = changelogPath ? readRepoFile(root, changelogPath) : null;
  const securityTxtPath = firstExisting(root, SECURITY_TXT);
  const securityTxtText = securityTxtPath ? readRepoFile(root, securityTxtPath) : null;

  const packDirs = packDirectories(files);
  const isToolOutput = (path) => packDirs.some((directory) => path.startsWith(`${directory}/`));

  const advisories = partitionByEvidenceRelevance(files.filter((f) => /^\.github\/security\/advisories\//i.test(f) || /^security\/advisories\//i.test(f)), isToolOutput);
  const sboms = partitionByEvidenceRelevance(files.filter((f) => SBOM_FILE.test(f)), isToolOutput);
  const vexes = partitionByEvidenceRelevance(files.filter((f) => VEX_FILE.test(f)), isToolOutput);
  const secureConfigDocs = partitionByEvidenceRelevance(
    files.filter((f) => /(?:hardening|security|secure-config|threat-model|deployment)/i.test(f) && /\.(md|rst|txt|adoc)$/i.test(f)),
    isToolOutput,
  );

  const combinedUserDocs = [readmeText, changelogText, securityPolicyText].filter(Boolean).join('\n');
  const docsDirectory = files.some((f) => /^docs?\//i.test(f));

  return {
    securityPolicy: {
      path: securityPolicyPath,
      present: Boolean(securityPolicyPath),
      analysis: analyseSecurityPolicy(securityPolicyText),
    },
    securityTxt: {
      path: securityTxtPath,
      present: Boolean(securityTxtPath),
      hasContactField: Boolean(securityTxtText && /^Contact:/im.test(securityTxtText)),
      hasExpiresField: Boolean(securityTxtText && /^Expires:/im.test(securityTxtText)),
    },
    readme: {
      path: readmePath,
      present: Boolean(readmePath),
      lengthBytes: readmeText ? Buffer.byteLength(readmeText, 'utf8') : 0,
      mentionsInstallation: Boolean(readmeText && /##?\s*(?:installation|install|getting started|quick ?start|setup)/i.test(readmeText)),
      mentionsConfiguration: Boolean(readmeText && /##?\s*(?:configuration|config|environment|settings)/i.test(readmeText)),
      mentionsUpgrade: Boolean(readmeText && /##?\s*(?:upgrad|updat|migrat)/i.test(readmeText)),
    },
    changelog: {
      path: changelogPath,
      present: Boolean(changelogPath),
      entryCount: changelogText ? (changelogText.match(/^##\s+/gm) ?? []).length : 0,
      securityEntryCount: changelogText ? (changelogText.match(/^###?\s*security/gim) ?? []).length : 0,
      cveReferences: changelogText ? [...new Set(changelogText.match(/CVE-\d{4}-\d{4,7}/g) ?? [])].sort() : [],
      ghsaReferences: changelogText ? [...new Set(changelogText.match(/GHSA-[a-z0-9]{4}-[a-z0-9]{4}-[a-z0-9]{4}/gi) ?? [])].sort() : [],
    },
    license: { path: firstExisting(root, LICENSES), present: Boolean(firstExisting(root, LICENSES)) },
    contributing: { path: firstExisting(root, CONTRIBUTING), present: Boolean(firstExisting(root, CONTRIBUTING)) },
    advisories: { count: advisories.kept.length, paths: advisories.kept.slice(0, 50), excludedNonEvidencePaths: advisories.excluded.slice(0, 20) },
    existingSbom: { count: sboms.kept.length, paths: sboms.kept.slice(0, 20), excludedNonEvidencePaths: sboms.excluded.slice(0, 20) },
    existingVex: { count: vexes.kept.length, paths: vexes.kept.slice(0, 20), excludedNonEvidencePaths: vexes.excluded.slice(0, 20) },
    secureConfigurationDocs: {
      docsDirectory,
      signals: SECURE_INSTALL_SIGNALS.filter((p) => p.test(combinedUserDocs)).map((p) => p.source),
      matchedFiles: secureConfigDocs.kept.slice(0, 20),
      excludedNonEvidencePaths: secureConfigDocs.excluded.slice(0, 20),
    },
    fileCount: files.length,
    notes,
  };
}
