import { parseJsonObject } from './api.js';
import { SUMMARY_PROMPT } from './prompts.js';
import { latestAiFloor } from './time.js';
import { readTimeline, currentMessages } from './timeline.js';
import { contextMessage, messageText } from './content.js';
import { stickerChoices } from './stickers.js';
import { createCalendarReader } from './calendar.js';

function recentStory(messages) {
  const floor = latestAiFloor(messages)?.message;
  return floor ? [{ speaker: floor.name || '角色', text: floor.mes }] : [];
}
const phoneHistory = (state, id, batch) => currentMessages(state.conversations[id] || [], batch);
const cardText = character => character ? `${character.name}\n${character.description}\n${character.personality}\n${character.scenario}`.slice(0, 10000) : '';

function actorIds(people, bridge, snapshot) {
  const ids = new Map(people.filter(person => person.source?.kind === 'qqj').map(person => [person.id, person.source.entityId]));
  if (!people.some(person => person.source?.kind === 'card')) return ids;
  snapshot ||= bridge?.getPeopleSnapshot?.();
  const names = new Map();
  if (snapshot?.status !== 'ready') return ids;
  // 作者实体编号不属于读者；仅用读者快照中唯一的同名人物建立本次召回归属。
  for (const person of snapshot.people?.items || []) names.set(person.displayName, names.has(person.displayName) ? null : person.entityId);
  for (const person of people) if (person.source?.kind === 'card' && names.get(person.name)) ids.set(person.id, names.get(person.name));
  return ids;
}

export function createContextReader({ target, store, qqjBridgeProvider = () => globalThis.qqj_v3_public_bridge_v1, calendar = createCalendarReader() }) {
  const base = () => {
    const person = store.read().userProfile, batch = readTimeline(target.messages);
    return { character: cardText(target.character), user: person?.name || target.user,
      userProfile: { name: person?.name || target.user, nickname: person?.nickname || '' },
      clock: batch.clock, batch, story: recentStory(target.messages) };
  };
  return {
    async readForContact(id) {
      const state = store.read(), contact = state.contacts.find(x => x.id === id);
      if (!contact) throw new Error('这个联系人已不存在，请返回短信重新选择。');
      const current = base();
      const history = phoneHistory(state, id, current.batch);
      const calendarReference = calendar.context([...current.story.map(item => item.text), messageText(history.at(-1) || {})].join('\n'));
      let related = '';
      const bridge = qqjBridgeProvider?.();
      const entityId = actorIds([contact], bridge).get(id);
      if (entityId && bridge?.readContext) {
        const query = [contact.name, ...current.story.map(item => item.text), history.at(-1)?.text || ''].join('\n').slice(-8000);
        const context = await bridge.readContext({ query, entityIds: [entityId], maxCharacters: 4000 });
        if (context?.status === 'ready') related = (context.actors || []).filter(x => x.entityId === entityId).map(x => [x.stateText, x.memoryText].filter(Boolean).join('\n')).join('\n').slice(0, 4000);
      }
      return { ...current, ...(calendarReference ? { calendar: calendarReference } : {}), stickers: stickerChoices(), contact: { name: contact.name, nickname: contact.nickname || '', personality: contact.personality, expression: contact.expression, language: contact.language || '' }, history: history.map(contextMessage), related, worldbook: await target.readWorldInfo({ scanText: [...current.story.map(item => item.text), contact.name, ...history.map(messageText)].join('\n') }) };
    },
    async readForForum() { const current = base(); return { ...current, worldbook: await target.readWorldInfo({ scanText: current.story.map(item => item.text).join('\n') }) }; },
    async readDirectorySources() {
      const snapshot = qqjBridgeProvider?.()?.getPeopleSnapshot?.();
      const state = store.read();
      const knownActors = new Map([...actorIds(state.contacts, null, snapshot)].map(([id, entityId]) => [entityId, id]));
      const people = snapshot?.status === 'ready' ? (snapshot.people?.items || []).filter(person => person.entityId && person.profile).map(person => ({ sourceId: knownActors.get(person.entityId) || `qqj:${person.entityId}`, entityId: person.entityId, name: person.displayName, personality: person.profile.personality || '', expression: person.profile.expression || '' })) : [];
      return { ...base(), people, contacts: state.contacts.map(({ id, name, nickname }) => ({ id, name, nickname })), groups: (state.groups || []).map(({ id, name, memberIds, userIsMember }) => ({ id, name, memberIds, userIsMember })), worldbook: await target.readWorldInfo() };
    },
    async readForGroup(id) {
      const state = store.read(), group = state.groups?.find(item => item.id === id);
      if (!group) throw new Error('这个群聊已不存在，请返回短信重新选择。');
      const current = base();
      const history = phoneHistory(state, id, current.batch);
      const calendarReference = calendar.context([...current.story.map(item => item.text), messageText(history.at(-1) || {})].join('\n'));
      const members = group.memberIds.map(key => {
        const person = state.contacts.find(item => item.id === key);
        if (!person) throw new Error('有群成员不在联系人中，请编辑群聊重新选择。');
        return { id: person.id, name: person.name, nickname: person.nickname || '', personality: person.personality || '', expression: person.expression || '', language: person.language || '', source: person.source };
      });
      const bridge = qqjBridgeProvider?.(), ids = actorIds(members, bridge), entityIds = [...new Set(ids.values())];
      let actors = [];
      if (entityIds.length && bridge?.readContext) {
        const query = [group.name, ...current.story.map(item => item.text), history.at(-1)?.text || ''].join('\n').slice(-8000);
        const related = await bridge.readContext({ query, entityIds, maxCharacters: 6000 });
        if (related?.status === 'ready') actors = related.actors || [];
      }
      const roster = members.map(({ source, ...person }) => ({ ...person, related: actors.filter(actor => ids.has(person.id) && actor.entityId === ids.get(person.id)).map(actor => [actor.stateText, actor.memoryText].filter(Boolean).join('\n')).join('\n') }));
      if (group.userIsMember) roster.push({ id: '@user', ...current.userProfile });
      return { ...current, ...(calendarReference ? { calendar: calendarReference } : {}), stickers: stickerChoices(), group: { name: group.name, userIsMember: group.userIsMember, members: roster }, history: history.map(contextMessage), worldbook: await target.readWorldInfo({ scanText: [...current.story.map(item => item.text), ...members.map(person => person.name), ...history.map(messageText)].join('\n') }) };
    },

  };
}

