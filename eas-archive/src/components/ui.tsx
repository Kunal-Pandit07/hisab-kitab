import React, { useEffect } from 'react';
import { Pressable, StyleSheet, Text, TextInput, TextInputProps, View, ViewStyle, ScrollView, KeyboardAvoidingView, Platform } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Animated, { useAnimatedStyle, useReducedMotion, useSharedValue, withTiming } from 'react-native-reanimated';
import { sounds } from '../feedback';
import { radius, space, useTheme } from '../theme';

export function Screen({ children, scroll = true, pad = true }: { children: React.ReactNode; scroll?: boolean; pad?: boolean }) {
  const t = useTheme();
  const inner = pad ? { padding: space.md, paddingBottom: space.xl * 2 } : undefined;
  return (
    <SafeAreaView edges={['top']} style={{ flex: 1, backgroundColor: t.bg }}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        {scroll ? <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={inner}>{children}</ScrollView>
                : <View style={[{ flex: 1 }, inner]}>{children}</View>}
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

export function Card({ children, style }: { children: React.ReactNode; style?: ViewStyle }) {
  const t = useTheme();
  return <View style={[{ backgroundColor: t.bg2, borderRadius: radius.md, padding: space.md, borderWidth: StyleSheet.hairlineWidth, borderColor: t.divider }, style]}>{children}</View>;
}

export function H1({ children }: { children: React.ReactNode }) {
  const t = useTheme(); return <Text accessibilityRole="header" style={{ fontSize: 26, fontWeight: '700', color: t.text, marginBottom: space.md }}>{children}</Text>;
}
export function Label({ children }: { children: React.ReactNode }) {
  const t = useTheme(); return <Text style={{ fontSize: 13, color: t.text2, marginBottom: 6, marginTop: space.md }}>{children}</Text>;
}
export function Body({ children, muted, style }: { children: React.ReactNode; muted?: boolean; style?: object }) {
  const t = useTheme(); return <Text style={[{ fontSize: 15, color: muted ? t.text2 : t.text }, style]}>{children}</Text>;
}

export function Button({ title, onPress, disabled, variant = 'primary', loading }: {
  title: string; onPress: () => void; disabled?: boolean; loading?: boolean; variant?: 'primary' | 'ghost' | 'danger' }) {
  const t = useTheme(); const reduce = useReducedMotion();
  const scale = useSharedValue(1);
  const anim = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));
  const off = disabled || loading;
  const bg = variant === 'primary' ? t.primary : 'transparent';
  const fg = variant === 'primary' ? t.onPrimary : variant === 'danger' ? t.expense : t.primary;
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={title} accessibilityState={{ disabled: !!off }} disabled={off}
      onPressIn={() => { if (!reduce) scale.value = withTiming(0.97, { duration: 90 }); }}
      onPressOut={() => { scale.value = withTiming(1, { duration: 120 }); }}
      onPress={() => { sounds.play('tap'); onPress(); }}>
      <Animated.View style={[{ minHeight: 48, borderRadius: radius.md, alignItems: 'center', justifyContent: 'center', backgroundColor: bg,
        opacity: off ? 0.5 : 1, paddingHorizontal: space.md, borderWidth: variant === 'ghost' ? 1 : 0, borderColor: t.divider }, anim]}>
        <Text style={{ color: fg, fontWeight: '600', fontSize: 16 }}>{loading ? 'Saving…' : title}</Text>
      </Animated.View>
    </Pressable>
  );
}

export function Field(props: TextInputProps & { error?: string }) {
  const t = useTheme();
  return (
    <View>
      <TextInput placeholderTextColor={t.text2} {...props}
        style={[{ minHeight: 48, borderRadius: radius.sm, borderWidth: 1, borderColor: props.error ? t.expense : t.divider,
          paddingHorizontal: space.md, color: t.text, backgroundColor: t.bg, fontSize: 16 }, props.style]} />
      {props.error ? <Text style={{ color: t.expense, fontSize: 13, marginTop: 4 }}>{props.error}</Text> : null}
    </View>
  );
}

export function Chips<T extends string>({ options, value, onChange }: {
  options: { value: T; label: string }[]; value: T | null; onChange: (v: T) => void }) {
  const t = useTheme();
  return (
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space.sm }}>
      {options.map((o) => {
        const on = o.value === value;
        return (
          <Pressable key={o.value} onPress={() => onChange(o.value)} accessibilityRole="button"
            accessibilityState={{ selected: on }}
            style={{ paddingHorizontal: 14, minHeight: 40, justifyContent: 'center', borderRadius: 20,
              backgroundColor: on ? t.primary : t.bg2, borderWidth: 1, borderColor: on ? t.primary : t.divider }}>
            <Text style={{ color: on ? t.onPrimary : t.text, fontSize: 14 }}>{o.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

export function ProgressBar({ percent, over }: { percent: number; over?: boolean }) {
  const t = useTheme(); const reduce = useReducedMotion();
  const clamped = Math.min(100, Math.max(0, percent));
  const w = useSharedValue(reduce ? clamped : 0);
  useEffect(() => { w.value = reduce ? clamped : withTiming(clamped, { duration: 250 }); }, [clamped, reduce, w]);
  const fill = useAnimatedStyle(() => ({ width: `${w.value}%` }));
  return (
    <View accessibilityRole="progressbar" accessibilityValue={{ min: 0, max: 100, now: clamped }}
      style={{ height: 8, borderRadius: 4, backgroundColor: t.divider, overflow: 'hidden', marginVertical: 6 }}>
      <Animated.View style={[{ height: 8, backgroundColor: over ? t.expense : t.primary }, fill]} />
    </View>
  );
}
