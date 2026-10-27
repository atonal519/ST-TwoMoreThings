import { jsonrepair } from './vendor/jsonrepair/regular/jsonrepair.js';

// Keep the established strict wrappers ahead of any syntax repair. Only a whole
// response document (or its whole closed fence) is eligible for local repair.
export function* modelJsonValues(text) {
  const source = String(text).trim(), first = source.indexOf('{'), last = source.lastIndexOf('}');
  const fenced = [...source.matchAll(/```(?:json)?\s*([\s\S]*?)```/gi)].map(match => match[1]);
  const strict = [source, ...fenced, ...(first >= 0 && last > first ? [source.slice(first, last + 1)] : [])];
  for (const candidate of new Set(strict)) {
    try { yield JSON.parse(candidate); } catch { /* Try the next established wrapper. */ }
  }
  const fence = /^```(?:json)?\s*([\s\S]*?)```\s*$/i.exec(source);
  const candidate = (fence && fenced.length === 1 ? fence[1] : source).trim();
  if (!(candidate.startsWith('{') && candidate.endsWith('}') || candidate.startsWith('[') && candidate.endsWith(']'))) return;
  try { yield JSON.parse(jsonrepair(candidate, { completeDocument: true })); } catch { /* Incomplete or unusable responses stay rejected. */ }
}
