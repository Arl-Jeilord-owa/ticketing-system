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

  function applyTheme(theme) {
    document.documentElement.classList.toggle('dark', theme === 'dark');
  }

  function getSavedTheme() {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) return saved;
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  }

  function toggleTheme() {
    const current = document.documentElement.classList.contains('dark') ? 'dark' : 'light';
    const next = current === 'dark' ? 'light' : 'dark';
    applyTheme(next);
    localStorage.setItem(STORAGE_KEY, next);
  }

  applyTheme(getSavedTheme());

  document.addEventListener('DOMContentLoaded', () => {
    const employeeBtn = document.getElementById('theme-toggle');
    const customerBtn = document.getElementById('theme-toggle-customer');

    if (employeeBtn) employeeBtn.addEventListener('click', toggleTheme);
    if (customerBtn) customerBtn.addEventListener('click', toggleTheme);
  });

  const media = window.matchMedia('(prefers-color-scheme: dark)');
  if (media.addEventListener) {
    media.addEventListener('change', (e) => {
      if (!localStorage.getItem(STORAGE_KEY)) {
        applyTheme(e.matches ? 'dark' : 'light');
      }
    });
  }

  window.ThemeManager = { toggle: toggleTheme, apply: applyTheme, getSaved: getSavedTheme };
})();
