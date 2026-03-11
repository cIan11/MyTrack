import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Modal, ScrollView, StyleSheet, TextInput, TouchableOpacity, View } from 'react-native';
import { HStack, Text, VStack } from 'native-base';
import { SafeAreaView } from 'react-native-safe-area-context';
import { API_BASE_URL } from '@/constants/api';
import { useActivityCategories } from '@/hooks/use-activity-categories';

type Task = {
  id: number;
  title: string;
  description?: string | null;
  dueDate?: string | null;
  status: string;
  taskCategoryId?: number | null;
  priority: number;
  parentTaskId?: number | null;
  subtasks?: Task[];
};

const PRIORITIES = [
  { value: 0, label: 'Нет приоритета', color: '#8f8faa' },
  { value: 1, label: 'Низкий', color: '#34d399' },
  { value: 2, label: 'Средний', color: '#f59e0b' },
  { value: 3, label: 'Высокий', color: '#ef5d68' },
] as const;

function formatDateYmd(date: Date) {
  return date.toISOString().slice(0, 10);
}

function startOfMonth(d: Date) {
  return new Date(d.getFullYear(), d.getMonth(), 1);
}

function isSameDay(a: Date, b: Date) {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

function monthNameRu(date: Date) {
  return date.toLocaleDateString('ru-RU', { month: 'long', year: 'numeric' });
}

function buildCalendarDays(cursor: Date) {
  const first = startOfMonth(cursor);
  const weekday = (first.getDay() + 6) % 7; // Mon=0
  const daysInMonth = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 0).getDate();

  const cells: (Date | null)[] = [];
  for (let i = 0; i < weekday; i += 1) cells.push(null);
  for (let day = 1; day <= daysInMonth; day += 1) {
    cells.push(new Date(cursor.getFullYear(), cursor.getMonth(), day));
  }
  while (cells.length % 7 !== 0) cells.push(null);
  return cells;
}

function hexToRgba(hex: string, alpha: number) {
  const normalized = hex.replace('#', '');
  if (normalized.length !== 6) return `rgba(139,92,246,${alpha})`;
  const r = parseInt(normalized.slice(0, 2), 16);
  const g = parseInt(normalized.slice(2, 4), 16);
  const b = parseInt(normalized.slice(4, 6), 16);
  return `rgba(${r},${g},${b},${alpha})`;
}

