import { homeImage } from './home.js';
import { escape, icon } from './shared.js';
import { readPhotoWallImage } from '../photowall.js';
import { cleanWallCrop } from '../wall-crop.js';
import { imageSource } from '../image-files.js';

const secondaryAppIds = ['inspect-phone', 'favorites'];

function realDateCalendar(now = new Date()) {
  const year = now.getFullYear(), month = now.getMonth(), date = now.getDate(), weekdays = ['一', '二', '三', '四', '五', '六', '日'];
  return { yearLabel: `${year}年`, monthName: `${month + 1}月`, today: `${month + 1}月${date}日 · 周${weekdays[(now.getDay() + 6) % 7]}`,
    dateLabel: `${month + 1}月${date}日`, columns: 7, leading: (new Date(year, month, 1).getDay() + 6) % 7, weekdays,
    days: Array.from({ length: new Date(year, month + 1, 0).getDate() }, (_, index) => ({ day: index + 1, isToday: index + 1 === date, items: [] })) };
}

function renderCalendarWidget(calendar, now, weather) {
  const story = typeof calendar?.today === 'string' && calendar.today.trim() && Array.isArray(calendar.days) && calendar.days.some(day => day.isToday);
  if (!story) calendar = realDateCalendar(now);
  const todayIndex = calendar.days.findIndex(day => day.isToday);
  const index = Math.max(0, todayIndex);
  const start = Math.min(Math.max(0, index - (index + calendar.leading) % calendar.columns), Math.max(0, calendar.days.length - calendar.columns));
  const week = calendar.days.slice(start, start + calendar.columns);
  const today = calendar.days[todayIndex];
  const names = today?.items.map(item => item.name).join(' · ') || '';
  const tag = story ? 'button' : 'section';
  const weekdayFor = day => calendar.weekdays[(calendar.leading + day.day - 1) % calendar.columns] || '';
  const year = calendar.yearLabel || '';
  const remainder = year && calendar.today.startsWith(year) ? calendar.today.slice(year.length).trim() : '';
  const date = story ? remainder || calendar.today : calendar.dateLabel;
  const yearLabel = story ? remainder && year : year;
  const longDate = Array.from(date).length > 5 && !/^\d{1,2}月\d{1,2}日$/.test(date);
  return `<${tag} class="desktop-calendar desktop-widget-frame" style="--desktop-week-columns:${calendar.columns}" ${story ? 'type="button" data-action="open-calendar" aria-label="打开日历"' : 'aria-label="日历"'} title="${escape([calendar.today, names].filter(Boolean).join(' · '))}">
    <span class="desktop-calendar-header">
      <span class="desktop-calendar-primary"><span class="desktop-calendar-date${longDate ? ' is-long-date' : ''}">${escape(date)}</span><time class="desktop-calendar-time"></time></span>
      <span class="desktop-calendar-secondary"><span class="desktop-calendar-year">${escape(yearLabel || '')}</span>${weather ? `<span class="desktop-calendar-weather" title="${weather.source === 'decoration' ? '装饰天气' : '构画剧情天气'}">${icon('sun')}<strong>${escape(weather.temperature)}</strong><small>${escape(weather.text)}</small></span>` : ''}</span>
    </span>
    <span class="desktop-week">
      ${week.map(day => `<span class="desktop-week-day ${day.isToday ? 'is-today' : ''}">
          ${weekdayFor(day) ? `<small>${escape(weekdayFor(day))}</small>` : ''}<span>${day.day}</span>
          ${day.items.length ? '<i></i>' : ''}
        </span>`).join('')}
    </span>
  </${tag}>`;
}

function renderAppGrid(apps) {
  return `<nav class="desktop-apps" aria-label="桌面应用">${apps.map(({ id, label, icon: image = id, action }) => `<button type="button" class="desktop-app" ${action ? `data-action="${escape(action)}"` : `data-tab="${escape(id)}"`} aria-label="${escape(label)}">
    <span class="desktop-app-icon desktop-app-${escape(id)}">${icon(image)}</span><span>${escape(label)}</span>
  </button>`).join('')}</nav>`;
}

export function renderDesktop(state, { apps, calendar, now, weather, owner, ui = {} }) {
  const image = homeImage(state);
  const wallpaper = `<img class="desktop-wallpaper ${image.custom ? 'is-custom' : ''}" src="${escape(image.src)}" alt="" draggable="false">`;
  if (owner) return `${wallpaper}<div class="desktop-content inspect-owned-content" aria-label="${escape(owner.name)}的手机桌面">
    <section class="inspect-phone-identity"><h1>${escape(owner.needsName ? '旧手机记录' : `${owner.name}的手机`)}</h1>
      <div class="home-clock round-clock inspect-owner-clock" data-clock-digits role="img" aria-label="当前时间"><span></span><span></span><span></span><span></span></div><span class="home-date"></span>
    </section>${renderAppGrid(apps)}</div>`;
  const page = ui.desktopPage || 0;
  const dots = `<nav class="desktop-page-dots" aria-label="桌面分页">${[0, 1].map(index => `<button type="button" class="desktop-page-dot" data-desktop-target="${index}" aria-label="第${index + 1}屏" aria-current="${index === page ? 'page' : 'false'}"></button>`).join('')}</nav>`;
  const photo = readPhotoWallImage(state);
  const second = `<button type="button" class="photowall-desktop-photo desktop-widget-frame" data-action="album-open" aria-label="管理照片墙" ${photo ? `data-wall-crop="${escape(JSON.stringify(cleanWallCrop(photo.crop)))}"` : ''}>${photo ? `<img class="wall-crop-image" src="${escape(imageSource(photo.path))}" data-phone-image="${escape(photo.path)}" alt="${escape(photo.description)}" draggable="false">` : '<span>照片墙</span>'}</button>
    ${[0, 1, 2, 3].map((slot) => `<div class="photowall-app-slot" data-slot="${slot}">${slot < secondaryAppIds.length ? renderAppGrid(apps.filter(app => app.id === secondaryAppIds[slot])) : `<div class="desktop-app photowall-reserved-app" aria-label="应用预留"><span class="desktop-app-icon">${icon('plus')}</span><span>预留</span></div>`}</div>`).join('')}
    <div class="photowall-widget-slot desktop-widget-frame">小组件预留</div>`;
  return `${wallpaper}<div class="desktop-pages" data-desktop-pages>${[0, 1].map(index => `<section class="desktop-page" data-desktop-page="${index}" aria-label="桌面第${index + 1}屏"><div class="desktop-content"><div class="desktop-grid">${index === 0 ? renderCalendarWidget(calendar, now, weather) + renderAppGrid(apps.filter(app => !secondaryAppIds.includes(app.id))) : second}</div>${dots}</div></section>`).join('')}</div>`;
}
