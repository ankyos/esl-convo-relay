/**
 * Convo Relay — main application orchestrator.
 * Optimized for iPad Safari (mic, wake lock, touch).
 */

import { TOPICS, pickTopic } from './topics.js';
import { recordingFilename, downloadDataUrl } from './download.js';
import {
  SCRIPT_LINE_COUNT,
  SCRIPT_SPEAKERS,
  SCRIPT_PATTERN,
  escapeHtml,
  normalizeStudentNumbers,
} from './script.js';
import {
  RECORD_SECONDS,
  startRecording,
  stopRecording,
  releaseMic,
  formatTime,
  timerProgress,
  isRecording,
  isRecordingSupported,
  isIOS,
  runMicCheck,
  revokeObjectUrl,
  audioPlayer,
  micErrorMessage,
  unlockAudio,
  hasLiveMic,
} from './audio.js';
import {
  PHASES,
  phaseStepsFor,
  phaseStepIndex,
  ACTIVITY_TALK,
  ACTIVITY_SCRIPT,
  isOnline,
  createSession,
  joinSession,
  subscribeSession,
  updateSession,
  updateGroup,
  uploadAudio,
  assignGroups,
  linkTranslations,
  linkReviews,
  countGroups,
  allGroupsStatus,
} from './session.js';

/* ── State ── */
const state = {
  mode: null,
  sessionId: null,
  groupId: null,
  groupName: null,
  session: null,
  recording: false,
  timerInterval: null,
  elapsed: 0,
  wakeLock: null,
  unsub: null,
  micReady: false,
  micChecking: false,
  micCheckUrl: null,
  micCheckError: null,
  countdownInterval: null,
  countdownLeft: 0,
  uploading: false,
  reviewing: false,
  translateNotes: '',
  teacherActivityMode: ACTIVITY_TALK,
  scriptDraft: null,
  scriptSubmitting: false,
};

const $ = (sel) => document.querySelector(sel);
const screen = $('#screen');
const sessionBadge = $('#sessionBadge');
const sessionCodeDisplay = $('#sessionCodeDisplay');
const footerHint = $('#footerHint');
const phaseProgress = $('#phaseProgress');
const phaseDots = $('#phaseDots');

const ICONS = {
  join: '👥', lobby: '⏳', record: '🎤', send: '📤', translate: '🔄',
  return: '↩️', review: '✅', done: '🎉', wait: '⏸', mic: '🎙',
};

const REVIEW_LABELS = {
  good: { emoji: '👍', ja: 'GOOD! バッチリ！' },
  not_bad: { emoji: '👌', ja: 'NOT BAD! まあまあ！' },
  tried_best: { emoji: '💪', ja: 'BEST TRY! がんばった！' },
};

/* ── Wake Lock ── */
async function requestWakeLock() {
  try {
    if ('wakeLock' in navigator) {
      state.wakeLock?.release?.();
      state.wakeLock = await navigator.wakeLock.request('screen');
    }
  } catch { /* unsupported or tab hidden */ }
}

function releaseWakeLock() {
  state.wakeLock?.release?.();
  state.wakeLock = null;
}

document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible') requestWakeLock();
});

/* ── Phase progress bar ── */
function updatePhaseProgress(session) {
  if (!session || session.phase === PHASES.LOBBY) {
    phaseProgress.hidden = true;
    return;
  }
  phaseProgress.hidden = false;
  const steps = phaseStepsFor(session);
  const current = phaseStepIndex(session.phase, session);
  phaseDots.innerHTML = steps.map((step, i) => {
    const cls = i < current ? 'done' : i === current ? 'active' : '';
    const conn = i < steps.length - 1 ? '<div class="phase-connector"></div>' : '';
    return `<div class="phase-dot ${cls}">
      <div class="phase-dot-icon">${step.icon}</div>
      <span class="phase-dot-label">${step.label}</span>
    </div>${conn}`;
  }).join('');
}

/* ── Render helpers ── */
function topicById(id) {
  return TOPICS.find((t) => t.id === id) || TOPICS[0];
}

function langLabel(lang) {
  return lang === 'ja'
    ? { flag: '🇯🇵', text: '日本語', sub: '日本語で話す · Speak Japanese' }
    : { flag: '🇺🇸', text: 'English', sub: '英語で話す · Speak English' };
}

function scaffoldHtml(group, topic) {
  if (group.language === 'ja') {
    return `<p class="text-sm" style="margin:0">自由に話そう！スキャフォールドなし<br>Casual chat — no script needed</p>`;
  }
  return `<ul class="scaffold-list">${topic.scaffold.en.map((line) => `<li>${line}</li>`).join('')}</ul>`;
}

function scriptNamesArray(group) {
  const sn = group?.scriptNames;
  if (!sn) return [];
  if (Array.isArray(sn)) return sn.slice(0, SCRIPT_SPEAKERS);
  return Array.from({ length: SCRIPT_SPEAKERS }, (_, i) => sn[i] || '?');
}

function scriptLinesArray(group) {
  const sl = group?.scriptLines;
  if (!sl) return Array(SCRIPT_LINE_COUNT).fill('');
  if (Array.isArray(sl)) return sl.slice(0, SCRIPT_LINE_COUNT);
  return Array.from({ length: SCRIPT_LINE_COUNT }, (_, i) => sl[i] || '');
}

function scriptCompactHtml(group) {
  const names = scriptNamesArray(group);
  const lines = scriptLinesArray(group);
  if (!lines.some(Boolean)) return '';
  return `<div class="info-card script-readonly">
    <div class="info-card-label">📝 あなたの脚本 · Your script</div>
    ${lines.map((line, i) => {
      const speaker = names[SCRIPT_PATTERN[i]] || '?';
      return `<div class="script-read-row"><span class="script-speaker">${escapeHtml(speaker)}</span><span>${escapeHtml(line)}</span></div>`;
    }).join('')}
  </div>`;
}

