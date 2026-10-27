import { parsePayload, parseJsonObject } from './api.js';
import { hasStyleReference } from './generated-text.js';
import { CONTACTS_PROMPT, MESSAGES_PROMPT } from './prompts.js';
import { readTimeline } from './timeline.js';
import { normalizeContent, RICH_MESSAGES_PROMPT } from './content.js';
import { CALENDAR_PROMPT } from './calendar.js';
import { identityProfile, isUserIdentity, identitySource, identitySnapshot, assertIdentitySnapshot } from './identities.js';

export function record(role, text, clock, translation, batch) {
  const now = new Date();
  // createdAt 记录消息创建时间，供通知排序；可见时间和剧情日期在创建时确定，之后不追改历史短信。
  return { id: globalThis.crypto.randomUUID(), role, text, createdAt: now.toISOString(), timeLabel: clock.time,
    ...(translation ? { translation } : {}),
    ...(batch ? { batch: { key: batch.key, label: batch.label } } : {}),
    ...(clock.source === 'story' ? { storyDate: clock.date, storyWeekday: clock.weekday } : {}),
  };
}

export function createMessageService({ target, store, contextReader, modelClient }) {
  return {
    async sendCard(id, draft) {
      const content = normalizeContent(draft);
      if (!content?.type) throw new Error('消息卡内容不完整，请检查后发送。');
      if (!store.read().contacts.some(person => person.id === id)) throw new Error('请先选择一位联系人。');
      if (content.type === 'transfer') content.transfer.recipientId = id;
      const batch = readTimeline(target.messages);
      await store.appendMessage(id, { ...record('user', content.text, batch.clock, '', batch), ...content });
    },
    async refineOnlineStyle(id) {
      const state = store.read(), account = state.contacts.find(person => person.id === id), contact = account && identityProfile(state, account);
      if (!contact) throw new Error('这个联系人已不存在，请返回短信重新选择。');
      const reply = await modelClient.complete({ system: CONTACTS_PROMPT, messages: [{ role: 'user', content: JSON.stringify({ people: [{ sourceId: contact.id, name: contact.name, personality: contact.personality || '', language: contact.language || '' }] }) }] });
      const result = parsePayload(reply, 'contacts').find(person => person.sourceId === id);
      if (!result?.expression) throw new Error('没有生成这位联系人的线上聊天方式，请重新提炼。');
      return result.expression;
    },
    async send(id, text) {
      const content = String(text || '').trim();
      if (!content) return;
      if (!store.read().contacts.some(x => x.id === id)) throw new Error('请先选择一位联系人。');
      const batch = readTimeline(target.messages);
      await store.appendMessage(id, record('user', content, batch.clock, '', batch));
    },
    async continueChat(id) {
      if (isUserIdentity(store.read(), id)) throw new Error('本人账号不能由AI代发消息。');
      const context = await contextReader.readForContact(id);
      const identityOwners = context[identitySource] || identitySnapshot(store.read(), [id]);
      assertIdentitySnapshot(store.read(), identityOwners);
      const clock = context.clock;
      const reply = await modelClient.complete({
        system: `${MESSAGES_PROMPT}\n${RICH_MESSAGES_PROMPT}${context.calendar ? `\n${CALENDAR_PROMPT}` : ''}`,
        messages: [{ role: 'user', content: JSON.stringify(context) }],
      });
      const answer = parseJsonObject(reply);
      const actions = Array.isArray(answer.transferActions) ? answer.transferActions : [];
      const indexedMessages = parsePayload(reply, 'messages', { allowEmpty: actions.length > 0, indexed: true, preserveStyle: hasStyleReference(context.contact) || Boolean(context.related?.trim()) }).map(content => {
        if (!content) return null;
        if (content.type === 'transfer') content.transfer.recipientId = '@user';
        return { ...record('assistant', content.text, clock, content.translation, context.batch), ...content };
      });
      const messages = indexedMessages.filter(Boolean);
      for (const item of actions) await store.respondTransfer(id, item.transferId, item.status, id, context.batch, identityOwners);
      if (messages.length) await store.appendMessages(id, messages, { identityOwners });
      return messages;
    },
  };
}
