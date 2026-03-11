import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Modal, ScrollView, StyleSheet, TextInput, TouchableOpacity, View, useWindowDimensions } from 'react-native';
import Svg, { Circle } from 'react-native-svg';
import { Button, Heading, HStack, Text } from 'native-base';
import { SafeAreaView } from 'react-native-safe-area-context';
import { loadJson, saveJson } from '@/hooks/use-local-cache';
import { useTasks } from '@/hooks/use-tasks';
import { useTimeTracker } from '@/hooks/use-time-tracker';

const PAUSED_CACHE_KEY = 'lt_paused_task_sessions_v1';

type PausedCache = Record<string, { seconds: number; categoryId: number }>;

function formatClock(totalSeconds: number) {
  const safe = Math.max(0, Math.floor(totalSeconds));
  const hh = String(Math.floor(safe / 3600)).padStart(2, '0');
  const mm = String(Math.floor((safe % 3600) / 60)).padStart(2, '0');
  const ss = String(safe % 60).padStart(2, '0');
  return `${hh}:${mm}:${ss}`;
}

function formatDuration(totalSeconds: number) {
  const minutes = Math.floor(totalSeconds / 60);
  const hours = Math.floor(minutes / 60);
  const restMinutes = minutes % 60;
  if (hours <= 0) return `${minutes} мин`;
  if (restMinutes === 0) return `${hours} ч`;
  return `${hours} ч ${restMinutes} мин`;
}

function hexToRgba(hex: string, alpha: number) {
  const normalized = hex.replace('#', '');
  if (normalized.length !== 6) return `rgba(124,58,237,${alpha})`;
  const r = parseInt(normalized.slice(0, 2), 16);
  const g = parseInt(normalized.slice(2, 4), 16);
  const b = parseInt(normalized.slice(4, 6), 16);
  return `rgba(${r},${g},${b},${alpha})`;
}