function teacherRecordingsHtml(session) {
  const groups = Object.entries(session.groups || {});
  if (!groups.length) return '';
  const rows = groups.map(([gid, g]) => {
    const nums = g.studentNumbers && g.studentNumbers !== '0' ? `#${g.studentNumbers}` : '';
    const orig = g.recordingUrl
      ? `<div class="rec-row">${audioPlayer(g.recordingUrl)}
         <button class="btn btn-sm" data-action="download" data-gid="${gid}" data-kind="original">⬇ Original</button></div>`
      : '<span class="text-sm">—</span>';
    const trans = g.translationUrl
      ? `<div class="rec-row">${audioPlayer(g.translationUrl)}
         <button class="btn btn-sm" data-action="download" data-gid="${gid}" data-kind="translation">⬇ Translation</button></div>`
      : '<span class="text-sm">—</span>';
    return `<li>
      <div class="rec-group-head"><strong>${escapeHtml(g.name)}</strong> <span class="text-sm">${nums}</span></div>
      <div class="rec-cols"><div><span class="text-sm">🎤 Talk</span>${orig}</div><div><span class="text-sm">🔄 Trans</span>${trans}</div></div>
    </li>`;
  }).join('');
  return `<div class="info-card teacher-recordings">
    <div class="info-card-label">📼 録音 · Recordings (download before deleting session)</div>
    <ul class="recording-list">${rows}</ul>
  </div>`;
}

function modePickerHtml() {
  const talk = state.teacherActivityMode === ACTIVITY_TALK ? 'active' : '';
  const script = state.teacherActivityMode === ACTIVITY_SCRIPT ? 'active' : '';
  return `<div class="mode-picker">
    <button type="button" class="mode-btn ${talk}" data-action="pick-mode" data-mode="${ACTIVITY_TALK}">🎤 自由会話 Free Talk</button>
    <button type="button" class="mode-btn ${script}" data-action="pick-mode" data-mode="${ACTIVITY_SCRIPT}">📝 脚本 Script</button>
  </div>
  <p class="text-sm">${state.teacherActivityMode === ACTIVITY_SCRIPT ? '4人脚本 → 録音 → リレー' : '自由会話 → リレー'}</p>`;
}

function countScriptReady(session) {
  return Object.values(session.groups || {}).filter((g) => g.status === 'script_ready').length;
}

function pairingPreview(session) {
  const ids = Object.keys(session.groups || {}).sort();
  if (ids.length < 2) return '';
  return `<div class="info-card">
    <div class="info-card-label">🔁 リレー順 · Relay order</div>
    <ul class="pair-list">
      ${ids.map((gid, i) => {
        const g = session.groups[gid];
        const target = session.groups[ids[(i + 1) % ids.length]];
        return `<li>${g.name} → <span>${target?.name || '?'}</span></li>`;
      }).join('')}
    </ul>
  </div>`;
}

function render(html) {
  screen.innerHTML = html;
  bindEvents();
}

function updateTimerUI() {
  const timeEl = document.querySelector('.timer-text .time');
  const progEl = document.querySelector('.timer-ring .progress');
  if (!timeEl) return false;
  const pct = timerProgress(state.elapsed, RECORD_SECONDS);
  timeEl.textContent = formatTime(RECORD_SECONDS - state.elapsed);
  if (progEl) {
    progEl.setAttribute('stroke-dasharray', String(pct.circ));
    progEl.setAttribute('stroke-dashoffset', String(pct.offset));
  }
  return true;
}

function updateCountdownUI() {
  const el = document.getElementById('countdownNum');
  if (!el) return false;
  const left = state.countdownLeft;
  el.textContent = left > 0 ? String(left) : 'SEND!';
  el.className = left > 0 ? 'countdown-display' : 'countdown-display go';
  return true;
}

function hintSummaryHtml(group, session) {
  if (session?.activityMode === ACTIVITY_SCRIPT || !group.topicSummaryJa) return '';
  return `<details class="hint-details">
    <summary>💡 内容ヒント · Topic hint（タップ）</summary>
    <div class="hint-body">${group.topicSummaryJa}</div>
  </details>`;
}

function translateStepsHtml() {
  return `<ol class="step-list">
    <li><span class="step-num">1</span><span>👂 <strong>聞く</strong> · Listen to the recording</span></li>
    <li><span class="step-num">2</span><span>📝 <strong>メモ</strong> · Write down what you hear</span></li>
    <li><span class="step-num">3</span><span>🎤 <strong>録音</strong> · Record your translation</span></li>
    <li><span class="step-num">4</span><span>↩ <strong>返却</strong> · Return to the other group</span></li>
  </ol>`;
}

function bindEvents() {
  screen.querySelector('[data-action="create"]')?.addEventListener('click', onCreateSession);
  screen.querySelector('[data-action="join"]')?.addEventListener('click', onJoinSession);
  screen.querySelector('[data-action="start"]')?.addEventListener('click', onTeacherStart);
  screen.querySelector('[data-action="start-record"]')?.addEventListener('click', onTeacherStartRecord);
  screen.querySelector('[data-action="open-send"]')?.addEventListener('click', onTeacherOpenSend);
  screen.querySelectorAll('[data-action="pick-mode"]').forEach((btn) => {
    btn.addEventListener('click', () => { state.teacherActivityMode = btn.dataset.mode; renderCurrentView(); });
  });
  screen.querySelector('[data-action="submit-script"]')?.addEventListener('click', onSubmitScript);
  screen.querySelectorAll('[data-action="download"]').forEach((btn) => {
    btn.addEventListener('click', () => onDownloadRecording(btn.dataset.gid, btn.dataset.kind));
  });
  screen.querySelectorAll('.script-input').forEach((input) => {
    input.addEventListener('input', (e) => {
      const i = Number(e.target.dataset.line);
      if (!state.scriptDraft) state.scriptDraft = Array(SCRIPT_LINE_COUNT).fill('');
      state.scriptDraft[i] = e.target.value;
    });
  });
  screen.querySelector('[data-action="mic-test"]')?.addEventListener('click', onMicTest);
  screen.querySelector('[data-action="mic-confirm"]')?.addEventListener('click', onMicConfirm);
  screen.querySelector('[data-action="record"]')?.addEventListener('click', onToggleRecord);
  screen.querySelector('[data-action="send"]')?.addEventListener('click', onSend);
  screen.querySelector('[data-action="return"]')?.addEventListener('click', onReturn);
  screen.querySelectorAll('[data-action="review"]').forEach((btn) => {
    btn.addEventListener('click', () => onReview(btn.dataset.review));
  });
  screen.querySelector('#translateNotes')?.addEventListener('input', (e) => {
    state.translateNotes = e.target.value;
  });
}

