import { readRepoFile, repoFileExists } from '../util/fs.mjs';

/** Scripts whose presence is evidence of a build, test or release capability. */
const SCRIPT_SIGNALS = Object.freeze({
  test: [/^test/, /^jest/, /^vitest/, /^mocha/],
  build: [/^build/, /^compile/, /^bundle/, /^prepack$/, /^prepublishOnly$/],
  lint: [/^lint/, /^eslint/],
  audit: [/audit/, /^security/],
  release: [/^release/, /^publish/, /^version/],
});

/** Lifecycle scripts npm runs automatically; they are the install-time risk. */
export const LIFECYCLE_SCRIPTS = Object.freeze([
  'preinstall', 'install', 'postinstall', 'prepare', 'prepublish', 'preprepare', 'postprepare',
]);

function classifyScripts(scripts) {
  const classified = {};
  for (const [category, patterns] of Object.entries(SCRIPT_SIGNALS)) {
    classified[category] = Object.keys(scripts).filter((name) => patterns.some((p) => p.test(name))).sort();
  }
  return classified;
}

/**
 * @returns {{present: boolean, error: string|null, name: string|null, version: string|null,
 *   private: boolean, license: string|null, repositoryUrl: string|null, bugsUrl: string|null,
 *   homepage: string|null, engines: object, scripts: object, scriptCategories: object,
 *   lifecycleScripts: string[], dependencies: object, devDependencies: object,
 *   optionalDependencies: object, peerDependencies: object, workspaces: string[],
 *   hasPublishConfig: boolean, filesField: string[]|null, notes: string[]}}
 */
export function inspectPackage(root) {
  const notes = [];
  const raw = readRepoFile(root, 'package.json');
  if (raw === null) {
    return emptyPackage('package.json not found or not readable at the repository root', notes);
  }
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch (error) {
    return emptyPackage(`package.json is not valid JSON: ${error.message}`, notes);
  }
  if (!parsed || typeof parsed !== 'object') {
    return emptyPackage('package.json does not contain a JSON object', notes);
  }

  const scripts = isPlainObject(parsed.scripts) ? parsed.scripts : {};
  const lifecycleScripts = LIFECYCLE_SCRIPTS.filter((name) => typeof scripts[name] === 'string');
  if (lifecycleScripts.length > 0) {
    notes.push(`package.json declares install lifecycle scripts (${lifecycleScripts.join(', ')}); they are never executed by this tool`);
  }

  let workspaces = [];
  if (Array.isArray(parsed.workspaces)) workspaces = parsed.workspaces.filter((w) => typeof w === 'string');
  else if (isPlainObject(parsed.workspaces) && Array.isArray(parsed.workspaces.packages)) {
    workspaces = parsed.workspaces.packages.filter((w) => typeof w === 'string');
  }
  if (workspaces.length > 0) {
    notes.push('npm workspaces detected; the evidence pack describes the workspace root unless a package path is given');
  }

  return {
    present: true,
    error: null,
    name: typeof parsed.name === 'string' ? parsed.name : null,
    version: typeof parsed.version === 'string' ? parsed.version : null,
    private: parsed.private === true,
    license: typeof parsed.license === 'string' ? parsed.license : null,
    repositoryUrl: extractUrl(parsed.repository),
    bugsUrl: extractUrl(parsed.bugs),
    homepage: typeof parsed.homepage === 'string' ? parsed.homepage : null,
    engines: isPlainObject(parsed.engines) ? parsed.engines : {},
    scripts,
    scriptCategories: classifyScripts(scripts),
    lifecycleScripts,
    dependencies: isPlainObject(parsed.dependencies) ? parsed.dependencies : {},
    devDependencies: isPlainObject(parsed.devDependencies) ? parsed.devDependencies : {},
    optionalDependencies: isPlainObject(parsed.optionalDependencies) ? parsed.optionalDependencies : {},
    peerDependencies: isPlainObject(parsed.peerDependencies) ? parsed.peerDependencies : {},
    workspaces,
    hasPublishConfig: isPlainObject(parsed.publishConfig),
    filesField: Array.isArray(parsed.files) ? parsed.files : null,
    hasLockfile: repoFileExists(root, 'package-lock.json'),
    notes,
  };
}

function emptyPackage(error, notes) {
  return {
    present: false, error, name: null, version: null, private: false, license: null,
    repositoryUrl: null, bugsUrl: null, homepage: null, engines: {}, scripts: {},
    scriptCategories: {}, lifecycleScripts: [], dependencies: {}, devDependencies: {},
    optionalDependencies: {}, peerDependencies: {}, workspaces: [], hasPublishConfig: false,
    filesField: null, hasLockfile: false, notes,
  };
}

function isPlainObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function extractUrl(field) {
  if (typeof field === 'string') return field;
  if (isPlainObject(field) && typeof field.url === 'string') return field.url;
  if (isPlainObject(field) && typeof field.email === 'string') return `mailto:${field.email}`;
  return null;
}
