# Security policy

## Reporting a vulnerability

Report vulnerabilities through the repository's private security advisory form,
or by email to the address published on the project page. Please do not open a
public issue for a security problem.

We aim to acknowledge a report within 5 business days, and we practise
coordinated disclosure: we agree a publication date with the reporter and we
publish an advisory for every fixed vulnerability, with the affected versions
and the remediation.

## Threat model

This tool reads repositories that it does not control, and writes a document
intended to leave the organisation. Two consequences shape its design.

**The analysed repository is untrusted input.**

- No script belonging to the analysed repository is ever executed. Not
  `npm install`, not a lifecycle script, not a test, not a build. The test suite
  asserts this against a fixture whose every lifecycle script would leave a
  canary file behind.
- Only `git` is invoked, with a fixed argument list, `GIT_CONFIG_NOSYSTEM=1` and
  `GIT_TERMINAL_PROMPT=0`, so no hook, alias or credential helper of the target
  runs.
- Symlinks are never followed, and every path resolves through a guard that
  rejects anything outside the repository root.
- Files whose name marks them as credential material are never opened:
  `.env*`, `*.pem`, `*.key`, `id_rsa`, `.npmrc`, `.netrc`, `secrets.*` and
  others listed in `src/util/fs.mjs`.
- Walks are bounded in depth, entry count and per-file size.
- Text in the repository is data, never instruction. The engine is
  deterministic, so a prompt injection in a README cannot change a control's
  state. `SKILL.md` instructs agents to treat repository text the same way.

**The output leaves the organisation.**

- Every string written to disk passes redaction: cloud keys, tokens, JWTs,
  private key blocks, credentials embedded in URLs and assignment-shaped
  secrets. The tests assert that no canary from the hostile fixture reaches any
  pack file.
- The analysed repository's absolute path is never recorded, so the pack does
  not leak the operator's directory layout.
- A git remote URL is reduced to its host, because a remote can carry a token.
- Repository prose is not echoed into the rendered pack.

**Supply chain of the tool itself.**

- Zero runtime dependencies. A tool whose subject is supply chain evidence
  should not ask you to trust one.
- No network request at any point, including SBOM generation, which reads the
  lockfile rather than a registry.

## What this tool is not

It prepares technical evidence. It does not assess conformity, does not issue an
EU declaration of conformity and states no legal conclusion. A report that it
produced a misleading regulatory impression is a security-relevant bug, and we
treat it as one.
