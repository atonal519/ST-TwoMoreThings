import { createUuid } from './uuid.js';
import { imagePath } from './image-files.js';
import { parseJsonObject } from './api.js';

export function readPhotoWall(state) {
  const wall = state.photoWall || { schemes: [], photos: [], activeSchemeId: '', desktopPhotoId: '' };
  const photos = wall.photos.filter(photo => !photo.missing);
  // 旧版失效标记只读时不占位，下一次正常照片墙保存再落盘清理。
  return photos.length === wall.photos.length ? wall : { ...wall, photos, desktopPhotoId: photos.some(photo => photo.id === wall.desktopPhotoId) ? wall.desktopPhotoId : '' };
}
export const characterKey = person => JSON.stringify([person.name, person.scope || '']);
const characterRef = person => ({ name: String(person?.name || '').trim(), scope: person?.scope || '' });

const PHOTO_WALL_SCENE_PROMPT = "你为明确选中的A/B两人润色用户的合照提示词。用户模板决定构图、格数、动作、场景、风格和权重；中文、英文及混合文本都按原意理解，完整保留明确要求及权重语法，不擅自改成双格、情侣或亲吻，不因缺少格数就加分格。固定为这两位人物。根据现有人设补充可被画出来的微动作、视线、神情、距离和姿态，各自保有人格与回应方式；不统一套脸红、受惊或被动，不额外编造过去事件。\n英文prompt与中文nl必须表达同一画面，英文不额外加入中文没有的动作、心理或关系判断。只用人物A/人物B或character A/character B标识人，姓名与固定外貌由程序对应，不自行音译或改名。来源资料仅用于选中两人。\n只输出JSON：{\"prompt\":\"完整英文画面提示词，保留模板权重\",\"nl\":\"对应完整中文画面\"}。";

// 模型理解模板和人设；程序只给两位人物建立明确的原名对应。
export function photoWallPrompt(people, scene) {
  const [a, b] = people.map(person => person.name);
  return { prompt: `character A (${a}), character B (${b}), ${scene.prompt}`, nl: `人物A是${a}，人物B是${b}。${scene.nl}` };
}