export default function TimeTrackerScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ taskId?: string; categoryId?: string; taskTitle?: string }>();
  const today = new Date();
  const { categories, activeEntry, summary, lastError, start, stop, attachTask } = useTimeTracker();
  const { tasks, addTask } = useTasks(today, 'all');
  const { width } = useWindowDimensions();

  const ringSize = Math.max(190, Math.min(width - 72, 280));
  const ringStroke = 14;
  const radius = (ringSize - ringStroke) / 2;
  const circumference = 2 * Math.PI * radius;

  const [selectedCategoryId, setSelectedCategoryId] = useState<number | null>(null);
  const [taskIdForStart, setTaskIdForStart] = useState<number | null>(null);

  const [categoryOpen, setCategoryOpen] = useState(false);

  const [pausedSeconds, setPausedSeconds] = useState(0);
  const [pausedCategoryId, setPausedCategoryId] = useState<number | null>(null);
  const [pausedTaskId, setPausedTaskId] = useState<number | null>(null);
  const [pausedCache, setPausedCache] = useState<PausedCache>({});

  const [createTaskOpen, setCreateTaskOpen] = useState(false);
  const [taskTitleDraft, setTaskTitleDraft] = useState('');
  const [pendingStoppedEntryId, setPendingStoppedEntryId] = useState<number | null>(null);
  const [pendingCategoryId, setPendingCategoryId] = useState<number | null>(null);
  const [pendingSpentSeconds, setPendingSpentSeconds] = useState(0);
  const lastAppliedRouteTaskRef = useRef<string>('');

  const [tickMs, setTickMs] = useState(Date.now());

  useEffect(() => {
    const timer = setInterval(() => setTickMs(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    (async () => {
      const cache = await loadJson<PausedCache>(PAUSED_CACHE_KEY);
      if (cache) setPausedCache(cache);
    })();
  }, []);

  useEffect(() => {
    void saveJson(PAUSED_CACHE_KEY, pausedCache);
  }, [pausedCache]);

  const requestedTaskId = Number(params.taskId);
  const requestedCategoryId = Number(params.categoryId);

  useEffect(() => {
    if (!Number.isFinite(requestedTaskId) || requestedTaskId <= 0) return;
    const routeKey = `${requestedTaskId}:${requestedCategoryId || 0}`;
    if (lastAppliedRouteTaskRef.current === routeKey) return;

    const task = tasks.find((t) => t.id === requestedTaskId);
    const initialCategoryId = Number.isFinite(requestedCategoryId) && requestedCategoryId > 0
      ? requestedCategoryId
      : (task?.taskCategoryId ?? null);

    setTaskIdForStart(requestedTaskId);
    if (initialCategoryId) setSelectedCategoryId(initialCategoryId);

    const cached = pausedCache[`task:${requestedTaskId}`];
    if (!activeEntry && cached && cached.seconds > 0) {
      setPausedSeconds(cached.seconds);
      setPausedTaskId(requestedTaskId);
      setPausedCategoryId(cached.categoryId);
    }
    lastAppliedRouteTaskRef.current = routeKey;
  }, [requestedTaskId, requestedCategoryId, tasks, pausedCache, activeEntry]);

  const activeSegmentSeconds = useMemo(() => {
    if (!activeEntry) return 0;
    const startAt = new Date(activeEntry.startTime).getTime();
    if (Number.isNaN(startAt)) return 0;
    return Math.max(0, Math.floor((tickMs - startAt) / 1000));
  }, [activeEntry, tickMs]);

  const totalSessionSeconds = pausedSeconds + activeSegmentSeconds;
  const ringProgress = (totalSessionSeconds % 3600) / 3600;
  const ringOffset = circumference * (1 - ringProgress);

  const currentCategoryId = activeEntry?.categoryId ?? selectedCategoryId ?? pausedCategoryId ?? null;
  const currentCategory = categories.find((c) => c.id === currentCategoryId);

  const currentTaskId = activeEntry?.taskId ?? taskIdForStart ?? pausedTaskId ?? null;
  const currentTask = tasks.find((t) => t.id === currentTaskId);
  const routeTaskTitle = typeof params.taskTitle === 'string' ? params.taskTitle : null;
  const visibleTaskTitle = currentTask?.title ?? routeTaskTitle;

  const hasPausedSession = !activeEntry && pausedSeconds > 0;
  const totalTodayLabel = formatDuration((summary?.totalMinutes ?? 0) * 60);

  const removePausedForTask = (taskId: number | null) => {
    if (!taskId) return;
    setPausedCache((prev) => {
      if (!("task:" + taskId in prev)) return prev;
      const next = { ...prev };
      delete next[`task:${taskId}`];
      return next;
    });
  };

  const clearRouteParams = () => {
    router.setParams({ taskId: undefined, categoryId: undefined, taskTitle: undefined });
    lastAppliedRouteTaskRef.current = '';
  };

  const clearTaskBinding = () => {
    setTaskIdForStart(null);
    setPausedTaskId(null);
    clearRouteParams();
  };

  const handleStart = async () => {
    if (!selectedCategoryId) return;
    const started = await start(selectedCategoryId, { taskId: taskIdForStart ?? undefined });
    if (!started) return;

    if (taskIdForStart) removePausedForTask(taskIdForStart);
    setPausedSeconds(0);
    setPausedCategoryId(null);
    setPausedTaskId(null);
  };

  const handlePause = async () => {
    if (!activeEntry) return;
    const snapshot = activeSegmentSeconds;
    const boundTaskId = activeEntry.taskId ?? taskIdForStart ?? null;

    const stopped = await stop(boundTaskId ?? undefined);
    if (!stopped) return;

    const nextSeconds = pausedSeconds + snapshot;
    setPausedSeconds(nextSeconds);
    setPausedCategoryId(activeEntry.categoryId);
    setPausedTaskId(boundTaskId);

    if (boundTaskId) {
      setPausedCache((prev) => ({
        ...prev,
        [`task:${boundTaskId}`]: { seconds: nextSeconds, categoryId: activeEntry.categoryId },
      }));
    }
  };

  const handleResume = async () => {
    const categoryId = pausedCategoryId ?? selectedCategoryId;
    if (!categoryId) return;
    await start(categoryId, { taskId: pausedTaskId ?? undefined });
  };

  const handleFinish = async () => {
    const boundTaskId = activeEntry?.taskId ?? pausedTaskId ?? taskIdForStart ?? null;
    const shouldOfferCreateTask = !boundTaskId && !!activeEntry;

    let stoppedEntryId: number | null = null;
    if (activeEntry) {
      const stopped = await stop(boundTaskId ?? undefined);
      if (!stopped) return;
      stoppedEntryId = stopped.id;
    }

    if (boundTaskId) removePausedForTask(boundTaskId);

    const categoryIdForResult = activeEntry?.categoryId ?? pausedCategoryId ?? selectedCategoryId ?? null;
    const spentSeconds = totalSessionSeconds;

    setPausedSeconds(0);
    setPausedCategoryId(null);
    setPausedTaskId(null);
    setTaskIdForStart(null);
    setSelectedCategoryId(null);
    clearRouteParams();

    if (shouldOfferCreateTask && categoryIdForResult && spentSeconds >= 60) {
      setPendingStoppedEntryId(stoppedEntryId);
      setPendingCategoryId(categoryIdForResult);
      setPendingSpentSeconds(spentSeconds);
      setTaskTitleDraft('');
      setCreateTaskOpen(true);
    }
  };

  const closeCreateTaskModal = () => {
    setCreateTaskOpen(false);
    setTaskTitleDraft('');
    setPendingStoppedEntryId(null);
    setPendingCategoryId(null);
    setPendingSpentSeconds(0);
  };

  const createTaskFromSession = async () => {
    const title = taskTitleDraft.trim();
    if (!title || !pendingCategoryId) return;

    const created = await addTask(title, { taskCategoryId: pendingCategoryId });
    if (!created) return;

    if (pendingStoppedEntryId) {
      await attachTask(pendingStoppedEntryId, created.id);
    }

    setTaskIdForStart(created.id);
    setSelectedCategoryId(pendingCategoryId);
    clearRouteParams();
    closeCreateTaskModal();
  };

  return (
    <SafeAreaView style={styles.safeArea} edges={['top']}>
      <View style={styles.screen}>
        <View style={styles.bgGlowTop} />
        <View style={styles.bgGlowBottom} />

        <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
          <HStack justifyContent="space-between" alignItems="center">
            <Heading size="md" color="#f8f7ff">
              Time
            </Heading>
            <TouchableOpacity
              style={[
                styles.categoryTopButton,
                currentCategory
                  ? {
                      backgroundColor: hexToRgba(currentCategory.color || '#8b5cf6', 0.18),
                      borderColor: currentCategory.color || '#8b5cf6',
                    }
                  : null,
              ]}
              onPress={() => setCategoryOpen(true)}>
              <Text
                style={[
                  styles.categoryTopButtonText,
                  currentCategory ? { color: currentCategory.color || '#8b5cf6' } : null,
                ]}
                numberOfLines={1}>
                {currentCategory?.name ?? 'Категория'}
              </Text>
              <MaterialCommunityIcons name="chevron-down" size={18} color="#c4b5fd" />
            </TouchableOpacity>
          </HStack>

          {visibleTaskTitle ? (
            <HStack alignItems="center" justifyContent="space-between" mt={1}>
              <Text style={styles.taskContext} numberOfLines={1}>
                Задача: {visibleTaskTitle}
              </Text>
              {!activeEntry && !hasPausedSession ? (
                <TouchableOpacity onPress={clearTaskBinding} style={styles.clearTaskBtn}>
                  <MaterialCommunityIcons name="close" size={14} color="#bcb3da" />
                </TouchableOpacity>
              ) : null}
            </HStack>
          ) : null}

          {!!lastError && (
            <View style={styles.errorCard}>
              <Text color="#fecaca" fontSize="xs" numberOfLines={2}>
                {lastError}
              </Text>
            </View>
          )}

          <View style={styles.timerStage}>
            <View style={[styles.ringWrap, { width: ringSize, height: ringSize }]}>
              <Svg width={ringSize} height={ringSize}>
                <Circle cx={ringSize / 2} cy={ringSize / 2} r={radius} stroke="#2a2149" strokeWidth={ringStroke} fill="none" />
                <Circle
                  cx={ringSize / 2}
                  cy={ringSize / 2}
                  r={radius}
                  stroke={currentCategory?.color || '#8b5cf6'}
                  strokeWidth={ringStroke}
                  strokeLinecap="round"
                  fill="none"
                  strokeDasharray={`${circumference} ${circumference}`}
                  strokeDashoffset={ringOffset}
                  transform={`rotate(-90 ${ringSize / 2} ${ringSize / 2})`}
                />
              </Svg>
              <View style={styles.ringCenter}>
                <Text style={styles.clockText}>{formatClock(totalSessionSeconds)}</Text>
                <Text style={styles.clockSubtext}>{formatDuration(totalSessionSeconds)}</Text>
              </View>
            </View>

            <Text style={styles.contextLine}>Сегодня: {totalTodayLabel}</Text>

            <HStack mt={4} space={3} justifyContent="center">
              {!activeEntry && !hasPausedSession && (
                <Button
                  onPress={handleStart}
                  isDisabled={!selectedCategoryId}
                  bg="#7c3aed"
                  _pressed={{ bg: '#6d28d9' }}
                  borderRadius="full"
                  px={8}>
                  Начать фокус
                </Button>
              )}

              {activeEntry && (
                <Button
                  onPress={handlePause}
                  variant="outline"
                  borderColor="#a78bfa"
                  _text={{ color: '#ddd6fe' }}
                  borderRadius="full"
                  leftIcon={<MaterialCommunityIcons name="pause" size={16} color="#ddd6fe" />}>
                  Пауза
                </Button>
              )}

              {hasPausedSession && (
                <>
                  <Button
                    onPress={handleResume}
                    bg="#7c3aed"
                    _pressed={{ bg: '#6d28d9' }}
                    borderRadius="full"
                    leftIcon={<MaterialCommunityIcons name="play" size={16} color="#f5f3ff" />}>
                    Продолжить
                  </Button>
                  <Button
                    onPress={handleFinish}
                    variant="outline"
                    borderColor="#a78bfa"
                    _text={{ color: '#ddd6fe' }}
                    borderRadius="full">
                    Завершить
                  </Button>
                </>
              )}
            </HStack>
          </View>
        </ScrollView>

        <Modal visible={categoryOpen} transparent animationType="fade">
          <TouchableOpacity style={styles.modalOverlay} onPress={() => setCategoryOpen(false)} activeOpacity={1}>
            <TouchableOpacity style={styles.modalContent} onPress={(e) => e.stopPropagation()} activeOpacity={1}>
              <Text style={styles.modalTitle}>Выбор категории</Text>
              <ScrollView>
                {categories.map((c) => (
                  <TouchableOpacity
                    key={c.id}
                    style={[
                      styles.listItem,
                      { borderColor: c.color || '#8b5cf6', backgroundColor: hexToRgba(c.color || '#8b5cf6', 0.12) },
                    ]}
                    onPress={() => {
                      setSelectedCategoryId(c.id);
                      if (!activeEntry && !hasPausedSession) setTaskIdForStart(null);
                      if (!activeEntry && !hasPausedSession) clearRouteParams();
                      setCategoryOpen(false);
                    }}>
                    <Text style={{ color: c.color || '#8b5cf6', fontWeight: '700' }}>{c.name}</Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>
            </TouchableOpacity>
          </TouchableOpacity>
        </Modal>

        <Modal visible={createTaskOpen} transparent animationType="fade">
          <TouchableOpacity style={styles.modalOverlay} onPress={closeCreateTaskModal} activeOpacity={1}>
            <TouchableOpacity style={styles.modalContent} onPress={(e) => e.stopPropagation()} activeOpacity={1}>
              <Text style={styles.modalTitle}>Сохранить как задачу?</Text>
              <Text style={styles.modalHint}>Сессия: {formatDuration(pendingSpentSeconds)}</Text>

              <TextInput
                style={styles.modalInput}
                value={taskTitleDraft}
                onChangeText={setTaskTitleDraft}
                placeholder="Название задачи"
                placeholderTextColor="#8f8faa"
                autoFocus
                onSubmitEditing={createTaskFromSession}
                returnKeyType="done"
              />

              <HStack space={2} mt={2}>
                <Button flex={1} variant="outline" borderColor="#3a3257" _text={{ color: '#d1cbe8' }} onPress={closeCreateTaskModal}>
                  Пропустить
                </Button>
                <Button flex={1} bg="#7c3aed" _pressed={{ bg: '#6d28d9' }} onPress={createTaskFromSession}>
                  Создать
                </Button>
              </HStack>
            </TouchableOpacity>
          </TouchableOpacity>
        </Modal>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: '#06030f' },
  screen: { flex: 1, backgroundColor: '#06030f' },
  bgGlowTop: {
    position: 'absolute',
    top: -120,
    right: -80,
    width: 280,
    height: 280,
    borderRadius: 999,
    backgroundColor: 'rgba(124,58,237,0.18)',
  },
  bgGlowBottom: {
    position: 'absolute',
    bottom: -160,
    left: -100,
    width: 300,
    height: 300,
    borderRadius: 999,
    backgroundColor: 'rgba(59,130,246,0.1)',
  },
  content: { padding: 16, paddingBottom: 36, gap: 12 },
  timerStage: {
    alignItems: 'center',
    paddingTop: 18,
    paddingBottom: 12,
  },
  ringWrap: {
    alignSelf: 'center',
    justifyContent: 'center',
    alignItems: 'center',
  },
  ringCenter: { position: 'absolute', alignItems: 'center', paddingHorizontal: 10 },
  clockText: {
    color: '#f5f3ff',
    fontSize: 34,
    lineHeight: 38,
    fontWeight: '800',
    letterSpacing: 1,
  },
  clockSubtext: { color: '#c4b5fd', fontSize: 13, fontWeight: '600', marginTop: 2 },
  contextLine: { color: '#bfb6d8', fontSize: 13, textAlign: 'center', marginTop: 12 },
  taskContext: {
    color: '#d1cbe8',
    fontSize: 13,
    marginTop: 2,
    marginBottom: 2,
    maxWidth: '88%',
  },
  clearTaskBtn: {
    width: 24,
    height: 24,
    borderRadius: 999,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#322a4c',
    backgroundColor: '#120f1f',
  },
  categoryTopButton: {
    borderWidth: 1,
    borderColor: '#3a2a68',
    backgroundColor: '#120a24',
    borderRadius: 999,
    paddingHorizontal: 11,
    paddingVertical: 7,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    maxWidth: 190,
  },
  categoryTopButtonText: { color: '#d6ccff', fontSize: 12, fontWeight: '700', maxWidth: 140 },
  errorCard: {
    backgroundColor: '#2b1120',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#5b2039',
    padding: 10,
  },

  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.6)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  modalContent: {
    width: '100%',
    maxWidth: 360,
    maxHeight: '80%',
    backgroundColor: '#141223',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#2f2a46',
    padding: 14,
  },
  modalTitle: { color: '#f5f3ff', fontSize: 17, fontWeight: '700', marginBottom: 10 },
  modalHint: { color: '#bdb5d8', fontSize: 12, marginBottom: 8 },
  listItem: {
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 10,
    marginBottom: 8,
  },
  modalInput: {
    borderWidth: 1,
    borderColor: '#3a3257',
    borderRadius: 10,
    paddingHorizontal: 11,
    paddingVertical: 9,
    color: '#f5f3ff',
    fontSize: 15,
    minHeight: 42,
  },
});
