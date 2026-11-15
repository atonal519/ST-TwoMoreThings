import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFileSync, existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { resolve, extname } from 'node:path';
const { chromium } = createRequire(process.env.POCKET_PLAYWRIGHT_PACKAGE || '/tmp/st-tools-browser/package.json')('playwright-core');
const root = resolve(new URL('..', import.meta.url).pathname), evidence = resolve(process.env.PHOTOWALL_EVIDENCE || '/tmp/photowall-evidence');
mkdirSync(evidence, { recursive: true });
const browser = await chromium.launch({ executablePath: process.env.POCKET_CHROMIUM, headless: true, args: ['--no-sandbox'] });
const errors = [], checks = [], layouts = [];
const check = (actual, expected, name) => { assert.deepEqual(actual, expected, name); checks.push(name); };
const approx = (a, b, label) => check(Math.abs(a - b) < 0.1, true, label);
const readHorizontalCalendar = calendar => {
  const rect = node => { const r = node.getBoundingClientRect(); return { x:r.x, right:r.right, y:r.y, bottom:r.bottom, width:r.width, height:r.height }; };
  const text = node => { const range = document.createRange(); range.selectNodeContents(node); return rect(range); };
  const box = rect(calendar), week=calendar.querySelector('.desktop-week'), date=calendar.querySelector('.desktop-calendar-date'), time=calendar.querySelector('time'), year=calendar.querySelector('.desktop-calendar-year'), weather=calendar.querySelector('.desktop-calendar-weather'), weekdays=[...week.querySelectorAll('small')];
  const walker=document.createTreeWalker(calendar,NodeFilter.SHOW_TEXT); let allTextContained=true;
  while(walker.nextNode()) { const node=walker.currentNode; if(!node.textContent.trim())continue; const r=text(node); if(r.x<box.x-.1||r.right>box.right+.1||r.y<box.y-.1||r.bottom>box.bottom+.1)allTextContained=false; }
  const dates=[...week.querySelectorAll('.desktop-week-day > span')].map(node=>Number(node.textContent));
  const primary=rect(calendar.querySelector('.desktop-calendar-primary')), secondary=rect(calendar.querySelector('.desktop-calendar-secondary'));
  return { box, primary, secondary, week:rect(week), date:text(date), dateText:date.textContent, time:text(time), year:year.textContent?text(year):null, yearText:year.textContent, weather:weather?rect(weather):null, weatherText:weather?text(weather.querySelector('small')):null,
    first:text(weekdays[0]), last:text(weekdays.at(-1)), today:rect(week.querySelector('.is-today > span')), dates, allTextContained,
    horizontal:weekdays.every(node=>getComputedStyle(node).writingMode==='horizontal-tb'), longDate:date.classList.contains('is-long-date'), dateSize:getComputedStyle(date).fontSize, timeSize:getComputedStyle(time).fontSize, headerGap:parseFloat(getComputedStyle(calendar.querySelector('.desktop-calendar-header')).rowGap), weekGap:parseFloat(getComputedStyle(calendar).rowGap), radius:getComputedStyle(calendar).borderRadius };
};
const checkHorizontalCalendar = (detail,label) => {
  approx(detail.date.x,detail.first.x,`${label} date aligns first weekday text`);
  if(detail.year)approx(detail.year.x,detail.first.x,`${label} year aligns first weekday text`);
  approx(detail.time.right,detail.last.right,`${label} clock aligns last weekday text`);
  if(detail.weatherText)approx(detail.weatherText.right,detail.last.right,`${label} weather aligns last weekday text`);
  if(!detail.longDate)approx(detail.date.bottom,detail.time.bottom,`${label} main row shares baseline`);
  check(detail.secondary.y>=detail.primary.bottom+detail.headerGap-.1,true,`${label} fixed header spacing`);
  check(detail.week.y>=detail.secondary.bottom+detail.weekGap-.1,true,`${label} week follows fixed section gap`);
  check([detail.box.height,detail.today.width,detail.today.height,detail.horizontal,detail.allTextContained,detail.radius],[153,24,24,true,true,'14px'],`${label} horizontal date highlight and all copy fit card`);
};

