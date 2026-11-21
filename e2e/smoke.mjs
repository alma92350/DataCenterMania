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
      localStorage.setItem('dcm.progress.v1', JSON.stringify({ ch0: { sysadmin: 3 }, ch1: { sysadmin: 3 }, ch2: { sysadmin: 2 }, ch3: { sysadmin: 2 } }));
    });
    await page.reload();
    await page.waitForSelector('[data-chapter="ch4"]');
    check(true, 'Launch Week is unlocked after Colocation Floor');
    // Colocation Floor first: aisles are taught there, and there is no network tab yet
    await page.click('[data-chapter="ch3"]');
    await page.waitForSelector('.tip-card', { timeout: 5000 });
    check((await page.textContent('.tip-card')).includes('exhaust'), 'Colocation Floor: mentor explains hot/cold aisles');
    check((await page.locator('#tabs [data-panel="network"]').count()) === 0, 'Colocation Floor has no network tab yet (progressive disclosure)');
    await page.click('[data-action="menu"]');
    await page.click('[data-action="quit"]');
    await page.waitForSelector('[data-chapter="ch4"]');
    await page.click('[data-chapter="ch4"]');
    await page.waitForSelector('.tip-card', { timeout: 5000 });
    check((await page.textContent('.tip-card')).toLowerCase().includes('uplink'), 'Launch Week: mentor explains the uplink');
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
    check((await page.locator('#panel .avatar svg').count()) >= 3, 'team tab shows character portraits');
    // the Shift Lead: hire, then switch auto-dispatch on
    await page.click('[data-action="hireLead"]');
    await page.waitForSelector('[data-action="autoDispatch"]');
    await page.click('[data-action="autoDispatch"]');
    await page.waitForFunction(() => document.querySelector('.lead-card')?.textContent?.includes('ON'), null, { timeout: 5000 });
    check(true, 'a Shift Lead can be hired and auto-dispatch switched on');
    // sprites must really load as images (strict XML), not just look right inline
    const broken = await page.evaluate(async () => {
      const svgs = [...document.querySelectorAll('#panel .avatar svg')].slice(0, 6).map((n) => new XMLSerializer().serializeToString(n));
      let bad = 0;
      for (const svg of svgs) {
        const ok = await new Promise((resolve) => {
          const img = new Image();
          img.onload = () => resolve(true);
          img.onerror = () => resolve(false);
          img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);
        });
        if (!ok) bad++;
      }
      return bad;
    });
    check(broken === 0, 'every portrait loads as a strict SVG image');
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
  await session('daily challenge', { ...devices['Pixel 5'] }, async (page) => {
    await page.addInitScript(() => {
      localStorage.setItem('dcm.settings.v1', JSON.stringify({ autoPause: 'off', nightSkip: true, sound: false, difficulty: 'sysadmin', display: 'color' }));
    });
    await page.reload();
    await page.waitForSelector('.daily-card');
    check((await page.textContent('.daily-card')).includes('Daily Challenge #'), 'start screen shows today’s Daily Challenge');
    check((await page.textContent('.career')).includes('Intern'), 'start screen shows the career title');
    await page.screenshot({ path: `${outDir}/daily-start.png` });
    await page.tap('.daily-card [data-action="daily"]');
    await page.waitForSelector('#topbar .stat');
    const deadline = Date.now() + 160000;
    while (Date.now() < deadline && !(await page.isVisible('.shift-card'))) {
      const fast = page.locator('[data-action="speed"][data-speed="4"]');
      if ((await fast.getAttribute('aria-pressed')) !== 'true' && !(await page.isVisible('#modal:not([hidden])'))) await fast.tap();
      await page.waitForTimeout(800);
    }
    check(await page.isVisible('.shift-card'), 'the daily ends with its one shift report');
    await page.tap('.shift-card [data-action="closeModal"]');
    await page.waitForSelector('.end', { timeout: 5000 });
    check((await page.textContent('.end')).includes('Daily'), 'daily end screen appears');
    check((await page.textContent('.share-text')).startsWith('DataCenterMania Daily #'), 'a share line is ready');
    await page.screenshot({ path: `${outDir}/daily-end.png` });
    await page.tap('[data-action="quit"]');
    await page.waitForSelector('.daily-card');
    check((await page.textContent('.daily-card')).includes('Your best today'), 'today’s best result is remembered');
    check((await page.textContent('.achievements summary')).match(/Achievements [1-9]/) !== null, 'achievements were unlocked and shown');
  });
  await session('contract names', { viewport: { width: 1366, height: 820 }, deviceScaleFactor: 1 }, async (page) => {
    await page.addInitScript(() => {
      localStorage.setItem('dcm.progress.v1', JSON.stringify({ ch0: { sysadmin: 3 }, ch1: { sysadmin: 3 } }));
    });
    await page.reload();
    await page.click('[data-chapter="ch2"]');
    await page.waitForSelector('#topbar .stat');
    await page.click('#tabs [data-panel="contracts"]');
    const names = await page.locator('#panel .contract b').allTextContents();
    check(names.length >= 2 && new Set(names).size === names.length, `each active contract has its own name (${names.slice(0, 3).join(', ')})`);
    const labels = await page.evaluate(() => {
      const c = document.querySelector('#map');
      const r = c.getBoundingClientRect();
      return { x: r.x, y: r.y, w: c.clientWidth, h: c.clientHeight };
    });
    const scale = Math.min((labels.w - 32) / 22, (labels.h - 32) / 11);
    await page.mouse.click(labels.x + (labels.w - 22 * scale) / 2 + 3.5 * scale, labels.y + (labels.h - 11 * scale) / 2 + 3.5 * scale);
    await page.waitForSelector('.modal-card select[data-action="assign"]', { timeout: 5000 });
    const options = await page.locator('.modal-card select[data-action="assign"]').first().locator('option').allTextContents();
    const named = options.filter((o) => o.includes(' · '));
    check(named.length >= 2 && new Set(named).size === named.length, `the assign drop-down lists distinct "Customer · Project" names (${named.slice(0, 2).join(' | ')})`);
  });
  await session('hackers (phone touch)', { ...devices['Pixel 5'], deviceScaleFactor: 2 }, async (page) => {
    await page.addInitScript(() => {
      localStorage.setItem('dcm.progress.v1', JSON.stringify({ ch0: { sysadmin: 3 }, ch1: { sysadmin: 3 }, ch2: { sysadmin: 1 } }));
      localStorage.setItem('dcm.settings.v1', JSON.stringify({ autoPause: 'off', nightSkip: false, sound: false, difficulty: 'intern', display: 'color' }));
    });
    await page.reload();
    await page.waitForSelector('[data-chapter="hack"]');
    check(true, 'the Hacker Weekend event card is playable after Startup Colo');
    await page.screenshot({ path: `${outDir}/hack-start.png` });
    await page.tap('[data-chapter="hack"]');
    await page.waitForSelector('.tip-card', { timeout: 8000 });
    while (await page.isVisible('.tip-card')) await page.tap('[data-action="dismissTip"]');
    await page.tap('[data-action="speed"][data-speed="4"]');

    const minTargets = { w: 999, h: 999 };
    const noteSize = async (sel) => {
      const sizes = await page.$$eval(sel, (els) => els.map((e) => { const r = e.getBoundingClientRect(); return [r.width, r.height]; }));
      for (const [w, h] of sizes) { minTargets.w = Math.min(minTargets.w, w); minTargets.h = Math.min(minTargets.h, h); }
    };
    // mentor tips pause the game, so keep dismissing them while waiting for the next attack
    const waitForAttack = async () => {
      const until = Date.now() + 60000;
      while (Date.now() < until && !(await page.isVisible('.attack-card'))) {
        if (await page.isVisible('.tip-card')) await page.tap('[data-action="dismissTip"]');
        await page.waitForTimeout(250);
      }
      await page.waitForSelector('.attack-card', { timeout: 2000 });
    };
    const center = async (loc) => { const b = await loc.boundingBox(); return b ? { x: b.x + b.width / 2, y: b.y + b.height / 2 } : null; };

    // ---- 1. Block the Flood (Friday 10:00)
    await waitForAttack();
    check((await page.textContent('.attack-card')).includes('Script Kiddies'), 'Script Kiddies launch a flood and the defend prompt opens by itself');
    await page.screenshot({ path: `${outDir}/hack-prompt.png` });
    await page.tap('[data-action="attackDefend"]');
    await page.waitForSelector('.arena');
    let shotFlood = false;
    const floodEnd = Date.now() + 25000;
    while (Date.now() < floodEnd && !(await page.isVisible('.mini-result'))) {
      const bot = page.locator('.stream.bot:not(.done)').first();
      if (await bot.count()) {
        await noteSize('.stream:not(.done)');
        const c = await center(bot);
        if (c) await page.touchscreen.tap(c.x, c.y);
        if (!shotFlood) { shotFlood = true; await page.screenshot({ path: `${outDir}/hack-flood.png` }); }
      }
      await page.waitForTimeout(110);
    }
    await page.waitForSelector('.mini-result', { timeout: 10000 });
    const floodText = await page.textContent('.mini-result');
    const blocked = Number((/Blocked (\d+) of/.exec(floodText) ?? [])[1] ?? 0);
    check(blocked >= 6, `Block the Flood is playable by touch (blocked ${blocked} bots)`);
    await page.screenshot({ path: `${outDir}/hack-result.png` });
    await page.tap('[data-action="mgDone"]');
    check(!(await page.isVisible('.mini-result')), 'the result is applied and the game continues');

    // ---- 2. Phish or Legit? (Friday 13:00)
    await waitForAttack();
    check((await page.textContent('.attack-card')).includes('Captain Phish'), 'Captain Phish sends a phishing campaign');
    await page.tap('[data-action="attackDefend"]');
    await page.waitForSelector('.mail');
    for (let i = 0; i < 3; i++) {
      await page.waitForSelector('[data-guess="phish"]:not([disabled])', { timeout: 8000 });
      await noteSize('.phish-actions button');
      const from = await page.textContent('.mail-head b');
      const legit = /@(datacenter-mania\.com|cloudnimbus\.com)$/.test(from.trim());
      if (i === 0) await page.screenshot({ path: `${outDir}/hack-phish.png` });
      await page.tap(`[data-guess="${legit ? 'legit' : 'phish'}"]`);
      await page.waitForSelector('.banner[role="status"]', { timeout: 3000 });
      if (i === 0) await page.screenshot({ path: `${outDir}/hack-phish-feedback.png` });
    }
    await page.waitForSelector('.mini-result', { timeout: 8000 });
    check((await page.textContent('.mini-result')).includes('3 of 3'), 'Phish or Legit? is playable by touch (3 of 3 judged right)');
    await page.tap('[data-action="mgDone"]');

    // ---- 3. Cut the Spread (Friday 16:00)
    await waitForAttack();
    await page.tap('[data-action="attackDefend"]');
    await page.waitForSelector('.worm-net');
    await noteSize('.node');
    const infected = await page.$$eval('.node.infected', (els) => els.map((e) => ({ x: parseFloat(e.style.left), y: parseFloat(e.style.top) })));
    const clean = await page.$$eval('.node.clean', (els) => els.map((e, i) => ({ i, x: parseFloat(e.style.left), y: parseFloat(e.style.top) })));
    const near = clean.sort((p, q) => Math.hypot(p.x - infected[0].x, p.y - infected[0].y) - Math.hypot(q.x - infected[0].x, q.y - infected[0].y)).slice(0, 3);
    await page.screenshot({ path: `${outDir}/hack-worm.png` });
    for (const n of near) {
      const target = page.locator('.node.clean').nth(0);
      const loc = page.locator(`.node[style*="left:${n.x.toFixed(1)}%"]`).first();
      const c = await center(loc);
      if (c) await page.touchscreen.tap(c.x, c.y);
      await page.waitForTimeout(150);
      void target;
    }
    await page.screenshot({ path: `${outDir}/hack-worm-after.png` });
    await page.waitForSelector('.mini-result', { timeout: 20000 });
    check(await page.isVisible('.mini-result'), 'Cut the Spread is playable by touch');
    await page.tap('[data-action="mgDone"]');

    check(minTargets.w >= 44 && minTargets.h >= 44, `every micro-game control is at least 44 px (smallest ${Math.round(minTargets.w)}x${Math.round(minTargets.h)})`);
    // the whole thing stays usable: the game is still running and no UI is stuck
    check(await page.isVisible('#topbar .stat'), 'the game continues after three attacks');
  });
} finally {
  server?.kill();
}

if (failures.length) {
  console.error(`\n${failures.length} check(s) failed`);
  process.exit(1);
}
console.log('\nAll e2e checks passed');
