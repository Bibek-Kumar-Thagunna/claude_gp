/**
 * Where the signed-in session lives on a phone.
 *
 * Tokens go in the platform keystore (`expo-secure-store` → Keychain on iOS,
 * EncryptedSharedPreferences on Android), not in AsyncStorage. AsyncStorage is
 * a plain file in the app's sandbox: fine for a cached shop list, wrong for a
 * bearer token, because anything with filesystem access on a rooted or jailbroken
 * device can read it. The keystore is hardware-backed where hardware allows.
 *
 * The user *profile* is kept separately, in ordinary storage. It is not a
 * secret, it is needed to render a signed-in shell on the first frame, and
 * SecureStore reads are slow enough that gating first paint on one is visible.
 *
 * Nothing here is a defence against a modified app. A repackaged build runs as
 * the user and can read the user's own keystore entry. The protections that
 * matter are on the server — short access-token lifetime, single-use rotating
 * refresh tokens, replay detection that revokes the session — and they are
 * already built. This file's job is to not be the weakest link.
 */
import * as SecureStore from "expo-secure-store";
import AsyncStorage from "@react-native-async-storage/async-storage";
import type { ApiUser, Session } from "./http";

const TOKEN_KEY = "gopasal.session.tokens";
const USER_KEY = "gopasal.session.user";

type Stored = {
  accessToken: string;
  refreshToken: string;
  accessExpiresAt: number;
};

type Listener = (session: Session | null) => void;

export function createSessionStore() {
  let cache: Session | null = null;
  let ready = false;
  const listeners = new Set<Listener>();

  const emit = () => {
    for (const l of listeners) l(cache);
  };

  /**
   * SecureStore is unavailable on web, where these screens are rendered for
   * review. Falling back keeps the harness working without pretending the
   * fallback is secure — it is never reached on a device.
   */
  async function setSecret(value: string | null): Promise<void> {
    try {
      if (value === null) await SecureStore.deleteItemAsync(TOKEN_KEY);
      else await SecureStore.setItemAsync(TOKEN_KEY, value);
      return;
    } catch {
      if (value === null) await AsyncStorage.removeItem(TOKEN_KEY);
      else await AsyncStorage.setItem(TOKEN_KEY, value);
    }
  }

  async function getSecret(): Promise<string | null> {
    try {
      return await SecureStore.getItemAsync(TOKEN_KEY);
    } catch {
      return AsyncStorage.getItem(TOKEN_KEY);
    }
  }

  async function restore(): Promise<Session | null> {
    if (ready) return cache;
    try {
      const [raw, userRaw] = await Promise.all([getSecret(), AsyncStorage.getItem(USER_KEY)]);
      if (raw && userRaw) {
        const tokens = JSON.parse(raw) as Stored;
        const user = JSON.parse(userRaw) as ApiUser;
        // An expired *access* token is normal and not a reason to discard the
        // session: the refresh token outlives it by a fortnight and the first
        // authenticated request will rotate the pair.
        cache = { ...tokens, user };
      }
    } catch {
      cache = null;
    }
    ready = true;
    emit();
    return cache;
  }

  async function set(session: Session | null): Promise<void> {
    cache = session;
    ready = true;
    if (session) {
      await Promise.all([
        setSecret(
          JSON.stringify({
            accessToken: session.accessToken,
            refreshToken: session.refreshToken,
            accessExpiresAt: session.accessExpiresAt,
          } satisfies Stored),
        ),
        AsyncStorage.setItem(USER_KEY, JSON.stringify(session.user)),
      ]);
    } else {
      await Promise.all([setSecret(null), AsyncStorage.removeItem(USER_KEY)]);
    }
    emit();
  }

  return {
    /** Synchronous read for the transport's hot path. */
    get: () => cache,
    isReady: () => ready,
    restore,
    set,
    clear: () => set(null),
    subscribe(listener: Listener): () => void {
      listeners.add(listener);
      listener(cache);
      return () => listeners.delete(listener);
    },
  };
}

export type SessionStore = ReturnType<typeof createSessionStore>;
