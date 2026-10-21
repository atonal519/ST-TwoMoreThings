import { parsePayload, parseJsonObject } from './api.js';
import { CONTACTS_PROMPT, MESSAGES_PROMPT, TODO_SUGGESTIONS_PROMPT } from './prompts.js';
import { readTimeline } from './timeline.js';
import { normalizeContent, RICH_MESSAGES_PROMPT } from './content.js';
import { CALENDAR_PROMPT } from './calendar.js';
import { parseTodoCandidates } from './todos.js';

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
      const contact = store.read().contacts.find(person => person.id === id);
      if (!contact) throw new Error('这个联系人已不存在，请返回短信重新选择。');
      const reply = await modelClient.complete({ system: CONTACTS_PROMPT, messages: [{ role: 'user', content: JSON.stringify({ people: [{ sourceId: contact.id, name: contact.name, personality: contact.personality || '', expression: contact.expression || '', language: contact.language || '' }] }) }], maxTokens: 800 });
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
      const context = await contextReader.readForContact(id);
      const clock = context.clock;
      const reply = await modelClient.complete({
        system: `${MESSAGES_PROMPT}\n${RICH_MESSAGES_PROMPT}\n${TODO_SUGGESTIONS_PROMPT}${context.calendar ? `\n${CALENDAR_PROMPT}` : ''}`,
        messages: [{ role: 'user', content: JSON.stringify(context) }],
      });
      const answer = parseJsonObject(reply);
      const actions = Array.isArray(answer.transferActions) ? answer.transferActions : [];
      const indexedMessages = parsePayload(reply, 'messages', { allowEmpty: actions.length > 0, indexed: true }).map(content => {
        if (!content) return null;
        if (content.type === 'transfer') content.transfer.recipientId = '@user';
        return { ...record('assistant', content.text, clock, content.translation, context.batch), ...content };
      });
      const messages = indexedMessages.filter(Boolean);
      const todoCandidates = parseTodoCandidates(answer.todoSuggestions ?? answer.todos, { conversationId: id, messages: indexedMessages, participantIds: (context.todoPeople || []).map(person => person.id) });
      for (const item of actions) await store.respondTransfer(id, item.transferId, item.status, id, context.batch);
      if (messages.length) await store.appendMessages(id, messages, { todoCandidates });
      return messages;
    },
  };
}
