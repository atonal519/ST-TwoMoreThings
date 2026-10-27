import { finishGeneratedText, hasStyleReference } from './generated-text.js';
import { clipProjection } from './context-budget.js';
import { parseJsonObject } from './api.js';
import { createCameoAvatar } from './cameo-avatar.js';
import { displayName } from './profiles.js';
import { generatedImage } from './content.js';
import { isUserIdentity, identitySource, assertIdentitySnapshot } from './identities.js';
import { LIANGSHI_PROMPT, LIANGSHI_MORE_PROMPT, LIANGSHI_HOT_PROMPT, LIANGSHI_TOPIC_PROMPT, LIANGSHI_FOLLOWING_PROMPT, LIANGSHI_DRAFT_PROMPT, LIANGSHI_REPLY_PROMPT } from './prompts.js';

const text = value => typeof value === 'string' ? value.trim() : '';
const rows = value => Array.isArray(value) ? value : value && typeof value === 'object' ? [value] : [];
const count = value => Number.isFinite(Number(value)) ? Math.max(0, Math.floor(Number(value))) : 0;
const uid = () => globalThis.crypto.randomUUID();
const handle = value => text(value).replace(/^@/, '').toLowerCase();
const empty = () => ({ accounts: [], posts: [], topics: [] });
const publicAccount = ({ id, name, handle, kind, description, expression, language, contactId }) => ({ id, name, handle, kind, description, expression, language, contactId });
const hasAccountStyleReference = (author, context, accounts = []) => hasStyleReference(accounts.find(account => account.id === author?.id)) || hasStyleReference(context.knownContacts?.find(person => person.id === author?.contactId));
function assertPrivateAuthors(state, context) {
  const authors = (context.knownContacts || []).filter(author => author.phoneContext?.length);
  if (!authors.length) return;
  assertIdentitySnapshot(state, context[identitySource]);
  if (authors.some(author => !state.contacts.some(person => person.id === author.id))) throw new Error('作者资料已变化，本次微博未保存。');
}
const publicPost = ({ userLiked, replyBatch, ...post }) => ({ ...post, ...liangshiStatistics(post), ...(post.image ? { image: { description: post.image.description } } : {}) });
const publicComment = ({ id, authorId, text, translation, replyToId, replyToAuthorId, quoteId, publishedAt, image }) => ({ id, authorId, text, ...(image?.description ? { image: { description: image.description } } : {}), ...(translation ? { translation } : {}), ...(replyToId ? { replyToId, replyToAuthorId } : {}), ...(quoteId ? { quoteId } : {}), ...(publishedAt ? { publishedAt } : {}) });
export const liangshiInteractions = (post, collection = 'comments') => (post[collection] || []).map((row, index) => ({ ...row, id: row.id || `liangshi:${post.id}:${collection}:${index}` }));
export const liangshiReplyState = post => ({ pending: (post?.comments || []).filter(row => row.userAuthored === true && !row.replyHandled), last: post?.replyBatch });
const ownPost = (data, post) => post?.userAuthored === true && data.accounts.some(account => account.id === post.authorId && account.ownerId === '@user');
const postMaterial = post => post ? { id: post.id, authorId: post.authorId, text: post.text, translation: post.translation, image: post.image ? { description: post.image.description } : undefined, publishedAt: post.publishedAt, editedAt: post.editedAt, quoteId: post.quoteId } : undefined;

function replyMaterial(data, post, selected, excluded, ownName) {
  const byId = new Map(post.comments.map(row => [row.id, row])), parents = new Map();
  for (const reply of selected) {
    const visited = new Set([reply.id]); let id = reply.replyToId;
    while (id && !visited.has(id)) {
      visited.add(id); const parent = byId.get(id);
      if (!parent || excluded.has(id)) break;
      parents.set(id, publicComment(parent)); id = parent.replyToId;
    }
  }
  const original = data.posts.find(row => row.id === post.quoteId), replies = selected.map(publicComment), parentRows = [...parents.values()];
  const ids = new Set([post.authorId, original?.authorId, ...[...replies, ...parentRows].flatMap(row => [row.authorId, row.replyToAuthorId])]);
  const accounts = data.accounts.filter(account => ids.has(account.id)).map(account => publicAccount(account.ownerId === '@user' ? { ...account, name: ownName } : account));
  return { post: postMaterial(post), ...(original ? { original: postMaterial(original) } : {}), accounts, currentAccount: accounts.find(account => account.id === post.authorId), replies, parents: parentRows };
}
export const getLiangshiContact = (state, account) => account?.handle ? state.contacts?.find(person => person.id === account.contactId && !isUserIdentity(state, person.id)) : undefined;
const promotions = [
  ['千千结', '千千结整理人物与剧情记忆，让长故事中的经历和关系有迹可循。'],
  ['构画', '构画把故事里的资料与内容放进可读的展示界面，让角色的日常有更多呈现方式。'],
  ['两三事', '两三事是一部角色旁的小手机，短信、群聊、论坛和动态，把聊天之外的日常装在一起。'],
];

