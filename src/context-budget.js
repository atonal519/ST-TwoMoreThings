// Bounds read-only model DTOs; canonical records and their identity/permission fields stay intact.
const textFields = new Set(['text', 'translation', 'messageText', 'description', 'expression', 'personality', 'content', 'title', 'contentTranslation', 'titleTranslation']);
function tail(text, length) {
  let start = Math.max(0, text.length - length);
  const unit = text.charCodeAt(start);
  if (start > 0 && unit >= 0xDC00 && unit <= 0xDFFF && text.charCodeAt(start - 1) >= 0xD800 && text.charCodeAt(start - 1) <= 0xDBFF) start++;
  return text.slice(start);
}
const excerpt = (text, limit) => text.length <= limit ? text : limit > 5 ? '[节选]' + tail(text, limit - 4) : tail(text, limit);
export const jsonSize = value => JSON.stringify(value).length;

export function clipProjection(value, budget) {
  const result = structuredClone(value);
  if (jsonSize(result) <= budget) return result;
  const fields = [];
  function visit(node) {
    if (!node || typeof node !== 'object') return;
    for (const [key, item] of Object.entries(node)) {
      if (textFields.has(key) && typeof item === 'string') fields.push({ node, key, text: item });
      else if (item && typeof item === 'object') visit(item);
    }
  }
  visit(result);
  if (!Array.isArray(result)) result.excerpted = true;
  const apply = limit => { for (const { node, key, text } of fields) node[key] = limit === 0 ? '' : excerpt(text, limit); };
  apply(0);
  if (jsonSize(result) > budget) return null;
  // A shared cap leaves a usable excerpt of each long text/translation/reference.
  let low = 0, high = Math.min(budget, Math.max(0, ...fields.map(field => field.text.length)));
  while (low < high) {
    const middle = Math.ceil((low + high) / 2); apply(middle);
    if (jsonSize(result) <= budget) low = middle;
    else high = middle - 1;
  }
  apply(low);
  return result;
}

export function fitRows(rows, { limit = 20, budget = 6000 } = {}) {
  const result = [];
  for (const row of rows.slice(0, Math.max(0, limit))) {
    const remaining = budget - jsonSize(result) - Number(result.length > 0);
    const projected = clipProjection(row, remaining);
    if (!projected) break;
    result.push(projected);
  }
  return result;
}
export const recentRows = (rows, options) => fitRows([...rows].reverse(), options).reverse();
export function remainingPhoneBudget(history, previousMessages) {
  return { limit: Math.max(0, 20 - history.length - previousMessages.length), budget: Math.max(2, 6000 - jsonSize({ history, previousMessages, phoneContext: [] }) + 2) };
}
