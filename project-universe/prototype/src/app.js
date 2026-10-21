import * as THREE from 'three';
import { BODIES, BODY_BY_ID, orbitalPeriodDays } from './data/bodies.js';
import { SimClock, SPEEDS, PRESETS, unixMsToDays, daysToDate } from './sim/clock.js';
import { SolarScene } from './render/scene.js';
import { CameraRig } from './render/camera.js';
import { loadSettings, saveSettings, DEFAULTS, QUALITY } from './settings.js';
import { playWelcome } from './audio/welcome.js';
import { fmt, massText, durationDays, auText, auToMillionKm, dateText, multText } from './ui/format.js';

const $ = (id) => document.getElementById(id);
// When labels would overlap, earlier entries win.
const LABEL_PRIORITY = ['sun', 'jupiter', 'saturn', 'earth', 'mars', 'venus', 'mercury', 'uranus', 'neptune', 'moon'];
const RATE_WORDS = { 1: 'Real time', 60: '1 minute per second', 3600: '1 hour per second', 21600: '6 hours per second',
  86400: '1 day per second', 604800: '1 week per second', 2629800: '1 month per second', 31557600: '1 year per second' };

export class App {
  constructor() {
    this.settings = loadSettings();
    this.mode = 'boot';
    this.selectedId = null;
    this.tab = 'info';
    this.lastUi = 0;
    this.v = new THREE.Vector3();
    this.android = typeof window.AndroidBridge !== 'undefined';
    this.viewOffset = { x: 0, y: 0, tx: 0, ty: 0 };
    this.free = null;
  }

  async boot() {
    await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
    const canvas = $('scene');
    try {
      this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
    } catch (err) {
      $('boot').querySelector('.boot-text').textContent = 'This device or browser cannot start WebGL, which George Universal Sunbox needs to draw the 3D view.';
      throw err;
    }
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.05;
    this.camera = new THREE.PerspectiveCamera(50, 1, 0.05, 20000);

    const quality = QUALITY[this.settings.quality];
    this.solar = new SolarScene(quality);
    this.clock = new SimClock(unixMsToDays(Date.now()));
    this.rig = new CameraRig(this.camera, canvas, {
      onTap: (x, y) => this.#tap(x, y),
    });

    this.#buildLabels();
    this.#buildStrip();
    this.#wire();
    this.#applySettings();
    this.#resize();
    window.addEventListener('resize', () => this.#resize());

    this.solar.update(this.clock.days, 0);
    this.showMenu(true);
    if (this.settings.sound) this.#showWelcome();
    this.last = performance.now();
    this.renderer.setAnimationLoop(() => this.#frame());
    $('boot').classList.add('done');
    setTimeout(() => { $('boot').hidden = true; }, 600);
  }

  // ---------------------------------------------------------------- frame
  #frame() {
    const now = performance.now();
    const dt = Math.min(0.1, (now - this.last) / 1000);
    this.last = now;
    const dDays = this.clock.tick(dt);
    this.solar.update(this.clock.days, dDays);
    this.rig.update(dt);
    this.#applyViewOffset(dt);
    this.solar.starfield.position.copy(this.camera.position);
    this.renderer.render(this.solar.scene, this.camera);
    this.#updateOverlay();
    if (now - this.lastUi > 250) { this.lastUi = now; this.#updateReadouts(); this.#measureFreeArea(); }
  }

  // The screen area not covered by HUD panels. The 3D view is re-centred on it
  // (via a projection offset) so a focused planet is never hidden behind the info panel.
  #measureFreeArea() {
    const w = window.innerWidth, h = window.innerHeight;
    let left = 0, top = 0, right = w, bottom = h;
    if (this.mode === 'menu') {
      if (w >= 820) left = Math.min(w * 0.45, $('menu').querySelector('.menu-inner').getBoundingClientRect().right);
    } else if (this.mode === 'sim') {
      top = $('h-menu').getBoundingClientRect().bottom + 8;
      bottom = $('hud-bottom-anchor').getBoundingClientRect().top - 8;
      const panel = $('panel');
      if (!panel.hidden && w >= 820) right = panel.getBoundingClientRect().left - 8;
    }
    if (bottom - top < 120) { top = 0; bottom = h; }
    this.free = { left, top, right, bottom };
    this.viewOffset.tx = w / 2 - (left + right) / 2;
    this.viewOffset.ty = h / 2 - (top + bottom) / 2;
  }

  #applyViewOffset(dt) {
    const o = this.viewOffset;
    const k = this.settings.reduceMotion ? 1 : 1 - Math.exp(-dt * 7);
    o.x += (o.tx - o.x) * k; o.y += (o.ty - o.y) * k;
    const w = window.innerWidth, h = window.innerHeight;
    if (Math.abs(o.x) < 0.5 && Math.abs(o.y) < 0.5) this.camera.clearViewOffset();
    else this.camera.setViewOffset(w, h, o.x, o.y, w, h);
  }

