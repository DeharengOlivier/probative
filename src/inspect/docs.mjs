import { readRepoFile, repoFileExists, walkRepo } from '../util/fs.mjs';
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

const SBOM_FILE = /(?:^|\/)(?:bom|sbom)[^/]*\.(?:json|xml)$|\.(?:cdx|spdx)\.(?:json|xml)$|(?:^|\/)sbom\//i;
const VEX_FILE = /(?:^|\/)[^/]*vex[^/]*\.(?:json|xml)$/i;

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
export function inspectDocs(root) {
  const notes = [];
  const { files, truncated } = walkRepo(root);
  if (truncated) notes.push('repository walk hit its entry ceiling; the document inventory may be incomplete');

  const securityPolicyPath = firstExisting(root, SECURITY_POLICY_PATHS);
  const securityPolicyText = securityPolicyPath ? readRepoFile(root, securityPolicyPath) : null;
  const readmePath = firstExisting(root, READMES);
  const readmeText = readmePath ? readRepoFile(root, readmePath) : null;
  const changelogPath = firstExisting(root, CHANGELOGS);
  const changelogText = changelogPath ? readRepoFile(root, changelogPath) : null;
  const securityTxtPath = firstExisting(root, SECURITY_TXT);
  const securityTxtText = securityTxtPath ? readRepoFile(root, securityTxtPath) : null;

  const advisoryFiles = files.filter((f) => /^\.github\/security\/advisories\//i.test(f) || /^security\/advisories\//i.test(f));
  const sbomFiles = files.filter((f) => SBOM_FILE.test(f) && !f.startsWith('test/'));
  const vexFiles = files.filter((f) => VEX_FILE.test(f));

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
    advisories: { count: advisoryFiles.length, paths: advisoryFiles.slice(0, 50) },
    existingSbom: { count: sbomFiles.length, paths: sbomFiles.slice(0, 20) },
    existingVex: { count: vexFiles.length, paths: vexFiles.slice(0, 20) },
    secureConfigurationDocs: {
      docsDirectory,
      signals: SECURE_INSTALL_SIGNALS.filter((p) => p.test(combinedUserDocs)).map((p) => p.source),
      matchedFiles: files.filter((f) => /(?:hardening|security|secure-config|threat-model|deployment)/i.test(f) && /\.(md|rst|txt|adoc)$/i.test(f)).slice(0, 20),
    },
    fileCount: files.length,
    notes,
  };
}
