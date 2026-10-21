// Automated checks for the Stage 1 prototype test list (README "Testing").
// Runs the built dist/index.html in headless Chromium with software WebGL.
//   CHROMIUM_PATH=/path/to/chrome node tests/prototype.test.mjs
import { chromium } from 'playwright-core';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, resolve } from 'node:path';
import { existsSync } from 'node:fs';
import { heliocentricPosition } from '../src/sim/kepler.js';
import { BODY_BY_ID, orbitalPeriodDays } from '../src/data/bodies.js';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const url = pathToFileURL(resolve(root, 'dist/index.html')).href;
const executablePath = process.env.CHROMIUM_PATH || ['/opt/pw-browsers/chromium-1194/chrome-linux/chrome'].find(existsSync);

// Records speech instead of playing it, for both the browser and Android paths.
const speechStub = () => {
  window.__spoken = [];
  if (typeof window.SpeechSynthesisUtterance !== 'function') window.SpeechSynthesisUtterance = function (t) { this.text = t; };
  Object.defineProperty(window, 'speechSynthesis', {
    configurable: true, value: { speak: (u) => window.__spoken.push(u.text), cancel() {}, getVoices: () => [] },
  });
};
const androidStub = () => {
  window.__spoken = [];
  window.AndroidBridge = { speak: (t) => window.__spoken.push(t), exitApp: () => { window.__exited = true; } };
};
async function enterApp(p) {
  await p.waitForFunction(() => ['welcome', 'menu'].includes(window.PU?.state().mode), null, { timeout: 60000 });
  if ((await p.evaluate(() => window.PU.state().mode)) === 'welcome') await p.click('#welcome-enter');
  await p.waitForFunction(() => window.PU.state().mode === 'menu', null, { timeout: 10000 });
}

const results = [];
async function test(name, fn) {
  try { await fn(); results.push({ name, ok: true }); console.log(`  PASS  ${name}`); }
  catch (err) { results.push({ name, ok: false, err }); console.log(`  FAIL  ${name}\n        ${err.message.split('\n')[0]}`); }
}
function assert(cond, msg) { if (!cond) throw new Error(msg); }
const near = (a, b, tol) => Math.abs(a - b) <= tol;

// ---------------------------------------------------------------- pure simulation checks
console.log('Simulation data');
await test('Earth position at J2000 matches published value (~0.01 AU)', () => {
  const p = heliocentricPosition(BODY_BY_ID.earth.orbit, 0);
  assert(near(p.x, -0.1771, 0.01) && near(p.y, 0.9672, 0.01), `got ${p.x.toFixed(4)}, ${p.y.toFixed(4)}`);
});
await test('Orbital periods match NASA fact sheet within 0.5%', () => {
  const expected = { mercury: 87.97, venus: 224.70, earth: 365.256, mars: 686.98, jupiter: 4332.6, saturn: 10759.2, uranus: 30685, neptune: 60190 };
  for (const [id, days] of Object.entries(expected)) {
    const got = orbitalPeriodDays(BODY_BY_ID[id]);
    assert(Math.abs(got - days) / days < 0.005, `${id}: ${got.toFixed(1)} vs ${days}`);
  }
});
await test('Heliocentric distances stay within perihelion/aphelion bounds over 200 years', () => {
  for (const id of ['mercury', 'venus', 'earth', 'mars', 'jupiter', 'saturn', 'uranus', 'neptune']) {
    const o = BODY_BY_ID[id].orbit; const [a, e] = o.elements;
    for (let d = -36525; d <= 36525; d += 97) {
      const p = heliocentricPosition(o, d); const r = Math.hypot(p.x, p.y, p.z);
      assert(r > a * (1 - e) * 0.99 && r < a * (1 + e) * 1.01, `${id} r=${r} at day ${d}`);
    }
  }
});

