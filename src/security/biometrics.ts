import * as LocalAuthentication from 'expo-local-authentication';

export async function biometricsAvailable(): Promise<boolean> {
  try { return (await LocalAuthentication.hasHardwareAsync()) && (await LocalAuthentication.isEnrolledAsync()); } catch { return false; }
}
/** Uses the platform prompt; no biometric data ever reaches the app. */
export async function authenticateBiometric(prompt: string): Promise<boolean> {
  try { return (await LocalAuthentication.authenticateAsync({ promptMessage: prompt, cancelLabel: 'Use PIN', disableDeviceFallback: true })).success; } catch { return false; }
}
