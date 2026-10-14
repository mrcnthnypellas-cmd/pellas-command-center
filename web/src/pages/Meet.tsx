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

// One fixed, permanent room per company — "Start Meeting" always rejoins
// the same room (like the Group Chat), instead of generating a new code
// every time. "Join a Meeting" below still accepts any custom code, for an
// ad-hoc private breakout room if ever needed.
function defaultRoomCode(companyId: string) {
  return `pellas-${companyId}`;
}

function VideoTile({ stream, name, muted, mirrored }: { stream: MediaStream | null; name: string; muted?: boolean; mirrored?: boolean }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  useEffect(() => {
    const video = videoRef.current;
    if (!video || !stream) return;
    video.srcObject = stream;
    video.play().catch(() => {});
    // replaceTrack() swaps the content of an already-negotiated track
    // in place (e.g. camera -> screen share) without a new 'track' event,
    // which some mobile browsers don't reliably re-render on their own —
    // nudging play() again on mute/unmute is a known, harmless workaround.
    const videoTrack = stream.getVideoTracks()[0];
    const nudge = () => video.play().catch(() => {});
    videoTrack?.addEventListener("unmute", nudge);
    return () => videoTrack?.removeEventListener("unmute", nudge);
  }, [stream]);
  return (
    <div className="relative aspect-video overflow-hidden rounded-xl bg-slate-900">
      <video ref={videoRef} autoPlay playsInline muted={muted} className={`h-full w-full object-cover ${mirrored ? "-scale-x-100" : ""}`} />
      <span className="absolute bottom-2 left-2 rounded-md bg-black/60 px-2 py-0.5 text-xs font-medium text-white">{name}</span>
    </div>
  );
}

// No camera (or camera off) — show initials instead of a blank black box.
function AvatarTile({ initials, name }: { initials: string; name: string }) {
  return (
    <div className="relative flex aspect-video items-center justify-center overflow-hidden rounded-xl bg-slate-800">
      <div className="flex h-16 w-16 items-center justify-center rounded-full bg-brand-600 text-xl font-semibold text-white">{initials}</div>
      <span className="absolute bottom-2 left-2 rounded-md bg-black/60 px-2 py-0.5 text-xs font-medium text-white">{name}</span>
    </div>
  );
}

