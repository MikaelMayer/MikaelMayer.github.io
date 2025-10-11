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
  let recordedBlobs = []; // fallback strategy storage

  // Element-capture strategy state
  let elementRecorder = null;
  let elementRecorderChunks = [];
  let elementRecorderStopResolve = null;

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
          if (isRecording && recordingStrategy === 'concat-chunks') {
            recordedBlobs.push(blob);
          }
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
    elementRecorder = new MediaRecorder(stream, { mimeType: 'video/webm; codecs=vp8' });
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
    elementRecorder.start();
  }

  function stopElementCaptureRecording() {
    return new Promise(resolve => {
      elementRecorderStopResolve = resolve;
      if (elementRecorder && elementRecorder.state === 'recording') {
        elementRecorder.stop();
      } else {
        resolve(new Blob([], { type: 'video/webm' }));
      }
    });
  }

  async function toggleRecording() {
    if (!isRecording) {
      isRecording = true;
      recordedBlobs = [];
      recBtn.textContent = 'STOP';
      recordDot.style.display = 'block';
      if (recordingStrategy === 'element-capture' && delayedVideo.captureStream) {
        startElementCaptureRecording();
      }
    } else {
      isRecording = false;
      recBtn.textContent = 'REC';
      recordDot.style.display = 'none';

      let blob = null;
      if (recordingStrategy === 'element-capture') {
        blob = await stopElementCaptureRecording();
      } else {
        if (recordedBlobs.length > 0) {
          blob = DelayCamLogic.combineWebMChunks(recordedBlobs);
        }
      }

      if (blob) {
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `delayed-recording-${Date.now()}.webm`;
        a.click();
        setTimeout(() => URL.revokeObjectURL(url), 30000);
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

      // Decide based on runtime capability
      recordingStrategy = DelayCamLogic.chooseRecordingStrategy({ canCaptureElement: !!delayedVideo.captureStream });
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
