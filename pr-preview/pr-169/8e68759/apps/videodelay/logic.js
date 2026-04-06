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

  function canCaptureCanvasStream() {
    try {
      return typeof HTMLCanvasElement !== 'undefined' &&
             HTMLCanvasElement.prototype &&
             typeof HTMLCanvasElement.prototype.captureStream === 'function';
    } catch (_) {
      return false;
    }
  }

  // Naive concatenation of WebM chunks (kept for tests/fallback).
  function combineWebMChunks(chunks) {
    return new Blob(chunks, { type: 'video/webm' });
  }

  // ---------------------------------------------------------------------------
  // WebM duration metadata fix.
  //
  // MediaRecorder with timeslice writes the EBML/Matroska header in the first
  // chunk without knowing the final duration, so the Duration element is either
  // missing or carries a placeholder value. Sharing platforms read this metadata
  // to display the video length, resulting in an incorrect duration label even
  // though the actual media stream plays back at the correct length.
  //
  // This function patches (or inserts) the Duration element in the Segment>Info
  // section of a WebM blob so that it reflects the true recording duration.
  // ---------------------------------------------------------------------------

  function fixWebmDuration(blob, durationMs) {
    return new Promise(function (resolve) {
      if (!blob || blob.size === 0 || !(durationMs > 0)) { resolve(blob); return; }
      var base = (blob.type || '').split(';')[0].trim().toLowerCase();
      if (base !== 'video/webm') { resolve(blob); return; }

      var reader = new FileReader();
      reader.onload = function () {
        try {
          var buf = new Uint8Array(reader.result);
          var patched = patchWebmDurationInBuffer(buf, durationMs);
          resolve(new Blob([patched || buf], { type: blob.type }));
        } catch (_) {
          resolve(blob);
        }
      };
      reader.onerror = function () { resolve(blob); };
      reader.readAsArrayBuffer(blob);
    });
  }

  function patchWebmDurationInBuffer(data, durationMs) {
    var EBML_ID    = 0x1A45DFA3;
    var SEGMENT_ID = 0x18538067;
    var INFO_ID    = 0x1549A966;
    var DURATION_ID = 0x4489;

    function readId(d, o) {
      if (o >= d.length) return null;
      var b = d[o], w = 1, m = 0x80;
      while (w <= 4 && !(b & m)) { w++; m >>>= 1; }
      if (w > 4) return null;
      var v = b;
      for (var i = 1; i < w; i++) {
        if (o + i >= d.length) return null;
        v = v * 256 + d[o + i];
      }
      return { id: v, len: w };
    }

    function readSize(d, o) {
      if (o >= d.length) return null;
      var b = d[o], w = 1, m = 0x80;
      while (w <= 8 && !(b & m)) { w++; m >>>= 1; }
      if (w > 8) return null;
      var v = b & (m - 1);
      var unknown = v === (m - 1);
      for (var i = 1; i < w; i++) {
        if (o + i >= d.length) return null;
        v = v * 256 + d[o + i];
        if (d[o + i] !== 0xFF) unknown = false;
      }
      return { size: unknown ? -1 : v, len: w };
    }

    function encodeSize(v) {
      if (v < 0x7F)       return [0x80 | v];
      if (v < 0x3FFF)     return [0x40 | ((v >>> 8) & 0x3F), v & 0xFF];
      if (v < 0x1FFFFF)   return [0x20 | ((v >>> 16) & 0x1F), (v >>> 8) & 0xFF, v & 0xFF];
      if (v < 0x0FFFFFFF) return [0x10 | ((v >>> 24) & 0x0F), (v >>> 16) & 0xFF, (v >>> 8) & 0xFF, v & 0xFF];
      return [0x01, 0, 0, 0, (v >>> 24) & 0xFF, (v >>> 16) & 0xFF, (v >>> 8) & 0xFF, v & 0xFF];
    }

    function writeF64(arr, off, val) {
      var dv = new DataView(arr.buffer, arr.byteOffset, arr.byteLength);
      dv.setFloat64(off, val, false);
    }
    function writeF32(arr, off, val) {
      var dv = new DataView(arr.buffer, arr.byteOffset, arr.byteLength);
      dv.setFloat32(off, val, false);
    }

    var pos = 0;

    // Skip EBML header
    var ebml = readId(data, pos);
    if (!ebml || ebml.id !== EBML_ID) return null;
    pos += ebml.len;
    var ebmlSz = readSize(data, pos);
    if (!ebmlSz || ebmlSz.size < 0) return null;
    pos += ebmlSz.len + ebmlSz.size;

    // Segment
    var seg = readId(data, pos);
    if (!seg || seg.id !== SEGMENT_ID) return null;
    pos += seg.len;
    var segSz = readSize(data, pos);
    if (!segSz) return null;
    pos += segSz.len;
    var segEnd = segSz.size < 0 ? data.length : pos + segSz.size;

    // Scan Segment children for Info
    while (pos < segEnd && pos < data.length) {
      var el = readId(data, pos);
      if (!el) break;
      var szOff = pos + el.len;
      var sz = readSize(data, szOff);
      if (!sz) break;
      var dStart = szOff + sz.len;
      if (sz.size < 0) break;
      var dEnd = dStart + sz.size;

      if (el.id === INFO_ID) {
        // Scan Info children for Duration
        var ip = dStart;
        while (ip < dEnd) {
          var ie = readId(data, ip);
          if (!ie) break;
          var iSzOff = ip + ie.len;
          var iSz = readSize(data, iSzOff);
          if (!iSz || iSz.size < 0) break;
          var iDStart = iSzOff + iSz.len;

          if (ie.id === DURATION_ID) {
            var out = new Uint8Array(data);
            if (iSz.size === 8) writeF64(out, iDStart, durationMs);
            else if (iSz.size === 4) writeF32(out, iDStart, durationMs);
            else return null;
            return out;
          }
          ip = iDStart + iSz.size;
        }

        // Duration not found – insert it at the end of the Info section.
        // Element: ID 0x4489 (2 B) + size VINT 0x88 (1 B, value=8) + float64 (8 B) = 11 B
        var durEl = new Uint8Array(11);
        durEl[0] = 0x44; durEl[1] = 0x89; durEl[2] = 0x88;
        new DataView(durEl.buffer).setFloat64(3, durationMs, false);

        var newInfoSz = sz.size + 11;
        var newSzBytes = encodeSize(newInfoSz);

        var before   = data.subarray(0, pos + el.len);
        var infoData = data.subarray(dStart, dEnd);
        var after    = data.subarray(dEnd);

        var total = before.length + newSzBytes.length + infoData.length + durEl.length + after.length;
        var result = new Uint8Array(total);
        var o = 0;
        result.set(before, o);                       o += before.length;
        result.set(new Uint8Array(newSzBytes), o);   o += newSzBytes.length;
        result.set(infoData, o);                     o += infoData.length;
        result.set(durEl, o);                        o += durEl.length;
        result.set(after, o);
        return result;
      }

      pos = dEnd;
    }
    return null;
  }

  // Decide how to record the delayed playback.
  // If the browser supports capturing a media element stream, prefer that.
  // Otherwise, if canvas capture is supported, use that.
  // If neither is supported, report as unsupported. No fallbacks.
  function chooseRecordingStrategy(capabilities) {
    const canCaptureCanvas = typeof (capabilities && capabilities.canCaptureCanvas) === 'boolean'
      ? capabilities.canCaptureCanvas
      : canCaptureCanvasStream();
    if (canCaptureCanvas) return 'canvas-capture';

    const canCaptureElement = typeof (capabilities && capabilities.canCaptureElement) === 'boolean'
      ? capabilities.canCaptureElement
      : canCaptureElementStream();
    if (canCaptureElement) return 'element-capture';

    return 'unsupported';
  }

  return {
    formatTime,
    computeDelayMs,
    combineWebMChunks,
    fixWebmDuration,
    chooseRecordingStrategy,
    canCaptureElementStream,
    canCaptureCanvasStream
  };
}));