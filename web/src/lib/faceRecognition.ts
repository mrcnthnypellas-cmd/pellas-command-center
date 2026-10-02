import * as faceapi from "@vladmandic/face-api";

const MODEL_URL = "https://cdn.jsdelivr.net/npm/@vladmandic/face-api/model";

export const FACE_MATCH_THRESHOLD = 0.55;

let loadingPromise: Promise<void> | null = null;

export function loadFaceModels(): Promise<void> {
  if (!loadingPromise) {
    loadingPromise = Promise.all([
      faceapi.nets.tinyFaceDetector.loadFromUri(MODEL_URL),
      faceapi.nets.faceLandmark68Net.loadFromUri(MODEL_URL),
      faceapi.nets.faceRecognitionNet.loadFromUri(MODEL_URL),
    ]).then(() => undefined);
  }
  return loadingPromise;
}

export async function getFaceDescriptor(input: HTMLVideoElement): Promise<Float32Array | null> {
  const detection = await faceapi
    .detectSingleFace(input, new faceapi.TinyFaceDetectorOptions())
    .withFaceLandmarks()
    .withFaceDescriptor();
  return detection?.descriptor ?? null;
}

// ---- Liveness (anti-photo-spoofing) ----
// A bare face-embedding match accepts a printed photo or a phone held up to
// the camera just as readily as a real person (same single-frame comparison
// either way). Liveness is checked separately and cheaply, using only the
// landmark model (no descriptor computation), by tracking blinks via the
// classic Eye Aspect Ratio over a short rolling window — a static photo
// can't produce a natural eyes-closed dip followed by re-opening.

interface Point { x: number; y: number }

function dist(a: Point, b: Point): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

// eye = 6 points in dlib order: [outer corner, top1, top2, inner corner, bottom2, bottom1]
function eyeAspectRatio(eye: Point[]): number {
  const [p1, p2, p3, p4, p5, p6] = eye;
  const horizontal = dist(p1, p4);
  if (horizontal === 0) return 0;
  return (dist(p2, p6) + dist(p3, p5)) / (2 * horizontal);
}

export const BLINK_EAR_CLOSED = 0.21;
export const BLINK_EAR_OPEN = 0.26;

/** Lightweight per-tick sample for the blink-liveness loop — skips the
 * expensive recognition-net descriptor pass that getFaceDescriptor runs. */
export async function sampleEyeAspectRatio(input: HTMLVideoElement): Promise<{ hasFace: boolean; ear: number }> {
  const detection = await faceapi.detectSingleFace(input, new faceapi.TinyFaceDetectorOptions()).withFaceLandmarks();
  if (!detection) return { hasFace: false, ear: 0 };
  const left = eyeAspectRatio(detection.landmarks.getLeftEye() as unknown as Point[]);
  const right = eyeAspectRatio(detection.landmarks.getRightEye() as unknown as Point[]);
  return { hasFace: true, ear: (left + right) / 2 };
}

/** Tracks EAR samples over time and flags a genuine open->closed->open blink. */
export class BlinkDetector {
  private wasClosed = false;
  private sawBlink = false;

  sample(ear: number): void {
    if (ear < BLINK_EAR_CLOSED) {
      this.wasClosed = true;
    } else if (ear > BLINK_EAR_OPEN && this.wasClosed) {
      this.sawBlink = true;
      this.wasClosed = false;
    }
  }

  get blinked(): boolean {
    return this.sawBlink;
  }

  reset(): void {
    this.wasClosed = false;
    this.sawBlink = false;
  }
}

export function euclideanDistance(a: number[], b: number[]): number {
  let sum = 0;
  for (let i = 0; i < a.length; i++) {
    sum += (a[i] - b[i]) ** 2;
  }
  return Math.sqrt(sum);
}
