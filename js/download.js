/** Download helpers for teacher panel. */

export function audioExt(dataUrl = '') {
  if (dataUrl.includes('audio/mp4') || dataUrl.includes('audio/aac') || dataUrl.includes('audio/m4a')) {
    return 'm4a';
  }
  if (dataUrl.includes('audio/webm')) return 'webm';
  return 'm4a';
}

export function sanitizeFilename(s) {
  return (s || 'group')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '-')
    .replace(/[^a-z0-9\-]/g, '')
    .slice(0, 24) || 'group';
}

/** e.g. team-sakura-6-21-4-original.m4a */
export function recordingFilename(group, kind, dataUrl) {
  const base = sanitizeFilename(group.name);
  const nums = (group.studentNumbers || '')
    .split(/[,\s]+/)
    .map((n) => n.trim())
    .filter(Boolean)
    .join('-') || '0';
  const ext = audioExt(dataUrl);
  return `${base}-${nums}-${kind}.${ext}`;
}

export function downloadDataUrl(dataUrl, filename) {
  if (!dataUrl) return;
  const a = document.createElement('a');
  a.href = dataUrl;
  a.download = filename;
  a.style.display = 'none';
  document.body.appendChild(a);
  a.click();
  a.remove();
}
