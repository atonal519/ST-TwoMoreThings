import test from 'node:test';
import assert from 'node:assert/strict';
import { createHarness } from './harness.mjs';
import { createApiSettings, createModelClient } from '../src/api.js';
function setup(options={},hostKind='native') {
 const row={id:'p',url:'https://offline.invalid/v1',key:'offline-key',model:'gpt-6',...options};
 const h=createHarness({hostKind,settings:{pocketPhone:{apiSourceRef:{kind:'shared-preset',presetId:'p'}},'schedule-planner':{apiPresets:[row]}}});
 const api=createApiSettings({host:h.host});return {h,row,api,client:createModelClient({host:h.host,sourceProvider:api})};
}
for(const hostKind of ['native','luker']) test(`${hostKind}: explicit zero temperature and JSON reach CUSTOM with protected authentication and exclusions`,async()=>{
 const {h,client}=setup({tmtTemperature:0,tmtAdditionalParams:'{"top_p":0.7,"max_tokens":12}',excludeParams:['max_tokens','model','messages','stream','key'],stream:true},hostKind);
 await client.complete({system:'test',messages:[]});const body=h.modelRequests[0].body;
 assert.equal(body.chat_completion_source,'custom');assert.equal(body.temperature,0);assert.equal(Object.hasOwn(body,'stream'),false);assert.equal(body.model,'gpt-6');
 assert.deepEqual(JSON.parse(body.custom_include_body),{top_p:0.7});assert.deepEqual(JSON.parse(body.custom_include_headers),{Authorization:'Bearer offline-key'});assert.equal(body.custom_url,'https://offline.invalid/v1');
});

test('SSE decodes split UTF-8 CRLF and multiline events and returns only a completed response',async()=>{
 const {h,client}=setup({stream:true});
 const bytes=new TextEncoder().encode('data: {"choices":[{"delta":{"content":"你好"}}]}\r\n\r\ndata: {"choices":\r\ndata: [{"delta":{"content":"世界"},"finish_reason":"stop"}]}\r\n\r\ndata: [DONE]\r\n\r\n');
 h.host.request=async()=>new Response(new ReadableStream({start(controller){for(let i=0;i<bytes.length;i+=3)controller.enqueue(bytes.slice(i,i+3));controller.close();}}),{headers:{'content-type':'text/event-stream'}});
 assert.equal(await client.complete({system:'x',messages:[]}), '你好世界');
});

test('invalid additional JSON is rejected before saves or requests',async()=>{
 for(const text of ['[1]','{','{"messages":[]}','{"stream":true}','{"x":{"__proto__":1}}','{"seed":1e999}']){
  const {h,api,client,row}=setup();await assert.rejects(api.saveCurrent({url:row.url,model:row.model,tmtAdditionalParams:text}),/JSON|字段|覆盖|数值/);assert.equal(h.settingsSaves,0);
  row.tmtAdditionalParams=text;await assert.rejects(client.complete({system:'x',messages:[]}),/JSON|字段|覆盖|数值/);assert.equal(h.modelRequests.length,0);
 }
});

test('only saved positive retry counts retry transient failures with an unchanged request snapshot',async()=>{
 for(const retry of [0,2]){
  const {h,client,row}=setup({tmtRetryCount:retry});const bodies=[];let calls=0;
  h.host.request=async(_path,init)=>{bodies.push(init.body);row.model='later-model';calls++;if(calls<3)return new Response(null,{status:503});return Response.json({choices:[{message:{content:'complete'}}]});};
  if(retry)assert.equal(await client.complete({system:'x',messages:[]}), 'complete');else await assert.rejects(client.complete({system:'x',messages:[]}),/503/);
  assert.equal(calls,retry+1);assert.equal(new Set(bodies).size,1);
 }
 for(const kind of ['network','429']){
  const {h,client}=setup({tmtRetryCount:1});let calls=0;h.host.request=async()=>{if(++calls===1){if(kind==='network')throw new TypeError('secret provider failure');return new Response(null,{status:429});}return Response.json({choices:[{message:{content:'ok'}}]});};
  assert.equal(await client.complete({system:'x',messages:[]}), 'ok');assert.equal(calls,2);
 }
});

test('format failures, interrupted SSE and permanent HTTP errors never retry or return partial content',async()=>{
 for(const response of [()=>new Response(null,{status:401}),()=>new Response('invalid',{headers:{'content-type':'application/json'}}),()=>new Response('data: {"choices":[{"delta":{"content":"partial"}}]}\n\n',{headers:{'content-type':'text/event-stream'}})]){
  const {h,client}=setup({stream:true,tmtRetryCount:3});let calls=0;h.host.request=async()=>{calls++;return response();};
  await assert.rejects(client.complete({system:'x',messages:[]}));assert.equal(calls,1);
 }
});

