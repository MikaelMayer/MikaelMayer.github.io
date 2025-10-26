// DelayCam application logic, wired to the DOM. Depends on DelayCamLogic.
(function () {
  'use strict';

  const liveVideo = document.getElementById('liveVideo');
  const delayedVideo = document.getElementById('delayedVideo');
  const miniLive = document.getElementById('miniLive');
  const overlay = document.getElementById('overlay');
  const switchBtn = document.getElementById('switchBtn');
  const copyLinkBtn = document.getElementById('copyLinkBtn');
  const recBtn = document.getElementById('recBtn');
  const cancelBtn = document.getElementById('cancelBtn');
  const recordDot = document.getElementById('recordDot');

  let stream;
  let currentFacingMode = 'environment';
  let tapCount = 0;
  let delayStartTime = null;
  let delayTimerInterval = null;
  let delayMs = 5000;
  let firstRecorder;
  let firstChunkPromise;
  let firstChunkBlob;

  let isRecording = false;
  let readyToSaveBlob = null;
  let suppressMiniClick = false;

  // Element-capture strategy state
  let elementRecorder = null;
  let elementRecorderChunks = [];
  let elementRecorderStopResolve = null;

  // Canvas-capture strategy state
  let canvasEl = null;
  let canvasCtx = null;
  let canvasRafId = null;
  let canvasStream = null;
  let canvasRecorder = null;
  let canvasRecorderChunks = [];
  let canvasRecorderStopResolve = null;

  // Optional silent audio to make containers more widely acceptable (e.g., WhatsApp)
  let silenceAudioContext = null;
  let silenceOscillator = null;
  let silenceGain = null;
  let silenceDestination = null;
  let silenceAudioTrack = null;

  function ensureSilenceAudioTrack() {
    try {
      if (silenceAudioTrack && silenceAudioTrack.readyState === 'live') return silenceAudioTrack;
      const AudioContextCtor = (window.AudioContext || window.webkitAudioContext);
      if (!AudioContextCtor) return null;
      silenceAudioContext = silenceAudioContext || new AudioContextCtor();
      silenceDestination = silenceAudioContext.createMediaStreamDestination();
      silenceOscillator = silenceAudioContext.createOscillator();
      silenceGain = silenceAudioContext.createGain();
      // Keep frames flowing but inaudible
      silenceGain.gain.value = 0.00001;
      silenceOscillator.connect(silenceGain).connect(silenceDestination);
      try { silenceOscillator.start(); } catch (_) { /* already started */ }
      const tracks = silenceDestination.stream.getAudioTracks();
      silenceAudioTrack = tracks && tracks[0] ? tracks[0] : null;
      return silenceAudioTrack || null;
    } catch (_) {
      return null;
    }
  }

  function cleanupSilenceAudioTrack() {
    try { if (silenceOscillator) silenceOscillator.stop(); } catch (_) {}
    try { if (silenceAudioTrack) silenceAudioTrack.stop(); } catch (_) {}
    try { if (silenceAudioContext && typeof silenceAudioContext.close === 'function') silenceAudioContext.close(); } catch (_) {}
    silenceOscillator = null;
    silenceGain = null;
    silenceDestination = null;
    silenceAudioTrack = null;
    silenceAudioContext = null;
  }

  function chooseBestMimeType() {
    // Prefer MP4/H.264 when available (better compatibility e.g., WhatsApp/iOS)
    const candidates = [
      // Common H.264 profiles (some browsers only expose bare video/mp4)
      'video/mp4; codecs="avc1.42E01E,mp4a.40.2"',
      'video/mp4; codecs="avc1.42E01E"',
      'video/mp4',
      // WebM fallbacks
      'video/webm; codecs=vp9',
      'video/webm; codecs=vp8',
      'video/webm'
    ];
    for (const type of candidates) {
      try {
        if (typeof MediaRecorder !== 'undefined' && MediaRecorder.isTypeSupported && MediaRecorder.isTypeSupported(type)) {
          return type;
        }
      } catch (_) { /* ignore */ }
    }
    return undefined;
  }

  function normalizeMimeType(mime) {
    if (!mime) return 'video/webm';
    const base = String(mime).split(';')[0].trim();
    return base || 'video/webm';
  }

  function getExtensionFromMime(mime) {
    const base = normalizeMimeType(mime);
    switch (base) {
      case 'video/mp4':
        return 'mp4';
      case 'video/ogg':
        return 'ogv';
      case 'video/webm':
      default:
        return 'webm';
    }
  }

  async function saveBlobAs(blob, suggestedName) {
    // Prefer modern File System Access API when available (desktop Chrome/Edge, some Android browsers)
    const w = /** @type {any} */ (window);
    if (typeof w.showSaveFilePicker === 'function') {
      try {
        const ext = `.${getExtensionFromMime(blob.type)}`;
        const handle = await w.showSaveFilePicker({
          suggestedName,
          types: [
            {
              description: 'Video',
              accept: { [normalizeMimeType(blob.type)]: [ext] }
            }
          ]
        });
        const writable = await handle.createWritable();
        await writable.write(blob);
        await writable.close();
        return true;
      } catch (_) {
        // fall through to anchor-based download
      }
    }

    // Fallback: anchor download with object URL (same-tab; no target)
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = suggestedName;
    a.style.display = 'none';
    document.body.appendChild(a);
    let clicked = false;
    try {
      a.click();
      clicked = true;
    } catch (_) {
      // Last resort: open new tab (may be blocked in some PWAs/iOS)
      try { window.open(url, '_blank', 'noopener'); } catch (_) {}
    } finally {
      // Revoke after a generous delay to avoid races on slow devices
      setTimeout(() => {
        try { a.remove(); } catch (_) {}
        try { URL.revokeObjectURL(url); } catch (_) {}
      }, 60000);
    }
    return clicked;
  }

  async function shareBlobOrSave(blob, suggestedName) {
    // Try native share first (better UX and direct handoff to WhatsApp)
    try {
      const file = new File([blob], suggestedName, { type: blob.type || 'video/mp4' });
      const canShareFiles = typeof navigator !== 'undefined' && navigator.canShare && navigator.canShare({ files: [file] });
      if (canShareFiles && typeof navigator.share === 'function') {
        await navigator.share({ files: [file], title: 'Delayed recording' });
        return true;
      }
    } catch (_) { /* fallback to save */ }
    return saveBlobAs(blob, suggestedName);
  }

  function formatTime(ms) {
    return DelayCamLogic.formatTime(ms);
  }

  async function getCameraStream(facingMode) {
    const attempts = [
      { video: { facingMode: { exact: facingMode } }, audio: false },
      { video: { facingMode }, audio: false },
      { video: true, audio: false }
    ];
    let lastError;
    for (const constraints of attempts) {
      try {
        return await navigator.mediaDevices.getUserMedia(constraints);
      } catch (e) {
        lastError = e;
      }
    }
    throw lastError || new Error('getUserMedia failed');
  }

  async function startCamera() {
    if (stream) stream.getTracks().forEach(t => t.stop());
    try {
      stream = await getCameraStream(currentFacingMode);
      liveVideo.srcObject = stream;
      miniLive.srcObject = stream;
      await liveVideo.play();
    } catch (e) {
      overlay.textContent = 'Camera error';
      console.error(e);
    }
  }

  function startStopwatch() {
    delayStartTime = performance.now();
    overlay.textContent = '0.0';
    delayTimerInterval = setInterval(() => {
      const ms = performance.now() - delayStartTime;
      overlay.textContent = formatTime(ms);
    }, 100);
  }

  function freezeDelay() {
    clearInterval(delayTimerInterval);
    delayMs = DelayCamLogic.computeDelayMs(delayStartTime, performance.now());
    overlay.textContent = `Delay: ${formatTime(delayMs)}`;
  }

  function startRecording() {
    return new Promise(resolve => {
      const recorder = new MediaRecorder(stream, { mimeType: 'video/webm; codecs=vp8' });
      let blob;
      recorder.ondataavailable = e => {
        if (e.data && e.data.size > 0) blob = e.data;
      };
      recorder.onstop = () => resolve(blob);
      recorder.start();
      firstRecorder = recorder;
    });
  }

  function stopRecording() {
    if (firstRecorder && firstRecorder.state === 'recording') {
      firstRecorder.stop();
    }
  }

  async function recordChunk(durationMs) {
    return new Promise(resolve => {
      const recorder = new MediaRecorder(stream, { mimeType: 'video/webm; codecs=vp8' });
      let blob;
      recorder.ondataavailable = e => {
        if (e.data && e.data.size > 0) blob = e.data;
      };
      recorder.onstop = () => resolve(blob);
      recorder.start();
      setTimeout(() => recorder.stop(), durationMs);
    });
  }

  async function playAndRecordLoop(initialChunk, durationMs) {
    let nextChunkPromise = recordChunk(durationMs);

    async function playChunk(blob) {
      return new Promise(resolve => {
        const url = URL.createObjectURL(blob);
        delayedVideo.src = url;
        delayedVideo.onloadeddata = () => delayedVideo.play();
        delayedVideo.onended = () => {
          URL.revokeObjectURL(url);
          resolve();
        };
        delayedVideo.onerror = () => {
          URL.revokeObjectURL(url);
          resolve();
        };
      });
    }

    while (true) {
      await playChunk(initialChunk);
      initialChunk = await nextChunkPromise;
      nextChunkPromise = recordChunk(durationMs);
    }
  }

  // Choose strategy once UI switches to delayed mode
  let recordingStrategy = DelayCamLogic.chooseRecordingStrategy({});

  function startElementCaptureRecording() {
    const srcStream = delayedVideo.captureStream ? delayedVideo.captureStream() : null;
    if (!srcStream) return;
    elementRecorderChunks = [];
    const recStream = new MediaStream();
    try { srcStream.getVideoTracks().forEach(t => recStream.addTrack(t)); } catch (_) {}
    const silentTrack = ensureSilenceAudioTrack();
    if (silentTrack) {
      try { recStream.addTrack(silentTrack); } catch (_) {}
    }
    const mimeType = chooseBestMimeType();
    const options = mimeType ? { mimeType, videoBitsPerSecond: 3_000_000, audioBitsPerSecond: 96_000 } : { videoBitsPerSecond: 3_000_000, audioBitsPerSecond: 96_000 };
    elementRecorder = new MediaRecorder(recStream, options);
    elementRecorder.ondataavailable = e => {
      if (e.data && e.data.size > 0) {
        elementRecorderChunks.push(e.data);
      }
    };
    elementRecorder.onstop = () => {
      if (elementRecorderStopResolve) {
        const chunkType = (elementRecorderChunks.find(c => c && c.type) || {}).type || (elementRecorder && elementRecorder.mimeType) || 'video/webm';
        const normalized = normalizeMimeType(chunkType);
        elementRecorderStopResolve(new Blob(elementRecorderChunks, { type: normalized }));
        elementRecorderStopResolve = null;
      }
    };
    // timeslice to ensure data is flushed periodically in headless/fake devices
    elementRecorder.start(200);
  }

  function stopElementCaptureRecording() {
    return new Promise(resolve => {
      elementRecorderStopResolve = resolve;
      if (elementRecorder && elementRecorder.state === 'recording') {
        try { elementRecorder.requestData(); } catch (_) {}
        elementRecorder.stop();
      } else {
        resolve(new Blob([], { type: 'video/webm' }));
      }
      // Clean up optional audio generators
      cleanupSilenceAudioTrack();
    });
  }

  function startCanvasCaptureRecording() {
    if (!delayedVideo) return;
    const sourceWidth = delayedVideo.videoWidth || 1280;
    const sourceHeight = delayedVideo.videoHeight || 720;
    // Constrain to 720p for broad compatibility and shareability
    const maxWidth = 1280;
    const maxHeight = 720;
    const scale = Math.min(maxWidth / sourceWidth, maxHeight / sourceHeight, 1);
    const width = Math.max(2, Math.floor(sourceWidth * scale));
    const height = Math.max(2, Math.floor(sourceHeight * scale));
    if (!canvasEl) {
      canvasEl = document.createElement('canvas');
      canvasEl.width = width;
      canvasEl.height = height;
      canvasCtx = canvasEl.getContext('2d');
    } else {
      canvasEl.width = width;
      canvasEl.height = height;
    }

    function drawFrame() {
      try {
        canvasCtx.drawImage(delayedVideo, 0, 0, canvasEl.width, canvasEl.height);
      } catch (_) {
        // ignore draw errors (e.g., while switching sources)
      }
      canvasRafId = requestAnimationFrame(drawFrame);
    }
    canvasRafId = requestAnimationFrame(drawFrame);

    canvasStream = canvasEl.captureStream ? canvasEl.captureStream(30) : null;
    if (!canvasStream) return;

    canvasRecorderChunks = [];
    const recStream = new MediaStream();
    try { canvasStream.getVideoTracks().forEach(t => recStream.addTrack(t)); } catch (_) {}
    const silentTrack = ensureSilenceAudioTrack();
    if (silentTrack) {
      try { recStream.addTrack(silentTrack); } catch (_) {}
    }
    const mimeType = chooseBestMimeType();
    const options = mimeType ? { mimeType, videoBitsPerSecond: 3_000_000, audioBitsPerSecond: 96_000 } : { videoBitsPerSecond: 3_000_000, audioBitsPerSecond: 96_000 };
    canvasRecorder = new MediaRecorder(recStream, options);
    canvasRecorder.ondataavailable = e => {
      if (e.data && e.data.size > 0) {
        canvasRecorderChunks.push(e.data);
      }
    };
    canvasRecorder.onstop = () => {
      if (canvasRecorderStopResolve) {
        const chunkType = (canvasRecorderChunks.find(c => c && c.type) || {}).type || (canvasRecorder && canvasRecorder.mimeType) || 'video/webm';
        const normalized = normalizeMimeType(chunkType);
        canvasRecorderStopResolve(new Blob(canvasRecorderChunks, { type: normalized }));
        canvasRecorderStopResolve = null;
      }
    };
    // timeslice ensures non-empty blob in short recordings
    canvasRecorder.start(200);
  }

  function stopCanvasCaptureRecording() {
    return new Promise(resolve => {
      canvasRecorderStopResolve = resolve;
      if (canvasRafId) {
        cancelAnimationFrame(canvasRafId);
        canvasRafId = null;
      }
      if (canvasStream) {
        try { canvasStream.getTracks().forEach(t => t.stop()); } catch (_) {}
        canvasStream = null;
      }
      if (canvasRecorder && canvasRecorder.state === 'recording') {
        try { canvasRecorder.requestData(); } catch (_) {}
        canvasRecorder.stop();
      } else {
        resolve(new Blob([], { type: 'video/webm' }));
      }
      // Clean up optional audio generators
      cleanupSilenceAudioTrack();
    });
  }

  async function toggleRecording() {
    if (!isRecording) {
      // If a previous recording is ready to save, treat this click as the save gesture
      if (readyToSaveBlob && readyToSaveBlob.size > 0) {
        const blob = readyToSaveBlob;
        readyToSaveBlob = null;
        const ext = getExtensionFromMime(blob.type);
        const filename = `delayed-recording-${Date.now()}.${ext}`;
        try {
          recBtn.disabled = true;
          await shareBlobOrSave(blob, filename);
        } finally {
          recBtn.disabled = false;
          recBtn.textContent = 'REC';
          try { cancelBtn.style.display = 'none'; } catch (_) {}
        }
        return;
      }

      isRecording = true;
      recBtn.textContent = 'STOP';
      try { recBtn.classList.add('recording'); } catch (_) {}
      recordDot.style.display = 'block';
      try { cancelBtn.style.display = 'inline-block'; } catch (_) {}
      if (recordingStrategy === 'element-capture' && delayedVideo.captureStream) {
        startElementCaptureRecording();
      } else if (recordingStrategy === 'canvas-capture') {
        startCanvasCaptureRecording();
      } else {
        // Unsupported: keep button label consistent but do nothing
        recBtn.textContent = 'REC';
        try { recBtn.classList.remove('recording'); } catch (_) {}
        recordDot.style.display = 'none';
        isRecording = false;
        overlay.textContent = 'Recording unsupported on this browser';
        return;
      }
    } else {
      isRecording = false;
      recBtn.textContent = '…';
      try { recBtn.disabled = true; } catch (_) {}
      recordDot.style.display = 'none';
      try { recBtn.classList.remove('recording'); } catch (_) {}

      let blob = null;
      if (recordingStrategy === 'element-capture') {
        blob = await stopElementCaptureRecording();
      } else if (recordingStrategy === 'canvas-capture') {
        blob = await stopCanvasCaptureRecording();
      }

      if (blob && blob.size > 0) {
        readyToSaveBlob = blob;
        // Label should reflect share capability when available
        const supportsShare = (function () {
          try {
            const file = new File([new Blob(['x'], { type: 'video/webm' })], 'x.webm', { type: 'video/webm' });
            return !!(navigator && navigator.canShare && navigator.share && navigator.canShare({ files: [file] }));
          } catch (_) { return false; }
        }());
        recBtn.textContent = supportsShare ? 'SHARE' : 'SAVE';
      } else {
        recBtn.textContent = 'REC';
        try { cancelBtn.style.display = 'none'; } catch (_) {}
      }
      try { recBtn.disabled = false; } catch (_) {}
    }
  }

  // UI wiring
  liveVideo.addEventListener('click', async () => {
    tapCount++;
    if (tapCount === 1) {
      switchBtn.style.display = 'none';
      if (copyLinkBtn) copyLinkBtn.style.display = 'none';
      startStopwatch();
      firstChunkPromise = startRecording();
    } else if (tapCount === 2) {
      freezeDelay();
      stopRecording();
      firstChunkBlob = await firstChunkPromise;

      liveVideo.style.display = 'none';
      delayedVideo.style.display = 'block';
      miniLive.style.display = 'block';
      recBtn.style.display = 'block';

      // Decide based on runtime capability; hide record button if unsupported
      recordingStrategy = DelayCamLogic.chooseRecordingStrategy({
        canCaptureElement: !!(delayedVideo && delayedVideo.captureStream),
        canCaptureCanvas: !!(typeof HTMLCanvasElement !== 'undefined' && HTMLCanvasElement.prototype && HTMLCanvasElement.prototype.captureStream)
      });
      if (recordingStrategy === 'unsupported') {
        recBtn.style.display = 'none';
        overlay.textContent = 'Recording not supported in this browser';
      }
      playAndRecordLoop(firstChunkBlob, delayMs);
    }
  });

  switchBtn.addEventListener('click', async () => {
    currentFacingMode = currentFacingMode === 'user' ? 'environment' : 'user';
    await startCamera();
  });

  // Share/Copy app link button: show early; prefer native share; fallback to clipboard
  if (copyLinkBtn) {
    const HARD_CODED_APP_URL = 'https://mikaelmayer.github.io/apps/videodelay/';
    const canNativeShareLink = (() => {
      try {
        return typeof navigator !== 'undefined' && typeof navigator.share === 'function';
      } catch (_) { return false; }
    })();

    try {
      copyLinkBtn.style.display = 'inline-block';
      copyLinkBtn.textContent = canNativeShareLink ? 'share app link 🔗' : 'copy app link 🔗';
      copyLinkBtn.setAttribute('aria-label', canNativeShareLink ? 'Share app link' : 'Copy app link');
    } catch (_) {}

    copyLinkBtn.addEventListener('click', async () => {
      const url = HARD_CODED_APP_URL; // avoid PWA scope issues
      try {
        if (canNativeShareLink) {
          try {
            await navigator.share({
              url,
              title: 'Capture key moments without filling your phone',
              text: 'Record key soccer moments or catch shooting stars with a delayed camera. Free and ad‑free forever.'
            });
            return;
          } catch (_) {
            // fall through to clipboard
          }
        }

        if (navigator.clipboard && navigator.clipboard.writeText) {
          await navigator.clipboard.writeText(url);
        } else {
          const ta = document.createElement('textarea');
          ta.value = url;
          ta.setAttribute('readonly', '');
          ta.style.position = 'absolute';
          ta.style.left = '-9999px';
          document.body.appendChild(ta);
          ta.select();
          document.execCommand('copy');
          document.body.removeChild(ta);
        }
        const previous = copyLinkBtn.textContent;
        copyLinkBtn.textContent = 'copied! ✅';
        setTimeout(() => { try { copyLinkBtn.textContent = previous || (canNativeShareLink ? 'share app link 🔗' : 'copy app link 🔗'); } catch (_) {} }, 1500);
      } catch (_) {
        // no-op
      }
    });
  }

  miniLive.addEventListener('click', (e) => {
    if (suppressMiniClick) {
      try { e.preventDefault(); } catch (_) {}
      return;
    }
    location.reload();
  });

  // Press-and-hold behavior on the miniature: while pointer is down on #miniLive,
  // show the live feed on the big screen; when released, restore dual view.
  (function setupPressHoldSwap() {
    function showLiveFull() {
      // Show live in big, hide delayed
      liveVideo.style.display = 'block';
      delayedVideo.style.display = 'none';
      // Hide miniature to avoid recursion/overlay
      miniLive.style.opacity = '0.4';
      suppressMiniClick = true;
    }
    function restoreDual() {
      // Restore delayed big + mini live
      delayedVideo.style.display = 'block';
      liveVideo.style.display = 'none';
      miniLive.style.opacity = '1';
      // Briefly suppress click to avoid accidental reload after press-hold
      suppressMiniClick = true;
      setTimeout(() => { suppressMiniClick = false; }, 200);
    }
    ['pointerdown','mousedown','touchstart'].forEach(evt => {
      miniLive.addEventListener(evt, (e) => { e.preventDefault(); showLiveFull(); }, { passive: false });
    });
    ['pointerup','pointercancel','mouseleave','mouseup','touchend','touchcancel'].forEach(evt => {
      miniLive.addEventListener(evt, (e) => { e.preventDefault(); restoreDual(); }, { passive: false });
    });
  }());

  recBtn.addEventListener('click', () => { void toggleRecording(); });

  // Cancel button: stop current recording (if any) and reset UI to REC
  if (cancelBtn) {
    cancelBtn.addEventListener('click', async () => {
      if (isRecording) {
        // Stop underlying recorders but discard any ready blob
        isRecording = false;
        recBtn.textContent = '…';
        try { recBtn.disabled = true; } catch (_) {}
        recordDot.style.display = 'none';
        try { recBtn.classList.remove('recording'); } catch (_) {}
        if (recordingStrategy === 'element-capture') {
          await stopElementCaptureRecording();
        } else if (recordingStrategy === 'canvas-capture') {
          await stopCanvasCaptureRecording();
        }
      }
      readyToSaveBlob = null; // discard any staged blob
      recBtn.textContent = 'REC';
      try { recBtn.disabled = false; } catch (_) {}
      try { cancelBtn.style.display = 'none'; } catch (_) {}
    });
  }

  startCamera();

  if ('serviceWorker' in navigator) {
    try { navigator.serviceWorker.register('service-worker.js'); } catch (_) {}
  }
}());