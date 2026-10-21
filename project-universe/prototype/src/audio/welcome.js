// Opening sound: a soft synthesized chime followed by a spoken "Welcome, George".
// Everything is generated on the device (Web Audio + text-to-speech), so no
// audio files are bundled and it works offline.
//   Android app: speech uses the phone's own text-to-speech via the native bridge.
//   Browser: speech uses the Web Speech API; browsers only allow it after a tap.

export const WELCOME_TEXT = 'Welcome, George';

let ctx = null;
function audioContext() {
  const AC = window.AudioContext || window.webkitAudioContext;
  if (!AC) return null;
  if (!ctx) ctx = new AC();
  return ctx;
}

function chime() {
  const ac = audioContext();
  if (!ac) return;
  if (ac.state === 'suspended') ac.resume().catch(() => {});
  const t0 = ac.currentTime + 0.05;

  const master = ac.createGain();
  master.gain.value = 0.22;
  const lowpass = ac.createBiquadFilter();
  lowpass.type = 'lowpass';
  lowpass.frequency.value = 3200;
  // Short feedback echo for a sense of space.
  const delay = ac.createDelay(1);
  delay.delayTime.value = 0.28;
  const feedback = ac.createGain();
  feedback.gain.value = 0.32;
  lowpass.connect(master);
  lowpass.connect(delay);
  delay.connect(feedback);
  feedback.connect(delay);
  delay.connect(master);
  master.connect(ac.destination);

  // A-major add9 pad, notes entering one after another.
  const notes = [220, 329.63, 440, 554.37, 659.25, 987.77];
  notes.forEach((f, i) => {
    const start = t0 + i * 0.11;
    const osc = ac.createOscillator();
    osc.type = i < 3 ? 'sine' : 'triangle';
    osc.frequency.value = f;
    const g = ac.createGain();
    const peak = i < 3 ? 0.32 : 0.14;
    g.gain.setValueAtTime(0, start);
    g.gain.linearRampToValueAtTime(peak, start + 0.08);
    g.gain.exponentialRampToValueAtTime(0.0008, start + 3.2);
    osc.connect(g);
    g.connect(lowpass);
    osc.start(start);
    osc.stop(start + 3.3);
  });
}

function speakInBrowser(text) {
  const synth = window.speechSynthesis;
  if (!synth || typeof window.SpeechSynthesisUtterance !== 'function') return false;
  const u = new window.SpeechSynthesisUtterance(text);
  u.lang = 'en-US';
  u.rate = 0.92;
  u.pitch = 1;
  u.volume = 1;
  const voices = synth.getVoices() || [];
  const english = voices.filter((v) => /^en[-_]/i.test(v.lang));
  u.voice = english.find((v) => /natural|google|samantha|daniel|aria|jenny/i.test(v.name)) || english[0] || null;
  synth.cancel();
  synth.speak(u);
  return true;
}

// Plays the chime now and the voice just after it.
export function playWelcome() {
  try { chime(); } catch { /* audio unavailable: continue silently */ }
  setTimeout(() => {
    try {
      if (window.AndroidBridge?.speak) window.AndroidBridge.speak(WELCOME_TEXT);
      else speakInBrowser(WELCOME_TEXT);
    } catch { /* speech unavailable */ }
  }, 650);
}
