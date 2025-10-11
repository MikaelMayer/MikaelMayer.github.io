(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.DelayCamLogic = factory();
  }
}(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  function formatTime(ms) {
    const seconds = Math.floor(ms / 1000);
    const deci = Math.floor((ms % 1000) / 100);
    return `${seconds}.${deci}`;
  }

  function computeDelayMs(delayStartTime, now) {
    const elapsed = Math.max(0, now - delayStartTime);
    const quantized = Math.round(elapsed / 100) * 100; // 100ms steps
    return Math.max(1000, quantized);
  }

  function canCaptureElementStream() {
    try {
      return typeof HTMLMediaElement !== 'undefined' &&
             HTMLMediaElement.prototype &&
             typeof HTMLMediaElement.prototype.captureStream === 'function';
    } catch (_) {
      return false;
    }
  }

  // Naive concatenation of WebM chunks. This is known to be unsafe
  // because WebM containers contain their own headers and timestamps.
  // We keep it for fallback and to write tests that fail first.
  function combineWebMChunks(chunks) {
    return new Blob(chunks, { type: 'video/webm' });
  }

  // Decide how to record the delayed playback.
  // If the browser supports capturing a media element stream, prefer that.
  // Otherwise fall back to concatenating chunks (problematic but universal).
  function chooseRecordingStrategy(capabilities) {
    const canCapture = typeof (capabilities && capabilities.canCaptureElement) === 'boolean'
      ? capabilities.canCaptureElement
      : canCaptureElementStream();
    return canCapture ? 'element-capture' : 'concat-chunks';
  }

  return {
    formatTime,
    computeDelayMs,
    combineWebMChunks,
    chooseRecordingStrategy,
    canCaptureElementStream
  };
}));
