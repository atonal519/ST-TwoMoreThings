import { latestAiFloor } from './time.js';
import { readTimeline } from './timeline.js';
import { sanitizeStoryBody } from './shared-body-wrappers.js';
import { isUserIdentity } from './identities.js';

export const STORY_SMS_PROMPT = '本楼每条实际新收发的短信，在叙事写到收发发生时就地以完整[tmt|对话名|发信人]原话[/tmt]呈现，原话逐条完整保留。同一条新短信的原话只在这一处标签内出现一次；正文照常写收发动作和反应，不在标签外重写原话，不在段尾或楼尾另附重复短信块。本楼新创短信优先遵循人物明确标注的特殊语言和表达习惯；无此标注时正常使用句内和句末标点，空格或换行不替代标点；引用已发送或既有短信时，原话逐字保留。这是用户持有的手机，不随叙述视角或谁正在查看手机切换持有者。私聊对话名始终写用户的对方姓名，用户外发与对方回信使用同一个对话名；群聊写“群:群名”，仅限用户参与的群。发信人用户固定“我”，其他人写姓名；只记录已经发生的收发，不替用户编新发言，无短信不输出。手机参考里的短信已经发送，只承接，不重复输出短信块。实际转账用完整短信标记【微信转账：2000.00元】，金额写实际正数，说明另发一条；收款状态由手机处理，不在标记中编写。没有实际转账不输出此标记。不额外填写头像，不写CSS或JSON。例如：我在门口停下，给朋友甲发去短信：[tmt|朋友甲|我]我到了。[/tmt]我收起伞，手机很快亮起：[tmt|朋友甲|朋友甲]收到，我来接你。[/tmt]我抬头望向大厅，等他出来。';
const RULE_ID = 'two-more-things:story-sms-display';
const ENTRY_FIELDS = { content: STORY_SMS_PROMPT, constant: true, disable: false, vectorized: false, position: 4, depth: 1, role: 0, probability: 100, useProbability: false, ignoreBudget: true };
const avatarName = character => character.avatar.split('/').at(-1).replace(/\.[^.]+$/, '');
const OPENING_BLANK_LINES = String.raw`(?:[^\S\r\n]*(?:\r\n|\r(?!\n)|\n))*`;
const CLOSING_BLANK_LINES = String.raw`(?:(?:\r\n|\r(?!\n)|\n)[^\S\r\n]*)*`;
const BODY_BOUNDARY_LINES = new RegExp(`^${OPENING_BLANK_LINES}|${CLOSING_BLANK_LINES}$`, 'g');
// 未闭合的格式示例不能跨过下一条完整短信头，吞掉正式正文。
const BLOCK_BODY_SOURCE = String.raw`(?:(?!\[tmt\|[^|\]\r\n]+\|[^|\]\r\n]+\])[\s\S])*?`;
const blockSource = (body, header = String.raw`([^|\]\r\n]+)`) => String.raw`\[tmt\|${header}\|${header}\]${OPENING_BLANK_LINES}(${body})${CLOSING_BLANK_LINES}\[\/tmt\]`;
const BLOCK_SOURCE = blockSource(BLOCK_BODY_SOURCE);
const TRANSFER_SOURCE = String.raw`[ \t]*【微信转账[：:][ \t]*((?!0+(?:\.0{1,2})?[ \t]*元】)\d+(?:\.\d{1,2})?)[ \t]*元】[ \t]*`;
const TRANSFER_MARKER = new RegExp(`^${TRANSFER_SOURCE}$`);
const DISPLAY_BLOCK_SOURCE = blockSource(String.raw`(?:(?=${TRANSFER_SOURCE}${CLOSING_BLANK_LINES}\[\/tmt\])|(?=))${BLOCK_BODY_SOURCE}`, String.raw`[^\S\r\n]*([^|\]\r\n]+?)[^\S\r\n]*`);

// 旧正文导入只修正展示副本；同一行缩进与正文内部段落保留。
export const storySmsDisplayText = value => String(value ?? '').replace(BODY_BOUNDARY_LINES, '');

