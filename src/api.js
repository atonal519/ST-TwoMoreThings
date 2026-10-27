import { normalizeContent } from './content.js';
import { getSharedProcessingPrompt, prependProcessingPrompt } from './shared-processing-prompt.js';
import { modelJsonValues } from './model-json.js';

const pool = settings => settings['schedule-planner']?.apiPresets || [];
const refKey = ref => ref ? `${ref.kind}:${ref.presetId || ''}` : '';
const normalizeUrl = value => {
  const url = String(value || '').trim().replace(/\/+$/, '').replace(/\/chat\/completions$/i, '');
  return /^https?:\/\/[^/?#]+$/i.test(url) ? `${url}/v1` : url;
};

const sharedConfig = (settings, ref) => ref?.kind === 'shared-preset' ? pool(settings).find(item => item.id === ref.presetId) : undefined;

export function listApiSources(settings) {
  return pool(settings).filter(item => item.id).map(item => ({ ref: { kind: 'shared-preset', presetId: item.id }, label: item.name || item.model || '未命名', model: item.model, hasKey: Boolean(item.key) }));
}

export function resolveApiConfig(settings, ref, localModel) {
  const config = sharedConfig(settings, ref), url = normalizeUrl(config?.url);
  if (!/^https?:\/\//i.test(url) || !config?.key) throw new Error('请在手机设置中选择共享预设，或自行填写连接。');
  const model = String(localModel || config.model || '').trim();
  if (!model) throw new Error('请在手机连接设置中填写模型并保存。');
  return { url, key: config.key, model, excludeParams: config.excludeParams || [], timeoutSec: config.timeoutSec };
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
  const settingsKey = host.phoneSettingsKey || 'pocketPhone';
  async function persistPresets(presets, patch, errorText) {
    const settings = host.readSettings(), previous = settings[settingsKey], previousShared = settings['schedule-planner'];
    const shared = settings['schedule-planner'] ||= {}, previousPresets = shared.apiPresets;
    shared.apiPresets = presets; settings[settingsKey] = { ...previous, ...patch };
    try { await host.saveSettings(); }
    catch {
      if (previousShared === undefined) delete settings['schedule-planner']; else shared.apiPresets = previousPresets;
      if (previous === undefined) delete settings[settingsKey]; else settings[settingsKey] = previous;
      throw new Error(errorText);
    }
  }
  function draftConfig(draft, ref) {
    const base = sharedConfig(host.readSettings(), ref);
    const config = { url: normalizeUrl(draft.url), key: String(draft.key || '').trim() || String(base?.key || '').trim(), model: String(draft.model || '').trim() };
    resolveApiConfig({ 'schedule-planner': { apiPresets: [{ id: 'draft', ...config }] } }, { kind: 'shared-preset', presetId: 'draft' });
    return config;
  }
  const api = {
    listSources: () => listApiSources(host.readSettings()),
    async fetchModels(draft, ref) {
      const config = ref ? sharedConfig(host.readSettings(), ref) : draft;
      const url = normalizeUrl(draft.url), key = String(draft.key || '').trim() || String(config?.key || '').trim();
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
      const settings = host.readSettings();
      const selected = settings[settingsKey]?.apiSourceRef || settings.pocketPhone?.apiSourceRef;
      if (selected) return selected;
      const sources = api.listSources();
      return sources.length === 1 ? sources[0].ref : null;
    },
    readDraft(ref = api.getSelected()) {
      const settings = host.readSettings(), config = sharedConfig(settings, ref);
      return { url: normalizeUrl(config?.url), key: '', model: String(settings[settingsKey]?.apiModel || config?.model || '').trim() };
    },
    async saveModel(value) {
      const model = String(value || '').trim();
      if (!model) throw new Error('请填写模型名称。');
      const settings = host.readSettings(), previous = settings[settingsKey];
      resolveApiConfig(settings, api.getSelected(), model);
      settings[settingsKey] = { ...previous, apiModel: model };
      try { await host.saveSettings(); }
      catch { settings[settingsKey] = previous; throw new Error('模型设置保存失败，请重试。'); }
    },
    async select(ref, { model } = {}) {
      if (!api.listSources().some(x => refKey(x.ref) === refKey(ref))) throw new Error('这条连接已不存在，请重新选择。');
      const settings = host.readSettings();
      const previous = settings[settingsKey], changed = refKey(api.getSelected()) !== refKey(ref);
      const selectedModel = model !== undefined ? model.trim() : changed ? String(sharedConfig(settings, ref)?.model || '').trim() : undefined;
      settings[settingsKey] = { ...previous, apiSourceRef: { ...ref }, ...(selectedModel !== undefined ? { apiModel: selectedModel } : {}) };
      try { await host.saveSettings(); }
      catch { settings[settingsKey] = previous; throw new Error('连接选择保存失败，请重试。'); }
    },
    async saveManual(draft) {
      const ref = await saveManualPreset(host.readSettings(), draft, host.saveSettings);
      await api.select(ref, { model: draft.model });
      return ref;
    },
    async saveCurrent(draft) {
      const settings = host.readSettings(), ref = api.getSelected(), current = sharedConfig(settings, ref);
      if (!current) throw new Error('这条连接已不存在，请重新选择或另存为。');
      const config = draftConfig(draft, ref);
      const presets = pool(settings).map(preset => preset.id === ref.presetId ? { ...preset, url: config.url, key: config.key } : preset);
      await persistPresets(presets, { apiSourceRef: { ...ref }, apiModel: config.model }, '连接保存失败，请重试。');
    },
    async saveAs(draft, name, ref = api.getSelected()) {
      const label = String(name || '').trim(); if (!label) throw new Error('请输入预设名称。');
      const settings = host.readSettings(), config = draftConfig(draft, ref), current = sharedConfig(settings, ref);
      const preset = { excludeParams: [], timeoutSec: 180, stream: false, ...current, ...config, id: globalThis.crypto.randomUUID(), name: label };
      const selected = { kind: 'shared-preset', presetId: preset.id };
      await persistPresets([...pool(settings), preset], { apiSourceRef: selected, apiModel: config.model }, '连接保存失败，请重试。');
      return selected;
    },
    async deletePreset(ref = api.getSelected()) {
      const settings = host.readSettings();
      if (!sharedConfig(settings, ref)) throw new Error('这条连接已不存在，请重新选择。');
      await persistPresets(pool(settings).filter(preset => preset.id !== ref.presetId), refKey(api.getSelected()) === refKey(ref) ? { apiSourceRef: { kind: 'none' }, apiModel: '' } : {}, '连接删除失败，请重试。');
    },
    resolve: () => resolveApiConfig(host.readSettings(), api.getSelected(), host.readSettings()[settingsKey]?.apiModel),
  };
  return api;
}

export function createModelClient({ host, sourceProvider, onBusyChange = () => {} }) {
  return {
    async complete({ system, messages }) {
      onBusyChange(true);
      try {
        const config = sourceProvider.resolve();
        const body = { chat_completion_source: 'openai', reverse_proxy: config.url, proxy_password: config.key, model: config.model, messages: [{ role: 'system', content: prependProcessingPrompt(system, getSharedProcessingPrompt(host.readSettings())) }, ...messages], stream: false, temperature: 0.8 };
        if (config.excludeParams.includes('temperature')) delete body.temperature;
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

export function parsePayload(text, kind, { allowEmpty = false, indexed = false } = {}) {
  let items;
  for (const candidate of modelJsonValues(text)) {
    items = extract(candidate, kind);
    if (items) break;
  }
  const valid = (items || []).flatMap(item => {
    if (kind === 'messages') {
      if (item?.role && !['assistant', 'char'].includes(item.role)) return indexed ? [null] : [];
      const content = normalizeContent(item);
      return content ? [content] : indexed ? [null] : [];
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
      const translation = string(comment?.translation ?? comment?.translatedText);
      return author && text ? [{ author, text, ...(translation ? { translation } : {}) }] : [];
    });
    const titleTranslation = string(item.titleTranslation ?? item.title_translation);
    const contentTranslation = string(item.contentTranslation ?? item.content_translation ?? item.translation);
    return [{ title, author, content, comments, category: string(item.category),
      ...(titleTranslation ? { titleTranslation } : {}), ...(contentTranslation ? { contentTranslation } : {}),
    }];
  });
  if (!valid.some(Boolean) && !allowEmpty) throw new Error(kind === 'contacts' ? '回答中没有可用的联系人，请检查角色卡和世界书后重新整理。' : kind === 'forum' ? '回答中没有可用的完整帖子，请重新刷新。' : '回答中没有可用的对方短信，请点继续重试。');
  return valid;
}

export function parseJsonObject(text) {
  for (let value of modelJsonValues(text)) {
    for (const key of ['data', 'result', 'answer']) if (value?.[key] && typeof value[key] === 'object') value = value[key];
    if (value && typeof value === 'object') return value;
  }
  throw new Error('回答中的JSON无法读取，请重新生成。');
}
