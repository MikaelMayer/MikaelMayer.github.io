// DelayCam application logic, wired to the DOM. Depends on DelayCamLogic.
(function () {
  'use strict';

  const liveVideo = document.getElementById('liveVideo');
  const delayedVideo = document.getElementById('delayedVideo');
  const miniLive = document.getElementById('miniLive');
  const overlay = document.getElementById('overlay');
  const switchBtn = document.getElementById('switchBtn');
  const recBtn = document.getElementById('recBtn');
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

  function chooseBestMimeType() {
    const candidates = [
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

    // Fallback: anchor download with object URL
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.rel = 'noopener';
    a.target = '_blank';
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
    const stream = delayedVideo.captureStream ? delayedVideo.captureStream() : null;
    if (!stream) return;
    elementRecorderChunks = [];
    const mimeType = chooseBestMimeType();
    elementRecorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
    elementRecorder.ondataavailable = e => {
      if (e.data && e.data.size > 0) {
        elementRecorderChunks.push(e.data);
      }
    };
    elementRecorder.onstop = () => {
      if (elementRecorderStopResolve) {
        const lastChunk = [...elementRecorderChunks].reverse().find(c => c && c.size > 0);
        const chunkType = (lastChunk && lastChunk.type) || (elementRecorder && elementRecorder.mimeType) || 'video/webm';
        const normalized = normalizeMimeType(chunkType);
        elementRecorderStopResolve(new Blob(lastChunk ? [lastChunk] : [], { type: normalized }));
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
    });
  }

  function startCanvasCaptureRecording() {
    if (!delayedVideo) return;
    const width = delayedVideo.videoWidth || 1280;
    const height = delayedVideo.videoHeight || 720;
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
    const mimeType = chooseBestMimeType();
    canvasRecorder = new MediaRecorder(canvasStream, mimeType ? { mimeType } : undefined);
    canvasRecorder.ondataavailable = e => {
      if (e.data && e.data.size > 0) {
        canvasRecorderChunks.push(e.data);
      }
    };
    canvasRecorder.onstop = () => {
      if (canvasRecorderStopResolve) {
        const lastChunk = [...canvasRecorderChunks].reverse().find(c => c && c.size > 0);
        const chunkType = (lastChunk && lastChunk.type) || (canvasRecorder && canvasRecorder.mimeType) || 'video/webm';
        const normalized = normalizeMimeType(chunkType);
        canvasRecorderStopResolve(new Blob(lastChunk ? [lastChunk] : [], { type: normalized }));
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
          await saveBlobAs(blob, filename);
        } finally {
          recBtn.disabled = false;
          recBtn.textContent = 'REC';
        }
        return;
      }

      isRecording = true;
      recBtn.textContent = 'STOP';
      recordDot.style.display = 'block';
      if (recordingStrategy === 'element-capture' && delayedVideo.captureStream) {
        startElementCaptureRecording();
      } else if (recordingStrategy === 'canvas-capture') {
        startCanvasCaptureRecording();
      } else {
        // Unsupported: keep button label consistent but do nothing
        recBtn.textContent = 'REC';
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

      let blob = null;
      if (recordingStrategy === 'element-capture') {
        blob = await stopElementCaptureRecording();
      } else if (recordingStrategy === 'canvas-capture') {
        blob = await stopCanvasCaptureRecording();
      }

      if (blob && blob.size > 0) {
        const ext = getExtensionFromMime(blob.type);
        const filename = `delayed-recording-${Date.now()}.${ext}`;
        try { await saveBlobAs(blob, filename); } catch (_) {}
      }
      recBtn.textContent = 'REC';
      try { recBtn.disabled = false; } catch (_) {}
    }
  }

  // UI wiring
  liveVideo.addEventListener('click', async () => {
    tapCount++;
    if (tapCount === 1) {
      switchBtn.style.display = 'none';
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

  miniLive.addEventListener('click', () => {
    location.reload();
  });

  recBtn.addEventListener('click', () => { void toggleRecording(); });

  startCamera();

  if ('serviceWorker' in navigator) {
    try { navigator.serviceWorker.register('service-worker.js'); } catch (_) {}
  }
}());
