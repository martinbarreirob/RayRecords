// Applies the theme before Angular starts, to avoid a light-to-dark flash: the one this browser
// last saw the user choose, or the light one when there is no choice. The user's account is what
// really decides (core/theme/theme.service.ts corrects this as soon as the session is known).
(function () {
  var chosen = null;
  try {
    chosen = localStorage.getItem('rayrecords.theme');
  } catch (error) {
    // Storage blocked: fall back to the light theme.
  }
  var dark =
    chosen === 'dark' ||
    (chosen === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches);
  document.documentElement.setAttribute('data-theme', dark ? 'dark' : 'light');
})();
