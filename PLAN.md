# CRA Evidence Pack skill - design and implementation plan

Date: 28 August 2026
Status: design approved; implemented on 28 August 2026, see `CHANGELOG.md`
Written for: handover to Claude Code

> This document is the original design, translated from French on 29 August
> 2026 so that every file in the repository is in English. Its content is
> unchanged apart from the status line above. Where the implementation departed
> from the plan, the reasons are recorded in `CHANGELOG.md` and in the commit
> messages, not by editing this document. It is a historical record, not a
> description of what was built.

## 1. Summary

Build a portable skill for AI agents that helps an SME selling Node.js software
installed on its customers' premises prepare a technical evidence file for the
European Cyber Resilience Act.

The skill analyses a repository, collects the verifiable material already
present, runs deterministic checks, generates or imports a CycloneDX SBOM, and
produces a versionable file set in Markdown and JSON. It flags evidence that is
absent, out of date or impossible to verify.

The product never certifies compliance, does not replace legal advice, and does
not decide on its own whether the CRA applies. It prepares technical material
that the SME's product, security and compliance owners can review.

## 2. Decisions already taken

- Format: a portable skill compatible with several agents.
- Architecture: instructions in `SKILL.md` and deterministic Node.js scripts.
- First user: an SME selling software.
- First product: Node.js software distributed and installed at the customer.
- First hosting model: no remote service required.
- Outputs: Markdown and JSON files, versionable in Git.
- Skill language: English, to maximise portability; user documentation in
  English first, then French.
- Regulatory stance: technical assistance grounded in sources, never
  certification and never a legal opinion.

## 3. User problem

A small company typically uses several independent tools to produce an SBOM,
track its dependencies, document its vulnerabilities, evidence its tests and
describe its releases. The evidence stays scattered across the repository, the
CI, the registries, the issue tracker and internal documents.

The technical lead cannot easily tell:

- which evidence already exists;
- which evidence is current;
- how a piece of evidence was produced;
- which requirement or practice it is meant to document;
- which gaps should be addressed first;
- how to reproduce the same file set at the next release.

The skill has to turn that scattered state into an explainable, reproducible
file set.

## 4. Value proposition

> Analyze a commercial Node.js product repository and produce a reproducible,
> source-linked CRA technical evidence pack without claiming legal compliance.

The value does not come from an LLM-written summary. It comes from
traceability: every finding must state its source, the command, the date, the
commit, the result and the limits of the verification.

## 5. MVP scope

### In scope

- Git repositories containing a Node.js product.
- `npm`, with a mandatory `package-lock.json` on the nominal path.
- Simple repositories and basic npm workspaces.
- Local execution on macOS and Linux.
- Reference CI: GitHub Actions.
- Collection of Git and npm package metadata.
- Inventory of direct and transitive dependencies.
- Generation or import of a CycloneDX JSON SBOM.
- Detection of observable security documents and practices.
- Collection of test, build and release evidence.
- A gap report with normalised states.
- Export of a Markdown/JSON pack into a directory chosen by the user.
- Offline mode when every needed dependency is already installed.
- Secret redaction and explicit exclusion of sensitive files.

### Out of MVP scope

- Pure SaaS and detailed analysis of remote data processing solutions.
- Embedded, firmware, mobile and IoT products.
- Python, Java, Rust and other ecosystems.
- Certification, CE marking, or generating an EU declaration of conformity.
- Automatic legal determination of the manufacturer, importer, distributor or
  steward role.
- Submitting an incident to an authority.
- A web portal, user accounts, a database or a cloud service.
- Full dynamic security analysis of the product.
- Automatic remediation of code or security policies.
- Any guarantee that a piece of evidence legally satisfies a requirement.

## 6. Intended use

### Main scenario

1. A user asks their agent to run the skill on the current repository.
2. The skill states its scope, its limits and the data it is about to read.
3. The agent asks for confirmation before any command that installs
   dependencies, accesses the network or writes into the repository.
4. The scripts inspect the repository and produce a raw inventory.
5. The skill asks only for the product information that cannot be inferred, for
   example the commercial name or the support policy.
6. The scripts run the authorised checks and collect the evidence.
7. The engine classifies each check with a normalised state.
8. The renderer generates the pack in `cra-evidence/` by default.
9. The agent summarises the priority gaps and the limits of the analysis.

### Re-running

