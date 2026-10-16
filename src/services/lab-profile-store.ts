/**
 * DocStudio — Laboratory Profile persistence (P03-M2)
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Loads and saves the reusable Laboratory Profile across app restarts.
 *
 * Storage mechanism (documented decision)
 * ───────────────────────────────────────
 * A single, versioned JSON object under one `localStorage` key
 * (`LAB_PROFILE_STORAGE_KEY`) — the same offline, app-local store already used
 * for the interface theme.  It needs no Tauri filesystem capability (so no
 * Rust change / `cargo check` and no broadened scope), and all versioning,
 * parsing and safe-fallback logic lives in the pure `lab-profile.ts` service.
 *
 * Injectability
 * ─────────────
 * Every function accepts an optional `storage` (defaulting to `window.localStorage`)
 * so the SAME code runs in the browser (default) and in Node tests (an in-memory
 * map implementing the tiny `KeyValueStorage` interface).  This keeps the
 * persistence logic testable without a DOM and without mocking a Tauri plugin.
 *
 * Failure policy
 * ──────────────
 * Loading never throws: missing, empty, malformed or version-mismatched data
 * all return a clean empty profile so startup is never blocked.  A load error
 * is reported through the optional `onError` callback (for surfacing a banner)
 * but is otherwise silent.  Saving is best-effort and reports failure through
 * the returned boolean / thrown error so the UI can warn.
 *
 * @module services/lab-profile-store
 */

import {
  LAB_PROFILE_STORAGE_KEY,
  createEmptyLabProfile,
  type LabProfile,
} from '../types/lab-profile';
import { parseLabProfileJson, serializeLabProfile } from './lab-profile';

/**
 * Minimal storage interface (a subset of `Storage`).  Passing an in-memory
 * implementation lets Node tests exercise load/save/restart without a DOM.
 */
export interface KeyValueStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

/** Resolve `window.localStorage` at call time; return null outside a browser. */
function browserStorage(): KeyValueStorage | null {
  if (typeof window === 'undefined') return null;
  return window.localStorage as unknown as KeyValueStorage;
}

/** Result of a load: the profile plus whether stored data was rejected. */
export interface LoadLabProfileResult {
  profile: LabProfile;
  /** True when stored data existed but could not be used (fell back to default). */
  fallbackUsed: boolean;
}

/**
 * Load the persisted profile.  Never throws; returns a clean default on any
 * problem and reports a rejected-data condition via `fallbackUsed` (plus an
 * optional `onError` note for the UI).
 */
export function loadLabProfile(
  storage?: KeyValueStorage,
  onError?: (message: string) => void,
): LoadLabProfileResult {
  const store = storage ?? browserStorage();
  if (!store) return { profile: createEmptyLabProfile(), fallbackUsed: false };

  let raw: string | null = null;
  try {
    raw = store.getItem(LAB_PROFILE_STORAGE_KEY);
  } catch (e) {
    onError?.('The saved laboratory profile could not be read; using defaults.');
    return { profile: createEmptyLabProfile(), fallbackUsed: true };
  }

  if (raw === null || raw.trim() === '') {
    return { profile: createEmptyLabProfile(), fallbackUsed: false };
  }

  const profile = parseLabProfileJson(raw);
  if (profile === null) {
    onError?.('The saved laboratory profile was unreadable and has been reset to defaults.');
    return { profile: createEmptyLabProfile(), fallbackUsed: true };
  }
  return { profile, fallbackUsed: false };
}

/**
 * Save the profile.  Returns true on success.  Throws only when a storage is
 * available but the write fails, so the caller can warn the user.
 */
export function saveLabProfile(profile: LabProfile, storage?: KeyValueStorage): boolean {
  const store = storage ?? browserStorage();
  if (!store) return false; // no storage available (e.g. Node without injection)
  store.setItem(LAB_PROFILE_STORAGE_KEY, serializeLabProfile(profile));
  return true;
}

/** Remove any persisted profile (reset-to-empty), leaving a clean default. */
export function clearLabProfile(storage?: KeyValueStorage): void {
  const store = storage ?? browserStorage();
  store?.removeItem(LAB_PROFILE_STORAGE_KEY);
}
