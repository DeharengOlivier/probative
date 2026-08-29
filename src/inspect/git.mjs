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
  let remoteHost = null;
  if (remoteUrl) {
    const match = /^(?:[a-z]+:\/\/)?(?:[^@/]+@)?([^/:]+)/i.exec(redact(remoteUrl).text);
    remoteHost = match ? match[1] : null;
  }

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
