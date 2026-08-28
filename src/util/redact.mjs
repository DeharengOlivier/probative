/**
 * Redaction runs on every string that reaches disk. It is deliberately blunt:
 * a false positive costs a reader one unreadable token, a false negative
 * publishes a live credential inside a document meant for an auditor.
 */

const PATTERNS = Object.freeze([
  { id: 'aws-access-key-id', regex: /\b(?:AKIA|ASIA|AGPA|AIDA|AROA|ANPA|ANVA|ABIA|ACCA)[0-9A-Z]{16}\b/g },
  { id: 'github-token', regex: /\bgh[pousr]_[A-Za-z0-9]{16,}\b/g },
  { id: 'github-fine-grained-token', regex: /\bgithub_pat_[A-Za-z0-9_]{22,}\b/g },
  { id: 'slack-token', regex: /\bxox[abposr]-[A-Za-z0-9-]{10,}\b/g },
  { id: 'npm-token', regex: /\bnpm_[A-Za-z0-9]{36}\b/g },
  { id: 'stripe-key', regex: /\b[sr]k_(?:live|test)_[A-Za-z0-9]{16,}\b/g },
  { id: 'google-api-key', regex: /\bAIza[0-9A-Za-z_-]{35}\b/g },
  { id: 'openai-key', regex: /\bsk-(?:proj-)?[A-Za-z0-9_-]{20,}\b/g },
  { id: 'anthropic-key', regex: /\bsk-ant-[A-Za-z0-9_-]{20,}\b/g },
  { id: 'private-key-block', regex: /-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]*?-----END [A-Z ]*PRIVATE KEY-----/g },
  { id: 'jwt', regex: /\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\b/g },
  { id: 'basic-auth-url', regex: /\b([a-z][a-z0-9+.-]*:\/\/)[^\s/:@]+:[^\s/@]+@/gi },
  { id: 'assigned-secret', regex: /\b((?:api[_-]?key|secret|password|passwd|token|access[_-]?key)\s*[:=]\s*)(['"]?)([^\s'"`,;]{8,})\2/gi },
]);

const PLACEHOLDER = '[REDACTED:%s]';

/**
 * @returns {{ text: string, findings: Array<{rule: string, count: number}> }}
 */
export function redact(text) {
  if (typeof text !== 'string' || text.length === 0) return { text: text ?? '', findings: [] };
  let output = text;
  const findings = [];
  for (const { id, regex } of PATTERNS) {
    let count = 0;
    output = output.replace(new RegExp(regex.source, regex.flags), (...args) => {
      count += 1;
      const marker = PLACEHOLDER.replace('%s', id);
      // Keep the assignment shape so the reader still sees which key was set.
      if (id === 'assigned-secret') return `${args[1]}${args[2]}${marker}${args[2]}`;
      if (id === 'basic-auth-url') return `${args[1]}${marker}@`;
      return marker;
    });
    if (count > 0) findings.push({ rule: id, count });
  }
  return { text: output, findings };
}

/** Redact recursively through a structure destined for JSON output. */
export function redactDeep(value, findings = []) {
  if (typeof value === 'string') {
    const result = redact(value);
    findings.push(...result.findings);
    return result.text;
  }
  if (Array.isArray(value)) return value.map((item) => redactDeep(item, findings));
  if (value && typeof value === 'object' && value.constructor === Object) {
    const out = {};
    for (const [key, item] of Object.entries(value)) out[key] = redactDeep(item, findings);
    return out;
  }
  return value;
}

export function containsSecret(text) {
  return redact(text).findings.length > 0;
}
