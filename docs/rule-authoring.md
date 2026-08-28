# Writing a rule

Rules are data. `rules/cra-node-mvp-1.0.0.json` holds them; `src/rules/checks.mjs`
holds the deterministic functions they name. Adding a control is a JSON object
plus, when no existing check fits, one function.

## The shape

```json
{
  "id": "CRA-NODE-0XX",
  "title": "A statement of fact that can be true or false",
  "family": "vulnerability-handling",
  "loci": ["AnnexI.PartII.5", "AnnexVII.2.b"],
  "intent": "Why this control exists, in one sentence.",
  "check": "disclosurePolicy",
  "priority": "P0",
  "limitations": "What a passing result does not establish.",
  "expertReviewWhen": ["the policy is published outside the repository"],
  "remediation": "The next concrete step, in the user's hands.",
  "status": "active"
}
```

## The rules about rules

**Cite, never paraphrase.** `loci` must name provisions present in
`reference/loci.json`. The pack quotes the official wording; a rule that
restates the Regulation in its own words is a rule that will be wrong after the
first amendment. A test fails if a locus does not resolve.

**One control, one provision.** Do not fold Article 13(8), (9) and (19) into a
single control because they are all about the support period. They fail
separately, they are remediated separately, and a merged control produces a gap
nobody can act on.

**Name what a pass does not prove.** `limitations` is mandatory. If you cannot
write it, you do not yet understand what your check observes.

**Match the state to the strength of the evidence.**

| The check reads | Strongest state it may return |
|---|---|
| A file's existence or its parsed content | `verified` |
| A keyword or a regular expression over prose or YAML | `partial` |
| A field of the product profile | `declared` |
| Nothing, because a human must decide | `needs_expert_review` |

A check that returns `verified` from a keyword match is a defect. The test
`a declared field never produces the verified state` exists to catch it.

**Never return a legal conclusion.** No status means compliant, and no summary
may say a product complies, conforms, is certified or passes. A test greps the
rendered pack for those words.

**An error is not an absence.** If a check cannot run, return `error` with the
cause. Reporting `missing` instead tells the user to go and create something
that may already exist.

**Priority is about consequence, not effort.** `P0`: the obligation is already
in force, or nothing else can be assessed until it is answered. `P1`: required
by Annex VII and reachable. `P2`: supporting evidence that strengthens a case
without being required by the text.

## Adding a check

A check is a pure function of the context.

```js
export const CHECKS = {
  myCheck(context, control) {
    const { inventory, profile, sbom, sbomStats, now, loci } = context;
    return {
      status: STATUS.PARTIAL,
      summary: 'One sentence a non-specialist can act on.',
      findings: [{ label: 'what was looked at', value: 'what was found' }],
    };
  },
};
```

It must not read the filesystem, spawn a process, open a socket or read the
clock. Everything it needs is in the context, and `now` is the only clock. That
is what makes two runs identical and what makes the check testable without a
fixture.

Reuse `declaredFields` with `checkOptions` for a control that is purely a
declaration. Writing a bespoke function for that is duplication.

## Versioning

A ruleset is immutable once published. Changing a control means a new version
file, and `introducedIn` on the control records where it appeared. Rulesets are
never mixed: a pack names exactly one, and the pack says which.

When the Commission adopts an implementing act, a delegated act or a harmonised
standard that changes what a control should look at, that is a new ruleset
version and an entry in `rules/sources.json` with the access date. Silently
editing a published rule destroys the only thing this tool sells, which is that
a finding can be traced back to a dated source.

## After changing a rule

```sh
npm run docs    # regenerate docs/coverage.md
npm test        # the drift test fails if you forget
```
