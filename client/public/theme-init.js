// Runs BEFORE React renders (loaded as a classic script in <head>) so the page
// never flashes the wrong theme. It is an external file because the CSP forbids
// inline scripts. Keep the storage key in sync with src/ThemeContext.jsx.
(function () {
  var theme = null;
  try {
    theme = localStorage.getItem('playhub_theme');
  } catch (e) {}
  if (theme !== 'light' && theme !== 'dark') {
    theme =
      window.matchMedia && window.matchMedia('(prefers-color-scheme: light)').matches
        ? 'light'
        : 'dark';
  }
  var root = document.documentElement;
  root.classList.toggle('dark', theme === 'dark');
  root.setAttribute('data-theme', theme);
  var meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute('content', theme === 'dark' ? '#07070e' : '#f4f5fb');
})();
