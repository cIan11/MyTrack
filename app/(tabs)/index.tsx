import { Link } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { RefreshControl, ScrollView, StyleSheet, View } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { Button, HStack, Text, VStack } from 'native-base';
import { API_BASE_URL } from '@/constants/api';
import { useDashboard } from '@/hooks/use-dashboard';

type TimeEntryLite = {
  categoryId: number;
  taskId?: number | null;
  durationMinutes?: number | null;
  startTime?: string;
  endTime?: string | null;
  category?: {
    id: number;
    name: string;
    color: string;
  };
};

type HomeTimeStats = {
  focusMinutes: number;
  avgMinutesPerTask: number;
  topCategoryName: string;
  topCategoryMinutes: number;
  uniqueTaskCount: number;
};

function formatMinutes(totalMinutes: number) {
  const safe = Math.max(0, Math.floor(totalMinutes));
  const h = Math.floor(safe / 60);
  const m = safe % 60;
  if (h <= 0) return `${m} мин`;
  if (m === 0) return `${h} ч`;
  return `${h} ч ${m} мин`;
}

function toMinutes(entry: TimeEntryLite) {
  if (typeof entry.durationMinutes === 'number') return Math.max(0, entry.durationMinutes);
  if (!entry.startTime || !entry.endTime) return 0;
  const start = new Date(entry.startTime).getTime();
  const end = new Date(entry.endTime).getTime();
  if (Number.isNaN(start) || Number.isNaN(end) || end <= start) return 0;
  return Math.floor((end - start) / 60000);
}

