/**
 * Audio recording — iPad / iOS Safari optimized.
 * iOS requires user gesture, audio/mp4, and AudioContext unlock.
 */

const RECORD_SECONDS = 120;
const MIC_CHECK_SECONDS = 3;

export { RECORD_SECONDS, MIC_CHECK_SECONDS };

const MIME_CANDIDATES = [
  'audio/mp4',
  'audio/aac',
  'audio/webm;codecs=opus',
  'audio/webm',
];

let mediaRecorder = null;
let chunks = [];
let stream = null;
let selectedMime = '';
let audioCtx = null;

export function isIOS() {
  return (
    /iPad|iPhone|iPod/.test(navigator.userAgent) ||
    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)
  );
}

export function isRecordingSupported() {
  return (
    typeof MediaRecorder !== 'undefined' &&
    typeof navigator.mediaDevices?.getUserMedia === 'function'
  );
}

function pickMimeType() {
  if (typeof MediaRecorder === 'undefined') return '';
  for (const mime of MIME_CANDIDATES) {
    if (MediaRecorder.isTypeSupported(mime)) return mime;
  }
  return '';
}

export function extForMime(mime = '') {
  if (mime.includes('mp4') || mime.includes('aac') || mime.includes('m4a')) return 'mp4';
  return 'webm';
}

/** Unlock AudioContext — required on iOS before any audio works. */
export async function unlockAudio() {
  const Ctx = window.AudioContext || window.webkitAudioContext;
  if (!Ctx) return;
  if (!audioCtx) audioCtx = new Ctx();
  if (audioCtx.state === 'suspended') await audioCtx.resume();
}

/** Request mic with iPad-friendly constraints. Must be called from a user tap. */
export async function requestMic() {
  await unlockAudio();

  if (stream?.active && stream.getAudioTracks().every((t) => t.readyState === 'live')) {
    return stream;
  }

  releaseMic();

  stream = await navigator.mediaDevices.getUserMedia({
    audio: {
      echoCancellation: true,
      noiseSuppression: true,
      autoGainControl: true,
      channelCount: 1,
      sampleRate: 44100,
    },
    video: false,
  });

  return stream;
}

export function releaseMic() {
  if (mediaRecorder && mediaRecorder.state !== 'inactive') {
    try { mediaRecorder.stop(); } catch { /* ignore */ }
  }
  mediaRecorder = null;
  chunks = [];
  if (stream) {
    stream.getTracks().forEach((t) => t.stop());
    stream = null;
  }
}

export function hasLiveMic() {
  return !!stream?.active && stream.getAudioTracks().some((t) => t.readyState === 'live');
}

function attachRecorder(activeStream) {
  chunks = [];
  selectedMime = pickMimeType();
  const opts = selectedMime ? { mimeType: selectedMime, audioBitsPerSecond: 64000 } : { audioBitsPerSecond: 64000 };
  mediaRecorder = new MediaRecorder(activeStream, opts);
  selectedMime = mediaRecorder.mimeType || selectedMime || (isIOS() ? 'audio/mp4' : 'audio/webm');

  mediaRecorder.ondataavailable = (e) => {
    if (e.data && e.data.size > 0) chunks.push(e.data);
  };

  return mediaRecorder;
}

export async function startRecording() {
  await unlockAudio();
  const activeStream = await requestMic();

  if (mediaRecorder?.state === 'recording') {
    throw new Error('ALREADY_RECORDING');
  }

  attachRecorder(activeStream);
  // 500 ms timeslice — iOS Safari delivers chunks more reliably this way
  mediaRecorder.start(500);
  return selectedMime;
}

export function stopRecording() {
  return new Promise((resolve) => {
    if (!mediaRecorder || mediaRecorder.state === 'inactive') {
      resolve(null);
      return;
    }

    const mime = mediaRecorder.mimeType || selectedMime || (isIOS() ? 'audio/mp4' : 'audio/webm');

    mediaRecorder.onstop = () => {
      mediaRecorder = null;
      if (!chunks.length) {
        resolve(null);
        return;
      }
      resolve(new Blob(chunks, { type: mime }));
      chunks = [];
    };

    if (mediaRecorder.state === 'recording') {
      try { mediaRecorder.requestData?.(); } catch { /* ignore */ }
      mediaRecorder.stop();
    }
  });
}

export function isRecording() {
  return mediaRecorder?.state === 'recording';
}

/** 3-second mic test — returns blob + object URL for playback. */
export async function runMicCheck(onTick) {
  await unlockAudio();
  await startRecording();

  return new Promise((resolve, reject) => {
    let elapsed = 0;
    const tick = setInterval(async () => {
      elapsed++;
      onTick?.(MIC_CHECK_SECONDS - elapsed);
      if (elapsed >= MIC_CHECK_SECONDS) {
        clearInterval(tick);
        try {
          const blob = await stopRecording();
          if (!blob || blob.size < 100) {
            reject(new Error('NO_AUDIO'));
            return;
          }
          const url = URL.createObjectURL(blob);
          resolve({ blob, url, mime: blob.type });
        } catch (err) {
          reject(err);
        }
      }
    }, 1000);
  });
}

export function revokeObjectUrl(url) {
  if (url?.startsWith('blob:')) URL.revokeObjectURL(url);
}

export function blobToDataUrl(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

export function formatTime(seconds) {
  const m = Math.floor(Math.max(0, seconds) / 60);
  const s = Math.max(0, seconds) % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}

export function timerProgress(elapsed, total) {
  const r = 54;
  const circ = 2 * Math.PI * r;
  const pct = Math.min(elapsed / total, 1);
  return { circ, offset: circ * (1 - pct) };
}

/** HTML audio tag with iOS-friendly attributes. */
export function audioPlayer(src) {
  if (!src) return '';
  return `<div class="audio-block">
    <audio controls playsinline webkit-playsinline preload="metadata" src="${src}"></audio>
  </div>`;
}

export function micErrorMessage(err) {
  if (err?.name === 'NotAllowedError' || err?.message?.includes('Permission')) {
    return 'マイクを許可してください\nSettings → Safari → Microphone';
  }
  if (err?.message === 'NO_AUDIO') {
    return '音声が録音されませんでした。もう一度試してください。\nNo audio detected — try again.';
  }
  if (!isRecordingSupported()) {
    return 'このブラウザは録音に対応していません。\nSafari を使ってください。';
  }
  return 'マイクエラー — もう一度試してください\nMicrophone error — tap to retry';
}
