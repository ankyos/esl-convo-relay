/** Script-writing mode — 4 speakers × 2 lines, alternating. */

export const SCRIPT_LINE_COUNT = 8;
export const SCRIPT_SPEAKERS = 4;

/** Line order: A B C D A B C D — no consecutive same speaker */
export const SCRIPT_PATTERN = [0, 1, 2, 3, 0, 1, 2, 3];

const ROMAJI_NAMES = [
  'Yuki', 'Haruto', 'Sakura', 'Ren', 'Aoi', 'Sota', 'Hina', 'Kaito',
  'Mei', 'Riku', 'Yui', 'Daiki', 'Mio', 'Hayato', 'Natsuki', 'Kenta',
  'Rin', 'Shota', 'Aki', 'Tsubasa', 'Emi', 'Naoki', 'Koharu', 'Takeshi',
];

export function generateScriptNames(seed) {
  const pool = [...ROMAJI_NAMES];
  const names = [];
  let s = Math.abs(seed);
  for (let i = 0; i < SCRIPT_SPEAKERS; i++) {
    s = (s * 1103515245 + 12345) | 0;
    const idx = Math.abs(s) % pool.length;
    names.push(pool.splice(idx, 1)[0]);
  }
  return names;
}

export function normalizeStudentNumbers(raw) {
  return (raw || '')
    .split(/[,\s]+/)
    .map((n) => n.trim().replace(/\D/g, ''))
    .filter(Boolean)
    .join(',');
}

export function escapeHtml(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
