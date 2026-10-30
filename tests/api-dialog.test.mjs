import test from 'node:test';
import assert from 'node:assert/strict';
import { createPhoneDialog } from '../src/ui/dialog.js';
import { openApiEditor } from '../src/ui/api-editor.js';
import { createApiSettings } from '../src/api.js';
import { createHarness as createApiHarness } from './harness.mjs';
function harness(){
 let doc;
 class Node{
  constructor(tag){this.tagName=tag;this.children=[];this.events={};this.dataset={};this.className='';this.attributes={};this.disabled=false;this.removed=false;this.textContent='';}
  append(...nodes){for(const node of nodes){this.children.push(node);node.parentNode=this;}}
  replaceChildren(...nodes){this.children=[];this.append(...nodes);}
  setAttribute(k,v){this.attributes[k]=String(v);}
  hasAttribute(k){return Object.hasOwn(this.attributes,k);}
  addEventListener(k,fn){(this.events[k]??=[]).push(fn);}
  remove(){this.removed=true;if(this.parentNode)this.parentNode.children=this.parentNode.children.filter(n=>n!==this);}
  getClientRects(){for(let node=this;node;node=node.parentNode)if(node.hidden||node.removed)return[];return[{}];}
  click(){return this.fire('click');}
  getRootNode(){return doc;}
  focus(){doc.activeElement=this;}
  matches(selector){return selector.split(',').some(raw=>{const s=raw.trim();return s.startsWith('.')?this.className.split(' ').includes(s.slice(1)):s.startsWith('#')?this.id===s.slice(1):this.tagName===s;});}
  querySelectorAll(selector){return this.children.flatMap(n=>[...(n.matches(selector)?[n]:[]),...n.querySelectorAll(selector)]);}
  querySelector(selector){return this.querySelectorAll(selector)[0]??null;}
  async fire(type,details={}){for(const fn of this.events[type]??[])await fn({target:this,preventDefault(){},stopPropagation(){},...details});}
  get classList(){return{contains:name=>this.className.split(' ').includes(name)}}
 }
 doc={activeElement:null,createElement:tag=>new Node(tag)};
 const mount=doc.createElement('main'),dialog=createPhoneDialog({mount,documentRef:doc});
 return{doc,mount,dialog,overlay:()=>mount.children[0],confirm:()=>mount.querySelectorAll('button').find(n=>n.className==='save-button'),content:()=>doc.createElement('form')};
}
const flush=()=>new Promise(resolve=>setImmediate(resolve));
test('phone custom awaits async submit, keeps errors and draft open, then closes only on success',async()=>{
 const h=harness(),form=h.content();let reject,ok=false;
 const result=h.dialog.custom({title:'API',content:form,confirmText:'保存',cancelText:'取消',submit:()=>ok?true:new Promise((_,fail)=>{reject=fail;})});
 const overlay=h.overlay(),click=h.confirm().fire('click');await flush();assert.equal(h.overlay(),overlay);assert.equal(h.confirm().disabled,true);
 reject(Error('保存失败'));await click;assert.equal(h.overlay(),overlay);assert.match(h.mount.querySelector('.phone-dialog-error').textContent,/保存失败/);assert.equal(h.confirm().disabled,false);
 ok=true;await h.confirm().fire('click');assert.equal(await result,true);assert.equal(h.mount.children.length,0);
});
test('phone custom retains old false/true sync semantics and late closed submit cannot close a newer dialog',async()=>{
 const h=harness();let allow=false;const first=h.dialog.custom({title:'同步',content:h.content(),confirmText:'保存',cancelText:'取消',submit:()=>allow});
 await h.confirm().fire('click');assert.equal(h.mount.children.length,1);allow=true;await h.confirm().fire('click');assert.equal(await first,true);
 let finish;const old=h.dialog.custom({title:'旧',content:h.content(),confirmText:'保存',cancelText:'取消',submit:()=>new Promise(resolve=>{finish=resolve;})});const clicking=h.confirm().fire('click');await flush();h.dialog.dispose();assert.equal(await old,false);
 const current=h.dialog.custom({title:'新',content:h.content(),confirmText:'保存',cancelText:'取消',submit:()=>true});const overlay=h.overlay();finish(true);await clicking;assert.equal(h.overlay(),overlay);await h.confirm().fire('click');assert.equal(await current,true);
});

test('dialog keyboard navigation skips hidden controls and composing Enter does not submit',async()=>{
 const h=harness(),form=h.content(),visible=h.doc.createElement('input'),hidden=h.doc.createElement('div'),hiddenInput=h.doc.createElement('input');hidden.hidden=true;hidden.append(hiddenInput);form.append(visible,hidden);
 let saves=0;const result=h.dialog.custom({title:'API',content:form,confirmText:'保存',cancelText:'取消',submit:()=>{saves++;return true;}});
 await h.overlay().fire('keydown',{key:'Tab',target:visible});assert.equal(h.doc.activeElement,h.mount.querySelector('.text-button'));
 await h.overlay().fire('keydown',{key:'Enter',target:visible,isComposing:true});await flush();assert.equal(saves,0);assert.equal(h.mount.children.length,1);
 await h.overlay().fire('keydown',{key:'Enter',target:visible,keyCode:229});await flush();assert.equal(saves,0);
 await h.overlay().fire('keydown',{key:'Enter',target:visible});await flush();assert.equal(saves,1);assert.equal(await result,true);
});