// 仅已明确归属的主楼私聊标记可派生转账；读时不写旧行，结算继续使用同一消息ID。
export function storySmsTransfer(message, conversationId, isGroup = false) {
  if (!message || message.type || message.source?.kind !== 'main-story' || isGroup || !conversationId
    || !['user', 'assistant'].includes(message.role)
    || message.speakerId && message.speakerId !== (message.role === 'user' ? '@user' : conversationId)) return message;
  const match = TRANSFER_MARKER.exec(storySmsDisplayText(message.text));
  if (!match) return message;
  const [whole, fraction = ''] = match[1].split('.'), amount = `${whole.replace(/^0+(?=\d)/, '')}.${fraction.padEnd(2, '0')}`;
  return { ...message, type: 'transfer', transfer: { amount, currency: 'CNY', note: '',
    recipientId: message.role === 'user' ? conversationId : '@user', status: 'pending' } };
}


export function syncStorySmsTheme(documentRef, theme) {
  // The shared host style outlives a phone window and is reused by other instances.
  const id = 'two-more-things-story-sms-theme', value = theme === 'night' ? 'night' : 'day';
  let style = documentRef.getElementById(id);
  if (style?.dataset.theme === value) return;
  if (!style) { style = documentRef.createElement('style'); style.id = id; documentRef.head.append(style); }
  const tokens = value === 'night'
    ? '--pp-surface:#162d3a;--pp-ink:#f2efdc;--pp-divider-soft:#344c5a;--pp-message-user:#2d4f65;--pp-message-user-text:#f2efdc;--pp-elevation-soft:none;'
    : '--pp-surface:#fbfaf6;--pp-ink:#222a29;--pp-divider-soft:#d7dad1;--pp-message-user:#314a50;--pp-message-user-text:#f7f7ef;--pp-elevation-soft:0 1px 3px rgb(0 0 0 / 6%),0 1px 2px rgb(0 0 0 / 4%);';
  style.textContent = `.tmt-main-sms{${tokens}}`; style.dataset.theme = value;
}

