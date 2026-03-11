import { useMemo, useState } from 'react';
import { RefreshControl, ScrollView, StyleSheet, View } from 'react-native';
import { Button, HStack, Text, VStack } from 'native-base';
import { LyubyshevRange, useLyubyshevReport } from '@/hooks/use-lyubyshev-report';

const ranges: { label: string; value: LyubyshevRange }[] = [
  { label: 'День', value: 'day' },
  { label: 'Неделя', value: 'week' },
  { label: 'Месяц', value: 'month' },
];

function formatMinutes(totalMinutes: number) {
  const safe = Math.max(0, Math.floor(totalMinutes));
  const h = Math.floor(safe / 60);
  const m = safe % 60;
  if (h <= 0) return `${m} мин`;
  if (m === 0) return `${h} ч`;
  return `${h} ч ${m} мин`;
}

export default function ReportsScreen() {
  const [range, setRange] = useState<LyubyshevRange>('day');
  const today = new Date();
  const { report, loading, refresh } = useLyubyshevReport(range, today);

  const dominant = useMemo(() => {
    const rows = report?.byCategory ?? [];
    if (rows.length === 0) return null;
    return [...rows].sort((a, b) => b.actualMinutes - a.actualMinutes)[0];
  }, [report]);

  const dominancePct = useMemo(() => {
    if (!dominant || !report || report.totalActual <= 0) return 0;
    return Math.round((dominant.actualMinutes / report.totalActual) * 100);
  }, [dominant, report]);

  return (
    <ScrollView
      style={styles.screen}
      contentContainerStyle={styles.content}
      refreshControl={<RefreshControl tintColor="#c4b5fd" refreshing={loading} onRefresh={refresh} />}>
      <Text style={styles.title}>Анализ</Text>
      <Text style={styles.subtitle}>Детальная страница продуктивности</Text>

      <HStack space={2} mt={1}>
        {ranges.map((r) => (
          <Button
            key={r.value}
            size="sm"
            borderRadius="full"
            bg={range === r.value ? '#7c3aed' : '#151224'}
            borderWidth={1}
            borderColor={range === r.value ? '#8b5cf6' : '#2c2642'}
            _pressed={{ bg: range === r.value ? '#6d28d9' : '#1b1730' }}
            onPress={() => setRange(r.value)}>
            {r.label}
          </Button>
        ))}
      </HStack>

      <View style={styles.bigCard}>
        <Text style={styles.cardLabel}>Факт за период</Text>
        <Text style={styles.bigValue}>{formatMinutes(report?.totalActual ?? 0)}</Text>
        <Text style={styles.cardHint}>
          {report
            ? `${new Date(report.from).toLocaleDateString()} - ${new Date(report.to).toLocaleDateString()}`
            : '—'}
        </Text>
      </View>

      <HStack space={3}>
        <View style={[styles.smallCard, styles.half]}>
          <Text style={styles.cardLabel}>Категории</Text>
          <Text style={styles.smallValue}>{report?.byCategory.length ?? 0}</Text>
          <Text style={styles.cardHint}>с активностью</Text>
        </View>
        <View style={[styles.smallCard, styles.half]}>
          <Text style={styles.cardLabel}>Доминирует</Text>
          <Text style={styles.smallValue}>{dominancePct}%</Text>
          <Text style={styles.cardHint}>{dominant?.name ?? '—'}</Text>
        </View>
      </HStack>

      <View style={styles.listCard}>
        <Text style={styles.sectionTitle}>По категориям</Text>
        <VStack space={2} mt={2}>
          {(report?.byCategory ?? []).map((item) => (
            <HStack key={item.categoryId} justifyContent="space-between" alignItems="center" style={styles.row}>
              <VStack>
                <Text style={styles.rowTitle}>{item.name}</Text>
                <Text style={styles.rowHint}>План: {formatMinutes(item.plannedMinutes)}</Text>
              </VStack>
              <Text style={styles.rowValue}>{formatMinutes(item.actualMinutes)}</Text>
            </HStack>
          ))}
          {!report || report.byCategory.length === 0 ? (
            <Text style={styles.empty}>Пока нет данных за период</Text>
          ) : null}
        </VStack>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#090912' },
  content: { padding: 16, paddingTop: 18, paddingBottom: 36, gap: 12 },
  title: { color: '#f5f5ff', fontSize: 34, fontWeight: '700' },
  subtitle: { color: '#9f96c2', fontSize: 13 },

  bigCard: {
    borderWidth: 1,
    borderColor: '#2b2541',
    borderRadius: 18,
    backgroundColor: '#141223',
    padding: 14,
  },
  cardLabel: { color: '#b8aed7', fontSize: 12, fontWeight: '600' },
  bigValue: { color: '#f5f3ff', fontSize: 34, lineHeight: 38, fontWeight: '800', marginTop: 4 },
  cardHint: { color: '#8d84ae', fontSize: 12, marginTop: 2 },

  smallCard: {
    borderWidth: 1,
    borderColor: '#2b2541',
    borderRadius: 16,
    backgroundColor: '#121020',
    padding: 12,
  },
  half: { flex: 1 },
  smallValue: { color: '#ddd6fe', fontSize: 24, lineHeight: 28, fontWeight: '700', marginTop: 2 },

  listCard: {
    borderWidth: 1,
    borderColor: '#2b2541',
    borderRadius: 16,
    backgroundColor: '#121020',
    padding: 12,
  },
  sectionTitle: { color: '#e9e5ff', fontSize: 16, fontWeight: '700' },
  row: {
    borderWidth: 1,
    borderColor: '#26213b',
    borderRadius: 12,
    backgroundColor: '#0f0d1a',
    paddingVertical: 9,
    paddingHorizontal: 10,
  },
  rowTitle: { color: '#f5f3ff', fontSize: 14, fontWeight: '600' },
  rowHint: { color: '#8d84ae', fontSize: 11 },
  rowValue: { color: '#c4b5fd', fontSize: 14, fontWeight: '700' },
  empty: { color: '#8d84ae', fontSize: 13, textAlign: 'center', paddingVertical: 10 },
});
