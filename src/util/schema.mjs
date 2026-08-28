/**
 * A deliberately small JSON Schema validator covering the subset the packs use:
 * type, required, properties, additionalProperties, enum, pattern, format
 * (date only), minimum, minItems, items, oneOf and $ref to '#/$defs/*'.
 *
 * Pulling a full validator would add a dependency tree to a tool whose subject
 * is supply chain evidence. The schemas are written to stay inside this subset,
 * and a schema feature used but not implemented is reported as an error rather
 * than silently ignored.
 */

const SUPPORTED_KEYWORDS = new Set([
  '$schema', '$id', '$ref', '$defs', 'title', 'description', 'type', 'required',
  'properties', 'additionalProperties', 'enum', 'pattern', 'format', 'minimum',
  'maximum', 'minItems', 'minLength', 'items', 'oneOf', 'const', 'examples', 'default',
]);

const DATE = /^\d{4}-\d{2}-\d{2}$/;
const DATE_TIME = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z$/;

function typeOf(value) {
  if (value === null) return 'null';
  if (Array.isArray(value)) return 'array';
  if (Number.isInteger(value)) return 'integer';
  return typeof value;
}

function matchesType(value, expected) {
  const actual = typeOf(value);
  if (expected === 'number') return actual === 'number' || actual === 'integer';
  if (expected === 'integer') return actual === 'integer';
  return actual === expected;
}

export function validate(schema, value, { root = schema, path = '$' } = {}) {
  const errors = [];

  if (schema.$ref) {
    const match = /^#\/\$defs\/(.+)$/.exec(schema.$ref);
    if (!match || !root.$defs?.[match[1]]) {
      return [{ path, message: `unsupported $ref '${schema.$ref}'` }];
    }
    return validate(root.$defs[match[1]], value, { root, path });
  }

  for (const keyword of Object.keys(schema)) {
    if (!SUPPORTED_KEYWORDS.has(keyword)) {
      errors.push({ path, message: `schema uses unsupported keyword '${keyword}'` });
    }
  }

  if (schema.type) {
    const types = Array.isArray(schema.type) ? schema.type : [schema.type];
    if (!types.some((t) => matchesType(value, t))) {
      errors.push({ path, message: `expected ${types.join(' or ')}, received ${typeOf(value)}` });
      return errors;
    }
  }

  if (schema.const !== undefined && value !== schema.const) {
    errors.push({ path, message: `expected constant ${JSON.stringify(schema.const)}` });
  }
  if (schema.enum && !schema.enum.includes(value)) {
    errors.push({ path, message: `expected one of ${schema.enum.map((v) => JSON.stringify(v)).join(', ')}, received ${JSON.stringify(value)}` });
  }
  if (typeof value === 'string') {
    if (schema.pattern && !new RegExp(schema.pattern).test(value)) {
      errors.push({ path, message: `does not match pattern ${schema.pattern}` });
    }
    if (schema.minLength !== undefined && value.length < schema.minLength) {
      errors.push({ path, message: `shorter than minLength ${schema.minLength}` });
    }
    if (schema.format === 'date' && !DATE.test(value)) errors.push({ path, message: 'expected a YYYY-MM-DD date' });
    if (schema.format === 'date-time' && !DATE_TIME.test(value)) errors.push({ path, message: 'expected an ISO 8601 UTC timestamp' });
  }
  if (typeof value === 'number') {
    if (schema.minimum !== undefined && value < schema.minimum) errors.push({ path, message: `below minimum ${schema.minimum}` });
    if (schema.maximum !== undefined && value > schema.maximum) errors.push({ path, message: `above maximum ${schema.maximum}` });
  }
  if (Array.isArray(value)) {
    if (schema.minItems !== undefined && value.length < schema.minItems) {
      errors.push({ path, message: `expected at least ${schema.minItems} item(s)` });
    }
    if (schema.items) {
      value.forEach((item, index) => errors.push(...validate(schema.items, item, { root, path: `${path}[${index}]` })));
    }
  }
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    for (const key of schema.required ?? []) {
      if (!Object.prototype.hasOwnProperty.call(value, key)) {
        errors.push({ path: `${path}.${key}`, message: 'required property is missing' });
      }
    }
    for (const [key, subSchema] of Object.entries(schema.properties ?? {})) {
      if (Object.prototype.hasOwnProperty.call(value, key)) {
        errors.push(...validate(subSchema, value[key], { root, path: `${path}.${key}` }));
      }
    }
    if (schema.additionalProperties === false) {
      const allowed = new Set(Object.keys(schema.properties ?? {}));
      for (const key of Object.keys(value)) {
        if (!allowed.has(key)) errors.push({ path: `${path}.${key}`, message: 'unexpected property' });
      }
    }
  }
  if (schema.oneOf) {
    const passing = schema.oneOf.filter((sub) => validate(sub, value, { root, path }).length === 0);
    if (passing.length !== 1) {
      errors.push({ path, message: `expected to match exactly one alternative, matched ${passing.length}` });
    }
  }

  return errors;
}

export function assertValid(schema, value, label) {
  const errors = validate(schema, value);
  if (errors.length > 0) {
    const detail = errors.slice(0, 10).map((e) => `  ${e.path}: ${e.message}`).join('\n');
    const more = errors.length > 10 ? `\n  ... and ${errors.length - 10} more` : '';
    throw new Error(`${label} failed schema validation:\n${detail}${more}`);
  }
}
