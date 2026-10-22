import { cleanProfile } from './profiles.js';
import { createCameoAvatar } from './cameo-avatar.js';
import { messageText } from './content.js';
import { cleanBackground } from './backgrounds.js';
import { contentImagePaths, imagePath } from './image-files.js';
import { readTodos, todoSourceMessageIds } from './todos.js';

const emptyState = () => ({ schemaVersion: 1, contacts: [], groups: [], conversations: {}, forum: { posts: [] }, injectEnabled: false });
const fillDefaultAvatars = people => {
  let filled = people;
  for (let index = 0; index < people.length; index++) {
    const person = people[index];
    if (person.avatar || person.manualFields?.includes('avatar') || person.edited && !person.manualFields) continue;
    if (filled === people) filled = [...people];
    filled[index] = { ...person, avatar: createCameoAvatar() };
  }
  return filled;
};
const text = value => typeof value === 'string' ? value.trim() : '';
const time = value => text(value) === '未定' ? '' : text(value);
const todoPeople = (state, conversationId) => {
  const group = state.groups?.find(item => item.id === conversationId);
  if (group) return [...new Set([...(group.userIsMember ? ['@user'] : []), ...(group.memberIds || [])])];
  return state.contacts?.some(item => item.id === conversationId) ? ['@user', conversationId] : [];
};
const cleanTodoCandidates = (state, conversations = state.conversations) => {
  const todos = readTodos(state).filter(todo => {
    if (todo.status !== 'candidate') return true;
    const messages = conversations?.[todo.sourceConversationId] || [];
    const ids = new Set(messages.map(message => message.id));
    const sourceIds = todoSourceMessageIds(todo);
    return sourceIds.length > 0 && sourceIds.every(id => ids.has(id));
  });
  return todos.length === readTodos(state).length ? state : { ...state, todos };
};
const editableTodo = (state, todo, patch = {}) => {
  const next = { ...todo };
  if ('title' in patch) {
    next.title = text(patch.title);
    if (!next.title) throw new Error('待办事项不能为空。');
  }
  if ('startAt' in patch || 'startTime' in patch) next.startAt = time(patch.startAt ?? patch.startTime);
  if ('endAt' in patch || 'endTime' in patch) next.endAt = time(patch.endAt ?? patch.endTime);
  if ('participantIds' in patch) {
    const ids = [...new Set((Array.isArray(patch.participantIds) ? patch.participantIds : []).map(text).filter(Boolean))];
    const allowed = new Set(['@user', ...(state.contacts || []).map(person => person.id), ...(todo.participantIds || [])]);
    if (!ids.length || ids.some(id => !allowed.has(id))) throw new Error('相关人必须来自该会话或已有待办记录。');
    next.participantIds = ids;
  }
  return next;
};
const materializeTodoCandidates = (state, conversationId, messages, rows) => {
  const actual = Array.isArray(messages) ? messages : [];
  const actualIds = new Set(actual.filter(message => message?.role === 'assistant').map(message => message.id));
  const knownToIds = todoPeople(state, conversationId);
  return (Array.isArray(rows) ? rows : []).flatMap(row => {
    const suppliedIds = todoSourceMessageIds(row);
    const suppliedMessages = suppliedIds.map(id => actual.find(message => message?.id === id));
    if (!suppliedIds.length || suppliedIds.some(id => !actualIds.has(id)) || suppliedMessages.some(message => message?.role !== 'assistant')) return [];
    const sourceMessageIds = [...new Set(suppliedIds)];
    const title = text(row?.title ?? row?.name);
    const people = [...new Set((Array.isArray(row?.participantIds) ? row.participantIds : []).map(text).filter(Boolean))];
    if (!title || !sourceMessageIds.length || !people.length || people.some(id => !knownToIds.includes(id))) return [];
    const batch = actual.find(message => sourceMessageIds.includes(message?.id) && message?.batch)?.batch;
    return [{ id: text(row.id) || `todo:${globalThis.crypto.randomUUID()}`, status: 'candidate', title,
      startAt: time(row.startAt), endAt: time(row.endAt), participantIds: people,
      sourceConversationId: conversationId, sourceMessageIds, knownToIds: [...knownToIds],
      ...(batch ? { sourceBatch: structuredClone(batch) } : {}) }];
  });
};
const appendTodoCandidates = (state, conversationId, messages, rows) => {
  const candidates = materializeTodoCandidates(state, conversationId, messages, rows);
  if (!candidates.length) return state;
  const existing = new Set(readTodos(state).map(todo => todo.id));
  return { ...state, todos: [...readTodos(state), ...candidates.filter(todo => !existing.has(todo.id))] };
};

