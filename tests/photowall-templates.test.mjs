import test from 'node:test';
import assert from 'node:assert/strict';
import { createPhotoWallTemplateSettings } from '../src/photowall-templates.js';
import { createHarness } from './harness.mjs';

test('default is a read-only projection and templates are shared across chats without other settings changes', async () => {
 const h=createHarness({settings:{pocketPhone:{apiModel:'keep',fontCssUrl:'font'},other:{keep:true}}});
 const settings=createPhotoWallTemplateSettings({host:h.host}), before=structuredClone(h.context.extensionSettings);
 const initial=settings.read(); assert.equal(initial.templates[0].name,'双格亲吻');assert.match(initial.templates[0].prompt,/上格.*下格/s);
 initial.templates[0].prompt='not a write';assert.notEqual(settings.read().templates[0].prompt,'not a write');
 assert.equal(h.settingsSaves,0);assert.deepEqual(h.context.extensionSettings,before);
 const raw='  单张，两人并肩看海。\n2::evening light::  ';
 const saved=await settings.save(null,{name:' 看海 ',prompt:raw});assert.equal(saved.prompt,raw);assert.equal(saved.name,'看海');
 assert.equal(settings.read().selectedId,saved.id);assert.equal(settings.read().templates.length,2);
 h.context.chatId='another';const shared=createPhotoWallTemplateSettings({host:h.host});assert.equal(shared.read().selectedId,saved.id);
 assert.equal(h.context.extensionSettings.pocketPhone.apiModel,'keep');assert.deepEqual(h.context.extensionSettings.other,{keep:true});
 const copy=await shared.save(null,{...saved,name:'另存'});assert.notEqual(copy.id,saved.id);
 await settings.select(saved.id);await settings.save(saved.id,{name:'新名',prompt:'English, 1.5::rain::\n'});
 assert.equal(shared.read().templates.find(t=>t.id===saved.id).prompt,'English, 1.5::rain::\n');
 for(const template of settings.read().templates)await settings.remove(template.id);
 assert.deepEqual(settings.read(),{templates:[],selectedId:''});assert.deepEqual(createPhotoWallTemplateSettings({host:h.host}).read(),{templates:[],selectedId:''});
 assert.equal(h.metadataSaves,0);
});

test('blank drafts, stale edits and failed saves do not replace saved templates or unrelated settings', async () => {
 const h=createHarness(), settings=createPhotoWallTemplateSettings({host:h.host});
 for(const draft of [{name:'',prompt:'a'},{name:'a',prompt:' \n '},{name:'a',prompt:null}])await assert.rejects(settings.save(null,draft),/名称|提示词/);
 assert.equal(h.settingsSaves,0);assert.equal(h.context.extensionSettings.pocketPhone,undefined);
 await assert.rejects(settings.save('deleted',{name:'a',prompt:'x'}),/移除/);
 const before=structuredClone(h.context.extensionSettings);h.host.saveSettings=async()=>{throw Error('offline')};
 await assert.rejects(settings.save(null,{name:'a',prompt:'x'}),/保存失败/);assert.deepEqual(h.context.extensionSettings,before);
});