Re-running on the same commit in the same environment must produce
deterministic content, except for fields that are explicitly time-based.
Re-running after a change must state which evidence has become stale or has
changed.

## 7. Portability contract

The skill must not depend on any proprietary agent API.

The lowest common denominator is:

- a root `SKILL.md` describing when and how to use the skill;
- Node.js commands runnable from a shell;
- filesystem inputs and outputs;
- machine-readable output in JSON and human-readable output in Markdown;
- no dependency on an MCP server;
- no assumption about the name of any particular agent tool;
- confirmation prompts described in the workflow rather than encoded in an
  agent API.

Agent-specific adapters may be added later without changing the core.

## 8. Target repository structure

```text
cra-evidence-skill/
├── SKILL.md
├── README.md
├── LICENSE
├── SECURITY.md
├── package.json
├── package-lock.json
├── bin/
│   └── cra-evidence.mjs
├── scripts/
│   ├── inspect-repository.mjs
│   ├── collect-evidence.mjs
│   ├── generate-sbom.mjs
│   ├── evaluate-controls.mjs
│   ├── render-pack.mjs
│   └── redact.mjs
├── rules/
│   ├── schema.json
│   ├── cra-node-mvp.json
│   └── sources.json
├── templates/
│   ├── executive-summary.md
│   ├── product-profile.md
│   ├── evidence-index.md
│   ├── gaps.md
│   └── limitations.md
├── schemas/
│   ├── product-profile.schema.json
│   ├── evidence-manifest.schema.json
│   └── assessment.schema.json
├── docs/
│   ├── scope-and-disclaimer.md
│   ├── rule-authoring.md
│   ├── threat-model.md
│   └── examples/
├── test/
│   ├── unit/
│   ├── integration/
│   └── fixtures/
└── PLAN.md
```

Do not create every file in the first commit. The tree describes the final
boundaries; each phase should add only what it needs.

## 9. Functional architecture

### 9.1 Skill orchestrator

Responsibility: guide the agent and the user through the right order.

It must:

- explain the limits before the analysis;
- distinguish local reads, writes and network access;
- ask for the confirmations it needs;
- run the scripts in a defined order;
- never invent missing evidence;
- present observed facts, declared information and interpretations separately.

### 9.2 Repository inspector

Responsibility: produce a factual inventory without deciding on compliance.

Data inspected:

- commit, branch and Git state;
- `package.json`, lockfile and workspaces;
- available npm scripts;
- CI files;
- `README`, `SECURITY`, `LICENSE`, `CHANGELOG` and contribution files;
- test and build configuration;
- detectable release mechanisms;
- Dependabot or Renovate configuration;
- visible signatures, attestations or provenance;
- any existing SBOM and VEX files.

### 9.3 SBOM generator and validator

Responsibility: obtain a reproducible CycloneDX JSON SBOM and document its
provenance.

The component must:

- prefer an existing, valid SBOM when it matches the analysed commit;
- otherwise use a CycloneDX Node.js generator pinned by the skill's own
  lockfile;
- record the tool version and the schema version;
- keep errors rather than produce a partial SBOM presented as complete;
- distinguish production, development and optional dependencies;
- flag dependencies with no resolved version or no clear provenance.

### 9.4 Evidence collector

Responsibility: turn an observation or a command into a traceable record.

Each piece of evidence contains at least:

- a stable identifier;
- an evidence type;
- a source or path;
- the command that was run, where applicable;
- the analysed commit;
- a timestamp;
- the digest of the file or of the output;
- the result;
- the limits;
- a sensitivity indicator;
- a redaction status.

### 9.5 Rules engine

Responsibility: compare the evidence against versioned technical controls.

Allowed states:

- `verified`: evidence observed and the check succeeded;
- `declared`: information supplied by the user but not automatically
  verifiable;
- `partial`: evidence present but incomplete or insufficient in scope;
- `missing`: no evidence found;
- `stale`: evidence that does not match the analysed commit or version;
- `not_applicable`: a justified and recorded exclusion;
- `error`: the check could not be run;
- `needs_expert_review`: human interpretation is indispensable.

The engine must never produce an overall `compliant` or `non_compliant` status.

The `not_applicable` state must come from a documented human decision. A
deterministic check may suggest it, but it cannot assign it on its own when the
decision depends on a legal interpretation or on the business model.

### 9.6 Pack renderer

Responsibility: turn structured data into a readable, checkable file set.

It contains no regulatory logic. It displays only the engine's results, the
sources and the limits.

