import React from 'react';
import { Tabs } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../../src/theme';

const tab = (name: string, title: string, icon: keyof typeof Ionicons.glyphMap) =>
  <Tabs.Screen key={name} name={name} options={{ title, tabBarIcon: ({ color, size }) => <Ionicons name={icon} color={color as string} size={size} /> }} />;

export default function TabsLayout() {
  const t = useTheme();
  return (
    <Tabs screenOptions={{ headerShown: false, tabBarActiveTintColor: t.primary, tabBarInactiveTintColor: t.text2,
      tabBarStyle: { backgroundColor: t.bg, borderTopColor: t.divider } }}>
      {tab('index', 'Home', 'home-outline')}
      {tab('history', 'History', 'time-outline')}
      {tab('savings', 'Save', 'leaf-outline')}
      {tab('udhaar', 'Udhaar', 'swap-horizontal-outline')}
      {tab('settings', 'Settings', 'settings-outline')}
    </Tabs>
  );
}
