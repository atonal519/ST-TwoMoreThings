import { parsePayload, parseJsonObject } from './api.js';
import { FORUM_PROMPT, FORUM_MORE_PROMPT } from './prompts.js';
import { clipProjection } from './context-budget.js';
import { finishGeneratedText } from './generated-text.js';
import { generatedImage } from './content.js';

const text = value => typeof value === 'string' ? value.trim() : '';
const uid = () => globalThis.crypto.randomUUID();
const time = clock => [clock?.date, clock?.time].filter(Boolean).join(' ');
const nicknames = ['河边捡石头','晚饭吃什么','纸袋装月亮','窗边发呆','今天也路过','慢半拍','橘子味汽水','一碗小面','鞋带又散了','听风的纸盒','别催在走了','周末睡到自然醒'];
function anonymousName(post, random) { const candidate = nicknames[Math.floor(random() * nicknames.length)]; return [post.author, ...(post.comments || []).map(row => row.author)].includes(candidate) ? candidate + uid().slice(0, 4) : candidate; }
export const forumComments = post => (post.comments || []).map((row, index) => ({ ...row, id: row.id || `forum:${post.id}:${index}` }));
const material = post => ({ id: post.id, title: post.title, author: post.author, content: post.content, ...(post.contentTranslation ? { contentTranslation: post.contentTranslation } : {}), ...(post.image ? { image: { description: post.image.description } } : {}) });
const commentDto = ({ id, author, text, translation, replyToId, publishedAt, image }) => ({ id, author, text, ...(image?.description ? { image: { description: image.description } } : {}), ...(translation ? { translation } : {}), ...(replyToId ? { replyToId } : {}), ...(publishedAt ? { publishedAt } : {}) });

export function createForumService({ store, contextReader, modelClient, random = Math.random }) {
  const find = id => store.read().forum.posts.find(post => post.id === id);
  return {
    getPost(id) { const post = find(id); return post && { ...post, comments: forumComments(post) }; },
    async refresh() {
      const context = await contextReader.readForForum();
      const reply = await modelClient.complete({ system: FORUM_PROMPT, messages: [{ role: 'user', content: JSON.stringify(context) }] });
      const createdAt = new Date().toISOString();
      const posts = parsePayload(reply, 'forum').map(post => ({ ...post, id: uid(), publishedAt: time(context.clock), createdAt, comments: post.comments.map(row => ({ ...row, id: uid(), publishedAt: time(context.clock), createdAt })) }));
      await store.replaceForum(posts);
      return posts;
    },
    async publishComment(postId, draft) {
      const body = text(draft.text); if (!body) throw new Error('请先写下回帖。');
      const clock = contextReader.readClock(); let published;
      await store.updateForum(data => {
        const post = data.posts.find(row => row.id === postId); if (!post) throw new Error('这条帖子已更新，请返回论坛。');
        const comments = forumComments(post), replyToId = text(draft.replyToId);
        if (replyToId && replyToId !== post.id && !comments.some(row => row.id === replyToId)) throw new Error('回复的楼层已不存在，请重新选择。');
        published = { id: uid(), author: anonymousName(post, random), userAuthored: true, text: body, publishedAt: time(clock), createdAt: new Date().toISOString(), ...(replyToId && replyToId !== post.id ? { replyToId } : {}) };
        return { ...data, posts: data.posts.map(row => row.id === postId ? { ...row, comments: [...comments, published] } : row) };
      });
      return published;
    },
    async loadMore(postId) {
      const state = await store.readSaved(), post = state.forum.posts.find(row => row.id === postId); if (!post) throw new Error('这条帖子已更新，请返回论坛。');
      const all = forumComments(post), byId = new Map(all.map(row => [row.id, row]));
      const pending = all.filter(row => row.userAuthored === true && !all.some(reply => !reply.userAuthored && reply.replyToId === row.id));
      const chosen = [...pending.slice(-10)];
      for (const row of all.slice(-10).reverse()) if (chosen.length < 10 && !chosen.some(item => item.id === row.id)) chosen.push(row);
      chosen.sort((a, b) => all.indexOf(a) - all.indexOf(b));
      let selected = chosen, source, continuation;
      while (selected.length) {
        const included = new Map(selected.map(row => [row.id, row]));
        for (const row of selected) { let id = row.replyToId; const visited = new Set([row.id]); while (id && !visited.has(id)) { visited.add(id); const parent = byId.get(id); if (!parent) break; included.set(id, parent); id = parent.replyToId; } }
        source = [...included.values()].map(commentDto);
        continuation = clipProjection({ post: material(post), comments: source, replyTargets: selected.filter(row => pending.some(item => item.id === row.id)).map(row => row.id) }, 8000);
        if (continuation) break;
        selected = selected.slice(1);
      }
      if (!chosen.length) { source = []; continuation = clipProjection({ post: material(post), comments: [], replyTargets: [] }, 8000); }
      if (!continuation) throw new Error('本帖楼层关系过长，请返回论坛查看其他帖子。');
      const context = await contextReader.readForForum({ continuation: true, scanText: JSON.stringify(continuation) });
      const answer = parseJsonObject(await modelClient.complete({ system: FORUM_MORE_PROMPT, messages: [{ role: 'user', content: JSON.stringify({ ...context, continuation }) }] }));
      let noComments = false;
      const saved = await store.updateForum(data => {
        const actual = data.posts.find(row => row.id === postId); if (!actual) throw new Error('这条帖子已更新，回帖未保存。');
        const comments = forumComments(actual);
        if (JSON.stringify(material(actual)) !== JSON.stringify(material(post)) || source.some(row => JSON.stringify(commentDto(comments.find(item => item.id === row.id) || {})) !== JSON.stringify(row))) throw new Error('帖子内容已修改，请重新加载回帖。');
        const reserved = new Set(comments.filter(row => row.userAuthored === true).map(row => row.author));
        const createdAt = new Date().toISOString();
        const rows = answer.comments ?? answer.replies, allowed = new Set(source.map(row => row.id)), keys = new Map(), added = [];
        for (const row of Array.isArray(rows) ? rows : []) {
          const author = text(row?.author ?? row?.name), body = finishGeneratedText(text(row?.text ?? row?.content)), target = text(row?.replyToId ?? row?.replyToKey);
          const image = generatedImage(row);
          const replyToId = target === postId ? '' : allowed.has(target) ? target : keys.get(target);
          if (!author || (!body && !image) || reserved.has(author) || row.role === 'user' || row.userAuthored === true || row.authorId === '@user' || target && replyToId === undefined) continue;
          const translation = finishGeneratedText(text(row.translation)), id = uid(), key = text(row.key ?? row.id);
          added.push({ id, author, text: body, ...(image ? { image } : {}), ...(translation ? { translation } : {}), ...(replyToId ? { replyToId } : {}), publishedAt: time(context.clock), createdAt });
          if (key) keys.set(key, keys.has(key) ? undefined : id);
        }
        if (!added.length) { if (Array.isArray(rows) && !rows.length) { noComments = true; return data; } throw new Error('没有可用的新回帖，请重新加载。'); }
        return { ...data, posts: data.posts.map(row => row.id === postId ? { ...row, comments: [...comments, ...added] } : row) };
      });
      return noComments ? null : saved.forum.posts.find(row => row.id === postId);
    },
  };
}
