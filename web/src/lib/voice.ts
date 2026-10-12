// Spoken feedback (Web Speech API) for login and time in/out — no external
// service, works directly in the browser. Cancels any utterance already in
// flight so rapid actions (e.g. a mis-tap) don't queue up and talk over
// each other.

// Common female-sounding system/AI voice names across platforms — Chrome
// (desktop/Android), Safari/iOS/macOS, Edge/Windows. Matched case-insensitively
// against whatever voices the device actually has installed; there's no
// standard "gender" field on SpeechSynthesisVoice, so name-matching is the
// only cross-browser option.
const FEMALE_VOICE_HINTS = [
  "female",
  "samantha", // Safari/iOS/macOS default English
  "victoria",
  "karen",
  "moira",
  "tessa",
  "fiona",
  "susan",
  "allison",
  "ava",
  "zira", // Microsoft Windows
  "aria", // Microsoft Edge (Natural)
  "jenny", // Microsoft Edge (Natural)
  "google us english", // Chrome desktop default — female
  "google uk english female",
];

let cachedVoice: SpeechSynthesisVoice | null | undefined;

function pickFemaleVoice(): SpeechSynthesisVoice | null {
  if (cachedVoice !== undefined) return cachedVoice;
  const voices = window.speechSynthesis.getVoices();
  if (!voices.length) return null; // not loaded yet — try again on the next speak() call

  const english = voices.filter((v) => v.lang?.toLowerCase().startsWith("en"));
  const pool = english.length ? english : voices;
  const match = pool.find((v) => FEMALE_VOICE_HINTS.some((hint) => v.name.toLowerCase().includes(hint)));

  cachedVoice = match ?? null;
  return cachedVoice;
}

export function speak(text: string) {
  if (typeof window === "undefined" || !("speechSynthesis" in window)) return;
  try {
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = "en-US";
    utterance.rate = 1;
    utterance.pitch = 1.05;
    const voice = pickFemaleVoice();
    if (voice) utterance.voice = voice;
    window.speechSynthesis.speak(utterance);
  } catch {
    // speech synthesis unsupported or blocked by the browser — fail silently
  }
}

// Chrome loads voices asynchronously — getVoices() can return an empty list
// on the very first call. Re-resolve the cache once the real list arrives
// so the first utterance after a cold page load still gets a female voice.
if (typeof window !== "undefined" && "speechSynthesis" in window) {
  window.speechSynthesis.addEventListener("voiceschanged", () => {
    cachedVoice = undefined;
  });
}
