import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { inspectDocs } from '../../src/inspect/docs.mjs';
import { isEvidencePath, NON_EVIDENCE_DIRECTORIES } from '../../src/util/fs.mjs';

/** Builds a throwaway repository from a path -> content map. */
function repoWith(files) {
  const root = mkdtempSync(join(tmpdir(), 'probative-docs-'));
  for (const [path, content] of Object.entries(files)) {
    mkdirSync(dirname(join(root, path)), { recursive: true });
    writeFileSync(join(root, path), content);
  }
  return root;
}

function withRepo(files, assertions) {
  const root = repoWith(files);
  try {
    assertions(inspectDocs(root), root);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

// --- The reported defect -----------------------------------------------------

test('source files under a directory named sbom are not counted as SBOMs', () => {
  withRepo({
    'package.json': '{"name":"x"}',
    'src/sbom/cyclonedx.mjs': 'export function generate() {}',
    'src/sbom/uuid.mjs': 'export function uuidv5() {}',
  }, (docs) => {
    assert.deepEqual(docs.existingSbom.paths, [], 'a .mjs source file is not an SBOM');
    assert.equal(docs.existingSbom.count, 0);
  });
});

test('a real SBOM inside a dedicated sbom directory is still detected', () => {
  withRepo({
    'package.json': '{"name":"x"}',
    'sbom/app.cdx.json': '{"bomFormat":"CycloneDX"}',
    'sbom/archive/2026-01.json': '{"bomFormat":"CycloneDX"}',
    'sbom/README.md': 'how we publish SBOMs',
  }, (docs) => {
    assert.deepEqual(docs.existingSbom.paths, ['sbom/app.cdx.json', 'sbom/archive/2026-01.json']);
  });
});

test('SBOMs are detected by conventional file name at any depth', () => {
  withRepo({
    'package.json': '{"name":"x"}',
    'bom.json': '{}',
    'sbom.cdx.json': '{}',
    'artifacts/bom-1.2.xml': '<bom/>',
    'artifacts/report.spdx.json': '{}',
  }, (docs) => {
    assert.deepEqual(docs.existingSbom.paths.sort(),
      ['artifacts/bom-1.2.xml', 'artifacts/report.spdx.json', 'bom.json', 'sbom.cdx.json']);
  });
});

// --- Evidence relevance: test material is not evidence about the product -----

test('an SBOM belonging to a test fixture is excluded and reported as excluded', () => {
  withRepo({
    'package.json': '{"name":"x"}',
    'bom.json': '{}',
    'test/fixtures/well-evidenced/bom.json': '{}',
  }, (docs) => {
    assert.deepEqual(docs.existingSbom.paths, ['bom.json']);
    assert.deepEqual(docs.existingSbom.excludedNonEvidencePaths, ['test/fixtures/well-evidenced/bom.json'],
      'an excluded candidate must be reported, never silently dropped');
  });
});

test('security documents inside fixtures, examples and vendored code are not product evidence', () => {
  withRepo({
    'package.json': '{"name":"x"}',
    'SECURITY.md': 'report to security@example.org',
    'docs/hardening.md': 'harden it like so',
    'test/fixtures/hostile-repository/SECURITY.md': 'canary',
    'test/fixtures/well-evidenced/docs/hardening.md': 'canary',
    'examples/secure-deployment.md': 'sample',
    'vendor/acme/SECURITY.md': 'someone else policy',
    '__tests__/threat-model.md': 'canary',
    'third_party/lib/security.md': 'canary',
    'demo/deployment.md': 'canary',
  }, (docs) => {
    assert.deepEqual(docs.secureConfigurationDocs.matchedFiles.sort(), ['SECURITY.md', 'docs/hardening.md']);
    assert.equal(docs.secureConfigurationDocs.excludedNonEvidencePaths.length, 7);
  });
});

test('VEX documents obey the same relevance rule', () => {
  withRepo({
    'package.json': '{"name":"x"}',
    'vex.json': '{}',
    'test/fixtures/a/vex.json': '{}',
  }, (docs) => {
    assert.deepEqual(docs.existingVex.paths, ['vex.json']);
    assert.deepEqual(docs.existingVex.excludedNonEvidencePaths, ['test/fixtures/a/vex.json']);
  });
});

test('an empty repository yields no matches and no excluded paths', () => {
  withRepo({ 'package.json': '{"name":"x"}' }, (docs) => {
    assert.deepEqual(docs.existingSbom.paths, []);
    assert.deepEqual(docs.existingSbom.excludedNonEvidencePaths, []);
    assert.deepEqual(docs.secureConfigurationDocs.matchedFiles, []);
    assert.deepEqual(docs.secureConfigurationDocs.excludedNonEvidencePaths, []);
  });
});

// --- isEvidencePath boundaries ----------------------------------------------

test('isEvidencePath matches whole path segments, never substrings', () => {
  // These contain an excluded word but are not excluded directories.
  for (const path of ['src/latest/index.mjs', 'src/contest/rules.md', 'protest.md', 'src/examples.mjs', 'testing-library-notes.md', 'src/demoted/x.md']) {
    assert.equal(isEvidencePath(path), true, `${path} must remain evidence`);
  }
  for (const path of ['test/a.md', 'tests/a.md', 'src/__tests__/a.md', 'a/fixtures/b.md', 'examples/a.md', 'vendor/a.md', 'third_party/a.md', 'demo/a.md', 'testdata/a.md']) {
    assert.equal(isEvidencePath(path), false, `${path} must be excluded`);
  }
});

test('a file named like an excluded directory is still evidence', () => {
  assert.equal(isEvidencePath('test.md'), true, 'a FILE named test is not a test directory');
  assert.equal(isEvidencePath('docs/examples.md'), true);
});

test('isEvidencePath tolerates degenerate input', () => {
  assert.equal(isEvidencePath(''), true);
  assert.equal(isEvidencePath('./test/a.md'), false, 'a leading ./ must not defeat the filter');
  assert.equal(isEvidencePath('a/b/c/d/e/f/test/g.md'), false, 'depth must not defeat the filter');
});

test('the non-evidence list is documented and disjoint from the safety walk list', async () => {
  assert.ok(NON_EVIDENCE_DIRECTORIES.length > 0);
  assert.ok(NON_EVIDENCE_DIRECTORIES.every((d) => d === d.toLowerCase()), 'entries are compared lowercased');
});

// --- The filter must be visible to the reader of the pack --------------------

test('the secure usage check reports the candidates the relevance filter dropped', async () => {
  const { CHECKS } = await import('../../src/rules/checks.mjs');
  const context = {
    inventory: {
      docs: {
        readme: { mentionsInstallation: false, mentionsConfiguration: false },
        secureConfigurationDocs: { signals: [], matchedFiles: [], excludedNonEvidencePaths: ['examples/hardening.md'] },
      },
    },
    profile: null,
  };
  const outcome = CHECKS.secureUsageInstructions(context);
  assert.equal(outcome.status, 'missing');
  const shown = outcome.findings.map((f) => `${f.label}: ${f.value}`).join('\n');
  assert.match(shown, /candidates ignored as test or example material: examples\/hardening\.md/,
    'a silent filter in a compliance tool is a trap');
});

test('the secure usage check tolerates an inventory without the excluded list', async () => {
  const { CHECKS } = await import('../../src/rules/checks.mjs');
  const outcome = CHECKS.secureUsageInstructions({
    inventory: { docs: { readme: {}, secureConfigurationDocs: { signals: [], matchedFiles: [] } } },
    profile: null,
  });
  assert.equal(outcome.status, 'missing');
});
