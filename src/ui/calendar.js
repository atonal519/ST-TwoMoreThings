import { action, escape, icon, pageHeading } from './shared.js';

export function renderCalendar(_state, { ui, calendar }) {
  const heading = pageHeading('日历', calendar ? action('calendar-today', '回到本月', '', 'quiet-button') : '');
  if (!calendar) return heading;
  const selected = calendar.days.find(day => day.day === ui.calendarDay);
  const days = selected ? [selected] : calendar.days;
  const year = calendar.yearLabel;
  const events = [...new Map(days.flatMap(day => day.items).map(item => [item.id, item])).values()];
  const monthTitle = [calendar.title === calendar.eraLabel ? '' : calendar.title, year].filter(Boolean).join(' · ');
  const dayButtons = calendar.days.map(day => {
    const dots = [...new Set(day.items.map(item => item.type))];
    const label = `${escape(day.label)}${day.items.length ? `：${escape(day.items.map(item => item.name).join('、'))}` : ''}`;
    return `<button type="button" class="calendar-day${day.isToday ? ' is-today' : ''}${selected?.day === day.day ? ' is-selected' : ''}"
        data-calendar-day="${day.day}" aria-label="${label}" aria-pressed="${selected?.day === day.day}" ${day.isToday ? 'aria-current="date"' : ''}>
      <span>${day.day}</span>
      <span class="calendar-dots" aria-hidden="true">${dots.map(type => `<i class="calendar-dot ${type}"></i>`).join('')}</span>
    </button>`;
  }).join('');
  const eventCards = events.map(item => `<article class="calendar-event ${item.type}">
    <span class="calendar-event-mark" aria-hidden="true"></span>
    <div>
      <div class="calendar-event-title">
        <h3>${escape(item.name)}</h3>
        <small>${item.type === 'festival' ? '节日' : '纪念日'}</small>
      </div>
      <span class="calendar-event-date">${escape(item.date)}${item.days > 1 ? ` · ${item.days}天` : ''}</span>
      ${item.note ? `<p>${escape(item.note)}</p>` : ''}
    </div>
  </article>`).join('');
  return `${heading}
    <section class="calendar-sheet">
      <header class="calendar-month">
        <button type="button" class="icon-button" data-action="calendar-prev" aria-label="上个月">${icon('arrow')}</button>
        <div>
          <small>${escape(monthTitle)}</small>
          <h2>${escape(calendar.monthName)}</h2>
        </div>
        <button type="button" class="icon-button" data-action="calendar-next" aria-label="下个月">${icon('next')}</button>
      </header>
      <div class="calendar-grid" style="--calendar-columns:${calendar.columns}" aria-label="${escape(calendar.monthName)}月历">
        ${calendar.weekdays.map(day => `<span class="calendar-weekday">${escape(day)}</span>`).join('')}
        ${Array.from({ length: calendar.leading }, () => '<span aria-hidden="true"></span>').join('')}
        ${dayButtons}
      </div>
      <div class="calendar-detail-head">
        <span>${escape(selected?.label || '本月')}</span>
        ${selected ? action('calendar-month', '看全月', '', 'quiet-button') : ''}
      </div>
      <div class="calendar-events">${eventCards}</div>
    </section>`;
}
