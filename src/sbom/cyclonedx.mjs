import { toPurl } from '../inspect/lockfile.mjs';
import { uuidV5 } from './uuid.mjs';
import { toIso } from '../util/time.mjs';

export const SPEC_VERSION = '1.6';

/**
 * Resolve a dependency name the way Node does: walk up the node_modules chain
 * from the dependent, taking the first match. Reconstructing this is what turns
 * a flat component list into a real dependency graph.
 */
function resolveDependency(fromPath, name, byPath) {
  const segments = fromPath === '' ? [] : fromPath.split('/');
  for (let i = segments.length; i >= 0; i -= 1) {
    const prefix = segments.slice(0, i).join('/');
    const candidate = prefix ? `${prefix}/node_modules/${name}` : `node_modules/${name}`;
    if (byPath.has(candidate)) return candidate;
  }
  return null;
}

/**
 * Build a CycloneDX 1.6 bill of materials from the lockfile inventory.
 *
 * Default scope is what the product ships: development-only components are
 * excluded unless includeDev is set, because Annex I, Part II, point (1) is
 * about components contained in the product.
 *
 * @returns {{sbom: object, stats: object, warnings: string[]}}
 */
export function buildCycloneDx({ inventory, lockPackages, now, toolVersion, includeDev = false }) {
  const warnings = [];
  const all = inventory.lockfile.components;
  const components = includeDev ? all : all.filter((component) => !component.dev);
  const excludedDevCount = all.length - components.length;

  const rootName = inventory.package.name ?? inventory.repositoryName ?? 'unnamed-product';
  const rootVersion = inventory.package.version ?? '0.0.0';
  const rootPurl = toPurl(rootName, rootVersion);
  const rootRef = rootPurl ?? `${rootName}@${rootVersion}`;

  const cdxComponents = components.map((component) => {
    const entry = {
      type: 'library',
      'bom-ref': component.purl ?? `${component.name}@${component.version ?? 'unknown'}`,
      name: component.name,
      scope: component.optional || component.devOptional ? 'optional' : 'required',
    };
    if (component.version) entry.version = component.version;
    if (component.purl) entry.purl = component.purl;
    if (component.hash) entry.hashes = [component.hash];
    if (component.license) entry.licenses = [{ license: { id: component.license } }];
    if (component.resolved) {
      entry.externalReferences = [{ type: 'distribution', url: component.resolved }];
    }
    const properties = [];
    if (component.dev) properties.push({ name: 'cdx:npm:package:development', value: 'true' });
    if (component.topLevel) properties.push({ name: 'cra:dependency:direct', value: 'true' });
    if (!component.integrity) properties.push({ name: 'cra:integrity:missing', value: 'true' });
    if (properties.length > 0) entry.properties = properties;
    return entry;
  });

  // Dependency graph, reconstructed from the lockfile paths.
  const byPath = new Map();
  for (const [path, entry] of Object.entries(lockPackages ?? {})) {
    if (path === '' || !entry || entry.link === true) continue;
    byPath.set(path, entry);
  }
  const includedRefs = new Set(cdxComponents.map((c) => c['bom-ref']));
  const pathToRef = new Map();
  for (const component of components) pathToRef.set(component.path, component.purl ?? `${component.name}@${component.version ?? 'unknown'}`);

  const edgeFor = (path, entry) => {
    const declared = {
      ...(entry.dependencies ?? {}),
      ...(includeDev ? entry.devDependencies ?? {} : {}),
      ...(entry.optionalDependencies ?? {}),
    };
    const dependsOn = [];
    for (const name of Object.keys(declared).sort()) {
      const targetPath = resolveDependency(path, name, byPath);
      const ref = targetPath ? pathToRef.get(targetPath) : null;
      if (ref && includedRefs.has(ref)) dependsOn.push(ref);
    }
    return [...new Set(dependsOn)].sort();
  };

  const rootEntry = (lockPackages ?? {})[''] ?? {};
  const dependencies = [{ ref: rootRef, dependsOn: edgeFor('', rootEntry) }];
  for (const component of components) {
    const entry = byPath.get(component.path);
    const ref = pathToRef.get(component.path);
    if (!entry || !ref) continue;
    dependencies.push({ ref, dependsOn: edgeFor(component.path, entry) });
  }
  dependencies.sort((a, b) => a.ref.localeCompare(b.ref));

  const serialSeed = JSON.stringify({
    root: rootRef,
    fingerprint: inventory.stateFingerprint,
    components: cdxComponents.map((c) => c['bom-ref']).sort(),
    includeDev,
  });

  const sbom = {
    bomFormat: 'CycloneDX',
    specVersion: SPEC_VERSION,
    serialNumber: `urn:uuid:${uuidV5(serialSeed)}`,
    version: 1,
    metadata: {
      timestamp: toIso(now),
      tools: {
        components: [{ type: 'application', name: 'probative', version: toolVersion,
          externalReferences: [{ type: 'website', url: 'https://github.com/DeharengOlivier/probative' }] }],
      },
      component: {
        type: 'application',
        'bom-ref': rootRef,
        name: rootName,
        version: rootVersion,
        ...(rootPurl ? { purl: rootPurl } : {}),
        ...(inventory.package.license ? { licenses: [{ license: { id: inventory.package.license } }] } : {}),
      },
      properties: [
        { name: 'cra:sbom:source', value: 'package-lock.json' },
        { name: 'cra:sbom:lockfileVersion', value: String(inventory.lockfile.lockfileVersion ?? 'unknown') },
        { name: 'cra:sbom:includesDevelopmentDependencies', value: String(includeDev) },
        { name: 'cra:repository:commit', value: inventory.git.commit ?? 'unknown' },
        { name: 'cra:repository:worktreeClean', value: String(inventory.git.dirty === false) },
      ],
    },
    components: cdxComponents.sort((a, b) => a['bom-ref'].localeCompare(b['bom-ref'])),
    dependencies,
  };

  const withoutHash = cdxComponents.filter((c) => !c.hashes).length;
  if (withoutHash > 0) warnings.push(`${withoutHash} component(s) carry no integrity hash; their provenance cannot be verified from the lockfile alone`);
  if (inventory.git.dirty) warnings.push('the SBOM describes a working tree with uncommitted changes');

  return {
    sbom,
    stats: {
      componentCount: cdxComponents.length,
      excludedDevelopmentComponents: excludedDevCount,
      topLevelCovered: components.filter((c) => c.topLevel).length,
      topLevelDeclared: inventory.lockfile.topLevelNames.length,
      componentsWithoutHash: withoutHash,
      dependencyEdges: dependencies.length,
    },
    warnings,
  };
}
