// apps/reflex4you/orientation-lock.js
//
// Best-effort portrait lock for installed PWAs / fullscreen-capable browsers.
// Notes:
// - `screen.orientation.lock()` is ignored/rejected in many contexts (not installed,
//   not fullscreen, iOS Safari, etc.). We retry on user gesture and lifecycle events.
// - This does NOT magically override OS rotation on platforms that disallow it.

(function () {
  const TARGET = 'portrait-primary';

  async function lockPortrait() {
    try {
      if (typeof screen === 'undefined') return;

      // Modern API (Chromium, Android WebView when allowed).
      if (screen.orientation && typeof screen.orientation.lock === 'function') {
        await screen.orientation.lock(TARGET);
        return;
      }

      // Legacy vendor-prefixed fallbacks (very old Android browsers).
      const legacy =
        screen.lockOrientation ||
        screen.mozLockOrientation ||
        screen.msLockOrientation;
      if (typeof legacy === 'function') {
        legacy.call(screen, 'portrait');
      }
    } catch (_) {
      // Ignore: commonly fails when not in an allowed context.
    }
  }

  // Try ASAP.
  lockPortrait();

  // Retry on common lifecycle events.
  try {
    window.addEventListener('orientationchange', () => lockPortrait(), { passive: true });
    window.addEventListener('pageshow', () => lockPortrait(), { passive: true });
  } catch (_) {
    // ignore
  }

  try {
    document.addEventListener(
      'visibilitychange',
      () => {
        if (!document.hidden) lockPortrait();
      },
      { passive: true },
    );
  } catch (_) {
    // ignore
  }

  // Many browsers require a user activation to lock orientation.
  try {
    document.addEventListener('pointerdown', () => lockPortrait(), { once: true, capture: true });
  } catch (_) {
    // ignore
  }
})();

