import { latestAiFloor } from './time.js';
import { readTimeline } from './timeline.js';
import { sanitizeStoryBody } from './shared-body-wrappers.js';

export const STORY_SMS_PROMPT = '本楼实际新增的短信按[tmt|对话名|发信人]内容[/tmt]输出，原话逐条完整保留。本楼新创短信优先遵循人物明确标注的特殊语言和表达习惯；无此标注时正常使用句内和句末标点，空格或换行不替代标点；引用已发送或既有短信时，原话逐字保留。私聊对话名写对方姓名；群聊写“群:群名”，仅限用户参与的群。发信人用户固定“我”，其他人写姓名；只记录已经发生的收发，不替用户编新发言，无短信不输出。手机参考里的短信已经发送，只承接，不重复输出短信块。不额外填写头像，不写CSS或JSON。例如：[tmt|朋友甲|朋友甲]我到了。[/tmt]。';
const RULE_ID = 'two-more-things:story-sms-display';
const ENTRY_FIELDS = { content: STORY_SMS_PROMPT, constant: true, disable: false, vectorized: false, position: 4, depth: 1, role: 0, probability: 100, useProbability: false, ignoreBudget: true };
const avatarName = character => character.avatar.split('/').at(-1).replace(/\.[^.]+$/, '');
const BLOCK_SOURCE = String.raw`\[tmt\|([^|\]\r\n]+)\|([^|\]\r\n]+)\]([\s\S]*?)\[\/tmt\]`;

export function storySmsRegex() {
  // 气泡直接沿用手机短信页；主楼没有手机主题状态，缺少原token时使用其日间配色。
  const style = `.tmt-main-sms{display:flex;flex-direction:column;align-items:flex-start;gap:3px;margin:10px 0 19px;font:inherit;color:var(--SmartThemeBodyColor,inherit);max-width:100%;box-sizing:border-box}
.tmt-main-sms-title,.tmt-main-sms-sender{max-width:100%;font-size:10px;font-weight:400;line-height:14px;padding:0 3px;overflow-wrap:anywhere;opacity:.75}
.tmt-main-sms:not([data-conversation^="群:"]):not([data-conversation^="群："]):not([data-sender="我"]) .tmt-main-sms-title{display:none}
.tmt-main-sms-bubble{font-size:13.5px;font-weight:300;line-height:1.65;padding:7px 11px;min-width:0;max-width:min(100%,32rem);box-sizing:border-box;border:1px solid var(--pp-divider-soft,#d7dad1);background:var(--pp-surface,#fbfaf6);color:var(--pp-ink,#222a29);border-radius:16px;box-shadow:var(--pp-elevation-soft,0 1px 3px rgb(0 0 0 / 6%),0 1px 2px rgb(0 0 0 / 4%));white-space:pre-wrap;overflow-wrap:anywhere;position:relative}
.tmt-main-sms-bubble::after{content:'';position:absolute;width:7px;height:7px;border-radius:50%;background:var(--pp-surface,#fbfaf6);border:1px solid var(--pp-divider-soft,#d7dad1);box-sizing:border-box;bottom:-9px;left:4px}
.tmt-main-sms[data-sender="我"]{align-items:flex-end}
.tmt-main-sms[data-sender="我"] .tmt-main-sms-bubble{background:var(--pp-message-user,#314a50);color:var(--pp-message-user-text,#f7f7ef);border-color:var(--pp-message-user,#314a50)}
.tmt-main-sms[data-sender="我"] .tmt-main-sms-bubble::after{background:var(--pp-message-user,#314a50);border-color:var(--pp-message-user,#314a50);left:auto;right:4px}`;
  return { id: RULE_ID, scriptName: '两三事·主楼短信气泡', findRegex: `/${BLOCK_SOURCE}/g`,
    replaceString: `<style>${style}</style><div class="tmt-main-sms" data-conversation="$1" data-sender="$2"><div class="tmt-main-sms-title">$1</div><div class="tmt-main-sms-sender">$2</div><div class="tmt-main-sms-bubble">$3</div></div>`,
    trimStrings: [], placement: [2], disabled: false, markdownOnly: true, promptOnly: false, pluginOnly: false, runOnEdit: true, substituteRegex: 0, minDepth: null, maxDepth: null };
}

export function parseStorySms(raw) {
  return [...String(raw || '').matchAll(new RegExp(BLOCK_SOURCE, 'g'))].flatMap((match, index) => {
    const conversation = match[1].trim(), sender = match[2].trim();
    const content = match[3].replace(/<!--\s*tmt-todo\|[\s\S]*?-->/g, '');
    const group = conversation.startsWith('群:') || conversation.startsWith('群：');
    const name = group ? conversation.slice(2).trim() : conversation;
    return name && sender && content.trim() ? [{ index, name, sender, text: content, group }] : [];
  });
}

