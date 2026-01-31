// apps/reflex4you/wake-lock.js
//
// Best-effort "keep screen awake" for installed PWAs / supported browsers.
// Uses the Screen Wake Lock API when available.
//
// Notes:
// - Many platforms do not support wake locks (notably iOS Safari).
// - Some browsers require a user activation; we retry on first interactions.
// - Wake locks are released when the page is hidden; we re-acquire on resume.

(function () {
  /** @type {WakeLockSentinel | null} */
  let sentinel = null;

  function supported() {
    try {
      return typeof navigator !== 'undefined' && navigator.wakeLock && typeof navigator.wakeLock.request === 'function';
    } catch (_) {
      return false;
    }
  }

  async function release() {
    try {
      if (sentinel && typeof sentinel.release === 'function') {
        await sentinel.release();
      }
    } catch (_) {
      // ignore
    } finally {
      sentinel = null;
    }
  }

  async function request() {
    try {
      if (!supported()) return;
      if (typeof document !== 'undefined' && document.hidden) return;
      if (sentinel) return;

      sentinel = await navigator.wakeLock.request('screen');
      if (sentinel && typeof sentinel.addEventListener === 'function') {
        sentinel.addEventListener('release', () => {
          sentinel = null;
        });
      }
    } catch (_) {
      // Common failure modes:
      // - NotAllowedError (no user activation / permission policy)
      // - NotSupportedError (platform)
      // We'll retry on the next lifecycle/user event.
      sentinel = null;
    }
  }

  // Try ASAP (works in many Chromium PWAs).
  request();

  // Lifecycle: reacquire on resume; release when backgrounded.
  try {
    document.addEventListener(
      'visibilitychange',
      () => {
        if (document.hidden) release();
        else request();
      },
      { passive: true },
    );
  } catch (_) {
    // ignore
  }

  try {
    window.addEventListener('pageshow', () => request(), { passive: true });
    window.addEventListener('pagehide', () => release(), { passive: true });
  } catch (_) {
    // ignore
  }

  // Many browsers require a user activation; retry on first interactions.
  try {
    const onActivate = () => request();
    document.addEventListener('pointerdown', onActivate, { passive: true, capture: true });
    document.addEventListener('keydown', onActivate, { passive: true, capture: true });
  } catch (_) {
    // ignore
  }
})();

