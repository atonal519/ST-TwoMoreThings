import { createUuid } from './uuid.js';
import { imagePath } from './image-files.js';
import { parseJsonObject } from './api.js';
import { characterKey } from './photowall.js';
import { cameraRole, cleanCameraPreset, readCamera } from './camera-presets.js';

const CAMERA_SCENE_PROMPT = "你为明确选中的人物列表润色用户的合照提示词。用户模板决定构图、格数、动作、场景、风格和权重；中文、英文及混合文本都按原意理解，完整保留明确要求及权重语法，不擅自改成双格、情侣或亲吻，不因缺少格数就加分格。人物槽位与输入people逐项对应。固定外貌以输入appearance为据，程序会将其原样传给柏宝绘；润色不自行改写或新增脸型、眼型、五官比例、年龄感、发色、瞳色或肤色，固定档案由程序拼入对应角色栏，输出的全局画面和角色动态tag/nl都不重复固定外貌。根据现有人设补充可被画出来的动作、距离、姿态、视线和自然神情，体现各自不同的性格与主动回应方式，不额外编造过去事件。模板未明确要求时，不将害羞、意外或紧张自动放大成夸张瞪眼、抿成薄唇、僵硬受惊或扭曲五官，也不把所有人统一成害羞脸。用户模板明确指定的造型、夸张神情和权重仍按原意保留。\n英文prompt与中文nl必须表达同一画面，英文不额外加入中文没有的动作、心理或关系判断。全局prompt/nl只写人数、共同关系、格数、环境、构图和共同行为。每个人自己的服装、左右位置、视线、动作和自然神情分别写入characters中该人的tag/nl，姓名和固定外貌由程序对应。characters按画面从左到右、再从上到下排列。多格按首格顺序，后续格的位置变化写入该角色栏。role必须对应输入people给定的role，每个选中槽位恰好一次。A/B兼容原两人模板，后续槽位按3、4等编号。多格时在同一角色栏按上格、下格描述各自行为。角色tag为英文，nl为对应中文，空动态字段可写空字符串。来源资料仅用于选中的人物。";

function sceneRequest(people, scene) {
  if (!Array.isArray(scene.characters) || scene.characters.length !== people.length) throw new Error('相机提示词没有返回完整的角色画面，请重试。');
  const roles = people.map((_, index) => cameraRole(index)), seen = new Set();
  const characters = scene.characters.map(character => {
    const index = roles.indexOf(character?.role);
    if (index < 0 || seen.has(character.role) || typeof character.tag !== 'string' || typeof character.nl !== 'string') throw new Error('相机提示词的角色槽位无法对应，请重试。');
    seen.add(character.role);
    const person = people[index];
    return { name: person.name, tag: [person.tag, character.tag].filter(value => value.trim()).join(', '), nl: [person.nl.trim() ? person.nl : person.tag, character.nl].filter(value => value.trim()).join('\n') };
  });
  return { prompt: scene.prompt, nl: scene.nl, characters };
}

