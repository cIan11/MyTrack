import { MaterialCommunityIcons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useIsFocused } from '@react-navigation/native';
import {
  FlatList,
  Modal,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { HStack, Text, VStack } from 'native-base';
import { SafeAreaView } from 'react-native-safe-area-context';
import { API_BASE_URL } from '@/constants/api';
import { useTasks, tasksWithSubtasks, type TaskFilter } from '@/hooks/use-tasks';

const FILTERS: { value: TaskFilter; label: string }[] = [
  { value: 'today', label: 'Сегодня' },
  { value: 'done', label: 'Готовые' },
  { value: 'all', label: 'Все' },
];

const PRIORITY_COLORS: Record<number, string> = {
  0: '#8f8faa',
  1: '#34d399',
  2: '#f59e0b',
  3: '#ef5d68',
};

type SortMode = 'priority' | 'deadline';

function formatMinutes(totalMinutes: number) {
  const safe = Math.max(0, Math.floor(totalMinutes));
  const hours = Math.floor(safe / 60);
  const minutes = safe % 60;
  if (hours <= 0) return `${minutes} мин`;
  if (minutes === 0) return `${hours} ч`;
  return `${hours} ч ${minutes} мин`;
}

function compareByDeadline(a: string | null | undefined, b: string | null | undefined) {
  if (!a && !b) return 0;
  if (!a) return 1;
  if (!b) return -1;
  return new Date(a).getTime() - new Date(b).getTime();
}

function isSameDayYmd(dateIso: string | null | undefined, ymd: string) {
  if (!dateIso) return true;
  return dateIso.slice(0, 10) === ymd;
}

export default function PlannerScreen() {
  const isFocused = useIsFocused();
  const didInitialFocusSyncRef = useRef(false);
  const today = useMemo(() => new Date(), []);
  const todayYmd = today.toISOString().slice(0, 10);

  const [filter, setFilter] = useState<TaskFilter>('today');
  const [sortMode, setSortMode] = useState<SortMode>('priority');
  const [sortOpen, setSortOpen] = useState(false);

  const { tasks, loading, addTask, toggleTask, refresh } = useTasks(today, 'all');

  const groupedAll = useMemo(() => tasksWithSubtasks(tasks), [tasks]);
  const groupedFiltered = useMemo(() => {
    if (filter === 'all') return groupedAll;
    if (filter === 'done') {
      return groupedAll.filter((g) => g.root.status === 'done');
    }
    return groupedAll.filter((g) => g.root.status !== 'done' && isSameDayYmd(g.root.date, todayYmd));
  }, [groupedAll, filter, todayYmd]);

  const sortedGrouped = useMemo(() => {
    const list = [...groupedFiltered];
    if (sortMode === 'priority') {
      list.sort((a, b) => {
        if (b.root.priority !== a.root.priority) return b.root.priority - a.root.priority;
        return compareByDeadline(a.root.dueDate, b.root.dueDate);
      });
    } else {
      list.sort((a, b) => {
        const byDeadline = compareByDeadline(a.root.dueDate, b.root.dueDate);
        if (byDeadline !== 0) return byDeadline;
        return b.root.priority - a.root.priority;
      });
    }
    return list;
  }, [groupedFiltered, sortMode]);

  const [expanded, setExpanded] = useState<Record<number, boolean>>({});
  const [title, setTitle] = useState('');
  const [spentMinutes, setSpentMinutes] = useState(0);
  const [taskSpentMap, setTaskSpentMap] = useState<Record<number, number>>({});

  const todayRoots = groupedAll.filter((g) => isSameDayYmd(g.root.date, todayYmd));
  const doneCount = todayRoots.filter((g) => g.root.status === 'done').length;
  const totalCount = todayRoots.length;
  const remainingCount = Math.max(totalCount - doneCount, 0);

  const fetchSpentToday = useCallback(async () => {
    try {
      const date = today.toISOString().slice(0, 10);
      const res = await fetch(`${API_BASE_URL}/api/time-entries?date=${date}`);
      if (!res.ok) {
        console.error('Failed to load time entries', await res.text());
        return;
      }
      const data = await res.json();
      const entries: {
        taskId?: number | null;
        durationMinutes?: number | null;
        startTime?: string;
        endTime?: string;
      }[] = Array.isArray(data) ? data : [];
      const byTask: Record<number, number> = {};
      const sum = entries.reduce((acc: number, e) => {
        if (!e || e.taskId == null) return acc;
        if (typeof e.durationMinutes === 'number') {
          byTask[e.taskId] = (byTask[e.taskId] ?? 0) + e.durationMinutes;
          return acc + e.durationMinutes;
        }
        if (e.startTime && e.endTime) {
          const s = new Date(e.startTime).getTime();
          const en = new Date(e.endTime).getTime();
          if (!Number.isNaN(s) && !Number.isNaN(en) && en > s) {
            const minutes = Math.floor((en - s) / 60000);
            byTask[e.taskId] = (byTask[e.taskId] ?? 0) + minutes;
            return acc + minutes;
          }
        }
        return acc;
      }, 0);
      setSpentMinutes(sum);
      setTaskSpentMap(byTask);
    } catch (e) {
      console.error('Failed to fetch spent time', e);
    }
  }, [today]);

  useEffect(() => {
    fetchSpentToday();
  }, [tasks.length, fetchSpentToday]);

  useEffect(() => {
    if (!isFocused) {
      didInitialFocusSyncRef.current = false;
      return;
    }
    if (didInitialFocusSyncRef.current) return;
    didInitialFocusSyncRef.current = true;
    void (async () => {
      await refresh();
      await fetchSpentToday();
    })();
    // intentionally run only once per focus entry to avoid refresh loops
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isFocused]);

  const handleCreate = async () => {
    const taskTitle = title.trim();
    if (!taskTitle) return;
    await addTask(taskTitle);
    setTitle('');
  };

  const toggleExpanded = (id: number) => {
    setExpanded((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  const openTimerForTask = (taskId: number, categoryId?: number | null, taskTitle?: string) => {
    router.push({
      pathname: '/(tabs)/time-tracker',
      params: {
        taskId: String(taskId),
        ...(taskTitle ? { taskTitle } : {}),
        ...(categoryId ? { categoryId: String(categoryId) } : {}),
      },
    });
  };

  return (
    <SafeAreaView style={styles.safeArea} edges={['top']}>
      <View style={styles.screen}>
        <FlatList
          data={sortedGrouped}
          keyExtractor={(item) => item.root.id.toString()}
          contentContainerStyle={styles.content}
          onRefresh={async () => {
            await refresh();
            await fetchSpentToday();
          }}
          refreshing={loading}
          ListHeaderComponent={
            <VStack space={4}>
              <HStack alignItems="center" justifyContent="space-between">
                <Text style={styles.title}>Сегодня</Text>
                <TouchableOpacity style={styles.sortBtn} onPress={() => setSortOpen(true)}>
                  <MaterialCommunityIcons name="sort" size={18} color="#c9c5df" />
                </TouchableOpacity>
              </HStack>

              <View style={styles.statsCard}>
                <HStack justifyContent="space-between">
                  <VStack style={styles.statCol}>
                    <Text style={styles.statsValue}>{doneCount}</Text>
                    <Text style={styles.statsLabel}>Выполнено</Text>
                  </VStack>
                  <VStack style={styles.statCol}>
                    <Text style={styles.statsValue}>{remainingCount}</Text>
                    <Text style={styles.statsLabel}>Осталось</Text>
                  </VStack>
                  <VStack style={styles.statCol}>
                    <Text style={styles.statsValue}>{formatMinutes(spentMinutes)}</Text>
                    <Text style={styles.statsLabel}>Потрачено</Text>
                  </VStack>
                </HStack>
              </View>

              <View style={styles.addCard}>
                <HStack alignItems="center" space={2}>
                  <MaterialCommunityIcons name="plus" size={20} color="#8b8ba3" />
                  <TextInput
                    style={styles.input}
                    placeholder="Добавить задачу..."
                    placeholderTextColor="#7f7f95"
                    value={title}
                    onChangeText={setTitle}
                    onSubmitEditing={handleCreate}
                    returnKeyType="done"
                  />
                </HStack>
              </View>

              <HStack space={2}>
                {FILTERS.map((f) => (
                  <TouchableOpacity
                    key={f.value}
                    style={[styles.filterChip, filter === f.value ? styles.filterChipActive : null]}
                    onPress={() => setFilter(f.value)}>
                    <Text style={filter === f.value ? styles.filterTextActive : styles.filterText}>{f.label}</Text>
                  </TouchableOpacity>
                ))}
              </HStack>
            </VStack>
          }
          ListEmptyComponent={<Text style={styles.empty}>Нет задач</Text>}
          renderItem={({ item }) => {
            const hasSubtasks = item.subtasks.length > 0;
            const isOpen = !!expanded[item.root.id];
            const rootColor = PRIORITY_COLORS[item.root.priority] ?? PRIORITY_COLORS[0];
            return (
              <VStack style={styles.taskWrap}>
                <HStack style={styles.taskRow} alignItems="center">
                  <TouchableOpacity onPress={() => toggleTask(item.root)} style={styles.circleBtn}>
                    <Text style={[styles.circleText, { color: rootColor }]}>{item.root.status === 'done' ? '●' : '○'}</Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={styles.taskMain}
                    onPress={() => router.push(`/task/${item.root.id}`)}>
                    <Text style={[styles.taskTitle, item.root.status === 'done' ? styles.taskDone : null]} numberOfLines={1}>
                      {item.root.title}
                    </Text>
                    <Text style={styles.spentText}>
                      {taskSpentMap[item.root.id] ? `сегодня: ${formatMinutes(taskSpentMap[item.root.id])}` : 'сегодня: 0 мин'}
                    </Text>
                    {item.root.dueDate ? (
                      <Text style={styles.deadlineText}>до {new Date(item.root.dueDate).toLocaleDateString()}</Text>
                    ) : null}
                  </TouchableOpacity>

                  <HStack alignItems="center" space={1}>
                    <TouchableOpacity
                      onPress={() => openTimerForTask(item.root.id, item.root.taskCategoryId ?? null, item.root.title)}
                      style={styles.playBtn}>
                      <MaterialCommunityIcons name="play" size={14} color="#d8ccff" />
                    </TouchableOpacity>
                    {hasSubtasks ? (
                      <TouchableOpacity onPress={() => toggleExpanded(item.root.id)} style={styles.expandBtn}>
                        <MaterialCommunityIcons
                          name={isOpen ? 'chevron-down' : 'chevron-right'}
                          size={20}
                          color="#8c8cad"
                        />
                      </TouchableOpacity>
                    ) : (
                      <View style={styles.expandBtn} />
                    )}
                  </HStack>
                </HStack>

                {hasSubtasks && isOpen && (
                  <VStack style={styles.subtasksWrap}>
                    {item.subtasks.map((sub) => (
                      <HStack key={sub.id} alignItems="center" style={styles.subtaskRow}>
                        <TouchableOpacity onPress={() => toggleTask(sub)} style={styles.circleBtn}>
                          <Text style={[styles.circleText, { color: PRIORITY_COLORS[0] }]}>{sub.status === 'done' ? '●' : '○'}</Text>
                        </TouchableOpacity>
                        <TouchableOpacity style={styles.taskMain} onPress={() => router.push(`/task/${sub.id}`)}>
                          <Text style={[styles.subtaskTitle, sub.status === 'done' ? styles.taskDone : null]} numberOfLines={1}>
                            {sub.title}
                          </Text>
                        </TouchableOpacity>
                      </HStack>
                    ))}
                  </VStack>
                )}
              </VStack>
            );
          }}
        />

        <Modal visible={sortOpen} transparent animationType="fade">
          <TouchableOpacity style={styles.modalOverlay} activeOpacity={1} onPress={() => setSortOpen(false)}>
            <TouchableOpacity style={styles.sortModal} activeOpacity={1} onPress={(e) => e.stopPropagation()}>
              <Text style={styles.sortModalTitle}>Сортировка</Text>
              <TouchableOpacity
                style={[styles.sortOption, sortMode === 'priority' ? styles.sortOptionActive : null]}
                onPress={() => {
                  setSortMode('priority');
                  setSortOpen(false);
                }}>
                <Text style={styles.sortOptionText}>По приоритету</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.sortOption, sortMode === 'deadline' ? styles.sortOptionActive : null]}
                onPress={() => {
                  setSortMode('deadline');
                  setSortOpen(false);
                }}>
                <Text style={styles.sortOptionText}>По дедлайну</Text>
              </TouchableOpacity>
            </TouchableOpacity>
          </TouchableOpacity>
        </Modal>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: '#090912' },
  screen: { flex: 1, backgroundColor: '#090912' },
  content: { padding: 16, paddingTop: 38, paddingBottom: 30, gap: 10 },
  title: { color: '#f5f5ff', fontSize: 34, lineHeight: 46, fontWeight: '700', paddingTop: 2 },
  sortBtn: {
    width: 34,
    height: 34,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: '#2f2f44',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#131321',
  },
  statsCard: {
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#232337',
    backgroundColor: '#11111d',
    paddingVertical: 14,
    paddingHorizontal: 10,
  },
  statsValue: {
    color: '#ef5d68',
    fontSize: 24,
    lineHeight: 30,
    fontWeight: '700',
    textAlign: 'center',
    minHeight: 30,
  },
  statsLabel: { color: '#8c8ca3', fontSize: 12, textAlign: 'center', marginTop: 2 },
  statCol: { flex: 1, alignItems: 'center' },
  addCard: {
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#222236',
    backgroundColor: '#121220',
    padding: 10,
  },
  input: { flex: 1, color: '#f3f3ff', fontSize: 19, paddingVertical: 2 },
  filterChip: {
    borderWidth: 1,
    borderColor: '#30294a',
    backgroundColor: '#121220',
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 7,
  },
  filterChipActive: { borderColor: '#8b5cf6', backgroundColor: '#2a1450' },
  filterText: { color: '#a8a0c8', fontWeight: '600', fontSize: 12 },
  filterTextActive: { color: '#e7dcff', fontWeight: '700', fontSize: 12 },
  taskWrap: { marginTop: 8 },
  taskRow: {
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#212132',
    backgroundColor: '#121220',
    paddingHorizontal: 10,
    paddingVertical: 10,
  },
  circleBtn: { paddingHorizontal: 4, paddingVertical: 2 },
  circleText: { fontSize: 26, lineHeight: 28 },
  taskMain: { flex: 1, minWidth: 0, paddingHorizontal: 8 },
  taskTitle: { color: '#f1f1ff', fontSize: 21, fontWeight: '500' },
  spentText: { color: '#9f96c2', fontSize: 12, marginTop: 1 },
  deadlineText: { color: '#ef5d68', fontSize: 13, marginTop: 2 },
  expandBtn: { paddingHorizontal: 4, paddingVertical: 6 },
  playBtn: {
    width: 30,
    height: 30,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: '#3a2a68',
    backgroundColor: '#1a1330',
    alignItems: 'center',
    justifyContent: 'center',
  },
  subtasksWrap: {
    borderLeftWidth: 1,
    borderLeftColor: '#2b2b40',
    marginLeft: 16,
    paddingLeft: 8,
    paddingTop: 6,
  },
  subtaskRow: {
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#1f1f30',
    backgroundColor: '#10101a',
    marginBottom: 6,
    paddingVertical: 7,
    paddingHorizontal: 6,
  },
  subtaskTitle: { color: '#cfcfe1', fontSize: 15 },
  taskDone: { textDecorationLine: 'line-through', color: '#7f7f95' },
  empty: { color: '#7f7f95', paddingTop: 16 },

  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.56)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  sortModal: {
    width: '100%',
    maxWidth: 280,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#2f2f44',
    backgroundColor: '#141422',
    padding: 12,
  },
  sortModalTitle: { color: '#f5f5ff', fontSize: 16, fontWeight: '700', marginBottom: 8 },
  sortOption: {
    borderWidth: 1,
    borderColor: '#2d2d43',
    borderRadius: 10,
    paddingVertical: 10,
    paddingHorizontal: 10,
    marginBottom: 8,
    backgroundColor: '#11111d',
  },
  sortOptionActive: {
    borderColor: '#8b5cf6',
    backgroundColor: '#2a1450',
  },
  sortOptionText: { color: '#ddd6fe', fontWeight: '600' },
});
