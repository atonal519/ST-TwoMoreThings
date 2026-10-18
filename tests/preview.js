import { createHostAdapter } from '../src/host.js';
import { readTimeline } from '../src/timeline.js';

const state = {
  schemaVersion: 1,
  injectEnabled: false,
  contacts: [
    { id: 'lin', name: '林舟', tone: 'blue', personality: '温和、细心，有自己的节奏。', expression: '句子简短自然，偶尔开个轻轻的玩笑。' },
    { id: 'zhou', name: '周予', tone: 'warm', personality: '爽快、热心，喜欢分享生活里的小事。', expression: '说话直接，熟悉后会带一点调侃。' },
    { id: 'xu', name: '许知', tone: 'lilac', personality: '安静、敏锐，对感兴趣的话题很认真。', expression: '语气平和，用词清楚，不刻意亲昵。' },
  ],
  conversations: {
    lin: [
      { id: 'm1', role: 'assistant', text: '刚从书店出来。你上次说的那本书，我替你留了一本。', timeLabel: '18:26' },
      { id: 'm2', role: 'user', text: '这么巧，我正想问你。', timeLabel: '18:27' },
      { id: 'm3', role: 'assistant', text: '不算巧。路过的时候特意进去看了一眼。', timeLabel: '18:28' },
      { id: 'm4', role: 'assistant', text: '晚上有空的话，一起吃个饭？书也顺便给你。', timeLabel: '18:29' },
    ],
    zhou: [{ id: 'm5', role: 'assistant', text: '下次那家面馆开门，我一定提前告诉你。', timeLabel: '17:42' }],
    xu: [{ id: 'm6', role: 'assistant', text: '照片收到了。窗边那束光很好看。', timeLabel: '昨天' }],
  },
  forum: { posts: createPosts(false) },
};
function createPosts(fresh) {
  return [
    { id: 'p1', category: '街坊闲聊', author: '今天也想早睡', title: fresh ? '有人去过新开的旧书交换角吗？' : '谁把银杏路的路牌画了一只猫？', content: '今天经过银杏路，发现路牌边上多了一只小猫。画得还挺认真，旁边写着“慢一点，前面有好事发生”。\n\n不是，有没有人知道是谁画的？我已经连续三天绕路去看它了。', comments: [
      { author: '路过一下', text: '我昨天也看到了！耳朵还是一高一低的。' },
      { author: '不想上早班', text: '前面确实有好事，早餐摊今天多送了我一个蛋。' },
      { author: '周予', text: '先别找作者了，明天路过帮我拍张照。' },
      { author: '小满', text: '这种不知道谁留下的小事，挺让人开心的。' },
    ] },
    { id: 'p2', category: '生活日常', author: '一只纸袋', title: fresh ? '傍晚的河边突然有点秋天的味道' : '傍晚六点，旧书店的灯终于亮了', content: '停业一个月，今天路过终于看到门口亮灯了。老板说新整理了一整面旅行书，想找冷门地图册的可以去碰碰运气。', comments: [
      { author: '留一盏灯', text: '太好了，下班过去看看。' },
      { author: '林舟', text: '靠窗的第二排也整理好了。' },
      { author: '随便逛逛', text: '那只总在门口睡觉的猫还在吗？' },
    ] },
    { id: 'p3', category: '随口一问', author: '晚风营业中', title: fresh ? '你们会把收到的明信片放在哪里？' : '如果今天能多出一小时，你会做什么？', content: '不加班，也不补觉。就假设这一小时什么都不用赶，你会把它花在哪里？', comments: [
      { author: '许知', text: '走一条平常没有走过的路。' },
      { author: '饭点再叫我', text: '慢慢吃一顿饭，手机倒扣在桌上。' },
      { author: '小岛来信', text: '给很久没联系的人发一句“最近好吗”。' },
    ] },
  ];
}
const h = window.previewHarness = {
  requests: [], metadata: { foreign: { keep: true }, pocketPhone: { schemaVersion: 1, ...state } },
  mainMessages: [{ name: '林舟', is_user: false, mes: '傍晚，你们约好了在旧书店见面。' }], prompt: '', metadataSaves: 0, settingsSaves: 0,
};
const listeners = new Map();
const settings = {
  qianqianjie: { apiUrl: 'https://preview.invalid/v1', apiKey: 'preview-only', apiModel: '示例模型' },
  'schedule-planner': { apiPresets: [{ id: 'daily', name: '日常聊天', url: 'https://preview.invalid/v1', key: 'preview-only', model: '示例模型' }] },
};
const ctx = {
  SlashCommand: { fromProps: value => value },
  SlashCommandParser: { commands: {}, addCommandObject(command) { this.commands[command.name] = command; } },
  chatId: 'preview', characterId: 0, characters: [{ name: '林舟', description: '说话简短，性格细心温和。', scenario: '一座安静的城市。' }], name1: '我',
  chat: h.mainMessages, chatMetadata: h.metadata, extensionSettings: settings,
  saveMetadata: async () => { if (h.saveWait) await h.saveWait; h.metadataSaves++; }, saveSettingsDebounced: () => { h.settingsSaves++; }, getRequestHeaders: () => ({ 'Content-Type': 'application/json' }),
  setExtensionPrompt: (id, text) => { h.prompt = text; },
  eventTypes: { GENERATION_AFTER_COMMANDS: 'before-main', GENERATION_ENDED: 'main-ended', MESSAGE_UPDATED: 'main-edited', MESSAGE_SWIPED: 'main-swiped' },
  eventSource: { on: (name, fn) => listeners.set(name, fn), removeListener: name => listeners.delete(name) },
};
if (new URLSearchParams(location.search).get('host') === 'luker') {
  ctx.saveChatMetadata = async () => { await ctx.saveMetadata(); return true; };
}
h.context = ctx;
h.beforeGeneration = () => listeners.get('before-main')?.();
h.storyUpdated = () => listeners.get('main-ended')?.();
if (new URLSearchParams(location.search).get('clock') === 'story') {
  h.mainMessages[0].mes += '\n<!-- QQJ-end | date=大陆历1686年10月4日 | weekday=周二 | time=23:58 -->';
}
for (const history of Object.values(h.metadata.pocketPhone.conversations)) for (const message of history) message.batch = readTimeline(h.mainMessages);
const host = createHostAdapter({ contextProvider: () => ctx,
  worldInfoBindings: { getNames: () => ['示例世界书'], load: async () => ({ entries: { 0: { content: '林舟和周予有一个朋友群，用户也在其中。', disable: false } } }) },
  fetchImpl: async (path, init) => {
    const body = JSON.parse(init.body); h.requests.push({ path, body });
    if (path.endsWith('/status')) return Response.json(h.models || { data: [{ id: '示例模型-A' }, { id: '示例模型-B' }] }, { status: h.modelsStatus || 200 });
    if (path === '/api/images/upload') { h.lastUpload = body; return Response.json({ path: '/user/images/pocket-phone/preview.webp' }); }
    if (h.replyWait) await h.replyWait;
    const system = body.messages[0].content;
    const result = system.includes('手机聊天压') ? { summary: '用户与林舟约好晚点在书店见面。' }
      : system.includes('已有通讯录') ? { contacts: [], groups: [] }
      : system.includes('论坛内容') ? { posts: createPosts(true) }
      : system.includes('整理已有') ? { contacts: [{ name: '林舟', personality: '温和、细心', expression: '短句，语气平和。' }] }
      : { messages: [{ text: '好，那我在书店门口等你。' }] };
    return Response.json({ choices: [{ message: { content: JSON.stringify(system.includes('手机聊天压') ? h.summary || result : h.reply || result) } }] });
  },
});
const qrSets = new Map(), qrActive = new Set();
globalThis.quickReplyApi = {
  settings: { isEnabled: true, config: { hasSet: set => qrActive.has(set.name) } },
  getSetByName: name => qrSets.get(name),
  createSet: async name => { const set = { name, qrList: [], save: async () => {} }; qrSets.set(name, set); return set; },
  createQuickReply: (name, label, value) => qrSets.get(name).qrList.push({ label, ...value }),
  deleteQuickReply: (name, label) => { const set = qrSets.get(name); set.qrList = set.qrList.filter(qr => qr.label !== label); },
  addGlobalSet: name => qrActive.add(name), removeGlobalSet: name => qrActive.delete(name), deleteSet: async name => qrSets.delete(name),
};
h.runQuickReply = () => ctx.SlashCommandParser.commands['tmt-open']?.callback();
h.settings = settings;
if (new URLSearchParams(location.search).get('entry') === 'extension') {
  // Exercise the manifest entry's automatic registration against a simulated host.
  const kind = new URLSearchParams(location.search).get('host') === 'luker' ? 'Luker' : 'SillyTavern';
  globalThis[kind] = { getContext: () => ctx };
  const manifest = await fetch(new URL('../manifest.json', import.meta.url)).then(response => response.json());
  await import(new URL(`../${manifest.js}`, import.meta.url));
} else {
  const { initialize } = await import('../index.js');
  const app = initialize({ host, documentRef: document, qqjBridgeProvider: () => null });
  h.app = app;
  app.open();
}