test('timeout covers a stalled response body and cleans the reader, using the original per-attempt duration',async()=>{
 const {h,client}=setup({stream:true,timeoutSec:5,tmtRetryCount:1});let calls=0,cancelled=0;const timers=[];
 h.host.request=async()=>{calls++;return new Response(new ReadableStream({pull:()=>new Promise(()=>{}),cancel(){cancelled++;}}),{headers:{'content-type':'text/event-stream'}});};
 const original=globalThis.setTimeout;globalThis.setTimeout=(callback,ms)=>{timers.push(ms);return original(callback,3);};
 try{await assert.rejects(client.complete({system:'x',messages:[]}),/超时/);}finally{globalThis.setTimeout=original;}
 assert.equal(calls,2);assert.equal(cancelled,2);assert.deepEqual(timers,[5000,800,5000]);
});

test('clearing overrides deletes only TMT fields and JSON excluded to empty retains the original proxy',async()=>{
 const {h,api,client,row}=setup({tmtTemperature:0,tmtAdditionalParams:'{"top_p":0.7}',qqjTemperature:0.4,stream:true});
 await api.saveCurrent({tmtTemperature:'',tmtAdditionalParams:'{}'});assert.equal(Object.hasOwn(h.context.extensionSettings['schedule-planner'].apiPresets[0],'tmtTemperature'),false);assert.equal(api.resolve().tmtRetryCount,0);
 const saved=h.context.extensionSettings['schedule-planner'].apiPresets[0];saved.tmtAdditionalParams='{"top_p":0.7}';saved.excludeParams=['top_p','stream','custom_url'];
 await client.complete({system:'x',messages:[]});assert.equal(h.modelRequests[0].body.chat_completion_source,'openai');assert.equal(Object.hasOwn(h.modelRequests[0].body,'stream'),false);assert.equal(saved.qqjTemperature,0.4);
});


test('additional host-shaped fields stay exclusively in CUSTOM include body',async()=>{
 const {h,client}=setup({tmtAdditionalParams:'{"custom_prompt_post_processing":"strict","seed":12}'});
 await client.complete({system:'x',messages:[]});const body=h.modelRequests[0].body;
 assert.equal(Object.hasOwn(body,'custom_prompt_post_processing'),false);assert.equal(Object.hasOwn(body,'seed'),false);assert.deepEqual(JSON.parse(body.custom_include_body),{custom_prompt_post_processing:'strict',seed:12});
});

test('finish_reason completes an SSE connection that stays open, while unfinished EOF is rejected',async()=>{
 for(const complete of [true,false]){
  const {h,client}=setup({stream:true,tmtRetryCount:2});let cancelled=0,calls=0;
  h.host.request=async()=>{calls++;return new Response(new ReadableStream({start(c){c.enqueue(new TextEncoder().encode('data: '+JSON.stringify({choices:[{delta:{content:'完整内容'},...(complete?{finish_reason:'stop'}:{})}]})+'\n\n'));if(!complete)c.close();},cancel(){cancelled++;}}),{headers:{'content-type':'text/event-stream'}});};
  if(complete){assert.equal(await client.complete({system:'x',messages:[]}), '完整内容');assert.equal(cancelled,1);}else await assert.rejects(client.complete({system:'x',messages:[]}),/中断/);
  assert.equal(calls,1);
 }
});

test('retries are opt-in for transient transport only and retain the original saved request',async()=>{
 for(const retries of [0,2]){
  const {h,row,client}=setup({tmtRetryCount:retries});const bodies=[];
  h.host.request=async(_path,request)=>{bodies.push(request.body);row.model='changed';if(bodies.length<=2)return new Response(null,{status:503});return Response.json({choices:[{message:{content:'ok'}}]});};
  if(retries)assert.equal(await client.complete({system:'x',messages:[]}), 'ok');else await assert.rejects(client.complete({system:'x',messages:[]}),/503/);
  assert.equal(bodies.length,retries?3:1);assert.equal(new Set(bodies).size,1);
 }
 for(const response of [new Response('invalid',{headers:{'content-type':'application/json'}}),new Response(null,{status:401})]){
  const {h,client}=setup({tmtRetryCount:2});let calls=0;h.host.request=async()=>{calls++;return response;};await assert.rejects(client.complete({system:'x',messages:[]}));assert.equal(calls,1);
 }
});


test('invalid multipart content never becomes a transport retry',async()=>{
 for(const stream of [false,true]){
  const {h,client}=setup({stream,tmtRetryCount:2});let calls=0;
  h.host.request=async()=>{calls++;return stream ? new Response('data: {"choices":[{"delta":{"content":[null]},"finish_reason":"stop"}]}\n\n',{headers:{'content-type':'text/event-stream'}}) : Response.json({choices:[{message:{content:[null]}}]});};
  await assert.rejects(client.complete({system:'x',messages:[]}),/没有返回正文/);assert.equal(calls,1);
 }
});


test('excluding stream also switches decoding to the ordinary JSON path',async()=>{
 const {h,client}=setup({stream:true,excludeParams:['stream']});
 h.host.request=async(_path,request)=>{assert.equal(Object.hasOwn(JSON.parse(request.body),'stream'),false);return new Response('{"choices":[{"message":{"content":"ok"}}]}',{headers:{'content-type':'text/plain'}});};
 assert.equal(await client.complete({system:'x',messages:[]}), 'ok');
});
