import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { buildCycloneDx } from '../../src/sbom/cyclonedx.mjs';
import { inspectRepository } from '../../src/inspect/index.mjs';
import { uuidV5 } from '../../src/sbom/uuid.mjs';
import { fixturePath, FIXED_NOW } from '../helpers.mjs';

function build(fixture, options = {}) {
  const root = fixturePath(fixture);
  const inventory = inspectRepository(root, { nowOverride: FIXED_NOW });
  const lockPackages = JSON.parse(readFileSync(join(root, 'package-lock.json'), 'utf8')).packages;
  return buildCycloneDx({
    inventory, lockPackages, now: new Date(FIXED_NOW), toolVersion: '0.1.0', ...options,
  });
}

test('produces a valid CycloneDX 1.6 envelope', () => {
  const { sbom } = build('well-evidenced');
  assert.equal(sbom.bomFormat, 'CycloneDX');
  assert.equal(sbom.specVersion, '1.6');
  assert.match(sbom.serialNumber, /^urn:uuid:[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
  assert.equal(sbom.metadata.component.name, 'vaultkeeper');
  assert.equal(sbom.metadata.component.purl, 'pkg:npm/vaultkeeper@4.2.0');
});

test('ships production components and excludes development ones by default', () => {
  const { sbom, stats } = build('well-evidenced');
  const names = sbom.components.map((component) => component.name);
  assert.deepEqual(names, ['minimist']);
  assert.equal(stats.excludedDevelopmentComponents, 1);
});

test('includes development components on request', () => {
  const { sbom, stats } = build('well-evidenced', { includeDev: true });
  assert.deepEqual(sbom.components.map((component) => component.name).sort(), ['c8', 'minimist']);
  assert.equal(stats.excludedDevelopmentComponents, 0);
  const dev = sbom.components.find((component) => component.name === 'c8');
  assert.ok(dev.properties.some((property) => property.name === 'cdx:npm:package:development'));
});

test('carries the integrity hash from the lockfile', () => {
  const { sbom } = build('well-evidenced');
  const [component] = sbom.components;
  assert.equal(component.hashes[0].alg, 'SHA-512');
  assert.match(component.hashes[0].content, /^[0-9a-f]+$/);
});

test('marks components that have no integrity hash', () => {
  const { sbom, stats } = build('hostile-repository');
  assert.equal(stats.componentsWithoutHash, 1);
  const [component] = sbom.components;
  assert.ok(component.properties.some((property) => property.name === 'cra:integrity:missing'));
});

test('reconstructs the dependency graph from lockfile paths', () => {
  const { sbom } = build('partially-prepared', { includeDev: true });
  const root = sbom.dependencies.find((entry) => entry.ref === 'pkg:npm/ledger-sync@2.1.0');
  assert.deepEqual(root.dependsOn.sort(), ['pkg:npm/c8@9.1.0', 'pkg:npm/left-pad@1.3.0']);
  const c8 = sbom.dependencies.find((entry) => entry.ref === 'pkg:npm/c8@9.1.0');
  assert.deepEqual(c8.dependsOn, ['pkg:npm/test-exclude@6.0.0']);
});

test('two builds of the same tree are byte identical', () => {
  const first = JSON.stringify(build('well-evidenced').sbom);
  const second = JSON.stringify(build('well-evidenced').sbom);
  assert.equal(first, second);
});

test('the serial number is a version 5 UUID derived from the content', () => {
  assert.equal(uuidV5('a'), uuidV5('a'));
  assert.notEqual(uuidV5('a'), uuidV5('b'));
  const withDev = build('well-evidenced', { includeDev: true }).sbom.serialNumber;
  const withoutDev = build('well-evidenced').sbom.serialNumber;
  assert.notEqual(withDev, withoutDev);
});