export function createCameraService({ store, providers, contextReader, modelClient, legacyTemplates, assertEnabled = () => {}, isCurrentChat = () => true, onBusyChange = () => {}, readTime = () => ({}) }) {
  function current() {
    assertEnabled();
    if (!isCurrentChat()) throw new Error('聊天已切换，请重新打开手机。');
  }
  const read = (state = store.read()) => readCamera(state, Object.hasOwn(state, 'camera') ? {} : legacyTemplates?.read() || {});
  function apiForCamera() {
    const api = providers.resolveBaibai().api;
    if (api?.apiVersion !== 1 || typeof api.generate !== 'function' || typeof api.getBackendStatus !== 'function') throw new Error('请安装并开启支持公开接口的柏宝绘。');
    return api;
  }
  function catalog(api) {
    const people = api.getCharacters?.()?.characters;
    if (!Array.isArray(people)) throw new Error('柏宝绘人物目录暂时不可读取，请稍后重试。');
    return people;
  }
  return {
    readPresets: () => read(),
    readCharacters() { current(); return catalog(apiForCamera()).map(({ name, scope }) => ({ name, scope: scope || '' })); },
    async savePreset(id, draft) {
      current(); const preset = cleanCameraPreset(id, structuredClone(draft));
      await store.updateCamera(state => {
        current(); const value = read(state);
        if (id && !value.presets.some(row => row.id === id)) throw new Error('这套照片预设已移除，请重新选择。');
        return { ...value, presets: id ? value.presets.map(row => row.id === id ? preset : row) : [...value.presets, preset], selectedId: preset.id };
      });
      return preset;
    },
    selectPreset(id) { current(); return store.updateCamera(state => {
      current(); const value = read(state);
      if (!value.presets.some(row => row.id === id)) throw new Error('这套照片预设已移除。');
      return { ...value, selectedId: id };
    }); },
    removePreset(id) { current(); return store.updateCamera(state => {
      current(); const value = read(state), presets = value.presets.filter(row => row.id !== id);
      return { presets, selectedId: value.selectedId === id ? presets[0]?.id || '' : value.selectedId };
    }); },
    setWall(path, crop) { current(); return store.setPhotoWall(path, crop, current); },
    async generate(id) {
      current();
      const selected = read().presets.find(row => row.id === id);
      if (!selected) throw new Error('请先新建并选择照片预设。');
      const preset = structuredClone(selected), template = preset.prompts.find(row => row.id === preset.promptId), group = preset.groups.find(row => row.id === preset.groupId);
      if (!template?.prompt?.trim()) throw new Error('请在预设中选择并填写提示词。');
      const api = apiForCamera(), initialStatus = api.getBackendStatus();
      if (!initialStatus?.configured) throw new Error(initialStatus?.reason || '请先在柏宝绘配置生图渠道。');
      const refs = group?.people || [], entries = refs.length ? catalog(api) : [];
      const people = refs.map(ref => {
        const matches = entries.filter(person => characterKey(person) === characterKey(ref));
        if (matches.length !== 1 || !matches[0].tag?.trim()) throw new Error(`人物「${ref.name}」在柏宝绘目录中缺失或存在重名，请重新选择。`);
        const person = matches[0]; return { name: person.name, scope: person.scope || '', tag: person.tag, nl: person.nl || '' };
      });
      let scene = { prompt: template.prompt, nl: '', characters: people.map(({ name, tag, nl }) => ({ name, tag, nl })) };
      if (people.length && preset.mode === 'polish') {
        const input = await contextReader.readForPhotoWall(people); current();
        const shape = { prompt: '共用英文画面提示词，保留模板权重', nl: '对应共用中文画面', characters: people.map((_, index) => ({ role: cameraRole(index), tag: '此人的英文场景标签或空', nl: '此人的中文场景描述或空' })) };
        const answer = await modelClient.complete({ system: `${CAMERA_SCENE_PROMPT}\n只输出JSON，结构为${JSON.stringify(shape)}。characters可按画面顺序排列。`, messages: [{ role: 'user', content: JSON.stringify({ ...input, template }) }] }); current();
        let planned;
        try { planned = parseJsonObject(answer); } catch { throw new Error('相机提示词没有返回可读取的中英文画面，请重试。'); }
        if (typeof planned.prompt !== 'string' || !planned.prompt.trim() || typeof planned.nl !== 'string' || !planned.nl.trim()) throw new Error('相机提示词没有返回完整的中英文画面，请重试。');
        scene = sceneRequest(people, planned);
      }
      const status = api.getBackendStatus(); current();
      if (!status?.configured) throw new Error(status?.reason || '柏宝绘生图配置已变化，请检查后重试。');
      const request = { ...scene, size: 'portrait', save: true };
      if (status.supportsCharacters !== true && people.length) {
        request.prompt = [...scene.characters.map(person => person.tag), scene.prompt].join(', ');
        request.nl = [...scene.characters.map(person => person.nl || person.tag), scene.nl].filter(value => value.trim()).join('\n');
      }
      const clock = readTime(), createdAt = new Date().toISOString();
      onBusyChange(true); let result;
      try { result = await api.generate(request); } finally { onBusyChange(false); }
      const path = imagePath(result?.path);
      if (!path) throw new Error('图片已生成，但柏宝绘没有返回已保存的图片地址，请检查柏宝绘保存结果。');
      const assertResultChat = () => { if (!isCurrentChat()) throw new Error('图片已保存在柏宝绘，聊天已切换，未登记到小手机。'); };
      assertResultChat();
      const description = people.length ? `${people.map(person => person.name).join(' 与 ')} · ${preset.name}` : preset.name;
      const photo = { id: `camera-photo:${createUuid()}`, path, description, prompt: request.prompt, nl: request.nl, preset: { id: preset.id, name: preset.name, mode: people.length ? preset.mode : 'direct' }, template, ...(group ? { group: structuredClone(group) } : {}), people, seed: result.seed, provider: 'baibai', createdAt, storyDate: clock.date || '', timeLabel: clock.time || '' };
      const publishedAt = [photo.storyDate, photo.timeLabel].filter(Boolean).join(' ');
      const source = { kind: 'camera', id: photo.id, label: `相机 · ${preset.name}`, createdAt, publishedAt, dateLabel: photo.storyDate, prompt: photo.prompt, nl: photo.nl, preset: photo.preset, template, ...(photo.group ? { group: photo.group } : {}), people, seed: photo.seed, provider: 'baibai' };
      await store.saveGeneratedPhoto({ path, description, timeLabel: publishedAt, dateLabel: photo.storyDate, sources: [source] }, state => { current(); return state; }, assertResultChat);
      return photo;
    },
  };
}
