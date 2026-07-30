import { useEffect } from 'react';

/**
 * Design system v2 is dark-only, so this hook no longer tracks a preference —
 * it pins the `dark` class on and keeps it on.
 *
 * Why it still exists at all: the `.dark` override sheet in index.css styles
 * every screen that hasn't been migrated to ct- tokens yet, and index.html's
 * boot script applies the class before React mounts (so there is no light
 * flash). This hook is the belt to that brace: if anything removes the class
 * at runtime (an old toggle in a stale tab, an extension), it goes straight
 * back on. The API shape is kept so existing call sites compile; `toggle` is
 * deliberately a no-op.
 *
 * Delete this hook once the `.dark` sheet itself is deleted.
 */
export function useDarkMode() {
  useEffect(() => {
    const root = document.documentElement;
    root.classList.add('dark');
    // A stale localStorage 'light' preference would resurrect light mode in
    // any tab still running the old bundle — overwrite it.
    localStorage.setItem('theme', 'dark');
  }, []);

  return { isDark: true as const, toggle: () => {} };
}
