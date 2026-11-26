import { parseJsonObject } from '../api.js';
import { createUuid } from '../uuid.js';
import { assertIdentitySnapshot, identitySource } from '../identities.js';
import { assertDiaryMode, assertDiaryOwner, diaryHistory, diaryOwners } from './store.js';
import { DIARY_PROMPTS } from './prompts.js';

const text = value => typeof value === 'string' ? value.trim() : '';
export function createDiaryService({ store, contextReader, modelClient, isCurrentChat = () => true }) {
  function assertChat() { if (!isCurrentChat()) throw new Error('聊天已切换，请重新打开手机。'); }
  return {
    owners: () => diaryOwners(store.read()),
    async generate(ownerId, mode = 'finished') {
      assertDiaryMode(mode); assertChat(); assertDiaryOwner(store.read(), ownerId);
      const input = await contextReader.readForDiary(ownerId);
      const state = await store.readSaved(), identities = input[identitySource];
      const validate = () => { assertChat(); assertIdentitySnapshot(store.read(), identities); assertDiaryOwner(store.read(), ownerId); };
      validate();
      const answer = parseJsonObject(await modelClient.complete({ system: DIARY_PROMPTS[mode], messages: [{ role: 'user', content: JSON.stringify({ ...input, mode, history: diaryHistory(state, ownerId, mode) }) }] }));
      const body = text(answer.text);
      if (!body) throw new Error('没有可保存的日记正文，请重新点击生成。');
      const entry = { id: createUuid(), title: text(answer.title), text: body,
        ...(text(answer.translation) ? { translation: text(answer.translation) } : {}),
        ...(text(answer.titleTranslation) ? { titleTranslation: text(answer.titleTranslation) } : {}),
        storyDate: input.storyTime?.date || '', timeLabel: input.storyTime?.time || '' };
      return store.appendDiary(ownerId, mode, entry, validate);
    },
  };
}
