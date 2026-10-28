import { latestAiFloor, readPhoneTime } from './time.js';

export function readTimeline(messages, beforeIndex = messages.length) {
  const floor = latestAiFloor(messages, beforeIndex), clock = readPhoneTime(floor ? [floor.message] : []);
  // 没有剧情戳时仍以楼为卡口；现实分钟变化不会把同一楼拆成多批。
  const key = JSON.stringify([floor?.index ?? -1, ...(clock.source === 'story' ? [clock.date, clock.time] : [])]);
  const label = [clock.date, clock.time, floor ? `主楼 #${floor.index}` : '正文开始前'].filter(Boolean).join(' · ');
  return { key, label, clock };
}

function historyLabel(batch) {
  try {
    const key = JSON.parse(batch.key);
    if (Array.isArray(key) && Number.isInteger(key[0]) && key[0] >= 0) return batch.label.replace(/主楼 #\d+$/, `主楼 #${key[0]}`);
  } catch {}
  return batch.label;
}

export function partitionHistory(messages = [], anchor) {
  const current = [], groups = new Map();
  for (const message of messages) {
    if (message.batch?.key === anchor.key) { current.push(message); continue; }
    const batch = message.batch?.key == null ? { key: 'legacy', label: '早期记录（未按楼分组）' } : message.batch;
    if (!groups.has(batch.key)) groups.set(batch.key, { key: batch.key, label: historyLabel(batch), messages: [] });
    groups.get(batch.key).messages.push(message);
  }
  return { current, past: [...groups.values()] };
}

export const currentMessages = (messages = [], anchor) => messages.filter(message => message.batch?.key === anchor.key);
