import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cpSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { runPipeline } from '../../src/pipeline.mjs';
import { inspectRepository } from '../../src/inspect/index.mjs';
import { fixturePath, FIXED_NOW, projectRoot } from '../helpers.mjs';

/**
 * SECURITY.md makes three promises about what a pack can and cannot carry.
 * Each of them was prose until this file existed. A promise nothing checks is
 * a promise that quietly stops being true.
 */

const MARKER = 'CANARYOPERATORPATH';

function scratchWithMarkedPath(fixture) {
  const directory = mkdtempSync(join(tmpdir(), `${MARKER}-`));
  cpSync(fixturePath(fixture), directory, { recursive: true });
  return { path: directory, cleanup: () => rmSync(directory, { recursive: true, force: true }) };
}

test('no pack file records where the repository lives on the operator machine', () => {
  const scratch = scratchWithMarkedPath('well-evidenced');
  try {
    const { files } = runPipeline(scratch.path, { nowOverride: FIXED_NOW });
    for (const [path, content] of Object.entries(files)) {
      assert.ok(!content.includes(scratch.path), `${path} records the absolute path`);
      assert.ok(!content.includes(MARKER), `${path} records a fragment of the absolute path`);
    }
  } finally {
    scratch.cleanup();
  }
});

test('nor does the inventory, which is the machine-readable half of it', () => {
  const scratch = scratchWithMarkedPath('well-evidenced');
  try {
    const inventory = JSON.stringify(inspectRepository(scratch.path, { nowOverride: FIXED_NOW }));
    assert.ok(!inventory.includes(MARKER), 'the inventory records the absolute path');
  } finally {
    scratch.cleanup();
  }
});

test('an unreadable file is reported without naming where it lives', () => {
  // The note has to say what could not be read. Saying it with an absolute
  // path would put the operator's directory layout in the pack by the back
  // door, through an error message rather than through a field.
  const scratch = scratchWithMarkedPath('well-evidenced');
  try {
    const { files } = runPipeline(scratch.path, { nowOverride: FIXED_NOW, filename: 'absent.profile.json' });
    for (const [path, content] of Object.entries(files)) {
      assert.ok(!content.includes(MARKER), `${path} names the absolute path in a note`);
    }
  } finally {
    scratch.cleanup();
  }
});

test('a remote carrying a token is reduced to its host in the pack itself', () => {
  const token = 'ghp_CANARYcanaryCANARY0123456789abcdefgh';
  const scratch = scratchWithMarkedPath('well-evidenced');
  try {
    const git = (args) => execFileSync('git', ['-C', scratch.path, ...args], {
      stdio: ['ignore', 'pipe', 'ignore'],
      env: {
        ...process.env,
        GIT_AUTHOR_NAME: 'Test', GIT_AUTHOR_EMAIL: 'test@example.invalid',
        GIT_COMMITTER_NAME: 'Test', GIT_COMMITTER_EMAIL: 'test@example.invalid',
        GIT_CONFIG_NOSYSTEM: '1',
      },
    });
    git(['init', '--quiet', '--initial-branch=main']);
    git(['add', '-A']);
    git(['-c', 'commit.gpgsign=false', 'commit', '--quiet', '-m', 'fixture']);
    git(['config', 'remote.origin.url', `https://x-access-token:${token}@github.com/acme/thing.git`]);

    const { files } = runPipeline(scratch.path, { nowOverride: FIXED_NOW });
    const everything = Object.values(files).join('\n');
    assert.ok(!everything.includes(token), 'the token reached the pack');
    assert.ok(!everything.includes('x-access-token'), 'the user information reached the pack');
    assert.match(everything, /github\.com/);
  } finally {
    scratch.cleanup();
  }
});

test('nothing that ships can open a network connection', () => {
  // The claim is architectural, so the check is too: a module that cannot
  // reach a network API cannot make a request, whatever it is asked to do.
  const forbidden = [
    /from '(?:node:)?(?:http|https|net|tls|dgram|dns)(?:\/promises)?'/,
    /require\(['"](?:node:)?(?:http|https|net|tls|dgram|dns)['"]\)/,
    /\bfetch\s*\(/,
    /\bXMLHttpRequest\b/,
    /\bWebSocket\b/,
    /\bundici\b/,
  ];
  const shipped = JSON.parse(readFileSync(join(projectRoot, 'package.json'), 'utf8')).files;
  const offenders = [];
  const visit = (absolute, relative) => {
    if (statSync(absolute).isDirectory()) {
      for (const entry of readdirSync(absolute)) visit(join(absolute, entry), `${relative}/${entry}`);
      return;
    }
    if (!/\.(?:mjs|js|cjs)$/.test(absolute)) return;
    const text = readFileSync(absolute, 'utf8');
    for (const pattern of forbidden) if (pattern.test(text)) offenders.push(`${relative}: ${pattern}`);
  };
  for (const entry of shipped) visit(join(projectRoot, entry), entry);
  assert.deepEqual(offenders, []);
});

test('the one script that does reach the network is not shipped', () => {
  // check-upstream.mjs asks the Official Journal whether the Regulation moved.
  // It runs in CI, never inside a user's repository, and it is not published.
  const manifest = JSON.parse(readFileSync(join(projectRoot, 'package.json'), 'utf8'));
  assert.ok(!manifest.files.includes('scripts'));
  assert.match(readFileSync(join(projectRoot, 'scripts/check-upstream.mjs'), 'utf8'), /\bfetch\s*\(/);
});