export function createPhoneStore({ target, assertEnabled = () => {}, isReading = () => false, onIncomingMessage = () => {}, initialState, removeImages = async () => {} }) {
  const empty = initialState || emptyState();
  const read = () => target.metadata.pocketPhone || empty;
  // Serialize normal phone saves so sending while a reply arrives keeps both changes.
  let saving = Promise.resolve();
  function update(change, cleanImages = false) {
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
      // 先保存真实删除，再删已无引用的文件；文件失败不能伪装成存档回滚成功。
      if (cleanImages) {
        const retained = contentImagePaths(next);
        const removed = [...contentImagePaths(current)].filter(path => !retained.has(path));
        if (removed.length) {
          try { await removeImages(removed); }
          catch { throw new Error('内容已保存，但旧图片及附带文件清理失败，请检查酒馆连接。'); }
        }
      }
      return read();
    });
    saving = operation.catch(() => {});
    return operation;
  }
  const store = {
    read,
    fillMissingAvatars() {
      return update(state => {
        assertEnabled();
        const contacts = fillDefaultAvatars(state.contacts), npcs = state.social?.npcs;
        const filledNpcs = npcs && fillDefaultAvatars(npcs);
        if (contacts === state.contacts && filledNpcs === npcs) return state;
        return { ...state, contacts, ...(filledNpcs !== npcs ? { social: { ...state.social, npcs: filledNpcs } } : {}) };
      });
    },
    updateSocial(change, { cleanImages = false, incomingMessages = [] } = {}) {
      const incomingContacts = new Set();
      return update(state => {
        assertEnabled();
        const social = state.social || { posts: [], npcs: [], feedIds: [] };
        const next = change(social, state);
        const conversations = { ...state.conversations };
        let messagesChanged = false;
        let nextState = { ...state, social: next };
        const validContacts = new Set((state.contacts || []).map(person => person.id));
        for (const entry of Array.isArray(incomingMessages) ? incomingMessages : []) {
          if (!validContacts.has(entry?.contactId) || !Array.isArray(entry.messages) || !entry.messages.length) continue;
          const existing = conversations[entry.contactId] || [];
          const savedMessages = entry.messages.map(message => message.role === 'assistant' ? { ...message, read: Boolean(isReading(entry.contactId)) } : message);
          conversations[entry.contactId] = [...existing, ...savedMessages];
          if (savedMessages.some(message => message.role === 'assistant')) incomingContacts.add(entry.contactId);
          nextState = appendTodoCandidates(nextState, entry.contactId, savedMessages, entry.todoCandidates);
          messagesChanged = true;
        }
        if (next === social && !messagesChanged) return state;
        return { ...nextState, ...(messagesChanged ? { conversations } : {}) };
      }, cleanImages).then(state => { for (const id of incomingContacts) onIncomingMessage(id); return state; });
    },
    appendMessage(id, message) { return store.appendMessages(id, [message]); },
    appendMessages(id, messages, { todoCandidates = [] } = {}) {
      return update(state => {
        assertEnabled();
        if (!state.contacts.some(person => person.id === id) && !state.groups?.some(group => group.id === id)) throw new Error('这个会话已删除，无法保存新消息。');
        const group = state.groups?.find(item => item.id === id);
        if (group && messages.some(message => message.role === 'assistant' && !group.memberIds.includes(message.speakerId))) throw new Error('群成员已经移出，无法保存这次回复，请重新点继续。');
        if (group && messages.some(message => message.type === 'transfer' && !(group.memberIds.includes(message.transfer.recipientId) || message.transfer.recipientId === '@user' && group.userIsMember))) throw new Error('收款人已不在群中，无法保存这条转账。');
        const savedMessages = messages.map(message => message.role === 'assistant' ? { ...message, read: Boolean(isReading(id)) } : message);
        return appendTodoCandidates({ ...state, conversations: { ...state.conversations, [id]: [...(state.conversations[id] || []), ...savedMessages] } }, id, savedMessages, todoCandidates);
      }).then(state => { if (messages.some(message => message.role === 'assistant')) onIncomingMessage(id); return state; });
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
    clearImagePaths(paths) {
      const missing = new Set(paths.map(imagePath).filter(Boolean));
      return update(state => {
        let changed = false;
        const clear = item => {
          if (!missing.has(imagePath(item.image?.path))) return item;
          changed = true;
          const { path, seed, ...image } = item.image;
          return { ...item, image };
        };
        const conversations = Object.fromEntries(Object.entries(state.conversations).map(([id, messages]) => [id, messages.map(clear)]));
        const social = state.social && { ...state.social, posts: state.social.posts.map(clear) };
        const forum = state.forum && { ...state.forum, posts: state.forum.posts.map(clear) };
        return changed ? { ...state, conversations, ...(social ? { social } : {}), ...(forum ? { forum } : {}) } : state;
      }, true);
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
      return update(state => cleanTodoCandidates({ ...state, conversations: { ...state.conversations, [id]: (state.conversations[id] || []).filter(message => message.id !== messageId) } }), true);
    },
    clearConversation(id, anchor) {
      return update(state => cleanTodoCandidates({ ...state, conversations: { ...state.conversations, [id]: (state.conversations[id] || []).filter(message => message.batch?.key !== anchor.key) } }), true);
    },
    async saveContact(id, draft) {
      const profile = { ...cleanProfile(draft, true), ...('background' in draft ? { background: cleanBackground(draft.background, true) } : {}) };
      const contactId = id || `manual:${globalThis.crypto.randomUUID()}`;
      await update(state => {
        const current = state.contacts.find(item => item.id === contactId);
        if (id && !current) throw new Error('这个联系人已不存在，请返回短信重新选择。');
        // 旧版只记整条edited，无法还原实际改过的字段，保留其已有保护。
        const manualFields = new Set(current?.manualFields || (current?.edited ? ['name', 'nickname', 'avatar', 'expression', 'language'] : []));
        for (const [key, value] of Object.entries(profile)) if (value !== (current?.[key] || '')) manualFields.add(key);
        const contact = { ...current, ...profile, id: contactId, edited: true, manualFields: [...manualFields], source: current?.source || { kind: 'manual' } };
        if (!current && !contact.avatar) contact.avatar = createCameoAvatar();
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
        const social = state.social && { ...state.social,
          posts: state.social.posts.filter(post => post.authorId !== id).map(post => ({ ...post, comments: (post.comments || []).filter(comment => comment.authorId !== id) })),
          feedIds: state.social.feedIds.filter(key => !state.social.posts.some(post => post.id === key && post.authorId === id)),
          ...(state.social.expandedAuthors ? { expandedAuthors: state.social.expandedAuthors.filter(key => key !== id) } : {}),
        };
        return cleanTodoCandidates({ ...state, contacts: state.contacts.filter(person => person.id !== id), groups, conversations, ...(social ? { social } : {}) }, conversations);
      }, true);
    },
    deleteGroup(id) {
      return update(state => {
        const conversations = { ...state.conversations };
        delete conversations[id];
        return cleanTodoCandidates({ ...state, groups: (state.groups || []).filter(group => group.id !== id), conversations }, conversations);
      }, true);
    },
    async mergeDirectory({ contacts, groups }) {
      const added = { contacts: [], groups: [] };
      await update(state => {
        assertEnabled();
        const people = new Map(state.contacts.map(person => [person.id, person]));
        for (const person of contacts) if (!people.has(person.id)) {
          const contact = person.avatar ? person : { ...person, avatar: createCameoAvatar() };
          people.set(contact.id, contact); added.contacts.push(contact);
        }
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
      const appearance = 'background' in draft ? { background: cleanBackground(draft.background, true) } : {};
      const memberIds = [...new Set(draft.memberIds || [])];
      const userIsMember = draft.userIsMember !== false;
      if (!memberIds.length || memberIds.length + Number(userIsMember) < 2) throw new Error('请至少选择两位群成员，可以包含自己。');
      const groupId = id || `group:${globalThis.crypto.randomUUID()}`;
      await update(state => {
        if (memberIds.some(key => !state.contacts.some(person => person.id === key))) throw new Error('有群成员不在联系人中，请重新选择。');
        const groups = state.groups || [], current = groups.find(group => group.id === id);
        if (id && !current) throw new Error('这个群聊已不存在，请返回短信重新选择。');
        const group = { ...current, id: groupId, name, avatar, ...appearance, memberIds, userIsMember };
        return { ...state, groups: current ? groups.map(item => item.id === id ? group : item) : [...groups, group] };
      });
      return read().groups.find(group => group.id === groupId);
    },
    setTheme(theme) { return update(state => ({ ...state, theme: theme === 'night' ? 'night' : 'day' })); },
    setLockStyle(lockStyle) { return update(state => ({ ...state, lockStyle: ['stacked', 'rounded'].includes(lockStyle) ? lockStyle : 'classic' })); },
    setWallpaper(theme, path) { const value = cleanBackground(path); return update(state => ({ ...state, wallpapers: { ...state.wallpapers, [theme === 'night' ? 'night' : 'day']: value } })); },
    setChatBackground(id, value) {
      const background = cleanBackground(value, true);
      return update(state => {
        const key = state.contacts.some(person => person.id === id) ? 'contacts' : 'groups';
        if (!state[key]?.some(person => person.id === id)) throw new Error('这个聊天已删除，无法更改背景。');
        return { ...state, [key]: state[key].map(person => person.id === id ? { ...person, background } : person) };
      });
    },
    replaceForum(posts) { return update(state => { assertEnabled(); return { ...state, forum: { posts } }; }, true); },
    upsertContacts(items) {
      return update(state => {
        const contacts = new Map(state.contacts.map(item => [item.id, item]));
        // 人工修订按字段优先；改名字或头像不阻止未修改的线上方式更新。
        for (const item of items) {
          const current = contacts.get(item.id);
          if (current?.edited && !Array.isArray(current.manualFields)) continue;
          const merged = { ...current, ...item };
          if (!current && !merged.avatar) merged.avatar = createCameoAvatar();
          for (const field of current?.manualFields || []) merged[field] = current[field];
          contacts.set(item.id, merged);
        }
        return { ...state, contacts: [...contacts.values()] };
      });
    },
    setInjectionEnabled(enabled) { return update(state => ({ ...state, injectEnabled: Boolean(enabled) })); },
    confirmTodo(id, patch = {}) {
      return update(state => {
        assertEnabled();
        const current = readTodos(state).find(todo => todo.id === id);
        if (!current) throw new Error('这个待办已不存在，请返回待办列表。');
        if (current.status !== 'candidate') return state;
        const next = { ...editableTodo(state, current, patch), status: 'open' };
        return { ...state, todos: readTodos(state).map(todo => todo.id === id ? next : todo) };
      });
    },
    saveTodo(id, patch = {}) {
      return update(state => {
        assertEnabled();
        const current = readTodos(state).find(todo => todo.id === id);
        if (!current) throw new Error('这个待办已不存在，请返回待办列表。');
        const next = editableTodo(state, current, patch);
        return next === current ? state : { ...state, todos: readTodos(state).map(todo => todo.id === id ? next : todo) };
      });
    },
    setTodoDone(id, done) {
      return update(state => {
        assertEnabled();
        const current = readTodos(state).find(todo => todo.id === id);
        if (!current) throw new Error('这个待办已不存在，请返回待办列表。');
        if (current.status === 'candidate') throw new Error('候选待办需要先加入待办。');
        const status = done === true ? 'done' : 'open';
        if (current.status === status) return state;
        return { ...state, todos: readTodos(state).map(todo => todo.id === id ? { ...todo, status } : todo) };
      });
    },
    deleteTodo(id) {
      return update(state => {
        assertEnabled();
        if (!readTodos(state).some(todo => todo.id === id)) throw new Error('这个待办已不存在，请返回待办列表。');
        return { ...state, todos: readTodos(state).filter(todo => todo.id !== id) };
      });
    },
  };
  return store;
}
