export type SoundEvent = 'expense' | 'income' | 'savings' | 'transfer' | 'goal' | 'backup' | 'restore' | 'tap' | 'startup';

export interface FeedbackSettings {
  soundMaster: boolean; soundTransactions: boolean; soundButtons: boolean;
  soundSuccess: boolean; soundStartup: boolean; vibration: boolean;
}
export const DEFAULT_FEEDBACK: FeedbackSettings = {
  soundMaster: true, soundTransactions: true, soundButtons: false, soundSuccess: true, soundStartup: false, vibration: true,
};

const GROUP: Record<SoundEvent, keyof Omit<FeedbackSettings, 'soundMaster' | 'vibration'>> = {
  expense: 'soundTransactions', income: 'soundTransactions', savings: 'soundTransactions', transfer: 'soundTransactions',
  goal: 'soundSuccess', backup: 'soundSuccess', restore: 'soundSuccess', tap: 'soundButtons', startup: 'soundStartup',
};

export const shouldPlaySound = (s: FeedbackSettings, e: SoundEvent) => s.soundMaster && s[GROUP[e]];
/** Haptics only mark real successes; taps and startup never buzz. Independent of the sound toggles. */
export const shouldVibrate = (s: FeedbackSettings, e: SoundEvent) => s.vibration && e !== 'tap' && e !== 'startup';
