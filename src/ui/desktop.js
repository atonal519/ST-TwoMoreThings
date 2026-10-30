import { homeImage } from './home.js';
import { escape, icon } from './shared.js';

function realDateCalendar(now = new Date()) {
  const year = now.getFullYear(), month = now.getMonth(), date = now.getDate(), weekdays = ['一', '二', '三', '四', '五', '六', '日'];
  return { yearLabel: `${year}年`, monthName: `${month + 1}月`, today: `${month + 1}月${date}日 · 周${weekdays[(now.getDay() + 6) % 7]}`,
    columns: 7, leading: (new Date(year, month, 1).getDay() + 6) % 7, weekdays,
    days: Array.from({ length: new Date(year, month + 1, 0).getDate() }, (_, index) => ({ day: index + 1, isToday: index + 1 === date, items: [] })) };
}

function renderCalendarWidget(calendar, now) {
  const story = typeof calendar?.today === 'string' && calendar.today.trim() && Array.isArray(calendar.days) && calendar.days.some(day => day.isToday);
  if (!story) calendar = realDateCalendar(now);
  const todayIndex = calendar.days.findIndex(day => day.isToday);
  const index = Math.max(0, todayIndex);
  const start = Math.max(0, index - (index + calendar.leading) % calendar.columns);
  const week = calendar.days.slice(start, start + calendar.columns);
  const today = calendar.days[todayIndex];
  const names = today?.items.map(item => item.name).join(' · ') || '';
  const tag = story ? 'button' : 'section';
  return `<${tag} class="desktop-calendar" ${story ? 'type="button" data-action="open-calendar" aria-label="打开日历"' : 'aria-label="日历"'}>
    <span class="desktop-calendar-copy">
      <small>${escape(calendar.yearLabel)}</small>
      <strong>${escape(calendar.monthName)}</strong>
      <span>${escape(names || calendar.today)}</span>
    </span>
    <span class="desktop-week" style="--desktop-week-columns:${calendar.columns}">
      ${week.map(day => {
        const weekday = calendar.weekdays[(calendar.leading + day.day - 1) % calendar.columns];
        return `<span class="desktop-week-day ${day.isToday ? 'is-today' : ''}">
          ${weekday ? `<small>${escape(weekday)}</small>` : ''}<span>${day.day}</span>
          ${day.items.length ? '<i></i>' : ''}
        </span>`;
      }).join('')}
    </span>
  </${tag}>`;
}

export function renderDesktop(state, { apps, calendar, now }) {
  const image = homeImage(state);
  return `<img class="desktop-wallpaper ${image.custom ? 'is-custom' : ''}"
      src="${escape(image.src)}" alt="" draggable="false">
    <div class="desktop-content">
      ${renderCalendarWidget(calendar, now)}
      <nav class="desktop-apps" aria-label="桌面应用">
        ${apps.map(({ id, label }) => `<button type="button" class="desktop-app" data-tab="${id}" aria-label="${label}">
          <span class="desktop-app-icon desktop-app-${id}">${icon(id)}</span>
          <span>${label}</span>
        </button>`).join('')}
      </nav>
      <span class="desktop-page-dot" aria-hidden="true"></span>
    </div>`;
}
