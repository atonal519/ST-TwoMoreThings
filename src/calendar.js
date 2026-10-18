// 构画拥有日期与历法；手机只读取显示和本轮参考，不复制日历存档。
export function createCalendarReader({ apiProvider = () => globalThis.STSevenDaysCal } = {}) {
  const api = () => { const value = apiProvider(); return value?.apiVersion === 1 ? value : null; };
  return {
    month(monthOffset = 0) { return api()?.getPhoneCalendar?.({ monthOffset }) || null; },
    context(query) { return api()?.getPhoneCalendarContext?.({ query }) || null; },
  };
}

export const CALENDAR_PROMPT = 'calendar是构画已有的节日和纪念日，仅作可选话题线索。结合当前剧情、人物关系及各人实际知情判断是否提起，不因日历可见就让所有人知道私人纪念日，不强制提醒或安排活动；未来日期不代表庆祝或约定已经发生。';
