// 此宿主不导入src；资源计数只从实际manifest/embed公开入口开始。
const query = new URLSearchParams(location.search), mode = query.get('mode') || 'standalone';
const portrait = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jHbcAAAAASUVORK5CYII=';
const h = globalThis.startupHarness = {
  metadataSaves: 0, settingsSaves: 0, errors: [], notices: [], listeners: new Map(),
  metadata: { foreign: 'keep', pocketPhone: { schemaVersion: 1, contacts: [{ id: 'lin', name: '林舟', avatar: portrait, expression: '说话简短' }], groups: [{ id: 'friends', name: '朋友', memberIds: ['lin'], userIsMember: true }], conversations: {}, forum: { posts: [] }, theme: 'day', lockStyle: 'rounded' } },
};
const settings = h.settings = { 'schedule-planner': { apiPresets: [{ id: 'test', url: 'https://fixture.invalid/v1', key: 'fixture', model: 'fixture-model' }] }, pocketPhone: { qrShow: true }, twoMoreThingsEmbedded: { qrShow: true } };
const ctx = h.context = {
  chatId: 'startup-fixture', characterId: 0, name1: '我', characters: [{ name: '林舟', avatar: 'fixture.png', data: { extensions: { world: 'fixture-book' } } }],
  chat: [{ is_user: false, mes: '你们约好在书店碰面。<!-- QQJ-end | date=2031年4月8日 | time=09:30 -->' }], chatMetadata: h.metadata, extensionSettings: settings,
  getRequestHeaders: () => ({ 'Content-Type': 'application/json' }), saveMetadata: async () => { h.metadataSaves++; }, saveSettingsDebounced: () => { h.settingsSaves++; }, setExtensionPrompt: () => {},
  eventTypes: { GENERATION_AFTER_COMMANDS: 'before-main', GENERATION_ENDED: 'main-ended', MESSAGE_UPDATED: 'edited', MESSAGE_SWIPED: 'swiped', CHAT_CHANGED: 'changed' },
  eventSource: { on(name, fn) { if (!h.listeners.has(name)) h.listeners.set(name, new Set()); h.listeners.get(name).add(fn); }, removeListener(name, fn) { h.listeners.get(name)?.delete(fn); } },
  SlashCommand: { fromProps: value => value }, SlashCommandParser: { commands: {}, addCommandObject(command) { this.commands[command.name] = command; } },
};
if (query.get('host') === 'luker') { ctx.saveChatMetadata = async () => { await ctx.saveMetadata(); return true; }; globalThis.Luker = { getContext: () => ctx }; }
else globalThis.SillyTavern = { getContext: () => ctx };
globalThis.toastr = { error: value => h.errors.push(value), warning: value => h.notices.push(value), success: value => h.notices.push(value) };
const sets = new Map(), active = new Set();
globalThis.quickReplyApi = {
  settings: { isEnabled: true, config: { hasSet: set => active.has(set.name) } }, getSetByName: name => sets.get(name),
  createSet: async name => { const set = { name, qrList: [], save: async () => {} }; sets.set(name, set); return set; },
  createQuickReply: (name, label, value) => sets.get(name).qrList.push({ label, ...value }),
  updateQuickReply: (name, label, value) => Object.assign(sets.get(name).qrList.find(qr => qr.label === label), value),
  deleteQuickReply: (name, label) => { const set = sets.get(name); set.qrList = set.qrList.filter(qr => qr.label !== label); },
  addGlobalSet: name => active.add(name), removeGlobalSet: name => active.delete(name), deleteSet: async name => sets.delete(name),
};
h.startedAt = performance.now();
if (mode === 'empty') {
  // 导出的助手脚本在子框架执行，再挂到这个干净的父窗口。
} else if (mode === 'embedded') {
  const { mountEmbedded } = await import('../embed.js');
  h.app = mountEmbedded({ release: { version: '0.3.9', sha: 'a'.repeat(40) } });
} else {
  const manifest = await fetch('../manifest.json').then(response => response.json());
  await import(new URL(`../${manifest.js}`, import.meta.url));
}
h.readyAt = performance.now(); h.ready = true;
