// DelayCam application logic, wired to the DOM. Depends on DelayCamLogic.
(function () {
  'use strict';

  // ---- DOM references ----
  const liveVideo = document.getElementById('liveVideo');
  const delayedVideo = document.getElementById('delayedVideo');
  const frozenView = document.getElementById('frozenView');
  const countdownText = document.getElementById('countdownText');
  const delayLabel = document.getElementById('delayLabel');
  const switchBtn = document.getElementById('switchBtn');
  const copyLinkBtn = document.getElementById('copyLinkBtn');
  const recBtn = document.getElementById('recBtn');
  const cancelBtn = document.getElementById('cancelBtn');
  const recordDot = document.getElementById('recordDot');
  const zoomControls = document.getElementById('zoomControls');

  // ---- Camera state ----
  let stream;
  let currentFacingMode = 'environment';
  let currentZoomScale = 1;
  let lastAppliedZoomScale = 1;
  let ptzSupportedOnCurrentTrack = false;

  // ---- Delay configuration (localStorage) ----
  const DELAY_STORAGE_KEY = 'videodelay_seconds';
  let delayMs = (function () {
    try {
      const stored = localStorage.getItem(DELAY_STORAGE_KEY);
      if (stored) {
        const val = parseInt(stored, 10);
        if (val > 0) return val * 1000;
      }
    } catch (_) {}
    return 10000;
  })();

  // ---- View state ----
  let mainIsLive = true;
  let delayReady = false;
  let delayProcessActive = false;
  let delayGeneration = 0;
  let countdownRemaining = 0;
  let countdownInterval = null;
  let countdownDone = false;
  let firstChunkReady = false;
  let firstChunkBlob = null;

  // ---- First-chunk recording state (delay mechanism) ----
  let firstRecorder;
  let firstChunkPromise;
  let firstRecorderUsesCanvas = false;
  let firstRecorderCleanup = null;

  // ---- User recording state (save/share) ----
  let isRecording = false;
  let recordStartTime = 0;
  let readyToSaveBlob = null;
  let recordingStrategy = DelayCamLogic.chooseRecordingStrategy({});

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

  // Live zoom canvas for chunk recording when PTZ is unavailable
  let liveZoomCanvasEl = null;
  let liveZoomCanvasCtx = null;
  let liveZoomCanvasRafId = null;
  let liveZoomCanvasStream = null;

  // Silent audio for recording compatibility
  let silenceAudioContext = null;
  let silenceOscillator = null;
  let silenceGain = null;
  let silenceDestination = null;
  let silenceAudioTrack = null;

  // ========================================================================
  // Silence audio helpers
  // ========================================================================

  function ensureSilenceAudioTrack() {
    try {
      if (silenceAudioTrack && silenceAudioTrack.readyState === 'live') return silenceAudioTrack;
      const AudioContextCtor = (window.AudioContext || window.webkitAudioContext);
      if (!AudioContextCtor) return null;
      silenceAudioContext = silenceAudioContext || new AudioContextCtor();
      silenceDestination = silenceAudioContext.createMediaStreamDestination();
      silenceOscillator = silenceAudioContext.createOscillator();
      silenceGain = silenceAudioContext.createGain();
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

  // ========================================================================
  // MIME type and file helpers
  // ========================================================================

  function chooseBestMimeType() {
    const candidates = [
      'video/mp4; codecs="avc1.42E01E,mp4a.40.2"',
      'video/mp4; codecs="avc1.42E01E"',
      'video/mp4',
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

  // ========================================================================
  // Save / Share helpers
  // ========================================================================

  async function saveBlobAs(blob, suggestedName) {
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
      try { window.open(url, '_blank', 'noopener'); } catch (_) {}
    } finally {
      setTimeout(() => {
        try { a.remove(); } catch (_) {}
        try { URL.revokeObjectURL(url); } catch (_) {}
      }, 60000);
    }
    return clicked;
  }

  async function shareBlobOrSave(blob, suggestedName) {
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

  // ========================================================================
  // Camera
  // ========================================================================

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
      await liveVideo.play();
      try { await applyZoom(currentZoomScale); } catch (_) {}

      function onReady() {
        if (!delayProcessActive || !delayReady) beginDelayProcess();
      }
      liveVideo.addEventListener('loadeddata', onReady, { once: true });
      if (liveVideo.readyState >= 2) onReady();
    } catch (e) {
      delayLabel.textContent = 'Camera error';
      console.error(e);
    }
  }

  // ========================================================================
  // Layout management
  // ========================================================================

  function updateDelayLabel() {
    const seconds = Math.round(delayMs / 1000);
    delayLabel.textContent = `Delay ${seconds}s`;
  }

  function setMainPosition(el) {
    el.style.position = 'absolute';
    el.style.top = '0';
    el.style.left = '0';
    el.style.bottom = 'auto';
    el.style.right = 'auto';
    el.style.width = '100vw';
    el.style.height = '100vh';
    el.style.borderRadius = '0';
    el.style.zIndex = '1';
    el.style.boxSizing = 'border-box';
    el.style.cursor = 'default';
    el.style.overflow = 'hidden';
  }

  function setThumbPosition(el) {
    el.style.position = 'absolute';
    el.style.top = 'auto';
    el.style.left = 'auto';
    el.style.bottom = '10px';
    el.style.right = '10px';
    el.style.width = '25vw';
    el.style.height = '20vh';
    el.style.borderRadius = '8px';
    el.style.zIndex = '2';
    el.style.boxSizing = 'border-box';
    el.style.cursor = 'pointer';
    el.style.overflow = 'hidden';
  }

  function updateLayout() {
    if (!delayProcessActive) {
      setMainPosition(liveVideo);
      liveVideo.style.display = 'block';
      liveVideo.style.border = 'none';
      delayedVideo.style.display = 'none';
      frozenView.style.display = 'none';
      recBtn.style.display = 'none';
      cancelBtn.style.display = 'none';
      return;
    }

    const showFrozen = !delayReady;

    if (mainIsLive) {
      // Big view: live
      setMainPosition(liveVideo);
      liveVideo.style.display = 'block';
      liveVideo.style.border = 'none';

      if (showFrozen) {
        // Thumb: frozen frame with countdown
        setThumbPosition(frozenView);
        frozenView.style.display = 'flex';
        frozenView.style.border = '4px solid yellow';
        delayedVideo.style.display = 'none';
      } else {
        // Thumb: delayed video
        setThumbPosition(delayedVideo);
        delayedVideo.style.display = 'block';
        delayedVideo.style.border = '4px solid yellow';
        frozenView.style.display = 'none';
      }
    } else {
      // Thumb: live
      setThumbPosition(liveVideo);
      liveVideo.style.display = 'block';
      liveVideo.style.border = '2px solid white';

      if (showFrozen) {
        // Big view: frozen frame with countdown
        setMainPosition(frozenView);
        frozenView.style.display = 'flex';
        frozenView.style.border = '4px solid yellow';
        delayedVideo.style.display = 'none';
      } else {
        // Big view: delayed video
        setMainPosition(delayedVideo);
        delayedVideo.style.display = 'block';
        delayedVideo.style.border = '4px solid yellow';
        frozenView.style.display = 'none';
      }
    }

    // Countdown text size adapts to which slot frozenView occupies
    if (showFrozen) {
      const frozenIsMain = !mainIsLive;
      countdownText.style.fontSize = frozenIsMain ? '20vmin' : '8vh';
    }

    // Zoom and camera-switch controls: visible only when live is the big view
    zoomControls.style.display = mainIsLive ? 'flex' : 'none';
    switchBtn.style.display = mainIsLive ? 'flex' : 'none';

    // REC button: visible only when big=delayed AND delayed stream is ready
    const showRec = !mainIsLive && delayReady;
    recBtn.style.display = showRec ? 'block' : 'none';
    if (!showRec && !isRecording && !readyToSaveBlob) {
      cancelBtn.style.display = 'none';
    }

    // Re-apply CSS zoom to the element in main position only
    try { applyCssZoomToMainOnly(); } catch (_) {}
  }

  function applyCssZoomToMainOnly() {
    if (ptzSupportedOnCurrentTrack) {
      liveVideo.style.transform = '';
      delayedVideo.style.transform = '';
      return;
    }
    setVisualZoom(currentZoomScale);
  }

  // ========================================================================
  // Delay process
  // ========================================================================

  function beginDelayProcess() {
    delayProcessActive = true;
    delayGeneration++;
    const gen = delayGeneration;

    // Reset state
    if (countdownInterval) clearInterval(countdownInterval);
    stopFirstChunkRecording();
    countdownDone = false;
    firstChunkReady = false;
    firstChunkBlob = null;
    delayReady = false;

    // Hide copy-link button once delay process starts
    if (copyLinkBtn) copyLinkBtn.style.display = 'none';

    // Capture first frame for frozen view background
    captureFirstFrame();

    // Start recording the first chunk
    firstChunkPromise = startFirstChunkRecording();
    firstChunkPromise.then(blob => {
      if (gen !== delayGeneration) return;
      firstChunkBlob = blob;
      firstChunkReady = true;
      tryStartDelayed();
    });

    // Auto-stop recording after delayMs
    setTimeout(() => {
      if (gen !== delayGeneration) return;
      stopFirstChunkRecording();
    }, delayMs);

    // Countdown
    countdownRemaining = Math.ceil(delayMs / 1000);
    updateCountdownDisplay();
    countdownInterval = setInterval(() => {
      if (gen !== delayGeneration) { clearInterval(countdownInterval); return; }
      countdownRemaining--;
      if (countdownRemaining <= 0) {
        countdownRemaining = 0;
        clearInterval(countdownInterval);
        countdownDone = true;
        updateCountdownDisplay();
        tryStartDelayed();
        return;
      }
      updateCountdownDisplay();
    }, 1000);

    updateLayout();
  }

  function captureFirstFrame() {
    try {
      const vw = liveVideo.videoWidth || 640;
      const vh = liveVideo.videoHeight || 480;
      const maxDim = 640;
      const scale = Math.min(maxDim / vw, maxDim / vh, 1);
      const w = Math.round(vw * scale);
      const h = Math.round(vh * scale);
      const c = document.createElement('canvas');
      c.width = w;
      c.height = h;
      c.getContext('2d').drawImage(liveVideo, 0, 0, w, h);
      frozenView.style.backgroundImage = `url(${c.toDataURL('image/jpeg', 0.7)})`;
    } catch (_) {
      frozenView.style.backgroundColor = '#333';
    }
  }

  function updateCountdownDisplay() {
    countdownText.textContent = countdownRemaining > 0 ? String(countdownRemaining) : '';
  }

  function tryStartDelayed() {
    if (delayReady) return;
    if (!countdownDone || !firstChunkReady) return;
    delayReady = true;

    recordingStrategy = DelayCamLogic.chooseRecordingStrategy({
      canCaptureElement: !!(delayedVideo && delayedVideo.captureStream),
      canCaptureCanvas: !!(typeof HTMLCanvasElement !== 'undefined' &&
        HTMLCanvasElement.prototype && HTMLCanvasElement.prototype.captureStream)
    });

    updateLayout();
    playAndRecordLoop(firstChunkBlob, delayMs);
  }

  // ========================================================================
  // First-chunk recording (for delay mechanism)
  // ========================================================================

  function startFirstChunkRecording() {
    return new Promise(resolve => {
      const useCanvas = !ptzSupportedOnCurrentTrack && typeof HTMLCanvasElement !== 'undefined';
      firstRecorderUsesCanvas = useCanvas;
      let sourceStream;

      if (useCanvas) {
        const sw = liveVideo.videoWidth || 1280;
        const sh = liveVideo.videoHeight || 720;
        if (!liveZoomCanvasEl) {
          liveZoomCanvasEl = document.createElement('canvas');
          liveZoomCanvasEl.width = Math.max(2, sw);
          liveZoomCanvasEl.height = Math.max(2, sh);
          liveZoomCanvasCtx = liveZoomCanvasEl.getContext('2d');
        } else {
          liveZoomCanvasEl.width = Math.max(2, sw);
          liveZoomCanvasEl.height = Math.max(2, sh);
        }

        function drawLiveZoomed() {
          try {
            const scale = Math.max(1, Number(currentZoomScale) || 1);
            const vw = liveVideo.videoWidth || sw;
            const vh = liveVideo.videoHeight || sh;
            if (vw > 0 && vh > 0) {
              if (scale > 1) {
                const srcW = Math.max(2, Math.floor(vw / scale));
                const srcH = Math.max(2, Math.floor(vh / scale));
                const srcX = Math.floor((vw - srcW) / 2);
                const srcY = Math.floor((vh - srcH) / 2);
                liveZoomCanvasCtx.drawImage(liveVideo, srcX, srcY, srcW, srcH, 0, 0, liveZoomCanvasEl.width, liveZoomCanvasEl.height);
              } else {
                liveZoomCanvasCtx.drawImage(liveVideo, 0, 0, liveZoomCanvasEl.width, liveZoomCanvasEl.height);
              }
            }
          } catch (_) {}
          liveZoomCanvasRafId = requestAnimationFrame(drawLiveZoomed);
        }
        liveZoomCanvasRafId = requestAnimationFrame(drawLiveZoomed);
        liveZoomCanvasStream = liveZoomCanvasEl.captureStream ? liveZoomCanvasEl.captureStream(30) : null;
        sourceStream = liveZoomCanvasStream || stream;
        firstRecorderCleanup = () => {
          if (liveZoomCanvasRafId) { cancelAnimationFrame(liveZoomCanvasRafId); liveZoomCanvasRafId = null; }
          try { if (liveZoomCanvasStream) liveZoomCanvasStream.getTracks().forEach(t => t.stop()); } catch (_) {}
          liveZoomCanvasStream = null;
        };
      } else {
        sourceStream = stream;
        firstRecorderCleanup = null;
      }

      const recorder = new MediaRecorder(sourceStream, { mimeType: 'video/webm; codecs=vp8' });
      let blob;
      recorder.ondataavailable = e => {
        if (e.data && e.data.size > 0) blob = e.data;
      };
      recorder.onstop = () => {
        try { if (firstRecorderCleanup) firstRecorderCleanup(); } catch (_) {}
        resolve(blob);
      };
      recorder.start();
      firstRecorder = recorder;
    });
  }

  function stopFirstChunkRecording() {
    if (firstRecorder && firstRecorder.state === 'recording') {
      firstRecorder.stop();
    }
    try { if (firstRecorderCleanup) firstRecorderCleanup(); } catch (_) {}
    firstRecorderCleanup = null;
  }

  // ========================================================================
  // Chunk recording for playback loop
  // ========================================================================

  async function recordChunk(durationMs) {
    return new Promise(resolve => {
      const useCanvas = !ptzSupportedOnCurrentTrack && typeof HTMLCanvasElement !== 'undefined';
      let localRaf = null;
      let localCanvas = null;
      let localCtx = null;
      let srcStream = stream;
      if (useCanvas) {
        const sw = liveVideo.videoWidth || 1280;
        const sh = liveVideo.videoHeight || 720;
        localCanvas = document.createElement('canvas');
        localCanvas.width = Math.max(2, sw);
        localCanvas.height = Math.max(2, sh);
        localCtx = localCanvas.getContext('2d');
        function drawOnce() {
          try {
            const scale = Math.max(1, Number(currentZoomScale) || 1);
            const vw = liveVideo.videoWidth || sw;
            const vh = liveVideo.videoHeight || sh;
            if (vw > 0 && vh > 0) {
              if (scale > 1) {
                const srcW = Math.max(2, Math.floor(vw / scale));
                const srcH = Math.max(2, Math.floor(vh / scale));
                const srcX = Math.floor((vw - srcW) / 2);
                const srcY = Math.floor((vh - srcH) / 2);
                localCtx.drawImage(liveVideo, srcX, srcY, srcW, srcH, 0, 0, localCanvas.width, localCanvas.height);
              } else {
                localCtx.drawImage(liveVideo, 0, 0, localCanvas.width, localCanvas.height);
              }
            }
          } catch (_) {}
          localRaf = requestAnimationFrame(drawOnce);
        }
        localRaf = requestAnimationFrame(drawOnce);
        const cap = localCanvas.captureStream ? localCanvas.captureStream(30) : null;
        if (cap) srcStream = cap;
      }

      const recorder = new MediaRecorder(srcStream, { mimeType: 'video/webm; codecs=vp8' });
      let blob;
      recorder.ondataavailable = e => {
        if (e.data && e.data.size > 0) blob = e.data;
      };
      recorder.onstop = () => {
        if (localRaf) { cancelAnimationFrame(localRaf); localRaf = null; }
        if (srcStream && srcStream !== stream) {
          try { srcStream.getTracks().forEach(t => t.stop()); } catch (_) {}
        }
        resolve(blob);
      };
      recorder.start();
      setTimeout(() => recorder.stop(), durationMs);
    });
  }

  // ========================================================================
  // Playback loop
  // ========================================================================

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

  // ========================================================================
  // User recording – element-capture strategy
  // ========================================================================

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
      cleanupSilenceAudioTrack();
    });
  }

  // ========================================================================
  // User recording – canvas-capture strategy
  // ========================================================================

  function startCanvasCaptureRecording() {
    if (!delayedVideo) return;
    const sourceWidth = delayedVideo.videoWidth || 1280;
    const sourceHeight = delayedVideo.videoHeight || 720;
    const maxWidth = 1280;
    const maxHeight = 720;
    const scl = Math.min(maxWidth / sourceWidth, maxHeight / sourceHeight, 1);
    const width = Math.max(2, Math.floor(sourceWidth * scl));
    const height = Math.max(2, Math.floor(sourceHeight * scl));
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
        const scale = ptzSupportedOnCurrentTrack ? 1 : Math.max(1, Number(currentZoomScale) || 1);
        const sw = delayedVideo.videoWidth || sourceWidth;
        const sh = delayedVideo.videoHeight || sourceHeight;
        if (sw > 0 && sh > 0) {
          if (scale > 1) {
            const srcW = Math.max(2, Math.floor(sw / scale));
            const srcH = Math.max(2, Math.floor(sh / scale));
            const srcX = Math.floor((sw - srcW) / 2);
            const srcY = Math.floor((sh - srcH) / 2);
            canvasCtx.drawImage(delayedVideo, srcX, srcY, srcW, srcH, 0, 0, canvasEl.width, canvasEl.height);
          } else {
            canvasCtx.drawImage(delayedVideo, 0, 0, canvasEl.width, canvasEl.height);
          }
        }
      } catch (_) {}
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
      cleanupSilenceAudioTrack();
    });
  }

  // ========================================================================
  // Toggle user recording (REC / STOP / SHARE|SAVE)
  // ========================================================================

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
      recordStartTime = performance.now();
      if (recordingStrategy === 'element-capture' && delayedVideo.captureStream) {
        startElementCaptureRecording();
      } else if (recordingStrategy === 'canvas-capture') {
        startCanvasCaptureRecording();
      } else {
        recBtn.textContent = 'REC';
        try { recBtn.classList.remove('recording'); } catch (_) {}
        recordDot.style.display = 'none';
        isRecording = false;
        return;
      }
    } else {
      isRecording = false;
      recBtn.textContent = '…';
      try { recBtn.disabled = true; } catch (_) {}
      recordDot.style.display = 'none';
      try { recBtn.classList.remove('recording'); } catch (_) {}

      let blob = null;
      const recordStopTime = performance.now();
      if (recordingStrategy === 'element-capture') {
        blob = await stopElementCaptureRecording();
      } else if (recordingStrategy === 'canvas-capture') {
        blob = await stopCanvasCaptureRecording();
      }

      if (blob && blob.size > 0) {
        const actualDurationMs = recordStopTime - recordStartTime;
        blob = await DelayCamLogic.fixWebmDuration(blob, actualDurationMs);
        readyToSaveBlob = blob;
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

  // ========================================================================
  // Event handlers
  // ========================================================================

  // Thumbnail click: toggle which feed is in big view vs thumbnail.
  // liveVideo is the thumbnail when mainIsLive is false.
  liveVideo.addEventListener('click', () => {
    if (!mainIsLive && delayProcessActive) {
      mainIsLive = true;
      updateLayout();
    }
  });

  // delayedVideo is the thumbnail when mainIsLive is true and delayReady.
  delayedVideo.addEventListener('click', () => {
    if (mainIsLive && delayProcessActive) {
      mainIsLive = false;
      updateLayout();
    }
  });

  // frozenView is the thumbnail when mainIsLive is true and !delayReady.
  frozenView.addEventListener('click', () => {
    if (mainIsLive && delayProcessActive) {
      mainIsLive = false;
      updateLayout();
    }
  });

  // Delay label: click to change delay value via prompt
  delayLabel.addEventListener('click', () => {
    const currentSeconds = Math.round(delayMs / 1000);
    const input = prompt('Set delay in seconds:', String(currentSeconds));
    if (input === null) return;
    const newSeconds = parseInt(input, 10);
    if (isNaN(newSeconds) || newSeconds < 1) return;

    delayMs = newSeconds * 1000;
    try { localStorage.setItem(DELAY_STORAGE_KEY, String(newSeconds)); } catch (_) {}
    updateDelayLabel();

    if (!delayReady && delayProcessActive) {
      // Restart countdown and recording with the new delay
      beginDelayProcess();
    }
  });

  // Switch camera
  switchBtn.addEventListener('click', async () => {
    currentFacingMode = currentFacingMode === 'user' ? 'environment' : 'user';
    await startCamera();
  });

  // Share/Copy app link button
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
      const url = HARD_CODED_APP_URL;
      try {
        if (canNativeShareLink) {
          try {
            await navigator.share({
              url,
              title: 'Capture key moments without filling your phone',
              text: 'Record key soccer moments or catch shooting stars with a delayed camera.'
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

  // REC button
  recBtn.addEventListener('click', () => { void toggleRecording(); });

  // Cancel button: stop current recording and reset UI
  if (cancelBtn) {
    cancelBtn.addEventListener('click', async () => {
      if (isRecording) {
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
      readyToSaveBlob = null;
      recBtn.textContent = 'REC';
      try { recBtn.disabled = false; } catch (_) {}
      try { cancelBtn.style.display = 'none'; } catch (_) {}
    });
  }

  // ========================================================================
  // Initialization
  // ========================================================================

  updateDelayLabel();
  updateLayout();
  startCamera();

  if ('serviceWorker' in navigator) {
    try { navigator.serviceWorker.register('service-worker.js'); } catch (_) {}
  }

  // ========================================================================
  // Zoom controls
  // ========================================================================

  const ZOOM_STEPS = Array.from({ length: 5 }, (_, i) => Math.pow(2, i / 4));

  function labelForZoom(scale) {
    const fixed = (scale === 1 || Math.abs(scale - 2) < 1e-9) ? scale.toFixed(0) : scale.toFixed(1);
    return `${fixed}x`;
  }

  function markSelectedZoom(scale) {
    if (!zoomControls) return;
    const btns = zoomControls.querySelectorAll('.zoomBtn');
    btns.forEach(btn => {
      const val = Number(btn.getAttribute('data-zoom') || '1');
      if (Math.abs(val - scale) < 1e-6) btn.classList.add('selected');
      else btn.classList.remove('selected');
    });
  }

  let zoomAnimIntervalId = null;
  let currentVisualZoom = 1;

  function setVisualZoom(scale) {
    currentVisualZoom = scale;
    [liveVideo, delayedVideo].forEach(el => {
      if (el.style.zIndex === '1' && el.style.display !== 'none') {
        el.style.transformOrigin = 'center center';
        el.style.transform = scale > 1 ? `scale(${scale})` : '';
      } else {
        el.style.transform = '';
      }
    });
  }

  function applyCssZoom(targetScale) {
    if (zoomAnimIntervalId) { clearInterval(zoomAnimIntervalId); zoomAnimIntervalId = null; }

    const startScale = currentVisualZoom;
    const diff = Math.abs(targetScale - startScale);
    if (diff < 0.01) { setVisualZoom(targetScale); return; }

    const TICK_MS = 67;
    const duration = Math.max(200, diff * 500);
    const startTime = Date.now();

    zoomAnimIntervalId = setInterval(() => {
      const t = Math.min(1, (Date.now() - startTime) / duration);
      const eased = 1 - Math.pow(1 - t, 3);
      setVisualZoom(startScale + (targetScale - startScale) * eased);
      if (t >= 1) { clearInterval(zoomAnimIntervalId); zoomAnimIntervalId = null; }
    }, TICK_MS);
  }

  function getCurrentVideoTrack() {
    try {
      return stream && stream.getVideoTracks && stream.getVideoTracks()[0] ? stream.getVideoTracks()[0] : null;
    } catch (_) {
      return null;
    }
  }

  async function applyPtzZoomIfSupported(scale) {
    const track = getCurrentVideoTrack();
    if (!track || typeof track.getCapabilities !== 'function') return false;
    let caps;
    try { caps = track.getCapabilities(); } catch (_) { caps = null; }
    if (!caps || caps.zoom == null) return false;
    const zoomCaps = typeof caps.zoom === 'number' ? { min: 1, max: caps.zoom } : caps.zoom;
    const min = Number.isFinite(zoomCaps.min) ? zoomCaps.min : 1;
    const max = Number.isFinite(zoomCaps.max) ? zoomCaps.max : Math.max(2, scale);
    const clamped = Math.min(Math.max(scale, min), max);
    try {
      await track.applyConstraints({ advanced: [{ zoom: clamped }] });
      ptzSupportedOnCurrentTrack = true;
      return true;
    } catch (_) {
      try {
        await track.applyConstraints({ zoom: clamped });
        ptzSupportedOnCurrentTrack = true;
        return true;
      } catch (_) {
        ptzSupportedOnCurrentTrack = false;
        return false;
      }
    }
  }

  async function applyZoom(scale) {
    currentZoomScale = scale;
    markSelectedZoom(scale);
    const appliedPtz = await applyPtzZoomIfSupported(scale);
    if (!appliedPtz) {
      applyCssZoom(scale);
    } else {
      try { liveVideo.style.transform = ''; } catch (_) {}
      try { delayedVideo.style.transform = ''; } catch (_) {}
    }
    lastAppliedZoomScale = scale;
  }

  function setupZoomControls() {
    if (!zoomControls) return;
    zoomControls.innerHTML = '';
    ZOOM_STEPS.forEach(scale => {
      const btn = document.createElement('button');
      btn.className = 'zoomBtn';
      btn.type = 'button';
      btn.setAttribute('data-zoom', String(scale));
      btn.textContent = labelForZoom(scale);
      btn.addEventListener('click', () => { void applyZoom(scale); });
      zoomControls.appendChild(btn);
    });
    markSelectedZoom(currentZoomScale);
  }

  setupZoomControls();
}());
