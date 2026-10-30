import type { SoundEvent } from '../domain/feedback';

export type EventChooser<T> = SoundEvent | null | ((result: T) => SoundEvent | null);

/**
 * Runs a financial operation and only AFTER it resolves (i.e. the DB transaction committed) fires feedback.
 * - If the operation throws, no feedback fires and the error propagates untouched.
 * - If feedback itself throws, the committed result is still returned.
 */
export async function runWithFeedback<T>(op: () => Promise<T>, event: EventChooser<T>, fire: (e: SoundEvent) => void): Promise<T> {
  const result = await op();
  try {
    const e = typeof event === 'function' ? event(result) : event;
    if (e) fire(e);
  } catch { /* audio/haptics must never undo or fail a committed write */ }
  return result;
}
