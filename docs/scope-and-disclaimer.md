# Scope and disclaimer

## What this tool is

It reads a Node.js repository and produces an inventory of technical evidence
plus the declarations a manufacturer has made about the product. That inventory
is an **input** to the technical documentation required by Article 31 and
Annex VII of Regulation (EU) 2024/2847. It is not that documentation, and it
does not become it by being complete.

## What it is not

- **Not a conformity assessment.** Article 32 sets out the procedures. A tool
  cannot perform one.
- **Not an EU declaration of conformity.** Article 28 and Annex V make that an
  act of the manufacturer, under its sole responsibility.
- **Not a CE marking.** Articles 29 and 30.
- **Not a determination of scope or role.** Whether the Regulation applies, and
  whether you are a manufacturer under Article 3(13) or an open-source software
  steward under Article 24, is a legal question about your business, not a
  property of your repository.
- **Not legal advice.**

No output of this tool asserts that a product complies with the Regulation, and
no configuration makes it do so. There is no overall score, on purpose: a single
number invites the reading that a threshold means compliance.

## What a state means

`verified` means an artefact was read and supports the control. It does not mean
the underlying obligation is satisfied. A published `SECURITY.md` containing a
reporting address and coordinated disclosure wording evidences Annex I, Part II,
points (5) and (6). Whether the policy is *enforced*, which is what point (5)
actually requires, is not observable from a repository and the pack says so on
every affected control.

## The three questions this tool always refuses

1. Does the Cyber Resilience Act apply to this product?
2. In which role: manufacturer, steward, importer, distributor, out of scope?
3. Which class under Annexes III and IV, and therefore which route under
   Article 32?

The product profile records the answers and the name of the person who gave
them. `CRA-NODE-004` is priority P0 and always requires expert review, because
every other obligation depends on those answers.

## Dates

| Applies from | What |
|---|---|
| 11 June 2026 | Chapter IV, Articles 35 to 51: notification of conformity assessment bodies |
| **11 September 2026** | **Article 14: reporting of actively exploited vulnerabilities and severe incidents** |
| 11 December 2027 | The Regulation in full |

Source: Article 71(2). Run `cra-evidence cite Art.71.2` to read it.

## Currency of the ruleset

`rules/sources.json` records every source with its access date, and the pack
carries that register. The Commission is empowered to adopt implementing acts on
the SBOM format under Article 13(24), delegated acts on minimum support periods
under Article 13(8) and additions to Annex VII under Article 31(5), and
harmonised standards are still being developed. Any of those will date this
ruleset. Check the register's dates before relying on a pack that is months old.

## Liability

This is free software provided under the Apache License 2.0, without warranty of
any kind, express or implied. Using it does not shift responsibility for
compliance, which remains with the manufacturer.
