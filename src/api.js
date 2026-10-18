import { normalizeContent } from './content.js';

const pool = settings => settings['schedule-planner']?.apiPresets || [];
const refKey = ref => ref ? `${ref.kind}:${ref.presetId || ''}` : '';
const flat = value => value && ({ url: value.apiUrl, key: value.apiKey, model: value.apiModel, excludeParams: value.apiExcludeParams, timeoutSec: value.apiTimeoutSec });
const normalizeUrl = value => {
  const url = String(value || '').trim().replace(/\/+$/, '').replace(/\/chat\/completions$/i, '');
  return /^https?:\/\/[^/?#]+$/i.test(url) ? `${url}/v1` : url;
};

export function listApiSources(settings) {
  const sources = [];
  const qqj = settings.qianqianjie;
  const gouhua = settings['schedule-planner'];
  if (qqj?.apiUrl || qqj?.apiKey || qqj?.apiMode === 'seven-preset' && qqj.selectedSevenDaysPresetId) {
    const value = qqj.apiMode === 'seven-preset' ? pool(settings).find(x => x.id === qqj.selectedSevenDaysPresetId) : flat(qqj);
    sources.push({ ref: { kind: 'qqj-current' }, label: '跟随千千结', model: value?.model });
  }
  if (gouhua?.apiUrl || gouhua?.apiKey) sources.push({ ref: { kind: 'gouhua-current' }, label: '跟随构画', model: gouhua.apiModel });
  for (const item of pool(settings)) if (item.id) sources.push({ ref: { kind: 'shared-preset', presetId: item.id }, label: `共享预设 · ${item.name || item.model || '未命名'}`, model: item.model });
  return sources;
}

export function resolveApiConfig(settings, ref) {
  let config;
  if (ref?.kind === 'qqj-current') {
    const q = settings.qianqianjie;
    config = q?.apiMode === 'seven-preset' ? pool(settings).find(x => x.id === q.selectedSevenDaysPresetId) : flat(q);
  } else if (ref?.kind === 'gouhua-current') config = flat(settings['schedule-planner']);
  else if (ref?.kind === 'shared-preset') config = pool(settings).find(x => x.id === ref.presetId);
  const url = normalizeUrl(config?.url);
  if (!/^https?:\/\//i.test(url) || !config?.key || !config?.model) throw new Error('请在手机设置中选择可用连接，或在原配置中补全地址、密钥和模型。');
  return { url, key: config.key, model: config.model, excludeParams: config.excludeParams || [], timeoutSec: config.timeoutSec };
}

export async function saveManualPreset(settings, draft, saveSettings) {
  const preset = { id: globalThis.crypto.randomUUID(), name: draft.name?.trim() || draft.model?.trim(), url: normalizeUrl(draft.url), key: draft.key?.trim(), model: draft.model?.trim(), excludeParams: [], timeoutSec: 180, stream: false };
  resolveApiConfig({ 'schedule-planner': { apiPresets: [preset] } }, { kind: 'shared-preset', presetId: preset.id });
  const container = settings['schedule-planner'] ||= {};
  const previous = container.apiPresets;
  container.apiPresets = [...(previous || []), preset];
  try { await saveSettings(); }
  catch { container.apiPresets = previous; throw new Error('连接保存失败，请重试。'); }
  return { kind: 'shared-preset', presetId: preset.id };
}

export function createApiSettings({ host, onBusyChange = () => {} }) {
  const api = {
    listSources: () => listApiSources(host.readSettings()),
    async fetchModels(draft) {
      const url = normalizeUrl(draft.url), key = String(draft.key || '').trim();
      if (!/^https?:\/\//i.test(url) || !key) throw new Error('请先填写接口地址和密钥，再拉取模型。');
      onBusyChange(true);
      try {
        let response;
        try { response = await host.request('/api/backends/chat-completions/status', { method: 'POST', body: JSON.stringify({ chat_completion_source: 'openai', reverse_proxy: url, proxy_password: key }), signal: AbortSignal.timeout(60000) }); }
        catch { throw new Error('模型列表拉取失败，请检查酒馆和接口连接后重试。'); }
        if (!response.ok) throw new Error(`模型列表拉取失败（${response.status}），请检查接口地址和密钥。`);
        let data;
        try { data = await response.json(); }
        catch { throw new Error('接口没有返回可读取的模型列表。'); }
        const rows = Array.isArray(data?.data) ? data.data : Array.isArray(data?.models) ? data.models : [];
        const models = [...new Set(rows.map(item => typeof item === 'string' ? item : item?.id).filter(item => typeof item === 'string' && item.trim()).map(item => item.trim()))].sort();
        if (!models.length) throw new Error('接口没有返回可用模型，可检查接口或自行填写模型名称。');
        return models;
      } finally { onBusyChange(false); }
    },
    getSelected() {
      const selected = host.readSettings().pocketPhone?.apiSourceRef;
      if (selected) return selected;
      const sources = api.listSources();
      return sources.find(x => x.ref.kind === 'qqj-current')?.ref || sources.find(x => x.ref.kind === 'gouhua-current')?.ref || (sources.length === 1 ? sources[0].ref : null);
    },
    async select(ref) {
      if (!api.listSources().some(x => refKey(x.ref) === refKey(ref))) throw new Error('这条连接已不存在，请重新选择。');
      const settings = host.readSettings();
      const previous = settings.pocketPhone;
      settings.pocketPhone = { ...previous, apiSourceRef: { ...ref } };
      try { await host.saveSettings(); }
      catch { settings.pocketPhone = previous; throw new Error('连接选择保存失败，请重试。'); }
    },
    async saveManual(draft) {
      const ref = await saveManualPreset(host.readSettings(), draft, host.saveSettings);
      await api.select(ref);
      return ref;
    },
    resolve: () => resolveApiConfig(host.readSettings(), api.getSelected()),
  };
  return api;
}

export function createModelClient({ host, sourceProvider, onBusyChange = () => {} }) {
  return {
    async complete({ system, messages, maxTokens = 1800 }) {
      onBusyChange(true);
      try {
        const config = sourceProvider.resolve();
        const body = { chat_completion_source: 'openai', reverse_proxy: config.url, proxy_password: config.key, model: config.model, messages: [{ role: 'system', content: system }, ...messages], stream: false, temperature: 0.8, max_tokens: maxTokens };
        for (const key of config.excludeParams) if (['temperature', 'max_tokens'].includes(key)) delete body[key];
        let response;
        try { response = await host.request('/api/backends/chat-completions/generate', { method: 'POST', body: JSON.stringify(body), signal: AbortSignal.timeout(Math.max(1, Number(config.timeoutSec) || 180) * 1000) }); }
        catch (error) { throw new Error(error.name === 'TimeoutError' ? '生成等待超时，请稍后重试。' : '生成请求未能连接，请检查酒馆和接口连接后重试。'); }
        if (!response.ok) throw new Error(`生成失败（${response.status}），请检查所选连接的地址、密钥和模型。`);
        let data;
        try { data = await response.json(); }
        catch { throw new Error('接口没有返回可读取的回答，请检查所选模型后重试。'); }
        const content = data.choices?.[0]?.message?.content;
        const text = typeof content === 'string' ? content : Array.isArray(content) ? content.filter(x => x.type === 'text').map(x => x.text).join('\n') : '';
        if (!text.trim()) throw new Error('模型没有返回正文，请检查连接或稍后重试。');
        return text;
      } finally { onBusyChange(false); }
    },
  };
}

const string = value => typeof value === 'string' ? value.trim() : '';
const array = value => Array.isArray(value) ? value : value == null ? [] : [value];
function extract(value, kind) {
  if (Array.isArray(value)) return value;
  if (!value || typeof value !== 'object') return null;
  const keys = kind === 'messages' ? ['messages', 'replies', 'reply', 'message'] : kind === 'contacts' ? ['contacts', 'people'] : ['posts', 'threads'];
  for (const key of keys) if (value[key] != null) return array(value[key]);
  for (const key of ['data', 'result', 'answer']) if (value[key] && typeof value[key] === 'object') { const found = extract(value[key], kind); if (found) return found; }
  return null;
}

export function parsePayload(text, kind, { allowEmpty = false } = {}) {
  const source = String(text).trim();
  const candidates = [source, ...[...source.matchAll(/```(?:json)?\s*([\s\S]*?)```/gi)].map(x => x[1])];
  const first = source.indexOf('{');
  const last = source.lastIndexOf('}');
  if (first >= 0 && last > first) candidates.push(source.slice(first, last + 1));
  let items;
  for (const candidate of candidates) {
    try { items = extract(JSON.parse(candidate), kind); } catch { continue; }
    if (items) break;
  }
  const valid = (items || []).flatMap(item => {
    if (kind === 'messages') {
      if (item?.role && !['assistant', 'char'].includes(item.role)) return [];
      const content = normalizeContent(item);
      return content ? [content] : [];
    }
    if (!item || typeof item !== 'object') return [];
    if (kind === 'contacts') {
      const name = string(item.name ?? item.displayName);
      return name ? [{ name, personality: string(item.personality), expression: string(item.expression ?? item.speakingStyle),
        ...(string(item.nickname) ? { nickname: string(item.nickname) } : {}),
        ...(string(item.language) ? { language: string(item.language) } : {}),
        ...(string(item.sourceId) ? { sourceId: string(item.sourceId) } : {}),
      }] : [];
    }
    const title = string(item.title), author = string(item.author ?? item.username), content = string(item.content ?? item.text);
    if (!title || !author || !content) return [];
    const comments = array(item.comments ?? item.replies).flatMap(comment => {
      const author = string(comment?.author ?? comment?.username), text = string(comment?.text ?? comment?.content);
      return author && text ? [{ author, text }] : [];
    });
    return [{ title, author, content, comments, category: string(item.category) }];
  });
  if (!valid.length && !allowEmpty) throw new Error(kind === 'contacts' ? '回答中没有可用的联系人，请检查角色卡和世界书后重新整理。' : kind === 'forum' ? '回答中没有可用的完整帖子，请重新刷新。' : '回答中没有可用的对方短信，请点继续重试。');
  return valid;
}

export function parseJsonObject(text) {
  const source = String(text).trim(), first = source.indexOf('{'), last = source.lastIndexOf('}');
  for (const candidate of [source, source.slice(first, last + 1)]) {
    try {
      let value = JSON.parse(candidate);
      for (const key of ['data', 'result', 'answer']) if (value?.[key] && typeof value[key] === 'object') value = value[key];
      if (value && typeof value === 'object') return value;
    } catch { /* 正式JSON可被代码块或说明文字包裹。 */ }
  }
  throw new Error('回答中的JSON无法读取，请重新生成。');
}