export function createPhotoWallService({ store, providers, contextReader, modelClient, templateSettings, assertEnabled = () => {}, isCurrentChat = () => true, onBusyChange = () => {}, readTime = () => ({}) }) {
  function current() {
    assertEnabled();
    if (!isCurrentChat()) throw new Error('聊天已切换，请重新打开手机。');
  }
  function apiForWall() {
    const api = providers.resolveBaibai().api;
    if (api?.apiVersion !== 1 || typeof api.getCharacters !== 'function' || typeof api.generate !== 'function') throw new Error('请安装并开启支持公开接口的柏宝绘。');
    return api;
  }
  function catalog(api) {
    const people = api.getCharacters()?.characters;
    if (!Array.isArray(people)) throw new Error('柏宝绘人物目录暂时不可读取，请重新打开照片墙。');
    return people;
  }
  return {
    readTemplates: () => templateSettings.read(),
    saveTemplate(id, draft) { current(); return templateSettings.save(id, draft); },
    selectTemplate(id) { current(); return templateSettings.select(id); },
    removeTemplate(id) { current(); return templateSettings.remove(id); },
    readCharacters() { current(); return catalog(apiForWall()).map(characterRef); },
    async saveScheme(id, draft) {
      current();
      const name = String(draft.name || '').trim(), people = (draft.people || []).map(characterRef);
      if (!name) throw new Error('请填写方案名称。');
      if (people.length !== 2 || people.some(person => !person.name)) throw new Error('请选择人物A和人物B。');
      if (characterKey(people[0]) === characterKey(people[1])) throw new Error('请选择两位不同的人物。');
      const scheme = { id: id || `photowall:${createUuid()}`, name, people };
      await store.updatePhotoWall(wall => {
        current();
        if (id && !wall.schemes.some(row => row.id === id)) throw new Error('这套人物方案已移除，请重新选择。');
        return { ...wall, schemes: id ? wall.schemes.map(row => row.id === id ? scheme : row) : [...wall.schemes, scheme], activeSchemeId: scheme.id };
      });
      return scheme;
    },
    selectScheme(id) { current(); return store.updatePhotoWall(wall => {
      current(); if (!wall.schemes.some(row => row.id === id)) throw new Error('这套人物方案已移除。');
      return { ...wall, activeSchemeId: id };
    }); },
    removeScheme(id) { current(); return store.updatePhotoWall(wall => {
      current(); const schemes = wall.schemes.filter(row => row.id !== id);
      return { ...wall, schemes, activeSchemeId: wall.activeSchemeId === id ? schemes[0]?.id || '' : wall.activeSchemeId };
    }); },
    setDesktop(id) { current(); return store.updatePhotoWall(wall => {
      current(); const photo = wall.photos.find(row => row.id === id);
      if (!photo) throw new Error('这张照片地址已失效，请选择另一张照片。');
      return { ...wall, desktopPhotoId: id };
    }); },
    async generate(id) {
      current();
      const scheme = readPhotoWall(store.read()).schemes.find(row => row.id === id);
      if (!scheme) throw new Error('请先新建并选择人物方案。');
      const templates = templateSettings.read(), selected = templates.templates.find(row => row.id === templates.selectedId);
      if (!selected) throw new Error('请先新建并选择提示词方案。');
      const template = { ...selected };
      const api = apiForWall(), initialStatus = api.getBackendStatus();
      if (!initialStatus?.configured) throw new Error(initialStatus?.reason || '请先在柏宝绘配置生图渠道。');
      const entries = catalog(api);
      const people = scheme.people.map(ref => {
        const matches = entries.filter(person => characterKey(person) === characterKey(ref));
        if (matches.length !== 1 || !matches[0].tag?.trim()) throw new Error(`人物「${ref.name}」在柏宝绘目录中缺失或存在重名，请重新选择人物。`);
        const person = matches[0]; return { ...characterRef(person), tag: person.tag, nl: person.nl || '' };
      });
      const input = await contextReader.readForPhotoWall(people);
      current();
      const answer = await modelClient.complete({ system: PHOTO_WALL_SCENE_PROMPT, messages: [{ role: 'user', content: JSON.stringify({ ...input, template }) }] });
      current();
      let sceneResult;
      try { sceneResult = parseJsonObject(answer); }
      catch { throw new Error('合照提示词没有返回可读取的中英文画面，请重试。'); }
      if (typeof sceneResult.prompt !== 'string' || !sceneResult.prompt.trim() || typeof sceneResult.nl !== 'string' || !sceneResult.nl.trim()) throw new Error('合照提示词没有返回完整的中英文画面，请重试。');
      const status = api.getBackendStatus();
      if (!status?.configured) throw new Error(status?.reason || '柏宝绘生图配置已变化，请检查后重试。');
      const scene = photoWallPrompt(people, sceneResult), characters = people.map(({ name, tag, nl }) => ({ name, tag, nl }));
      const request = { ...scene, characters, size: 'portrait', save: true };
      if (status.supportsCharacters !== true) {
        request.prompt = [...people.map(person => person.tag), scene.prompt].join(', ');
        request.nl = [...people.map(person => person.nl || person.tag).filter(Boolean), scene.nl].join('\n');
      }
      const clock = readTime(), createdAt = new Date().toISOString();
      onBusyChange(true);
      let result;
      try { result = await api.generate(request); }
      finally { onBusyChange(false); }
      const path = imagePath(result?.path);
      if (!path) throw new Error('图片已生成，但柏宝绘没有返回已保存的图片地址，请检查柏宝绘保存结果。');
      const assertResultChat = () => { if (!isCurrentChat()) throw new Error('图片已保存在柏宝绘，聊天已切换，未登记到小手机。'); };
      assertResultChat();
      const photo = { id: `photowall-photo:${createUuid()}`, path, prompt: request.prompt, nl: request.nl, template, people, schemeId: scheme.id, schemeName: scheme.name, seed: result.seed, provider: 'baibai', createdAt, storyDate: clock.date || '', timeLabel: clock.time || '' };
      const publishedAt = [photo.storyDate, photo.timeLabel].filter(Boolean).join(' ');
      const albumPhoto = { path, description: `${people.map(person => person.name).join(' 与 ')} · 合照`, timeLabel: publishedAt, dateLabel: photo.storyDate, sources: [{ kind: 'photowall', id: photo.id, label: `照片墙 · ${scheme.name}`, createdAt, publishedAt, dateLabel: photo.storyDate, prompt: photo.prompt, nl: photo.nl, template: photo.template, people: photo.people, seed: photo.seed, provider: 'baibai' }] };
      // 当前聊天未变时保留已落盘照片；宿主只支持保存活动聊天，切聊后仅保留柏宝绘原文件。
      await store.saveGeneratedPhoto(albumPhoto, state => {
        current(); const wall = readPhotoWall(state);
        return { ...state, photoWall: { ...wall, photos: [...wall.photos, photo] } };
      }, assertResultChat);
      return photo;
    },
  };
}
