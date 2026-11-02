/**
 * Jest-only CommonJS stand-in for `nanoid` (v5 is ESM-only and cannot be required by ts-jest).
 * Same URL-safe alphabet and default length as nanoid.
 */
import { randomBytes } from 'crypto';

const ALPHABET = 'useandom-26T198340PX75pxJACKVERYMINDBUSHWOLF_GQZbfghjklqvwyzrict';

export function nanoid(size = 21): string {
  const bytes = randomBytes(size);
  let id = '';
  for (let i = 0; i < size; i++) id += ALPHABET[bytes[i] & 63];
  return id;
}