function needsMicCheck() {
  return !state.micReady || !hasLiveMic();
}

/* ── Screens ── */

function renderLanding() {
  const iosNote = isIOS()
    ? '<p class="text-sm">📱 iPad — Safari を使ってください · Use Safari</p>'
    : '';
  const recNote = !isRecordingSupported()
    ? '<div class="setup-notice"><strong>⚠</strong> 録音非対応ブラウザ · Browser does not support recording</div>'
    : '';

  render(`
    <div class="screen-inner">
      <div class="phase-icon">${ICONS.join}</div>
      <h2 class="screen-title">Convo Relay</h2>
      <p class="screen-sub">
        友達と話して、翻訳リレー！
        <span class="jp">Talk with friends, then translate!</span>
      </p>
      ${recNote}
      <div class="sep"></div>
      <div id="setupNotice" class="setup-notice hidden"></div>
      <div class="field">
        <label>📋 セッションコード · Session Code</label>
        <input id="inputCode" type="text" maxlength="6" placeholder="ABC123" autocapitalize="characters" autocomplete="off" />
      </div>
      <div class="field-row">
        <div class="field field-grow">
          <label>👥 グループ名 · Group</label>
          <input id="inputGroup" type="text" placeholder="Team Sakura" autocomplete="off" />
        </div>
        <div class="field field-narrow">
          <label>🔢 番号 · #</label>
          <input id="inputNumbers" type="text" inputmode="numeric" placeholder="6,21,4" autocomplete="off" />
        </div>
      </div>
      <div class="btn-row">
        <button class="btn btn-primary" data-action="join">
          <span class="icon">▶</span> 参加する Join
        </button>
      </div>
      <div class="sep-thick"></div>
      <p class="text-sm">先生用 · For teacher</p>
      <button class="btn" data-action="create">
        <span class="icon">➕</span> 新しいセッション Create Session
      </button>
      ${iosNote}
    </div>
  `);
  checkOnlineNotice();
}

async function checkOnlineNotice() {
  const online = await isOnline();
  const el = document.getElementById('setupNotice');
  if (!online && el) {
    el.classList.remove('hidden');
    el.innerHTML = `<strong>⚠ デモモード</strong>
      Firebase未設定 — 同じブラウザでのテストのみ。<br>
      複数iPad連携には <code>js/config.js</code> にFirebase設定が必要です。`;
  }
}

function renderTeacherLobby(session) {
  const groups = Object.entries(session.groups || {});
  render(`
    <div class="screen-inner">
      <div class="phase-icon">${ICONS.lobby}</div>
      <h2 class="screen-title">先生パネル · Teacher</h2>
      <p class="screen-sub">コード: <strong>${session.code}</strong></p>
      <div class="sep"></div>
      <div class="info-card">
        <div class="info-card-label">👥 参加グループ · Groups (${groups.length})</div>
        <ul class="group-list">
          ${groups.length === 0
            ? '<li style="color:var(--text-muted)">まだ誰もいません…</li>'
            : groups.map(([, g]) => `<li><span>${escapeHtml(g.name)}</span><span class="chip wait">${g.studentNumbers && g.studentNumbers !== '0' ? `#${g.studentNumbers} · ` : ''}${g.status}</span></li>`).join('')}
        </ul>
      </div>
      ${pairingPreview(session)}
      ${modePickerHtml()}
      <button class="btn btn-primary" data-action="start" ${groups.length < 2 ? 'disabled' : ''}>
        <span class="icon">🎬</span> スタート Start (${groups.length}/2+)
      </button>
      <p class="text-sm">最低2グループ必要 · Need at least 2 groups</p>
      ${teacherRecordingsHtml(session)}
    </div>
  `);
}

