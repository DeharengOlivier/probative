import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { inspectRepository } from './inspect/index.mjs';
import { loadProfile } from './profile/index.mjs';
import { buildCycloneDx } from './sbom/cyclonedx.mjs';
import { buildEvidenceManifest } from './evidence/manifest.mjs';
import { evaluate, loadLoci, loadRuleset, DEFAULT_RULESET } from './rules/evaluate.mjs';
import { renderPack } from './render/pack.mjs';
import { readRepoFile } from './util/fs.mjs';
import { hashFile } from './util/hash.mjs';
import { resolveNow } from './util/time.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const packageRoot = join(here, '..');
export const TOOL_VERSION = JSON.parse(readFileSync(join(packageRoot, 'package.json'), 'utf8')).version;

/** Annex VII points 1 to 8, with the official wording as the required content. */
function buildAnnexViiIndex(loci) {
  return ['1', '2', '3', '4', '5', '6', '7', '8']
    .map((point) => {
      const locus = `AnnexVII.${point}`;
      const entry = loci[locus];
      if (!entry) return null;
      const text = entry.text.replace(/\s+/g, ' ').trim();
      return {
        locus,
        reference: entry.ref,
        summary: text.length > 220 ? `${text.slice(0, 217)}...` : text,
      };
    })
    .filter(Boolean);
}

/** The register as shipped, plus the digest of every local copy at run time. */
function buildSourceRegister() {
  const register = JSON.parse(readFileSync(join(packageRoot, 'rules', 'sources.json'), 'utf8'));
  return {
    ...register,
    sources: register.sources.map((source) => (source.localCopy
      ? { ...source, localCopyDigest: hashFile(join(packageRoot, source.localCopy)) }
      : source)),
  };
}

/**
 * Run the whole read-only pipeline over a repository and return every artefact,
 * without writing anything. The caller decides what to persist.
 */
export function runPipeline(root, options = {}) {
  const now = resolveNow(options);
  const inventory = inspectRepository(root, { ...options, nowOverride: options.nowOverride });
  const profileResult = loadProfile(root, options);

  let sbom = null;
  let sbomStats = { componentCount: 0, excludedDevelopmentComponents: 0, topLevelCovered: 0, topLevelDeclared: 0, componentsWithoutHash: 0, dependencyEdges: 0 };
  let sbomWarnings = [];

  if (inventory.lockfile.present && !inventory.lockfile.error) {
    let lockPackages = {};
    try {
      lockPackages = JSON.parse(readRepoFile(root, 'package-lock.json') ?? '{}').packages ?? {};
    } catch {
      lockPackages = {};
    }
    const built = buildCycloneDx({
      inventory, lockPackages, now, toolVersion: TOOL_VERSION,
      includeDev: options.includeDev === true,
    });
    sbom = built.sbom;
    sbomStats = built.stats;
    sbomWarnings = built.warnings;
  } else {
    sbomWarnings = [inventory.lockfile.error ?? 'No lockfile is present, so no bill of materials could be generated.'];
  }

  const manifest = buildEvidenceManifest({
    root, inventory, profileResult, sbom, sbomStats, now,
    redactionFindings: [],
  });

  const assessment = evaluate({
    inventory, profileResult, sbom, sbomStats, sbomWarnings, now,
    rulesetName: options.ruleset ?? DEFAULT_RULESET,
    toolVersion: TOOL_VERSION,
  });
  assessment.subject.componentCount = sbomStats.componentCount;
  assessment.sbomComponentCount = sbomStats.componentCount;

  const ruleset = loadRuleset(options.ruleset ?? DEFAULT_RULESET);
  ruleset.annexViiIndex = buildAnnexViiIndex(loadLoci().loci);

  const files = renderPack({
    assessment, manifest, sbom, inventory, profileResult, ruleset,
    sourceRegister: buildSourceRegister(),
  });

  return { inventory, profileResult, sbom, sbomStats, sbomWarnings, manifest, assessment, files };
}
