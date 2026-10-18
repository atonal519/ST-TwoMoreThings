const list = value => Array.isArray(value) ? value : typeof value === 'string' ? [value] : [];
const macro = (text, values) => String(text).replace(/\{\{\s*(user|char)\s*\}\}/giu, (match, name) => values[name.toLowerCase()] || match);
const escapeRegex = text => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

function matches(text, key, entry, defaults, values) {
  const needle = macro(key, values).trim();
  if (!needle) return false;
  const regex = /^\/([\s\S]*)\/([dgimsuvy]*)$/u.exec(needle);
  if (regex) { try { return new RegExp(regex[1], regex[2]).test(text); } catch { return false; } }
  const sensitive = entry.caseSensitive ?? defaults.caseSensitive;
  const source = sensitive ? text : text.toLocaleLowerCase(), expected = sensitive ? needle : needle.toLocaleLowerCase();
  if (!(entry.matchWholeWords ?? defaults.matchWholeWords)) return source.includes(expected);
  return new RegExp(`(?:^|\\W)${escapeRegex(expected)}(?:$|\\W)`, 'u').test(source);
}

export function selectWorldEntries(entries, text, { defaults = {}, user = '', char = '' } = {}) {
  const values = { user, char };
  return entries.filter(entry => {
    if (entry.disable || entry.disabled || entry.enabled === false || typeof entry.content !== 'string') return false;
    if (entry.constant) return true;
    const match = key => matches(text, key, entry, defaults, values);
    if (!list(entry.key ?? entry.keys).some(match)) return false;
    const secondary = list(entry.keysecondary ?? entry.secondary_keys);
    if (!entry.selective || !secondary.length) return true;
    const hits = secondary.map(match);
    return entry.selectiveLogic === 1 ? !hits.every(Boolean) : entry.selectiveLogic === 2 ? !hits.some(Boolean) : entry.selectiveLogic === 3 ? hits.every(Boolean) : hits.some(Boolean);
  }).sort((a, b) => (b.order || 0) - (a.order || 0)).map(entry => ({ ...entry, content: macro(entry.content, values) }));
}
