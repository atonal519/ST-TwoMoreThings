import { findSticker } from './stickers.js';

const text = value => typeof value === 'string' ? value.trim() : '';
const states = { pending: '待收款', accepted: '已收下', returned: '已退回' };

export function messageText(message) {
  switch (message.type) {
    case 'sticker': return `[表情：${findSticker(message.stickerId)?.label || '贴纸'}]`;
    case 'location': return `[定位：${message.location.name}${message.location.address ? `，${message.location.address}` : ''}]`;
    case 'transfer': return `[转账：${message.transfer.amount} ${message.transfer.currency || 'CNY'}${message.transfer.note ? `，${message.transfer.note}` : ''}；${states[message.transfer.status] || states.pending}]`;
    case 'image': return `[图片：${message.image.description}]`;
    default: return message.text || '';
  }
}

export function normalizeContent(item) {
  if (typeof item === 'string') return item.trim() ? { text: item.trim() } : null;
  if (!item || typeof item !== 'object') return null;
  const plain = text(item.text ?? item.content ?? item.message), translation = text(item.translation ?? item.translatedText);
  let content;
  if (item.type === 'sticker' && findSticker(item.stickerId)) content = { type: 'sticker', stickerId: item.stickerId };
  if (item.type === 'location' && text(item.location?.name)) content = { type: 'location', location: { name: text(item.location.name), address: text(item.location.address) } };
  if (item.type === 'transfer') {
    const value = String(item.transfer?.amount ?? '').trim();
    if (/^\d+(?:\.\d{1,2})?$/.test(value) && Number(value) > 0) content = { type: 'transfer', transfer: { amount: Number(value).toFixed(2), currency: text(item.transfer.currency) || 'CNY', note: text(item.transfer.note), recipientId: text(item.transfer.recipientId), status: 'pending' } };
  }
  if (item.type === 'image' && text(item.image?.description)) content = { type: 'image', image: { description: text(item.image.description) } };
  if (content) return { ...content, text: messageText(content) };
  return plain ? { text: plain, ...(translation ? { translation } : {}) } : null;
}

export function contextMessage(message) {
  return { ...(message.speakerId ? { speakerId: message.speakerId } : { role: message.role }), text: messageText(message),
    ...(message.translation ? { translation: message.translation } : {}),
    ...(message.type === 'transfer' ? { transferId: message.id, recipientId: message.transfer.recipientId, status: message.transfer.status } : {}),
  };
}

export const RICH_MESSAGES_PROMPT = `可按场景自然使用以下消息，勿为展示功能强行发送：
表情：{"type":"sticker","stickerId":"从stickers目录原样选择id"}；定位：{"type":"location","location":{"name":"地点名","address":"剧情内地址或空"}}；转账：{"type":"transfer","transfer":{"amount":"金额数字","currency":"CNY等币种","note":"简短备注","recipientId":"私聊填@user，群聊填收款成员id"}}；图片：{"type":"image","image":{"description":"真实发来照片的可绘制画面描述，写清画面人物、动作、物品和环境"}}。图片卡仅表示照片内容，点开才生图，不生成图片地址或绘图标签。
收到用户待收款的转账，可在transferActions中返回{"transferId":"原消息id","status":"accepted或returned"}；仅处理收款人是自己的转账，不捏造票据，不把收款说成新转账。群聊的每条transferActions另带speakerId。普通消息仍用text和可选translation。`;