export function liangshiStatistics(post) {
  if (post.userAuthored === true) return { likes: count(post.likes), commentCount: post.comments?.length || 0, repostCount: post.reposts?.length || 0 };
  const promoted = promotions.some(([name]) => post.builtinPromotion === name || post.promoted && (post.text || '').includes(name));
  return { likes: Math.max(count(post.likes), promoted ? 50000 : 0),
    commentCount: Math.max(count(post.commentCount), post.comments?.length || 0, promoted ? 5000 : 20),
    repostCount: Math.max(count(post.repostCount), post.reposts?.length || 0, promoted ? 2000 : 10) };
}

export function readLiangshiFeed(data = {}) {
  const posts = data.posts || [];
  if (!Array.isArray(data.feedIds)) return posts;
  const byId = new Map(posts.map(post => [post.id, post]));
  return data.feedIds.flatMap(id => byId.has(id) ? [byId.get(id)] : []);
}

export function readLiangshiFollowingFeed(data = {}) {
  const byId = new Map((data.posts || []).map(post => [post.id, post]));
  return (Array.isArray(data.followingFeedIds) ? data.followingFeedIds : []).flatMap(id => byId.has(id) ? [byId.get(id)] : []);
}
export const getLiangshiUserAccount = (data = {}) => (data.accounts || []).find(account => account.ownerId === '@user');
export function readLiangshiUserPosts(data = {}) {
  const posts = new Map((data.posts || []).map(post => [post.id, post]));
  return (data.userPostIds || []).flatMap(id => posts.has(id) ? [posts.get(id)] : []);
}

export function readLiangshiTopics(data = {}) {
  const feed = readLiangshiFeed(data);
  return (data.topics || []).map((topic, index) => ({ ...topic, id: topic.id || `legacy:${index}`,
    postIds: Array.isArray(topic.postIds) ? topic.postIds : feed.filter(post => post.topic === topic.name).map(post => post.id) }));
}
export const readLiangshiTopic = (data, id) => readLiangshiTopics(data).find(topic => topic.id === id);
const withOwnership = data => ({ ...data, feedIds: readLiangshiFeed(data).map(post => post.id), followingFeedIds: readLiangshiFollowingFeed(data).map(post => post.id), userPostIds: readLiangshiUserPosts(data).map(post => post.id), topics: readLiangshiTopics(data) });

function referencedPostIds(data, roots) {
  const byId = new Map((data.posts || []).map(post => [post.id, post]));
  const retained = new Set(), pending = [...roots];
  while (pending.length) {
    const id = pending.pop(), post = byId.get(id);
    if (!post || retained.has(id)) continue;
    retained.add(id);
    if (post.quoteId) pending.push(post.quoteId);
    for (const repost of post.reposts || []) if (repost.quoteId) pending.push(repost.quoteId);
  }
  return retained;
}

export const findLiangshiTopicForPost = (data, postId) => readLiangshiTopics(data).find(topic => referencedPostIds(data, topic.postIds).has(postId));
export const isLiangshiFollowingPost = (data = {}, postId) => referencedPostIds(data, readLiangshiFollowingFeed(data).map(post => post.id)).has(postId);
export const isLiangshiUserPost = (data = {}, postId) => referencedPostIds(data, readLiangshiUserPosts(data).map(post => post.id)).has(postId);

function retainOwned(data) {
  const owned = withOwnership(data);
  const retained = referencedPostIds(owned, [...owned.feedIds, ...owned.followingFeedIds, ...owned.userPostIds, ...owned.topics.flatMap(topic => topic.postIds)]);
  const posts = owned.posts.filter(post => retained.has(post.id));
  const authors = new Set(posts.flatMap(post => [post.authorId, ...(post.comments || []).flatMap(row => [row.authorId, row.replyToAuthorId]), ...(post.reposts || []).map(row => row.authorId)]));
  return { ...owned, posts, accounts: owned.accounts.filter(account => account.ownerId === '@user' || authors.has(account.id)) };
}

