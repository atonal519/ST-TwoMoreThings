import test from 'node:test';
import assert from 'node:assert/strict';
import { createHarness } from './harness.mjs';
import { createPhoneStore } from '../src/store.js';
import { createPhoneImageService } from '../src/phone-images.js';
import { createImageFiles } from '../src/image-files.js';
const path='/user/images/fixture/bbi_context_bounds-new.png';
function setup(kind,{shared=false,failCleanup=false}={}){
 const h=createHarness({metadata:{pocketPhone:{contacts:[{id:'a',name:'甲'}],groups:[],conversations:{a:[{id:'p',role:'assistant',type:'image',text:'图片',image:{description:'原图'}}],...(shared?{other:[{id:'shared',type:'image',image:{description:'已引用',path}}]}:{})},forum:{posts:[{id:'p',author:'匿名',content:'原图',image:{description:'原图'},comments:[]}]},social:{posts:[{id:'p',authorId:'a',text:'图',image:{description:'原图'},comments:[]}],npcs:[]},liangshi:{accounts:[{id:'u',name:'甲',handle:'a',contactId:'a'}],posts:[{id:'p',authorId:'u',text:'图',image:{description:'原图'},comments:[],reposts:[]}]}}}});
 const target=h.host.captureChat(),store=createPhoneStore({target}),removed=[];let finish,models=0,draws=0;
 const files=createImageFiles({host:{request:async(endpoint,init)=>{removed.push({endpoint,path:JSON.parse(init.body).path});return new Response(null,{status:failCleanup?500:200});}}});
 const service=createPhoneImageService({store,files,modelClient:{complete:async()=>{models++;return '{"prompt":"window","characters":[]}';}},apiProvider:()=>({apiVersion:1,getBackendStatus:()=>({configured:true}),getCharacters:()=>({characters:[]}),generate:()=>{draws++;return new Promise(resolve=>{finish=resolve;});}})});
 const generate=()=>kind==='sms'?service.generate('a','p'):kind==='social'?service.generatePost('p'):kind==='forum'?service.generateForum('p'):service.generateLiangshi('p');
 const change=async fn=>kind==='sms'?(fn(store.read().conversations.a).length?store.updateImage('a','p',fn(store.read().conversations.a)[0].image):store.deleteMessage('a','p')):kind==='social'?store.updateSocial(data=>({...data,posts:fn(data.posts)})):kind==='forum'?store.updateForum(data=>({...data,posts:fn(data.posts)})):store.updateLiangshi(data=>({...data,posts:fn(data.posts)}));
 return {h,target,store,removed,generate,change,counters:()=>({models,draws}),wait:async()=>{while(!finish)await new Promise(resolve=>setImmediate(resolve));},finish:()=>finish({path,seed:9})};
}
for(const kind of ['sms','social','liangshi','forum'])for(const scenario of ['deleted','changed','save-failed'])test(`${kind}: ${scenario} attachment cleans only its new unreferenced image and sidecar`,async()=>{
 const x=setup(kind);const pending=x.generate();await x.wait();
 if(scenario==='deleted')await x.change(()=>[]);else if(scenario==='changed')await x.change(rows=>rows.map(row=>({...row,image:{description:'新描述'}})));else x.h.saveFailure=Error('save failed');
 x.finish();await assert.rejects(pending,/已删除|已修改|已更新|保存失败|save failed/);assert.deepEqual(x.removed,[{endpoint:'/api/images/delete',path},{endpoint:'/api/files/delete',path:'/user/files/bbi_context_bounds-new.json'}]);assert.deepEqual(x.counters(),{models:1,draws:1});assert.equal(JSON.stringify(x.store.read()).includes(path),false);
});
for(const kind of ['sms','social','liangshi','forum'])test(`${kind}: a failed attachment does not delete a result already used elsewhere`,async()=>{
 const x=setup(kind,{shared:true});const pending=x.generate();await x.wait();await x.change(()=>[]);x.finish();await assert.rejects(pending);assert.deepEqual(x.removed,[]);assert.ok(JSON.stringify(x.store.read()).includes(path));
});
test('failed cleanup preserves the attachment failure and reports file cleanup failure rather than success',async()=>{
 const x=setup('liangshi',{failCleanup:true});const pending=x.generate();await x.wait();await x.change(()=>[]);x.finish();await assert.rejects(pending,error=>/已删除/.test(error.message)&&/清理失败/.test(error.message));assert.equal(x.removed.length,2);
});

for(const kind of ['sms','social','liangshi','forum'])test(`${kind}: successful attachment retains the generated image without cleanup or extra calls`,async()=>{
 const x=setup(kind);const pending=x.generate();await x.wait();x.finish();assert.equal((await pending).path,path);assert.deepEqual(x.removed,[]);assert.equal(x.h.metadataSaves,1);assert.deepEqual(x.counters(),{models:1,draws:1});assert.ok(JSON.stringify(x.h.persistedMetadata.pocketPhone).includes(path));
});
