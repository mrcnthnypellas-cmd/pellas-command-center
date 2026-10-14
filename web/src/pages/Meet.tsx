import { useEffect, useRef, useState } from "react";
import { Video, Copy, LogIn } from "lucide-react";
import { useAuth } from "../lib/auth";
import { useToast } from "../lib/toast";
import { Button, Card, Input } from "../components/ui/ui";

// Free public Jitsi server — no account/API key needed, works anywhere with
// an internet connection. Not bank-vault private: anyone who knows the exact
// room code can join, same as an unprotected Zoom/Meet link, so the code
// should only be shared with people meant to join (via Chat, for instance).
declare global {
  interface Window {
    JitsiMeetExternalAPI?: new (domain: string, options: Record<string, unknown>) => {
      dispose: () => void;
    };
  }
}

const JITSI_DOMAIN = "meet.jit.si";
let scriptPromise: Promise<void> | null = null;

function loadJitsiScript(): Promise<void> {
  if (window.JitsiMeetExternalAPI) return Promise.resolve();
  if (scriptPromise) return scriptPromise;
  scriptPromise = new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = `https://${JITSI_DOMAIN}/external_api.js`;
    script.async = true;
    script.onload = () => resolve();
    script.onerror = () => {
      scriptPromise = null;
      reject(new Error("Failed to load meeting service."));
    };
    document.body.appendChild(script);
  });
  return scriptPromise;
}

function randomRoomCode(companyId: string) {
  const rand = Math.random().toString(36).slice(2, 8);
  return `pellas-${companyId.slice(0, 8)}-${rand}`;
}

export default function Meet() {
  const { profile } = useAuth();
  const { push } = useToast();
  const [roomCode, setRoomCode] = useState<string | null>(null);
  const [joinCode, setJoinCode] = useState("");
  const [loading, setLoading] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const apiRef = useRef<{ dispose: () => void } | null>(null);

  useEffect(() => {
    return () => {
      apiRef.current?.dispose();
    };
  }, []);

  async function startMeeting(code?: string) {
    if (!profile) return;
    setLoading(true);
    try {
      await loadJitsiScript();
      const room = code || randomRoomCode(profile.company_id);
      setRoomCode(room);
      // Wait a tick for the container div to actually mount before attaching Jitsi to it.
      setTimeout(() => {
        if (!containerRef.current || !window.JitsiMeetExternalAPI) return;
        apiRef.current?.dispose();
        apiRef.current = new window.JitsiMeetExternalAPI(JITSI_DOMAIN, {
          roomName: room,
          parentNode: containerRef.current,
          width: "100%",
          height: "100%",
          userInfo: { displayName: `${profile.first_name} ${profile.last_name}` },
          configOverwrite: { prejoinPageEnabled: false },
        });
      }, 0);
    } catch {
      push("error", "Hindi ma-load ang video call service. Subukan ulit.");
    } finally {
      setLoading(false);
    }
  }

  function leaveMeeting() {
    apiRef.current?.dispose();
    apiRef.current = null;
    setRoomCode(null);
  }

  function copyCode() {
    if (!roomCode) return;
    navigator.clipboard?.writeText(roomCode).catch(() => {});
    push("success", "Na-copy ang meeting code.");
  }

  if (roomCode) {
    return (
      <div className="flex h-[calc(100vh-7.5rem)] flex-col">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <div>
            <h1 className="text-lg font-bold text-slate-800">Meeting: {roomCode}</h1>
            <p className="text-xs text-slate-400">I-share ang code na ito sa iba (hal. sa Chat) para sumali sila.</p>
          </div>
          <div className="flex gap-2">
            <Button type="button" variant="secondary" onClick={copyCode}>
              <Copy className="h-4 w-4" /> Copy Code
            </Button>
            <Button type="button" variant="danger" onClick={leaveMeeting}>
              Leave Meeting
            </Button>
          </div>
        </div>
        <div ref={containerRef} className="flex-1 overflow-hidden rounded-xl border border-slate-200 bg-black" />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-md space-y-6">
      <div>
        <h1 className="flex items-center gap-2 text-xl font-bold text-slate-800">
          <Video className="h-5 w-5" /> Meet
        </h1>
        <p className="text-sm text-slate-500">Video call na may screen share — puwede i-access saanman, kahit anong device.</p>
      </div>

      <Card className="space-y-3 p-5">
        <h2 className="font-semibold text-slate-700">Start a New Meeting</h2>
        <p className="text-sm text-slate-500">Gagawa ng bagong meeting code na puwede mong i-share sa iba.</p>
        <Button type="button" className="w-full" onClick={() => startMeeting()} loading={loading}>
          <Video className="h-4 w-4" /> Start Meeting
        </Button>
      </Card>

      <Card className="space-y-3 p-5">
        <h2 className="font-semibold text-slate-700">Join a Meeting</h2>
        <Input label="Meeting Code" value={joinCode} onChange={(e) => setJoinCode(e.target.value)} placeholder="hal. pellas-abc12345-xy9z2k" />
        <Button type="button" className="w-full" variant="secondary" onClick={() => startMeeting(joinCode.trim())} loading={loading} disabled={!joinCode.trim()}>
          <LogIn className="h-4 w-4" /> Join Meeting
        </Button>
      </Card>

      <p className="text-center text-xs text-slate-400">
        Gumagamit ito ng libreng public na video call service — huwag i-share ang code sa mga taong hindi mo gustong sumali.
      </p>
    </div>
  );
}
