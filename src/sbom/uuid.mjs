import { createHash } from 'node:crypto';

/** RFC 4122 URL namespace, used so the same input always yields the same URN. */
const URL_NAMESPACE = '6ba7b811-9dad-11d1-80b4-00c04fd430c8';

function namespaceBytes(uuid) {
  return Buffer.from(uuid.replace(/-/g, ''), 'hex');
}

/**
 * UUID version 5 (SHA-1, name-based). A CycloneDX serial number must be a URN
 * UUID; deriving it from the bill of materials content is what lets two runs of
 * this tool over the same tree produce a byte-identical SBOM.
 */
export function uuidV5(name, namespace = URL_NAMESPACE) {
  const hash = createHash('sha1').update(Buffer.concat([namespaceBytes(namespace), Buffer.from(name, 'utf8')])).digest();
  const bytes = Buffer.from(hash.subarray(0, 16));
  bytes[6] = (bytes[6] & 0x0f) | 0x50; // version 5
  bytes[8] = (bytes[8] & 0x3f) | 0x80; // RFC 4122 variant
  const hex = bytes.toString('hex');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}