function parseHot(answer) {
  const topics = rows(Array.isArray(answer) ? answer : answer.topics ?? answer.hotTopics ?? answer.items).flatMap(row => {
    const name = typeof row === 'string' ? text(row) : text(row?.name ?? row?.title ?? row?.topic);
    if (!name) return [];
    const nameTranslation = text(row.nameTranslation ?? row.titleTranslation), descriptionTranslation = finishGeneratedText(text(row.descriptionTranslation ?? row.summaryTranslation));
    const heat = typeof row.heat === 'number' && Number.isFinite(row.heat) ? row.heat : text(row.heat);
    return [{ id: uid(), name, description: finishGeneratedText(text(row.description ?? row.summary ?? row.content)), ...(nameTranslation ? { nameTranslation } : {}), ...(descriptionTranslation ? { descriptionTranslation } : {}), ...(heat !== '' ? { heat } : {}), postIds: [] }];
  });
  return [...new Map(topics.map(topic => [topic.name, topic])).values()];
}

const contactScope = state => ({ allowed: new Set(state.contacts.filter(person => !isUserIdentity(state, person.id)).map(person => person.id)), userOwned: new Set(['@user', ...state.contacts.filter(person => isUserIdentity(state, person.id)).map(person => person.id)]) });

function accountCatalog(source, previous = [], retain = false, { allowed: contactIds = new Set(), userOwned = new Set(['@user']) } = {}) {
  const accounts = retain ? [...previous] : [], keys = new Map(), names = new Map();
  const remember = (key, account) => { if (!key) return; keys.set(key, keys.has(key) && keys.get(key)?.id !== account.id ? null : account); };
  const index = account => {
    remember(account.id, account); remember(handle(account.handle), account);
    const matches = names.get(account.name) || []; if (!matches.some(item => item.id === account.id)) matches.push(account); names.set(account.name, matches);
  };
  const userAccounts = previous.filter(account => account.ownerId === '@user' || userOwned.has(account.contactId));
  const reserved = value => value === '@user' || userAccounts.some(account => value === account.id || handle(value) && handle(value) === handle(account.handle));
  previous.filter(account => account.ownerId !== '@user' && !userOwned.has(account.contactId)).forEach(index);
  function register(row, position = 0) {
    if (!row || typeof row !== 'object' || userOwned.has(text(row.contactId))) return null;
    const username = handle(row.handle ?? row.username), name = text(row.name ?? row.displayName ?? row.nickname) || username;
    if (reserved(text(row.id)) || reserved(text(row.key)) || username && reserved(username)) return null;
    if (!name) return null;
    const matches = username ? previous.filter(account => handle(account.handle) === username) : [];
    const existing = matches.length === 1 ? matches[0] : username ? accounts.find(account => handle(account.handle) === username) : null;
    const field = (key, alias) => typeof row[key] === 'string' ? text(row[key]) : alias && typeof row[alias] === 'string' ? text(row[alias]) : existing?.[key] || '';
    const kind = text(row.kind ?? row.type), proposedContactId = text(row.contactId);
    const contactId = contactIds.has(proposedContactId) ? proposedContactId : contactIds.has(existing?.contactId) ? existing.contactId : '';
    const { contactId: previousContactId, ...profile } = existing || {};
    const account = { ...profile, id: existing?.id || uid(), name: text(row.name ?? row.displayName ?? row.nickname) || existing?.name || name, handle: username,
      kind: kind ? kind === 'institution' ? 'institution' : 'person' : existing?.kind || 'person',
      description: field('description', 'bio'), expression: field('expression'), language: field('language'),
      avatar: existing?.avatar || createCameoAvatar(), followed: existing?.followed === true,
      ...(username && contactIds.has(contactId) ? { contactId } : {}) };
    const found = accounts.findIndex(item => item.id === account.id); if (found < 0) accounts.push(account); else accounts[found] = account;
    index(account); remember(text(row.key ?? row.id) || `a${position + 1}`, account);
    return account;
  }
  rows(source).forEach(register);
  const resolve = row => {
    const reference = row?.authorId ?? row?.authorKey ?? row?.author ?? row?.username ?? row?.accountId;
    if (reference && typeof reference === 'object') return register(reference);
    const key = text(reference); if (reserved(key)) return null;
    const account = keys.get(key) || keys.get(handle(key)) || (names.get(key)?.length === 1 ? names.get(key)[0] : null);
    if (account && !accounts.some(item => item.id === account.id)) accounts.push(account);
    return account || null;
  };
  return { accounts, resolve };
}