export default function TaskDetailsScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ id: string }>();
  const taskId = Number(params.id);
  const { categories } = useActivityCategories();

  const [task, setTask] = useState<Task | null>(null);
  const [dueDate, setDueDate] = useState('');
  const [notes, setNotes] = useState('');
  const [subtaskTitle, setSubtaskTitle] = useState('');
  const [priority, setPriority] = useState(0);
  const [taskCategoryId, setTaskCategoryId] = useState<number | null>(null);
  const notesDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [deadlineOpen, setDeadlineOpen] = useState(false);
  const [categoryOpen, setCategoryOpen] = useState(false);
  const [priorityOpen, setPriorityOpen] = useState(false);
  const [cursorMonth, setCursorMonth] = useState(new Date());
  const [draftDate, setDraftDate] = useState<Date | null>(null);

  const subtasks = useMemo(() => task?.subtasks ?? [], [task]);
  const today = new Date();
  const selectedPriority = PRIORITIES.find((p) => p.value === priority) ?? PRIORITIES[0];
  const selectedCategory = categories.find((c) => c.id === taskCategoryId);

  const loadTask = useCallback(async () => {
    if (!taskId) return;
    const res = await fetch(`${API_BASE_URL}/api/tasks/${taskId}`);
    if (!res.ok) {
      console.error('Failed to load task', await res.text());
      return;
    }
    const data: Task = await res.json();
    setTask(data);
    setDueDate(data.dueDate ? data.dueDate.slice(0, 10) : '');
    setNotes(data.description ?? '');
    setPriority(typeof data.priority === 'number' ? data.priority : 0);
    setTaskCategoryId(data.taskCategoryId ?? null);
  }, [taskId]);

  useEffect(() => {
    loadTask();
  }, [loadTask]);

  const toggleTask = async (id: number, currentStatus: string) => {
    const next = currentStatus === 'done' ? 'todo' : 'done';
    await fetch(`${API_BASE_URL}/api/tasks/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: next }),
    });
    await loadTask();
  };

  const patchTask = async (
    patch: Partial<{
      description: string | null;
      dueDate: string | null;
      priority: number;
      taskCategoryId: number | null;
    }>,
  ) => {
    if (!task) return;
    const res = await fetch(`${API_BASE_URL}/api/tasks/${task.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(patch),
    });
    if (!res.ok) {
      console.error('Failed to autosave task', await res.text());
      return;
    }
    const updated: Task = await res.json();
    setTask((prev) => (prev ? { ...prev, ...updated } : prev));
  };

  const saveNotes = async (value: string) => {
    await patchTask({ description: value.trim() ? value.trim() : null });
  };

  const onChangeNotes = (value: string) => {
    setNotes(value);
    if (notesDebounceRef.current) clearTimeout(notesDebounceRef.current);
    notesDebounceRef.current = setTimeout(() => {
      void saveNotes(value);
    }, 450);
  };

  const flushNotes = () => {
    if (notesDebounceRef.current) {
      clearTimeout(notesDebounceRef.current);
      notesDebounceRef.current = null;
    }
    void saveNotes(notes);
  };

  const addSubtask = async () => {
    const t = subtaskTitle.trim();
    if (!t || !task) return;
    await fetch(`${API_BASE_URL}/api/tasks`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        title: t,
        date: new Date().toISOString().slice(0, 10),
        parentTaskId: task.id,
        taskCategoryId: taskCategoryId ?? null,
        priority,
      }),
    });
    setSubtaskTitle('');
    await loadTask();
  };

  const openDeadline = () => {
    const from = dueDate ? new Date(dueDate) : new Date();
    setDraftDate(dueDate ? new Date(dueDate) : null);
    setCursorMonth(startOfMonth(from));
    setDeadlineOpen(true);
  };

  const applyDeadline = () => {
    const nextDate = draftDate ? formatDateYmd(draftDate) : '';
    setDueDate(nextDate);
    setDeadlineOpen(false);
    void patchTask({ dueDate: nextDate || null });
  };

  const quickSet = (mode: 'today' | 'tomorrow' | 'week' | 'someday') => {
    if (mode === 'someday') {
      setDraftDate(null);
      return;
    }
    const d = new Date();
    if (mode === 'tomorrow') d.setDate(d.getDate() + 1);
    if (mode === 'week') d.setDate(d.getDate() + 7);
    setDraftDate(d);
    setCursorMonth(startOfMonth(d));
  };

  const calendarCells = buildCalendarDays(cursorMonth);

  useEffect(() => {
    return () => {
      if (notesDebounceRef.current) clearTimeout(notesDebounceRef.current);
    };
  }, []);

  return (
    <SafeAreaView style={styles.safeArea} edges={['top']}>
      <View style={styles.screen}>
        <ScrollView contentContainerStyle={styles.content}>
          <HStack justifyContent="space-between" alignItems="center">
            <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
              <MaterialCommunityIcons name="arrow-left" size={20} color="#ddd6fe" />
            </TouchableOpacity>
            <Text style={styles.header}>Задачи</Text>
            <View style={{ width: 34, height: 34 }} />
          </HStack>

          {task && (
            <VStack space={3}>
              <View style={styles.mainCard}>
                <HStack alignItems="center" justifyContent="space-between">
                  <HStack alignItems="center" space={2} flex={1}>
                    <TouchableOpacity onPress={() => toggleTask(task.id, task.status)}>
                      <Text style={[styles.circle, { color: selectedPriority.color }]}>{task.status === 'done' ? '●' : '○'}</Text>
                    </TouchableOpacity>
                    <Text style={[styles.taskTitle, task.status === 'done' ? styles.done : null]} numberOfLines={1}>{task.title}</Text>
                  </HStack>
                  <TouchableOpacity style={styles.flagBtn} onPress={() => setPriorityOpen(true)}>
                    <MaterialCommunityIcons name="flag" size={20} color={selectedPriority.color} />
                  </TouchableOpacity>
                </HStack>
              </View>

              <TouchableOpacity style={styles.mainCard} onPress={() => setCategoryOpen(true)}>
                <HStack justifyContent="space-between" alignItems="center">
                  <Text style={styles.label}>Категория</Text>
                  <HStack alignItems="center" space={1}>
                    <Text style={[styles.valueText, selectedCategory ? { color: selectedCategory.color } : null]}>
                      {selectedCategory?.name ?? 'Без категории'}
                    </Text>
                    <MaterialCommunityIcons name="chevron-right" size={18} color="#8b8ba3" />
                  </HStack>
                </HStack>
              </TouchableOpacity>

              <TouchableOpacity style={styles.mainCard} onPress={openDeadline}>
                <HStack justifyContent="space-between" alignItems="center">
                  <Text style={styles.label}>Срок</Text>
                  <HStack alignItems="center" space={1}>
                    <Text style={styles.valueText}>{dueDate ? new Date(dueDate).toLocaleDateString() : 'Нет'}</Text>
                    <MaterialCommunityIcons name="calendar-month" size={18} color="#ef5d68" />
                  </HStack>
                </HStack>
              </TouchableOpacity>

              <View style={styles.mainCard}>
                <Text style={styles.label}>Подзадачи</Text>
                {subtasks.map((sub) => (
                  <HStack key={sub.id} alignItems="center" style={styles.subtaskRow}>
                    <TouchableOpacity onPress={() => toggleTask(sub.id, sub.status)}>
                      <Text style={[styles.circle, { color: '#8f8faa' }]}>{sub.status === 'done' ? '●' : '○'}</Text>
                    </TouchableOpacity>
                    <Text style={[styles.subtaskText, sub.status === 'done' ? styles.done : null]}>{sub.title}</Text>
                  </HStack>
                ))}
                {subtasks.length === 0 && <Text style={styles.empty}>Подзадач пока нет</Text>}

                <HStack alignItems="center" mt={2} space={2}>
                  <MaterialCommunityIcons name="plus" size={18} color="#8f8faa" />
                  <TextInput
                    style={styles.subtaskInput}
                    value={subtaskTitle}
                    onChangeText={setSubtaskTitle}
                    placeholder="Добавить подзадачу..."
                    placeholderTextColor="#8f8faa"
                    onSubmitEditing={addSubtask}
                    returnKeyType="done"
                  />
                </HStack>
              </View>

              <View style={styles.mainCard}>
                <Text style={styles.label}>Заметки</Text>
                <TextInput
                  style={styles.notes}
                  value={notes}
                  onChangeText={onChangeNotes}
                  onBlur={flushNotes}
                  placeholder="Добавить заметку..."
                  placeholderTextColor="#8f8faa"
                  multiline
                />
              </View>
            </VStack>
          )}
        </ScrollView>

        <Modal visible={priorityOpen} transparent animationType="fade">
          <TouchableOpacity style={styles.modalOverlay} activeOpacity={1} onPress={() => setPriorityOpen(false)}>
            <TouchableOpacity style={styles.modalContent} activeOpacity={1} onPress={(e) => e.stopPropagation()}>
              <Text style={styles.modalTitle}>Приоритет</Text>
              {PRIORITIES.map((p) => (
                <TouchableOpacity
                  key={p.value}
                  style={[styles.listItem, { borderColor: p.color, backgroundColor: hexToRgba(p.color, 0.12) }]}
                  onPress={() => {
                    setPriority(p.value);
                    void patchTask({ priority: p.value });
                    setPriorityOpen(false);
                  }}>
                  <HStack alignItems="center" space={2}>
                    <MaterialCommunityIcons name="flag" size={16} color={p.color} />
                    <Text style={[styles.listText, { color: p.color }]}>{p.label}</Text>
                  </HStack>
                </TouchableOpacity>
              ))}
            </TouchableOpacity>
          </TouchableOpacity>
        </Modal>

        <Modal visible={categoryOpen} transparent animationType="fade">
          <TouchableOpacity style={styles.modalOverlay} activeOpacity={1} onPress={() => setCategoryOpen(false)}>
            <TouchableOpacity style={styles.modalContent} activeOpacity={1} onPress={(e) => e.stopPropagation()}>
              <Text style={styles.modalTitle}>Категория</Text>
              <TouchableOpacity
                style={[styles.listItem, { borderColor: '#8f8faa', backgroundColor: hexToRgba('#8f8faa', 0.12) }]}
                onPress={() => {
                  setTaskCategoryId(null);
                  void patchTask({ taskCategoryId: null });
                  setCategoryOpen(false);
                }}>
                <Text style={[styles.listText, { color: '#8f8faa' }]}>Без категории</Text>
              </TouchableOpacity>
              {categories.map((c) => (
                <TouchableOpacity
                  key={c.id}
                  style={[styles.listItem, { borderColor: c.color, backgroundColor: hexToRgba(c.color, 0.12) }]}
                  onPress={() => {
                    setTaskCategoryId(c.id);
                    void patchTask({ taskCategoryId: c.id });
                    setCategoryOpen(false);
                  }}>
                  <Text style={[styles.listText, { color: c.color }]}>{c.name}</Text>
                </TouchableOpacity>
              ))}
            </TouchableOpacity>
          </TouchableOpacity>
        </Modal>

        <Modal visible={deadlineOpen} transparent animationType="fade">
          <TouchableOpacity style={styles.modalOverlay} activeOpacity={1} onPress={() => setDeadlineOpen(false)}>
            <TouchableOpacity style={styles.modalContent} activeOpacity={1} onPress={(e) => e.stopPropagation()}>
              <Text style={styles.modalTitle}>Срок</Text>

              <HStack justifyContent="space-between" mb={2}>
                <Preset icon="weather-sunny" color="#22c55e" label="Сегодня" onPress={() => quickSet('today')} />
                <Preset icon="weather-night" color="#f97316" label="Завтра" onPress={() => quickSet('tomorrow')} />
                <Preset icon="calendar-week" color="#0ea5e9" label="Через 7 дней" onPress={() => quickSet('week')} />
                <Preset icon="calendar-question" color="#8b5cf6" label="Когда-нибудь" onPress={() => quickSet('someday')} />
              </HStack>

              <HStack justifyContent="space-between" alignItems="center" mb={2}>
                <TouchableOpacity onPress={() => setCursorMonth(new Date(cursorMonth.getFullYear(), cursorMonth.getMonth() - 1, 1))}>
                  <MaterialCommunityIcons name="chevron-left" size={24} color="#ef5d68" />
                </TouchableOpacity>
                <Text style={styles.monthTitle}>{monthNameRu(cursorMonth)}</Text>
                <TouchableOpacity onPress={() => setCursorMonth(new Date(cursorMonth.getFullYear(), cursorMonth.getMonth() + 1, 1))}>
                  <MaterialCommunityIcons name="chevron-right" size={24} color="#ef5d68" />
                </TouchableOpacity>
              </HStack>

              <HStack justifyContent="space-between" mb={1}>
                {['ПН', 'ВТ', 'СР', 'ЧТ', 'ПТ', 'СБ', 'ВС'].map((d) => (
                  <Text key={d} style={styles.weekday}>{d}</Text>
                ))}
              </HStack>

              <View style={styles.calendarGrid}>
                {calendarCells.map((d, idx) => {
                  if (!d) return <View key={`empty-${idx}`} style={styles.dayCell} />;
                  const isToday = isSameDay(d, today);
                  const isSelected = draftDate ? isSameDay(d, draftDate) : false;
                  return (
                    <TouchableOpacity key={d.toISOString()} style={styles.dayCell} onPress={() => setDraftDate(d)}>
                      <View style={[styles.dayInner, isSelected ? styles.dayInnerSelected : null]}>
                        <Text
                          style={[
                            styles.dayText,
                            isToday ? styles.dayToday : null,
                            isSelected ? styles.daySelectedText : null,
                          ]}>
                          {d.getDate()}
                        </Text>
                      </View>
                    </TouchableOpacity>
                  );
                })}
              </View>

              <HStack mt={3} space={3}>
                <TouchableOpacity style={styles.cancelBtn} onPress={() => setDeadlineOpen(false)}>
                  <Text style={styles.cancelBtnText}>Отменить</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.doneBtn} onPress={applyDeadline}>
                  <Text style={styles.doneBtnText}>Готово</Text>
                </TouchableOpacity>
              </HStack>
            </TouchableOpacity>
          </TouchableOpacity>
        </Modal>
      </View>
    </SafeAreaView>
  );
}

