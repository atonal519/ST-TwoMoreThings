import { apiOptions, parseAdditionalParams, protectedApiParam } from './api-options.js';
const REASONING_MODEL = /^(?:openai\/)?(?:gpt-[56]|o[134])(?:$|[.-])/iu;
const failure = (message, transient = false) => Object.assign(new Error(message), { transient });
function abortable(task, signal) {
  return new Promise((resolve, reject) => {
    const abort = () => reject(signal.reason || new DOMException('Aborted', 'AbortError'));
    if (signal.aborted) return abort();
    signal.addEventListener('abort', abort, { once: true });
    Promise.resolve().then(() => { if (signal.aborted) return abort(); return task(); }).then(resolve, reject).finally(() => signal.removeEventListener('abort', abort));
  });
}
const textContent = value => typeof value === 'string' ? value : Array.isArray(value) ? value.filter(part => part?.type === 'text' && typeof part.text === 'string').map(part => part.text).join('\n') : '';
function checkResponse(value) {
  if (!value?.error) return;
  const status = Number(value.error.status || value.error.code || value.status);
  throw failure('生成失败，请检查所选连接的地址、密钥和模型。', status === 429 || status >= 500 && status < 600);
}
function completion(data) {
  checkResponse(data);
  if (['length', 'max_tokens'].includes(data?.choices?.[0]?.finish_reason)) throw failure('模型回答未完整返回，请稍后重试。');
  const text = textContent(data?.choices?.[0]?.message?.content ?? data?.choices?.[0]?.text);
  if (!text.trim()) throw failure('模型没有返回正文，请检查连接或稍后重试。');
  return text;
}
async function streamText(response, signal) {
  const reader = response.body?.getReader?.();
  if (!reader) throw failure('接口没有返回可读取的流式回答。');
  const decoder = new TextDecoder();
  let buffer = '', event = [], output = '', done = false, finished = false;
  const flush = () => {
    const payload = event.join('\n').trim(); event = [];
    if (!payload || done) return;
    if (payload === '[DONE]') { done = true; return; }
    let data;
    try { data = JSON.parse(payload); } catch { throw failure('接口返回的流式回答格式无效。'); }
    checkResponse(data);
    const choice = data?.choices?.[0];
    if (['length', 'max_tokens'].includes(choice?.finish_reason)) throw failure('模型回答未完整返回，请稍后重试。');
    if (choice?.finish_reason) finished = true;
    output += textContent(choice?.delta?.content ?? choice?.message?.content ?? choice?.text);
  };
  const line = value => {
    if (done || finished) return;
    value = value.replace(/\r$/, '');
    if (!value) flush();
    else if (value.startsWith('data:')) event.push(value.slice(5).replace(/^ /, ''));
  };
  try {
    while (!done && !finished) {
      let result;
      try { result = await abortable(() => reader.read(), signal); }
      catch (error) { if (signal.aborted) throw error; throw failure('生成连接已中断，请稍后重试。', true); }
      if (result.done) { buffer += decoder.decode(); if (buffer) line(buffer); flush(); break; }
      buffer += decoder.decode(result.value, { stream: true });
      const lines = buffer.split('\n'); buffer = lines.pop() || '';
      lines.forEach(line);
    }
  } finally {
    try { Promise.resolve(reader.cancel()).catch(() => {}); } catch {}
    try { reader.releaseLock(); } catch {}
  }
  if (!done && !finished) throw failure('流式回答已中断，请稍后重试。');
  if (!output.trim()) throw failure('模型没有返回正文，请检查连接或稍后重试。');
  return output;
}

export async function requestCompletion(host, selected, messages) {
  const config = { ...selected, ...apiOptions(selected) };
  const additional = parseAdditionalParams(config.tmtAdditionalParams);
  const temperature = config.tmtTemperature;
  const parameters = { ...(temperature !== undefined ? { temperature } : REASONING_MODEL.test(config.model.trim()) ? {} : { temperature: 0.8 }), ...additional };
  for (const key of config.excludeParams) if (!protectedApiParam(key)) { delete parameters[key]; delete additional[key]; }
  const body = { chat_completion_source: 'openai', reverse_proxy: config.url, proxy_password: config.key, model: config.model, messages, stream: config.stream, ...(Object.hasOwn(parameters, 'temperature') ? { temperature: parameters.temperature } : {}) };
  if (Object.keys(additional).length) {
    body.chat_completion_source = 'custom'; body.custom_url = config.url;
    body.custom_include_headers = JSON.stringify({ Authorization: `Bearer ${config.key}` });
    body.custom_include_body = JSON.stringify(additional);
    delete body.reverse_proxy; delete body.proxy_password;
  }
  if (config.excludeParams.includes('stream')) delete body.stream;
  const serialized = JSON.stringify(body);
  for (let attempt = 0; ; attempt++) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(new DOMException('Timeout', 'TimeoutError')), config.timeoutSec * 1000);
    try {
      let response;
      try { response = await abortable(() => host.request('/api/backends/chat-completions/generate', { method: 'POST', body: serialized, signal: controller.signal }), controller.signal); }
      catch (error) { if (controller.signal.aborted) throw error; throw failure('生成请求未能连接，请检查酒馆和接口连接后重试。', true); }
      if (!response.ok) {
        try { Promise.resolve(response.body?.cancel?.()).catch(() => {}); } catch {}
        throw failure(`生成失败（${response.status}），请检查所选连接的地址、密钥和模型。`, response.status === 429 || response.status >= 500);
      }
      const contentType = String(response.headers?.get?.('content-type') || '').split(';')[0].trim().toLowerCase();
      if (body.stream === true && contentType !== 'application/json' && !contentType.endsWith('+json')) return await streamText(response, controller.signal);
      let data;
      try { data = await abortable(() => response.json(), controller.signal); }
      catch (error) { if (controller.signal.aborted) throw error; throw failure('接口没有返回可读取的回答，请检查所选模型后重试。'); }
      return completion(data);
    } catch (reason) {
      const error = controller.signal.aborted ? failure('生成等待超时，请稍后重试。', true) : reason;
      if (!error.transient || attempt >= config.tmtRetryCount) throw error;
      clearTimeout(timer);
      await new Promise(resolve => setTimeout(resolve, Math.min(800 * 2 ** attempt, 2000)));
    } finally { clearTimeout(timer); }
  }
}
