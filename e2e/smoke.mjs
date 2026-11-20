// End-to-end smoke test: drives the real built game in Chromium (desktop + phone).
// Usage: npm run build && node e2e/smoke.mjs [baseUrl] [screenshotDir]
import { createRequire } from 'node:module';
import { spawn } from 'node:child_process';
import { mkdirSync } from 'node:fs';

const require = createRequire(import.meta.url);
const { chromium, devices } = require('playwright');

const outDir = process.argv[3] ?? 'e2e/screenshots';
mkdirSync(outDir, { recursive: true });

let server;
let base = process.argv[2];
if (!base) {
  server = spawn('npx', ['vite', 'preview', '--port', '4319', '--strictPort'], { stdio: 'ignore' });
  base = 'http://localhost:4319/';
  await new Promise((r) => setTimeout(r, 2500));
}

const failures = [];
const check = (cond, msg) => {
  if (!cond) failures.push(msg);
  console.log(`${cond ? '✓' : '✗'} ${msg}`);
};

async function session(name, contextOptions, fn) {
  const browser = await chromium.launch();
  const ctx = await browser.newContext(contextOptions);
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
  await page.goto(base);
  await fn(page);
  check(errors.length === 0, `${name}: no console errors ${errors.length ? JSON.stringify(errors) : ''}`);
  await browser.close();
}

