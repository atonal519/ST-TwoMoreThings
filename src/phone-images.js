import { parseJsonObject } from './api.js';

const IMAGE_PROMPT = '把手机照片描述转为绘图提示。结合sender辨明“我/自拍”的人物；只描述这张照片，不补写剧情。人物外观和衣着由柏宝绘角色库提供，prompt不自行编写这些特征。必须列出所有画面人物，库中缺少人物也要返回其姓名，不能为绕过缺档而省略。只输出JSON：{"prompt":"场景、动作、构图的英文danbooru短标签，非空","nl":"可选画面描述","characters":["画面中人物的准确姓名；有对应库条目时用库内姓名，无人物时为空"],"size":"portrait或landscape"}。不输出说明或图片地址。';

export function createPhoneImageService({ store, modelClient, apiProvider = () => globalThis.STBaiBaiImage, assertEnabled = () => {}, readBatch, onBusyChange = () => {}, defaultUser = '我' }) {
  return {
    async generate(id, messageId) {
      assertEnabled();
      const message = store.read().conversations[id]?.find(item => item.id === messageId);
      if (!message || message.type !== 'image') throw new Error('这条图片消息已不存在。');
      if (message.image.path) return message.image;
      if (readBatch && message.batch?.key !== readBatch().key) throw new Error('过去的图片消息只能查看。');
      const api = apiProvider();
      if (!api?.generate || api.apiVersion !== 1) throw new Error('请安装并开启提供公开接口的柏宝绘，再点图片生成。');
      const status = api.getBackendStatus();
      if (!status.configured) throw new Error(status.reason || '请先在柏宝绘中完成生图设置。');
      const library = api.getCharacters().characters || [];
      const state = store.read(), group = state.groups?.find(item => item.id === id);
      const sender = message.role === 'user' ? state.userProfile || { name: defaultUser } : state.contacts.find(person => person.id === (group ? message.speakerId : id));
      const recipe = parseJsonObject(await modelClient.complete({ system: IMAGE_PROMPT, messages: [{ role: 'user', content: JSON.stringify({ description: message.image.description, sender: { name: sender?.name || '', nickname: sender?.nickname || '' }, user: state.userProfile?.name || defaultUser, characters: library.map(({ name }) => name) }) }], maxTokens: 1200 }));
      if (typeof recipe.prompt !== 'string' || !recipe.prompt.trim()) throw new Error('没有生成可用的图片描述，请重新点图片。');
      if (!Array.isArray(recipe.characters)) throw new Error('图片描述中的人物列表缺失或格式不正确，请重新点图片。');
      const characters = [...new Set(recipe.characters)].map(name => {
        const matching = library.filter(item => item.name === name), person = matching[0];
        if (matching.length !== 1 || !person?.tag?.trim()) throw new Error('照片人物没有对应到完整的柏宝绘角色档案，请先在柏宝绘补充人物外貌和衣着。');
        return { name: person.name, tag: person.tag, nl: person.nl || '' };
      });
      assertEnabled();
      let result;
      // ComfyUI 与旧 NAI 模型不读取独立角色字段，需将同一份库标签放入整体提示。
      const separate = status.supportsCharacters === true;
      const prompt = [recipe.prompt.trim(), ...(separate ? [] : characters.map(person => person.tag))].filter(Boolean).join(', ');
      const nl = [typeof recipe.nl === 'string' ? recipe.nl : '', ...(separate ? [] : characters.map(person => person.nl || person.tag))].filter(Boolean).join('. ');
      onBusyChange(true);
      try { result = await api.generate({ prompt, nl, characters, size: recipe.size === 'landscape' ? 'landscape' : 'portrait', save: true }); }
      finally { onBusyChange(false); }
      assertEnabled();
      if (!result.path) throw new Error('图片已生成，但柏宝绘没有保存成功。请检查柏宝绘的图库保存状态。');
      const image = { path: result.path, seed: result.seed };
      await store.updateImage(id, messageId, image);
      return { ...message.image, ...image };
    },
  };
}
