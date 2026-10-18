import { cleanProfile } from './profiles.js';
import { messageText } from './content.js';

const emptyState = () => ({ schemaVersion: 1, contacts: [], groups: [], conversations: {}, forum: { posts: [] }, injectEnabled: false });

export function createPhoneStore({ target, assertEnabled = () => {}, isReading = () => false }) {
  const empty = emptyState();
  const read = () => target.metadata.pocketPhone || empty;
  // Serialize normal phone saves so sending while a reply arrives keeps both changes.
  let saving = Promise.resolve();
  function update(change) {
    const operation = saving.then(async () => {
      const previous = target.metadata.pocketPhone;
      const current = read(), next = change(current);
      if (next === current) return current;
      target.metadata.pocketPhone = next;
      try { await target.saveMetadata(); }
      catch (error) {
        if (previous === undefined) delete target.metadata.pocketPhone;
        else target.metadata.pocketPhone = previous;
        throw error;
      }
      return read();
    });
    saving = operation.catch(() => {});
    return operation;
  }
  const store = {
    read,
    appendMessage(id, message) { return store.appendMessages(id, [message]); },
    appendMessages(id, messages) {
      return update(state => {
        assertEnabled();
        if (!state.contacts.some(person => person.id === id) && !state.groups?.some(group => group.id === id)) throw new Error('这个会话已删除，无法保存新消息。');
        const group = state.groups?.find(item => item.id === id);
        if (group && messages.some(message => message.role === 'assistant' && !group.memberIds.includes(message.speakerId))) throw new Error('群成员已经移出，无法保存这次回复，请重新点继续。');
        if (group && messages.some(message => message.type === 'transfer' && !(group.memberIds.includes(message.transfer.recipientId) || message.transfer.recipientId === '@user' && group.userIsMember))) throw new Error('收款人已不在群中，无法保存这条转账。');
        return { ...state, conversations: { ...state.conversations, [id]: [...(state.conversations[id] || []), ...messages.map(message => message.role === 'assistant' ? { ...message, read: Boolean(isReading(id)) } : message)] } };
      });
    },
    markRead(id) {
      return update(state => {
        const messages = state.conversations[id] || [];
        if (!messages.some(message => message.role === 'assistant' && message.read === false)) return state;
        return { ...state, conversations: { ...state.conversations, [id]: messages.map(message => message.role === 'assistant' && message.read === false ? { ...message, read: true } : message) } };
      });
    },
    updateImage(id, messageId, image) {
      return update(state => {
        assertEnabled();
        const messages = state.conversations[id] || [], current = messages.find(message => message.id === messageId);
        if (!current || current.type !== 'image') throw new Error('这条图片消息已删除，无法保存图片。');
        return { ...state, conversations: { ...state.conversations, [id]: messages.map(message => message.id === messageId ? { ...message, image: { ...message.image, ...image } } : message) } };
      });
    },
    respondTransfer(id, messageId, status, actorId, batch) {
      return update(state => {
        assertEnabled();
        const messages = state.conversations[id] || [], message = messages.find(item => item.id === messageId);
        if (!message || message.type !== 'transfer') throw new Error('这条转账已不存在。');
        if (message.batch?.key !== batch.key) throw new Error('过去的转账只能查看。');
        if (message.transfer.status !== 'pending') throw new Error('这条转账已经处理。');
        if (message.transfer.recipientId !== actorId || !['accepted', 'returned'].includes(status)) throw new Error('只有收款人可以收下或退回转账。');
        const group = state.groups?.find(item => item.id === id);
        if (group && actorId !== '@user' && !group.memberIds.includes(actorId)) throw new Error('收款人已不在群中，无法处理这条转账。');
        if (actorId === '@user' && group && !group.userIsMember) throw new Error('你不在这个群，无法处理转账。');
        const next = { ...message, transfer: { ...message.transfer, status, handledAt: new Date().toISOString() } };
        next.text = messageText(next);
        return { ...state, conversations: { ...state.conversations, [id]: messages.map(item => item.id === messageId ? next : item) } };
      });
    },
    deleteMessage(id, messageId) {
      return update(state => ({ ...state, conversations: { ...state.conversations, [id]: (state.conversations[id] || []).filter(message => message.id !== messageId) } }));
    },
    clearConversation(id, anchor) {
      return update(state => ({ ...state, conversations: { ...state.conversations, [id]: (state.conversations[id] || []).filter(message => message.batch?.key !== anchor.key) } }));
    },
    async saveContact(id, draft) {
      const profile = cleanProfile(draft, true);
      const contactId = id || `manual:${globalThis.crypto.randomUUID()}`;
      await update(state => {
        const current = state.contacts.find(item => item.id === contactId);
        if (id && !current) throw new Error('这个联系人已不存在，请返回短信重新选择。');
        // 旧版只记整条edited，无法还原实际改过的字段，保留其已有保护。
        const manualFields = new Set(current?.manualFields || (current?.edited ? ['name', 'nickname', 'avatar', 'expression', 'language'] : []));
        for (const [key, value] of Object.entries(profile)) if (value !== (current?.[key] || '')) manualFields.add(key);
        const contact = { ...current, ...profile, id: contactId, edited: true, manualFields: [...manualFields], source: current?.source || { kind: 'manual' } };
        return { ...state, contacts: current ? state.contacts.map(item => item.id === contactId ? contact : item) : [...state.contacts, contact] };
      });
      return read().contacts.find(item => item.id === contactId);
    },
    async saveUserProfile(draft) {
      const profile = cleanProfile(draft);
      return update(state => ({ ...state, userProfile: profile }));
    },
    deleteContact(id) {
      return update(state => {
        const conversations = { ...state.conversations };
        delete conversations[id];
        const groups = (state.groups || []).map(group => {
          if (conversations[group.id]?.some(message => message.speakerId === id)) conversations[group.id] = conversations[group.id].filter(message => message.speakerId !== id);
          return group.memberIds.includes(id) ? { ...group, memberIds: group.memberIds.filter(key => key !== id) } : group;
        });
        return { ...state, contacts: state.contacts.filter(person => person.id !== id), groups, conversations };
      });
    },
    deleteGroup(id) {
      return update(state => {
        const conversations = { ...state.conversations };
        delete conversations[id];
        return { ...state, groups: (state.groups || []).filter(group => group.id !== id), conversations };
      });
    },
    async mergeDirectory({ contacts, groups }) {
      const added = { contacts: [], groups: [] };
      await update(state => {
        assertEnabled();
        const people = new Map(state.contacts.map(person => [person.id, person]));
        for (const person of contacts) if (!people.has(person.id)) { people.set(person.id, person); added.contacts.push(person); }
        const mergedGroups = [...(state.groups || [])];
        for (const draft of groups) {
          const ids = Array.isArray(draft?.memberIds) ? [...new Set(draft.memberIds)] : [];
          const name = typeof draft?.name === 'string' ? draft.name.trim() : '';
          if (!name || typeof draft.userIsMember !== 'boolean' || !ids.length || ids.length + Number(draft.userIsMember) < 2 || ids.some(id => !people.has(id))) continue;
          if (mergedGroups.some(group => group.userIsMember === draft.userIsMember && group.memberIds.length === ids.length && ids.every(id => group.memberIds.includes(id)))) continue;
          const group = { id: `group:${globalThis.crypto.randomUUID()}`, name, memberIds: ids, userIsMember: draft.userIsMember };
          mergedGroups.push(group); added.groups.push(group);
        }
        return added.contacts.length || added.groups.length ? { ...state, contacts: [...people.values()], groups: mergedGroups } : state;
      });
      return added;
    },
    async saveGroup(id, draft) {
      const name = String(draft.name || '').trim();
      if (!name) throw new Error('请填写群名。');
      const { avatar } = cleanProfile({ ...draft, name });
      const memberIds = [...new Set(draft.memberIds || [])];
      const userIsMember = draft.userIsMember !== false;
      if (!memberIds.length || memberIds.length + Number(userIsMember) < 2) throw new Error('请至少选择两位群成员，可以包含自己。');
      const groupId = id || `group:${globalThis.crypto.randomUUID()}`;
      await update(state => {
        if (memberIds.some(key => !state.contacts.some(person => person.id === key))) throw new Error('有群成员不在联系人中，请重新选择。');
        const groups = state.groups || [], current = groups.find(group => group.id === id);
        if (id && !current) throw new Error('这个群聊已不存在，请返回短信重新选择。');
        const group = { ...current, id: groupId, name, avatar, memberIds, userIsMember };
        return { ...state, groups: current ? groups.map(item => item.id === id ? group : item) : [...groups, group] };
      });
      return read().groups.find(group => group.id === groupId);
    },
    setTheme(theme) { return update(state => ({ ...state, theme: theme === 'night' ? 'night' : 'day' })); },
    setWallpaper(theme, path) { return update(state => ({ ...state, wallpapers: { ...state.wallpapers, [theme === 'night' ? 'night' : 'day']: path } })); },
    replaceForum(posts) { return update(state => { assertEnabled(); return { ...state, forum: { posts } }; }); },
    upsertContacts(items) {
      return update(state => {
        const contacts = new Map(state.contacts.map(item => [item.id, item]));
        // 人工修订按字段优先；改名字或头像不阻止未修改的线上方式更新。
        for (const item of items) {
          const current = contacts.get(item.id);
          if (current?.edited && !Array.isArray(current.manualFields)) continue;
          const merged = { ...current, ...item };
          for (const field of current?.manualFields || []) merged[field] = current[field];
          contacts.set(item.id, merged);
        }
        return { ...state, contacts: [...contacts.values()] };
      });
    },
    setInjectionEnabled(enabled) { return update(state => ({ ...state, injectEnabled: Boolean(enabled) })); },
  };
  return store;
}