// ---------------------------------------------------------------- browser checks
const browser = await chromium.launch({ executablePath, args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const errors = [];
const page = await browser.newPage({ viewport: { width: 1280, height: 760 } });
await page.addInitScript(speechStub);
page.on('pageerror', (e) => errors.push(e.message));
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
const state = () => page.evaluate(() => window.PU.state());
const wait = (ms) => page.waitForTimeout(ms);
// Camera moves are frame-driven; software WebGL can run below 10 fps, so wait on state, not a timer.
const settle = () => page.waitForFunction(() => !window.PU.state().camera.transitioning, null, { timeout: 15000 });

console.log('Prototype (desktop 1280×760)');
await test('Opens on the welcome screen showing the name George Universal Sunbox', async () => {
  await page.goto(url);
  await page.waitForFunction(() => window.PU?.state().mode === 'welcome', null, { timeout: 60000 });
  assert((await page.title()) === 'George Universal Sunbox', `title ${await page.title()}`);
  const name = (await page.innerText('.welcome-name')).replace(/\s+/g, ' ').trim().toLowerCase();
  assert(name === 'george universal sunbox', `welcome name reads "${name}"`);
  assert(await page.isVisible('.welcome-name'), 'name not visible');
  assert((await page.textContent('.welcome-greet')).trim() === 'Welcome, George', 'greeting missing');
  assert(await page.isVisible('#welcome-enter'), 'browser needs a "Tap to enter" button for sound');
});
await test('Tapping enter plays the recorded "Welcome, George" voice and opens the main menu', async () => {
  await page.click('#welcome-enter');
  await page.waitForFunction(() => window.PU.state().welcomeVoice !== 'none', null, { timeout: 5000 });
  assert((await state()).welcomeVoice === 'clip', `voice used: ${(await state()).welcomeVoice}`);
  assert(await page.evaluate(() => window.__spoken.length === 0), 'speech engine should not also speak');
  await page.waitForFunction(() => window.PU.state().mode === 'menu', null, { timeout: 10000 });
  assert(await page.isVisible('#menu'), 'menu not visible');
  const mark = (await page.innerText('.wordmark')).replace(/\s+/g, ' ').trim().toLowerCase();
  assert(mark === 'george universal sunbox', `wordmark reads "${mark}"`);
});
await test('Main menu shows all entries; Sandbox is marked Prototype', async () => {
  for (const id of ['#m-start', '#m-solar', '#m-sandbox', '#m-settings']) assert(await page.isVisible(id), `${id} missing`);
  assert((await page.textContent('#m-sandbox')).includes('Prototype'), 'Sandbox not labelled Prototype');
  assert(!(await page.isVisible('#m-exit')), 'Exit should only appear inside the Android app');
});
await test('Settings opens from the menu and closes with Back', async () => {
  await page.click('#m-settings');
  assert(await page.isVisible('#settings'), 'settings not open');
  assert(await page.evaluate(() => window.PU.handleBack()) === true, 'back not handled');
  assert(!(await page.isVisible('#settings')), 'settings still open');
});
await test('Start Simulation enters the 3D view with HUD', async () => {
  await page.click('#m-start');
  await wait(300);
  assert((await state()).mode === 'sim', 'not in sim mode');
  assert(await page.isVisible('.toolbar'), 'toolbar hidden');
});
await test('Sun, eight planets and the Moon are present', async () => {
  const ids = Object.keys((await state()).bodies).sort().join(',');
  assert(ids === 'earth,jupiter,mars,mercury,moon,neptune,saturn,sun,uranus,venus', ids);
  assert(await page.locator('.chip').count() === 10, 'body strip should list 10 bodies');
});
await test('Pause freezes simulation time', async () => {
  await page.click('#k-play');
  const a = (await state()).days; await wait(600); const b = (await state());
  assert(b.paused && a === b.days, `days moved while paused: ${a} → ${b.days}`);
});
await test('Tapping a planet selects it and shows its data', async () => {
  await page.click('#c-overview'); await settle();
  const s = await page.evaluate(() => window.PU.screenOf('jupiter'));
  await page.mouse.click(s.x, s.y);
  await wait(200);
  assert((await state()).selectedId === 'jupiter', `selected ${(await state()).selectedId}`);
  assert((await page.textContent('#p-name')) === 'Jupiter', 'panel name wrong');
  assert((await page.textContent('#p-facts')).includes('142,984 km'), 'diameter missing');
});
await test('Info panel reports Moon distance from Earth', async () => {
  await page.click('.chip[data-id="moon"]');
  const t = await page.textContent('#p-facts');
  assert(t.includes('Distance from Earth') && /3[5-9]\d,\d{3} km|40\d,\d{3} km/.test(t), t.slice(0, 200));
});
await test('Resume continues time; faster speed advances it more', async () => {
  await page.click('#k-play');
  await page.click('[data-preset="slow"]');
  let a = (await state()).days; await wait(800); const slow = (await state()).days - a;
  await page.click('[data-preset="fast"]');
  a = (await state()).days; await wait(800); const fast = (await state()).days - a;
  assert(slow > 0, 'time did not resume');
  assert(fast > slow * 50, `fast (${fast}) not much faster than slow (${slow})`);
  assert((await page.textContent('#k-mult')).includes('2,629,800'), 'multiplier readout wrong');
  await page.click('[data-preset="normal"]');
});
await test('Drag rotates and wheel zooms the camera', async () => {
  await page.click('#p-close');
  const before = await page.evaluate(() => ({ p: window.PU.app.camera.position.toArray(), d: window.PU.app.rig.distance }));
  await page.mouse.move(640, 300); await page.mouse.down(); await page.mouse.move(760, 340, { steps: 8 }); await page.mouse.up();
  await page.mouse.wheel(0, -600); await wait(300);
  const after = await page.evaluate(() => ({ p: window.PU.app.camera.position.toArray(), d: window.PU.app.rig.distance }));
  assert(after.d < before.d * 0.8, `zoom ${before.d} → ${after.d}`);
  assert(Math.hypot(...after.p.map((v, i) => v - before.p[i])) > 1, 'camera did not move');
});
await test('Focus camera follows the selected planet', async () => {
  await page.click('.chip[data-id="mars"]');
  await page.click('#c-focus'); await settle(); await wait(300);
  const s = await state();
  const d = Math.hypot(...s.camera.target.map((v, i) => v - s.bodies.mars.pos[i]));
  assert(s.camera.following && d < 0.05, `target off by ${d}`);
});
await test('Reset camera returns to the default view', async () => {
  await page.click('#c-reset'); await settle();
  const s = await state();
  assert(!s.camera.following && near(s.camera.distance, 150, 0.5), `distance ${s.camera.distance}`);
});
await test('Sandbox: visual size changes and restores', async () => {
  await page.click('.chip[data-id="earth"]'); await page.click('#t-sandbox');
  await page.fill('#s-size', '2.5');
  await page.click('#s-apply');
  assert((await state()).bodies.earth.sizeMul === 2.5, 'size not applied');
  const scale = await page.evaluate(() => window.PU.app.solar.bodies.get('earth').tilt.scale.x);
  assert(scale === 2.5, `mesh scale ${scale}`);
  assert(await page.locator('.chip.modified').count() === 1, 'modified marker missing');
  await page.click('#s-restore');
  assert((await state()).bodies.earth.sizeMul === 1, 'size not restored');
});
await test('Sandbox: orbital speed 0× halts the body while time runs; restore resyncs', async () => {
  await page.fill('#s-rate', '0'); await page.click('#s-apply');
  const a = (await state()).bodies.earth.pos; await wait(600); const s = await state();
  assert(Math.hypot(...s.bodies.earth.pos.map((v, i) => v - a[i])) < 1e-6, 'Earth moved at 0×');
  assert(s.bodies.mars.orbitDays === s.days, 'other bodies should follow the clock');
  await page.click('#s-restore');
  const r = await state();
  assert(r.bodies.earth.orbitRate === 1 && near(r.bodies.earth.orbitDays, r.days, 1e-6), 'not restored');
});
await test('Reset restores the initial simulation time', async () => {
  await page.click('#k-reset');
  const s = await page.evaluate(() => ({ days: window.PU.app.clock.days, start: window.PU.app.clock.startDays }));
  assert(near(s.days, s.start, 0.05), `days ${s.days} vs start ${s.start}`);
});
await test('Labels and orbits toggle', async () => {
  const shown = () => page.locator('.body-label:not([hidden])').count();
  assert(await shown() > 0, 'no labels to begin with');
  await page.click('#h-labels');
  await page.waitForFunction(() => !document.querySelector('.body-label:not([hidden])'), null, { timeout: 3000 }).catch(() => {});
  assert(await shown() === 0, 'labels still shown');
  await page.click('#h-labels');
  await page.waitForFunction(() => !!document.querySelector('.body-label:not([hidden])'), null, { timeout: 3000 }).catch(() => {});
  assert(await shown() > 0, 'labels not restored');
  await page.click('#h-orbits');
  assert(await page.evaluate(() => !window.PU.app.solar.bodies.get('mars').orbitLine.visible), 'orbit still visible');
  await page.click('#h-orbits');
});
await test('Back navigation: panel → HUD → menu → app exit', async () => {
  const back = () => page.evaluate(() => window.PU.handleBack());
  assert(await back() === true && (await state()).selectedId === null, 'panel not closed');
  assert(await back() === true && (await state()).mode === 'menu', 'not back at menu');
  assert(await back() === false, 'menu should let the app exit');
});
await test('Settings: choosing the male voice saves it and plays it', async () => {
  await page.click('#m-settings');
  await page.click('#o-voice [data-v="male"]');
  await page.waitForFunction(() => window.PU.state().welcomeVoice === 'clip', null, { timeout: 5000 });
  const s = await state();
  assert(s.settings.voice === 'male', `voice setting ${s.settings.voice}`);
  assert(await page.getAttribute('#o-voice [data-v="male"]', 'aria-pressed') === 'true', 'button not pressed');
  await page.click('#o-voice [data-v="female"]');
  await page.evaluate(() => window.PU.handleBack());
});
await test('Sandbox menu entry opens Earth with the Sandbox tab', async () => {
  await page.click('#m-sandbox'); await wait(300);
  assert((await state()).selectedId === 'earth' && await page.isVisible('#tab-sandbox'), 'sandbox not open');
});
await page.close();

console.log('Opening sound');
await test('Android app: plays the recorded voice at launch without a tap, then shows the menu', async () => {
  // The Android shell allows audio without a tap (setMediaPlaybackRequiresUserGesture(false)).
  const autoplay = await chromium.launch({ executablePath, args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--autoplay-policy=no-user-gesture-required'] });
  const p = await autoplay.newPage({ viewport: { width: 412, height: 915 }, isMobile: true, hasTouch: true });
  p.on('pageerror', (e) => errors.push(e.message));
  await p.addInitScript(androidStub);
  await p.goto(url);
  await p.waitForFunction(() => window.PU?.state().welcomeVoice && window.PU.state().welcomeVoice !== 'none', null, { timeout: 60000 });
  assert((await p.evaluate(() => window.PU.state().welcomeVoice)) === 'clip', 'recorded voice not used');
  assert(await p.evaluate(() => window.__spoken.length === 0), 'native speech should not also speak');
  assert(!(await p.isVisible('#welcome-enter')), 'Android should not need a tap');
  await p.waitForFunction(() => window.PU.state().mode === 'menu', null, { timeout: 15000 });
  await autoplay.close();
});
await test('Android app: if audio is blocked, falls back to the phone\'s speech engine', async () => {
  const p = await browser.newPage({ viewport: { width: 412, height: 915 }, isMobile: true, hasTouch: true });
  p.on('pageerror', (e) => errors.push(e.message));
  await p.addInitScript(androidStub);
  await p.goto(url);
  await p.waitForFunction(() => window.__spoken?.length > 0, null, { timeout: 60000 });
  assert((await p.evaluate(() => window.__spoken[0])) === 'Welcome, George', 'wrong phrase');
  assert(!(await p.isVisible('#welcome-enter')), 'Android should not need a tap');
  await p.waitForFunction(() => window.PU.state().mode === 'menu', null, { timeout: 15000 });
  assert(await p.isVisible('#m-exit'), 'Exit should show in the Android app');
  await p.close();
});
await test('With Welcome sound off, the app opens straight to the menu silently', async () => {
  const p = await browser.newPage({ viewport: { width: 1280, height: 760 } });
  await p.addInitScript(speechStub);
  await p.addInitScript(() => localStorage.setItem('george-universal-sandbox.settings.v1', JSON.stringify({ sound: false })));
  await p.goto(url);
  await p.waitForFunction(() => window.PU?.state().mode === 'menu', null, { timeout: 60000 });
  await p.waitForTimeout(1000);
  assert(await p.evaluate(() => window.__spoken.length === 0), 'should be silent');
  assert(!(await p.evaluate(() => window.PU.app.settings.sound)), 'setting not applied');
  await p.close();
});

for (const [name, viewport] of [['phone portrait', { width: 360, height: 740 }], ['phone landscape', { width: 844, height: 390 }], ['tablet', { width: 1024, height: 1366 }]]) {
  console.log(`Layout (${name} ${viewport.width}×${viewport.height})`);
  const p = await browser.newPage({ viewport, isMobile: true, hasTouch: true });
  p.on('pageerror', (e) => errors.push(e.message));
  await test(`Controls are on-screen and unobstructed (${name})`, async () => {
    await p.addInitScript(speechStub);
    await p.goto(url);
    await enterApp(p);
    await p.tap('#m-start'); await p.waitForTimeout(400);
    await p.tap('.chip[data-id="earth"]'); await p.waitForTimeout(400);
    const ids = ['h-menu', 'h-labels', 'h-orbits', 'h-settings', 'c-focus', 'c-overview', 'c-reset', 'k-reset', 'k-slower', 'k-play', 'k-faster', 'p-close', 't-sandbox'];
    const bad = await p.evaluate((ids) => ids.filter((id) => {
      const el = document.getElementById(id); const r = el.getBoundingClientRect();
      if (r.width < 32 || r.right > innerWidth || r.bottom > innerHeight || r.left < 0 || r.top < 0) return true;
      const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
      return !el.contains(hit);
    }), ids);
    assert(bad.length === 0, `blocked or off-screen: ${bad.join(', ')}`);
    const overflow = await p.evaluate(() => document.documentElement.scrollWidth > innerWidth);
    assert(!overflow, 'page scrolls horizontally');
  });
  await p.close();
}

await browser.close();
await test('No JavaScript errors during the run', () => assert(errors.length === 0, errors.join(' | ')));

const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length} passed, ${failed.length} failed`);
process.exit(failed.length ? 1 : 0);
