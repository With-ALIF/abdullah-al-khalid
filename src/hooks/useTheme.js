import { useCallback, useEffect, useState } from 'react';
import {
  normalizeTheme,
  readStoredTheme,
  resolveTheme,
  storeTheme,
  systemThemeQuery,
} from '../lib/theme.js';

/**
 * Theme mode (light / dark / system) plus the theme actually painted.
 *
 * The chosen mode is remembered across visits; the OS setting is only read
 * while the mode is "system", and the page is updated through
 * `<html data-theme>`, which both the CSS and the inline boot script in
 * index.html agree on.
 */
export default function useTheme() {
  const [theme, setThemeMode] = useState(readStoredTheme);
  const [systemDark, setSystemDark] = useState(() => Boolean(systemThemeQuery()?.matches));

  useEffect(() => {
    const query = systemThemeQuery();
    if (!query) return undefined;
    const handleChange = (event) => setSystemDark(event.matches);
    // Some browsers still use the deprecated addListener/removeListener pair.
    if (typeof query.addEventListener === 'function') {
      query.addEventListener('change', handleChange);
      return () => query.removeEventListener('change', handleChange);
    }
    query.addListener(handleChange);
    return () => query.removeListener(handleChange);
  }, []);

  const resolved = resolveTheme(theme, systemDark);

  useEffect(() => {
    document.documentElement.dataset.theme = resolved;
  }, [resolved]);

  const setTheme = useCallback((next) => {
    const mode = normalizeTheme(next);
    setThemeMode(mode);
    storeTheme(mode);
  }, []);

  return { theme, resolved, setTheme };
}
