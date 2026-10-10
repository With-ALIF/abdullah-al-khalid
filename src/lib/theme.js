/**
 * Theme (light / dark / system) selection.
 *
 * The mode is what the user picked; `resolveTheme` turns it into the theme the
 * page actually paints, using the OS preference only when the mode is
 * "system". Keeping that decision pure means it can be tested without a
 * browser, and the same rule is repeated in the tiny inline script in
 * index.html so the first paint already has the right colours.
 */

export const THEMES = ['light', 'dark', 'system'];
export const THEME_STORAGE_KEY = 'tdpb.theme.v1';

/** Anything that is not a known mode falls back to the system setting. */
export function normalizeTheme(value) {
  return THEMES.includes(value) ? value : 'system';
}

/** 'dark' | 'light' for the mode the user chose. */
export function resolveTheme(mode, prefersDark = false) {
  const normalized = normalizeTheme(mode);
  if (normalized === 'light') return 'light';
  if (normalized === 'dark') return 'dark';
  return prefersDark ? 'dark' : 'light';
}

function storage() {
  try {
    return typeof window !== 'undefined' ? window.localStorage : null;
  } catch {
    return null;
  }
}

export function readStoredTheme() {
  const store = storage();
  if (!store) return 'system';
  try {
    return normalizeTheme(store.getItem(THEME_STORAGE_KEY));
  } catch {
    return 'system';
  }
}

export function storeTheme(mode) {
  const store = storage();
  if (!store) return false;
  try {
    store.setItem(THEME_STORAGE_KEY, normalizeTheme(mode));
    return true;
  } catch {
    return false;
  }
}

/** null when the browser has no colour-scheme preference to follow. */
export function systemThemeQuery() {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return null;
  try {
    return window.matchMedia('(prefers-color-scheme: dark)');
  } catch {
    return null;
  }
}
