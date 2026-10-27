import { cleanProfile } from './profiles.js';
import { createCameoAvatar, isCameoAvatar } from './cameo-avatar.js';
import { messageText } from './content.js';
import { cleanBackground } from './backgrounds.js';
import { contentImagePaths, imagePath } from './image-files.js';
import { groupAudience } from './phone-context.js';
import { assignIdentityOwner, isUserIdentity, identityOwnerId, assertIdentitySnapshot } from './identities.js';

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
const sealGroupScope = (messages = [], group) => messages.map(message => Object.hasOwn(message, 'knownToIds') ? message : { ...message, knownToIds: groupAudience(group) });
export function createPhoneStore({ target, assertEnabled = () => {}, isReading = () => false, onIncomingMessage = () => {}, initialState, removeImages = async () => {} }) {
  const empty = initialState || emptyState();
  const read = () => target.metadata.pocketPhone || empty;
  // Serialize normal phone saves so sending while a reply arrives keeps both changes.
  let saving = Promise.resolve();
  function update(change, cleanImages = false) {
    const operation = saving.then(async () => {
      const previous = target.metadata.pocketPhone;
      const current = read(); let next = change(current);
      if (next === current) return current;
      if (Object.hasOwn(next, 'todos')) { const { todos, ...active } = next; next = active; }
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
    readSaved: () => saving.then(read),
    importStorySms({ floor, blocks, batch }) {
      return update(state => {
        assertEnabled();
        if (state.storySmsImportedFloor === floor) return state;
        const contacts = [...state.contacts], groups = [...(state.groups || [])], conversations = { ...state.conversations };
        const findPerson = name => contacts.filter(person => person.name === name || person.nickname === name);
        const personFor = name => {
          const matches = findPerson(name);
          if (matches.length > 1) return null;
          if (matches.length) return matches[0];
          const person = { id: `story:${globalThis.crypto.randomUUID()}`, name, avatar: createCameoAvatar(), source: { kind: 'story' } };
          contacts.push(person); return person;
        };
        for (const block of blocks) {
          let conversationId, speakerId;
          if (block.group) {
            const matches = groups.filter(group => group.name === block.name);
            if (matches.length > 1) continue;
            const speaker = block.sender === '我' ? null : personFor(block.sender);
            if (block.sender !== '我' && !speaker) continue;
            const current = matches[0];
            const group = { ...current, id: current?.id || `group:${globalThis.crypto.randomUUID()}`, name: block.name,
              memberIds: [...new Set([...(current?.memberIds || []), ...(speaker ? [speaker.id] : [])])], userIsMember: true };
            if (current && (current.userIsMember !== group.userIsMember || current.memberIds.length !== group.memberIds.length)) conversations[current.id] = sealGroupScope(conversations[current.id], current);
            if (current) groups[groups.indexOf(current)] = group; else groups.push(group);
            conversationId = group.id; speakerId = speaker?.id || '@user';
          } else {
            if (block.name === '我') continue;
            const matches = findPerson(block.name), senders = block.sender === '我' ? [] : findPerson(block.sender);
            if (matches.length > 1 || senders.length > 1) continue;
            if (block.sender !== '我' && block.sender !== block.name && !(matches[0] && matches[0].id === senders[0]?.id)) continue;
            const person = personFor(block.name);
            if (!person) continue;
            conversationId = person.id; speakerId = block.sender === '我' ? '@user' : person.id;
          }
          const clock = batch.clock;
          const message = { id: `story:${floor}:${block.index}`, role: speakerId === '@user' ? 'user' : 'assistant', speakerId,
            text: block.text, createdAt: new Date().toISOString(), timeLabel: clock.time, read: true,
            ...(clock.source === 'story' ? { storyDate: clock.date, storyWeekday: clock.weekday } : {}),
            batch: { key: batch.key, label: batch.label }, source: { kind: 'main-story', floor, block: block.index } };
          const group = groups.find(item => item.id === conversationId);
          conversations[conversationId] = [...(conversations[conversationId] || []), { ...message, ...(group ? { knownToIds: groupAudience(group) } : {}) }];
        }
        const next = { ...state, contacts, groups, conversations, storySmsImportedFloor: floor };
        // 最新已处理楼即可尊重手机里的删除；不保存正文或历史处理台账。
        return next;
      });
    },
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
        const validContacts = new Set((state.contacts || []).map(person => person.id));
        for (const entry of Array.isArray(incomingMessages) ? incomingMessages : []) {
          if (!validContacts.has(entry?.contactId) || isUserIdentity(state, entry.contactId) || entry.expectedIdentityOwner !== undefined && entry.expectedIdentityOwner !== identityOwnerId(state, entry.contactId) || !Array.isArray(entry.messages) || !entry.messages.length) continue;
          const existing = conversations[entry.contactId] || [];
          const savedMessages = entry.messages.map(message => message.role === 'assistant' ? { ...message, read: Boolean(isReading(entry.contactId)) } : message);
          conversations[entry.contactId] = [...existing, ...savedMessages];
          if (savedMessages.some(message => message.role === 'assistant')) incomingContacts.add(entry.contactId);
          messagesChanged = true;
        }
        if (next === social && !messagesChanged) return state;
        return { ...state, social: next, ...(messagesChanged ? { conversations } : {}) };
      }, cleanImages).then(state => { for (const id of incomingContacts) onIncomingMessage(id); return state; });
    },
    updateLiangshi(change, { cleanImages = false } = {}) {
      return update(state => {
        assertEnabled();
        const current = state.liangshi || { accounts: [], posts: [], topics: [] };
        const next = change(current);
        return next === current ? state : { ...state, liangshi: next };
      }, cleanImages);
    },
    appendMessage(id, message) { return store.appendMessages(id, [message]); },
    appendMessages(id, messages, { identityOwners } = {}) {
      return update(state => {
        assertEnabled();
        if (!state.contacts.some(person => person.id === id) && !state.groups?.some(group => group.id === id)) throw new Error('这个会话已删除，无法保存新消息。');
        assertIdentitySnapshot(state, identityOwners);
        const group = state.groups?.find(item => item.id === id);
        if (messages.some(message => message.role === 'assistant' && isUserIdentity(state, group ? message.speakerId : id))) throw new Error('本人账号不能由AI代发消息。');
        if (group && messages.some(message => message.role === 'assistant' && !group.memberIds.includes(message.speakerId))) throw new Error('群成员已经移出，无法保存这次回复，请重新点继续。');
        if (group && messages.some(message => message.type === 'transfer' && !(group.memberIds.includes(message.transfer.recipientId) || message.transfer.recipientId === '@user' && group.userIsMember))) throw new Error('收款人已不在群中，无法保存这条转账。');
        const savedMessages = messages.map(message => ({ ...message, ...(message.role === 'assistant' ? { read: Boolean(isReading(id)) } : {}), ...(group ? { knownToIds: groupAudience(group) } : {}) }));
        return { ...state, conversations: { ...state.conversations, [id]: [...(state.conversations[id] || []), ...savedMessages] } };
      }).then(state => { if (messages.some(message => message.role === 'assistant')) onIncomingMessage(id); return state; });
    },
    markRead(id) {
      return update(state => {
        const messages = state.conversations[id] || [];
        if (!messages.some(message => message.role === 'assistant' && message.read === false)) return state;
        return { ...state, conversations: { ...state.conversations, [id]: messages.map(message => message.role === 'assistant' && message.read === false ? { ...message, read: true } : message) } };
      });
    },
    updateImage(id, messageId, image, description, validate) {
      return update(state => {
        assertEnabled();
        const messages = state.conversations[id] || [], current = messages.find(message => message.id === messageId);
        if (!current || current.type !== 'image') throw new Error('这条图片消息已删除，无法保存图片。');
        validate?.(state, current);
        if (description !== undefined && current.image.description !== description) throw new Error('这条图片描述已修改，请重新点击生成。');
        return { ...state, conversations: { ...state.conversations, [id]: messages.map(message => message.id === messageId ? { ...message, image: { ...message.image, ...image } } : message) } };
      });
    },
    clearImagePaths(paths) {
      const missing = new Set(paths.map(imagePath).filter(Boolean));
      return update(state => {
        let changed = false;
        const clear = (item, children = true) => {
          let next = item;
          if (missing.has(imagePath(item.image?.path))) {
            changed = true;
            const { path, seed, ...image } = item.image;
            next = { ...item, image };
          }
          if (children) for (const key of ['comments', 'reposts']) if (Array.isArray(item[key])) {
            const rows = item[key].map(row => clear(row));
            if (rows.some((row, index) => row !== item[key][index])) next = { ...next, [key]: rows };
          }
          return next;
        };
        const conversations = Object.fromEntries(Object.entries(state.conversations).map(([id, messages]) => [id, messages.map(row => clear(row))]));
        const social = state.social && { ...state.social, posts: state.social.posts.map(row => clear(row, false)) };
        const forum = state.forum && { ...state.forum, posts: state.forum.posts.map(row => clear(row)) };
        const liangshi = state.liangshi && { ...state.liangshi, posts: state.liangshi.posts.map(row => clear(row)) };
        return changed ? { ...state, conversations, ...(social ? { social } : {}), ...(forum ? { forum } : {}), ...(liangshi ? { liangshi } : {}) } : state;
      }, true);
    },
    respondTransfer(id, messageId, status, actorId, batch, identityOwners) {
      return update(state => {
        assertEnabled();
        assertIdentitySnapshot(state, identityOwners);
        if (actorId !== '@user' && isUserIdentity(state, actorId)) throw new Error('本人账号不能由AI处理转账。');
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
      return update(state => ({ ...state, conversations: { ...state.conversations, [id]: (state.conversations[id] || []).filter(message => message.id !== messageId) } }), true);
    },
    clearConversation(id, anchor) {
      return update(state => ({ ...state, conversations: { ...state.conversations, [id]: (state.conversations[id] || []).filter(message => message.batch?.key !== anchor.key) } }), true);
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
        if (draft.automaticAvatar === true) {
          profile.avatar = isCameoAvatar(profile.avatar) ? profile.avatar : isCameoAvatar(current?.avatar) ? current.avatar : createCameoAvatar();
          manualFields.delete('avatar');
        } else if (draft.automaticAvatar === false) manualFields.add('avatar');
        const contact = { ...current, ...profile, id: contactId, edited: true, manualFields: [...manualFields], source: current?.source || { kind: 'manual' } };
        if (!current && !contact.avatar && draft.automaticAvatar !== false) contact.avatar = createCameoAvatar();
        const next = { ...state, contacts: current ? state.contacts.map(item => item.id === contactId ? contact : item) : [...state.contacts, contact] };
        return Object.hasOwn(profile, 'identityOwnerId') ? { ...next, contacts: assignIdentityOwner(next, contactId, profile.identityOwnerId, state) } : next;
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
        const contacts = state.contacts.filter(person => person.id !== id).map(person => {
          if (person.identityOwnerId !== id) return person;
          const { identityOwnerId, ...independent } = person; return independent;
        });
        return { ...state, contacts, groups, conversations, ...(social ? { social } : {}) };
      }, true);
    },
    deleteGroup(id) {
      return update(state => {
        const conversations = { ...state.conversations };
        delete conversations[id];
        return { ...state, groups: (state.groups || []).filter(group => group.id !== id), conversations };
      }, true);
    },
    async mergeDirectory({ contacts, groups }) {
      const added = { contacts: [], groups: [] };
      await update(state => {
        assertEnabled();
        const people = new Map(state.contacts.map(person => [person.id, person]));
        for (const person of contacts) if (!people.has(person.id)) {
          const { identityOwnerId: ignoredOwner, ...generated } = person;
          const contact = generated.avatar ? generated : { ...generated, avatar: createCameoAvatar() };
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
        const changedMembers = current && (current.userIsMember !== userIsMember || current.memberIds.length !== memberIds.length || current.memberIds.some(key => !memberIds.includes(key)));
        return { ...state, groups: current ? groups.map(item => item.id === id ? group : item) : [...groups, group],
          ...(changedMembers ? { conversations: { ...state.conversations, [groupId]: sealGroupScope(state.conversations[groupId], current) } } : {}) };
      });
      return read().groups.find(group => group.id === groupId);
    },
    setTheme(theme) { return update(state => ({ ...state, theme: theme === 'night' ? 'night' : 'day' })); },
    setDefaultLanguage(value) { return update(state => { assertEnabled(); return { ...state, defaultLanguage: String(value || '').trim() }; }); },
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
    updateForum(change, { cleanImages = false } = {}) {
      return update(state => { assertEnabled(); const current = state.forum || { posts: [] }, next = change(current); return next === current ? state : { ...state, forum: next }; }, cleanImages);
    },
    replaceForum(posts) { return store.updateForum(current => ({ ...current, posts }), { cleanImages: true }); },
    upsertContacts(items) {
      return update(state => {
        const contacts = new Map(state.contacts.map(item => [item.id, item]));
        // 人工修订按字段优先；改名字或头像不阻止未修改的线上方式更新。
        for (const item of items) {
          const current = contacts.get(item.id);
          if (current?.edited && !Array.isArray(current.manualFields)) continue;
          const { identityOwnerId: ignoredOwner, ...generated } = item;
          const merged = { ...current, ...generated };
          if (!current && !merged.avatar) merged.avatar = createCameoAvatar();
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
