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
        elementRecorderStopResolve(new Blob(elementRecorderChunks, { type: 'video/webm' }));
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
        canvasRecorderStopResolve(new Blob(canvasRecorderChunks, { type: 'video/webm' }));
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
      recBtn.textContent = 'REC';
      recordDot.style.display = 'none';

      let blob = null;
      if (recordingStrategy === 'element-capture') {
        blob = await stopElementCaptureRecording();
      } else if (recordingStrategy === 'canvas-capture') {
        blob = await stopCanvasCaptureRecording();
      }

      if (blob && blob.size > 0) {
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `delayed-recording-${Date.now()}.webm`;
        a.style.display = 'none';
        document.body.appendChild(a);
        try {
          a.click();
        } catch (_) {
          try { window.open(url, '_blank', 'noopener'); } catch (_) {}
        } finally {
          setTimeout(() => {
            try { a.remove(); } catch (_) {}
            try { URL.revokeObjectURL(url); } catch (_) {}
          }, 30000);
        }
      }
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
