// Sets the saved theme before Angular starts, to avoid a light-to-dark flash. Mirrors core/theme/theme.service.ts.
(function () {
  var stored = null;
  try {
    stored = localStorage.getItem('rr-theme');
  } catch (e) {}
  var dark =
    stored === 'dark' ||
    (stored !== 'light' && window.matchMedia('(prefers-color-scheme: dark)').matches);
  document.documentElement.setAttribute('data-theme', dark ? 'dark' : 'light');
})();
