// Simulation clock. Time is kept as days since the J2000.0 epoch
// (2000-01-01 12:00 TT, treated as UTC — the ~69 s difference is irrelevant here).

export const J2000_UNIX_MS = Date.UTC(2000, 0, 1, 12, 0, 0);
const DAY_MS = 86400000;

// Seconds of simulated time per real second.
export const SPEEDS = [
  { rate: 1, label: '1 s/s', name: 'Real time' },
  { rate: 60, label: '1 min/s' },
  { rate: 3600, label: '1 hr/s' },
  { rate: 21600, label: '6 hr/s' },
  { rate: 86400, label: '1 day/s' },
  { rate: 604800, label: '1 wk/s' },
  { rate: 2629800, label: '1 mo/s' },
  { rate: 31557600, label: '1 yr/s' },
];

export const PRESETS = { slow: 2, normal: 4, fast: 6 };

export function unixMsToDays(ms) { return (ms - J2000_UNIX_MS) / DAY_MS; }
export function daysToDate(days) { return new Date(J2000_UNIX_MS + days * DAY_MS); }

export class SimClock {
  constructor(startDays) {
    this.startDays = startDays;
    this.days = startDays;
    this.speedIndex = PRESETS.normal;
    this.paused = false;
  }
  get speed() { return SPEEDS[this.speedIndex]; }
  // Advances by real elapsed seconds; returns simulated days advanced.
  tick(realSeconds) {
    if (this.paused) return 0;
    const dDays = (realSeconds * this.speed.rate) / 86400;
    this.days += dDays;
    return dDays;
  }
  setSpeedIndex(i) { this.speedIndex = Math.max(0, Math.min(SPEEDS.length - 1, i)); }
  faster() { this.setSpeedIndex(this.speedIndex + 1); }
  slower() { this.setSpeedIndex(this.speedIndex - 1); }
  reset() { this.days = this.startDays; }
}