// 主楼生成前才摘要，不在发送、开关或浏览时增加模型调用。
export function createBackflowService({ target, store, modelClient, isEnabled = () => true }) {
  return {
    async prepare() {
      const state = store.read();
      if (!isEnabled() || !state.injectEnabled) return '';
      const batch = readTimeline(target.messages);
      const conversations = [];
      for (const person of [...state.contacts, ...(state.groups || []).filter(group => group.userIsMember)]) {
        const messages = phoneHistory(state, person.id, batch);
        if (!messages.length) continue;
        conversations.push({ id: person.id, name: person.name, kind: person.memberIds ? 'group' : 'private', messages: messages.map(message => ({
          id: message.id,
          speaker: message.role === 'user' ? state.userProfile?.name || target.user : person.memberIds ? state.contacts.find(contact => contact.id === message.speakerId)?.name || '群成员' : person.name,
          text: messageText(message), ...(message.translation ? { translation: message.translation } : {}),
          ...(message.type === 'transfer' ? { recipient: message.transfer.recipientId === '@user' ? state.userProfile?.name || target.user : state.contacts.find(contact => contact.id === message.transfer.recipientId)?.name || '已移出的联系人' } : {}),
        })) });
      }
      if (!conversations.length) return '';
      const reply = await modelClient.complete({ system: SUMMARY_PROMPT, messages: [{ role: 'user', content: JSON.stringify({ time: batch.label, conversations }) }], maxTokens: 400 });
      const answer = parseJsonObject(reply);
      const summary = typeof answer.summary === 'string' ? answer.summary.trim() : '';
      if (!summary || Array.from(summary).length > 100) throw new Error('手机摘要没有生成100字以内的有效内容，本次正文未带入手机消息。');
      const current = store.read();
      if (!isEnabled() || !current.injectEnabled) return '';
      for (const conversation of conversations) {
        const saved = new Map((current.conversations[conversation.id] || []).map(message => [message.id, message]));
        if (conversation.messages.some(message => !saved.has(message.id))) throw new Error('摘要中的短信已被删除，本次正文未带入手机消息。');
        if (conversation.messages.some(message => messageText(saved.get(message.id)) !== message.text)) throw new Error('摘要中的消息状态已变化，本次正文未带入旧摘要，请重新生成正文。');
      }
      return `[手机短信摘要；仅供后续剧情参考，各人只知道自己参与或已得知的内容]\n${summary}`;
    },
  };
}
