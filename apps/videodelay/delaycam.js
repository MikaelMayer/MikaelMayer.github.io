(function(){
  'use strict';

  const liveVideo = document.getElementById('liveVideo');
  const delayedVideo = document.getElementById('delayedVideo');
  const miniLive = document.getElementById('miniLive');
  const overlay = document.getElementById('overlay');
  const switchBtn = document.getElementById('switchBtn');
  const recBtn = document.getElementById('recBtn');
  const recordDot = document.getElementById('recordDot');

  const Logic = window.DelayCamLogic;

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
  let recordedBlobs = [];

  async function getCameraStream(facingMode) {
    return navigator.mediaDevices.getUserMedia({
      video: { facingMode: { exact: facingMode } },
      audio: false,
    });
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
      overlay.textContent = Logic.formatTime(ms);
    }, 100);
  }

  function freezeDelay() {
    clearInterval(delayTimerInterval);
    delayMs = Logic.computeDelayMs(delayStartTime, performance.now());
    overlay.textContent = `Delay: ${Logic.formatTime(delayMs)}`;
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
          if (isRecording) recordedBlobs.push(blob);
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

  function toggleRecording() {
    if (!isRecording) {
      isRecording = true;
      recordedBlobs = [];
      recBtn.textContent = 'STOP';
      recordDot.style.display = 'block';
    } else {
      isRecording = false;
      recBtn.textContent = 'REC';
      recordDot.style.display = 'none';

      if (recordedBlobs.length > 0) {
        const mimeType = 'video/webm';
        const strategy = Logic.chooseRecordingStrategy(mimeType);
        let blob;
        if (strategy === 'concatenate') {
          blob = Logic.buildDownloadBlob(recordedBlobs, mimeType);
        } else {
          blob = Logic.buildDownloadBlob(recordedBlobs, mimeType);
        }
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `delayed-recording-${Date.now()}.webm`;
        a.click();
      }
    }
  }

  // Handle first/second tap to set delay
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

  recBtn.addEventListener('click', toggleRecording);

  startCamera();

  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('service-worker.js');
  }
})();
