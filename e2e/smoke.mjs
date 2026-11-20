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
    await page.screenshot({ path: `${outDir}/phone-sheet.png` });
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
    check(!overflow, 'phone: no horizontal page scroll');
    const small = await page.evaluate(() =>
      [...document.querySelectorAll('#tabs button, .speed button, .zoom button')].filter((b) => b.getBoundingClientRect().height < 36).length);
    check(small === 0, 'phone: touch targets are at least 36px tall');
  });
} finally {
  server?.kill();
}

if (failures.length) {
  console.error(`\n${failures.length} check(s) failed`);
  process.exit(1);
}
console.log('\nAll e2e checks passed');