## 10. Skill outputs

```text
cra-evidence/
├── README.md
├── product-profile.md
├── executive-summary.md
├── evidence-index.md
├── gaps.md
├── limitations.md
├── assessment.json
├── evidence-manifest.json
├── sbom.cdx.json
├── source-register.json
└── raw/
    └── command-results/
```

### Output rules

- `README.md` explains how the pack was created and how to reproduce it.
- `product-profile.md` distinguishes detected facts from user declarations.
- `executive-summary.md` contains no definitive legal statement.
- `evidence-index.md` links controls, evidence and gaps.
- `gaps.md` prioritises actions without presenting an unsourced legal
  obligation.
- `assessment.json` is the primary structured source of the rendering.
- `evidence-manifest.json` makes evidence freshness and integrity checkable.
- `source-register.json` records the official sources, their access dates and
  the ruleset version.
- `raw/` excludes by default any log that could contain secrets; only cleaned
  output is written there.
- An existing pack is never silently overwritten: the command either fails or
  creates an explicitly named run.
- Writing is atomic: generate into a temporary directory, validate, then move
  to the final destination.

## 11. MVP control families

The precise rules will have to be validated during implementation against the
official text and the guidance in force. At a minimum the MVP must organise the
evidence along the following families:

1. Product and version identification.
2. Description of the delivered software scope.
3. Component inventory and SBOM.
4. Vulnerability intake and handling policy.
5. Security reporting channel.
6. Tracking of known vulnerabilities in dependencies.
7. Tests and security checks observable in CI.
8. Documented build procedure and reproducibility.
9. Release integrity, signing or provenance, where they exist.
10. Update policy and declared support period.
11. Secure installation and configuration documentation.
12. Change log and version traceability.
13. Incident and disclosure process, to be reviewed by an expert.
14. Evidence retention and the ability to regenerate the pack.

A control family is not an automatic translation of an obligation. Each rule
must reference an official source, its version, its scope of application and
the technical reason for its inclusion.

## 12. Rule model

Every versioned rule must include:

```json
{
  "id": "CRA-NODE-MVP-001",
  "title": "Product version is identifiable",
  "intent": "Establish which delivered product version the evidence pack describes.",
  "sourceIds": ["EU-CRA-2024-2847"],
  "evidenceTypes": ["package_metadata", "git_commit", "release_metadata"],
  "evaluation": "deterministic-check-name",
  "manualReviewWhen": ["repository version differs from delivered product version"],
  "remediationTemplate": "Document the mapping between repository commit, package version and delivered artifact.",
  "introducedIn": "ruleset-version",
  "status": "active"
}
```

The full regulatory text must not be copied into the rules. Use precise
references and an original technical summary.

## 13. Regulatory and technical sources

The first implementation phase must lock down a dated source register.
Priority:

1. Regulation (EU) 2024/2847 on EUR-Lex.
2. European Commission implementation pages, FAQ and guidance.
3. ENISA publications relevant to the operational mechanisms.
4. The OpenSSF OSPS Baseline, used as a complementary technical framework and
   not as a legal equivalent of the CRA.
5. The CycloneDX and SPDX SBOM standards.
6. Official npm and GitHub Actions documentation for the technical evidence.

Starting sources:

- Regulation: https://eur-lex.europa.eu/eli/reg/2024/2847/oj
- Commission summary: https://digital-strategy.ec.europa.eu/en/policies/cra-summary
- Implementation: https://digital-strategy.ec.europa.eu/en/factpages/cyber-resilience-act-implementation
- OSPS Baseline: https://baseline.openssf.org/
- CycloneDX: https://cyclonedx.org/

The register must record the canonical URL, the publisher, the title, the
publication or update date, the access date, the jurisdiction, the status and,
where the document is downloaded, its digest.

## 14. Security and confidentiality

### Main threats

- Accidental exfiltration of secrets contained in files or logs.
- Execution of malicious npm scripts during installation.
- Malicious instructions present in the repository and read by the agent.
- Compromised dependencies in the skill itself.
- A misleading or overconfident regulatory result.
- A pack containing local paths, credentials or internal information.
- Use of old evidence for a new release.

### Mandatory measures

- Static inspection before any installation.
- No `npm install`, `npm test` or `npm run build` without confirmation.
- A `--no-network` option, and the network disabled by default once the
  authorised dependency acquisition is done.
