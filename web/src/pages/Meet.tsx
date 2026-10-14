import { useEffect, useRef, useState } from "react";
import { Mic, MicOff, Video as VideoIcon, VideoOff, MonitorUp, PhoneOff, Copy, LogIn, Users } from "lucide-react";
import { supabase } from "../lib/supabase";
import { useAuth } from "../lib/auth";
import { useToast } from "../lib/toast";
import { Button, Card, Input } from "../components/ui/ui";

// Our own video call — no third-party meeting UI. Signaling (who's in the
// room, exchanging WebRTC offers/answers/ICE candidates) rides entirely on
// a Supabase Realtime channel (broadcast + presence), so nothing leaves our
// own stack to coordinate a call. The actual audio/video/screen share still
// flows peer-to-peer directly between browsers (that's what WebRTC is) —
// this is a full-mesh setup, which works well for small groups.
//
// STUN/TURN are still needed for peers behind NAT/firewalls to find a route
// to each other; public STUN plus a free public TURN relay (Metered's
// OpenRelay project) cover the vast majority of home/office networks. No
// account or key needed for either.
const ICE_SERVERS: RTCIceServer[] = [
  { urls: "stun:stun.l.google.com:19302" },
  { urls: "stun:stun1.l.google.com:19302" },
  { urls: "turn:openrelay.metered.ca:80", username: "openrelayproject", credential: "openrelayproject" },
  { urls: "turn:openrelay.metered.ca:443", username: "openrelayproject", credential: "openrelayproject" },
  { urls: "turn:openrelay.metered.ca:443?transport=tcp", username: "openrelayproject", credential: "openrelayproject" },
];

interface SignalPayload {
  from: string;
  to: string;
  kind: "offer" | "answer" | "ice";
  data: RTCSessionDescriptionInit | RTCIceCandidateInit;
}

interface RemoteParticipant {
  name: string;
  stream: MediaStream;
}

function randomRoomCode(companyId: string) {
  const rand = Math.random().toString(36).slice(2, 8);
  return `pellas-${companyId.slice(0, 8)}-${rand}`;
}

function VideoTile({ stream, name, muted, mirrored }: { stream: MediaStream | null; name: string; muted?: boolean; mirrored?: boolean }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  useEffect(() => {
    if (videoRef.current) videoRef.current.srcObject = stream;
  }, [stream]);
  return (
    <div className="relative aspect-video overflow-hidden rounded-xl bg-slate-900">
      <video ref={videoRef} autoPlay playsInline muted={muted} className={`h-full w-full object-cover ${mirrored ? "-scale-x-100" : ""}`} />
      <span className="absolute bottom-2 left-2 rounded-md bg-black/60 px-2 py-0.5 text-xs font-medium text-white">{name}</span>
    </div>
  );
}

