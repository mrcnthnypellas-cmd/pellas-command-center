// Spoken feedback (Web Speech API) for login and time in/out — no external
// service, works directly in the browser. Cancels any utterance already in
// flight so rapid actions (e.g. a mis-tap) don't queue up and talk over
// each other.
export function speak(text: string) {
  if (typeof window === "undefined" || !("speechSynthesis" in window)) return;
  try {
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = "en-US";
    utterance.rate = 1;
    window.speechSynthesis.speak(utterance);
  } catch {
    // speech synthesis unsupported or blocked by the browser — fail silently
  }
}