  #resize() {
    const w = window.innerWidth, h = window.innerHeight;
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, QUALITY[this.settings.quality].pixelRatio));
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }

  // Screen position and on-screen radius (px) for a body.
  screenOf(id) {
    const b = this.solar.bodies.get(id);
    const v = this.v.copy(b.anchor.position).project(this.camera);
    const w = window.innerWidth, h = window.innerHeight;
    const dist = this.camera.position.distanceTo(b.anchor.position);
    const pxR = (this.solar.displayRadiusOf(id) / (dist * Math.tan((this.camera.fov * Math.PI) / 360))) * (h / 2);
    return { x: (v.x + 1) * 0.5 * w, y: (1 - v.y) * 0.5 * h, visible: v.z < 1 && v.z > -1, pxR };
  }

  #updateOverlay() {
    const showLabels = this.mode === 'sim' && this.settings.labels;
    const placed = [];
    const order = this.selectedId ? [this.selectedId, ...LABEL_PRIORITY.filter((i) => i !== this.selectedId)] : LABEL_PRIORITY;
    for (const id of order) {
      const el = this.labels.get(id);
      const s = this.screenOf(id);
      let show = showLabels && s.visible;
      const x = s.x + Math.max(s.pxR, 3) + 2;
      const box = { l: x, r: x + 24 + el.textContent.length * 9, t: s.y - 9, b: s.y + 9 };
      // Skip a label that would collide with one already placed, or sit on top of a planet.
      if (show) show = !placed.some((p) => box.l < p.r && box.r > p.l && box.t < p.b && box.b > p.t);
      if (show) placed.push(box, { l: s.x - s.pxR, r: s.x + s.pxR, t: s.y - s.pxR, b: s.y + s.pxR });
      if (el.hidden === show) el.hidden = !show;
      if (show) el.style.transform = `translate(${x.toFixed(1)}px, ${s.y.toFixed(1)}px)`;
    }
    const ring = $('select-ring');
    if (this.selectedId && this.mode === 'sim') {
      const s = this.screenOf(this.selectedId);
      const d = Math.max(28, s.pxR * 2 + 14);
      ring.hidden = !s.visible;
      ring.style.width = ring.style.height = `${d.toFixed(1)}px`;
      ring.style.transform = `translate(${(s.x - d / 2).toFixed(1)}px, ${(s.y - d / 2).toFixed(1)}px)`;
    } else ring.hidden = true;
  }

  #tap(x, y) {
    if (this.mode !== 'sim') return;
    let best = null, bestScore = Infinity;
    for (const def of BODIES) {
      const s = this.screenOf(def.id);
      if (!s.visible) continue;
      const d = Math.hypot(s.x - x, s.y - y);
      if (d > Math.max(s.pxR + 10, 26)) continue;
      const score = d - s.pxR;
      if (score < bestScore) { bestScore = score; best = def.id; }
    }
    if (!best) return;
    const now = performance.now();
    if (best === this.selectedId && now - (this.lastTap || 0) < 450) this.focusSelected();
    this.lastTap = now;
    this.select(best);
  }

  // ---------------------------------------------------------------- menu / modes
  showMenu(initial = false) {
    this.mode = 'menu';
    $('menu').hidden = false;
    $('hud').hidden = true;
    $('menu-date').textContent = '';
    this.#measureFreeArea();
    this.rig.autoRotate = this.settings.reduceMotion ? 0 : 0.035;
    this.rig.flyTo({ target: new THREE.Vector3(0, 0, 0), distance: 165, phi: 1.2, theta: this.rig.theta, duration: initial ? 0.0001 : 1.6 });
    if (initial) { this.rig.distance = 165; this.rig.phi = 1.2; }
    $('m-start').focus({ preventScroll: true });
  }

  enterSim(view) {
    this.mode = 'sim';
    this.rig.autoRotate = 0;
    $('menu').hidden = true;
    $('hud').hidden = false;
    this.#measureFreeArea();
    if (view === 'overview') this.overview();
    else if (view === 'start') this.rig.flyTo({ target: new THREE.Vector3(0, 0, 0), distance: 120, phi: 1.1, theta: this.rig.theta + 0.4, duration: 1.6 });
    this.#updateReadouts();
  }

  // Opening screen. The Android app plays the welcome sound straight away; browsers
  // only allow sound after a tap, so there the screen waits for "Tap to enter".
  #showWelcome() {
    this.mode = 'welcome';
    $('menu').hidden = true;
    const el = $('welcome');
    el.hidden = false;
    const leave = () => {
      if (this.mode !== 'welcome') return;
      clearTimeout(this.welcomeTimer);
      el.classList.add('leaving');
      setTimeout(() => { el.hidden = true; el.classList.remove('leaving'); }, 600);
      this.mode = 'menu';
      $('menu').hidden = false;
      $('m-start').focus({ preventScroll: true });
    };
    this.leaveWelcome = leave;
    if (this.android) {
      $('welcome-hint').hidden = false;
      playWelcome();
      this.welcomeTimer = setTimeout(leave, 3000);
      el.onclick = leave;
    } else {
      const enter = $('welcome-enter');
      enter.hidden = false;
      enter.focus({ preventScroll: true });
      el.onclick = () => {
        if (this.mode !== 'welcome' || this.welcomeTimer) return;
        enter.hidden = true;
        playWelcome();
        this.welcomeTimer = setTimeout(leave, 1800);
      };
    }
  }

  handleBack() {
    if (this.mode === 'welcome') { this.leaveWelcome(); return true; }
    if (!$('settings').hidden) { this.closeSettings(); return true; }
    if (this.mode === 'sim') {
      if (this.selectedId) { this.select(null); return true; }
      this.showMenu();
      return true;
    }
    return false;
  }

  // ---------------------------------------------------------------- selection / camera
  select(id) {
    this.selectedId = id;
    this.solar.setSelected(id);
    for (const [bid, el] of this.labels) el.classList.toggle('selected', bid === id);
    for (const chip of $('body-strip').children) chip.setAttribute('aria-selected', String(chip.dataset.id === id));
    $('c-focus').disabled = !id;
    const panel = $('panel');
    panel.hidden = !id;
    $('hud').classList.toggle('panel-open', !!id);
    requestAnimationFrame(() => this.#measureFreeArea());
    if (!id) return;
    const def = BODY_BY_ID[id];
    $('p-name').textContent = def.name;
    $('p-type').textContent = def.typeLabel;
    $('p-swatch').style.background = def.visual.color;
    $('s-mass').textContent = massText(def.physical.massKg).main;
    this.#syncSandbox();
    this.#renderFacts();
    $('body-strip').querySelector(`[data-id="${id}"]`)?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  }

  focusSelected() {
    if (!this.selectedId) return;
    const id = this.selectedId;
    const r = this.solar.displayRadiusOf(id);
    const b = this.solar.bodies.get(id);
    // Frame the body so it fills a set share of the unobstructed screen area.
    this.#measureFreeArea();
    const f = this.free;
    const share = id === 'saturn' ? 0.1 : id === 'sun' ? 0.22 : 0.16;
    const targetPx = Math.min(f.right - f.left, f.bottom - f.top) * share;
    const distance = (r * (window.innerHeight / 2)) / (targetPx * Math.tan((this.camera.fov * Math.PI) / 360));
    this.rig.flyTo({ follow: () => b.anchor.position, distance, followMin: r * 1.6, phi: Math.min(this.rig.phi, 1.25) });
  }

  overview() {
    this.#measureFreeArea();
    const fitR = 232;
    const f = this.free, h = window.innerHeight;
    const halfPx = Math.min(f.right - f.left, f.bottom - f.top) / 2;
    const distance = (fitR * (h / 2)) / (halfPx * Math.tan((this.camera.fov * Math.PI) / 360)) * 1.04;
    this.rig.flyTo({ target: new THREE.Vector3(0, 0, 0), distance, phi: 0.18, theta: this.rig.theta });
    this.#toast('Solar system overview');
  }

  resetCamera() {
    this.rig.flyTo({ target: new THREE.Vector3(0, 0, 0), distance: 150, phi: 1.12, theta: 0.6 });
    this.#toast('Camera reset');
  }

  // ---------------------------------------------------------------- build DOM
  #buildLabels() {
    this.labels = new Map();
    const layer = $('labels');
    for (const def of BODIES) {
      const el = document.createElement('button');
      el.type = 'button';
      el.className = 'body-label';
      el.textContent = def.name;
      el.hidden = true;
      el.dataset.id = def.id;
      el.addEventListener('click', () => this.select(def.id));
      el.addEventListener('dblclick', () => { this.select(def.id); this.focusSelected(); });
      layer.appendChild(el);
      this.labels.set(def.id, el);
    }
  }

  #buildStrip() {
    const strip = $('body-strip');
    for (const def of BODIES) {
      const chip = document.createElement('button');
      chip.type = 'button';
      chip.className = 'chip';
      chip.setAttribute('role', 'option');
      chip.setAttribute('aria-selected', 'false');
      chip.dataset.id = def.id;
      chip.innerHTML = `<span class="dot" style="background:${def.visual.color}"></span>${def.name}`;
      chip.addEventListener('click', () => {
        if (this.selectedId === def.id) this.focusSelected();
        else this.select(def.id);
      });
      strip.appendChild(chip);
    }
  }

  #wire() {
    $('m-start').onclick = () => { this.clock.paused = false; this.enterSim('start'); };
    $('m-solar').onclick = () => this.enterSim('overview');
    $('m-sandbox').onclick = () => { this.enterSim(); this.select('earth'); this.focusSelected(); this.setTab('sandbox'); };
    $('m-settings').onclick = () => this.openSettings();
    $('m-exit').hidden = !this.android;
    $('m-exit').onclick = () => window.AndroidBridge?.exitApp();

    $('h-menu').onclick = () => this.showMenu();
    $('h-settings').onclick = () => this.openSettings();
    $('h-labels').onclick = () => this.#setSetting('labels', !this.settings.labels);
    $('h-orbits').onclick = () => this.#setSetting('orbits', !this.settings.orbits);

    $('c-focus').onclick = () => this.focusSelected();
    $('c-overview').onclick = () => this.overview();
    $('c-reset').onclick = () => this.resetCamera();
    $('c-focus').disabled = true;

    $('k-play').onclick = () => { this.clock.paused = !this.clock.paused; this.#toast(this.clock.paused ? 'Paused' : 'Running'); this.#updateReadouts(); };
    $('k-faster').onclick = () => { this.clock.faster(); this.#updateReadouts(); };
    $('k-slower').onclick = () => { this.clock.slower(); this.#updateReadouts(); };
    $('k-reset').onclick = () => {
      this.clock.reset();
      for (const b of this.solar.bodies.values()) b.orbitDays = this.clock.days;
      this.#toast('Simulation time reset');
      this.#updateReadouts();
    };
    for (const btn of document.querySelectorAll('[data-preset]')) {
      btn.onclick = () => { this.clock.setSpeedIndex(PRESETS[btn.dataset.preset]); this.clock.paused = false; this.#updateReadouts(); };
    }

    $('p-close').onclick = () => this.select(null);
    $('t-info').onclick = () => this.setTab('info');
    $('t-sandbox').onclick = () => this.setTab('sandbox');
    $('s-size').oninput = () => this.#sandboxInput();
    $('s-rate').oninput = () => this.#sandboxInput();
    $('s-apply').onclick = () => this.#sandboxApply();
    $('s-restore').onclick = () => this.#sandboxRestore(this.selectedId);
    $('s-restore-all').onclick = () => this.#sandboxRestore(null);

    $('set-close').onclick = () => this.closeSettings();
    $('settings').addEventListener('click', (e) => { if (e.target === $('settings')) this.closeSettings(); });
    $('o-labels').onchange = (e) => this.#setSetting('labels', e.target.checked);
    $('o-orbits').onchange = (e) => this.#setSetting('orbits', e.target.checked);
    $('o-spin').onchange = (e) => this.#setSetting('spin', e.target.checked);
    $('o-motion').onchange = (e) => this.#setSetting('reduceMotion', e.target.checked);
    $('o-sound').onchange = (e) => this.#setSetting('sound', e.target.checked);
    for (const btn of $('o-quality').children) btn.onclick = () => this.#setSetting('quality', btn.dataset.q);
    $('o-reset').onclick = () => { this.settings = { ...DEFAULTS }; saveSettings(this.settings); this.#applySettings(); this.#resize(); this.#toast('Settings restored'); };

    window.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') this.handleBack();
      else if (e.key === ' ' && this.mode === 'sim' && e.target === document.body) { e.preventDefault(); $('k-play').click(); }
    });
  }

  // ---------------------------------------------------------------- settings
  openSettings() { $('settings').hidden = false; $('set-close').focus({ preventScroll: true }); }
  closeSettings() { $('settings').hidden = true; }

  #setSetting(key, value) {
    this.settings[key] = value;
    saveSettings(this.settings);
    this.#applySettings();
    if (key === 'quality') this.#resize();
  }

  #applySettings() {
    const s = this.settings;
    this.solar.setShowOrbits(s.orbits);
    this.solar.spinEnabled = s.spin;
    this.rig.instant = s.reduceMotion;
    if (this.mode === 'menu') this.rig.autoRotate = s.reduceMotion ? 0 : 0.035;
    $('h-labels').setAttribute('aria-pressed', String(s.labels));
    $('h-orbits').setAttribute('aria-pressed', String(s.orbits));
    $('o-labels').checked = s.labels;
    $('o-orbits').checked = s.orbits;
    $('o-spin').checked = s.spin;
    $('o-motion').checked = s.reduceMotion;
    $('o-sound').checked = s.sound;
    for (const btn of $('o-quality').children) btn.setAttribute('aria-pressed', String(btn.dataset.q === s.quality));
  }

  // ---------------------------------------------------------------- panel
  setTab(tab) {
    this.tab = tab;
    $('t-info').setAttribute('aria-selected', String(tab === 'info'));
    $('t-sandbox').setAttribute('aria-selected', String(tab === 'sandbox'));
    $('tab-info').hidden = tab !== 'info';
    $('tab-sandbox').hidden = tab !== 'sandbox';
  }

  #renderFacts() {
    const id = this.selectedId;
    if (!id) return;
    const def = BODY_BY_ID[id];
    const b = this.solar.bodies.get(id);
    const ph = def.physical;
    const rows = [];
    const row = (k, v, sub) => rows.push(`<dt>${k}</dt><dd>${v}${sub ? `<small>${sub}</small>` : ''}</dd>`);
    row('Diameter', `${fmt(ph.diameterKm)} km`, id === 'earth' ? null : `${fmt(ph.diameterKm / 12756, ph.diameterKm > 12756 * 10 ? 1 : 3)} × Earth`);
    const m = massText(ph.massKg);
    row('Mass', m.main, m.sub);
    const dist = this.solar.distances(id);
    if (id === 'sun') row('Distance from Sun', '—', 'Centre of the system');
    else row('Distance from Sun', auText(dist.sunAU), `${auToMillionKm(dist.sunAU)} · now`);
    if (def.orbit) row('Mean distance', auText(def.orbit.elements[0]), 'Semi-major axis');
    if (def.lunarOrbit) row('Distance from Earth', `${fmt(dist.earthKm)} km`, `Mean ${fmt(def.lunarOrbit.semiMajorKm)} km`);
    const period = orbitalPeriodDays(def);
    if (period) row('Orbital period', durationDays(period), id === 'moon' ? 'Sidereal, around Earth' : `${fmt(period, 1)} Earth days`);
    else row('Orbital period', '—', 'Orbits the galactic centre');
    if (ph.rotationHours) row('Rotation period', durationDays(Math.abs(ph.rotationHours) / 24),
      ph.rotationHours < 0 ? 'Retrograde (sidereal)' : id === 'sun' ? 'At the equator (sidereal)' : 'Sidereal');
    row('Axial tilt', `${fmt(ph.axialTiltDeg, 2)}°`);
    rows.push('<div class="sep"></div>');
    const dt = dateText(daysToDate(this.clock.days));
    row('Simulation time', dt.date, dt.time);
    row('Simulation speed', this.clock.paused ? 'Paused' : this.clock.speed.label, multText(this.clock.speed.rate));
    if (b.sizeMul !== 1 || b.orbitRate !== 1) {
      row('Sandbox changes', `<span style="color:var(--amber)">Active</span>`,
        `Size ${fmt(b.sizeMul, 2)}× (visual) · Orbit ${fmt(b.orbitRate, 1)}× (kinematic)`);
    }
    $('p-facts').innerHTML = rows.join('');
  }

  #syncSandbox() {
    const b = this.solar.bodies.get(this.selectedId);
    $('s-size').value = b.sizeMul;
    $('s-rate').value = b.orbitRate;
    $('s-rate').disabled = this.selectedId === 'sun';
    $('s-status').textContent = this.selectedId === 'sun' ? 'The Sun sits at the centre, so it has no orbit to speed up.' : '';
    this.#sandboxInput();
  }

  #sandboxInput() {
    const b = this.solar.bodies.get(this.selectedId);
    if (!b) return;
    const size = Number($('s-size').value), rate = Number($('s-rate').value);
    $('s-size-out').textContent = `${fmt(size, 2)}×`;
    $('s-rate-out').textContent = `${fmt(rate, 1)}×`;
    $('s-apply').disabled = size === b.sizeMul && rate === b.orbitRate;
  }

  #sandboxApply() {
    const id = this.selectedId;
    const size = Number($('s-size').value), rate = Number($('s-rate').value);
    this.solar.setOverrides(id, { sizeMul: size, orbitRate: rate });
    $('s-status').textContent = `Applied to ${BODY_BY_ID[id].name}: size ${fmt(size, 2)}× (visual only), orbital speed ${fmt(rate, 1)}× (kinematic).`;
    this.#afterSandboxChange();
  }

  #sandboxRestore(id) {
    const ids = id ? [id] : BODIES.map((d) => d.id);
    for (const bid of ids) this.solar.resetOverrides(bid, this.clock.days);
    $('s-status').textContent = id ? `${BODY_BY_ID[id].name} restored to its original size and orbit.` : 'All bodies restored to their original size and orbits.';
    this.#afterSandboxChange();
  }

  #afterSandboxChange() {
    for (const chip of $('body-strip').children) {
      const b = this.solar.bodies.get(chip.dataset.id);
      chip.classList.toggle('modified', b.sizeMul !== 1 || b.orbitRate !== 1);
    }
    if (this.selectedId) {
      const st = $('s-status').textContent;
      this.#syncSandbox();
      $('s-status').textContent = st;
      this.#renderFacts();
    }
  }

  // ---------------------------------------------------------------- readouts
  #updateReadouts() {
    const c = this.clock;
    const d = dateText(daysToDate(c.days));
    const set = (id, text) => { const el = $(id); if (el.textContent !== text) el.textContent = text; };
    set('h-date', d.date);
    set('h-time', c.paused ? `${d.time} · Paused` : d.time);
    const outside = d.year > 2050 || d.year < 1800;
    if ($('h-warn').hidden === outside) $('h-warn').hidden = !outside;
    $('h-state').classList.toggle('paused', c.paused);
    set('menu-date', `${d.date} · ${d.time}`);
    set('k-mult', multText(c.speed.rate));
    set('k-label', c.paused ? 'Paused' : RATE_WORDS[c.speed.rate]);
    const play = $('k-play');
    play.classList.toggle('paused', c.paused);
    play.setAttribute('aria-label', c.paused ? 'Resume' : 'Pause');
    play.title = c.paused ? 'Resume' : 'Pause';
    $('k-faster').disabled = c.speedIndex === SPEEDS.length - 1;
    $('k-slower').disabled = c.speedIndex === 0;
    for (const btn of document.querySelectorAll('[data-preset]')) btn.setAttribute('aria-pressed', String(PRESETS[btn.dataset.preset] === c.speedIndex));
    if (this.selectedId && this.tab === 'info') this.#renderFacts();
  }

  #toast(text) {
    const t = $('toast');
    t.textContent = text;
    t.hidden = false;
    clearTimeout(this.toastTimer);
    this.toastTimer = setTimeout(() => { t.hidden = true; }, 1400);
  }

  // State summary used by automated tests.
  debugState() {
    if (!this.solar) return { mode: this.mode };
    const bodies = {};
    for (const [id, b] of this.solar.bodies) bodies[id] = { pos: b.anchor.position.toArray(), sizeMul: b.sizeMul, orbitRate: b.orbitRate, orbitDays: b.orbitDays };
    return {
      mode: this.mode, selectedId: this.selectedId, days: this.clock.days, paused: this.clock.paused,
      speedRate: this.clock.speed.rate, camera: { distance: this.rig.distance, target: this.rig.target.toArray(), following: !!this.rig.follow, transitioning: !!this.rig.transition },
      bodies, settings: { ...this.settings },
    };
  }
}