function renderTeacherDashboard(session) {
  const groups = Object.entries(session.groups || {});
  const phase = session.phase;
  let action = '';

  if (phase === PHASES.SCRIPT) {
    const total = countGroups(session);
    const ready = countScriptReady(session);
    action = ready >= total && total > 0
      ? `<button class="btn btn-primary" data-action="start-record"><span class="icon">🎤</span> 録音開始 (${ready}/${total})</button>`
      : `<p class="text-sm">📝 脚本作成中 · Scripts ${ready}/${total}</p>`;
  } else if (phase === PHASES.RECORD) {
    const allReady = allGroupsStatus(session, 'ready_to_send');
    action = allReady
      ? `<button class="btn btn-send" data-action="open-send"><span class="icon">📤</span> 3…2…1 送信！</button>`
      : '<p class="text-sm">🎤 録音中… Waiting for recordings</p>';
  } else if (phase === PHASES.COUNTDOWN) {
    action = `<div class="countdown-display">${state.countdownLeft || '…'}</div>`;
  } else if (phase === PHASES.SEND) {
    action = allGroupsStatus(session, 'sent')
      ? '<p class="text-sm">📤 全員送信完了 · All sent</p>'
      : '<p class="text-sm">📤 生徒が送信中… Students sending</p>';
  } else if (phase === PHASES.TRANSLATE || phase === PHASES.RETURN) {
    action = '<p class="text-sm">🔄 翻訳・返却中 · Translation in progress</p>';
  } else if (phase === PHASES.REVIEW) {
    action = '<p class="text-sm">✅ 確認中 · Review phase</p>';
  } else if (phase === PHASES.DONE) {
    action = '<p class="text-sm">🎉 完了 · Activity complete!</p>';
  }

  render(`
    <div class="screen-inner">
      <div class="phase-icon">${ICONS.wait}</div>
      <h2 class="screen-title">先生 · ${phase.toUpperCase()}</h2>
      <div class="sep"></div>
      <div class="info-card">
        <ul class="group-list">
          ${groups.map(([, g]) => `<li><span>${g.name}</span><span class="chip ${g.status === 'reviewed' ? 'done' : 'wait'}">${g.status}</span></li>`).join('')}
        </ul>
      </div>
      ${action}
      ${teacherRecordingsHtml(session)}
    </div>
  `);
}

function renderScriptWrite(session, group) {
  const topic = topicById(group.topicId);
  const names = scriptNamesArray(group);
  const lines = state.scriptDraft ?? scriptLinesArray(group);
  state.scriptDraft = lines;

  const rows = lines.map((line, i) => {
    const speaker = names[SCRIPT_PATTERN[i]] || '?';
    return `<div class="script-row">
      <span class="script-speaker">${escapeHtml(speaker)}</span>
      <input class="script-input" data-line="${i}" type="text" value="${escapeHtml(line)}" placeholder="..." enterkeyhint="${i < lines.length - 1 ? 'next' : 'done'}" />
    </div>`;
  }).join('');

  render(`
    <div class="screen-inner script-screen">
      <div class="phase-icon">📝</div>
      <h2 class="screen-title">脚本 · Script</h2>
      <p class="screen-sub">4人 × 2行 · 交互に話す<span class="jp">4 people, 2 lines each, take turns</span></p>
      <div class="topic-block info-card topic-compact">
        <p class="topic-name">${topic.emoji} ${topic.name[group.language] || topic.name.en}</p>
      </div>
      <div class="script-scroll">${rows}</div>
      <button class="btn btn-primary" data-action="submit-script" ${state.scriptSubmitting ? 'disabled' : ''}>
        <span class="icon">✓</span> 完成 OK
      </button>
    </div>
  `);
  requestWakeLock();
}

function renderScriptWaiting() {
  render(`
    <div class="screen-inner">
      <div class="phase-icon">${ICONS.wait}</div>
      <h2 class="screen-title">完成 · Done!</h2>
      <p class="screen-sub">脚本送信済み — 先生を待って<span class="jp">Script submitted — wait for teacher</span></p>
      <div class="wait-notice"><strong>⏸</strong>録音が始まるまで待機</div>
    </div>
  `);
  requestWakeLock();
}

function renderMicCheck(context) {
  const label = context === 'translate' ? '翻訳録音前 · Before translation' : '会話録音前 · Before conversation';
  render(`
    <div class="screen-inner">
      <div class="phase-icon">${ICONS.mic}</div>
      <h2 class="screen-title">マイク確認 · Mic Check</h2>
      <p class="screen-sub">
        ボタンを押して「こんにちは」と話す
        <span class="jp">Tap, then say "Hello!"</span>
      </p>
      <p class="text-sm">${label}</p>
      <div class="sep"></div>

      <div class="mic-check-status ${state.micCheckError ? 'err' : state.micCheckUrl ? 'ok' : ''}" id="micStatus">
        ${state.micChecking ? '🔴 録音中… Recording…' :
          state.micCheckError ? state.micCheckError.replace('\n', '<br>') :
          state.micCheckUrl ? '✅ 再生して確認 · Play to check' :
          '👆 タップしてテスト · Tap to test'}
      </div>

      ${state.micCheckUrl ? audioPlayer(state.micCheckUrl) : ''}

      <div class="btn-row">
        <button class="btn btn-record" data-action="mic-test" ${state.micChecking ? 'disabled' : ''}>
          ${state.micChecking ? '⏺' : '🎙'}
        </button>
      </div>

      ${state.micCheckUrl ? `
        <button class="btn btn-primary" data-action="mic-confirm">
          <span class="icon">✓</span> OK — 次へ Next
        </button>
      ` : ''}

      <p class="text-sm">iPad: 設定 → Safari → マイク → 許可</p>
    </div>
  `);
}

function renderCountdown(session) {
  const left = state.countdownLeft;
  const text = left > 0 ? String(left) : 'SEND!';
  const cls = left > 0 ? 'countdown-display' : 'countdown-display go';
  render(`
    <div class="screen-inner">
      <div class="${cls}" id="countdownNum">${text}</div>
      <p class="screen-sub">
        ${left > 0 ? '送信まで… · Get ready to SEND' : '📤 今すぐ送信！ SEND NOW!'}
      </p>
      ${left <= 0 && session.phase === PHASES.SEND ? `
        <button class="btn btn-send" data-action="send">
          <span class="icon">📤</span> 送信 SEND
        </button>
      ` : ''}
    </div>
  `);
}

function renderStudentLobby(session, group) {
  render(`
    <div class="screen-inner">
      <div class="phase-icon">${ICONS.lobby}</div>
      <h2 class="screen-title">待機中 · Waiting</h2>
      <p class="screen-sub">
        <strong>${group.name}</strong><br>
        先生がスタートするまで待ってください
        <span class="jp">Please wait for the teacher to start</span>
      </p>
      <div class="status-row"><span class="chip wait">👥 ${countGroups(session)} groups</span></div>
      <div class="wait-notice">
        <strong>⏸ 待機中</strong>
        iPadをスリープさせないでください<br>Don't let the iPad sleep
      </div>
    </div>
  `);
  requestWakeLock();
}

