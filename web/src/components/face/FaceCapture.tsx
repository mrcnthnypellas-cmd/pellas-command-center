import { useEffect, useRef, useState } from "react";
import { Camera, Loader2, CheckCircle2, XCircle, Eye } from "lucide-react";
import { loadFaceModels, getFaceDescriptor, sampleEyeAspectRatio, BlinkDetector } from "../../lib/faceRecognition";
import { Button } from "../ui/ui";

interface FaceCaptureProps {
  onCapture: (descriptor: Float32Array) => void;
  busy?: boolean;
  statusText?: string;
  statusKind?: "idle" | "success" | "error";
  /** "manual" (default) shows a Capture Face button. "auto" scans continuously
   * and calls onCapture as soon as a face is found, no button needed. */
  mode?: "manual" | "auto";
  /** auto mode only: how often (ms) to scan for a face. */
  scanIntervalMs?: number;
}

export default function FaceCapture({
  onCapture,
  busy = false,
  statusText,
  statusKind = "idle",
  mode = "manual",
  scanIntervalMs = 1200,
}: FaceCaptureProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [cameraReady, setCameraReady] = useState(false);
  const [modelsReady, setModelsReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [scanning, setScanning] = useState(false);
  const [livenessConfirmed, setLivenessConfirmed] = useState(false);
  const busyRef = useRef(busy);
  busyRef.current = busy;
  const blinkDetectorRef = useRef(new BlinkDetector());

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

  const onCaptureRef = useRef(onCapture);
  onCaptureRef.current = onCapture;

  // Liveness check, separate from the (slower) descriptor-match loop below —
  // a photo or a phone held up to the camera matches the stored descriptor
  // just as well as a real face would in a single still frame, so a capture
  // is only accepted once a genuine blink (eyes closing then reopening) has
  // been observed. Samples landmarks only (cheap), not the full recognition
  // descriptor, so it can run much more often than the match loop.
  useEffect(() => {
    if (mode !== "auto" || !cameraReady || !modelsReady) return;
    blinkDetectorRef.current.reset();
    setLivenessConfirmed(false);
    let disposed = false;
    let inFlight = false;
    const id = setInterval(async () => {
      if (disposed || inFlight || busyRef.current || !videoRef.current) return;
      inFlight = true;
      try {
        const { ear } = await sampleEyeAspectRatio(videoRef.current);
        if (disposed) return;
        blinkDetectorRef.current.sample(ear);
        if (blinkDetectorRef.current.blinked) setLivenessConfirmed(true);
      } finally {
        inFlight = false;
      }
    }, 300);
    return () => {
      disposed = true;
      clearInterval(id);
    };
  }, [mode, cameraReady, modelsReady]);

  useEffect(() => {
    if (mode !== "auto" || !cameraReady || !modelsReady) return;
    let disposed = false;
    let inFlight = false;
    const id = setInterval(async () => {
      if (disposed || inFlight || busyRef.current || !videoRef.current) return;
      inFlight = true;
      setScanning(true);
      try {
        if (!blinkDetectorRef.current.blinked) return; // no confirmed blink yet — keep scanning, don't match
        const descriptor = await getFaceDescriptor(videoRef.current);
        if (descriptor && !disposed) {
          blinkDetectorRef.current.reset(); // require a fresh blink for the next attempt
          setLivenessConfirmed(false);
          onCaptureRef.current(descriptor);
        }
      } finally {
        inFlight = false;
        if (!disposed) setScanning(false);
      }
    }, scanIntervalMs);
    return () => {
      disposed = true;
      clearInterval(id);
    };
  }, [mode, cameraReady, modelsReady, scanIntervalMs]);

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

      {mode === "auto" ? (
        !statusText && (
          <p className="flex items-center justify-center gap-2 text-sm text-slate-500">
            {canCapture ? (
              livenessConfirmed ? (
                <>
                  <span className={`h-2 w-2 rounded-full ${scanning ? "bg-brand-600 animate-pulse" : "bg-slate-300"}`} />
                  Nakaharap ka na ba sa camera? Awtomatiko itong makikilala…
                </>
              ) : (
                <>
                  <Eye className="h-4 w-4 shrink-0 text-amber-500" />
                  Kindly kumurap nang natural para ma-confirm na ikaw mismo (hindi litrato)
                </>
              )
            ) : (
              <Loader2 className="h-4 w-4 animate-spin" />
            )}
          </p>
        )
      ) : (
        <Button type="button" className="w-full" onClick={handleCapture} loading={busy} disabled={!canCapture}>
          <Camera className="h-4 w-4" /> Capture Face
        </Button>
      )}
    </div>
  );
}