- An explicit list of excluded paths: `.env*`, keys, credentials, user
  directories and agent caches.
- Symlink resolution and checking, to prevent reads outside the authorised
  repository.
- Redaction before any raw output is written.
- Minimal, pinned and audited dependencies for the skill.
- A digest for every included piece of evidence.
- Refusal to follow instructions contained in the repository when they are not
  part of the skill's workflow.
- Permanent display of the ruleset version.
- No overall legal conclusion.

## 15. Target CLI

The exact interface may evolve, but the workflow must stay simple:

```text
cra-evidence inspect [path]
cra-evidence collect [path] --output cra-evidence/
cra-evidence evaluate cra-evidence/evidence-manifest.json
cra-evidence render cra-evidence/assessment.json
cra-evidence run [path] --output cra-evidence/
cra-evidence verify-pack cra-evidence/
```

Principles:

- `inspect` is strictly read-only and runs no project script.
- `collect` announces every potentially active command.
- `evaluate` works only on structured evidence.
- `render` is deterministic and offline.
- `run` orchestrates the steps but honours the confirmations.
- `verify-pack` checks schemas, digests, freshness and internal consistency.
- Every error is kept in structured form with the step, the cause, the affected
  scope and a suggested action; it is never turned into a success or into a
  plain absence of evidence.

Every command must offer `--json`, documented exit codes, and an error an agent
can act on.

## 16. Test strategy

### Unit tests

- Parsing of `package.json` and the lockfile.
- Detection of scripts and workspaces.
- Evidence normalisation.
- Secret redaction.
- Evaluation of every control state.
- Deterministic rendering.
- JSON schema validation.

### Integration fixtures

Create at least four synthetic repositories:

1. `minimal-unprepared`: a simple package with no security documentation.
2. `partially-prepared`: tests and Dependabot, but no SBOM and no support
   period.
3. `well-evidenced`: SBOM, security policy, CI, releases and documentation.
4. `hostile-repository`: fake secrets, dangerous npm scripts and prompt
   injection instructions.

### End-to-end tests

- Offline execution against each fixture.
- Two identical runs produce the same non-temporal data.
- A change of commit invalidates the dependent evidence.
- No canary secret appears in the pack.
- An SBOM error stays visible and never becomes a silent partial success.
- The skill works from at least two different agents before version 0.1.

## 17. MVP acceptance criteria

The MVP is done when:

- a compatible agent can discover and apply `SKILL.md` without adapting the
  core;
- a Node.js repository with a lockfile can be analysed offline;
- the skill generates a CycloneDX SBOM or explains precisely why it cannot;
- every finding in the report points to a piece of evidence or carries the
  state `declared`, `missing`, `error` or `needs_expert_review`;
- the pack contains the commit, the ruleset and the tool versions;
- `verify-pack` detects modified or stale evidence;
- no canary secret from the fixtures ends up in the output;
- the four fixtures give the expected results;
- no output uses the words "certified", "legally compliant" or an equivalent as
  a conclusion;
- the documentation explains the limits and the need for legal and security
  review;
- an SME pilot can understand the five priority gaps without help from the
  skill's maintainer.

## 18. Implementation plan

### Phase 0 - lock down the regulatory scope and the sources

Goal: stop the code from being built on outdated summaries.

- Re-read the official sources in force on the day of implementation.
- Create `rules/sources.json` with metadata and access dates.
- Define a ruleset update policy.
- Have the terminology and the disclaimer reviewed by a competent person.
- Write the first control families without automation.

Output: a source register and reviewed candidate rules.

### Phase 1 - portable skeleton and execution protocol

Goal: prove that the same skill works with several agents.

- Write a minimal, vendor-neutral `SKILL.md`.
- Define the inputs, outputs, confirmations and errors.
- Create the Node.js CLI with `inspect` and `--json`.
- Manually test discovery from Claude Code and from a second agent.
- Document the integration differences without introducing them into the core.

Output: a runnable skill able to inventory a repository with no active action.

### Phase 2 - deterministic Node.js inventory

Goal: produce a reliable model of the repository.

- Parse the package, the lockfile, the scripts and the workspaces.
- Collect the Git metadata.
- Detect CI, security, tests, builds and releases.
- Write `product-profile.json` and the raw inventory.
- Add fixtures and unit tests.

Output: a structured inventory validated against a schema.

### Phase 3 - SBOM and evidence manifest

Goal: produce the two fundamental technical artefacts.