function renderRecordPhase(session, group) {
  if (needsMicCheck()) return renderMicCheck('record');

  const topic = topicById(group.topicId);
  const lang = langLabel(group.language);
  const pct = timerProgress(state.elapsed, RECORD_SECONDS);

  render(`
    <div class="screen-inner">
      <div class="lang-badge ${group.language}">${lang.flag} ${lang.text}</div>
      <p class="screen-sub">${lang.sub}</p>
      <div class="topic-block info-card">
        <div class="info-card-label">${ICONS.topic} トピック · Topic</div>
        <p class="topic-name">${topic.emoji} ${topic.name[group.language]}</p>
        ${session.activityMode === ACTIVITY_SCRIPT ? '' : scaffoldHtml(group, topic)}
      </div>
      ${session.activityMode === ACTIVITY_SCRIPT ? scriptCompactHtml(group) : ''}
      <div class="sep"></div>
      <div class="timer-ring">
        <svg viewBox="0 0 120 120">
          <circle class="track" cx="60" cy="60" r="54" />
          <circle class="progress" cx="60" cy="60" r="54"
            stroke-dasharray="${pct.circ}" stroke-dashoffset="${pct.offset}" />
        </svg>
        <div class="timer-text">
          <span class="time">${formatTime(RECORD_SECONDS - state.elapsed)}</span>
          <span class="label">REMAINING</span>
        </div>
      </div>
      ${state.recording ? '<div class="rec-indicator"><span class="rec-dot"></span> REC</div>' : ''}
      <button class="btn btn-record ${state.recording ? 'recording' : ''}" data-action="record" ${state.uploading ? 'disabled' : ''}>
        ${state.recording ? '⏹' : '🎤'}
      </button>
      <p class="text-sm">${session.activityMode === ACTIVITY_SCRIPT
        ? '脚本を読んで録音 · Read your script aloud'
        : '2分間、友達と話そう · Chat casually for 2 minutes'}</p>
    </div>
  `);
  requestWakeLock();
}

function renderSentWaiting() {
  render(`
    <div class="screen-inner">
      <div class="phase-icon">${ICONS.send}</div>
      <h2 class="screen-title">送信完了 · Sent!</h2>
      <p class="screen-sub">他のグループを待っています…<span class="jp">Waiting for other groups</span></p>
      <div class="wait-notice"><strong>⏸ 待機</strong>iPadをスリープさせないで</div>
    </div>
  `);
  requestWakeLock();
}

function renderReturnedWaiting(group) {
  const earlyFeedback = group?.receivedReview ? `
    <div class="feedback-card">
      <div class="feedback-emoji">${REVIEW_LABELS[group.receivedReview]?.emoji || '💬'}</div>
      <strong>${group.receivedReviewLabel || ''}</strong>
      <p class="feedback-from">👥 ${group.receivedReviewFrom || 'Partner'} から届いた！</p>
    </div>
  ` : '';
  render(`
    <div class="screen-inner">
      <div class="phase-icon">${ICONS.return}</div>
      <h2 class="screen-title">返却完了 · Returned!</h2>
      <p class="screen-sub">確認フェーズまで待機…</p>
      ${earlyFeedback}
      <div class="wait-notice"><strong>⏸ 待機</strong>iPadをスリープさせないで</div>
    </div>
  `);
  requestWakeLock();
}

function renderWaitSend(session, group) {
  if (session.phase === PHASES.COUNTDOWN) return renderCountdown(session);

  render(`
    <div class="screen-inner">
      <div class="phase-icon">${ICONS.wait}</div>
      <h2 class="screen-title">待機 · Wait</h2>
      <p class="screen-sub">
        録音完了！先生の合図まで待ってください
        <span class="jp">Recording done — wait for teacher's signal</span>
      </p>
      ${audioPlayer(group.recordingUrl)}
      <div class="wait-notice">
        <strong>⏸ 待って！ WAIT</strong>
        iPadをスリープさせないで · Keep iPad awake
      </div>
      <button class="btn btn-send" data-action="send" ${session.phase !== PHASES.SEND ? 'disabled' : ''}>
        <span class="icon">📤</span> 送信 SEND
      </button>
      ${session.phase !== PHASES.SEND
        ? '<p class="text-sm">🔒 先生が送信を解禁するまで待機</p>'
        : '<p class="text-sm">✅ みんなで同時に押して！ Press together!</p>'}
    </div>
  `);
  requestWakeLock();
}

function renderTranslate(session, group) {
  if (needsMicCheck()) return renderMicCheck('translate');

  const translateTo = langLabel(group.translateTo || (group.language === 'ja' ? 'en' : 'ja'));
  const fromLang = group.partnerLanguage === 'ja' ? '🇯🇵 日本語' : '🇺🇸 English';
  const pct = timerProgress(state.elapsed, RECORD_SECONDS);

  render(`
    <div class="screen-inner">
      <div class="phase-icon">${ICONS.translate}</div>
      <h2 class="screen-title">翻訳 · Translate</h2>
      <p class="screen-sub">
        ${fromLang} → ${translateTo.flag} ${translateTo.text}
      </p>
      ${translateStepsHtml()}
      ${group.partnerRecordingUrl ? audioPlayer(group.partnerRecordingUrl) : '<p class="text-sm">相手の録音を読み込み中…</p>'}
      <textarea class="notes-field" id="translateNotes" placeholder="ここにメモ · Write notes here">${state.translateNotes || ''}</textarea>
      <div class="sep"></div>
      <div class="timer-ring">
        <svg viewBox="0 0 120 120">
          <circle class="track" cx="60" cy="60" r="54" />
          <circle class="progress" cx="60" cy="60" r="54"
            stroke-dasharray="${pct.circ}" stroke-dashoffset="${pct.offset}" />
        </svg>
        <div class="timer-text">
          <span class="time">${formatTime(RECORD_SECONDS - state.elapsed)}</span>
          <span class="label">REMAINING</span>
        </div>
      </div>
      ${state.recording ? '<div class="rec-indicator"><span class="rec-dot"></span> REC</div>' : ''}
      <button class="btn btn-record ${state.recording ? 'recording' : ''}" data-action="record" ${state.uploading ? 'disabled' : ''}>
        ${state.recording ? '⏹' : '🎤'}
      </button>
      <p class="text-sm">Step 3 → 翻訳を録音 · Record your translation</p>
    </div>
  `);
  requestWakeLock();
}

