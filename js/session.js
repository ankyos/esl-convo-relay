/**
 * Firebase session sync for cross-iPad classroom activity.
 * Falls back to in-memory demo mode when Firebase is not configured.
 */

const DEFAULT_FIREBASE_CONFIG = {
  apiKey: 'YOUR_API_KEY',
  authDomain: 'YOUR_PROJECT.firebaseapp.com',
  databaseURL: 'https://YOUR_PROJECT-default-rtdb.firebaseio.com',
  projectId: 'YOUR_PROJECT',
  storageBucket: 'YOUR_PROJECT.appspot.com',
  messagingSenderId: '000000000000',
  appId: '1:000000000000:web:xxxxxxxx',
};

let firebaseConfig = { ...DEFAULT_FIREBASE_CONFIG };
let configLoaded = false;

/** Load optional js/config.js override; never throws if file is missing. */
async function loadConfig() {
  if (configLoaded) return firebaseConfig;
  try {
    const mod = await import('./config.js');
    if (mod.firebaseConfig) firebaseConfig = mod.firebaseConfig;
  } catch {
    // config.js missing on GitHub Pages — demo mode is fine
  }
  configLoaded = true;
  return firebaseConfig;
}

const PHASES = {
  LOBBY: 'lobby',
  RECORD: 'record',
  COUNTDOWN: 'countdown',
  SEND: 'send',
  TRANSLATE: 'translate',
  RETURN: 'return',
  REVIEW: 'review',
  DONE: 'done',
};

/** Ordered steps for progress bar (countdown grouped with send). */
export const PHASE_STEPS = [
  { key: PHASES.LOBBY, icon: '👥', label: 'Join' },
  { key: PHASES.RECORD, icon: '🎤', label: 'Talk' },
  { key: PHASES.SEND, icon: '📤', label: 'Send' },
  { key: PHASES.TRANSLATE, icon: '🔄', label: 'Translate' },
  { key: PHASES.RETURN, icon: '↩️', label: 'Return' },
  { key: PHASES.REVIEW, icon: '✅', label: 'Check' },
  { key: PHASES.DONE, icon: '🎉', label: 'Done' },
];

export function phaseStepIndex(phase) {
  if (phase === PHASES.COUNTDOWN) return PHASE_STEPS.findIndex((s) => s.key === PHASES.SEND);
  return PHASE_STEPS.findIndex((s) => s.key === phase);
}

export { PHASES };

let db = null;
let firebaseReady = false;
const listeners = new Set();

// Demo mode: in-memory store for local testing without Firebase
const demoStore = { sessions: {} };

function generateCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  for (let i = 0; i < 6; i++) code += chars[Math.floor(Math.random() * chars.length)];
  return code;
}

function groupIdFromName(name) {
  return name.trim().toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9\-]/g, '') || 'group';
}

async function initFirebase() {
  await loadConfig();
  if (firebaseReady) return firebaseReady;
  if (!firebaseConfig?.apiKey || firebaseConfig.apiKey === 'YOUR_API_KEY') {
    console.info('[ConvoRelay] Firebase not configured — using demo mode (single browser only).');
    firebaseReady = false;
    return false;
  }
  try {
    const { initializeApp } = await import('https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js');
    const dbMod = await import('https://www.gstatic.com/firebasejs/10.12.0/firebase-database.js');

    const app = initializeApp(firebaseConfig);
    db = dbMod.getDatabase(app);
    firebaseReady = true;
    console.info('[ConvoRelay] Firebase Database ready (Spark plan — audio stored in DB, no Storage needed).');
    return true;
  } catch (err) {
    console.error('[ConvoRelay] Firebase init failed:', err);
    firebaseReady = false;
    return false;
  }
}

function sessionRef(sessionId) {
  return `sessions/${sessionId}`;
}

function notify(sessionId, data) {
  listeners.forEach((fn) => fn(sessionId, data));
}

/* ── Demo mode helpers ── */

function demoGet(sessionId) {
  return demoStore.sessions[sessionId] || null;
}

function demoSet(sessionId, data) {
  demoStore.sessions[sessionId] = data;
  notify(sessionId, data);
}

function demoUpdate(sessionId, patch) {
  const cur = demoGet(sessionId) || {};
  demoSet(sessionId, deepMerge(cur, patch));
}

function deepMerge(target, source) {
  const out = { ...target };
  for (const key of Object.keys(source)) {
    if (source[key] && typeof source[key] === 'object' && !Array.isArray(source[key])) {
      out[key] = deepMerge(target[key] || {}, source[key]);
    } else {
      out[key] = source[key];
    }
  }
  return out;
}

/* ── Public API ── */

export async function isOnline() {
  await initFirebase();
  return firebaseReady;
}

export async function createSession(teacherName = 'Teacher') {
  await initFirebase();
  const code = generateCode();
  const session = {
    code,
    phase: PHASES.LOBBY,
    createdAt: Date.now(),
    teacher: teacherName,
    groups: {},
  };

  if (firebaseReady) {
    const { ref, set } = await import('https://www.gstatic.com/firebasejs/10.12.0/firebase-database.js');
    await set(ref(db, sessionRef(code)), session);
  } else {
    demoSet(code, session);
  }
  return code;
}

