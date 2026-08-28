# Changelog

All notable changes to this project are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project
follows semantic versioning.

Ruleset versions are tracked separately from the tool version. A pack always
names the ruleset it was produced with.

## [Unreleased]

## [0.1.0] - 2026-08-28

First release. Node.js products with an npm lockfile.

### Added

- `run`, `inspect`, `sbom`, `verify`, `profile init`, `cite` and `rules`
  commands, with `--json`, `--now`, `--force`, `--include-dev` and
  `--fail-on-p0`.
- Ruleset `cra-node-mvp` 1.0.0: 24 controls across 9 families, covering all 8
  points of Annex I, Part II and all 8 points of Annex VII.
- CycloneDX 1.6 bill of materials generated from `package-lock.json` offline,
  with integrity hashes and a reconstructed dependency graph.
- Evidence pack organised along Annex VII, with the verbatim text of every
  provision cited.
- Product profile schema with 40 declaration fields, each citing the provision
  that makes it relevant.
- Offline index of 282 provisions of Regulation (EU) 2024/2847, with the
  Official Journal text and its SHA-256 shipped in `reference/`.
- Pack integrity and freshness verification, bound to the commit and to a
  content digest of every evidence-bearing document.
- Redaction of secrets on every string written to disk.
- 106 tests, including an adversarial fixture asserting that no repository
  script is executed and that no canary secret reaches the pack.
- `SKILL.md`, a portable agent skill with no dependency on a proprietary agent
  API.

### Security

- Zero runtime dependencies.
- No project script is ever executed, and no network request is ever made.
- Symlinks are not followed; credential-shaped files are never opened.

[Unreleased]: https://github.com/DeharengOlivier/cra-evidence/compare/v0.1.0...HEAD
[0.1.0]: https://github.com/DeharengOlivier/cra-evidence/releases/tag/v0.1.0