export default function HomeScreen() {
  const today = useMemo(() => new Date(), []);
  const { summary, loading, error, refresh } = useDashboard(today);

  const [stats, setStats] = useState<HomeTimeStats>({
    focusMinutes: 0,
    avgMinutesPerTask: 0,
    topCategoryName: '—',
    topCategoryMinutes: 0,
    uniqueTaskCount: 0,
  });
  const [refreshing, setRefreshing] = useState(false);

  const fetchTimeStats = useCallback(async () => {
    const date = today.toISOString().slice(0, 10);
    const res = await fetch(`${API_BASE_URL}/api/time-entries?date=${date}`);
    if (!res.ok) {
      throw new Error(await res.text());
    }

    const entries: TimeEntryLite[] = await res.json();
    const taskEntries = entries.filter((e) => e.taskId != null);

    const focusMinutes = taskEntries.reduce((acc, e) => acc + toMinutes(e), 0);

    const uniqueTaskIds = new Set(taskEntries.map((e) => e.taskId as number));
    const uniqueTaskCount = uniqueTaskIds.size;
    const avgMinutesPerTask = uniqueTaskCount > 0 ? Math.round(focusMinutes / uniqueTaskCount) : 0;

    const byCategory = new Map<string, number>();
    for (const e of taskEntries) {
      const key = e.category?.name || 'Без категории';
      byCategory.set(key, (byCategory.get(key) ?? 0) + toMinutes(e));
    }

    let topCategoryName = '—';
    let topCategoryMinutes = 0;
    for (const [name, minutes] of byCategory.entries()) {
      if (minutes > topCategoryMinutes) {
        topCategoryName = name;
        topCategoryMinutes = minutes;
      }
    }

    setStats({
      focusMinutes,
      avgMinutesPerTask,
      topCategoryName,
      topCategoryMinutes,
      uniqueTaskCount,
    });
  }, [today]);

  const refreshAll = useCallback(async () => {
    setRefreshing(true);
    try {
      await Promise.all([refresh(), fetchTimeStats()]);
    } finally {
      setRefreshing(false);
    }
  }, [refresh, fetchTimeStats]);

  useEffect(() => {
    void fetchTimeStats();
  }, [fetchTimeStats]);

  return (
    <ScrollView
      style={styles.screen}
      contentContainerStyle={styles.content}
      refreshControl={<RefreshControl tintColor="#c4b5fd" refreshing={refreshing || loading} onRefresh={refreshAll} />}>
      <VStack space={1}>
        <Text style={styles.title}>Home</Text>
        <Text style={styles.subtitle}>Краткая сводка дня без перегруза</Text>
      </VStack>

      {error ? (
        <View style={styles.errorCard}>
          <Text style={styles.errorText}>{error}</Text>
        </View>
      ) : null}

      <View style={styles.bigCard}>
        <HStack justifyContent="space-between" alignItems="center">
          <Text style={styles.cardLabel}>Фокус сегодня</Text>
          <MaterialCommunityIcons name="clock-time-four-outline" size={18} color="#c4b5fd" />
        </HStack>
        <Text style={styles.bigValue}>{formatMinutes(stats.focusMinutes)}</Text>
        <Text style={styles.cardHint}>Время на задачах с таймера</Text>
      </View>

      <HStack space={3}>
        <View style={[styles.smallCard, styles.half]}>
          <Text style={styles.cardLabel}>Задачи</Text>
          <Text style={styles.smallValue}>
            {summary?.tasks.done ?? 0}/{summary?.tasks.total ?? 0}
          </Text>
          <Text style={styles.cardHint}>Выполнено</Text>
        </View>

        <View style={[styles.smallCard, styles.half]}>
          <Text style={styles.cardLabel}>Среднее</Text>
          <Text style={styles.smallValue}>{formatMinutes(stats.avgMinutesPerTask)}</Text>
          <Text style={styles.cardHint}>на задачу ({stats.uniqueTaskCount})</Text>
        </View>
      </HStack>

      <View style={styles.smallCard}>
        <HStack justifyContent="space-between" alignItems="center">
          <VStack>
            <Text style={styles.cardLabel}>Топ категория дня</Text>
            <Text style={styles.categoryName}>{stats.topCategoryName}</Text>
          </VStack>
          <Text style={styles.categoryMinutes}>{formatMinutes(stats.topCategoryMinutes)}</Text>
        </HStack>
      </View>

      <VStack space={2} mt={1}>
        <Link href="/(tabs)/time-tracker" asChild>
          <Button bg="#7c3aed" _pressed={{ bg: '#6d28d9' }} borderRadius="full">
            Старт таймера
          </Button>
        </Link>
        <Link href="/(tabs)/planner" asChild>
          <Button variant="outline" borderColor="#3a3257" _text={{ color: '#ddd6fe' }} borderRadius="full">
            Открыть задачи
          </Button>
        </Link>
        <Link href="/(tabs)/reports" asChild>
          <Button variant="ghost" _text={{ color: '#c4b5fd' }}>
            Подробный анализ
          </Button>
        </Link>
      </VStack>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#090912' },
  content: { padding: 16, paddingTop: 18, paddingBottom: 34, gap: 12 },
  title: { color: '#f5f5ff', fontSize: 34, fontWeight: '700' },
  subtitle: { color: '#9f96c2', fontSize: 13 },

  errorCard: {
    borderWidth: 1,
    borderColor: '#5b2039',
    backgroundColor: '#2b1120',
    borderRadius: 12,
    padding: 10,
  },
  errorText: { color: '#fecaca', fontSize: 12 },

  bigCard: {
    borderWidth: 1,
    borderColor: '#2b2541',
    borderRadius: 18,
    backgroundColor: '#141223',
    padding: 14,
  },
  cardLabel: { color: '#b8aed7', fontSize: 12, fontWeight: '600' },
  bigValue: {
    color: '#f5f3ff',
    fontSize: 34,
    lineHeight: 38,
    fontWeight: '800',
    marginTop: 4,
  },
  cardHint: { color: '#8d84ae', fontSize: 12, marginTop: 2 },

  smallCard: {
    borderWidth: 1,
    borderColor: '#2b2541',
    borderRadius: 16,
    backgroundColor: '#121020',
    padding: 12,
  },
  half: { flex: 1 },
  smallValue: {
    color: '#ddd6fe',
    fontSize: 24,
    lineHeight: 28,
    fontWeight: '700',
    marginTop: 2,
  },

  categoryName: { color: '#f5f3ff', fontSize: 18, fontWeight: '700', marginTop: 1 },
  categoryMinutes: { color: '#c4b5fd', fontSize: 15, fontWeight: '700' },
});
