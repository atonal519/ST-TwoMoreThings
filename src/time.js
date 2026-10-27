const stamp = /<!--\s*(QQJ|SDC|myknots)-(start|end)\b([\s\S]*?)-->|<bbs_(start|end)\b[^>]*>([\s\S]*?)<\/bbs_\4\s*>/giu;
const known = value => /^(?:未知|未明确|未明|不详|unknown)$/iu.test(value || '') ? '' : value || '';
const field = (raw, name) => new RegExp(`(?:^|[|｜])\\s*${name}\\s*[=＝:]\\s*([^|｜]+)`, 'iu').exec(raw)?.[1]?.trim() || '';
const pad = value => String(value).padStart(2, '0');

function clockTime(raw) {
  const match = /^(?:(上午|下午|中午|凌晨|清晨|早晨|早上|晚上|夜间|AM|PM)\s*)?(\d{1,2})\s*:\s*(\d{2})(?:\s*:\s*(\d{2}))?(?:\s*(AM|PM))?$/iu.exec(raw.normalize('NFKC'));
  if (!match) return null;
  let hour = Number(match[2]);
  const minute = Number(match[3]), period = match[1] || match[5];
  if (hour > 23 || minute > 59 || Number(match[4] || 0) > 59 || period && hour > 12) return null;
  if (period) hour = hour % 12 + (/下午|中午|晚上|夜间|PM/iu.test(period) ? 12 : 0);
  return `${pad(hour)}:${pad(minute)}`;
}

function stampFields(tag) {
  if (tag[1]) return { provider: tag[1].toLowerCase() === 'sdc' ? 'calendar' : 'memory', kind: tag[2].toLowerCase(), date: known(field(tag[3], 'date')), weekday: known(field(tag[3], 'weekday')), time: clockTime(field(tag[3], 'time')) };
  const match = /^([\s\S]*?)\s+((?:(?:上午|下午|中午|凌晨|清晨|早晨|早上|晚上|夜间|AM|PM)\s*)?[\d０-９]{1,2}\s*[:：]\s*[\d０-９]{2}(?:\s*[:：]\s*[\d０-９]{2})?(?:\s*(?:AM|PM))?)$/iu.exec(tag[5].trim());
  return { provider: 'memory', kind: tag[4].toLowerCase(), date: known(match?.[1]?.trim()), weekday: '', time: match ? clockTime(match[2]) : null };
}

function timeConflict(calendar, memory) {
  const normalizeDate = value => known(value.normalize('NFKC').replace(/\s+/gu, ''));
  const left = normalizeDate(calendar.date), right = normalizeDate(memory.date);
  if (!left || !right) return false;
  const numericDate = /^(.*?)(\d+)(?:年|[./-])(\d+)(?:月|[./-])(\d+)日?$/u;
  const a = numericDate.exec(left), b = numericDate.exec(right);
  if (!a || !b || a[1] !== b[1]) return false;
  const minutes = value => { const [hour, minute] = value.split(':').map(Number); return hour * 60 + minute; };
  const clockDifference = minutes(calendar.time) - minutes(memory.time);
  const [yearA, monthA, dayA] = a.slice(2).map(Number);
  const [yearB, monthB, dayB] = b.slice(2).map(Number);
  if (yearA === yearB && monthA === monthB) return Math.abs((dayA - dayB) * 1440 + clockDifference) > 60;
  // 不假设架空历法的月长；只有不同日期的最小可能间隔也超阈值才换源。
  return 1440 - Math.abs(clockDifference) > 60;
}

export function latestAiFloor(messages, beforeIndex = messages.length) {
  for (let i = beforeIndex - 1; i >= 0; i--) {
    const message = messages[i];
    if (message.is_user || message.is_system || ['user', 'system'].includes(message.role) || typeof message.mes !== 'string' || !message.mes) continue;
    return { index: i, message };
  }
  return null;
}

export function readPhoneTime(messages, now = new Date()) {
  // 结束戳代表最新AI楼结束时的剧情时间，不拿更旧楼层补当前时间。
  const body = latestAiFloor(messages)?.message.mes || '';
  const tags = [...body.matchAll(stamp)].map(stampFields);
  const ends = tags.filter(tag => tag.kind === 'end'), candidates = ends.length ? ends : tags;
  let current = candidates.at(-1);
  if (current?.provider === 'calendar' && current.time) {
    const memory = candidates.findLast(tag => tag.provider === 'memory' && tag.time);
    if (memory && timeConflict(current, memory)) current = memory;
  }
  if (current?.time) return { source: 'story', date: current.date, weekday: current.weekday, time: current.time };
  return {
    source: 'real', date: `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`,
    weekday: now.toLocaleDateString('zh-CN', { weekday: 'long' }),
    time: `${pad(now.getHours())}:${pad(now.getMinutes())}`,
  };
}