export function storySmsRegex() {
  // 气泡沿用手机短信页；宿主同步当前主题token，未加载时保留日间配色。
  const style = `.tmt-main-sms{display:flex;flex-direction:column;align-items:flex-start;gap:3px;margin:10px 0 19px;font:inherit;color:var(--SmartThemeBodyColor,inherit);max-width:100%;box-sizing:border-box}
.tmt-main-sms-title,.tmt-main-sms-sender{max-width:100%;font-size:10px;font-weight:400;line-height:14px;padding:0 3px;overflow-wrap:anywhere;opacity:.75}
.tmt-main-sms:not([data-conversation^="群:"]):not([data-conversation^="群："]):not([data-sender="我"]) .tmt-main-sms-title{display:none}
.tmt-main-sms-bubble{font-size:13.5px;font-weight:300;line-height:1.65;padding:7px 11px;min-width:0;max-width:min(100%,32rem);box-sizing:border-box;border:1px solid var(--pp-divider-soft,#d7dad1);background:var(--pp-surface,#fbfaf6);color:var(--pp-ink,#222a29);border-radius:16px;box-shadow:var(--pp-elevation-soft,0 1px 3px rgb(0 0 0 / 6%),0 1px 2px rgb(0 0 0 / 4%));white-space:pre-wrap;overflow-wrap:anywhere;position:relative}
.tmt-main-sms-bubble::after{content:'';position:absolute;width:7px;height:7px;border-radius:50%;background:var(--pp-surface,#fbfaf6);border:1px solid var(--pp-divider-soft,#d7dad1);box-sizing:border-box;bottom:-9px;left:4px}
.tmt-main-sms[data-sender="我"]{align-items:flex-end}
.tmt-main-sms[data-sender="我"] .tmt-main-sms-bubble{background:var(--pp-message-user,#314a50);color:var(--pp-message-user-text,#f7f7ef);border-color:var(--pp-message-user,#314a50)}
.tmt-main-sms[data-sender="我"] .tmt-main-sms-bubble::after{background:var(--pp-message-user,#314a50);border-color:var(--pp-message-user,#314a50);left:auto;right:4px}
.tmt-main-transfer{display:none}
.tmt-main-sms[data-transfer]:not([data-transfer=""]):not([data-conversation^="群:"]):not([data-conversation^="群："])>.tmt-main-sms-bubble:not(.tmt-main-transfer){display:none}
.tmt-main-sms[data-transfer]:not([data-transfer=""]):not([data-conversation^="群:"]):not([data-conversation^="群："])>.tmt-main-transfer{display:flex;flex-direction:column;gap:5px;min-width:160px}
.tmt-main-transfer>span,.tmt-main-transfer>small{font-size:10px;line-height:1.4;opacity:.75}
.tmt-main-transfer>strong{font-size:19px;font-weight:400;line-height:1.3}`;
  return { id: RULE_ID, scriptName: '两三事·主楼短信气泡', findRegex: `/${DISPLAY_BLOCK_SOURCE}/g`,
    replaceString: `<style>${style}</style><div class="tmt-main-sms" data-conversation="$1" data-sender="$2" data-transfer="$4"><div class="tmt-main-sms-title">$1</div><div class="tmt-main-sms-sender">$2</div><div class="tmt-main-sms-bubble">$3</div><div class="tmt-main-sms-bubble tmt-main-transfer"><span>微信转账</span><strong>¥ $4</strong><small>在手机会话中查看</small></div></div>`,
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

export function readStorySmsProjection(raw, wrappers = {}) {
  const blocks = storyBodyBlocks(raw, parseStorySms(raw), wrappers);
  // 指纹只取正式短信顺序和内容；草稿、叙事与原始块号变化不产生新候选。
  const material = JSON.stringify(blocks.map(({ group, name, sender, text }) => [group, name, sender, text]));
  let fingerprint = 144066263297769815596495629667062367629n;
  for (const character of material) fingerprint = BigInt.asUintN(128, (fingerprint ^ BigInt(character.codePointAt(0))) * 309485009821345068724781371n);
  return { blocks, key: fingerprint.toString(16).padStart(32, '0') };
}

export function findStorySmsPeople(contacts, name) {
  const separatedName = (label, alias) => label && alias && new RegExp(`(^|[\\s\\p{P}\\p{S}])${alias.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?=$|[\\s\\p{P}\\p{S}])`, 'u').test(label);
  const exact = contacts.filter(person => person.name === name || person.nickname === name);
  // Extra labels may surround a whole name; continuous names stay distinct.
  const matches = exact.length ? exact : contacts.filter(person => [person.name, person.nickname].some(alias => separatedName(name, alias) || separatedName(alias, name)));
  return [...new Map(matches.map(person => [person.id, person])).values()];
}

export function createStorySmsResolver(state, blocks, user) {
  const names = new Set(['我', user, state.userProfile?.name, state.userProfile?.nickname,
    ...(state.contacts || []).filter(person => isUserIdentity(state, person.id)).flatMap(person => [person.name, person.nickname])].filter(Boolean));
  const peers = new Map();
  return block => {
    const mine = names.has(block.sender);
    if (block.group || !names.has(block.name)) return mine ? { ...block, sender: '我' } : block;
    if (!mine) return { ...block, name: block.sender };
    // 反向私聊头只能借同一个明确头内的唯一外部账号配对，不借群聊或别的私聊猜收件人。
    if (!peers.has(block.name)) {
      const candidates = new Map();
      let ambiguous = false;
      for (const other of blocks) if (!other.group && other.name === block.name && !names.has(other.sender)) {
        const matches = findStorySmsPeople(state.contacts, other.sender);
        if (matches.length > 1) { ambiguous = true; break; }
        candidates.set(matches[0] ? `id:${matches[0].id}` : `name:${other.sender}`, other.sender);
      }
      peers.set(block.name, !ambiguous && candidates.size === 1 ? [...candidates.values()][0] : null);
    }
    const name = peers.get(block.name);
    return name ? { ...block, name, sender: '我' } : null;
  };
}

export function storySmsBlockMatches(state, conversationId, message, block, resolve = createStorySmsResolver(state, [block])) {
  // 无投影凭据的旧存活行保留当时的字面接纳依据，身份解释变化本身不算换稿。
  return matchesStorySmsBlock(state, conversationId, message, resolve(block))
    || !message.source?.projection && matchesStorySmsBlock(state, conversationId, message, block);
}

function matchesStorySmsBlock(state, conversationId, message, block) {
  if (!block) return false;
  if (storySmsDisplayText(message.text) !== block.text) return false;
  const group = state.groups?.find(item => item.id === conversationId);
  if (block.group) { if (!group || group.name !== block.name) return false; }
  else {
    const people = findStorySmsPeople(state.contacts, block.name);
    if (group || people.length !== 1 || people[0].id !== conversationId) return false;
  }
  if (block.sender === '我') return message.role === 'user';
  const senders = findStorySmsPeople(state.contacts, block.sender);
  return message.role === 'assistant' && senders.length === 1 && senders[0].id === (message.speakerId || (!block.group ? conversationId : undefined));
}

export function* storySmsSourceRows(state, firstFloor) {
  for (const [conversationId, thread] of Object.entries(state?.conversations || {})) {
    // 只读所需楼层对应的短信尾部，遇到更早批次即停止。
    for (let position = thread.length - 1; position >= 0; position--) {
      const row = thread[position];
      let floor;
      try { floor = JSON.parse(row.batch?.key)[0]; } catch { break; }
      if (!Number.isInteger(floor) || floor < firstFloor) break;
      if (row.source?.kind === 'main-story') yield { conversationId, row };
    }
  }
}

export function syncStorySms({ target, store, wrapperSettingsProvider = () => ({}) }) {
  const floor = latestAiFloor(target.messages);
  if (!floor) return false;
  const { blocks, key: projection } = readStorySmsProjection(floor.message.mes, wrapperSettingsProvider());
  if (!blocks.length) return false;
  const previous = store.read();
  if (previous.storySmsImports?.floor === floor.index && previous.storySmsImports.processed.includes(projection)) return false;
  return store.importStorySms({ floor: floor.index, blocks, projection, batch: readTimeline(target.messages) }).then(next => next !== previous);
}

export function createStorySmsInstaller({ host }) {
  return {
    async readStatus() {
      const character = host.captureChat().character, bookName = character?.world;
      if (!character?.avatar || !bookName) return { state: 'missing', contentMismatch: false };
      const bindings = await host.readStorySmsBindings(), book = await bindings.load(bookName);
      if (!book?.entries) throw new Error('楼内信息注入状态读取失败，请检查当前角色卡的主世界书。');
      const entry = Object.values(book.entries).find(item => item.extensions?.twoMoreThings?.storySms === true);
      const filter = entry?.characterFilter, nameIncluded = filter?.names?.includes(avatarName(character));
      const filteredByName = filter?.names?.length > 0 && (filter.isExclude ? nameIncluded : !nameIncluded);
      const rule = bindings.getRules().find(item => item.id === RULE_ID), currentRule = storySmsRegex();
      const entryReady = entry && Object.entries(ENTRY_FIELDS).every(([key, value]) => entry[key] === value)
        && entry.characterFilter?.isExclude === false && entry.characterFilter.names?.includes(avatarName(character)) && !entry.characterFilter.tags?.length;
      const ruleReady = rule && Object.entries(currentRule).filter(([key]) => key !== 'scriptName').every(([key, value]) => JSON.stringify(rule[key]) === JSON.stringify(value));
      const enabled = !host.readSettings()?.disabledExtensions?.includes('regex') && !bindings.htmlEncoded();
      return { state: entryReady && ruleReady && enabled ? 'installed' : entry || rule ? 'outdated' : 'missing', bookName, contentMismatch: Boolean(entry && !filteredByName && entry.content !== STORY_SMS_PROMPT) };
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
