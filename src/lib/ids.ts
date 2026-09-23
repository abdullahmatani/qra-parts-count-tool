const ALPHABET = '0123456789abcdefghijklmnopqrstuvwxyz';

/** Entity id prefixes, so ids in the project file say what they point at. */
export type IdPrefix =
  'prj' | 'drw' | 'seg' | 'mkr' | 'itm' | 'eqt' | 'bns' | 'bin' | 'not' | 'lnk';

/**
 * Returns a short random id such as `mkr_k3v9x0q2m1ab`. Twelve base-36 characters
 * give ~62 bits of entropy, ample for 50,000+ entities per project (NFR-04).
 */
export function newId(prefix: IdPrefix): string {
  const bytes = new Uint8Array(12);
  crypto.getRandomValues(bytes);
  let out = `${prefix}_`;
  for (const b of bytes) out += ALPHABET[b % ALPHABET.length];
  return out;
}
