import { execFileSync } from 'node:child_process';
import { realpathSync } from 'node:fs';
import { sameDirectory } from '../util/fs.mjs';
import { basename } from 'node:path';
import { redact } from '../util/redact.mjs';

/**
 * Only this fixed set of read-only git invocations is ever made. The tool never
 * runs a command that the inspected repository can influence, which is why no
 * hook, alias or script from the target can execute here.
 */
const GIT_TIMEOUT_MS = 10000;

function git(root, args) {
  try {
    const stdout = execFileSync('git', ['-C', root, '--no-pager', ...args], {
      encoding: 'utf8',
      timeout: GIT_TIMEOUT_MS,
      stdio: ['ignore', 'pipe', 'ignore'],
      env: { ...process.env, GIT_CONFIG_NOSYSTEM: '1', GIT_TERMINAL_PROMPT: '0' },
    });
    return stdout.trim();
  } catch {
    return null;
  }
}

/** A name that is actually a host: labels of letters, digits and hyphens. */
const HOSTNAME = /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]*[a-z0-9])?)*$/i;
/** An IPv6 literal as a URL carries it, brackets included. */
const IPV6_LITERAL = /^\[[0-9a-f:.]+\]$/i;

const looksLikeAHost = (candidate) => HOSTNAME.test(candidate) || IPV6_LITERAL.test(candidate);

/**
 * The host a git remote points at, or null when it points at no host.
 *
 * A remote can carry a credential, so everything but the host is dropped. What
 * is kept then has to be a host: a remote that is a path on this machine
 * (file:///..., /srv/git/x, ../sibling) has none, and recording the scheme or a
 * relative segment as one would be an invention in a document whose value is
 * that it invents nothing. The URL parser answers the first form; the scp-like
 * form git writes by default (git@host:path) is not a URL and is read here.
 *
 * @param {string} remoteUrl
 * @returns {string|null} Complexity: O(length of the URL).
 */
export function remoteHostOf(remoteUrl) {
  const text = redact(String(remoteUrl ?? '')).text.trim();
  if (text === '') return null;

  if (/^[a-z][a-z0-9+.-]*:\/\//i.test(text)) {
    let hostname;
    try {
      ({ hostname } = new URL(text));
    } catch {
      return null;
    }
    return looksLikeAHost(hostname) ? hostname : null;
  }

  // [user@]host:path, with no scheme. A single leading letter is a Windows
  // drive, not a host, so two characters is the floor.
  const scp = /^(?:[^@/\\]+@)?([^@/\\:]{2,}):/.exec(text);
  return scp && looksLikeAHost(scp[1]) ? scp[1] : null;
}
/**
 * @returns {{available: boolean, commit: string|null, shortCommit: string|null,
 *   branch: string|null, dirty: boolean|null, tagsAtHead: string[],
 *   describedVersion: string|null, committedAt: string|null,
 *   remoteHost: string|null, trackedFileCount: number|null, notes: string[]}}
 */
export function inspectGit(root) {
  const notes = [];
  const inside = git(root, ['rev-parse', '--is-inside-work-tree']);
  if (inside !== 'true') {
    notes.push('not a git repository, or git is unavailable; commit-bound evidence cannot be produced');
    return {
      available: false, commit: null, shortCommit: null, branch: null, dirty: null,
      tagsAtHead: [], describedVersion: null, committedAt: null, remoteHost: null,
      trackedFileCount: null, analysedPathIsRepositoryRoot: null, notes,
    };
  }

  // git walks up until it finds a repository. Analysing a subdirectory of a
  // monorepo is legitimate and the enclosing commit is the right one, but the
  // pack has to say so: a commit that belongs to a larger repository describes
  // more than the analysed path.
  const repositoryRoot = git(root, ['rev-parse', '--show-toplevel']);
  const analysedPathIsRepositoryRoot = repositoryRoot === null
    ? null
    : sameDirectory(repositoryRoot, root);
  if (analysedPathIsRepositoryRoot === false) {
    notes.push(`the analysed path is a subdirectory of the git repository rooted at ${basename(repositoryRoot)}; the commit and working tree state describe that whole repository, not this directory alone`);
  }

  const commit = git(root, ['rev-parse', 'HEAD']);
  const status = git(root, ['status', '--porcelain', '--untracked-files=normal']);
  const dirty = status === null ? null : status.length > 0;
  if (dirty) notes.push('working tree has uncommitted changes; evidence does not describe a clean commit');

  const tagsRaw = git(root, ['tag', '--points-at', 'HEAD']);
  const tagsAtHead = tagsRaw ? tagsRaw.split('\n').map((t) => t.trim()).filter(Boolean).sort() : [];

  // A remote URL can carry a token. Keep only the host, which is all the pack needs.
  const remoteUrl = git(root, ['config', '--get', 'remote.origin.url']);
  const remoteHost = remoteUrl ? remoteHostOf(remoteUrl) : null;

  const trackedRaw = git(root, ['ls-files']);
  const trackedFileCount = trackedRaw === null ? null : (trackedRaw ? trackedRaw.split('\n').length : 0);

  return {
    available: true,
    analysedPathIsRepositoryRoot,
    commit,
    shortCommit: commit ? commit.slice(0, 12) : null,
    branch: git(root, ['rev-parse', '--abbrev-ref', 'HEAD']),
    dirty,
    tagsAtHead,
    describedVersion: git(root, ['describe', '--tags', '--always', '--dirty']),
    committedAt: git(root, ['log', '-1', '--format=%cI']),
    remoteHost,
    trackedFileCount,
    notes,
  };
}