// Degrades gracefully instead of failing outright — a device with no camera,
// no mic, or permission denied for one of them should still be able to join
// and watch/listen, not get locked out entirely.
async function tryGetLocalMedia(): Promise<MediaStream | null> {
  try {
    return await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
  } catch {
    try {
      return await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch {
      try {
        return await navigator.mediaDevices.getUserMedia({ video: true });
      } catch {
        return null;
      }
    }
  }
}

export default function Meet() {
  const { profile } = useAuth();
  const { push } = useToast();
  const [roomCode, setRoomCode] = useState<string | null>(null);
  const [joinCode, setJoinCode] = useState("");
  const [connecting, setConnecting] = useState(false);
  const [micOn, setMicOn] = useState(true);
  const [camOn, setCamOn] = useState(true);
  const [hasMic, setHasMic] = useState(false);
  const [hasCam, setHasCam] = useState(false);
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
    const stream = localStreamRef.current;
    const audioTrack = stream?.getAudioTracks()[0];
    const videoTrack = stream?.getVideoTracks()[0];
    // A participant with no mic/camera must still request to RECEIVE
    // audio/video (recvonly transceivers) — otherwise the SDP has no media
    // section for that kind at all, and the other side has nothing to send
    // media *to*, even though they themselves have a camera/mic.
    if (audioTrack) pc.addTrack(audioTrack, stream!);
    else pc.addTransceiver("audio", { direction: "recvonly" });
    if (videoTrack) pc.addTrack(videoTrack, stream!);
    else pc.addTransceiver("video", { direction: "recvonly" });
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
      const stream = await tryGetLocalMedia();
      localStreamRef.current = stream;
      const gotAudio = !!stream?.getAudioTracks().length;
      const gotVideo = !!stream?.getVideoTracks().length;
      setHasMic(gotAudio);
      setHasCam(gotVideo);
      setMicOn(gotAudio);
      setCamOn(gotVideo);
      setLocalStreamVersion((v) => v + 1);

      if (!stream) {
        push("info", "Walang na-detect na camera/mikropono — sasali ka bilang view-only. Makikita at maririnig mo ang iba, pero hindi ka nila makikita/maririnig.");
      } else if (!gotVideo) {
        push("info", "Walang camera na na-detect — audio-only ka sasali.");
      } else if (!gotAudio) {
        push("info", "Walang mikropono na na-detect — video-only ka sasali (walang audio).");
      }

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
      push("error", "Hindi makapasok sa meeting. Subukan ulit.");
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
    setHasMic(false);
    setHasCam(false);
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
    // Screen capture isn't implemented by most mobile browsers (iOS Safari,
    // most Android browsers) — there's no in-app workaround for that, so
    // detect it upfront and say so plainly instead of failing silently.
    if (!navigator.mediaDevices.getDisplayMedia) {
      push("error", "Hindi suportado ng browser/device na ito ang screen share. Gamitin ang desktop/laptop (Chrome o Edge).");
      return;
    }
    try {
      // Constrained resolution/frame rate — a raw full-resolution desktop
      // capture is a lot of bits to push through a constrained path (mobile
      // data on the receiving end, or the free public TURN relay when a
      // direct peer connection can't form), which is the likely reason a
      // screen share can look like it "doesn't show up" on one participant's
      // device while working fine for another on a faster/direct path.
      const screenStream = await navigator.mediaDevices.getDisplayMedia({
        video: { frameRate: { ideal: 12, max: 15 }, width: { max: 1920 }, height: { max: 1080 } },
      });
      screenStreamRef.current = screenStream;
      const screenTrack = screenStream.getVideoTracks()[0];
      try {
        screenTrack.contentHint = "detail";
      } catch {
        // not supported on this browser — safe to ignore
      }
      peersRef.current.forEach((pc) => {
        const sender = pc.getSenders().find((s) => s.track?.kind === "video");
        if (!sender) return;
        sender
          .replaceTrack(screenTrack)
          .then(() => {
            try {
              const params = sender.getParameters();
              if (!params.encodings || params.encodings.length === 0) params.encodings = [{}];
              params.encodings[0].maxBitrate = 1_500_000;
              sender.setParameters(params).catch(() => {});
            } catch {
              // setParameters can throw on some browsers before the first negotiation completes — non-fatal
            }
          })
          .catch(() => {});
      });
      screenTrack.onended = () => {
        toggleScreenShare();
      };
      setScreenSharing(true);
    } catch (err) {
      const message = err instanceof Error ? err.message.toLowerCase() : "";
      const userCancelled = message.includes("denied") || message.includes("cancel") || message.includes("permission");
      if (!userCancelled) {
        push("error", "Hindi na-start ang screen share. Subukan ulit.");
      }
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
          {hasCam || screenSharing ? (
            <VideoTile
              stream={screenSharing ? screenStreamRef.current : localStreamRef.current}
              name={`${profile.first_name} (ikaw)`}
              muted
              mirrored={!screenSharing}
            />
          ) : (
            <AvatarTile initials={`${profile.first_name[0]}${profile.last_name[0]}`} name={`${profile.first_name} (ikaw)`} />
          )}
          {participants.map(([id, p]) => (
            <VideoTile key={id} stream={p.stream} name={p.name} />
          ))}
        </div>

        <div className="mt-3 flex items-center justify-center gap-3">
          <button
            type="button"
            onClick={toggleMic}
            disabled={!hasMic}
            className={`flex h-11 w-11 items-center justify-center rounded-full disabled:cursor-not-allowed disabled:opacity-40 ${micOn ? "bg-slate-200 text-slate-700" : "bg-red-600 text-white"}`}
            aria-label={micOn ? "Mute" : "Unmute"}
            title={hasMic ? undefined : "Walang na-detect na mikropono"}
          >
            {micOn ? <Mic className="h-5 w-5" /> : <MicOff className="h-5 w-5" />}
          </button>
          <button
            type="button"
            onClick={toggleCam}
            disabled={!hasCam}
            className={`flex h-11 w-11 items-center justify-center rounded-full disabled:cursor-not-allowed disabled:opacity-40 ${camOn ? "bg-slate-200 text-slate-700" : "bg-red-600 text-white"}`}
            aria-label={camOn ? "Turn off camera" : "Turn on camera"}
            title={hasCam ? undefined : "Walang na-detect na camera"}
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
        <h2 className="font-semibold text-slate-700">Company Meeting Room</h2>
        <p className="text-sm text-slate-500">Parehong room palagi — kahit sino sa company puwedeng sumali anumang oras, parang Group Chat.</p>
        <div className="flex items-center justify-between gap-2 rounded-lg bg-slate-50 px-3 py-2">
          <code className="truncate text-xs text-slate-600">{defaultRoomCode(profile.company_id)}</code>
          <button
            type="button"
            onClick={() => {
              navigator.clipboard?.writeText(defaultRoomCode(profile.company_id)).catch(() => {});
              push("success", "Na-copy ang room code.");
            }}
            className="shrink-0 rounded-md p-1.5 text-slate-500 hover:bg-slate-200"
            aria-label="Copy room code"
          >
            <Copy className="h-4 w-4" />
          </button>
        </div>
        <Button type="button" className="w-full" onClick={() => joinRoom(defaultRoomCode(profile.company_id))} loading={connecting}>
          <VideoIcon className="h-4 w-4" /> Start Meeting
        </Button>
      </Card>

      <Card className="space-y-3 p-5">
        <h2 className="font-semibold text-slate-700">Join a Private Code</h2>
        <p className="text-sm text-slate-500">Para sa hiwalay/private na meeting na may sariling code.</p>
        <Input label="Meeting Code" value={joinCode} onChange={(e) => setJoinCode(e.target.value)} placeholder="hal. pellas-abc12345-xy9z2k" />
        <Button type="button" className="w-full" variant="secondary" onClick={() => joinRoom(joinCode.trim())} loading={connecting} disabled={!joinCode.trim()}>
          <LogIn className="h-4 w-4" /> Join Meeting
        </Button>
      </Card>

      <p className="text-center text-xs text-slate-400">Huwag i-share ang meeting code sa taong hindi mo gustong sumali.</p>
    </div>
  );
}
