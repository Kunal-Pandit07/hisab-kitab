import { createAudioPlayer, setAudioModeAsync } from 'expo-audio';
import type { SoundBackend } from './soundService';
import type { SoundEvent } from '../domain/feedback';

// Placeholder tones generated for this project. Swap the files (same names) for final sound design.
const SOURCES: Record<SoundEvent, number> = {
  expense: require('../../assets/sounds/expense.wav'),
  income: require('../../assets/sounds/income.wav'),
  savings: require('../../assets/sounds/savings.wav'),
  transfer: require('../../assets/sounds/transfer.wav'),
  goal: require('../../assets/sounds/goal.wav'),
  backup: require('../../assets/sounds/backup.wav'),
  restore: require('../../assets/sounds/restore.wav'),
  tap: require('../../assets/sounds/tap.wav'),
  startup: require('../../assets/sounds/startup.wav'),
};

/** Respect the device's silent/mute switch (playsInSilentMode: false) and don't interrupt the user's music. */
export function initAudioMode() {
  return setAudioModeAsync({ playsInSilentMode: false, interruptionMode: 'mixWithOthers' }).catch(() => {});
}

export const expoBackend: SoundBackend = {
  create(event) {
    const p = createAudioPlayer(SOURCES[event]);
    p.volume = 1;
    return {
      replay: () => p.seekTo(0).then(() => p.play(), () => p.play()),
      dispose: () => p.remove(),
    };
  },
};
