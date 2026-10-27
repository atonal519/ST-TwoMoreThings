import { parseJsonObject } from './api.js';
import { getSocialAuthor } from './social.js';
import { createImageProviders } from './image-providers.js';
import { getLiangshiContact } from './liangshi.js';
import { contentImagePaths, imagePath } from './image-files.js';

const IMAGE_PROMPT = '把手机照片描述转为绘图提示。结合sender辨明“我/自拍”的人物；只描述这张照片，不补写剧情。人物外观和衣着由柏宝绘角色库提供，prompt不自行编写这些特征。必须列出所有画面人物，库中缺少人物也要返回其姓名，不能为绕过缺档而省略。只输出JSON：{"prompt":"场景、动作、构图的英文danbooru短标签，非空","nl":"可选画面描述","characters":["画面中人物的准确姓名；有对应库条目时用库内姓名，无人物时为空"],"size":"portrait或landscape"}。不输出说明或图片地址。';

export function createPhoneImageService({ store, modelClient, files, host, providers = host ? createImageProviders({ host }) : null, apiProvider = () => globalThis.STBaiBaiImage, assertEnabled = () => {}, onBusyChange = () => {}, defaultUser = '我' }) {
  // 图片入口共用绘图步骤，各自只更新所属记录。
  async function draw(description, sender, sceneryOnly = false) {
    assertEnabled();
    const { api, label } = providers ? providers.resolve() : { api: apiProvider(), label: '柏宝绘' };
    if (!api?.generate || api.apiVersion !== 1) throw new Error(`请安装并开启${label}，再点图片生成。`);
    const status = api.getBackendStatus();
    if (!status.configured) throw new Error(status.reason || `请先在${label}中完成生图设置。`);
    const catalog = api.getCharacters(), library = catalog.characters || [], outfits = catalog.outfits || [];
    const outfitRule = outfits.length ? '如照片需要库中的服装，可附outfits数组，只填outfits给定的准确名称；没有对应就省略。' : '';
    const recipe = parseJsonObject(await modelClient.complete({ system: IMAGE_PROMPT.replaceAll('柏宝绘', label) + outfitRule + (sceneryOnly ? '此图来自未绑定人物的路人账号，只允许无人风景或物品；characters必须为空，不能把人物照改说成风景。' : ''), messages: [{ role: 'user', content: JSON.stringify({ description, sender: { name: sender?.name || '', nickname: sender?.nickname || '' }, user: store.read().userProfile?.name || defaultUser, characters: library.map(({ name }) => name), ...(outfits.length ? { outfits: outfits.map(({ name }) => name) } : {}) }) }] }));
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
  async function attach(image, save) {
    try { assertEnabled(); await save(); }
    catch (error) {
      const path = imagePath(image.path), state = await store.readSaved();
      if (path && !contentImagePaths(state).has(path) && files?.remove) {
        try { await files.remove([path]); }
        catch (cleanupError) { throw new AggregateError([error, cleanupError], `${error.message}；新生成图片及附带文件清理失败。`); }
      }
      throw error;
    }
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
      const message = store.read().conversations[id]?.find(item => item.id === messageId);
      if (!message || message.type !== 'image') throw new Error('这条图片消息已不存在。');
      if (message.image.path) return message.image;
      const state = store.read(), group = state.groups?.find(item => item.id === id);
      const sender = message.role === 'user' ? state.userProfile || { name: defaultUser } : state.contacts.find(person => person.id === (group ? message.speakerId : id));
      const image = await draw(message.image.description, sender);
      await attach(image, () => store.updateImage(id, messageId, image, message.image.description));
      return { ...message.image, ...image };
    },
    async generateLiangshi(postId) {
      assertEnabled();
      const state = store.read(), post = state.liangshi?.posts.find(item => item.id === postId);
      if (!post?.image) throw new Error('这条微博的图片已不存在。');
      if (post.image.path) return post.image;
      const account = state.liangshi.accounts.find(item => item.id === post.authorId);
      if (!account) throw new Error('这位微博作者已不存在。');
      const contact = getLiangshiContact(state, account);
      const own = account.ownerId === '@user';
      const image = await draw(post.image.description, own ? { ...state.userProfile, name: state.userProfile?.name || defaultUser, nickname: state.userProfile?.nickname || state.userProfile?.name || defaultUser } : contact || account, !own && !contact);
      await attach(image, () => store.updateLiangshi(current => {
        const actual = current.posts.find(item => item.id === postId);
        if (!actual) throw new Error('这条微博已删除，无法保存图片。');
        if (actual.image?.description !== post.image.description) throw new Error('这条微博配图描述已修改，请重新点击生成。');
        return { ...current, posts: current.posts.map(item => item.id === postId ? { ...item, image: { ...item.image, ...image } } : item) };
      }));
      return { ...post.image, ...image };
    },
    async generatePost(postId) {
      assertEnabled();
      const state = store.read(), post = state.social?.posts.find(item => item.id === postId);
      if (!post?.image) throw new Error('这条动态的图片已不存在。');
      if (post.image.path) return post.image;
      const sender = getSocialAuthor(state, post.authorId);
      if (!sender) throw new Error('这位动态作者已不存在。');
      const image = await draw(post.image.description, sender, sender.kind === 'npc');
      await attach(image, () => store.updateSocial(social => {
        const actual = social.posts.find(item => item.id === postId);
        if (!actual) throw new Error('这条动态已删除，无法保存图片。');
        if (actual.image?.description !== post.image.description) throw new Error('这条动态配图描述已修改，请重新点击生成。');
        return { ...social, posts: social.posts.map(item => item.id === postId ? { ...item, image: { ...item.image, ...image } } : item) };
      }));
      return { ...post.image, ...image };
    },
  };
}
