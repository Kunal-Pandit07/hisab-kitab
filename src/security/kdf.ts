import { scryptAsync } from '@noble/hashes/scrypt';
import type { Kdf } from '../domain/pin';

/** scrypt (RFC 7914) via the audited @noble/hashes library; async so the UI stays responsive. */
export const scryptKdf: Kdf = (secret, salt, { N, r, p }) =>
  scryptAsync(new TextEncoder().encode(secret.normalize('NFKC')), salt, { N, r, p, dkLen: 32, maxmem: 256 * 1024 * 1024 });
