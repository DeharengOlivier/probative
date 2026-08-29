import { test } from 'node:test';
import assert from 'node:assert/strict';
import { remoteHostOf } from '../../src/inspect/git.mjs';

/**
 * A git remote can carry a credential, so the pack keeps the host and drops
 * everything else. Two things have to be true of what is kept: it never
 * contains the credential, and it is a host. Recording 'file' or '..' as the
 * host of a repository is a small invention, and this tool's whole claim is
 * that it invents nothing.
 */

const TOKEN = 'ghp_CANARYcanaryCANARY0123456789abcdefgh';

test('an https remote keeps its host', () => {
  assert.equal(remoteHostOf('https://github.com/acme/thing.git'), 'github.com');
  assert.equal(remoteHostOf('https://github.com:443/acme/thing.git'), 'github.com');
});

test('a credential in the remote never survives', () => {
  for (const url of [
    `https://x-access-token:${TOKEN}@github.com/acme/thing.git`,
    `https://${TOKEN}@github.com/acme/thing.git`,
    `https://user:hunter2@git.example.com/acme/thing.git`,
  ]) {
    const host = remoteHostOf(url);
    assert.ok(host && !host.includes(TOKEN) && !host.includes('hunter2'), `credential survived in ${host}`);
  }
  assert.equal(remoteHostOf(`https://${TOKEN}@github.com/acme/thing.git`), 'github.com');
});

test('the scp-like syntax git uses by default keeps its host', () => {
  assert.equal(remoteHostOf('git@gitlab.example.com:team/thing.git'), 'gitlab.example.com');
  assert.equal(remoteHostOf('git@internalserver:team/thing.git'), 'internalserver');
  assert.equal(remoteHostOf('ssh://git@github.com:22/acme/thing.git'), 'github.com');
});

test('a remote that is a path on this machine has no host, and none is invented', () => {
  // It used to record 'file' and '..': the scheme and a relative segment read
  // as hosts because the pattern took whatever came first.
  assert.equal(remoteHostOf('file:///Users/someone/private/thing.git'), null);
  assert.equal(remoteHostOf('/srv/git/thing.git'), null);
  assert.equal(remoteHostOf('../sibling-repo'), null);
  assert.equal(remoteHostOf('./thing.git'), null);
  assert.equal(remoteHostOf('C:\\repos\\thing'), null);
});

test('a remote with two at-signs names the host git would really contact', () => {
  // Everything before the LAST at-sign is user information, so this remote
  // points at evil.example and github.com is part of the credential. The
  // pattern this replaced answered 'github.com@evil.example', which is not a
  // host and reads like the wrong one.
  assert.equal(remoteHostOf('https://token@github.com@evil.example/x.git'), 'evil.example');
});

test('a remote that is not a host at all yields nothing', () => {
  assert.equal(remoteHostOf(''), null);
  assert.equal(remoteHostOf('   '), null);
  assert.equal(remoteHostOf('not a url at all'), null);
});

test('an address literal is kept as the address it is', () => {
  assert.equal(remoteHostOf('https://192.0.2.10/acme/thing.git'), '192.0.2.10');
  assert.equal(remoteHostOf('ssh://git@[2001:db8::1]:22/acme/thing.git'), '[2001:db8::1]');
});