function renderWaitReturn(session, group) {
  render(`
    <div class="screen-inner">
      <div class="phase-icon">${ICONS.return}</div>
      <h2 class="screen-title">返却 · Return</h2>
      <p class="screen-sub">Step 4 · 確認して返却<span class="jp">Check, then RETURN</span></p>
      ${audioPlayer(group.translationUrl)}
      <div class="wait-notice"><strong>↩ Step 4</strong>再生して確認 → RETURN ボタン</div>
      <button class="btn btn-return" data-action="return">
        <span class="icon">↩️</span> 返却 RETURN
      </button>
    </div>
  `);
  requestWakeLock();
}

function renderReview(session, group) {
  const spokeJa = group.language === 'ja';
  render(`
    <div class="screen-inner">
      <div class="phase-icon">${ICONS.review}</div>
      <h2 class="screen-title">確認 · Check</h2>
      <p class="screen-sub">
        ${spokeJa
          ? '英語の翻訳は同じ意味？<span class="jp">Same meaning?</span>'
          : '日本語は合ってる？<span class="jp">Does the Japanese match?</span>'}
      </p>
      ${group.returnedUrl ? audioPlayer(group.returnedUrl) : '<p class="text-sm">返却を待っています…</p>'}
      ${group.returnedUrl ? hintSummaryHtml(group, session) : ''}
      ${group.returnedUrl ? `
        <div class="sep"></div>
        <div class="btn-row">
          <button class="btn btn-good" data-action="review" data-review="good" ${state.reviewing ? 'disabled' : ''}><span class="icon">👍</span> GOOD!</button>
          <button class="btn btn-ok" data-action="review" data-review="not_bad" ${state.reviewing ? 'disabled' : ''}><span class="icon">👌</span> NOT BAD!</button>
          <button class="btn btn-best" data-action="review" data-review="tried_best" ${state.reviewing ? 'disabled' : ''}><span class="icon">💪</span> BEST TRY!</button>
        </div>
      ` : ''}
    </div>
  `);
}

function renderDone(group) {
  releaseWakeLock();
  releaseMic();
  const ownReview = group.review ? REVIEW_LABELS[group.review] : null;
  const emoji = ownReview?.emoji || (group.receivedReview ? REVIEW_LABELS[group.receivedReview]?.emoji : '🎉');
  const feedbackBlock = group.receivedReview ? `
    <div class="feedback-card">
      <div class="feedback-emoji">${REVIEW_LABELS[group.receivedReview]?.emoji || '💬'}</div>
      <strong>${group.receivedReviewLabel || REVIEW_LABELS[group.receivedReview]?.ja || ''}</strong>
      <p class="feedback-from">👥 ${group.receivedReviewFrom || 'Partner'} からの評価</p>
    </div>
  ` : '';
  render(`
    <div class="screen-inner">
      <div class="phase-icon">${ICONS.done}</div>
      <h2 class="screen-title">${emoji} 完了 · Done!</h2>
      <p class="screen-sub">お疲れさま！<span class="jp">Great job today!</span></p>
      ${feedbackBlock}
    </div>
  `);
}

/* ── Phase router ── */
function renderCurrentView() {
  const session = state.session;
  if (!session) {
    updatePhaseProgress(null);
    return renderLanding();
  }

  sessionBadge.hidden = false;
  sessionCodeDisplay.textContent = state.sessionId;
  updatePhaseProgress(session);

  if (state.mode === 'teacher') {
    if (session.phase === PHASES.LOBBY) return renderTeacherLobby(session);
    return renderTeacherDashboard(session);
  }

  const group = session.groups?.[state.groupId];
  if (!group) return renderLanding();
  footerHint.textContent = `${group.name} · ${session.phase}`;

  if (session.phase === PHASES.COUNTDOWN) {
    if (group.status === 'sent') return renderSentWaiting();
    if (group.status === 'ready_to_send') return renderCountdown(session);
    if (!group.recordingUrl) return renderRecordPhase(session, group);
    return renderWaitSend(session, group);
  }

  switch (session.phase) {
    case PHASES.LOBBY: return renderStudentLobby(session, group);
    case PHASES.SCRIPT:
      if (group.status === 'script_ready') return renderScriptWaiting();
      return renderScriptWrite(session, group);
    case PHASES.RECORD:
      if (group.status === 'sent') return renderSentWaiting();
      if (group.status === 'ready_to_send' || group.recordingUrl) return renderWaitSend(session, group);
      return renderRecordPhase(session, group);
    case PHASES.SEND:
      if (group.status === 'sent') return renderSentWaiting();
      return renderWaitSend(session, group);
    case PHASES.TRANSLATE:
      if (group.status === 'returned') return renderReturnedWaiting(group);
      if (group.status === 'ready_to_return') return renderWaitReturn(session, group);
      return renderTranslate(session, group);
    case PHASES.RETURN:
      if (group.status === 'returned') return renderReturnedWaiting(group);
      if (group.status === 'ready_to_return') return renderWaitReturn(session, group);
      return renderTranslate(session, group);
    case PHASES.REVIEW:
      if (group.status === 'reviewed') return renderDone(group);
      return renderReview(session, group);
    case PHASES.DONE: return renderDone(group);
    default: return renderStudentLobby(session, group);
  }
}

