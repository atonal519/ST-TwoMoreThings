import { diaryEntries } from '../diary/store.js';
import { action, avatar, empty, escape, pageHeading, renderBilingual } from './shared.js';

const inspected = ui => ui.view === 'inspect-diary';
const ownerId = ui => inspected(ui) ? ui.inspectOwnerId : ui.diaryOwnerId;
const modeOf = ui => inspected(ui) && ui.diaryMode === 'draft' ? 'draft' : 'finished';
const disclosureKey = (id, mode, entryId) => JSON.stringify([id, mode, entryId]);
const revisedText = value => escape(value).replace(/~~([^\n]+?)~~/gu, '<del>$1</del>');

function ownerLabels(owners) {
  const base = person => {
    if (owners.filter(row => row.name === person.name).length < 2) return person.name;
    const note = [person.nickname, person.privateOwner ? '查手机' : '短信'].filter(Boolean).join(' · ');
    return `${person.name}（${note}）`;
  };
  const labels = owners.map(base);
  return labels.map((label, index) => labels.filter(value => value === label).length > 1
    ? `${label.slice(0, -1)} · ${labels.slice(0, index + 1).filter(value => value === label).length}）` : label);
}

export function renderDiary(state, { ui, busy, diary }) {
  const owners = diary?.owners() || [], id = ownerId(ui), owner = owners.find(person => person.id === id), mode = modeOf(ui);
  const labels = ownerLabels(owners);
  const working = busy.has(`diary:${id}:${mode}`), label = mode === 'draft' ? '废稿' : '日记';
  const heading = pageHeading('日记', action('diary-generate', working ? '生成中…' : `生成${label}`, 'plus', 'quiet-button', !owner || working));
  const selector = inspected(ui)
    ? owner ? `<div class="diary-owner">${avatar(owner, true)}<span>${escape(owner.name)}</span></div>` : ''
    : `<select id="diary-owner" data-diary-owner aria-label="日记主人"><option value="" ${!owner ? 'selected' : ''}>选择角色</option>${owners.map((person, index) => `<option value="${escape(person.id)}" ${person.id === id ? 'selected' : ''}>${escape(labels[index])}</option>`).join('')}</select>`;
  const tabs = inspected(ui) ? `<nav class="diary-tabs" aria-label="日记类型">${[['finished', '日记'], ['draft', '废稿']].map(([kind, name]) => `<button type="button" data-action="diary-mode" data-diary-mode="${kind}" aria-pressed="${kind === mode}">${name}</button>`).join('')}</nav>` : '';
  const toolbar = `<div class="diary-toolbar">${selector}${tabs}</div>`;
  if (!owner) return `${heading}${toolbar}${empty('选择日记主人', owners.length ? '从上方选择想读的角色。缺少的人物可在「查手机 → 添加人物」中补充。' : '在「查手机 → 添加人物」中保存角色后，就能在这里选择。', 'diary')}`;
  const entries = diaryEntries(state, id, mode).slice().reverse();
  const pages = entries.map((entry, index) => {
    const key = disclosureKey(id, mode, entry.id), open = ui.diaryDisclosure?.[key] ?? index === 0;
    const date = [entry.storyDate, entry.timeLabel].filter(Boolean).join(' ');
    return `<details class="diary-entry" data-diary-entry="${escape(key)}" data-diary-rendered-open="${open}" ${open ? 'open' : ''}><summary>${date ? `<time>${escape(date)}</time>` : ''}<strong>${renderBilingual(entry.title || '未题名', entry.titleTranslation, escape)}</strong></summary><div class="diary-article"><p>${renderBilingual(entry.text, entry.translation, mode === 'draft' ? revisedText : escape)}</p></div></details>`;
  }).join('');
  return `${heading}${toolbar}<section class="diary-archive" data-kind="${mode}" aria-label="${escape(owner.name)}的${label}">${pages}</section>${!entries.length ? empty(mode === 'draft' ? '还没有废稿' : '还没有日记', `点击右上角，生成${owner.name ? escape(owner.name) + '的' : ''}第一篇${label}。`, 'diary') : ''}`;
}

// Only the explicit generate action reaches the service; navigation keeps no archive writes.
export function createDiaryController({ ui, diary, root, showPage, render, perform, isCurrentChat }) {
  return {
    capture() {
      for (const entry of root.querySelectorAll('.diary-entry[data-diary-entry]')) {
        if (String(entry.open) !== entry.dataset.diaryRenderedOpen) (ui.diaryDisclosure ||= {})[entry.dataset.diaryEntry] = entry.open;
      }
    },
    change(event) {
      if (event.target.id !== 'diary-owner') return false;
      ui.diaryOwnerId = event.target.value; render(); return true;
    },
    click(button) {
      if (button.dataset.action === 'inspect-open-diary') { ui.diaryMode = 'finished'; showPage('inspect-diary'); return true; }
      if (button.dataset.action === 'diary-mode' && inspected(ui)) { ui.diaryMode = button.dataset.diaryMode === 'draft' ? 'draft' : 'finished'; render(); return true; }
      if (button.dataset.action !== 'diary-generate') return false;
      if (!isCurrentChat()) return true;
      const id = ownerId(ui), mode = modeOf(ui);
      if (diary?.owners().some(owner => owner.id === id)) void perform(`diary:${id}:${mode}`, () => diary.generate(id, mode));
      return true;
    },
  };
}
