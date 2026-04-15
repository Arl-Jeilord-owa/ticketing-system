/**
 * theme.js
 * Light / dark mode toggle.
 * Reads from localStorage on page load.
 * Toggled by clicking #theme-toggle anywhere in the page.
 *
 * Usage:
 *   - Include this script in <head> (before body) so the theme
 *     is applied before first paint (prevents flash of wrong theme).
 *   - The toggle button (#theme-toggle) can be anywhere in the HTML.
 */

(function () {
  const STORAGE_KEY = 'omtpi-theme';

  /** Apply theme to <html> */
  function applyTheme(theme) {
    document.documentElement.classList.toggle('dark', theme === 'dark');
  }

  /** Get saved preference, fallback to system preference */
  function getSavedTheme() {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) return saved;
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  }

  /** Toggle between light and dark */
  function toggleTheme() {
    const current = document.documentElement.classList.contains('dark') ? 'dark' : 'light';
    const next    = current === 'dark' ? 'light' : 'dark';
    applyTheme(next);
    localStorage.setItem(STORAGE_KEY, next);
  }

  // Apply immediately on script load (prevents flash)
  applyTheme(getSavedTheme());

  // Wire up toggle button once DOM is ready
  document.addEventListener('DOMContentLoaded', () => {
    const btn = document.getElementById('theme-toggle');
    if (btn) btn.addEventListener('click', toggleTheme);
  });

  // Also listen for system theme changes (when no manual preference set)
  window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', (e) => {
    if (!localStorage.getItem(STORAGE_KEY)) {
      applyTheme(e.matches ? 'dark' : 'light');
    }
  });

  // Expose for external use
  window.ThemeManager = { toggle: toggleTheme, apply: applyTheme, getSaved: getSavedTheme };
})();