/* ── Countdown sync ── */
function clearCountdownInterval() {
  if (state.countdownInterval) {
    clearInterval(state.countdownInterval);
    state.countdownInterval = null;
  }
}

function syncCountdown(session) {
  if (session?.phase !== PHASES.COUNTDOWN || !session.countdownUntil) {
    clearCountdownInterval();
    return;
  }

  const tick = () => {
    const left = Math.ceil((session.countdownUntil - Date.now()) / 1000);
    const prev = state.countdownLeft;
    state.countdownLeft = Math.max(0, left);
    if (left <= 0) {
      clearCountdownInterval();
      if (state.mode === 'teacher') advanceCountdownToSend();
      renderCurrentView();
      return;
    }
    if (updateCountdownUI() && prev !== state.countdownLeft) return;
    renderCurrentView();
  };

  tick();
  if (!state.countdownInterval) {
    state.countdownInterval = setInterval(tick, 200);
  }
}

async function advanceCountdownToSend() {
  await updateSession(state.sessionId, { phase: PHASES.SEND, countdownUntil: null });
}

/* ── Session sync ── */
function onSessionUpdate(session) {
  if (!session) return;
  const prevPhase = state.session?.phase;
  state.session = session;

  if (state.mode === 'teacher') autoAdvanceTeacher(session);
  syncCountdown(session);

  if (prevPhase !== session.phase) {
    stopTimer();
    state.elapsed = 0;
    // Re-verify mic when entering translate (iOS may drop stream during long wait)
    if (session.phase === PHASES.TRANSLATE && !hasLiveMic()) {
      state.micReady = false;
    }
    if (session.phase === PHASES.TRANSLATE) {
      state.translateNotes = '';
    }
    if (session.phase !== PHASES.SCRIPT) {
      state.scriptDraft = null;
    }
  }

  renderCurrentView();
}

async function autoAdvanceTeacher(session) {
  const groups = session.groups || {};

  if (session.phase === PHASES.SEND) {
    const allSent = Object.values(groups).every((g) => g.status === 'sent');
    if (allSent) {
      await updateSession(state.sessionId, {
        phase: PHASES.TRANSLATE,
        groups: linkTranslations(session),
      });
    }
  }

  if (session.phase === PHASES.TRANSLATE || session.phase === PHASES.RETURN) {
    const allReturned = Object.values(groups).every((g) => g.status === 'returned');
    if (allReturned) {
      await updateSession(state.sessionId, {
        phase: PHASES.REVIEW,
        groups: linkReviews(session),
      });
    }
  }

  if (session.phase === PHASES.REVIEW) {
    const allReviewed = Object.values(groups).every((g) => g.status === 'reviewed');
    if (allReviewed) {
      await updateSession(state.sessionId, { phase: PHASES.DONE });
    }
  }
}

/* ── Event handlers ── */

async function onCreateSession() {
  try {
    await unlockAudio();
    const code = await createSession();
    state.mode = 'teacher';
    state.sessionId = code;
    state.unsub?.();
    state.unsub = subscribeSession(code, onSessionUpdate);
    footerHint.textContent = '先生モード · Teacher mode';
  } catch (err) {
    console.error('[ConvoRelay] createSession failed:', err);
    alert('セッション作成失敗 · Could not create session\n\n' +
      (err.message?.includes('PERMISSION') || err.code === 'PERMISSION_DENIED'
        ? 'Firebase Rules を確認してください · Check Database rules are published'
        : err.message || 'Unknown error'));
  }
}

async function onJoinSession() {
  await unlockAudio();
  const code = document.getElementById('inputCode')?.value.trim().toUpperCase();
  const groupName = document.getElementById('inputGroup')?.value.trim();
  const studentNumbers = normalizeStudentNumbers(document.getElementById('inputNumbers')?.value);
  if (!code || !groupName) {
    alert('コードとグループ名を入力 · Enter code and group name');
    return;
  }
  try {
    const { sessionId, groupId } = await joinSession(code, groupName, studentNumbers);
    state.mode = 'student';
    state.sessionId = sessionId;
    state.groupId = groupId;
    state.groupName = groupName;
    state.micReady = false;
    state.unsub?.();
    state.unsub = subscribeSession(sessionId, onSessionUpdate);
  } catch (err) {
    const msg = err.message === 'SESSION_NOT_FOUND'
      ? 'セッションが見つかりません · Session not found'
      : err.message === 'GROUP_EXISTS'
        ? 'そのグループ名は使用中 · Group name taken'
        : '参加できません · Could not join';
    alert(msg);
  }
}

async function onTeacherStart() {
  const activityMode = state.teacherActivityMode || ACTIVITY_TALK;
  const groups = assignGroups(state.session, (seed) => pickTopic(seed), activityMode);
  const phase = activityMode === ACTIVITY_SCRIPT ? PHASES.SCRIPT : PHASES.RECORD;
  await updateSession(state.sessionId, { phase, activityMode, groups });
}

async function onTeacherStartRecord() {
  const groups = { ...state.session.groups };
  for (const gid of Object.keys(groups)) {
    if (groups[gid].status === 'script_ready') {
      groups[gid] = { ...groups[gid], status: 'ready_to_record' };
    }
  }
  await updateSession(state.sessionId, { phase: PHASES.RECORD, groups });
}

