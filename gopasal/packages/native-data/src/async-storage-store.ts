import AsyncStorage from "@react-native-async-storage/async-storage";
import type { KeyValueStore } from "./store";

/**
 * The real store, on a phone.
 *
 * A one-line adapter that exists so that `outbox.ts` — where the durability
 * rules live and where a mistake loses somebody's order — imports nothing from
 * React Native and can be run, and therefore tested, anywhere.
 */
export const asyncStorageStore: KeyValueStore = {
  getItem: (key) => AsyncStorage.getItem(key),
  setItem: (key, value) => AsyncStorage.setItem(key, value),
  removeItem: (key) => AsyncStorage.removeItem(key),
};
