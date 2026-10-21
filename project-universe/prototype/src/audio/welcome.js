// Opening sound: a soft synthesized chime followed by a recorded voice saying
// "Welcome, George". The voice clips are bundled in the app (assets/voice,
// made with tools/make_voice.py), so they sound the same on every device and
// work offline. If a clip cannot play, the device's own speech engine is used
// instead: native text-to-speech in the Android app, the Web Speech API in browsers.

import femaleClip from '../../assets/voice/welcome-female.mp3';
import maleClip from '../../assets/voice/welcome-male.mp3';
import badingClip from '../../assets/voice/welcome-bading.mp3';

export const WELCOME_TEXT = 'Welcome, George';
const CLIPS = { female: femaleClip, male: maleClip, bading: badingClip };
const VOICE_DELAY = 0.6; // seconds after the chime starts

// What the last welcome actually used: 'clip', 'speech' or 'none'. Read by tests.
export const welcomeStatus = { voice: 'none' };

let ctx = null;
function audioContext() {
  const AC = window.AudioContext || window.webkitAudioContext;
  if (!AC) return null;
  if (!ctx) ctx = new AC();
  return ctx;
}

function chime(ac, t0) {
  const master = ac.createGain();
  master.gain.value = 0.2;
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

const decoded = {};
function decodeClip(ac, voice) {
  if (!decoded[voice]) {
    const bytes = Uint8Array.from(atob(CLIPS[voice]), (c) => c.charCodeAt(0));
    // Callback form of decodeAudioData for older Android WebViews and Safari.
    decoded[voice] = new Promise((resolve, reject) => ac.decodeAudioData(bytes.buffer, resolve, reject));
  }
  return decoded[voice];
}

function playClip(ac, buffer, when) {
  const src = ac.createBufferSource();
  src.buffer = buffer;
  const gain = ac.createGain();
  gain.gain.value = 1;
  src.connect(gain);
  gain.connect(ac.destination);
  src.start(when);
}

function speakInBrowser(text) {
  const synth = window.speechSynthesis;
  if (!synth || typeof window.SpeechSynthesisUtterance !== 'function') return false;
  const u = new window.SpeechSynthesisUtterance(text);
  u.lang = 'en-US';
  u.rate = 0.92;
  const english = (synth.getVoices() || []).filter((v) => /^en[-_]/i.test(v.lang));
  u.voice = english.find((v) => /natural|google|samantha|daniel|aria|jenny/i.test(v.name)) || english[0] || null;
  synth.cancel();
  synth.speak(u);
  return true;
}

function speakFallback() {
  try {
    if (window.AndroidBridge?.speak) { window.AndroidBridge.speak(WELCOME_TEXT); welcomeStatus.voice = 'speech'; }
    else if (speakInBrowser(WELCOME_TEXT)) welcomeStatus.voice = 'speech';
  } catch { /* no speech available */ }
}

// Plays the chime now and "Welcome, George" just after it.
export function playWelcome(voice = 'female') {
  welcomeStatus.voice = 'none';
  const ac = audioContext();
  if (!ac) { setTimeout(speakFallback, VOICE_DELAY * 1000); return; }
  if (ac.state === 'suspended') ac.resume().catch(() => {});
  const t0 = ac.currentTime + 0.05;
  try { chime(ac, t0); } catch { /* chime is optional */ }
  let done = false;
  decodeClip(ac, CLIPS[voice] ? voice : 'female')
    .then((buffer) => {
      if (done || ac.state !== 'running') return;
      done = true;
      playClip(ac, buffer, Math.max(ac.currentTime + 0.02, t0 + VOICE_DELAY));
      welcomeStatus.voice = 'clip';
    })
    .catch(() => {});
  // Audio blocked (e.g. no tap yet) or clip failed: use the speech engine instead.
  setTimeout(() => {
    if (done) return;
    done = true;
    speakFallback();
  }, VOICE_DELAY * 1000 + 250);
}
