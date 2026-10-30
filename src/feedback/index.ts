import * as Haptics from 'expo-haptics';
import { DEFAULT_FEEDBACK, FeedbackSettings, shouldVibrate, SoundEvent } from '../domain/feedback';
import { createSoundService } from '../audio/soundService';
import { expoBackend } from '../audio/expoBackend';
import { EventChooser, runWithFeedback as run } from './runWithFeedback';

let current: () => FeedbackSettings = () => DEFAULT_FEEDBACK;
/** Root layout points this at the live settings. */
export const configureFeedback = (get: () => FeedbackSettings) => { current = get; };

export const sounds = createSoundService(expoBackend, () => current());

export function fireFeedback(event: SoundEvent) {
  sounds.play(event);
  if (shouldVibrate(current(), event)) Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
}

/** Wrap a DB write: feedback plays only after it has committed. */
export const runWithFeedback = <T,>(op: () => Promise<T>, event: EventChooser<T>) => run(op, event, fireFeedback);
