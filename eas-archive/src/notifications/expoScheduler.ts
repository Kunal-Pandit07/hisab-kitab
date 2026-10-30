import * as N from 'expo-notifications';
import { Platform } from 'react-native';
import type { Planned, PermissionStatus } from '../domain/notifications';
import type { Scheduler } from './sync';

export async function initNotifications() {
  N.setNotificationHandler({ handleNotification: async () => ({ shouldShowBanner: true, shouldShowList: true, shouldPlaySound: false, shouldSetBadge: false }) });
  if (Platform.OS === 'android') {
    await N.setNotificationChannelAsync('reminders', { name: 'Daily reminders', importance: N.AndroidImportance.DEFAULT }).catch(() => {});
    await N.setNotificationChannelAsync('alerts', { name: 'Budget and due-date alerts', importance: N.AndroidImportance.HIGH }).catch(() => {});
  }
}

export async function getPermissionState(): Promise<{ status: PermissionStatus; canAskAgain: boolean }> {
  const r = await N.getPermissionsAsync();
  return { status: r.status as PermissionStatus, canAskAgain: r.canAskAgain };
}
/** Only call after explaining the benefit, and only while status is 'undetermined'. */
export async function requestPermission() {
  const r = await N.requestPermissionsAsync();
  return { status: r.status as PermissionStatus, canAskAgain: r.canAskAgain };
}

function toTrigger(p: Planned): N.NotificationTriggerInput {
  const channelId = p.channel;
  switch (p.trigger.kind) {
    case 'daily': return { type: N.SchedulableTriggerInputTypes.DAILY, hour: p.trigger.hour, minute: p.trigger.minute, channelId };
    case 'date': return { type: N.SchedulableTriggerInputTypes.DATE, date: p.trigger.at, channelId };
    case 'now': return { channelId };
  }
}

export const expoScheduler: Scheduler = {
  async getScheduled() {
    const all = await N.getAllScheduledNotificationsAsync();
    return all.filter((r) => r.identifier.startsWith('hk:')).map((r) => ({ id: r.identifier, sig: (r.content.data as { sig?: string } | null)?.sig }));
  },
  async schedule(p) {
    await N.scheduleNotificationAsync({ identifier: p.id, content: { title: p.title, body: p.body, data: { sig: p.sig }, sound: false }, trigger: toTrigger(p) });
  },
  cancel: (id) => N.cancelScheduledNotificationAsync(id),
  async isAllowed() { return (await N.getPermissionsAsync()).granted; },
};
