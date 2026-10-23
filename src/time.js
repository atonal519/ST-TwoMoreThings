const stamp = /<!--\s*(?:QQJ|SDC|myknots)-(start|end)\b([\s\S]*?)-->|<bbs_(start|end)\b[^>]*>([\s\S]*?)<\/bbs_\3\s*>/giu;
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
  if (tag[1]) return { kind: tag[1].toLowerCase(), date: known(field(tag[2], 'date')), weekday: known(field(tag[2], 'weekday')), time: clockTime(field(tag[2], 'time')) };
  const match = /^([\s\S]*?)\s+((?:(?:上午|下午|中午|凌晨|清晨|早晨|早上|晚上|夜间|AM|PM)\s*)?[\d０-９]{1,2}\s*[:：]\s*[\d０-９]{2}(?:\s*[:：]\s*[\d０-９]{2})?(?:\s*(?:AM|PM))?)$/iu.exec(tag[4].trim());
  return { kind: tag[3].toLowerCase(), date: known(match?.[1]?.trim()), weekday: '', time: match ? clockTime(match[2]) : null };
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
  const current = tags.filter(tag => tag.kind === 'end').at(-1) || tags.at(-1);
  if (current?.time) return { source: 'story', date: current.date, weekday: current.weekday, time: current.time };
  return {
    source: 'real', date: `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`,
    weekday: now.toLocaleDateString('zh-CN', { weekday: 'long' }),
    time: `${pad(now.getHours())}:${pad(now.getMinutes())}`,
  };
}
