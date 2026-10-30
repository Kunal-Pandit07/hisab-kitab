import { xchacha20poly1305 } from '@noble/ciphers/chacha';
import { scryptAsync } from '@noble/hashes/scrypt';
import { b64decode, b64encode } from '../utils/base64';

export const BACKUP_MAGIC = 'HKBK';
export const BACKUP_FORMAT_VERSION = 1;
export interface BackupKdf { N: number; r: number; p: number }
export const DEFAULT_BACKUP_KDF: BackupKdf = { N: 2 ** 15, r: 8, p: 1 };

export type BackupErrorCode = 'format' | 'version' | 'params' | 'auth' | 'payload';
export class BackupError extends Error {
  constructor(public code: BackupErrorCode, message: string) { super(message); }
}

interface Envelope {
  magic: string; version: number;
  kdf: { name: 'scrypt' } & BackupKdf & { salt: string };
  cipher: 'xchacha20poly1305'; nonce: string; ciphertext: string;
}
const enc = new TextEncoder(); const dec = new TextDecoder();
/** The header is authenticated as AAD, so changing any parameter makes decryption fail. */
const aad = (e: Envelope) => enc.encode([e.magic, e.version, e.kdf.name, e.kdf.N, e.kdf.r, e.kdf.p, e.kdf.salt, e.cipher, e.nonce].join('|'));
const derive = (password: string, salt: Uint8Array, k: BackupKdf) =>
  scryptAsync(enc.encode(password.normalize('NFKC')), salt, { N: k.N, r: k.r, p: k.p, dkLen: 32, maxmem: 256 * 1024 * 1024 });

export const MIN_BACKUP_PASSWORD = 8;

export async function encryptBackup(payload: unknown, password: string, deps: { randomBytes: (n: number) => Uint8Array }, kdf: BackupKdf = DEFAULT_BACKUP_KDF): Promise<string> {
  const salt = deps.randomBytes(16); const nonce = deps.randomBytes(24);
  const env: Envelope = { magic: BACKUP_MAGIC, version: BACKUP_FORMAT_VERSION, kdf: { name: 'scrypt', ...kdf, salt: b64encode(salt) }, cipher: 'xchacha20poly1305', nonce: b64encode(nonce), ciphertext: '' };
  const key = await derive(password, salt, kdf);
  try { env.ciphertext = b64encode(xchacha20poly1305(key, nonce, aad(env)).encrypt(enc.encode(JSON.stringify(payload)))); }
  finally { key.fill(0); }
  return JSON.stringify(env);
}

const isPow2 = (n: number) => Number.isInteger(n) && n > 0 && (n & (n - 1)) === 0;

export async function decryptBackup(fileText: string, password: string): Promise<unknown> {
  let env: Envelope;
  try { env = JSON.parse(fileText); } catch { throw new BackupError('format', 'This is not a Hisab Kitab backup file.'); }
  if (!env || env.magic !== BACKUP_MAGIC || typeof env.version !== 'number' || !env.kdf || typeof env.ciphertext !== 'string') throw new BackupError('format', 'This is not a Hisab Kitab backup file.');
  if (env.version !== BACKUP_FORMAT_VERSION) throw new BackupError('version', 'This backup was made by an incompatible version of the app.');
  const { N, r, p } = env.kdf;
  // refuse absurd parameters so a hostile file cannot exhaust memory or time
  if (env.kdf.name !== 'scrypt' || env.cipher !== 'xchacha20poly1305' || !isPow2(N) || N < 2 ** 10 || N > 2 ** 17 || !Number.isInteger(r) || r < 1 || r > 16 || !Number.isInteger(p) || p < 1 || p > 4)
    throw new BackupError('params', 'This backup uses unsupported security settings.');
  let salt: Uint8Array, nonce: Uint8Array, ct: Uint8Array;
  try { salt = b64decode(env.kdf.salt); nonce = b64decode(env.nonce); ct = b64decode(env.ciphertext); } catch { throw new BackupError('format', 'The backup file is damaged.'); }
  if (salt.length < 16 || salt.length > 64 || nonce.length !== 24 || ct.length < 16) throw new BackupError('format', 'The backup file is damaged.');

  const key = await derive(password, salt, { N, r, p });
  let plain: Uint8Array;
  try { plain = xchacha20poly1305(key, nonce, aad(env)).decrypt(ct); }
  catch { throw new BackupError('auth', 'Wrong password, or the backup file is damaged.'); }
  finally { key.fill(0); }
  try { return JSON.parse(dec.decode(plain)); } catch { throw new BackupError('payload', 'The backup contents could not be read.'); }
}
