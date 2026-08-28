import { readRepoFile, repoFileExists, walkRepo } from '../util/fs.mjs';

/**
 * Workflow files are scanned textually, not parsed as YAML. That is a deliberate
 * trade: it keeps the tool dependency-free, and every signal it produces is
 * reported as a detected mention rather than a proven behaviour. Rules that
 * consume these signals must never reach 'verified' on their strength alone.
 */

const SIGNALS = Object.freeze({
  testExecution: [/\bnpm\s+(?:run\s+)?test\b/, /\bnpm\s+ci\b/, /\byarn\s+test\b/, /\bpnpm\s+test\b/, /\bnode\s+--test\b/, /\b(?:jest|vitest|mocha|ava|tap)\b/],
  dependencyAudit: [/\bnpm\s+audit\b/, /\byarn\s+audit\b/, /\bpnpm\s+audit\b/, /\bosv-scanner\b/, /\bsnyk\b/, /\btrivy\b/, /\bgrype\b/, /dependency-review-action/],
  staticAnalysis: [/github\/codeql-action/, /\bsemgrep\b/, /\bsonar/i, /\bbandit\b/, /\beslint\b.*--?max-warnings/, /ossf\/scorecard-action/],
  secretScanning: [/gitleaks/i, /trufflehog/i, /secret-scanning/i],
  sbomGeneration: [/cyclonedx/i, /\bsyft\b/, /spdx-sbom-generator/, /anchore\/sbom-action/],
  provenance: [/--provenance\b/, /id-token:\s*write/, /actions\/attest/, /slsa-framework/],
  signing: [/\bcosign\b/, /sigstore/i, /gpg\s+--sign/, /\bnotary\b/],
  publishing: [/\bnpm\s+publish\b/, /JS-DevTools\/npm-publish/, /\bnpm\s+version\b/],
  pinnedActions: [/uses:\s*[^\s@]+@[0-9a-f]{40}/],
  mutableActionRefs: [/uses:\s*[^\s@]+@(?:main|master|v\d+(?:\.\d+)*)\s*$/m],
});

function scan(text) {
  const detected = {};
  for (const [signal, patterns] of Object.entries(SIGNALS)) {
    detected[signal] = patterns.some((pattern) => pattern.test(text));
  }
  return detected;
}

function mergeSignals(list) {
  const merged = {};
  for (const key of Object.keys(SIGNALS)) merged[key] = list.some((item) => item.signals[key]);
  return merged;
}

/**
 * @returns {object} continuous-integration inventory with per-workflow signals
 */
export function inspectCi(root) {
  const notes = [];
  const { files } = walkRepo(root);
  const workflowPaths = files.filter((f) => /^\.github\/workflows\/[^/]+\.ya?ml$/i.test(f)).sort();

  const workflows = [];
  for (const path of workflowPaths) {
    const text = readRepoFile(root, path);
    if (text === null) {
      notes.push(`workflow ${path} could not be read`);
      continue;
    }
    const nameMatch = /^name:\s*(.+)$/m.exec(text);
    const triggersOnSchedule = /^\s*schedule:/m.test(text);
    const triggersOnRelease = /^\s*(?:release|push):/m.test(text) && /tags:/.test(text) || /^\s*release:/m.test(text);
    workflows.push({
      path,
      name: nameMatch ? nameMatch[1].trim().replace(/^["']|["']$/g, '') : null,
      lengthBytes: Buffer.byteLength(text, 'utf8'),
      triggersOnSchedule,
      triggersOnRelease,
      signals: scan(text),
    });
  }

  const dependabotPath = ['.github/dependabot.yml', '.github/dependabot.yaml'].find((p) => repoFileExists(root, p)) ?? null;
  const dependabotText = dependabotPath ? readRepoFile(root, dependabotPath) : null;
  const renovatePath = ['renovate.json', '.github/renovate.json', '.renovaterc', '.renovaterc.json', '.github/renovate.json5']
    .find((p) => repoFileExists(root, p)) ?? null;

  const otherCi = files.filter((f) => /^(?:\.gitlab-ci\.ya?ml|\.circleci\/config\.ya?ml|Jenkinsfile|\.travis\.ya?ml|azure-pipelines\.ya?ml)$/i.test(f));
  if (otherCi.length > 0 && workflowPaths.length === 0) {
    notes.push(`non-GitHub CI configuration detected (${otherCi.join(', ')}); this version only extracts signals from GitHub Actions workflows`);
  }

  return {
    provider: workflowPaths.length > 0 ? 'github-actions' : (otherCi.length > 0 ? 'other' : 'none'),
    workflowCount: workflowPaths.length,
    workflows,
    signals: mergeSignals(workflows),
    otherCiFiles: otherCi,
    dependencyUpdates: {
      dependabot: {
        present: Boolean(dependabotPath),
        path: dependabotPath,
        ecosystems: dependabotText ? [...new Set(dependabotText.match(/package-ecosystem:\s*["']?([a-z-]+)/gi) ?? [])].map((s) => s.split(/["':\s]+/).pop()).sort() : [],
      },
      renovate: { present: Boolean(renovatePath), path: renovatePath },
      securityUpdatesConfigured: Boolean(dependabotPath || renovatePath),
    },
    notes,
  };
}
