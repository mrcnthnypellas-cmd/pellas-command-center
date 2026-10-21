import * as THREE from 'three';

const ease = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);

// Orbit-style camera with touch and mouse gestures:
//   one finger / left mouse drag: rotate      pinch / wheel: zoom
//   two-finger drag / right or shift drag: pan      tap: onTap(x, y)
// While following a body, the orbit centre tracks it every frame.
export class CameraRig {
  constructor(camera, element, { onTap, onUserMove } = {}) {
    this.camera = camera;
    this.el = element;
    this.onTap = onTap;
    this.onUserMove = onUserMove;
    this.target = new THREE.Vector3();
    this.distance = 260; this.theta = 0.6; this.phi = 1.05;
    this.minDistance = 4; this.maxDistance = 1400;
    this.follow = null;            // () => Vector3 of the followed body
    this.followMin = 4;
    this.transition = null;
    this.instant = false;          // reduced-motion setting
    this.vel = { theta: 0, phi: 0 };
    this.autoRotate = 0;
    this.pointers = new Map();
    this.#bind();
  }

  #bind() {
    const el = this.el;
    el.style.touchAction = 'none';
    el.addEventListener('pointerdown', (e) => {
      el.setPointerCapture(e.pointerId);
      this.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY, sx: e.clientX, sy: e.clientY, t: performance.now(), button: e.button, shift: e.shiftKey });
      this.vel.theta = this.vel.phi = 0;
      if (this.pointers.size === 2) this.#pinchStart();
    });
    el.addEventListener('pointermove', (e) => {
      const p = this.pointers.get(e.pointerId);
      if (!p) return;
      const dx = e.clientX - p.x, dy = e.clientY - p.y;
      p.x = e.clientX; p.y = e.clientY;
      if (this.pointers.size === 1) {
        if (Math.hypot(p.x - p.sx, p.y - p.sy) < 4) return;
        if (p.button === 2 || p.shift) this.#pan(dx, dy);
        else this.#rotate(dx, dy);
      } else if (this.pointers.size === 2) this.#pinchMove();
    });
    const end = (e) => {
      const p = this.pointers.get(e.pointerId);
      if (!p) return;
      const wasSingle = this.pointers.size === 1;
      this.pointers.delete(e.pointerId);
      if (this.pointers.size === 1) { // continue a one-finger rotate from the remaining finger
        for (const q of this.pointers.values()) { q.sx = q.x; q.sy = q.y; }
      }
      const moved = Math.hypot(e.clientX - p.sx, e.clientY - p.sy);
      if (e.type === 'pointerup' && wasSingle && moved < 10 && performance.now() - p.t < 400 && this.onTap) {
        this.onTap(e.clientX, e.clientY);
      }
    };
    el.addEventListener('pointerup', end);
    el.addEventListener('pointercancel', end);
    el.addEventListener('contextmenu', (e) => e.preventDefault());
    el.addEventListener('wheel', (e) => { e.preventDefault(); this.zoomBy(Math.exp(e.deltaY * 0.0012)); }, { passive: false });
  }

  #rotate(dx, dy) {
    const k = 0.0055;
    this.theta -= dx * k; this.phi -= dy * k;
    this.vel.theta = -dx * k; this.vel.phi = -dy * k;
    this.#clampPhi();
    this.transition = null;
    this.onUserMove?.('rotate');
  }

  #pan(dx, dy) {
    const scale = (this.distance * 2 * Math.tan((this.camera.fov * Math.PI) / 360)) / this.el.clientHeight;
    const right = new THREE.Vector3().setFromMatrixColumn(this.camera.matrix, 0);
    const up = new THREE.Vector3().setFromMatrixColumn(this.camera.matrix, 1);
    if (this.follow) { this.target.copy(this.follow()); this.follow = null; this.onUserMove?.('pan'); }
    this.target.addScaledVector(right, -dx * scale).addScaledVector(up, dy * scale);
    this.transition = null;
  }

  #pinchStart() {
    const [a, b] = [...this.pointers.values()];
    this.pinch = { d: Math.hypot(a.x - b.x, a.y - b.y), mx: (a.x + b.x) / 2, my: (a.y + b.y) / 2 };
  }

  #pinchMove() {
    const [a, b] = [...this.pointers.values()];
    const d = Math.hypot(a.x - b.x, a.y - b.y), mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2;
    if (this.pinch.d > 0) this.zoomBy(this.pinch.d / d);
    const pdx = mx - this.pinch.mx, pdy = my - this.pinch.my;
    // Pan only on a deliberate two-finger drag, so pinching a followed planet keeps it centred.
    if (Math.hypot(pdx, pdy) > 2 && (!this.follow || Math.abs(Math.log(d / this.pinch.d)) < 0.01)) this.#pan(pdx, pdy);
    this.pinch = { d, mx, my };
  }

  #clampPhi() { this.phi = Math.max(0.05, Math.min(Math.PI - 0.05, this.phi)); }

  zoomBy(f) {
    const min = this.follow ? this.followMin : this.minDistance;
    this.distance = Math.max(min, Math.min(this.maxDistance, this.distance * f));
    if (this.transition) this.transition.toDistance = Math.max(min, Math.min(this.maxDistance, this.transition.toDistance * f));
  }

  // Smoothly fly to a state. `follow` is a function returning a live position.
  flyTo({ target, follow = null, distance, theta = this.theta, phi = this.phi, followMin = 4, duration = 1.3 }) {
    this.follow = follow;
    this.followMin = followMin;
    this.transition = {
      t: 0, duration: this.instant ? 0.0001 : duration,
      fromTarget: this.target.clone(), fromDistance: this.distance, fromTheta: this.theta, fromPhi: this.phi,
      toTarget: target ? target.clone() : null, toDistance: distance, toTheta: theta, toPhi: phi,
    };
    // Take the short way round in azimuth.
    const dTheta = Math.atan2(Math.sin(theta - this.theta), Math.cos(theta - this.theta));
    this.transition.toTheta = this.theta + dTheta;
  }

  get busy() { return this.pointers.size > 0; }

  update(dt) {
    if (this.transition) {
      const tr = this.transition;
      tr.t = Math.min(1, tr.t + dt / tr.duration);
      const k = ease(tr.t);
      const goal = this.follow ? this.follow() : tr.toTarget;
      this.target.lerpVectors(tr.fromTarget, goal, k);
      this.distance = tr.fromDistance * Math.pow(tr.toDistance / tr.fromDistance, k);
      this.theta = tr.fromTheta + (tr.toTheta - tr.fromTheta) * k;
      this.phi = tr.fromPhi + (tr.toPhi - tr.fromPhi) * k;
      if (tr.t >= 1) this.transition = null;
    } else {
      if (this.follow) this.target.copy(this.follow());
      if (!this.busy) {
        this.theta += this.vel.theta + this.autoRotate * dt; this.phi += this.vel.phi;
        const damp = Math.exp(-dt * 6);
        this.vel.theta *= damp; this.vel.phi *= damp;
        this.#clampPhi();
      }
    }
    const sp = Math.sin(this.phi);
    this.camera.position.set(
      this.target.x + this.distance * sp * Math.sin(this.theta),
      this.target.y + this.distance * Math.cos(this.phi),
      this.target.z + this.distance * sp * Math.cos(this.theta),
    );
    this.camera.lookAt(this.target);
  }
}