function Preset({
  icon,
  color,
  label,
  onPress,
}: {
  icon: keyof typeof MaterialCommunityIcons.glyphMap;
  color: string;
  label: string;
  onPress: () => void;
}) {
  return (
    <TouchableOpacity onPress={onPress} style={styles.presetWrap}>
      <View style={[styles.presetDot, { backgroundColor: color }]}>
        <MaterialCommunityIcons name={icon} size={18} color="#fff" />
      </View>
      <Text style={styles.presetLabel}>{label}</Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: '#090912' },
  screen: { flex: 1, backgroundColor: '#090912' },
  content: { padding: 16, paddingBottom: 34 },
  backBtn: {
    width: 34,
    height: 34,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: '#332a55',
    alignItems: 'center',
    justifyContent: 'center',
  },
  header: { color: '#f1f1ff', fontSize: 22, fontWeight: '700' },
  mainCard: {
    marginTop: 12,
    borderWidth: 1,
    borderColor: '#222236',
    borderRadius: 14,
    backgroundColor: '#121220',
    padding: 12,
  },
  circle: { fontSize: 28, lineHeight: 30 },
  flagBtn: {
    width: 34,
    height: 34,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: '#2f2f44',
    backgroundColor: '#141421',
    alignItems: 'center',
    justifyContent: 'center',
  },
  taskTitle: { color: '#f1f1ff', fontSize: 20, fontWeight: '600', flex: 1 },
  label: { color: '#b8b8ce', fontSize: 13 },
  valueText: { color: '#f1f1ff', fontSize: 16, fontWeight: '600' },
  subtaskRow: {
    borderWidth: 1,
    borderColor: '#2a2a3f',
    borderRadius: 10,
    paddingVertical: 8,
    paddingHorizontal: 10,
    marginBottom: 6,
    gap: 8,
    backgroundColor: '#10101a',
  },
  subtaskText: { color: '#dfdff2', fontSize: 16, flex: 1 },
  subtaskInput: {
    flex: 1,
    borderBottomWidth: 1,
    borderBottomColor: '#2e2e45',
    color: '#f3f3ff',
    fontSize: 17,
    paddingVertical: 6,
  },
  notes: {
    minHeight: 96,
    borderWidth: 1,
    borderColor: '#2d2d45',
    borderRadius: 10,
    color: '#f3f3ff',
    paddingHorizontal: 10,
    paddingVertical: 8,
    fontSize: 18,
    textAlignVertical: 'top',
    marginTop: 8,
  },
  done: { textDecorationLine: 'line-through', color: '#7f7f95' },
  empty: { color: '#7f7f95', fontSize: 12, marginBottom: 8 },

  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.58)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 18,
  },
  modalContent: {
    width: '100%',
    maxWidth: 420,
    backgroundColor: '#181824',
    borderRadius: 18,
    padding: 14,
    borderWidth: 1,
    borderColor: '#2c2c40',
  },
  modalTitle: {
    color: '#f1f1ff',
    fontSize: 20,
    fontWeight: '700',
    textAlign: 'center',
    marginBottom: 10,
  },
  listItem: {
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 9,
    marginBottom: 8,
  },
  listText: {
    fontSize: 14,
    fontWeight: '700',
  },

  presetWrap: { alignItems: 'center', width: '24%' },
  presetDot: {
    width: 42,
    height: 42,
    borderRadius: 999,
    marginBottom: 4,
    alignItems: 'center',
    justifyContent: 'center',
  },
  presetLabel: { color: '#f1f1ff', fontSize: 12, fontWeight: '700', textAlign: 'center' },
  monthTitle: { color: '#f1f1ff', fontSize: 20, fontWeight: '700' },
  weekday: { width: '14.2%', textAlign: 'center', color: '#77779a', fontSize: 14, fontWeight: '700' },
  calendarGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginTop: 2,
  },
  dayCell: {
    width: '14.2%',
    aspectRatio: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dayInner: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dayText: { color: '#e7e7f8', fontSize: 18, fontWeight: '600' },
  dayToday: { color: '#d45a63' },
  dayInnerSelected: { backgroundColor: '#ef5d68' },
  daySelectedText: { color: '#fff', fontWeight: '700' },

  cancelBtn: {
    flex: 1,
    borderRadius: 14,
    backgroundColor: '#2a2a37',
    paddingVertical: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cancelBtnText: { color: '#b5b5c9', fontWeight: '700' },
  doneBtn: {
    flex: 1,
    borderRadius: 14,
    backgroundColor: '#ef5d68',
    paddingVertical: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  doneBtnText: { color: '#fff', fontWeight: '700' },
});