- Integrate a pinned CycloneDX generator.
- Validate an existing SBOM before reusing it.
- Record versions, commands, digests and limits.
- Design `evidence-manifest.json`.
- Implement redaction before persistence.

Output: a verifiable SBOM and structured evidence.

### Phase 4 - rules engine

Goal: turn evidence into explainable states.

- Implement the rule schema.
- Limit the first ruleset to about 12 high-value controls.
- Separate deterministic evaluation from human review.
- Link every result to its sources and evidence.
- Test every possible state.

Output: an `assessment.json` with no overall compliance conclusion.

### Phase 5 - pack generation and verification

Goal: create the deliverable an SME can use.

- Generate the Markdown documents from the JSON data.
- Produce a factual executive summary.
- Rank the gaps by technical priority and estimated effort.
- Implement `verify-pack`.
- Test output stability and freshness detection.

Output: a complete, reproducible `cra-evidence/` directory.

### Phase 6 - adversarial security and robustness

Goal: make the tool safe against an untrusted repository.

- Finalise the hostile fixture.
- Test secrets, prompt injection, npm scripts and unexpected paths.
- Verify the behaviour with no network.
- Add limits on size, duration and log volume.
- Write the threat model and the security policy.

Output: documented guarantees and automated adversarial tests.

### Phase 7 - pilot and version 0.1

Goal: verify the real value before widening the scope.

- Test against three representative open-source Node.js repositories.
- Run a pilot with a willing SME on a private repository, executed locally.
- Collect false positives, missing evidence and misunderstandings.
- Correct the ruleset and the documentation.
- Publish version 0.1 with a changelog and versioned rules.

Output: a first public version and documented user feedback.

## 19. Order of priority

Absolute priority:

1. Evidence provenance and freshness.
2. Protection of secrets.
3. Absence of a misleading legal conclusion.
4. Deterministic checks.
5. Portability across agents.
6. Clarity of the gaps.

To be deferred until after the MVP:

- a graphical interface;
- other package managers;
- advanced VEX;
- a GitHub App integration;
- automatic publication of attestations;
- sector-specific plugins;
- SaaS and connected devices;
- an overall score.

## 20. Project risks

### Drifting into a legal tool

Response: separate sources, evidence and interpretations; require
`needs_expert_review` for scope decisions.

### Rules going out of date quickly

Response: versioned rulesets, access dates, a changelog, and a refusal to mix
rules from different versions.

### Portability that is only theoretical

Response: test version 0.1 from at least two agents and keep a CLI core with no
agent dependency.

### Too many controls for an MVP

Response: limit the first ruleset to a dozen well-sourced technical controls.

### Dangerous installation of the analysed project

Response: static inspection by default; active actions only after consent;
consider sandboxing in a later phase.

### A false sense of security

Response: display the limits in every output, forbid an overall compliance
score, and make verified evidence and declarations visibly distinct.

## 21. Deferred questions

These decisions must not block the MVP:

- the project's final licence;
- the public name and the visual identity;
- pnpm and Yarn support;
- the cryptographic attestation format;
- adapters specific to Codex, Claude Code or other agents;
- PDF or DOCX export;
- mapping onto other frameworks such as NIS2 or ISO 27001;
- a possible business model.

## 22. First task recommended to Claude Code

Do not start by generating the whole tree.

First mission:

1. Re-read this plan.
2. Verify the official sources and the terminology as at the resumption date.
3. Propose an MVP ruleset of 10 to 12 technical controls at most.
4. For each control, identify the observable evidence, the limit and any need
   for human review.
5. Submit that ruleset for validation before writing the CLI.

Suggested resumption prompt:

> Read `PLAN.md` completely. Do not implement yet. Verify the current official
> CRA sources referenced in the plan, then propose the smallest 10-12 control
> ruleset for the Node.js MVP. For each control, specify its official source,
> deterministic evidence, possible statuses, limitations, and when expert review
> is required. Preserve the product boundary: this tool prepares technical
> evidence and never claims legal compliance.

## 23. Definition of success

The project succeeds if a small company can run the skill locally against a
Node.js release and obtain, in under fifteen minutes, a traceable evidence file
set that clearly shows:

- what was verified;
- what was only declared;
- what is missing;
- what is stale;
- what requires human review;
- how to reproduce the pack.

Success is not measured by the number of controls or by the amount of generated
text, but by the quality, the freshness and the explainability of the evidence.
