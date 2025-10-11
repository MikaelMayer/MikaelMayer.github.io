(function (root, factory) {
  if (typeof module !== 'undefined' && module.exports) {
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

  function computeDelayMs(delayStartMs, nowMs) {
    const diff = nowMs - delayStartMs;
    const rounded = Math.round(diff / 100) * 100;
    return Math.max(1000, rounded);
  }

  // Strategy selector: naive initial implementation (will be fixed by tests)
  function chooseRecordingStrategy(mimeType) {
    // options: 'concatenate', 'singleRecorder'
    // Initial buggy implementation assumes concatenation is fine for all types
    return 'concatenate';
  }

  function buildDownloadBlob(chunks, mimeType) {
    // Initial naive concatenation of chunks into a single Blob
    return new Blob(chunks, { type: mimeType || 'application/octet-stream' });
  }

  return {
    formatTime,
    computeDelayMs,
    chooseRecordingStrategy,
    buildDownloadBlob,
  };
}));
