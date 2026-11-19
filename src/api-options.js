const RESERVED = new Set(['chat_completion_source', 'reverse_proxy', 'proxy_password', 'custom_url', 'custom_include_body', 'custom_include_headers', 'custom_exclude_body', 'base_url', 'api_key', 'apiKey', 'key', 'headers', 'secret_id', 'secretId', 'model', 'messages', 'prompt', 'json_schema', 'response_format', 'stream']);
export const protectedApiParam = key => RESERVED.has(key);
export function parseAdditionalParams(value) {
  if (value == null || typeof value === 'string' && !value.trim()) return {};
  let parsed;
  try { if (typeof value !== 'string') throw Error(); parsed = JSON.parse(value); }
  catch { throw Error('附加参数须为 JSON 对象。'); }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw Error('附加参数须为 JSON 对象。');
  const validate = item => {
    if (typeof item === 'number' && !Number.isFinite(item)) throw Error('附加参数包含不支持的数值。');
    if (item === null || typeof item !== 'object') return;
    for (const [key, child] of Object.entries(item)) {
      if (['__proto__', 'constructor', 'prototype'].includes(key)) throw Error('附加参数包含不支持的字段。');
      validate(child);
    }
  };
  validate(parsed);
  if (Object.keys(parsed).some(protectedApiParam)) throw Error('附加参数不能覆盖连接、模型、消息或输出格式。');
  return parsed;
}
export function apiOptions(value = {}, partial = false) {
  const result = {};
  const has = key => !partial || Object.hasOwn(value, key);
  if (has('stream')) result.stream = value.stream === true;
  if (has('excludeParams')) {
    const rows = Array.isArray(value.excludeParams) ? value.excludeParams : String(value.excludeParams || '').split(/[\n,，]/);
    result.excludeParams = [...new Set(rows.map(item => String(item).trim()).filter(Boolean))];
  }
  if (has('timeoutSec')) {
    const number = value.timeoutSec == null || value.timeoutSec === '' ? 180 : Number(value.timeoutSec);
    if (!Number.isInteger(number) || number < 5 || number > 600) throw Error('超时秒数须为 5–600 的整数。');
    result.timeoutSec = number;
  }
  if (has('tmtRetryCount')) {
    const number = value.tmtRetryCount == null || value.tmtRetryCount === '' ? 0 : Number(value.tmtRetryCount);
    if (value.tmtRetryCount != null && !['number', 'string'].includes(typeof value.tmtRetryCount) || !Number.isSafeInteger(number) || number < 0 || !Number.isSafeInteger(number + 1)) throw Error('失败重试次数请填 0 或正整数。');
    result.tmtRetryCount = number;
  }
  if (has('tmtTemperature')) {
    const raw = value.tmtTemperature;
    const number = raw == null || typeof raw === 'string' && !raw.trim() ? undefined : Number(raw);
    if (number !== undefined && (!['number', 'string'].includes(typeof raw) || !Number.isFinite(number) || number < 0 || number > 2 || Math.abs(number * 100 - Math.round(number * 100)) >= 1e-8)) throw Error('温度须在 0–2 之间，并按 0.01 递增。');
    result.tmtTemperature = number;
  }
  if (has('tmtAdditionalParams')) {
    const parsed = parseAdditionalParams(value.tmtAdditionalParams);
    result.tmtAdditionalParams = Object.keys(parsed).length ? value.tmtAdditionalParams.trim() : undefined;
  }
  return result;
}
export function applyApiOptions(base, options) {
  const result = { ...base };
  for (const [key, value] of Object.entries(options)) {
    if (value === undefined) delete result[key]; else result[key] = value;
  }
  return result;
}
