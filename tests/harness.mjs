import { createHostAdapter } from '../src/host.js';

export function createHarness({ hostKind = 'native', metadata = {}, messages = [], settings = {}, completion = { choices: [{ message: { content: '{"messages":[{"text":"好，晚点见。"}]}' } }] } } = {}) {
  const harness = { metadataSaves: 0, settingsSaves: 0, modelRequests: [], promptSlots: new Map(), persistedMetadata: null, saveFailure: null, completion, listeners: new Map() };
  const context = {
    chatId: '故事聊天', characterId: 0, groupId: null, name1: '我', name2: '林舟',
    characters: [{ name: '林舟', avatar: '林舟.png', description: '性格温和，说话简短。周予是他的朋友。', personality: '细心', scenario: '在一座普通城市生活。', data: { extensions: { world: '城市人物' } } }],
    chat: messages, chatMetadata: metadata, extensionSettings: settings,
    getRequestHeaders: () => ({ 'Content-Type': 'application/json', 'X-CSRF-Token': 'test-csrf' }),
    saveSettingsDebounced: () => { harness.settingsSaves++; },
    saveMetadata: async () => {
      if (harness.saveFailure) throw harness.saveFailure;
      harness.metadataSaves++;
      harness.persistedMetadata = structuredClone(context.chatMetadata);
    },
    setExtensionPrompt: (id, text) => harness.promptSlots.set(id, text),
    eventTypes: { GENERATION_AFTER_COMMANDS: 'before-generation', GENERATION_ENDED: 'main-ended', MESSAGE_UPDATED: 'main-edited', MESSAGE_SWIPED: 'main-swiped' },
    eventSource: { on: (name, fn) => harness.listeners.set(name, fn), removeListener: (name, fn) => { if (harness.listeners.get(name) === fn) harness.listeners.delete(name); } },
  };
  if (hostKind === 'luker') context.saveChatMetadata = async () => { await context.saveMetadata(); return true; };
  harness.context = context;
  harness.fetchImpl = async (path, init) => {
    harness.modelRequests.push({ path, body: JSON.parse(init.body), headers: init.headers });
    return Response.json(typeof harness.completion === 'function' ? harness.completion(path, init) : harness.completion);
  };
  harness.host = createHostAdapter({ contextProvider: () => context, fetchImpl: harness.fetchImpl, worldInfoBindings: { getNames: () => ['城市人物'], load: async () => ({ entries: { 0: { uid: 0, content: '周予性格爽快，表达直接。', disable: false, comment: '周予' } } }) } });
  return harness;
}
