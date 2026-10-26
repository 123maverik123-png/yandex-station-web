// The gallery shares the panel's origin-wide appearance preferences.
// Run in <head> before painting, and follow changes from an open settings tab.
(() => {
  function apply() {
    try {
      const root = document.documentElement;
      const theme = localStorage.getItem('ui.theme');
      const accent = localStorage.getItem('ui.accent') || '';
      if (theme === 'light' || theme === 'dark') root.dataset.theme = theme;
      else delete root.dataset.theme;
      for (const [key, value] of [
        ['--accent', accent],
        ['--accent-ink', accent && `color-mix(in srgb, ${accent} 72%, var(--text))`],
        ['--accent-soft', accent && `color-mix(in srgb, ${accent} 15%, var(--card))`],
      ]) value ? root.style.setProperty(key, value) : root.style.removeProperty(key);
      window.dispatchEvent(new Event('themechange'));
    } catch { /* Storage may be unavailable; keep the system theme. */ }
  }
  apply();
  window.addEventListener('storage', event => {
    if (event.key === null || event.key === 'ui.theme' || event.key === 'ui.accent') apply();
  });
  window.addEventListener('pageshow', apply);
})();