function editorSetup(settings,saveSettings){
 const h=createApiHarness({settings}),api=createApiSettings({host:h.host}),dom=harness();if(saveSettings)h.host.saveSettings=saveSettings;
 let config;const open=isNew=>openApiEditor({documentRef:dom.doc,dialog:{custom:options=>{config=options;return Promise.resolve(false);}},apiSettings:api,isNew});
 const field=id=>config.content.querySelector(`#api-editor-${id}`);
 return{h,api,open,field,config:()=>config};
}

test('new API form starts blank, cancellation writes nothing, and save creates only an unselected shared connection',async()=>{
 const settings={pocketPhone:{apiModel:'local'},'schedule-planner':{apiPresets:[{id:'old',name:'原连接',url:'https://old.invalid',key:'old-key',model:'old-model'}]}};
 const t=editorSetup(settings);t.open(true);for(const id of ['name','url','key','model'])assert.equal(t.field(id).value,'');t.config().onClose();assert.equal(t.h.settingsSaves,0);
 t.open(true);t.field('name').value=' 新连接 ';t.field('url').value='https://new.invalid';t.field('key').value='new-key';t.field('model').value='new-model';await t.config().submit();
 assert.equal(settings['schedule-planner'].apiPresets.length,2);assert.deepEqual(settings.pocketPhone,{apiModel:'local'});assert.equal(t.api.getSelected(),null);assert.equal(t.h.modelRequests.length,0);
});

test('editor keeps its captured target, blank key reads the latest credential, and switching sources does not overwrite the new local model',async()=>{
 const settings={pocketPhone:{apiSourceRef:{kind:'shared-preset',presetId:'a'},apiModel:'local-a'},'schedule-planner':{apiPresets:[{id:'a',name:'原A',url:'https://a.invalid',key:'a-key',model:'shared-a',foreign:{keep:true}},{id:'b',name:'原B',url:'https://b.invalid',key:'b-key',model:'shared-b'}]}};
 const t=editorSetup(settings);t.open(false);assert.equal(t.field('key').value,'');t.field('name').value='编辑A';t.field('url').value='https://draft-a.invalid';t.field('model').value='draft-a';
 settings['schedule-planner'].apiPresets[0].key='latest-a-key';await t.api.select({kind:'shared-preset',presetId:'b'});await t.config().submit();
 assert.deepEqual(settings.pocketPhone,{apiSourceRef:{kind:'shared-preset',presetId:'b'},apiModel:'shared-b'});assert.deepEqual(settings['schedule-planner'].apiPresets[0],{id:'a',name:'编辑A',url:'https://draft-a.invalid/v1',key:'latest-a-key',model:'shared-a',foreign:{keep:true}});
 settings['schedule-planner'].apiPresets=settings['schedule-planner'].apiPresets.filter(p=>p.id!=='a');await assert.rejects(t.config().submit(),/不存在/);assert.equal(settings['schedule-planner'].apiPresets.length,1);
});

test('failed new API save retains the form draft and retry creates exactly one connection',async()=>{
 const settings={pocketPhone:{}},t=editorSetup(settings);let fail=true;t.h.host.saveSettings=async()=>{if(fail)throw Error('synthetic');};t.open(true);
 for(const [id,value] of Object.entries({name:'待保存',url:'https://retry.invalid',key:'retry-key',model:'retry-model'}))t.field(id).value=value;
 await assert.rejects(t.config().submit(),/保存失败/);assert.equal(t.field('name').value,'待保存');assert.equal(settings['schedule-planner'],undefined);assert.deepEqual(settings.pocketPhone,{});
 fail=false;await t.config().submit();assert.equal(settings['schedule-planner'].apiPresets.length,1);assert.equal(settings['schedule-planner'].apiPresets[0].name,'待保存');assert.equal(t.api.getSelected(),null);
});

test('model search Enter stays a local draft and never submits the connection editor',async()=>{
 const settings={pocketPhone:{apiSourceRef:{kind:'shared-preset',presetId:'p'},apiModel:'own'},'schedule-planner':{apiPresets:[{id:'p',name:'原连接',url:'https://p.invalid',key:'p-key',model:'shared'}]}},t=editorSetup(settings);t.h.completion={models:['m']};t.open(false);
 await t.config().content.querySelectorAll('button').find(n=>n.textContent==='拉取模型').fire('click');const search=t.field('model-search'),before=structuredClone(settings);let stopped=false,prevented=false;
 await search.fire('keydown',{key:'Enter',preventDefault(){prevented=true;},stopPropagation(){stopped=true;}});if(!stopped)await t.config().submit();assert.equal(prevented,true);assert.equal(t.h.settingsSaves,0);assert.deepEqual(settings,before);
});
test('copy-name Enter saves only the unbound copy and leaves the original draft open',async()=>{
 const settings={pocketPhone:{apiSourceRef:{kind:'shared-preset',presetId:'p'},apiModel:'own'},'schedule-planner':{apiPresets:[{id:'p',name:'原连接',url:'https://p.invalid',key:'p-key',model:'shared'}]}},t=editorSetup(settings);t.open(false);const original=structuredClone(settings['schedule-planner'].apiPresets[0]),local=structuredClone(settings.pocketPhone);t.field('url').value='https://copy-enter.invalid';await t.config().content.querySelectorAll('button').find(n=>n.textContent==='另存为').fire('click');t.field('copy-name').value='Enter副本';let stopped=false;
 await t.field('copy-name').fire('keydown',{key:'Enter',preventDefault(){},stopPropagation(){stopped=true;}});await flush();if(!stopped)await t.config().submit();assert.equal(settings['schedule-planner'].apiPresets.length,2);assert.deepEqual(settings['schedule-planner'].apiPresets[0],original);assert.deepEqual(settings.pocketPhone,local);assert.equal(t.field('url').value,'https://copy-enter.invalid');
});
