const stamp = /<!--\s*(?:QQJ|SDC|myknots)-(start|end)\b([\s\S]*?)-->/giu;
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

export function latestAiFloor(messages) {
  for (let i = messages.length - 1; i >= 0; i--) {
    const message = messages[i];
    if (message.is_user || message.is_system || ['user', 'system'].includes(message.role) || typeof message.mes !== 'string' || !message.mes) continue;
    return { index: i, message };
  }
  return null;
}

export function readPhoneTime(messages, now = new Date()) {
  // 结束戳代表最新AI楼结束时的剧情时间，不拿更旧楼层补当前时间。
  const body = latestAiFloor(messages)?.message.mes || '';
  const tags = [...body.matchAll(stamp)];
  const current = tags.filter(tag => tag[1].toLowerCase() === 'end').at(-1) || tags.at(-1);
  const time = current && clockTime(field(current[2], 'time'));
  if (time) return { source: 'story', date: known(field(current[2], 'date')), weekday: known(field(current[2], 'weekday')), time };
  return {
    source: 'real', date: `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`,
    weekday: now.toLocaleDateString('zh-CN', { weekday: 'long' }),
    time: `${pad(now.getHours())}:${pad(now.getMinutes())}`,
  };
}
