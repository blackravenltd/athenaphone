import AsyncStorage from '@react-native-async-storage/async-storage';

/**
 * Thin JSON layer over AsyncStorage.
 *
 * Reads never throw: a corrupt or absent value yields the supplied fallback,
 * because a bad settings blob should not stop the phone from starting.
 */
export const Storage = {
  async read<T>(key: string, fallback: T): Promise<T> {
    try {
      const raw = await AsyncStorage.getItem(key);
      return raw === null ? fallback : (JSON.parse(raw) as T);
    } catch (error) {
      console.warn(`[storage] could not read "${key}"`, error);
      return fallback;
    }
  },

  async write<T>(key: string, value: T): Promise<void> {
    try {
      await AsyncStorage.setItem(key, JSON.stringify(value));
    } catch (error) {
      console.warn(`[storage] could not write "${key}"`, error);
    }
  },

  async remove(key: string): Promise<void> {
    await AsyncStorage.removeItem(key);
  },
};

export const StorageKeys = {
  accounts: '@athenaphone/accounts',
  activeAccountId: '@athenaphone/activeAccountId',
  history: '@athenaphone/history',
  contacts: '@athenaphone/contacts',
  settings: '@athenaphone/settings',
} as const;