try {
  const page = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
  page.on('pageerror', error => errors.push(error.message));
  await page.addInitScript(() => {
    window.wallTest = { reads: 0, calls: [], missing: false, networkFail: false };
    const characters = [{ name: '人物甲', scope: 'global', tag: 'long hair', nl: '甲的完整外貌' }, { name: '人物乙', scope: 'chat', tag: 'short hair', nl: '乙的完整外貌' }, { name: '人物丙', scope: 'global', tag: 'curly hair', nl: '丙的完整外貌' }];
    window.STBaiBaiImage = { apiVersion: 1, getCharacters() { wallTest.reads++; return { characters }; }, getBackendStatus: () => ({ configured: true, supportsCharacters: true }), async generate(request) { wallTest.calls.push(request); return { path: `/user/images/test/photo-${wallTest.calls.length}.png`, seed: wallTest.calls.length, dataUrl: 'data:IGNORED' }; } };
  });
  await page.route('**/*', async route => {
    const url = new URL(route.request().url());
    if (url.pathname.startsWith('/user/images/test/')) {
      const state = await page.evaluate(() => ({ missing: wallTest.missing, networkFail: wallTest.networkFail }));
      if (state.networkFail) return route.abort();
      if (state.missing && url.pathname.includes('photo-1')) return route.fulfill({ status: 404 });
      if (process.env.POCKET_PHOTO_FIXTURE) return route.fulfill({ path: process.env.POCKET_PHOTO_FIXTURE, contentType: 'image/png' });
      return route.fulfill({ body: '<svg xmlns="http://www.w3.org/2000/svg" width="832" height="1216"><rect width="832" height="1216" fill="#8c6058"/><path d="M0 608h832" stroke="white" stroke-width="14"/></svg>', contentType: 'image/svg+xml' });
    }
    if (url.origin !== 'http://photowall.test') {
      if (url.pathname.endsWith('.css') && process.env.POCKET_FONT_CSS) return route.fulfill({ path: process.env.POCKET_FONT_CSS, contentType: 'text/css' });
      return route.abort();
    }
    const path = resolve(root, `.${decodeURIComponent(url.pathname)}`);
    if (!path.startsWith(`${root}/`) || !existsSync(path)) return route.fulfill({ status: 404 });
    const type = { '.js': 'text/javascript', '.css': 'text/css', '.html': 'text/html', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.woff2': 'font/woff2', '.ttf': 'font/ttf', '.webp': 'image/webp' }[extname(path)] || 'application/octet-stream';
    let body = readFileSync(path);
    if (url.pathname === '/tests/preview.js') body = body.toString().replace('const settings = {', "const settings = { pocketPhone: { apiSourceRef: { kind: 'shared-preset', presetId: 'daily' } },");
    if (process.env.PHOTOWALL_SOURCE === '1' && url.pathname === '/index.js') body = body.toString().replaceAll(/\.\/dist\/runtime\.js(?:\?[^']*)?/g, './src/runtime.js');
    return route.fulfill({ body, contentType: type });
  });
  await page.goto('http://photowall.test/tests/preview.html?clock=story');
  await page.getByRole('button', { name: '进入桌面', exact: true }).click();
  check(await page.evaluate(() => wallTest.reads), 0, 'desktop has no catalog preload');
  await page.evaluate(() => {
    window.STSevenDaysCal={apiVersion:1,getPhoneCalendar:()=>({today:'玄昭16年7月31日',yearLabel:'玄昭16年',monthName:'7月',columns:7,leading:1,weekdays:['一','二','三','四','五','六','日'],days:Array.from({length:31},(_,i)=>({day:i+1,isToday:i===30,items:[]}))})};
    window.dispatchEvent(new Event('st-sevendayscal:calendar-changed'));
  });
  for (const width of [320, 390, 736]) for (const theme of ['day', 'night']) {
    await page.setViewportSize({ width, height: 844 });
    await page.evaluate(theme => { previewHarness.metadata.pocketPhone.theme = theme; previewHarness.app.open(); }, theme);
    await page.locator('.desktop-calendar-time').filter({ visible: true }).waitFor();
    const metrics = await page.locator('.desktop-calendar').evaluate(calendar => {
      const root = calendar.getRootNode(), rect = node => { const r = node.getBoundingClientRect(); return { x: r.x, right: r.right, y: r.y, bottom: r.bottom, width: r.width, height: r.height }; };
      const text = node => { const range = document.createRange(); range.selectNodeContents(node); return rect(range); };
      const days = [...calendar.querySelectorAll('.desktop-week-day > small')], icons = [...root.querySelectorAll('[data-desktop-page="0"] .desktop-app-icon')].map(rect);
      const time = calendar.querySelector('time'), weather = calendar.querySelector('.desktop-calendar-weather');
      return { calendar: rect(calendar), min: Math.min(...icons.map(r => r.x)), max: Math.max(...icons.map(r => r.right)), time: time.textContent, status: root.querySelector('.status-time').textContent,
        timeText: text(time), firstText: text(days[0]), lastText: text(days.at(-1)), temperatureText: text(weather.querySelector('strong')), weatherText: text(weather.querySelector('small')),
        columnLefts: [...new Set(icons.map(r => r.x))].sort((a,b) => a-b), columnRights: [...new Set(icons.map(r => r.right))].sort((a,b) => a-b), overflow: calendar.scrollWidth > calendar.clientWidth, grid: getComputedStyle(calendar.parentElement).gridTemplateRows, dateLines: calendar.querySelectorAll('.desktop-calendar-date').length };
    });
    approx(metrics.calendar.x, metrics.min, 'calendar left aligns app icons'); approx(metrics.calendar.right, metrics.max, 'calendar right aligns app icons');
    const reference = await page.locator('.desktop-calendar').evaluate(readHorizontalCalendar); checkHorizontalCalendar(reference, `${width}-${theme}`);
    check([reference.dateText, reference.yearText], ['7月31日','玄昭16年'], 'actual Chinese source date splits without losing year');
    check([metrics.calendar.height, metrics.overflow, metrics.dateLines], [153, false, 1], 'calendar is 153px with real date and no overflow'); check(metrics.time, metrics.status, 'calendar uses existing phone clock');
    await page.locator('[data-desktop-page="0"] [data-desktop-target="1"]').click();
    const geometry = await page.locator('.photowall-desktop-photo').evaluate(photo => {
      const grid = getComputedStyle(photo.parentElement), box = node => { const r = node.getBoundingClientRect(); return { x: r.x, right: r.right, top: r.top, bottom: r.bottom, height: r.height }; };
      return { photo: box(photo), widget: box(photo.parentElement.querySelector('.photowall-widget-slot')), rows: grid.gridTemplateRows, radius: getComputedStyle(photo).borderRadius, overflow: getComputedStyle(photo).overflow, border: getComputedStyle(photo).borderWidth };
    });
    check(geometry.photo.top < geometry.widget.top, true, 'photo occupies upper four rows'); approx(geometry.photo.height, 316, 'photo spans four fixed rows'); approx(geometry.widget.top - geometry.photo.bottom, 10, 'photo and bottom rows keep grid gap'); check([geometry.widget.height, geometry.radius, geometry.overflow, geometry.border], [153, '14px', 'hidden', '0px'], 'right widget spans both rows and photo keeps original mask');
    approx(geometry.widget.x, metrics.columnLefts[2], 'placeholder left aligns third icon edge'); approx(geometry.widget.right, metrics.columnRights[3], 'placeholder right aligns fourth icon edge');
    approx(geometry.photo.x, metrics.columnLefts[0], 'photo left aligns first icon edge'); approx(geometry.photo.right, metrics.columnRights[3], 'photo right aligns fourth icon edge');

    layouts.push({ width, theme, metrics, geometry, reference });
    await page.locator('[data-desktop-page="1"] [data-desktop-target="0"]').click();
    await page.locator('.phone-shell').screenshot({ path: `${evidence}/calendar-${width}-${theme}.png` });
  }
  await page.evaluate(() => {
    window.STSevenDaysCal = { apiVersion: 1, getPhoneCalendar: () => ({ today: '雨季三月二日', yearLabel: '', monthName: '雨季三月', columns: 3, leading: 0, weekdays: ['雾', '雨', '晴'], days: [{ day: 1, isToday: false, items: [] }, { day: 2, isToday: true, items: [] }, { day: 3, isToday: false, items: [] }] }) };
    window.dispatchEvent(new Event('st-sevendayscal:calendar-changed'));
  });
  check(await page.locator('.desktop-week-day').count(), 3, 'story calendar retains its own three-day week');
  check(await page.locator('.desktop-calendar').getAttribute('data-action'), 'open-calendar', 'story widget retains calendar navigation');
  for(const [label,dayCount,columns,leading,today] of [['real-date',0,7,0,0],['numeric-story',30,7,0,14],['three-day',3,3,0,2],['month-end',30,7,6,30],['long-story',30,7,6,30]]) for(const width of [320,390,736]) for(const theme of ['day','night']) {
    await page.setViewportSize({width,height:844});
    await page.evaluate(({label,dayCount,columns,leading,today,theme})=>{
      previewHarness.metadata.pocketPhone.theme=theme;
      const weekdays=columns===3?['雾','雨','晴']:['一','二','三','四','五','六','日'];
      const days=Array.from({length:dayCount},(_,i)=>({day:i+1,isToday:i+1===today,items:i+1===today?[{name:'灯会'}]:[]}));
      if(label==='real-date')delete window.STSevenDaysCal;
      else window.STSevenDaysCal={apiVersion:1,getPhoneSnapshot:()=>({weather:{text:'阵雨转多云',temperature:'-12°C'}}),getPhoneCalendar:()=>({today:label==='long-story'?'大陆历1686年雨季之后的第三花满之月30日':label==='numeric-story'?'玄昭16年11月14日':label==='month-end'?'玄昭16年7月30日':'雨季三月二日',yearLabel:label==='long-story'?'大陆历1686年':['month-end','numeric-story'].includes(label)?'玄昭16年':'',monthName:label==='long-story'?'雨季之后的第三花满之月':label==='numeric-story'?'11月':label==='month-end'?'7月':'雨季三月',columns,leading,weekdays,days})};
      window.dispatchEvent(new Event('st-sevendayscal:calendar-changed'));
    },{label,dayCount,columns,leading,today,theme});
    await page.evaluate(()=>document.fonts.ready);
    const detail=await page.locator('.desktop-calendar').evaluate(readHorizontalCalendar); checkHorizontalCalendar(detail,`${label}-${width}-${theme}`);
    if(label==='long-story')check(detail.dateText,'雨季之后的第三花满之月30日',`${label} preserves complete story month in the actual date`);
    if(label==='numeric-story')check([detail.dateText,detail.yearText,detail.dateSize,detail.timeSize],['11月14日','玄昭16年','26px','26px'],`${label} numeric date retains approved primary type`);
    if(label!=='real-date')check(detail.dates,label==='numeric-story'?[8,9,10,11,12,13,14]:columns===3?[1,2,3]:[24,25,26,27,28,29,30],`${label} original dates preserved`);
    writeFileSync(`${evidence}/calendar-${label}-${width}-${theme}.json`,JSON.stringify(detail,null,2));
    await page.locator('.phone-shell').screenshot({path:`${evidence}/calendar-${label}-${width}-${theme}.png`});
  }
  await page.locator('.desktop-calendar').press('Enter'); check(await page.locator('.view-calendar').isVisible(),true,'reference calendar retains keyboard navigation');
  await page.getByRole('button',{name:'返回',exact:true}).click();
  await page.evaluate(() => { delete window.STSevenDaysCal; window.dispatchEvent(new Event('st-sevendayscal:calendar-changed')); });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.locator('[data-desktop-page="0"] [data-desktop-target="1"]').click();
  await page.locator('[data-action="photowall-open"]').click();
  check(await page.evaluate(() => wallTest.reads), 1, 'manager reads catalog once on opening');
  const templateSaves = await page.evaluate(() => previewHarness.settingsSaves);
  await page.locator('[data-action="photowall-template-edit"]').click();
  await page.getByRole('dialog').getByRole('textbox', { name: '提示词', exact: true }).fill('未保存草稿');
  await page.getByRole('dialog').getByRole('button', { name: '取消', exact: true }).click();
  check(await page.evaluate(() => previewHarness.settingsSaves), templateSaves, 'cancelled template draft has no settings save');
  await page.locator('[data-action="photowall-template-edit"]').click();
  const templateDialog = page.getByRole('dialog');
  await templateDialog.getByRole('textbox', { name: '方案名称', exact: true }).fill('看海');
  const rawTemplate = '  单张，两人并肩看海。\n2::evening light::  ';
  await templateDialog.getByRole('textbox', { name: '提示词', exact: true }).fill(rawTemplate);
  await templateDialog.getByRole('button', { name: '另存', exact: true }).click(); await templateDialog.waitFor({ state: 'hidden' });
  check(await page.evaluate(() => { const value = previewHarness.settings.pocketPhone.photoWallTemplates; return [value.templates.length, value.templates.find(row => row.id === value.selectedId).prompt]; }), [2, rawTemplate], 'save as keeps default and exact weighted multiline prompt');
  await page.locator('[data-phone-select="photowall-template"]').click();
  await page.getByRole('option', { name: '双格亲吻', exact: true }).click();
  const makeScheme = async (name, second = '人物乙') => {
    await page.locator('[data-action="photowall-new"]').click();
    const dialog = page.getByRole('dialog');
    const dialogControls = await dialog.evaluate(panel => [...panel.querySelectorAll('button, input, select')].map(node => [node.tagName, node.getBoundingClientRect().height]));
    for (const [tag, height] of dialogControls) approx(height, tag === 'BUTTON' ? 26.4 : 29.15, 'small scheme dialog keeps original control height');
    await dialog.getByRole('textbox', { name: '方案名称' }).fill(name);
    await dialog.getByLabel('人物A').selectOption({ label: '人物甲' });
    await dialog.getByLabel('人物B').selectOption({ label: second === '人物乙' ? '人物乙 · 当前聊天' : second });
    await dialog.getByRole('button', { name: '保存', exact: true }).click(); await dialog.waitFor({ state: 'hidden' });
  };
  await makeScheme('第一套');
  await page.evaluate(() => { previewHarness.reply = { nl: '人物B轻吻人物A脸颊，人物A从容面对镜头。人物A主动吻人物B嘴唇，人物B指尖微绷。', prompt: 'character B kisses character A on the cheek, character A calmly facing the camera. character A kisses character B on the lips, character B’s fingertips tensing slightly.' }; });
  const controls = await page.locator('.view-photowall').evaluate(main => {
    const measure = selector => [...main.querySelectorAll(selector)].map(node => { const style = getComputedStyle(node); return [node.getBoundingClientRect().height, style.fontSize, style.borderRadius, style.borderTopWidth]; });
    const b = main.querySelector('.photowall-generate-row button').getBoundingClientRect(), mainBox = main.getBoundingClientRect();
    return { buttons: measure('.photowall-button'), selects: measure('.phone-select-button'), generateRight: b.right, contentRight: mainBox.right - parseFloat(getComputedStyle(main).paddingRight) };
  });
  for (const [height, font, radius, border] of controls.buttons) { approx(height, 26.4, 'wall small button height'); check([font, radius, border], ['12px', '7px', '1px'], 'wall button uses original font/radius/border'); }
  for (const [height] of controls.selects) approx(height, 29.15, 'wall select height');
  approx(controls.generateRight, controls.contentRight, 'primary generate button is right aligned');
  const pickPerson = async name => { await page.locator('[data-phone-select="photowall-person-1"]').click(); await page.getByRole('option', { name, exact: true }).click(); };
  await pickPerson('人物丙'); await page.waitForFunction(() => previewHarness.metadata.pocketPhone.photoWall.schemes[0].people[1].name === '人物丙');
  await pickPerson('人物乙 · 当前聊天'); await page.waitForFunction(() => previewHarness.metadata.pocketPhone.photoWall.schemes[0].people[1].name === '人物乙');
  check(await page.evaluate(() => wallTest.reads), 1, 'scheme/person saves and redraw do not reread catalog');
  await page.locator('[data-action="photowall-generate"]').click(); await page.locator('.photowall-thumbnail').waitFor();
  check(await page.evaluate(() => [wallTest.calls.length, wallTest.reads, previewHarness.requests.length]), [1, 2, 1], 'one manual generation uses one text plan, one BBH request and a fresh catalog');
  check(await page.evaluate(() => Object.hasOwn(wallTest.calls[0], 'character')), false, 'BBH receives no category override');
  await page.locator('.photowall-thumbnail').click(); await page.locator('.photo-viewer').waitFor();
  check(await page.locator('.photo-viewer p').innerText(), '人物甲 与 人物乙 · 合照', 'thumbnail opens original viewer with short caption');
  check(await page.locator('.photo-viewer img').getAttribute('data-phone-image'), '/user/images/test/photo-1.png', 'viewer shares original saved path');
  await page.locator('.photo-viewer img').evaluate(image => image.decode());
  check(await page.locator('.photo-viewer img').evaluate(image => [image.naturalWidth > 0, image.naturalHeight > 0, getComputedStyle(image).objectFit]), [true, true, 'contain'], 'original image decodes fully in the existing contain viewer');
  await page.locator('.phone-shell').screenshot({ path: `${evidence}/viewer-original.png` });
  await page.locator('[data-action="close-photo"]').click(); check(await page.locator('.photowall-thumbnail').getAttribute('aria-pressed'), 'true', 'closing viewer preserves selection');
  check(await page.evaluate(() => { const state = previewHarness.metadata.pocketPhone; return [state.photoWall.photos[0].path === state.albumPhotos[0].path, state.photoWall.photos[0].prompt === state.albumPhotos[0].sources[0].prompt, JSON.stringify(state).includes('data:IGNORED')]; }), [true, true, false], 'same persisted path/actual prompt metadata and no binary copies');
  await page.locator('[data-action="photowall-desktop"]').click();
  await page.getByRole('button', { name: '返回', exact: true }).click();
  const image = page.locator('.photowall-desktop-photo img'); await image.evaluate(image => image.decode());
  const crop = await image.evaluate(img => { const style = getComputedStyle(img); return [style.objectFit, style.objectPosition, style.transform, getComputedStyle(img.parentElement).overflow]; });
  check(crop, ['cover', '50% 50%', 'matrix(1.04, 0, 0, 1.04, 0, 0)', 'hidden'], 'desktop photo cover crop is applied inside rounded mask');
  await page.locator('.phone-shell').screenshot({ path: `${evidence}/photo-night.png` });
  await page.locator('[data-action="photowall-open"]').click(); await makeScheme('第二套', '人物丙');
  await page.locator('[data-action="photowall-generate"]').click(); await page.locator('.photowall-thumbnail').nth(1).waitFor();
  check(await page.locator('.photowall-thumbnail').count(), 2, 'switching scheme appends while retaining first scheme photo');
  await page.locator('[data-phone-select="photowall-scheme"]').click(); await page.getByRole('option', { name: '第一套', exact: true }).click();
  check(await page.evaluate(() => { const wall = previewHarness.metadata.pocketPhone.photoWall; return [wall.activeSchemeId === wall.schemes[0].id, wall.desktopPhotoId === wall.photos[0].id]; }), [true, true], 'scheme selection persists independently of desktop photo');
  await page.locator('[data-phone-select="photowall-scheme"]').click(); await page.getByRole('option', { name: '第二套', exact: true }).click();
  await page.locator('[data-action="photowall-edit"]').click(); await page.getByRole('dialog').getByRole('button', { name: '移除方案', exact: true }).click(); await page.getByRole('dialog').waitFor({ state: 'hidden' });
  check(await page.locator('.photowall-thumbnail').count(), 2, 'removing scheme retains all photos in wall');
  await page.locator('[data-action="photowall-edit"]').click(); await page.getByRole('dialog').getByRole('textbox', { name: '方案名称' }).fill('改名后的方案'); await page.getByRole('dialog').getByRole('button', { name: '保存', exact: true }).click(); await page.getByRole('dialog').waitFor({ state: 'hidden' });
  await page.evaluate(() => {
    const wall = previewHarness.metadata.pocketPhone.photoWall; wallTest.originalPhotos = [...wall.photos];
    wall.photos = [...wall.photos, ...Array.from({ length: 18 }, (_, index) => ({ ...wall.photos[1], id: `scroll-fixture-${index}` }))];
    previewHarness.app.open();
  });
  const last = page.locator('.photowall-thumbnail').last(); await last.scrollIntoViewIfNeeded();
  const scrollBefore = await page.locator('.view-photowall').evaluate(main => main.scrollTop);
  check(scrollBefore > 0, true, 'many-photo fixture actually scrolls'); await last.click(); await page.locator('.photo-viewer').waitFor();
  await page.locator('[data-action="close-photo"]').click();
  approx(await page.locator('.view-photowall').evaluate(main => main.scrollTop), scrollBefore, 'closing viewer restores manager scroll');
  check(await page.locator('.photowall-thumbnail').last().getAttribute('aria-pressed'), 'true', 'closing viewer keeps clicked old photo selected');
  await page.evaluate(() => { previewHarness.metadata.pocketPhone.photoWall.photos = wallTest.originalPhotos; delete wallTest.originalPhotos; previewHarness.app.open(); });
  await page.locator('.photowall-thumbnail').nth(1).click(); await page.locator('.photo-viewer').waitFor();
  check(await page.locator('.photo-viewer img').getAttribute('data-phone-image'), '/user/images/test/photo-2.png', 'different thumbnails open their own original');
  await page.locator('[data-action="close-photo"]').click(); await page.locator('[data-action="photowall-desktop"]').click();
  check(await page.evaluate(() => { const wall = previewHarness.metadata.pocketPhone.photoWall; return [wall.schemes[0].name, wall.photos.length, wall.desktopPhotoId === wall.photos[1].id]; }), ['改名后的方案', 2, true], 'old photo from removed scheme remains selectable as desktop');
  await page.locator('.phone-shell').screenshot({ path: `${evidence}/manager.png` });
  check(await page.locator('[data-action*="photowall-delete"]').count(), 0, 'wall has no photo deletion');
  await page.getByRole('button', { name: '返回', exact: true }).click();
  await page.evaluate(() => { wallTest.networkFail = true; });
  await page.locator('[data-action="photowall-open"]').click();
  await page.waitForTimeout(100); check(await page.evaluate(() => previewHarness.metadata.pocketPhone.photoWall.photos.length), 2, 'network failure keeps both photos');
  await page.getByRole('button', { name: '返回', exact: true }).click();
  await page.evaluate(() => { wallTest.networkFail = false; wallTest.missing = true; });
  await page.locator('[data-action="photowall-open"]').click();
  await page.waitForFunction(() => !previewHarness.metadata.pocketPhone.photoWall.photos.some(photo => photo.path === '/user/images/test/photo-1.png'));
  check(await page.evaluate(() => { const state = previewHarness.metadata.pocketPhone; return [state.photoWall.photos.length, state.photoWall.photos[0].path, state.photoWall.desktopPhotoId === state.photoWall.photos[0].id, state.albumPhotos.length, wallTest.calls.length, previewHarness.requests.length, (previewHarness.fileDeletes || []).length]; }), [1, '/user/images/test/photo-2.png', true, 1, 2, 2, 0], '404 removes the deleted photo from wall and album, preserves current desktop and never generates or deletes files');
  await page.locator('.photowall-thumbnail').first().click();
  await page.locator('.photo-viewer').waitFor();
  check(await page.locator('.photo-viewer img').getAttribute('data-phone-image'), '/user/images/test/photo-2.png', 'remaining thumbnail opens its valid original without a missing placeholder');
  await page.locator('[data-action="close-photo"]').click();
  check(await page.locator('.photowall-thumbnail').count(), 1, 'deleted photo has no gallery slot');
  const snapshot = await page.evaluate(() => structuredClone(previewHarness.metadata.pocketPhone.photoWall));
  await page.evaluate(() => { previewHarness.app.dispose(); previewHarness.app = null; });
  await page.evaluate(async () => { const { initialize } = await import('/index.js'); const { createHostAdapter } = await import('/src/host.js'); previewHarness.app = initialize({ host: createHostAdapter({ contextProvider: () => previewHarness.context, fetchImpl: async () => new Response(null, { status: 200 }) }), documentRef: document, qqjBridgeProvider: () => null }); previewHarness.app.open(); });
  check(await page.evaluate(() => previewHarness.metadata.pocketPhone.photoWall), snapshot, 'reopened instance preserves schemes, desktop choice and photo records');
  check(errors, [], 'no runtime errors');
  writeFileSync(`${evidence}/report.json`, JSON.stringify({ source: process.env.PHOTOWALL_SOURCE === '1', checks: checks.length, assertions: checks, layouts, errors }, null, 2));
  console.log(JSON.stringify({ checks: checks.length, layouts: layouts.length, errors, evidence }));
} finally { await browser.close(); }
