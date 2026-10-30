import { b64decode, b64encode } from '../utils/base64';

export interface KdfParams { N: number; r: number; p: number }
/** Tuned for a responsive lock screen on phones. A short PIN is a convenience lock, not strong encryption. */
export const PIN_KDF: KdfParams = { N: 2 ** 13, r: 8, p: 1 };
export type Kdf = (secret: string, salt: Uint8Array, params: KdfParams) => Promise<Uint8Array>;

export interface PinVerifier { v: 1; kdf: 'scrypt'; N: number; r: number; p: number; len: number; salt: string; hash: string }

export function validatePin(pin: string): string | null {
  if (!/^\d{4,6}$/.test(pin)) return 'Use 4 to 6 digits.';
  if (/^(\d)\1+$/.test(pin)) return 'Avoid repeating the same digit.';
  const d = [...pin].map(Number);
  const step = d[1] - d[0];
  if (Math.abs(step) === 1 && d.every((x, i) => i === 0 || x - d[i - 1] === step)) return 'Avoid simple sequences like 1234.';
  return null;
}

export async function createVerifier(pin: string, deps: { randomBytes: (n: number) => Uint8Array; kdf: Kdf }, params: KdfParams = PIN_KDF): Promise<PinVerifier> {
  const salt = deps.randomBytes(16);
  const hash = await deps.kdf(pin, salt, params);
  return { v: 1, kdf: 'scrypt', ...params, len: pin.length, salt: b64encode(salt), hash: b64encode(hash) };
}
export async function checkPin(pin: string, v: PinVerifier, kdf: Kdf): Promise<boolean> {
  const got = await kdf(pin, b64decode(v.salt), { N: v.N, r: v.r, p: v.p });
  const want = b64decode(v.hash);
  if (got.length !== want.length) return false;
  let diff = 0; for (let i = 0; i < got.length; i++) diff |= got[i] ^ want[i]; // constant-time compare
  return diff === 0;
}

export interface LockState { fails: number; lockedUntil: number }
export const FRESH_LOCK: LockState = { fails: 0, lockedUntil: 0 };
/** Escalating delay after repeated wrong PINs. */
export const lockoutSecondsFor = (fails: number) => (fails < 5 ? 0 : fails === 5 ? 30 : fails === 6 ? 60 : fails === 7 ? 300 : 900);
export const remainingLockSeconds = (s: LockState, now: number) => Math.max(0, Math.ceil((s.lockedUntil - now) / 1000));
export function afterFailure(s: LockState, now: number): LockState {
  const fails = s.fails + 1; const secs = lockoutSecondsFor(fails);
  return { fails, lockedUntil: secs ? now + secs * 1000 : 0 };
}
export const afterSuccess = (): LockState => ({ ...FRESH_LOCK });
