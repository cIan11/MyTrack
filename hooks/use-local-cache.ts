import AsyncStorage from '@react-native-async-storage/async-storage';

const memoryStore = new Map<string, string>();

function canUseAsyncStorage() {
  return (
    AsyncStorage != null &&
    typeof AsyncStorage.getItem === 'function' &&
    typeof AsyncStorage.setItem === 'function'
  );
}

export async function saveJson(key: string, value: unknown) {
  const payload = JSON.stringify(value);
  if (!canUseAsyncStorage()) {
    memoryStore.set(key, payload);
    return;
  }
  try {
    await AsyncStorage.setItem(key, payload);
  } catch {
    memoryStore.set(key, payload);
  }
}

export async function loadJson<T>(key: string): Promise<T | null> {
  let raw: string | null = null;
  if (!canUseAsyncStorage()) {
    raw = memoryStore.get(key) ?? null;
  } else {
    try {
      raw = await AsyncStorage.getItem(key);
    } catch {
      raw = memoryStore.get(key) ?? null;
    }
  }
  if (!raw) return null;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}
