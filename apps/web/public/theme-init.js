// Applies the system theme before Angular starts, to avoid a light-to-dark flash. The theme is never
// stored: every visit starts from the system. Mirrors core/theme/theme.service.ts.
(function () {
  var dark = window.matchMedia('(prefers-color-scheme: dark)').matches;
  document.documentElement.setAttribute('data-theme', dark ? 'dark' : 'light');
})();
