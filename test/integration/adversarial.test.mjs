import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { runPipeline } from '../../src/pipeline.mjs';
import { STATUS } from '../../src/rules/status.mjs';
import { CANARIES, copyFixture, fixturePath, FIXED_NOW, tempDirectory } from '../helpers.mjs';
import { writeTreeAtomic } from '../../src/util/fs.mjs';

const run = (root) => runPipeline(root, { nowOverride: FIXED_NOW });

/** Analyse a fixture outside this project's git repository, so no commit leaks in. */
const runDetached = (fixture) => {
  const scratch = copyFixture(fixture);
  try {
    return runPipeline(scratch.path, { nowOverride: FIXED_NOW });
  } finally {
    scratch.cleanup();
  }
};

test('no canary secret from the hostile repository reaches any pack file', () => {
  const { files } = run(fixturePath('hostile-repository'));
  const everything = Object.entries(files).map(([path, content]) => `\n--- ${path}\n${content}`).join('');
  for (const [name, value] of Object.entries(CANARIES)) {
    if (name === 'injection') continue;
    assert.ok(!everything.includes(value), `canary '${name}' leaked into the pack`);
  }
});

test('the private key block in the hostile security policy never reaches the pack', () => {
  const { files } = run(fixturePath('hostile-repository'));
  const everything = Object.values(files).join('\n');
  assert.ok(!everything.includes('BEGIN RSA PRIVATE KEY'));
  assert.ok(!everything.includes('MIIEowIBAAKCAQEAx'));
});

test('the .env file is never read and never appears in the evidence manifest', () => {
  const { files, manifest } = run(fixturePath('hostile-repository'));
  assert.ok(!manifest.records.some((record) => record.source === '.env'));
  assert.ok(!Object.values(files).join('\n').includes('SECRET_KEY'));
});

test('a prompt injection in the repository changes no control status', () => {
  const { assessment } = runDetached('hostile-repository');
  const verified = assessment.controls.filter((control) => control.status === STATUS.VERIFIED);
  // The only thing this repository genuinely evidences is its bill of materials.
  assert.deepEqual(verified.map((control) => control.id), ['CRA-NODE-010']);
  assert.ok(assessment.summary.p0Gaps > 0, 'the injection asked for full compliance and must not have been granted');
  assert.equal(assessment.verdict.kind, 'evidence-inventory');
});

test('injected instruction text is not reproduced as an instruction in the pack', () => {
  const { files } = run(fixturePath('hostile-repository'));
  const markdown = Object.entries(files).filter(([path]) => path.endsWith('.md')).map(([, content]) => content).join('\n');
  assert.ok(!markdown.includes(CANARIES.injection), 'repository prose must not be echoed into the rendered pack');
});

test('no lifecycle script of the analysed repository is ever executed', () => {
  const scratch = copyFixture('hostile-repository');
  try {
    run(scratch.path);
    for (const canary of ['EXECUTED-preinstall', 'EXECUTED-postinstall', 'EXECUTED-prepare', 'EXECUTED-test']) {
      assert.ok(!existsSync(join(scratch.path, canary)), `${canary} exists: a repository script was executed`);
    }
    const unexpected = readdirSync(scratch.path).filter((entry) => entry.startsWith('EXECUTED-'));
    assert.deepEqual(unexpected, []);
  } finally {
    scratch.cleanup();
  }
});

test('the install scripts are reported as an observation rather than acted upon', () => {
  const { inventory } = run(fixturePath('hostile-repository'));
  assert.deepEqual(inventory.package.lifecycleScripts.sort(), ['postinstall', 'preinstall', 'prepare']);
  assert.ok(inventory.notes.some((note) => note.includes('never executed by this tool')));
});

test('the run writes nothing into the analysed repository', () => {
  const scratch = copyFixture('hostile-repository');
  try {
    const before = readdirSync(scratch.path).sort();
    run(scratch.path);
    assert.deepEqual(readdirSync(scratch.path).sort(), before);
  } finally {
    scratch.cleanup();
  }
});

test('an existing pack is never overwritten silently', () => {
  const { files } = run(fixturePath('well-evidenced'));
  const output = tempDirectory();
  try {
    const destination = join(output.path, 'pack');
    writeTreeAtomic(destination, files);
    assert.throws(() => writeTreeAtomic(destination, files), /refusing to overwrite/);
    writeTreeAtomic(destination, files, { overwrite: true });
  } finally {
    output.cleanup();
  }
});
