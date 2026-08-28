/** Canonical JSON: stable key order, LF, no trailing whitespace. */

/** Recursively sort object keys so two runs serialise identically. */
export function canonicalise(value) {
  if (Array.isArray(value)) return value.map(canonicalise);
  if (value && typeof value === 'object' && value.constructor === Object) {
    const out = {};
    for (const key of Object.keys(value).sort()) out[key] = canonicalise(value[key]);
    return out;
  }
  return value;
}

/** Deterministic pretty JSON, always terminated by a single LF. */
export function stringify(value) {
  return JSON.stringify(canonicalise(value), null, 2) + '\n';
}

/** Compact canonical form, used for hashing. */
export function compact(value) {
  return JSON.stringify(canonicalise(value));
}
