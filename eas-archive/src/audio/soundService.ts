import { FeedbackSettings, shouldPlaySound, SoundEvent } from '../domain/feedback';

export interface SoundPlayer { replay(): void | Promise<void>; dispose(): void }
export interface SoundBackend { create(event: SoundEvent): SoundPlayer }

/**
 * Plays short effects. play() NEVER throws: audio problems must not affect financial operations.
 * Repeats of the same event inside minGapMs are dropped, and a player restarts instead of stacking.
 */
export function createSoundService(backend: SoundBackend, getSettings: () => FeedbackSettings, opts: { now?: () => number; minGapMs?: number } = {}) {
  const now = opts.now ?? Date.now; const minGap = opts.minGapMs ?? 150;
  const players = new Map<SoundEvent, SoundPlayer>(); const lastAt = new Map<SoundEvent, number>();

  function play(event: SoundEvent, o: { force?: boolean } = {}): boolean {
    try {
      if (!o.force && !shouldPlaySound(getSettings(), event)) return false;
      const t = now();
      if (t - (lastAt.get(event) ?? -Infinity) < minGap) return false;
      lastAt.set(event, t);
      let p = players.get(event);
      if (!p) { p = backend.create(event); players.set(event, p); }
      const r = p.replay();
      if (r && typeof (r as Promise<void>).catch === 'function') (r as Promise<void>).catch(() => { players.delete(event); });
      return true;
    } catch {
      players.delete(event); // rebuild next time
      return false;
    }
  }
  function dispose() {
    for (const p of players.values()) { try { p.dispose(); } catch { /* ignore */ } }
    players.clear(); lastAt.clear();
  }
  return { play, dispose };
}