function interactions(source, catalog, quoteId, preserve = () => false, clock) {
  return rows(source).flatMap(row => {
    const author = catalog.resolve(row), preserveStyle = preserve(author), body = finishGeneratedText(text(row?.text ?? row?.content ?? row?.message), { preserveStyle });
    const image = generatedImage(row);
    if ((!body && !image) || !author) return [];
    const translation = finishGeneratedText(text(row.translation ?? row.translatedText), { preserveStyle });
    return [{ id: uid(), authorId: author.id, text: body, ...(image ? { image } : {}), ...(translation ? { translation } : {}), ...(quoteId ? { quoteId } : {}), ...(clock ? { publishedAt: [clock.date, clock.time].filter(Boolean).join(' '), createdAt: new Date().toISOString() } : {}) }];
  });
}

function parseFeed(answer, previous, context, scope) {
  const { clock } = context, preserve = author => hasAccountStyleReference(author, context);
  const catalog = accountCatalog(answer.accounts ?? answer.users ?? answer.authors, previous.accounts, false, scope);
  const topics = rows(answer.topics ?? answer.hotTopics).flatMap(row => {
    const name = typeof row === 'string' ? text(row) : text(row?.name ?? row?.title ?? row?.topic);
    return name ? [{ name, description: finishGeneratedText(text(row?.description ?? row?.text)) }] : [];
  });
  // 临时key只用于这一次归属；持久ID与所有引用由程序一并生成。
  const keys = new Map(), pending = [];
  for (const [index, row] of rows(Array.isArray(answer) ? answer : answer.posts ?? answer.items ?? answer.weibos).entries()) {
    const author = catalog.resolve(row), preserveStyle = preserve(author), body = finishGeneratedText(text(row?.text ?? row?.content ?? row?.body), { preserveStyle }), description = text(row?.image?.description);
    if ((!body && !description) || !author) continue;
    const id = uid(), key = text(row.key ?? row.id) || `p${index + 1}`;
    keys.set(key, keys.has(key) ? null : id);
    const translation = finishGeneratedText(text(row.translation ?? row.translatedText), { preserveStyle }), topic = text(row.topic?.name ?? row.topic ?? row.hashtag).replace(/^#|#$/g, '');
    if (topic && !topics.some(item => item.name === topic)) topics.push({ name: topic, description: '' });
    pending.push({ row, post: { id, authorId: author.id, text: body, ...(translation ? { translation } : {}), ...(description ? { image: { description } } : {}), topic,
      publishedAt: text(row.publishedAt ?? row.published_at ?? row.time) || [clock?.date, clock?.time].filter(Boolean).join(' '), createdAt: new Date().toISOString(), promoted: row.promoted === true || row.ad === true,
      likes: count(row.likes), commentCount: count(row.commentCount ?? row.commentsCount), repostCount: count(row.repostCount ?? row.repostsCount),
      comments: interactions(row.comments ?? row.replies, catalog, undefined, preserve, clock).slice(0, 2), reposts: [] } });
  }
  const posts = pending.map(({ row, post }) => {
    const quoteId = keys.get(text(row.quoteKey ?? row.quoteId ?? row.repostOf));
    return quoteId && quoteId !== post.id ? { ...post, quoteId } : post;
  });
  return { accounts: catalog.accounts, posts, topics: [...new Map(topics.map(topic => [topic.name, topic])).values()] };
}

export function createLiangshiService({ store, contextReader, modelClient, random = Math.random }) {
  const read = () => store.read().liangshi || empty();
  const ownName = () => displayName(contextReader.readUserProfile());
  const period = () => random() < .5 ? 2 : 3;
  return {
    getPost: id => read().posts.find(post => post.id === id),
    async publishReply(postId, draft) {
      const body = text(draft.text); if (!body) throw new Error('请先写下回复。');
      const clock = contextReader.readClock(); let published;
      await store.updateLiangshi(data => {
        const post = data.posts.find(row => row.id === postId), comments = post ? liangshiInteractions(post) : [], parent = comments.find(row => row.id === draft.replyToId);
        if (!ownPost(data, post)) throw new Error('只能在本人微博下回复评论。');
        if (!parent) throw new Error('这条评论已更新，请重新选择回复。');
        published = { id: uid(), authorId: post.authorId, userAuthored: true, text: body, replyToId: parent.id, replyToAuthorId: parent.authorId, publishedAt: [clock.date, clock.time].filter(Boolean).join(' '), createdAt: new Date().toISOString() };
        return { ...data, posts: data.posts.map(row => row.id === postId ? { ...row, comments: [...comments, published] } : row) };
      });
      return published;
    },
    async generateReplies(postId, { regenerate = false } = {}) {
      const current = read(), post = current.posts.find(row => row.id === postId);
      if (!ownPost(current, post)) throw new Error('只能为本人微博生成回应。');
      const state = liangshiReplyState(post), excluded = new Set(regenerate ? state.last?.commentIds || [] : []);
      let selected = regenerate ? (state.last?.inputIds || []).map(id => post.comments.find(row => row.id === id)).filter(row => row?.userAuthored === true) : state.pending;
      if (!selected.length) return null;
      let material, continuation;
      while (selected.length) {
        material = replyMaterial(current, post, selected, excluded, ownName()); continuation = clipProjection(material, 8000);
        if (continuation) break;
        selected = selected.slice(0, -1);
      }
      if (!continuation) throw new Error('回复关系过长，请先减少本次回复内容。');
      const selectedIds = new Set(selected.map(row => row.id)), previousBatch = JSON.stringify(post.replyBatch), original = current.posts.find(row => row.id === post.quoteId);
      const context = await contextReader.readForLiangshi({ scanText: JSON.stringify(continuation), includePhoneContext: true, includeStory: false, includeUserPersona: true, excludeApps: ['liangshi'], authorContactIds: continuation.accounts.map(account => account.contactId).filter(Boolean) });
      assertPrivateAuthors(store.read(), context);
      const answer = parseJsonObject(await modelClient.complete({ system: LIANGSHI_REPLY_PROMPT, messages: [{ role: 'user', content: JSON.stringify({ ...context, ...continuation }) }] }));
      let noReplies = false;
      const saved = await store.updateLiangshi(data => {
        assertPrivateAuthors(store.read(), context);
        const latest = withOwnership(data), actual = latest.posts.find(row => row.id === postId);
        if (!ownPost(latest, actual) || JSON.stringify(postMaterial(actual)) !== JSON.stringify(postMaterial(post)) || JSON.stringify(postMaterial(latest.posts.find(row => row.id === original?.id))) !== JSON.stringify(postMaterial(original)) || JSON.stringify(actual.replyBatch) !== previousBatch)
          throw new Error('这条微博已修改，请重新生成回应。');
        for (const row of [...material.replies, ...material.parents]) if (JSON.stringify(publicComment(actual.comments.find(item => item.id === row.id) || {})) !== JSON.stringify(row)) throw new Error('本次回复已修改，请重新生成回应。');
        const catalog = accountCatalog(answer.accounts ?? answer.users, latest.accounts, true, contactScope(store.read())), raw = answer.comments ?? answer.replies;
        const comments = rows(raw).flatMap(row => {
          const parent = actual.comments.find(item => item.id === text(row?.replyToId) && selectedIds.has(item.id)), author = catalog.resolve(row), preserveStyle = hasAccountStyleReference(author, context, continuation.accounts), body = finishGeneratedText(text(row?.text ?? row?.content), { preserveStyle });
          const image = generatedImage(row);
          if (!parent || !author || (!body && !image)) return [];
          const translation = finishGeneratedText(text(row.translation), { preserveStyle });
          return [{ id: uid(), authorId: author.id, text: body, ...(image ? { image } : {}), ...(translation ? { translation } : {}), replyToId: parent.id, replyToAuthorId: parent.authorId, publishedAt: [context.clock?.date, context.clock?.time].filter(Boolean).join(' '), createdAt: new Date().toISOString() }];
        });
        if (!comments.length && !(Array.isArray(raw) && raw.length === 0)) throw new Error('没有生成可用的回应，请重新生成。');
        noReplies = !comments.length;
        const batch = { id: uid(), inputIds: [...selectedIds], commentIds: comments.map(row => row.id) };
        const next = { ...actual, comments: [...actual.comments.filter(row => !excluded.has(row.id)).map(row => selectedIds.has(row.id) ? { ...row, replyHandled: true } : row), ...comments], replyBatch: batch };
        return { ...latest, accounts: catalog.accounts, posts: latest.posts.map(row => row.id === postId ? next : row) };
      }, { cleanImages: true });
      return noReplies ? null : saved.liangshi.posts.find(row => row.id === postId);
    },
    async publishUser(draft) {
      const body = text(draft.text), translation = text(draft.translation), description = text(draft.imageDescription);
      if (!body && !description) throw new Error('请先写下微博正文或配图描述。');
      const clock = contextReader.readClock(); let published;
      await store.updateLiangshi(data => {
        const current = withOwnership(data), existing = getLiangshiUserAccount(current);
        const account = { ...existing, id: existing?.id || `user:${uid()}`, ownerId: '@user', name: ownName(),
          handle: existing?.handle || `user-${uid()}`, kind: 'person', avatar: existing?.avatar || store.read().userProfile?.avatar || createCameoAvatar() };
        published = { id: uid(), authorId: account.id, userAuthored: true, text: body, ...(translation ? { translation } : {}), ...(description ? { image: { description } } : {}),
          publishedAt: [clock.date, clock.time].filter(Boolean).join(' '), createdAt: new Date().toISOString(), likes: 0, commentCount: 0, repostCount: 0, comments: [], reposts: [] };
        return { ...current, accounts: [...current.accounts.filter(row => row.id !== account.id), account], posts: [...current.posts, published], userPostIds: [published.id, ...current.userPostIds] };
      });
      return published;
    },
    async draftUser({ seed = '', imageSeed = '' } = {}) {
      const context = await contextReader.readForLiangshiDraft({ seed: text(seed), imageSeed: text(imageSeed) });
      const answer = parseJsonObject(await modelClient.complete({ system: LIANGSHI_DRAFT_PROMPT, messages: [{ role: 'user', content: JSON.stringify(context) }] }));
      const preserveStyle = Boolean(text(context.userPersona) || text(context.seed));
      const body = finishGeneratedText(text(answer.text ?? answer.content), { preserveStyle }), translation = finishGeneratedText(text(answer.translation), { preserveStyle }), imageDescription = text(answer.image?.description) || text(imageSeed);
      if (!body && !imageDescription) throw new Error('没有生成可用的微博草稿，请重新帮写。');
      return { text: body, imageDescription, ...(body && translation ? { translation } : {}) };
    },
    async deleteUser(postId) {
      return store.updateLiangshi(data => {
        const current = withOwnership(data), post = current.posts.find(row => row.id === postId);
        if (!post?.userAuthored || !current.accounts.some(account => account.id === post.authorId && account.ownerId === '@user')) throw new Error('只能删除本人发布的微博。');
        return retainOwned({ ...current, posts: current.posts.filter(row => row.id !== postId), feedIds: current.feedIds.filter(id => id !== postId), followingFeedIds: current.followingFeedIds.filter(id => id !== postId),
          userPostIds: current.userPostIds.filter(id => id !== postId), topics: current.topics.map(topic => ({ ...topic, postIds: topic.postIds.filter(id => id !== postId) })) });
      }, { cleanImages: true });
    },
    async editUser(postId, draft) {
      const body = text(draft.text), description = text(draft.imageDescription), translation = text(draft.translation);
      if (!body && !description) throw new Error('请先写下微博正文或配图描述。');
      const clock = contextReader.readClock(); let edited;
      await store.updateLiangshi(data => {
        const current = withOwnership(data), post = current.posts.find(row => row.id === postId);
        if (post?.userAuthored !== true || !current.accounts.some(account => account.id === post.authorId && account.ownerId === '@user')) throw new Error('只能编辑本人发布的微博。');
        const { image, translation: oldTranslation, ...original } = post;
        edited = { ...original, text: body, ...(body && translation ? { translation } : {}),
          ...(description ? { image: description === text(image?.description) ? image : { description } } : {}), editedAt: [clock.date, clock.time].filter(Boolean).join(' ') };
        return { ...current, posts: current.posts.map(row => row.id === postId ? edited : row), accounts: current.accounts.map(account => account.id === post.authorId ? { ...account, name: ownName() } : account) };
      }, { cleanImages: true });
      return edited;
    },
    async refreshFollowing() {
      const context = await contextReader.readForLiangshiFollowing();
      assertPrivateAuthors(store.read(), context);
      const answer = parseJsonObject(await modelClient.complete({ system: LIANGSHI_FOLLOWING_PROMPT, messages: [{ role: 'user', content: JSON.stringify({ ...context, recipe: { posts: 15 } }) }] }));
      const saved = await store.updateLiangshi(latest => {
        assertPrivateAuthors(store.read(), context);
        const owned = withOwnership(latest), batch = parseFeed(answer, owned, context, contactScope(store.read()));
        if (!batch.posts.length) throw new Error('没有生成可读的关注微博，请点刷新重试。');
        const posts = batch.posts.map(post => ({ ...post, ...liangshiStatistics(post) }));
        return retainOwned({ ...owned, followingFeedIds: posts.map(post => post.id), posts: [...owned.posts, ...posts],
          accounts: [...new Map([...owned.accounts, ...batch.accounts].map(account => [account.id, account])).values()] });
      }, { cleanImages: true });
      return readLiangshiFollowingFeed(saved.liangshi);
    },
    async toggleLike(postId) {
      let saved;
      await store.updateLiangshi(data => {
        const current = withOwnership(data), post = current.posts.find(item => item.id === postId);
        if (!post) throw new Error('这条微博已不在两事，请返回查看新内容。');
        saved = { ...post, userLiked: !Boolean(post.userLiked) };
        return { ...current, posts: current.posts.map(item => item.id === postId ? saved : item) };
      });
      return saved;
    },
    async refresh() {
      const previous = read(), remaining = previous.promoCountdown || period(), due = remaining === 1;
      const context = await contextReader.readForLiangshi();
      assertPrivateAuthors(store.read(), context);
      const pool = ['温情', '安利', '引战', '拉踩', '争吵'];
      const selectedSubjects = Array.from({ length: 2 }, () => pool.splice(Math.floor(random() * pool.length), 1)[0]);
      const subjects = [
        ...['衣食起居', '住处邻里', '出行往来', '买卖交换', '闲暇见闻'].map(domain => ({ domain, type: '生活趣味' })),
        ...['生计劳动', '物产供需', '公共设施', '自然环境'].map(domain => ({ domain, type: '公开消息' })),
        ...['风俗人情', '公共规矩'].map(domain => ({ domain, type: '观点吐槽' })),
        ...['器物技艺', '异地风物'].map((domain, index) => ({ domain, type: selectedSubjects[index] })),
      ];
      for (let index = subjects.length - 1; index > 0; index--) { const selected = Math.floor(random() * (index + 1)); [subjects[index], subjects[selected]] = [subjects[selected], subjects[index]]; }
      const request = { ...context, recipe: { posts: due ? 14 : 15, content: 13, promotions: due ? 1 : 2, programPromotions: due ? 1 : 0, quotes: 2, subjects } };
      const answer = parseJsonObject(await modelClient.complete({ system: LIANGSHI_PROMPT, messages: [{ role: 'user', content: JSON.stringify(request) }] }));
      const saved = await store.updateLiangshi(latest => {
        assertPrivateAuthors(store.read(), context);
        const owned = withOwnership(latest);
        const batch = parseFeed(answer, owned, context, contactScope(store.read()));
        if (!batch.posts.length) throw new Error('没有生成可读的微博，请点刷新重试。');
        if (due) {
          const [name, body] = promotions[Math.floor(random() * promotions.length)];
          const existing = owned.accounts.find(account => handle(account.handle) === 'shiratori');
          const account = { ...existing, id: existing?.id || uid(), name: `白鳥·${name}`, handle: 'shiratori', kind: 'institution', avatar: existing?.avatar || createCameoAvatar(), followed: existing?.followed === true };
          batch.accounts.push(account);
          batch.posts.splice(Math.floor(random() * (batch.posts.length + 1)), 0, { id: uid(), authorId: account.id, text: body, promoted: true, builtinPromotion: name,
            topic: '', publishedAt: [context.clock?.date, context.clock?.time].filter(Boolean).join(' '), createdAt: new Date().toISOString(), likes: 0, commentCount: 0, repostCount: 0, comments: [], reposts: [] });
        }
        batch.posts = batch.posts.map(post => ({ ...post, ...liangshiStatistics(post) }));
        batch.promoCountdown = due ? period() : remaining - 1;
        return retainOwned({ ...owned, feedIds: batch.posts.map(post => post.id), posts: [...owned.posts, ...batch.posts],
          accounts: [...new Map([...owned.accounts, ...batch.accounts].map(account => [account.id, account])).values()], promoCountdown: batch.promoCountdown });
      }, { cleanImages: true });
      return saved.liangshi;
    },
    async refreshHot() {
      const context = await contextReader.readForLiangshiHot();
      const answer = parseJsonObject(await modelClient.complete({ system: LIANGSHI_HOT_PROMPT, messages: [{ role: 'user', content: JSON.stringify({ ...context, recipe: { topics: 15 } }) }] }));
      const topics = parseHot(answer);
      if (!topics.length) throw new Error('没有生成可读的热榜话题，请点刷新重试。');
      const saved = await store.updateLiangshi(latest => retainOwned({ ...withOwnership(latest), topics }), { cleanImages: true });
      return saved.liangshi.topics;
    },
    async loadTopic(topicId, { refresh = false } = {}) {
      const previous = read(), selected = readLiangshiTopic(previous, topicId);
      if (!selected) throw new Error('这条热榜话题已不在榜单，请返回查看新内容。');
      if (!refresh && selected.postIds.length) return selected.postIds.map(id => previous.posts.find(post => post.id === id)).filter(Boolean);
      const topic = { name: selected.name, description: selected.description || '', ...(selected.nameTranslation ? { nameTranslation: selected.nameTranslation } : {}), ...(selected.descriptionTranslation ? { descriptionTranslation: selected.descriptionTranslation } : {}) };
      const context = await contextReader.readForLiangshi({ scanText: [topic.name, topic.description].join('\n') });
      assertPrivateAuthors(store.read(), context);
      const answer = parseJsonObject(await modelClient.complete({ system: LIANGSHI_TOPIC_PROMPT, messages: [{ role: 'user', content: JSON.stringify({ ...context, topic, recipe: { posts: 8 } }) }] }));
      const saved = await store.updateLiangshi(latest => {
        assertPrivateAuthors(store.read(), context);
        const owned = withOwnership(latest);
        if (!owned.topics.some(item => item.id === topicId)) throw new Error('这条热榜话题已更新，微博未能保存，请返回查看新榜单。');
        const batch = parseFeed(answer, owned, context, contactScope(store.read()));
        if (!batch.posts.length) throw new Error('没有生成可读的话题微博，请点刷新重试。');
        const posts = batch.posts.map(post => ({ ...post, topic: topic.name, ...liangshiStatistics(post) }));
        return retainOwned({ ...owned, topics: owned.topics.map(item => item.id === topicId ? { ...item, postIds: posts.map(post => post.id) } : item), posts: [...owned.posts, ...posts],
          accounts: [...new Map([...owned.accounts, ...batch.accounts].map(account => [account.id, account])).values()] });
      }, { cleanImages: true });
      return readLiangshiTopic(saved.liangshi, topicId).postIds.map(id => saved.liangshi.posts.find(post => post.id === id));
    },
    async loadMore(postId) {
      const current = read(), post = current.posts.find(item => item.id === postId);
      if (!post) throw new Error('这条微博已不在两事，请返回查看新内容。');
      const original = current.posts.find(item => item.id === post.quoteId);
      const comments = liangshiInteractions(post).slice(-10).map(publicComment), reposts = liangshiInteractions(post, 'reposts').slice(-4).map(publicComment);
      const ids = new Set([post.authorId, original?.authorId, ...comments.map(item => item.authorId), ...reposts.map(item => item.authorId)]);
      const accounts = current.accounts.filter(account => ids.has(account.id)).map(account => publicAccount(account.ownerId === '@user' ? { ...account, name: ownName() } : account));
      const own = post.userAuthored === true && current.accounts.some(account => account.id === post.authorId && account.ownerId === '@user');
      const continuation = clipProjection({ post: { ...publicPost(post), comments, reposts }, ...(original ? { original: { ...publicPost(original), comments: [], reposts: [] } } : {}), accounts,
        ...(own ? { currentAccount: accounts.find(account => account.id === post.authorId) } : {}) }, 8000);
      const context = await contextReader.readForLiangshi({ scanText: [continuation.post.text, continuation.original?.text || '', ...continuation.accounts.map(account => account.name)].join('\n'), includePhoneContext: true, includeStory: false, includeUserPersona: own, authorContactIds: continuation.accounts.map(account => account.contactId).filter(Boolean) });
      assertPrivateAuthors(store.read(), context);
      const answer = parseJsonObject(await modelClient.complete({ system: LIANGSHI_MORE_PROMPT, messages: [{ role: 'user', content: JSON.stringify({ ...context, ...continuation }) }] }));
      let noNewInteractions = false;
      const saved = await store.updateLiangshi(data => {
        assertPrivateAuthors(store.read(), context);
        const latest = withOwnership(data), actual = latest.posts.find(item => item.id === postId);
        if (!actual) throw new Error('这条微博已不在两事，互动未能保存。');
        const catalog = accountCatalog(answer.accounts ?? answer.users, latest.accounts, true, contactScope(store.read()));
        const preserve = author => hasAccountStyleReference(author, context, continuation.accounts);
        const comments = interactions(answer.comments ?? answer.replies, catalog, undefined, preserve, context.clock), reposts = interactions(answer.reposts ?? answer.forwards, catalog, postId, preserve, context.clock);
        if (!comments.length && !reposts.length) {
          const rawComments = answer.comments ?? answer.replies, rawReposts = answer.reposts ?? answer.forwards;
          if (own && Array.isArray(rawComments) && !rawComments.length && Array.isArray(rawReposts) && !rawReposts.length) { noNewInteractions = true; return data; }
          throw new Error('没有生成新的评论或转发，请点加载更多重试。');
        }
        const appended = { ...actual, comments: [...actual.comments, ...comments], reposts: [...actual.reposts, ...reposts] };
        const next = { ...appended, ...liangshiStatistics(appended) };
        return { ...latest, accounts: [...new Map([...latest.accounts, ...catalog.accounts].map(account => [account.id, account])).values()], posts: latest.posts.map(item => item.id === postId ? next : item) };
      });
      return noNewInteractions ? null : saved.liangshi.posts.find(item => item.id === postId);
    },
  };
}