try {
  await session('desktop', { viewport: { width: 1366, height: 820 }, deviceScaleFactor: 1 }, async (page) => {
    await page.waitForSelector('.start');
    check(await page.isVisible('text=DataCenterMania') || (await page.locator('h1').count()) > 0, 'start screen renders');
    await page.screenshot({ path: `${outDir}/desktop-start.png` });

    await page.click('[data-chapter="ch0"]');
    await page.waitForSelector('#topbar .stat');
    check(await page.waitForSelector('.tip-card', { timeout: 5000 }).then(() => true, () => false), 'mentor tip appears at chapter start');
    await page.click('[data-action="dismissTip"]');
    // let the tutorial disk failure happen (Fri 09:40) at 4x
    await page.click('[data-action="speed"][data-speed="4"]');
    await page.waitForSelector('.alarm', { timeout: 20000 });
    check(true, 'tutorial alarm shows up in the alarm list');
    while (await page.isVisible('.tip-card')) await page.click('[data-action="dismissTip"]');
    await page.screenshot({ path: `${outDir}/desktop-alarm.png` });

    await page.click('[data-action="fix"]');
    check(await page.isVisible('.busy'), 'dispatching shows the tech on the job');
    await page.waitForFunction(() => !document.querySelector('.alarm'), null, { timeout: 30000 });
    check(true, 'the manager walks over, swaps the disk and clears the alarm');

    // open the rack by tapping it on the map
    const box = await page.locator('#map').boundingBox();
    const rackTile = await page.evaluate(() => {
      const c = document.querySelector('#map');
      return { w: c.clientWidth, h: c.clientHeight };
    });
    // chapter 0 map is 10x7, rack at (4,3); camera is fitted and centred
    const scale = Math.min((rackTile.w - 32) / 10, (rackTile.h - 32) / 7);
    const ox = (rackTile.w - 10 * scale) / 2;
    const oy = (rackTile.h - 7 * scale) / 2;
    await page.mouse.click(box.x + ox + 4.5 * scale, box.y + oy + 3.5 * scale);
    await page.waitForSelector('.modal-card .slots', { timeout: 5000 });
    check(true, 'tapping a rack opens the rack view');
    await page.screenshot({ path: `${outDir}/desktop-rack.png` });
    await page.click('[data-action="installForm"]');
    await page.click('[data-action="install"]');
    check(await page.isVisible('.busy') || (await page.locator('.toast').count()) > 0, 'install job dispatched from the rack view');
    await page.click('[data-action="closeModal"]');

    await page.click('#tabs [data-panel="shop"]');
    await page.click('[data-action="order"][data-part="disk"][data-qty="1"]');
    check((await page.textContent('#panel')).includes('On the way'), 'shop order appears as a delivery');
    await page.click('#tabs [data-panel="goals"]');
    check((await page.textContent('#panel')).includes('The Closet'), 'goals panel lists the chapter objectives');

    await page.keyboard.press('h');
    await page.screenshot({ path: `${outDir}/desktop-heat.png` });
    await page.keyboard.press('h');

    // persistence: autosave on quit, then continue
    await page.click('[data-action="menu"]');
    await page.click('[data-action="quit"]');
    await page.waitForSelector('[data-action="continue"]');
    await page.click('[data-action="continue"]');
    check(await page.isVisible('#topbar .stat'), 'save and continue works');
  });

  await session('phone', { ...devices['iPhone 13'] }, async (page) => {
    await page.waitForSelector('.start');
    await page.screenshot({ path: `${outDir}/phone-start.png` });
    await page.tap('[data-difficulty="intern"]');
    await page.tap('[data-chapter="ch0"]');
    await page.waitForSelector('.tip-card');
    await page.screenshot({ path: `${outDir}/phone-tip.png` });
    await page.tap('[data-action="dismissTip"]');
    await page.tap('[data-action="speed"][data-speed="4"]');
    await page.waitForFunction(() => document.querySelector('.alarm-pill')?.textContent?.includes('1'), null, { timeout: 25000 });
    while (await page.isVisible('.tip-card')) await page.tap('[data-action="dismissTip"]');
    await page.tap('#tabs [data-panel="alarms"]');
    check(await page.isVisible('#panel .alarm'), 'phone: alarm list opens as a bottom sheet');
    const tipOnTop = await page.evaluate(() => {
      const t = document.querySelector('#tip');
      const p = document.querySelector('#panel');
      return Number(getComputedStyle(t).zIndex) > Number(getComputedStyle(p).zIndex);
    });
    check(tipOnTop, 'phone: mentor tips stack above the open bottom sheet');
    await page.screenshot({ path: `${outDir}/phone-sheet.png` });
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
    check(!overflow, 'phone: no horizontal page scroll');
    const small = await page.evaluate(() =>
      [...document.querySelectorAll('#tabs button, .speed button, .zoom button')].filter((b) => b.getBoundingClientRect().height < 36).length);
    check(small === 0, 'phone: touch targets are at least 36px tall');
  });
  await session('chapter 3', { viewport: { width: 1366, height: 820 }, deviceScaleFactor: 1 }, async (page) => {
    await page.addInitScript(() => {
      localStorage.setItem('dcm.progress.v1', JSON.stringify({ ch0: { sysadmin: 3 }, ch1: { sysadmin: 3 }, ch2: { sysadmin: 2 } }));
    });
    await page.reload();
    await page.waitForSelector('[data-chapter="ch3"]');
    check(true, 'chapter 3 is unlocked after chapter 2');
    await page.click('[data-chapter="ch3"]');
    await page.waitForSelector('.tip-card', { timeout: 5000 });
    check((await page.textContent('.tip-card')).includes('exhaust'), 'mentor explains hot/cold aisles');
    while (await page.isVisible('.tip-card')) await page.click('[data-action="dismissTip"]');
    await page.click('#tabs [data-panel="network"]');
    check((await page.textContent('#panel')).includes('MetroFiber A'), 'network tab lists the uplink');
    await page.click('[data-action="speed"][data-speed="4"]');
    const held = await page.evaluate(() => new Promise((resolve) => {
      let survived = 0;
      let presses = 0;
      const loop = async () => {
        for (let i = 0; i < 8; i++) {
          const btn = document.querySelector('#panel button');
          if (!btn) break;
          btn.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));
          presses++;
          await new Promise((r) => setTimeout(r, 200));
          if (btn.isConnected) survived++;
          btn.dispatchEvent(new PointerEvent('pointerup', { bubbles: true }));
          await new Promise((r) => setTimeout(r, 100));
        }
        resolve({ survived, presses });
      };
      loop();
    }));
    check(held.presses > 0 && held.survived === held.presses, `a held button in a live panel survives refreshes (${held.survived}/${held.presses})`);
    await page.click('[data-action="speed"][data-speed="1"]');
    await page.click('#tabs [data-panel="team"]');
    check((await page.textContent('#panel')).includes('Network engineer') || (await page.textContent('#panel')).includes('HVAC tech'), 'team tab shows specialist candidates');
    await page.keyboard.press('h');
    await page.screenshot({ path: `${outDir}/ch3-heat.png` });
    await page.keyboard.press('h');
    const geo = await page.evaluate(() => {
      const c = document.querySelector('#map');
      const r = c.getBoundingClientRect();
      return { x: r.x, y: r.y, w: c.clientWidth, h: c.clientHeight };
    });
    const scale = Math.min((geo.w - 32) / 25, (geo.h - 32) / 13);
    const ox = (geo.w - 25 * scale) / 2;
    const oy = (geo.h - 13 * scale) / 2;
    await page.mouse.click(geo.x + ox + 3.5 * scale, geo.y + oy + 3.5 * scale);
    await page.waitForSelector('.modal-card .slots', { timeout: 5000 });
    check((await page.textContent('.modal-card')).includes('Front faces'), 'rack view shows facing and airflow');
    await page.screenshot({ path: `${outDir}/ch3-rack.png` });
  });
  await session('shift loop', { viewport: { width: 1366, height: 820 }, deviceScaleFactor: 1 }, async (page) => {
    await page.addInitScript(() => {
      localStorage.setItem('dcm.progress.v1', JSON.stringify({ ch0: { sysadmin: 2 } }));
      localStorage.setItem('dcm.settings.v1', JSON.stringify({ autoPause: 'off', nightSkip: true, sound: false, difficulty: 'intern' }));
    });
    await page.reload();
    await page.click('[data-chapter="ch1"]');
    await page.waitForSelector('#goalbar .chip-btn');
    check((await page.textContent('#goalbar')).includes('servers'), 'goal chip shows live chapter progress');
    const deadline = Date.now() + 150000;
    let sawPop = false;
    while (Date.now() < deadline && !(await page.isVisible('.shift-card'))) {
      if (await page.isVisible('.tip-card')) await page.click('[data-action="dismissTip"]');
      const fast = page.locator('[data-action="speed"][data-speed="4"]');
      if ((await fast.getAttribute('aria-pressed')) !== 'true' && !(await page.isVisible('#modal:not([hidden])'))) await fast.click();
      if (!sawPop) sawPop = (await page.textContent('#goalbar')).includes('Today +');
      await page.waitForTimeout(700);
    }
    check(await page.isVisible('.shift-card'), 'the 22:00 shift report card appears');
    check(sawPop, 'money is credited during the shift (today counter rises)');
    await page.screenshot({ path: `${outDir}/shift-report.png` });
    await page.click('[data-action="sleep"]');
    await page.waitForSelector('text=While you slept', { timeout: 10000 });
    check(true, 'sleeping fast-forwards the night and shows a recap');
    await page.screenshot({ path: `${outDir}/night-recap.png` });
    await page.click('[data-action="closeModal"]');
    check((await page.textContent('#topbar')).includes('Tue'), 'the next shift starts on Tuesday morning');
  });
  await session('e-ink (Kindle Scribe)', { viewport: { width: 930, height: 1240 }, deviceScaleFactor: 1, hasTouch: true }, async (page) => {
    await page.goto(`${base}?eink=1`);
    await page.waitForSelector('.start');
    check(await page.evaluate(() => document.body.classList.contains('eink')), 'e-ink mode turns on via ?eink=1');
    const bg = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);
    check(bg === 'rgb(255, 255, 255)', `e-ink background is white (${bg})`);
    await page.screenshot({ path: `${outDir}/eink-start.png` });
    await page.click('[data-chapter="ch0"]');
    await page.waitForSelector('.tip-card', { timeout: 8000 });
    await page.click('[data-action="dismissTip"]');
    await page.click('[data-action="speed"][data-speed="4"]');
    await page.waitForSelector('.alarm', { timeout: 30000 });
    while (await page.isVisible('.tip-card')) await page.click('[data-action="dismissTip"]');
    const animated = await page.evaluate(() => [...document.querySelectorAll('*')].filter((el) => getComputedStyle(el).animationName !== 'none').length);
    check(animated === 0, 'no CSS animations on e-ink');
    await page.screenshot({ path: `${outDir}/eink-game.png` });
  });
} finally {
  server?.kill();
}

if (failures.length) {
  console.error(`\n${failures.length} check(s) failed`);
  process.exit(1);
}
console.log('\nAll e2e checks passed');
