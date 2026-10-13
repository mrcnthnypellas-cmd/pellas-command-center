import { useEffect } from "react";
import { speak } from "./voice";

// Daily spoken announcement — fires once, in every open tab, the first time
// the local clock (Asia/Manila) reaches the configured time. No backend
// involved: purely a client-side timer, de-duped per day via localStorage
// so a 20s poll doesn't re-speak it repeatedly within the same minute.
const ANNOUNCEMENTS: { time: string; message: string }[] = [
  {
    time: "17:00",
    message:
      "Attention everyone, it is now 5:00 PM. Please wrap up your remaining tasks and log out. For those who need to work overtime, please ensure your OT request form is submitted and approved by your supervisor. Have a safe commute!",
  },
];

function currentTimeHHMM(): string {
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Manila",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(new Date());
}

function todayDateKey(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Manila" }).format(new Date());
}

export function useScheduledVoiceAnnouncements() {
  useEffect(() => {
    function tick() {
      const now = currentTimeHHMM();
      for (const a of ANNOUNCEMENTS) {
        if (a.time !== now) continue;
        const key = `voice_announced_${todayDateKey()}_${a.time}`;
        if (localStorage.getItem(key)) continue;
        localStorage.setItem(key, "1");
        speak(a.message);
      }
    }
    tick();
    const interval = setInterval(tick, 20000);
    return () => clearInterval(interval);
  }, []);
}
