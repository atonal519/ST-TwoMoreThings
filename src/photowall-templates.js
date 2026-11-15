import { createUuid } from './uuid.js';

const DEFAULT_TEMPLATE = {
  id: 'photowall-template:double-kiss', name: '双格亲吻',
  prompt: '2::2koma, 2 panels, vertical comic strip, white panel borders, sequential storytelling, 2people, couple, upper body, both characters clearly visible.\n双格竖向情侣合照，白色分格边框，连续画面，两人上半身清楚可见。\n上格：人物B从侧面吻人物A脸颊，人物A面向镜头。\n下格：人物A主动吻人物B嘴唇。\n两人都愿意参与，各自保有意愿和回应方式；神情、视线、亲吻强度和手部动作结合人设自然构思。不要对白或画面文字。',
};

// 模板是本用户跨聊天的偏好；旧设置只读呈现默认，不因开页写入或复活已移除的模板。
export function createPhotoWallTemplateSettings({ host }) {
  function read() {
    const settings = host.readSettings().pocketPhone;
    if (!Object.hasOwn(settings || {}, 'photoWallTemplates')) return { templates: [{ ...DEFAULT_TEMPLATE }], selectedId: DEFAULT_TEMPLATE.id };
    const value = settings.photoWallTemplates;
    return { templates: (value?.templates || []).map(row => ({ ...row })), selectedId: value?.selectedId || '' };
  }
  async function write(value) {
    const settings = host.readSettings(), previous = settings.pocketPhone;
    const next = settings.pocketPhone = { ...previous, photoWallTemplates: value };
    try { await host.saveSettings(); }
    catch {
      if (settings.pocketPhone === next) {
        if (previous === undefined) delete settings.pocketPhone;
        else settings.pocketPhone = previous;
      }
      throw new Error('提示词方案保存失败，请重试。');
    }
  }
  return {
    read,
    async save(id, draft) {
      const name = String(draft.name || '').trim(), prompt = draft.prompt;
      if (!name) throw new Error('请填写方案名称。');
      if (typeof prompt !== 'string' || !prompt.trim()) throw new Error('请填写提示词。');
      const value = read();
      if (id && !value.templates.some(row => row.id === id)) throw new Error('这套提示词方案已移除，请重新选择。');
      const template = { id: id || `photowall-template:${createUuid()}`, name, prompt };
      await write({ templates: id ? value.templates.map(row => row.id === id ? template : row) : [...value.templates, template], selectedId: template.id });
      return template;
    },
    async select(id) {
      const value = read();
      if (!value.templates.some(row => row.id === id)) throw new Error('这套提示词方案已移除，请重新选择。');
      if (value.selectedId === id && Object.hasOwn(host.readSettings().pocketPhone || {}, 'photoWallTemplates')) return;
      await write({ ...value, selectedId: id });
    },
    async remove(id) {
      const value = read(), templates = value.templates.filter(row => row.id !== id);
      if (templates.length === value.templates.length) return;
      await write({ templates, selectedId: value.selectedId === id ? templates[0]?.id || '' : value.selectedId });
    },
  };
}
