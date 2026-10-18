import { avatarSource, displayName } from '../profiles.js';

const icons = {
  fingerprint: '<g fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5"><path d="M7 16v-4.639c0-.51.1-.999.285-1.453M17 16v-3.185m-7.778-5.08A5.5 5.5 0 0 1 12 7c2.28 0 4.203 1.33 4.805 3.15M10 17v-2.177M14 17v-5.147C14 10.83 13.105 10 12 10s-2 .83-2 1.853v.794"/><path d="M12 22c5.523 0 10-4.477 10-10S17.523 2 12 2S2 6.477 2 12s4.477 10 10 10"/></g>',
  signal: '<path fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="m12 19.51l.01-.011M2 8c6-4.5 14-4.5 20 0M5 12c4-3 10-3 14 0M8.5 15.5c2.25-1.4 4.75-1.4 7 0"/>',
  wifi: '<path fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M12 19c0-4.2-2.8-7-7-7m14 7c0-8.4-5.6-14-14-14m0 14.01l.01-.011"/>',
  battery: '<g fill="none" stroke="currentColor" stroke-width="1.5"><path stroke-linecap="round" stroke-linejoin="round" d="M23 10v4"/><path d="M1 16V8a2 2 0 0 1 2-2h15a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2Z"/><path d="M4 14.4V9.6a.6.6 0 0 1 .6-.6h8.8a.6.6 0 0 1 .6.6v4.8a.6.6 0 0 1-.6.6H4.6a.6.6 0 0 1-.6-.6Z"/></g>',
  lock: '<rect x="6" y="10" width="12" height="11" rx="3"/><path d="M8 10V7a4 4 0 0 1 8 0v3M12 14v3"/>',
  calendar: '<path fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M16.5 5V3m-9 2V3M3.25 8h17.5M10 14h4M3 10.044c0-2.115 0-3.173.436-3.981a3.9 3.9 0 0 1 1.748-1.651C6.04 4 7.16 4 9.4 4h5.2c2.24 0 3.36 0 4.216.412c.753.362 1.364.94 1.748 1.65c.436.81.436 1.868.436 3.983v4.912c0 2.115 0 3.173-.436 3.981a3.9 3.9 0 0 1-1.748 1.651C17.96 21 16.84 21 14.6 21H9.4c-2.24 0-3.36 0-4.216-.412a3.9 3.9 0 0 1-1.748-1.65C3 18.128 3 17.07 3 14.955z"/>',
  smile: '<circle cx="12" cy="12" r="9"/><path d="M8 14q4 5 8 0M8 9h.01M16 9h.01"/>',
  location: '<path d="M19 10c0 5-7 11-7 11S5 15 5 10a7 7 0 1 1 14 0Z"/><circle cx="12" cy="10" r="2.5"/>',
  transfer: '<path d="M4 8h15l-4-4M20 16H5l4 4"/>',
  image: '<rect x="3" y="3" width="18" height="18" rx="3"/><circle cx="8" cy="8" r="1.5"/><path d="m3 17 6-5 4 3 4-5 4 5"/>',
  sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M2 12h2M20 12h2M5 5l1.5 1.5M17.5 17.5 19 19M5 19l1.5-1.5M17.5 6.5 19 5"/>',
  phone: '<g fill="none" stroke="currentColor" stroke-linejoin="round" stroke-width="1.5"><path stroke-linecap="round" d="m7 14l1.995-2.395c.637-.763.955-1.145 1.338-1.145s.702.382 1.338 1.145l.658.79c.636.763.954 1.145 1.338 1.145c.383 0 .701-.382 1.338-1.145L17 10"/><path d="M12 22c5.523 0 10-4.477 10-10S17.523 2 12 2S2 6.477 2 12c0 1.379.28 2.693.784 3.888c.279.66.418.99.436 1.24c.017.25-.057.524-.204 1.073L2 22l3.799-1.016c.549-.147.823-.22 1.073-.204c.25.018.58.157 1.24.436A10 10 0 0 0 12 22Z"/></g>',
  more: '<circle cx="4" cy="12" r="1"/><circle cx="12" cy="12" r="1"/><circle cx="20" cy="12" r="1"/>',
  trash: '<path d="M4 7h16M9 7V4h6v3M6 7l1 14h10l1-14M10 11v6M14 11v6"/>',
  settings: '<path d="m9.1 5 2.2-2.2a1 1 0 0 1 1.4 0L14.9 5H18a1 1 0 0 1 1 1v3.1l2.2 2.2a1 1 0 0 1 0 1.4L19 14.9V18a1 1 0 0 1-1 1h-3.1l-2.2 2.2a1 1 0 0 1-1.4 0L9.1 19H6a1 1 0 0 1-1-1v-3.1l-2.2-2.2a1 1 0 0 1 0-1.4L5 9.1V6a1 1 0 0 1 1-1Z"/><circle cx="12" cy="12" r="4"/>',
  arrow: '<path d="m14 5-7 7 7 7"/>',
  back: '<g fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5"><path d="M4.5 8H15s5 0 5 4.706C20 18 15 18 15 18H6.286"/><path d="M7.5 11.5L4 8l3.5-3.5"/></g>',
  next: '<path d="m9 5 7 7-7 7"/>',
  send: '<path d="m21 3-7 18-4-8-8-4 19-6ZM10 13 21 3"/>',
  play: '<path d="m9 5 10 7-10 7V5Z"/>',
  refresh: '<path fill="currentColor" d="M8.625 8.5h-4.5a1 1 0 0 1-1-1V3a1 1 0 0 1 2 0v3.5h3.5a1 1 0 0 1 0 2"/><path fill="currentColor" d="M21 13a1 1 0 0 1-1-1A7.995 7.995 0 0 0 5.08 8.001a1 1 0 0 1-1.731-1.002A9.995 9.995 0 0 1 22 12a1 1 0 0 1-1 1m-1.125 9a1 1 0 0 1-1-1v-3.5h-3.5a1 1 0 0 1 0-2h4.5a1 1 0 0 1 1 1V21a1 1 0 0 1-1 1"/><path fill="currentColor" d="M12 22A10.01 10.01 0 0 1 2 12a1 1 0 0 1 2 0a7.995 7.995 0 0 0 14.92 3.999a1 1 0 0 1 1.731 1.002A10.03 10.03 0 0 1 12 22"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  close: '<path d="m6 6 12 12M6 18 18 6"/>',
  'phone-close': '<path fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M9.172 14.828L12.001 12m2.828-2.828L12.001 12m0 0L9.172 9.172M12.001 12l2.828 2.828M12 22c5.523 0 10-4.477 10-10S17.523 2 12 2S2 6.477 2 12s4.477 10 10 10"/>',
  info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v6M12 7h.01"/>',
  home: '<path fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M17 21H7a4 4 0 0 1-4-4v-6.292a4 4 0 0 1 1.927-3.421l5-3.03a4 4 0 0 1 4.146 0l5 3.03A4 4 0 0 1 21 10.707V17a4 4 0 0 1-4 4m-8-4h6"/>',
  page: '<path d="M4 3h16v12l-7 6H4V3Zm9 18v-6h7"/>',
};
export const asset = name => new URL(`../../assets/${name}`, import.meta.url).href;
export const icon = name => ['messages', 'forum'].includes(name)
  ? `<span class="app-icon" style="--pp-app-icon:url('${asset(`${name}.svg`)}')" aria-hidden="true"></span>`
  : `<svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="${name === 'refresh' ? 'none' : 'currentColor'}" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${icons[name] || ''}</svg>`;
