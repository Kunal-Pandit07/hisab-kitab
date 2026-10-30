import React from 'react';
import { Pressable, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { formatPaise } from '../domain/money';
import type { TxnRow } from '../db/repositories/transactions';
import { dayLabel } from '../utils/dates';
import { space, useTheme } from '../theme';

export function TxnItem({ row, hide }: { row: TxnRow; hide?: boolean }) {
  const t = useTheme(); const router = useRouter();
  const color = row.type === 'income' ? t.income : row.type === 'expense' ? t.expense : t.text2;
  const sign = row.type === 'income' ? '+' : row.type === 'expense' ? '-' : '';
  const title = row.description || row.categoryName || (row.type === 'transfer' ? 'Transfer' : 'Transaction');
  const sub = row.type === 'transfer' ? `${row.accountName} → ${row.toAccountName}` : `${row.accountName} · ${dayLabel(row.occurredAt)}`;
  const amount = hide ? '₹ ••••' : `${sign}${formatPaise(row.amountPaise)}`;
  return (
    <Pressable onPress={() => router.push(`/transactions/${row.id}`)} accessibilityRole="button"
      accessibilityLabel={`${title}, ${row.type}, ${amount}`}
      style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: t.divider, gap: space.md }}>
      <View style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: t.mint, alignItems: 'center', justifyContent: 'center' }}>
        <Ionicons name={(row.type === 'transfer' ? 'swap-horizontal-outline' : (row.categoryIcon ?? 'ellipse-outline')) as any} size={20} color={t.primary} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={{ color: t.text, fontSize: 15 }} numberOfLines={1}>{title}</Text>
        <Text style={{ color: t.text2, fontSize: 12 }} numberOfLines={1}>{sub}</Text>
      </View>
      <Text style={{ color, fontWeight: '600' }}>{amount}</Text>
    </Pressable>
  );
}
