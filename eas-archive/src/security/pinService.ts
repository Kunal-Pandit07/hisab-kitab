import * as SecureStore from 'expo-secure-store';
import { getRandomBytes } from 'expo-crypto';
import { afterFailure, afterSuccess, checkPin, createVerifier, FRESH_LOCK, LockState, PinVerifier, remainingLockSeconds, validatePin } from '../domain/pin';
import { scryptKdf } from './kdf';

// Verifier and failure counter live in the platform keystore (Keychain / Android Keystore-backed), never in SQLite or backups.
const OPTS: SecureStore.SecureStoreOptions = { keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY };
const KEY_V = 'hk.pin.v1'; const KEY_L = 'hk.pin.lock';

async function readVerifier(): Promise<PinVerifier | null> {
  const raw = await SecureStore.getItemAsync(KEY_V, OPTS);
  if (!raw) return null;
  try { return JSON.parse(raw) as PinVerifier; } catch { return null; }
}
async function readLock(): Promise<LockState> {
  try { const raw = await SecureStore.getItemAsync(KEY_L, OPTS); return raw ? (JSON.parse(raw) as LockState) : FRESH_LOCK; } catch { return FRESH_LOCK; }
}
const writeLock = (s: LockState) => SecureStore.setItemAsync(KEY_L, JSON.stringify(s), OPTS);

export const hasPin = async () => (await readVerifier()) !== null;
export const getPinLength = async () => (await readVerifier())?.len ?? null;
export const getLockSeconds = async () => remainingLockSeconds(await readLock(), Date.now());

export async function setPin(pin: string): Promise<void> {
  const err = validatePin(pin); if (err) throw new Error(err);
  const v = await createVerifier(pin, { randomBytes: getRandomBytes, kdf: scryptKdf });
  await SecureStore.setItemAsync(KEY_V, JSON.stringify(v), OPTS);
  await writeLock(FRESH_LOCK);
}

export type VerifyResult = { ok: true } | { ok: false; lockedForSec: number };
/** Checks a PIN with escalating lockouts after repeated failures. Never logs the PIN. */
export async function verifyPin(pin: string): Promise<VerifyResult> {
  const state = await readLock(); const wait = remainingLockSeconds(state, Date.now());
  if (wait > 0) return { ok: false, lockedForSec: wait };
  const v = await readVerifier(); if (!v) return { ok: true };
  if (await checkPin(pin, v, scryptKdf)) { await writeLock(afterSuccess()); return { ok: true }; }
  const next = afterFailure(state, Date.now()); await writeLock(next);
  return { ok: false, lockedForSec: remainingLockSeconds(next, Date.now()) };
}
export async function removePinData(): Promise<void> {
  await SecureStore.deleteItemAsync(KEY_V, OPTS); await SecureStore.deleteItemAsync(KEY_L, OPTS);
}
