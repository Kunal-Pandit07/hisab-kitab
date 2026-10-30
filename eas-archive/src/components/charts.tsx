import React from 'react';
import { Text, View } from 'react-native';
import { barScale } from '../domain/reports';
import { space, useTheme } from '../theme';

export interface BarItem { label: string; valueText: string; percent: number; color?: string }

/** Horizontal bars with the value always written out, so the chart is never the only source of information. */
export function HBars({ items }: { items: BarItem[] }) {
  const t = useTheme();
  return (
    <View>
      {items.map((it) => (
        <View key={it.label} style={{ marginBottom: space.sm }} accessible accessibilityLabel={`${it.label}: ${it.valueText}`}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
            <Text style={{ color: t.text, fontSize: 14, flexShrink: 1 }} numberOfLines={1}>{it.label}</Text>
            <Text style={{ color: t.text2, fontSize: 13, marginLeft: 8 }}>{it.valueText}</Text>
          </View>
          <View style={{ height: 8, borderRadius: 4, backgroundColor: t.divider, marginTop: 4, overflow: 'hidden' }}>
            <View style={{ width: `${Math.min(100, Math.max(0, it.percent))}%`, height: 8, backgroundColor: it.color ?? t.primary }} />
          </View>
        </View>))}
    </View>
  );
}

/** Compact column chart that fits a month of days on a small phone. */
export function VBars({ values, firstLabel, lastLabel, color, summary }: { values: number[]; firstLabel: string; lastLabel: string; color?: string; summary: string }) {
  const t = useTheme(); const scaled = barScale(values);
  return (
    <View accessible accessibilityLabel={summary}>
      <View style={{ flexDirection: 'row', alignItems: 'flex-end', height: 90, gap: values.length > 40 ? 1 : 2 }}>
        {scaled.map((h, i) => <View key={i} style={{ flex: 1, height: `${Math.max(h, 1)}%`, backgroundColor: h === 0 ? t.divider : color ?? t.primary, borderRadius: 2 }} />)}
      </View>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: 4 }}>
        <Text style={{ color: t.text2, fontSize: 11 }}>{firstLabel}</Text><Text style={{ color: t.text2, fontSize: 11 }}>{lastLabel}</Text>
      </View>
    </View>
  );
}
