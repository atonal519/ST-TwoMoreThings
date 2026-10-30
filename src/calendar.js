// 构画拥有日期与历法；手机只读取显示和本轮参考，不复制日历存档。
export function createCalendarReader({ apiProvider = () => globalThis.STSevenDaysCal } = {}) {
  const api = () => { const value = apiProvider(); return value?.apiVersion === 1 ? value : null; };
  return {
    month(monthOffset = 0) { return api()?.getPhoneCalendar?.({ monthOffset }) || null; },
    context(query, expectedChatId) { return api()?.getPhoneCalendarContext?.({ query, ...(expectedChatId !== undefined ? { expectedChatId } : {}), includeSchedules: true }) || null; },
  };
}

export const CALENDAR_PROMPT = 'calendar.events是构画已有的节日、生日、纪念日和自定日程；calendar.schedules若有，是筛选出的约定待办、周期或持续状态，仅作可选话题与人物背景。刻度的现状与dueInfo/elapsedDays以scheduleAsOf及各条startedAt/observedAt/dueAt为观察、来源和日期基准，不拿calendar.today替换截止基准；未知日期不推算，不凭周期长度编下一次日期。活跃或未了结记录不证明剧情中尚未完成，计划和未来日期不代表已经发生，相关人物relatedPeople也不等于知情人。按当前正文、各发言者亲历或明确获知的依据决定采用及是否适合说出；不因材料可见就让所有人知道私人事项，不强制提醒、安排活动或制造催办。';
