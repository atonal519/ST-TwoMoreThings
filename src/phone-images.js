import { SENTENCE_RULE } from './prompts.js';
import { parseJsonObject } from './api.js';
import { getSocialAuthor } from './social.js';
import { createImageProviders } from './image-providers.js';
import { getLiangshiContact, liangshiInteractions } from './liangshi.js';
import { forumComments } from './forum.js';
import { identityOwnerId } from './identities.js';
import { findAlbumPhoto } from './album.js';

const IMAGE_PROMPT = SENTENCE_RULE + '把手机照片描述转为绘图提示。结合sender辨明“我/自拍”的人物；只描述这张照片，不补写剧情。人物外观和衣着由柏宝绘角色库提供，prompt不自行编写这些特征。必须列出所有画面人物，库中缺少人物也要返回其姓名，不能为绕过缺档而省略。只输出JSON：{"prompt":"场景、动作、构图的英文danbooru短标签，非空","nl":"可选画面描述","characters":["画面中人物的准确姓名；有对应库条目时用库内姓名，无人物时为空"],"size":"portrait或landscape"}。不输出说明或图片地址。';

export function createPhoneImageService({ store, modelClient, files, host, providers = host ? createImageProviders({ host }) : null, apiProvider = () => globalThis.STBaiBaiImage, assertEnabled = () => {}, onBusyChange = () => {}, defaultUser = '我' }) {
  const userSender = state => ({ ...state.userProfile, name: state.userProfile?.name || defaultUser, nickname: state.userProfile?.nickname || state.userProfile?.name || defaultUser });
  const contactSender = (state, person) => {
    if (identityOwnerId(state, person.id) === '@user') return { sender: { ...userSender(state), nickname: person.nickname || person.name }, key: '@user' };
    const owner = identityOwnerId(state, person.id), main = state.contacts.find(row => row.id === owner) || person;
    return { sender: { ...person, name: main.name, nickname: person.nickname || person.name }, key: owner };
  };
  function actor(state, app, row) {
    if (app === 'social') { const author = getSocialAuthor(state, row.authorId); if (author?.kind === 'contact') return contactSender(state, author); }
    if (app === 'liangshi') {
      const account = state.liangshi.accounts.find(item => item.id === row.authorId);
      if (account?.ownerId === '@user') return { sender: userSender(state), key: '@user' };
      const contact = getLiangshiContact(state, account); if (contact) return contactSender(state, contact);
    }
    return { sender: null, key: 'anonymous', sceneryOnly: true, anonymous: true };
  }
  function messageActor(state, id, message) {
    if (message.role === 'user') return { sender: userSender(state), key: '@user' };
    const group = state.groups?.find(row => row.id === id), person = state.contacts.find(row => row.id === (group ? message.speakerId : id));
    return person ? contactSender(state, person) : { sender: null, key: 'anonymous' };
  }
  // 图片入口共用绘图步骤，各自只更新所属记录。
  async function draw(description, sender, sceneryOnly = false, { anonymous = false } = {}) {
    assertEnabled();
    const { api, label } = providers ? providers.resolve() : { api: apiProvider(), label: '柏宝绘' };
    if (!api?.generate || api.apiVersion !== 1) throw new Error(`请安装并开启${label}，再点图片生成。`);
    const status = api.getBackendStatus();
    if (!status.configured) throw new Error(status.reason || `请先在${label}中完成生图设置。`);
    const catalog = api.getCharacters(), library = anonymous ? [] : catalog.characters || [], outfits = anonymous ? [] : catalog.outfits || [];
    const outfitRule = outfits.length ? '如照片需要库中的服装，可附outfits数组，只填outfits给定的准确名称；没有对应就省略。' : '';
    const recipe = parseJsonObject(await modelClient.complete({ system: IMAGE_PROMPT.replaceAll('柏宝绘', label) + outfitRule + (sceneryOnly ? '此图来自未绑定人物的路人账号，只允许无人风景或物品；characters必须为空，不能把人物照改说成风景。' : ''), messages: [{ role: 'user', content: JSON.stringify({ description, ...(!anonymous ? { sender: { name: sender?.name || '', nickname: sender?.nickname || '' }, user: store.read().userProfile?.name || defaultUser } : {}), characters: library.map(({ name }) => name), ...(outfits.length ? { outfits: outfits.map(({ name }) => name) } : {}) }) }] }));
    if (typeof recipe.prompt !== 'string' || !recipe.prompt.trim()) throw new Error('没有生成可用的图片描述，请重新点图片。');
    if (!Array.isArray(recipe.characters)) throw new Error('图片描述中的人物列表缺失或格式不正确，请重新点图片。');
    if (sceneryOnly && recipe.characters.length) throw new Error('图片描述包含人物，未生成这张路人配图。请重新点图片。');
    const characters = [...new Set(recipe.characters)].map(name => {
      const matching = library.filter(item => item.name === name), person = matching[0];
      if (matching.length !== 1 || !person?.tag?.trim()) throw new Error(`照片人物没有对应到完整的${label}角色档案，请先在${label}补充人物外貌和衣着。`);
      return { name: person.name, tag: person.tag, nl: person.nl || '' };
    });
    assertEnabled();
    let result;
    // ComfyUI 与旧 NAI 模型不读取独立角色字段，需将同一份库标签放入整体提示。
    const separate = status.supportsCharacters === true;
    const selectedOutfits = (Array.isArray(recipe.outfits) ? recipe.outfits : typeof recipe.outfits === 'string' ? [recipe.outfits] : []).flatMap(name => { const found = outfits.filter(item => item.name === name); return found.length === 1 ? [found[0].tag] : []; });
    const prompt = [recipe.prompt.trim(), ...(separate ? [] : characters.map(person => person.tag)), ...selectedOutfits].filter(Boolean).join(', ');
    const nl = [typeof recipe.nl === 'string' ? recipe.nl : '', ...(separate ? [] : characters.map(person => person.nl || person.tag))].filter(Boolean).join('. ');
    onBusyChange(true);
    try { result = await api.generate({ prompt, nl, characters, size: recipe.size === 'landscape' ? 'landscape' : 'portrait', save: true }); }
    finally { onBusyChange(false); }
    if (!result.path) throw new Error(`图片已生成，但${label}没有保存成功。请检查图库保存状态。`);
    return { path: result.path, ...(result.seed !== undefined ? { seed: result.seed } : {}) };
  }
  async function attach(image, originalState, app, original, change) {
    const replace = row => {
      if (row === original) return { ...row, image: { ...row.image, ...image } };
      let next = row;
      for (const collection of ['comments', 'reposts']) if (Array.isArray(row[collection]) && row[collection].includes(original)) next = { ...next, [collection]: row[collection].map(replace) };
      return next;
    };
    const material = app === 'messages'
      ? { ...originalState, conversations: Object.fromEntries(Object.entries(originalState.conversations).map(([id, rows]) => [id, rows.map(replace)])) }
      : { ...originalState, [app]: { ...originalState[app], posts: originalState[app].posts.map(replace) } };
    const photo = findAlbumPhoto(material, image.path);
    if (!photo) throw new Error('图片已生成，但保存路径无法用于相册，请在生图插件图库查看。');
    // Validation controls attachment, while the paid provider result is retained
    // in the same save even if its original source changed during generation.
    await store.saveGeneratedPhoto(photo, state => { assertEnabled(); return change(state); });
  }
  async function generateNested(app, postId, collection, rowId) {
    assertEnabled();
    const state = store.read(), post = state[app]?.posts.find(item => item.id === postId);
    const rows = post && (app === 'forum' ? forumComments(post) : liangshiInteractions(post, collection));
    const index = rows?.findIndex(row => row.id === rowId), original = index >= 0 ? post[collection][index] : null;
    if (!original?.image) throw new Error('这条回复或转发配图已不存在。');
    if (original.image.path) return original.image;
    const identity = actor(state, app, original), image = await draw(original.image.description, identity.sender, identity.sceneryOnly, { anonymous: identity.anonymous });
    await attach(image, state, app, original, current => {
      const data = current[app];
      const actual = data.posts.find(item => item.id === postId), rows = actual?.[collection] || [];
      // Legacy index IDs identify this exact retained object, never a replacement row.
      const position = original.id ? rows.findIndex(row => row.id === original.id) : rows.indexOf(original), row = rows[position];
      if (!row || row.image?.description !== original.image.description || actor(current, app, row).key !== identity.key) throw new Error('回复、作者或配图已更新，图片未关联。');
      const saved = { ...row, id: row.id || globalThis.crypto.randomUUID(), image: { ...row.image, ...image } };
      return { ...current, [app]: { ...data, posts: data.posts.map(post => post.id === postId ? { ...post, [collection]: rows.map((item, index) => index === position ? saved : item) } : post) } };
    });
    return { ...original.image, ...image };
  }
  return {
    async recoverMissing(paths) {
      assertEnabled();
      const missing = await files.findMissing(paths);
      if (missing.length) await store.clearImagePaths(missing);
      return missing;
    },
    async generate(id, messageId) {
      assertEnabled();
      const state = store.read(), message = state.conversations[id]?.find(item => item.id === messageId);
      if (!message || message.type !== 'image') throw new Error('这条图片消息已不存在。');
      if (message.image.path) return message.image;
      const identity = messageActor(state, id, message);
      const image = await draw(message.image.description, identity.sender);
      await attach(image, state, 'messages', message, current => {
        const actual = current.conversations[id]?.find(row => row.id === messageId);
        if (!actual || actual.type !== 'image') throw new Error('这条图片消息已删除，无法保存图片。');
        if (actual.image.description !== message.image.description) throw new Error('这条图片描述已修改，请重新点击生成。');
        if (messageActor(current, id, actual).key !== identity.key) throw new Error('图片作者归属已变化，图片未关联。');
        return { ...current, conversations: { ...current.conversations, [id]: current.conversations[id].map(row => row.id === messageId ? { ...row, image: { ...row.image, ...image } } : row) } };
      });
      return { ...message.image, ...image };
    },
    async generateForum(postId, commentId) {
      if (commentId) return generateNested('forum', postId, 'comments', commentId);
      assertEnabled(); const state = store.read(), post = state.forum?.posts.find(row => row.id === postId);
      if (!post?.image) throw new Error('这条帖子配图已不存在。');
      if (post.image.path) return post.image;
      const image = await draw(post.image.description, null, true, { anonymous: true });
      await attach(image, state, 'forum', post, current => {
        const actual = current.forum.posts.find(row => row.id === postId);
        if (!actual || actual.image?.description !== post.image.description) throw new Error('帖子或配图已更新，图片未关联。');
        return { ...current, forum: { ...current.forum, posts: current.forum.posts.map(row => row.id === postId ? { ...row, image: { ...row.image, ...image } } : row) } };
      });
      return { ...post.image, ...image };
    },
    async generateLiangshi(postId, { collection = 'comments', id } = {}) {
      if (id && ['comments', 'reposts'].includes(collection)) return generateNested('liangshi', postId, collection, id);
      assertEnabled();
      const state = store.read(), post = state.liangshi?.posts.find(item => item.id === postId);
      if (!post?.image) throw new Error('这条微博的图片已不存在。');
      if (post.image.path) return post.image;
      const account = state.liangshi.accounts.find(item => item.id === post.authorId);
      if (!account) throw new Error('这位微博作者已不存在。');
      const identity = actor(state, 'liangshi', post);
      const image = await draw(post.image.description, identity.sender, identity.sceneryOnly, { anonymous: identity.anonymous });
      await attach(image, state, 'liangshi', post, current => {
        const actual = current.liangshi.posts.find(item => item.id === postId);
        if (!actual) throw new Error('这条微博已删除，无法保存图片。');
        if (actor(current, 'liangshi', actual).key !== identity.key) throw new Error('图片作者归属已变化，图片未关联。');
        if (actual.image?.description !== post.image.description) throw new Error('这条微博配图描述已修改，请重新点击生成。');
        return { ...current, liangshi: { ...current.liangshi, posts: current.liangshi.posts.map(item => item.id === postId ? { ...item, image: { ...item.image, ...image } } : item) } };
      });
      return { ...post.image, ...image };
    },
    async generatePost(postId) {
      assertEnabled();
      const state = store.read(), post = state.social?.posts.find(item => item.id === postId);
      if (!post?.image) throw new Error('这条动态的图片已不存在。');
      if (post.image.path) return post.image;
      const sender = getSocialAuthor(state, post.authorId);
      if (!sender) throw new Error('这位动态作者已不存在。');
      const identity = actor(state, 'social', post);
      const image = await draw(post.image.description, identity.sender, identity.sceneryOnly, { anonymous: identity.anonymous });
      await attach(image, state, 'social', post, current => {
        const social = current.social;
        const actual = social.posts.find(item => item.id === postId);
        if (!actual) throw new Error('这条动态已删除，无法保存图片。');
        if (actor(current, 'social', actual).key !== identity.key) throw new Error('图片作者归属已变化，图片未关联。');
        if (actual.image?.description !== post.image.description) throw new Error('这条动态配图描述已修改，请重新点击生成。');
        return { ...current, social: { ...social, posts: social.posts.map(item => item.id === postId ? { ...item, image: { ...item.image, ...image } } : item) } };
      });
      return { ...post.image, ...image };
    },
  };
}
