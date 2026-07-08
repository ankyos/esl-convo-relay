/**
 * Convo Relay — main application orchestrator.
 * Optimized for iPad Safari (mic, wake lock, touch).
 */

import { TOPICS, pickTopic } from './topics.js';
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
  PHASE_STEPS,
  phaseStepIndex,
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
  const current = phaseStepIndex(session.phase);
  phaseDots.innerHTML = PHASE_STEPS.map((step, i) => {
    const cls = i < current ? 'done' : i === current ? 'active' : '';
    const conn = i < PHASE_STEPS.length - 1 ? '<div class="phase-connector"></div>' : '';
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

function bindEvents() {
  screen.querySelector('[data-action="create"]')?.addEventListener('click', onCreateSession);
  screen.querySelector('[data-action="join"]')?.addEventListener('click', onJoinSession);
  screen.querySelector('[data-action="start"]')?.addEventListener('click', onTeacherStart);
  screen.querySelector('[data-action="open-send"]')?.addEventListener('click', onTeacherOpenSend);
  screen.querySelector('[data-action="mic-test"]')?.addEventListener('click', onMicTest);
  screen.querySelector('[data-action="mic-confirm"]')?.addEventListener('click', onMicConfirm);
  screen.querySelector('[data-action="record"]')?.addEventListener('click', onToggleRecord);
  screen.querySelector('[data-action="send"]')?.addEventListener('click', onSend);
  screen.querySelector('[data-action="return"]')?.addEventListener('click', onReturn);
  screen.querySelectorAll('[data-action="review"]').forEach((btn) => {
    btn.addEventListener('click', () => onReview(btn.dataset.review));
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
      <div class="field">
        <label>👥 グループ名 · Group Name</label>
        <input id="inputGroup" type="text" placeholder="Team Sakura" autocomplete="off" />
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
            : groups.map(([, g]) => `<li><span>${g.name}</span><span class="chip wait">${g.status}</span></li>`).join('')}
        </ul>
      </div>
      ${pairingPreview(session)}
      <button class="btn btn-primary" data-action="start" ${groups.length < 2 ? 'disabled' : ''}>
        <span class="icon">🎬</span> スタート Start (${groups.length}/2+)
      </button>
      <p class="text-sm">最低2グループ必要 · Need at least 2 groups</p>
    </div>
  `);
}

function renderTeacherDashboard(session) {
  const groups = Object.entries(session.groups || {});
  const phase = session.phase;
  let action = '';

  if (phase === PHASES.RECORD) {
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
    </div>
  `);
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
      <div class="${cls}">${text}</div>
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
        ${scaffoldHtml(group, topic)}
      </div>
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
      <button class="btn btn-record ${state.recording ? 'recording' : ''}" data-action="record">
        ${state.recording ? '⏹' : '🎤'}
      </button>
      <p class="text-sm">2分間、友達と話そう · Chat casually for 2 minutes</p>
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

function renderReturnedWaiting() {
  render(`
    <div class="screen-inner">
      <div class="phase-icon">${ICONS.return}</div>
      <h2 class="screen-title">返却完了 · Returned!</h2>
      <p class="screen-sub">確認フェーズまで待機…</p>
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
        <span class="jp">辞書OK · 自分で作るのがベスト！</span>
      </p>
      ${group.partnerRecordingUrl ? audioPlayer(group.partnerRecordingUrl) : '<p class="text-sm">相手の録音を読み込み中…</p>'}
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
      <button class="btn btn-record ${state.recording ? 'recording' : ''}" data-action="record">
        ${state.recording ? '⏹' : '🎤'}
      </button>
      <p class="text-sm">翻訳した会話を録音 · Record your translation</p>
    </div>
  `);
  requestWakeLock();
}

function renderWaitReturn(session, group) {
  render(`
    <div class="screen-inner">
      <div class="phase-icon">${ICONS.return}</div>
      <h2 class="screen-title">返却 · Return</h2>
      <p class="screen-sub">翻訳録音完了！<span class="jp">Hit RETURN when ready</span></p>
      ${audioPlayer(group.translationUrl)}
      <div class="wait-notice"><strong>⏸ 確認してから返却</strong>再生 → ↩ RETURN</div>
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
      ${group.returnedUrl ? `
        <div class="sep"></div>
        <div class="btn-row">
          <button class="btn btn-good" data-action="review" data-review="good"><span class="icon">👍</span> GOOD!</button>
          <button class="btn btn-ok" data-action="review" data-review="not_bad"><span class="icon">👌</span> NOT BAD!</button>
          <button class="btn btn-best" data-action="review" data-review="tried_best"><span class="icon">💪</span> BEST TRY!</button>
        </div>
      ` : ''}
    </div>
  `);
}

function renderDone(group) {
  releaseWakeLock();
  releaseMic();
  const emoji = group.review === 'good' ? '👍' : group.review === 'not_bad' ? '👌' : '💪';
  render(`
    <div class="screen-inner">
      <div class="phase-icon">${ICONS.done}</div>
      <h2 class="screen-title">${emoji} 完了 · Done!</h2>
      <p class="screen-sub">お疲れさま！<span class="jp">Great job today!</span></p>
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
    case PHASES.RECORD:
      if (group.status === 'sent') return renderSentWaiting();
      if (group.status === 'ready_to_send' || group.recordingUrl) return renderWaitSend(session, group);
      return renderRecordPhase(session, group);
    case PHASES.SEND:
      if (group.status === 'sent') return renderSentWaiting();
      return renderWaitSend(session, group);
    case PHASES.TRANSLATE:
      if (group.status === 'returned') return renderReturnedWaiting();
      if (group.status === 'ready_to_return') return renderWaitReturn(session, group);
      return renderTranslate(session, group);
    case PHASES.RETURN:
      if (group.status === 'returned') return renderReturnedWaiting();
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
    state.countdownLeft = Math.max(0, left);
    if (left <= 0) {
      clearCountdownInterval();
      if (state.mode === 'teacher') advanceCountdownToSend();
    }
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
  if (!code || !groupName) {
    alert('コードとグループ名を入力 · Enter code and group name');
    return;
  }
  try {
    const { sessionId, groupId } = await joinSession(code, groupName);
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
  await updateSession(state.sessionId, {
    phase: PHASES.RECORD,
    groups: assignGroups(state.session, (seed) => pickTopic(seed)),
  });
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
    startTimer(() => renderCurrentView(), () => finishRecording());
  } catch (err) {
    state.micReady = false;
    alert(micErrorMessage(err));
    renderCurrentView();
  }
}

async function finishRecording() {
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

  footerHint.textContent = 'アップロード中… · Uploading…';
  let url;
  try {
    url = await uploadAudio(state.sessionId, state.groupId, blob, label);
  } catch {
    alert('アップロード失敗 — もう一度 · Upload failed — retry');
    renderCurrentView();
    return;
  }

  if (phase === PHASES.RECORD) {
    await updateGroup(state.sessionId, state.groupId, { recordingUrl: url, status: 'ready_to_send' });
  } else if (phase === PHASES.TRANSLATE) {
    await updateGroup(state.sessionId, state.groupId, { translationUrl: url, status: 'ready_to_return' });
  }
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
  await updateGroup(state.sessionId, state.groupId, { status: 'reviewed', review });
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