export function removeAcceptedStorySms(raw, accepted) {
  let index = 0;
  return String(raw || '').replace(new RegExp(BLOCK_SOURCE, 'g'), match => accepted.has(index++) ? '' : match);
}

function storyBodyBlocks(raw, blocks, wrappers) {
  const source = String(raw || '');
  let prefix = '\uE000tmt-sms-';
  while (source.includes(prefix)) prefix += '_';
  let index = 0;
  // Clean only block locations: SMS text and raw source indexes remain authoritative.
  const marked = source.replace(new RegExp(BLOCK_SOURCE, 'g'), () => `${prefix}${index++}\uE001`);
  const body = sanitizeStoryBody(marked, wrappers);
  const accepted = new Set([...body.matchAll(new RegExp(`${prefix}(\\d+)\uE001`, 'g'))].map(match => Number(match[1])));
  return blocks.filter(block => accepted.has(block.index));
}

export function syncStorySms({ target, store, wrapperSettingsProvider = () => ({}) }) {
  const floor = latestAiFloor(target.messages);
  if (!floor || store.read().storySmsImportedFloor === floor.index) return false;
  const parsed = parseStorySms(floor.message.mes);
  if (!parsed.length) return false;
  const blocks = storyBodyBlocks(floor.message.mes, parsed, wrapperSettingsProvider());
  if (!blocks.length) return false;
  const previous = store.read();
  return store.importStorySms({ floor: floor.index, blocks, batch: readTimeline(target.messages) }).then(next => next !== previous);
}

export function createStorySmsInstaller({ host }) {
  return {
    async readStatus() {
      const character = host.captureChat().character, bookName = character?.world;
      if (!character?.avatar || !bookName) return { state: 'missing' };
      const bindings = await host.readStorySmsBindings(), book = await bindings.load(bookName);
      if (!book?.entries) throw new Error('楼内信息注入状态读取失败，请检查当前角色卡的主世界书。');
      const entry = Object.values(book.entries).find(item => item.extensions?.twoMoreThings?.storySms === true);
      const rule = bindings.getRules().find(item => item.id === RULE_ID), currentRule = storySmsRegex();
      const entryReady = entry && Object.entries(ENTRY_FIELDS).every(([key, value]) => entry[key] === value)
        && entry.characterFilter?.isExclude === false && entry.characterFilter.names?.includes(avatarName(character)) && !entry.characterFilter.tags?.length;
      const ruleReady = rule && Object.entries(currentRule).filter(([key]) => key !== 'scriptName').every(([key, value]) => JSON.stringify(rule[key]) === JSON.stringify(value));
      const enabled = !host.readSettings()?.disabledExtensions?.includes('regex') && !bindings.htmlEncoded();
      return { state: entryReady && ruleReady && enabled ? 'installed' : entry || rule ? 'outdated' : 'missing', bookName };
    },
    async install() {
      const target = host.captureChat(), character = target.character;
      if (!character?.avatar) throw new Error('请先打开角色卡聊天，再注入主楼短信格式。');
      const bookName = character.world;
      if (!bookName) throw new Error('请先在当前角色卡绑定主世界书，再点“注入”。');
      if (host.readSettings()?.disabledExtensions?.includes('regex')) throw new Error('请先在酒馆扩展中启用正则，再点“注入”。');
      const bindings = await host.readStorySmsBindings();
      if (bindings.htmlEncoded()) throw new Error('请先在酒馆高级格式设置中关闭HTML标签转义，再点“注入”。');
      const loaded = await bindings.load(bookName);
      if (!loaded?.entries) throw new Error('当前角色卡的主世界书读取失败，请检查绑定的世界书。');
      const book = structuredClone(loaded);
      const entry = Object.values(book.entries).find(item => item.extensions?.twoMoreThings?.storySms === true) || bindings.create(bookName, book);
      if (!entry) throw new Error('主世界书无法新增短信格式，请检查世界书后重试。');
      Object.assign(entry, { comment: '两三事·短信格式', ...ENTRY_FIELDS,
        characterFilter: { ...entry.characterFilter, isExclude: false, names: [...new Set([...(entry.characterFilter?.names || []), avatarName(character)])], tags: [] },
        extensions: { ...entry.extensions, twoMoreThings: { ...entry.extensions?.twoMoreThings, storySms: true } } });
      await bindings.save(bookName, book, true);
      const rule = storySmsRegex(), scripts = bindings.getRules();
      const next = [...scripts.filter(script => script.id !== RULE_ID), rule];
      try { await bindings.saveRules(next); }
      catch { throw new Error('短信格式已写入主世界书，但气泡正则保存失败，请再次点“注入”。'); }
      return { bookName };
    },
  };
}
