import { useEffect, useRef, useState } from "react";
import { Camera, Loader2, CheckCircle2, XCircle } from "lucide-react";
import { loadFaceModels, getFaceDescriptor } from "../../lib/faceRecognition";
import { Button } from "../ui/ui";

interface FaceCaptureProps {
  onCapture: (descriptor: Float32Array) => void;
  busy?: boolean;
  statusText?: string;
  statusKind?: "idle" | "success" | "error";
}

export default function FaceCapture({ onCapture, busy = false, statusText, statusKind = "idle" }: FaceCaptureProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [cameraReady, setCameraReady] = useState(false);
  const [modelsReady, setModelsReady] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    loadFaceModels()
      .then(() => {
        if (!cancelled) setModelsReady(true);
      })
      .catch(() => {
        if (!cancelled) setError("Could not load face recognition models. Check your internet connection.");
      });

    async function startCamera() {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "user", width: 320, height: 240 } });
        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play();
        }
        setCameraReady(true);
      } catch {
        if (!cancelled) setError("Camera access is required for face verification. Please allow camera permission.");
      }
    }
    startCamera();

    return () => {
      cancelled = true;
      streamRef.current?.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    };
  }, []);

  async function handleCapture() {
    if (!videoRef.current) return;
    setError(null);
    const descriptor = await getFaceDescriptor(videoRef.current);
    if (!descriptor) {
      setError("No face detected. Please face the camera directly with good lighting.");
      return;
    }
    onCapture(descriptor);
  }

  const canCapture = cameraReady && modelsReady && !busy;

  return (
    <div className="space-y-3">
      <div className="relative mx-auto aspect-[4/3] w-full max-w-xs overflow-hidden rounded-xl bg-slate-900">
        <video ref={videoRef} muted playsInline className="h-full w-full -scale-x-100 object-cover" />
        {(!cameraReady || !modelsReady) && !error && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 text-white/80">
            <Loader2 className="h-6 w-6 animate-spin" />
            <span className="text-xs">{!modelsReady ? "Loading face models…" : "Starting camera…"}</span>
          </div>
        )}
      </div>

      {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}

      {statusText && (
        <p
          className={`flex items-center gap-2 rounded-lg px-3 py-2 text-sm ${
            statusKind === "success" ? "bg-emerald-50 text-emerald-700" : statusKind === "error" ? "bg-red-50 text-red-700" : "bg-slate-50 text-slate-600"
          }`}
        >
          {statusKind === "success" && <CheckCircle2 className="h-4 w-4 shrink-0" />}
          {statusKind === "error" && <XCircle className="h-4 w-4 shrink-0" />}
          {statusText}
        </p>
      )}

      <Button type="button" className="w-full" onClick={handleCapture} loading={busy} disabled={!canCapture}>
        <Camera className="h-4 w-4" /> Capture Face
      </Button>
    </div>
  );
}