export default function Meet() {
  const { profile } = useAuth();
  const { push } = useToast();
  const [roomCode, setRoomCode] = useState<string | null>(null);
  const [joinCode, setJoinCode] = useState("");
  const [connecting, setConnecting] = useState(false);
  const [micOn, setMicOn] = useState(true);
  const [camOn, setCamOn] = useState(true);
  const [screenSharing, setScreenSharing] = useState(false);
  const [localStreamVersion, setLocalStreamVersion] = useState(0);
  const [remoteParticipants, setRemoteParticipants] = useState<Map<string, RemoteParticipant>>(new Map());

  const myId = profile?.id ?? "";
  const localStreamRef = useRef<MediaStream | null>(null);
  const screenStreamRef = useRef<MediaStream | null>(null);
  const peersRef = useRef<Map<string, RTCPeerConnection>>(new Map());
  const peerNamesRef = useRef<Map<string, string>>(new Map());
  const pendingCandidatesRef = useRef<Map<string, RTCIceCandidateInit[]>>(new Map());
  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);

  function sendSignal(to: string, kind: SignalPayload["kind"], data: SignalPayload["data"]) {
    channelRef.current?.send({ type: "broadcast", event: "signal", payload: { from: myId, to, kind, data } });
  }

  async function flushPendingCandidates(peerId: string, pc: RTCPeerConnection) {
    const arr = pendingCandidatesRef.current.get(peerId) ?? [];
    for (const c of arr) {
      try {
        await pc.addIceCandidate(new RTCIceCandidate(c));
      } catch {
        // ignore a candidate that fails to add — connection still proceeds with the rest
      }
    }
    pendingCandidatesRef.current.delete(peerId);
  }

  function createPeerConnection(peerId: string): RTCPeerConnection {
    const pc = new RTCPeerConnection({ iceServers: ICE_SERVERS });
    localStreamRef.current?.getTracks().forEach((track) => pc.addTrack(track, localStreamRef.current!));
    pc.onicecandidate = (e) => {
      if (e.candidate) sendSignal(peerId, "ice", e.candidate.toJSON());
    };
    pc.ontrack = (e) => {
      setRemoteParticipants((prev) => {
        const next = new Map(prev);
        next.set(peerId, { name: peerNamesRef.current.get(peerId) ?? "Guest", stream: e.streams[0] });
        return next;
      });
    };
    peersRef.current.set(peerId, pc);
    return pc;
  }

  async function initiateCallTo(peerId: string) {
    const pc = createPeerConnection(peerId);
    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);
    sendSignal(peerId, "offer", offer);
  }

  async function handleSignal(payload: SignalPayload) {
    if (payload.to !== myId) return;
    const { from, kind, data } = payload;
    let pc = peersRef.current.get(from);
    if (kind === "offer") {
      if (!pc) pc = createPeerConnection(from);
      await pc.setRemoteDescription(new RTCSessionDescription(data as RTCSessionDescriptionInit));
      await flushPendingCandidates(from, pc);
      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);
      sendSignal(from, "answer", answer);
    } else if (kind === "answer") {
      if (!pc) return;
      await pc.setRemoteDescription(new RTCSessionDescription(data as RTCSessionDescriptionInit));
      await flushPendingCandidates(from, pc);
    } else if (kind === "ice") {
      if (pc?.remoteDescription) {
        try {
          await pc.addIceCandidate(new RTCIceCandidate(data as RTCIceCandidateInit));
        } catch {
          // ignore
        }
      } else {
        const arr = pendingCandidatesRef.current.get(from) ?? [];
        arr.push(data as RTCIceCandidateInit);
        pendingCandidatesRef.current.set(from, arr);
      }
    }
  }

  function removePeer(peerId: string) {
    peersRef.current.get(peerId)?.close();
    peersRef.current.delete(peerId);
    pendingCandidatesRef.current.delete(peerId);
    setRemoteParticipants((prev) => {
      const next = new Map(prev);
      next.delete(peerId);
      return next;
    });
  }

  async function joinRoom(code: string) {
    if (!profile) return;
    setConnecting(true);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
      localStreamRef.current = stream;
      setLocalStreamVersion((v) => v + 1);

      const displayName = `${profile.first_name} ${profile.last_name}`;
      const channel = supabase.channel(`meet-room-${code}`, { config: { presence: { key: myId } } });

      channel.on("broadcast", { event: "signal" }, ({ payload }) => {
        handleSignal(payload as SignalPayload).catch(() => {});
      });

      channel.on("presence", { event: "sync" }, () => {
        const state = channel.presenceState<{ name: string }>();
        const ids = Object.keys(state).filter((id) => id !== myId);
        for (const id of ids) {
          const meta = state[id]?.[0];
          if (meta) peerNamesRef.current.set(id, meta.name);
          if (!peersRef.current.has(id) && myId < id) {
            initiateCallTo(id).catch(() => {});
          }
        }
        for (const id of Array.from(peersRef.current.keys())) {
          if (!ids.includes(id)) removePeer(id);
        }
      });

      channel.subscribe(async (status) => {
        if (status === "SUBSCRIBED") {
          await channel.track({ name: displayName });
        }
      });

      channelRef.current = channel;
      setRoomCode(code);
    } catch {
      push("error", "Hindi ma-access ang camera/microphone. Paki-check ang permissions.");
    } finally {
      setConnecting(false);
    }
  }

  function leaveRoom() {
    peersRef.current.forEach((pc) => pc.close());
    peersRef.current.clear();
    pendingCandidatesRef.current.clear();
    peerNamesRef.current.clear();
    setRemoteParticipants(new Map());

    if (channelRef.current) {
      channelRef.current.untrack();
      supabase.removeChannel(channelRef.current);
      channelRef.current = null;
    }

    localStreamRef.current?.getTracks().forEach((t) => t.stop());
    localStreamRef.current = null;
    screenStreamRef.current?.getTracks().forEach((t) => t.stop());
    screenStreamRef.current = null;
    setScreenSharing(false);
    setMicOn(true);
    setCamOn(true);
    setRoomCode(null);
  }

  useEffect(() => {
    return () => {
      if (roomCode) leaveRoom();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function toggleMic() {
    const track = localStreamRef.current?.getAudioTracks()[0];
    if (!track) return;
    track.enabled = !track.enabled;
    setMicOn(track.enabled);
  }

  function toggleCam() {
    const track = localStreamRef.current?.getVideoTracks()[0];
    if (!track) return;
    track.enabled = !track.enabled;
    setCamOn(track.enabled);
  }

  async function toggleScreenShare() {
    if (screenSharing) {
      const camTrack = localStreamRef.current?.getVideoTracks()[0];
      if (camTrack) {
        peersRef.current.forEach((pc) => {
          const sender = pc.getSenders().find((s) => s.track?.kind === "video");
          sender?.replaceTrack(camTrack);
        });
      }
      screenStreamRef.current?.getTracks().forEach((t) => t.stop());
      screenStreamRef.current = null;
      setScreenSharing(false);
      return;
    }
    try {
      const screenStream = await navigator.mediaDevices.getDisplayMedia({ video: true });
      screenStreamRef.current = screenStream;
      const screenTrack = screenStream.getVideoTracks()[0];
      peersRef.current.forEach((pc) => {
        const sender = pc.getSenders().find((s) => s.track?.kind === "video");
        sender?.replaceTrack(screenTrack);
      });
      screenTrack.onended = () => {
        toggleScreenShare();
      };
      setScreenSharing(true);
    } catch {
      // user cancelled the screen-share picker — no-op
    }
  }

  function copyCode() {
    if (!roomCode) return;
    navigator.clipboard?.writeText(roomCode).catch(() => {});
    push("success", "Na-copy ang meeting code.");
  }

  if (!profile) return null;

  if (roomCode) {
    const participants = Array.from(remoteParticipants.entries());
    return (
      <div className="flex h-[calc(100vh-7.5rem)] flex-col">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <div>
            <h1 className="flex items-center gap-2 text-lg font-bold text-slate-800">
              <Users className="h-5 w-5" /> {roomCode}
            </h1>
            <p className="text-xs text-slate-400">{participants.length + 1} sa meeting • i-share ang code para sumali ang iba</p>
          </div>
          <Button type="button" variant="secondary" onClick={copyCode}>
            <Copy className="h-4 w-4" /> Copy Code
          </Button>
        </div>

        <div className="grid flex-1 auto-rows-fr grid-cols-1 gap-3 overflow-y-auto sm:grid-cols-2 lg:grid-cols-3">
          <VideoTile stream={localStreamRef.current} name={`${profile.first_name} (ikaw)`} muted mirrored={!screenSharing} />
          {participants.map(([id, p]) => (
            <VideoTile key={id} stream={p.stream} name={p.name} />
          ))}
        </div>

        <div className="mt-3 flex items-center justify-center gap-3">
          <button
            type="button"
            onClick={toggleMic}
            className={`flex h-11 w-11 items-center justify-center rounded-full ${micOn ? "bg-slate-200 text-slate-700" : "bg-red-600 text-white"}`}
            aria-label={micOn ? "Mute" : "Unmute"}
          >
            {micOn ? <Mic className="h-5 w-5" /> : <MicOff className="h-5 w-5" />}
          </button>
          <button
            type="button"
            onClick={toggleCam}
            className={`flex h-11 w-11 items-center justify-center rounded-full ${camOn ? "bg-slate-200 text-slate-700" : "bg-red-600 text-white"}`}
            aria-label={camOn ? "Turn off camera" : "Turn on camera"}
          >
            {camOn ? <VideoIcon className="h-5 w-5" /> : <VideoOff className="h-5 w-5" />}
          </button>
          <button
            type="button"
            onClick={toggleScreenShare}
            className={`flex h-11 w-11 items-center justify-center rounded-full ${screenSharing ? "bg-brand-600 text-white" : "bg-slate-200 text-slate-700"}`}
            aria-label="Share screen"
          >
            <MonitorUp className="h-5 w-5" />
          </button>
          <button
            type="button"
            onClick={leaveRoom}
            className="flex h-11 w-11 items-center justify-center rounded-full bg-red-600 text-white"
            aria-label="Leave meeting"
          >
            <PhoneOff className="h-5 w-5" />
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-md space-y-6">
      <div>
        <h1 className="flex items-center gap-2 text-xl font-bold text-slate-800">
          <VideoIcon className="h-5 w-5" /> Meet
        </h1>
        <p className="text-sm text-slate-500">Video call na may screen share — gawa natin mismo, dito lang sa loob ng attendance system.</p>
      </div>

      <Card className="space-y-3 p-5">
        <h2 className="font-semibold text-slate-700">Start a New Meeting</h2>
        <Button type="button" className="w-full" onClick={() => joinRoom(randomRoomCode(profile.company_id))} loading={connecting}>
          <VideoIcon className="h-4 w-4" /> Start Meeting
        </Button>
      </Card>

      <Card className="space-y-3 p-5">
        <h2 className="font-semibold text-slate-700">Join a Meeting</h2>
        <Input label="Meeting Code" value={joinCode} onChange={(e) => setJoinCode(e.target.value)} placeholder="hal. pellas-abc12345-xy9z2k" />
        <Button type="button" className="w-full" variant="secondary" onClick={() => joinRoom(joinCode.trim())} loading={connecting} disabled={!joinCode.trim()}>
          <LogIn className="h-4 w-4" /> Join Meeting
        </Button>
      </Card>

      <p className="text-center text-xs text-slate-400">Huwag i-share ang meeting code sa taong hindi mo gustong sumali.</p>
    </div>
  );
}