export async function joinSession(code, groupName) {
  await initFirebase();
  const gid = groupIdFromName(groupName);
  const group = {
    name: groupName.trim(),
    joinedAt: Date.now(),
    language: null,
    topicId: null,
    status: 'joined',
    recordingUrl: null,
    translationUrl: null,
    review: null,
    sourceGroup: null,
    targetGroup: null,
  };

  if (firebaseReady) {
    const { ref, get, update } = await import('https://www.gstatic.com/firebasejs/10.12.0/firebase-database.js');
    const snap = await get(ref(db, sessionRef(code)));
    if (!snap.exists()) throw new Error('SESSION_NOT_FOUND');
    const data = snap.val();
    if (data.groups?.[gid]) throw new Error('GROUP_EXISTS');
    await update(ref(db, `${sessionRef(code)}/groups/${gid}`), group);
  } else {
    const data = demoGet(code);
    if (!data) throw new Error('SESSION_NOT_FOUND');
    if (data.groups[gid]) throw new Error('GROUP_EXISTS');
    demoUpdate(code, { groups: { [gid]: group } });
  }
  return { sessionId: code, groupId: gid };
}

export function subscribeSession(sessionId, callback) {
  const handler = (sid, data) => {
    if (sid === sessionId) callback(data);
  };
  listeners.add(handler);

  if (firebaseReady && db) {
    import('https://www.gstatic.com/firebasejs/10.12.0/firebase-database.js').then(({ ref, onValue }) => {
      onValue(ref(db, sessionRef(sessionId)), (snap) => {
        callback(snap.val());
      });
    });
  } else {
    callback(demoGet(sessionId));
  }

  return () => listeners.delete(handler);
}

export async function updateSession(sessionId, patch) {
  await initFirebase();
  if (firebaseReady) {
    const { ref, update } = await import('https://www.gstatic.com/firebasejs/10.12.0/firebase-database.js');
    await update(ref(db, sessionRef(sessionId)), patch);
  } else {
    demoUpdate(sessionId, patch);
  }
}

export async function updateGroup(sessionId, groupId, patch) {
  await initFirebase();
  if (firebaseReady) {
    const { ref, update } = await import('https://www.gstatic.com/firebasejs/10.12.0/firebase-database.js');
    await update(ref(db, `${sessionRef(sessionId)}/groups/${groupId}`), patch);
  } else {
    const data = demoGet(sessionId);
    if (!data) return;
    const merged = { ...data.groups[groupId], ...patch };
    demoUpdate(sessionId, { groups: { ...data.groups, [groupId]: merged } });
  }
}

export async function uploadAudio(sessionId, groupId, blob, label) {
  await initFirebase();
  // Store audio as base64 data URLs in Realtime Database — works on free Spark plan
  // (Firebase Storage requires Blaze/billing for new projects)
  void sessionId;
  void groupId;
  void label;
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

/**
 * Assign languages + topics, build round-robin pairing.
 */
export function assignGroups(session, topicPicker) {
  const ids = Object.keys(session.groups || {}).sort();
  const groups = { ...session.groups };
  const n = ids.length;

  ids.forEach((gid, i) => {
    const seed = hashCode(session.code + gid);
    groups[gid] = {
      ...groups[gid],
      language: seed % 2 === 0 ? 'ja' : 'en',
      topicId: topicPicker(seed).id,
      status: 'ready_to_record',
      targetGroup: ids[(i + 1) % n],
      sourceGroup: ids[(i - 1 + n) % n],
    };
  });

  return groups;
}

function hashCode(str) {
  let h = 0;
  for (let i = 0; i < str.length; i++) {
    h = (h << 5) - h + str.charCodeAt(i);
    h |= 0;
  }
  return h;
}

/**
 * When all groups sent, attach partner recordings for translate phase.
 */
export function linkTranslations(session) {
  const groups = { ...session.groups };
  for (const gid of Object.keys(groups)) {
    const g = groups[gid];
    const partner = groups[g.sourceGroup];
    groups[gid] = {
      ...g,
      status: 'translating',
      partnerRecordingUrl: partner?.recordingUrl || null,
      partnerLanguage: partner?.language || null,
      translateTo: g.language === 'ja' ? 'en' : 'ja',
    };
  }
  return groups;
}

/**
 * When all returned, attach translation back for review.
 */
export function linkReviews(session) {
  const groups = { ...session.groups };
  for (const gid of Object.keys(groups)) {
    const g = groups[gid];
    const translator = groups[g.targetGroup];
    groups[gid] = {
      ...g,
      status: 'reviewing',
      returnedUrl: translator?.translationUrl || null,
    };
  }
  return groups;
}

export function countGroups(session) {
  return Object.keys(session?.groups || {}).length;
}

export function allGroupsStatus(session, status) {
  const groups = Object.values(session?.groups || {});
  return groups.length > 0 && groups.every((g) => g.status === status);
}

export function allGroupsAtLeast(session, statuses) {
  const groups = Object.values(session?.groups || {});
  return groups.length > 0 && groups.every((g) => statuses.includes(g.status));
}