async function onSubmitScript() {
  if (state.scriptSubmitting) return;
  const lines = state.scriptDraft || [];
  if (lines.length < SCRIPT_LINE_COUNT || lines.some((l) => !String(l).trim())) {
    alert('8行すべて入力してください · Fill all 8 lines');
    return;
  }
  state.scriptSubmitting = true;
  try {
    await updateGroup(state.sessionId, state.groupId, {
      scriptLines: lines,
      status: 'script_ready',
    });
    state.scriptDraft = null;
  } catch {
    alert('保存失敗 · Save failed');
  }
  state.scriptSubmitting = false;
}

function onDownloadRecording(gid, kind) {
  const group = state.session?.groups?.[gid];
  if (!group) return;
  const url = kind === 'translation' ? group.translationUrl : group.recordingUrl;
  if (!url) return;
  downloadDataUrl(url, recordingFilename(group, kind, url));
}

async function onTeacherOpenSend() {
  await updateSession(state.sessionId, {
    phase: PHASES.COUNTDOWN,
    countdownUntil: Date.now() + 3000,
  });
}

async function onMicTest() {
  state.micCheckError = null;
  revokeObjectUrl(state.micCheckUrl);
  state.micCheckUrl = null;
  state.micChecking = true;
  renderCurrentView();

  try {
    const result = await runMicCheck((remaining) => {
      const el = document.getElementById('micStatus');
      if (el) el.textContent = `🔴 ${remaining}… 話してください！`;
    });
    state.micCheckUrl = result.url;
    state.micChecking = false;
    renderCurrentView();
  } catch (err) {
    state.micChecking = false;
    state.micCheckError = micErrorMessage(err);
    renderCurrentView();
  }
}

function onMicConfirm() {
  if (!state.micCheckUrl) return;
  state.micReady = true;
  state.micCheckError = null;
  renderCurrentView();
}

function startTimer(onTick, onComplete) {
  stopTimer();
  state.elapsed = 0;
  state.timerInterval = setInterval(() => {
    state.elapsed++;
    onTick(state.elapsed);
    if (state.elapsed >= RECORD_SECONDS) {
      stopTimer();
      onComplete();
    }
  }, 1000);
}

function stopTimer() {
  if (state.timerInterval) {
    clearInterval(state.timerInterval);
    state.timerInterval = null;
  }
}

async function onToggleRecord() {
  if (state.uploading) return;
  if (state.recording) {
    await finishRecording();
    return;
  }

  if (needsMicCheck()) {
    renderMicCheck(state.session?.phase === PHASES.TRANSLATE ? 'translate' : 'record');
    return;
  }

  try {
    await startRecording();
    state.recording = true;
    renderCurrentView();
    startTimer(() => {
      if (!updateTimerUI()) renderCurrentView();
    }, () => finishRecording());
  } catch (err) {
    state.micReady = false;
    alert(micErrorMessage(err));
    renderCurrentView();
  }
}

async function finishRecording() {
  if (state.uploading) return;
  if (!state.recording && !isRecording()) return;
  stopTimer();
  state.recording = false;

  const blob = await stopRecording();
  if (!blob || blob.size < 100) {
    alert(micErrorMessage({ message: 'NO_AUDIO' }));
    renderCurrentView();
    return;
  }

  const phase = state.session?.phase;
  const label = phase === PHASES.TRANSLATE ? 'translation' : 'recording';

  state.uploading = true;
  footerHint.textContent = 'アップロード中… · Uploading…';
  renderCurrentView();

  let url;
  try {
    url = await uploadAudio(state.sessionId, state.groupId, blob, label);
  } catch {
    state.uploading = false;
    alert('アップロード失敗 — もう一度 · Upload failed — retry');
    renderCurrentView();
    return;
  }

  try {
    if (phase === PHASES.RECORD) {
      await updateGroup(state.sessionId, state.groupId, { recordingUrl: url, status: 'ready_to_send' });
    } else if (phase === PHASES.TRANSLATE) {
      await updateGroup(state.sessionId, state.groupId, { translationUrl: url, status: 'ready_to_return' });
    }
  } catch {
    state.uploading = false;
    alert('保存失敗 — もう一度 · Save failed — retry');
    renderCurrentView();
    return;
  }

  state.uploading = false;
  renderCurrentView();
}

async function onSend() {
  if (state.session?.phase !== PHASES.SEND) return;
  await updateGroup(state.sessionId, state.groupId, { status: 'sent' });
}

async function onReturn() {
  await updateGroup(state.sessionId, state.groupId, { status: 'returned' });
}

async function onReview(review) {
  if (state.reviewing) return;
  const group = state.session?.groups?.[state.groupId];
  if (!group || group.status === 'reviewed') return;

  state.reviewing = true;
  renderCurrentView();

  const label = REVIEW_LABELS[review];
  try {
    await updateGroup(state.sessionId, state.groupId, { status: 'reviewed', review });

    // Send grade to the group that translated for us
    const translatorId = group.targetGroup;
    if (translatorId) {
      await updateGroup(state.sessionId, translatorId, {
        receivedReview: review,
        receivedReviewFrom: group.name,
        receivedReviewLabel: `${label.emoji} ${label.ja}`,
      });
    }
  } catch {
    alert('送信失敗 — もう一度 · Could not save review');
  }
  state.reviewing = false;
}

/* ── Boot ── */
renderLanding();

const params = new URLSearchParams(location.search);
const urlCode = params.get('session');
const urlGroup = params.get('group');
if (urlCode) {
  requestAnimationFrame(() => {
    document.getElementById('inputCode') && (document.getElementById('inputCode').value = urlCode);
    if (urlGroup) document.getElementById('inputGroup').value = urlGroup;
  });
}

window.addEventListener('beforeunload', () => {
  clearCountdownInterval();
  releaseMic();
  revokeObjectUrl(state.micCheckUrl);
  releaseWakeLock();
  state.unsub?.();
});
