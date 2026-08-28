/**
 * The status vocabulary. No status expresses compliance: the strongest one,
 * 'verified', means an observation in the repository supports the control, not
 * that an obligation is satisfied.
 */
export const STATUS = Object.freeze({
  VERIFIED: 'verified',
  DECLARED: 'declared',
  PARTIAL: 'partial',
  MISSING: 'missing',
  STALE: 'stale',
  NOT_APPLICABLE: 'not_applicable',
  ERROR: 'error',
  NEEDS_EXPERT_REVIEW: 'needs_expert_review',
});

export const STATUS_ORDER = Object.freeze([
  STATUS.VERIFIED, STATUS.DECLARED, STATUS.PARTIAL, STATUS.NEEDS_EXPERT_REVIEW,
  STATUS.STALE, STATUS.MISSING, STATUS.ERROR, STATUS.NOT_APPLICABLE,
]);

export const STATUS_MEANING = Object.freeze({
  verified: 'An artefact in the repository was read and supports this control.',
  declared: 'Stated by the manufacturer in the product profile. Not verifiable from the repository.',
  partial: 'Some supporting evidence exists, but it is incomplete or rests on a weak signal.',
  missing: 'No evidence and no declaration were found.',
  stale: 'Evidence exists but no longer matches the analysed commit, version or date.',
  not_applicable: 'Recorded as outside the scope of this product, with a justification.',
  error: 'The control could not be evaluated. The cause is recorded rather than reported as an absence.',
  needs_expert_review: 'A determination that a competent reviewer must make. The tool records the input, never the answer.',
});

/** Statuses that count as an open gap when prioritising work. */
export const GAP_STATUSES = Object.freeze([STATUS.MISSING, STATUS.PARTIAL, STATUS.STALE, STATUS.ERROR]);
