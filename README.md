# probative

Turn a Node.js repository into a reproducible, source-linked **Cyber Resilience
Act technical evidence pack**.

*In law, evidence is probative when it tends to prove a fact. It is never the
verdict.* That is what this tool produces, and where it stops.

> **This tool prepares technical evidence. It does not assess conformity, does
> not issue an EU declaration of conformity, does not affix a CE marking, and
> states no legal conclusion about compliance with Regulation (EU) 2024/2847.**
> It is not legal advice. The determinations that matter most, whether the
> Regulation applies and in which role, stay with a competent reviewer.

```sh
npx probative run . --out cra-evidence/
```

```
Evidence pack written to ./probative

  Product        vaultkeeper 4.2.0
  Commit         a1b2c3d4e5f6...
  Ruleset        cra-node-mvp 1.0.0
  Controls       24
  Open gaps      4 (0 at P0)
  Expert review  6

Close these first:
  [P1] CRA-NODE-023  Updates are distributed through a secure mechanism
         Publish with npm provenance or sign release artefacts, and describe
         the distribution mechanism in the product profile.
```

## Why this exists

The Regulation applies in full from **11 December 2027**, and its reporting
duties under Article 14 from **11 September 2026**. Article 31 and Annex VII
require technical documentation that a small vendor mostly already has, scattered
across a lockfile, a security policy, a changelog and a CI configuration.

The work is not producing the evidence. It is finding it, showing where each
piece comes from, noticing when it goes stale, and being honest about the parts
a repository simply cannot establish.

## What it does

- **Generates a CycloneDX 1.6 SBOM** from `package-lock.json`, offline, with the
  integrity hashes npm recorded and the dependency graph reconstructed. Annex I,
  Part II, point (1) sets the floor at top-level dependencies; the tool measures
  coverage against exactly that floor rather than against an invented one.
- **Evaluates 24 controls**, each anchored to a numbered provision of the
  Regulation, and prints the verbatim official text next to every finding.
- **Separates observation from declaration.** Nothing a manufacturer states can
  ever reach the state `verified`.
- **Binds evidence to a commit and a content digest**, so a pack that no longer
  describes the repository is reported as stale rather than trusted.
- **Redacts secrets** before anything is written, and refuses to read
  credential-shaped files at all.
- **Runs no project script and makes no network request.** Ever.

## Install

Node 20.11 or later. **No runtime dependencies.**

```sh
npx probative --help          # no install
npm install --save-dev probative
```

The absence of a dependency tree is deliberate: a tool whose subject is supply
chain evidence should not ask you to trust one.

## Commands

| Command | What it does |
|---|---|
| `inspect [path]` | Read-only inventory. Writes nothing. |
| `profile init [path]` | Create the declarations file, with each field citing its provision. |
| `run [path] --out <dir>` | Produce the full evidence pack. |
| `verify <pack> [--against <repo>]` | Recompute every digest, then check the pack still describes the repository. |
| `sbom [path]` | The CycloneDX document alone. |
| `cite <locus>` | Print the verbatim text of a provision, offline. |
| `rules` | List the controls and what each one cites. |

Options: `--json`, `--force`, `--include-dev`, `--now <iso>`, `--fail-on-p0`,
`--ruleset <name>`, `--profile <file>`.

Exit codes: `0` ok, `1` usage, `2` runtime, `3` verification failed, `4` a P0
gap is open (with `--fail-on-p0`).

## The two inputs

**The repository** supplies everything observable: the lockfile, `SECURITY.md`,
the changelog, workflows, `security.txt`, dependency update configuration.

**`probative.profile.json`** supplies what no repository can show: the
commercial name, the manufacturer's legal identity, the regulatory role, the
support period and its rationale, the Article 14 procedure. Every field names
the provision that makes it relevant. Six fields must be answered before it
validates; the rest may stay `null`, and a `null` reads as a gap in the pack,
which is the honest outcome.

## What comes out

```
cra-evidence/
├── README.md                 how the pack was made and how to reproduce it
├── executive-summary.md      verified, declared, missing, and who must decide what
├── annex-vii-map.md          coverage of the Annex VII technical documentation content
├── evidence-index.md         every control, its evidence, and the provision quoted in full
├── gaps.md                   open gaps by priority, each with a next step
├── product-profile.md        observations and declarations, never mixed
├── limitations.md            what this pack does not establish
├── assessment.json           the structured source of every rendered document
├── evidence-manifest.json    one record per artefact read, with its hash and commit
├── sbom.cdx.json             CycloneDX 1.6
├── source-register.json      official sources, access dates, digests
├── SHA256SUMS
└── pack.json                 the pack digest
```

The pack is organised along **Annex VII**, because that is the structure a
market surveillance authority asks for under Article 31. A pack organised by a
homemade taxonomy has to be re-mapped by hand.

## Reproducibility

Two runs at the same commit with the same profile produce the same content. Pin
the clock for byte-identical output:

```sh
probative run . --out cra-evidence/ --now 2026-08-28T12:00:00Z
SOURCE_DATE_EPOCH=1787918400 probative run . --out cra-evidence/
```

## In continuous integration

```yaml
- run: npx probative run . --out cra-evidence/ --force --fail-on-p0
- uses: actions/upload-artifact@v4
  with: { name: probative, path: cra-evidence/ }
```

Article 31(2) requires the technical documentation to be kept updated at least
during the support period. Regenerating the pack on every release is how that
stays true without anyone remembering to do it.

## Use from an AI agent

`SKILL.md` at the repository root is a portable agent skill: it depends on no
proprietary agent API, only on this CLI and the filesystem. The deterministic
engine stays the source of every state; the agent conducts the interview that
fills the profile and explains the result. It never decides a control.

## The regulation ships with the tool

`reference/regulation-2024-2847.en.txt` is the Official Journal text, retrieved
from the EU Publications Office, with its SHA-256 in `reference/SHA256SUMS`.
`reference/loci.json` indexes 282 provisions, so every citation resolves offline
and can be checked against the source:

```sh
probative cite AnnexI.PartII.1
probative cite Art.13.8
```

No rule paraphrases the Regulation. Each one cites a locus, and the pack quotes
the official wording.

Reuse of the Official Journal text is authorised under Commission Decision
2011/833/EU, source acknowledged.

## What it deliberately does not do

- **Annex I, Part I** (secure by default, encryption, attack surface, logging).
  Those follow from the cybersecurity risk assessment under Article 13(2) and
  (3). A repository cannot establish them, and a tool that pretended otherwise
  would be worse than no tool.
- **Decide whether the Regulation applies**, or in which role.
- **Conformity assessment, CE marking, EU declaration of conformity.**
- **Run your tests** and call the result an Annex VII, point 6 test report.
- **Score you.** There is no overall grade, and adding one would be a defect.

## Scope of this version

Node.js products with an npm `package-lock.json`, on macOS and Linux, with
GitHub Actions as the CI whose signals are recognised. Other package managers,
other ecosystems, remote data processing solutions and embedded products are out
of scope for now, and the pack says so rather than staying quiet about it.

## Contributing and rules

Rules live in `rules/` as data. `docs/rule-authoring.md` explains how to add one
and what a rule must never do. Regulatory sources are versioned in
`rules/sources.json` with access dates, and a ruleset never mixes versions.

## Licence

Apache-2.0. See `LICENSE` and `NOTICE`.
