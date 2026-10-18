// 构画负责剧情天气；接口暂缺时仅提供固定装饰，不联网、不反向写入剧情。
export function readLockWeather(api = globalThis.STSevenDaysCal) {
  if (api?.apiVersion === 1 && typeof api.getPhoneSnapshot === 'function') {
    const snapshot = api.getPhoneSnapshot();
    if (snapshot?.weather?.text) return { text: String(snapshot.weather.text), temperature: String(snapshot.weather.temperature || ''), source: 'gouhua' };
  }
  return { text: '晴', temperature: '22°C', source: 'decoration' };
}
