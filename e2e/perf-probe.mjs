// Mobile responsiveness probe: frame times and "slow finger" taps on a throttled phone.
// Usage: npm run build && node e2e/perf-probe.mjs
import { createRequire } from 'node:module';
import { spawn } from 'node:child_process';

const require = createRequire(import.meta.url);
const { chromium, devices } = require('playwright');

const server = spawn('npx', ['vite', 'preview', '--port', '4320', '--strictPort'], { stdio: 'ignore' });
await new Promise((r) => setTimeout(r, 2500));
const base = 'http://localhost:4320/';

const browser = await chromium.launch();
const ctx = await browser.newContext({ ...devices['Pixel 5'] });
const page = await ctx.newPage();
const cdp = await ctx.newCDPSession(page);
await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });
await page.addInitScript(() => {
  localStorage.setItem('dcm.progress.v1', JSON.stringify({ ch0: { sysadmin: 3 }, ch1: { sysadmin: 3 }, ch2: { sysadmin: 3 } }));
  localStorage.setItem('dcm.settings.v1', JSON.stringify({ autoPause: 'off', nightSkip: false, sound: false, difficulty: 'sysadmin', display: 'color' }));
});
await page.goto(base);
await page.click('[data-chapter="ch3"]');
await page.waitForSelector('#topbar .stat');
while (await page.isVisible('.tip-card')) await page.click('[data-action="dismissTip"]');
await page.click('[data-action="speed"][data-speed="4"]');
await page.waitForTimeout(1500);

// 1) frame timing over 4 s at 4x speed
const frames = await page.evaluate(() => new Promise((resolve) => {
  const times = [];
  let last = performance.now();
  const end = last + 4000;
  const tick = (t) => {
    times.push(t - last);
    last = t;
    if (t < end) requestAnimationFrame(tick);
    else resolve(times);
  };
  requestAnimationFrame(tick);
}));
frames.sort((a, b) => a - b);
const p = (q) => frames[Math.floor(frames.length * q)].toFixed(1);
console.log(`frames: n=${frames.length} median=${p(0.5)}ms p95=${p(0.95)}ms max=${frames[frames.length - 1].toFixed(1)}ms fps≈${(1000 / (4000 / frames.length)).toFixed(0)}`);

// 2) slow-finger taps: touch down, hold 180 ms, lift — as a real thumb does
async function slowTap(selector) {
  const box = await page.locator(selector).first().boundingBox();
  if (!box) return 'missing';
  const x = box.x + box.width / 2;
  const y = box.y + box.height / 2;
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y }] });
  await page.waitForTimeout(180);
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await page.waitForTimeout(250);
  return 'ok';
}
let worked = 0;
const tries = 12;
const tabs = ['team', 'contracts', 'network', 'shop', 'goals', 'alarms'];
for (let i = 0; i < tries; i++) {
  const tab = tabs[i % tabs.length];
  await slowTap(`#tabs [data-panel="${tab}"]`);
  const pressed = await page.locator(`#tabs [data-panel="${tab}"]`).getAttribute('aria-pressed');
  if (pressed === 'true') worked++;
  // close the sheet again if it opened, to keep state comparable
  if (await page.isVisible('#panel')) await slowTap(`#tabs [data-panel="${tab}"]`);
}
console.log(`slow-finger tab taps registered: ${worked}/${tries}`);

// 3) tap-to-feedback latency on the speed buttons
const lat = [];
for (let i = 0; i < 6; i++) {
  const sp = i % 2 ? '2' : '1';
  const box = await page.locator(`[data-action="speed"][data-speed="${sp}"]`).boundingBox();
  const t0 = Date.now();
  await page.touchscreen.tap(box.x + box.width / 2, box.y + box.height / 2);
  await page.waitForFunction((s) => document.querySelector(`[data-action="speed"][data-speed="${s}"]`)?.getAttribute('aria-pressed') === 'true', sp, { timeout: 3000 }).catch(() => {});
  lat.push(Date.now() - t0);
}
console.log(`speed button tap→feedback: ${lat.join(', ')} ms`);

// 4) slow-finger taps on buttons INSIDE live panels (they re-render while the finger is down)
await page.click('[data-action="speed"][data-speed="4"]');
let bought = 0;
const buyTries = 10;
await slowTap('#tabs [data-panel="shop"]');
for (let i = 0; i < buyTries; i++) {
  const before = await page.evaluate(() => document.querySelectorAll('#panel .list:not(.shop) li').length + '|' + document.querySelector('#topbar .stat b')?.textContent);
  await slowTap('#panel [data-action="order"][data-part="filter"][data-qty="1"]');
  const after = await page.evaluate(() => document.querySelectorAll('#panel .list:not(.shop) li').length + '|' + document.querySelector('#topbar .stat b')?.textContent);
  if (before !== after) bought++;
}
console.log(`slow-finger "Buy 1" taps registered in the live Shop panel: ${bought}/${buyTries}`);
let clientTaps = 0;
await slowTap('#tabs [data-panel="contracts"]');
for (let i = 0; i < 8; i++) {
  const n = await page.locator('#panel [data-action="accept"]').count();
  if (!n) break;
  await slowTap('#panel [data-action="accept"]');
  if ((await page.locator('#panel [data-action="accept"]').count()) < n) clientTaps++;
}
console.log(`slow-finger "Sign" taps registered in the live Clients panel: ${clientTaps} (offers tried until none left)`);

// 5) how often does each panel rebuild its DOM, and does a held button survive a 180 ms press?
for (const tab of ['alarms', 'team', 'contracts', 'network', 'shop', 'goals']) {
  while (await page.isVisible('.tip-card')) await page.click('[data-action="dismissTip"]');
  if (await page.isVisible('#modal:not([hidden])')) await page.evaluate(() => document.querySelector('[data-action="closeModal"]')?.click());
  await page.evaluate(() => document.querySelector('[data-action="speed"][data-speed="4"]').click());
  await page.evaluate((t) => document.querySelector(`#tabs [data-panel="${t}"]`).click(), tab);
  await page.waitForTimeout(300);
  const paused = await page.evaluate(() => document.querySelector('[data-action="speed"][data-speed="4"]').getAttribute('aria-pressed'));
  console.log(`(${tab}: 4x pressed=${paused}, tip=${await page.isVisible('.tip-card')})`);
  const r = await page.evaluate(() => new Promise((resolve) => {
    const panel = document.querySelector('#panel');
    let rebuilds = 0;
    const mo = new MutationObserver((list) => { if (list.some((m) => m.type === 'childList' && m.target === panel)) rebuilds++; });
    mo.observe(panel, { childList: true });
    let survived = 0, presses = 0;
    const loop = async () => {
      for (let i = 0; i < 10; i++) {
        const btn = panel.querySelector('button');
        if (!btn) break;
        presses++;
        await new Promise((r) => setTimeout(r, 180));
        if (btn.isConnected) survived++;
        await new Promise((r) => setTimeout(r, 120));
      }
      mo.disconnect();
      resolve({ rebuildsPerSec: (rebuilds / 3).toFixed(1), presses, survived });
    };
    loop();
  }));
  console.log(`panel ${tab}: ${r.rebuildsPerSec} rebuilds/s; a held button survived ${r.survived}/${r.presses} presses`);
}

await browser.close();
server.kill();