export const escape = value => String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);
export const refKey = ref => ref ? `${ref.kind}:${ref.presetId || ''}` : '';

export function avatar(contact, small = false) {
  const source = avatarSource(contact.avatar);
  return `<span class="avatar ${small ? 'avatar-small' : ''}" data-tone="${escape(contact.tone || 'blue')}" aria-hidden="true"><span>${escape(Array.from(displayName(contact))[0])}</span>${source ? `<img src="${escape(source)}" alt="" loading="lazy" referrerpolicy="no-referrer">` : ''}</span>`;
}
export function avatarEditor(person) {
  return `<div class="avatar-editor"><div class="profile-avatar">${avatar(person)}</div><div class="avatar-actions"><label class="avatar-picker">选择头像图片<input type="file" accept="image/*" aria-label="选择头像图片"></label>${action('remove-avatar', '移除头像', '', 'quiet-button')}</div></div>`;
}
export function action(name, label, iconName, className = '', disabled = false) {
  return `<button type="button" class="${className}" data-action="${name}" aria-label="${label}" ${disabled ? 'disabled' : ''}>${iconName ? icon(iconName) : ''}<span>${label}</span></button>`;
}
export function pageHeading(title, actions = '') {
  return `<header class="page-heading"><div class="page-title-row"><h1>${escape(title)}</h1><div class="heading-actions">${actions}</div></div></header>`;
}
export function empty(title, text, iconName = 'messages') {
  return `<div class="empty-state"><div class="empty-symbol">${icon(iconName)}</div><h2>${title}</h2>${text ? `<p>${text}</p>` : ''}</div>`;
}
