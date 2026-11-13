'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  PoseLandmarker,
  HandLandmarker,
  FaceLandmarker,
  FilesetResolver,
  type NormalizedLandmark,
} from '@mediapipe/tasks-vision';
import {
  POSE_CONNECTION_GROUPS,
  HAND_CONNECTION_GROUPS,
  FACE_CONNECTIONS,
} from '@/lib/mediapipe-connections';

export type TrackingMode = 'pose' | 'hands' | 'both';

export interface TrackerSettings {
  enabled: boolean;
  mode: TrackingMode;
  mirror: boolean;
  showVideo: boolean;
  showSkeleton: boolean;
  showPoints: boolean;
  showLabels: boolean;
  pointSize: number;
  lineWidth: number;
  minDetectionConfidence: number;
  minTrackingConfidence: number;
  poseColor: string;
  handColor: string;
  accentColor: string;
}

export const DEFAULT_SETTINGS: TrackerSettings = {
  enabled: false,
  mode: 'both',
  mirror: true,
  showVideo: true,
  showSkeleton: true,
  showPoints: true,
  showLabels: false,
  pointSize: 5,
  lineWidth: 3,
  minDetectionConfidence: 0.5,
  minTrackingConfidence: 0.5,
  poseColor: '#22d3ee',
  handColor: '#f472b6',
  accentColor: '#a3e635',
};

interface BodySkeletonTrackerProps {
  settings: TrackerSettings;
  onFps?: (fps: number) => void;
  onLandmarks?: (data: { pose: NormalizedLandmark[][]; hands: NormalizedLandmark[][]; handedness: string[] }) => void;
}

type LandmarkerBundle =
  | { type: 'loading' }
  | { type: 'error'; message: string }
  | { type: 'ready'; pose: PoseLandmarker | null; hands: HandLandmarker | null; face: FaceLandmarker | null };

const WASM_BASE = 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.22-rc.20250304/wasm';
const POSE_MODEL =
  'https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_full/float16/1/pose_landmarker_full.task';
const HAND_MODEL =
  'https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task';
const FACE_MODEL =
  'https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task';
const PERSON_COLORS = ['#22d3ee', '#f472b6', '#a3e635', '#fbbf24'];
const HAND_TIP_COLORS = ['#f472b6', '#fb7185', '#fbbf24', '#34d399', '#60a5fa'];

export function BodySkeletonTracker({ settings, onFps, onLandmarks }: BodySkeletonTrackerProps) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);

  const bundleRef = useRef<LandmarkerBundle>({ type: 'loading' });
  const streamRef = useRef<MediaStream | null>(null);
  const rafRef = useRef<number | null>(null);
  const fpsCounterRef = useRef<{ frames: number; lastTs: number; fps: number }>({
    frames: 0,
    lastTs: performance.now(),
    fps: 0,
  });
  const smoothedHandsRef = useRef<Map<string, NormalizedLandmark[]>>(new Map());
  const faceLandmarksRef = useRef<NormalizedLandmark[][]>([]);
  const lastFaceDetectionRef = useRef(0);

  const settingsRef = useRef<TrackerSettings>(settings);
  settingsRef.current = settings;

  const [status, setStatus] = useState<'idle' | 'loading-model' | 'requesting-camera' | 'running' | 'error'>('idle');
  const [statusMessage, setStatusMessage] = useState<string>('');
  const [cameraDevices, setCameraDevices] = useState<MediaDeviceInfo[]>([]);
  const [activeDeviceId, setActiveDeviceId] = useState<string | undefined>(undefined);

  // List cameras once we have permission
  const refreshCameras = useCallback(async () => {
    try {
      const devices = await navigator.mediaDevices.enumerateDevices();
      const cams = devices.filter((d) => d.kind === 'videoinput');
      setCameraDevices(cams);
      if (cams.length > 0 && !activeDeviceId) {
        setActiveDeviceId(cams[0].deviceId);
      }
    } catch {
      /* ignore */
    }
  }, [activeDeviceId]);

  // Load MediaPipe models
  const ensureLandmarkers = useCallback(async () => {
    if (bundleRef.current.type === 'ready' || bundleRef.current.type === 'error') {
      return bundleRef.current;
    }
    bundleRef.current = { type: 'loading' };
    setStatus('loading-model');
    setStatusMessage('กำลังโหลดโมเดล AI...');

    try {
      const fileset = await FilesetResolver.forVisionTasks(WASM_BASE);

      const needsPose = settingsRef.current.mode === 'pose' || settingsRef.current.mode === 'both';
      const needsHands = settingsRef.current.mode === 'hands' || settingsRef.current.mode === 'both';

      const [pose, hands, face] = await Promise.all([
        needsPose
          ? PoseLandmarker.createFromOptions(fileset, {
              baseOptions: {
                modelAssetPath: POSE_MODEL,
                delegate: 'GPU',
              },
              runningMode: 'VIDEO',
              numPoses: 2,
              minPoseDetectionConfidence: settingsRef.current.minDetectionConfidence,
              minPosePresenceConfidence: 0.5,
              minTrackingConfidence: settingsRef.current.minTrackingConfidence,
            })
          : Promise.resolve(null),
        needsHands
          ? HandLandmarker.createFromOptions(fileset, {
              baseOptions: {
                modelAssetPath: HAND_MODEL,
                delegate: 'GPU',
              },
              runningMode: 'VIDEO',
              numHands: 4,
              minHandDetectionConfidence: Math.max(0.35, settingsRef.current.minDetectionConfidence - 0.1),
              minHandPresenceConfidence: 0.4,
              minTrackingConfidence: settingsRef.current.minTrackingConfidence,
            })
          : Promise.resolve(null),
        needsPose
          ? FaceLandmarker.createFromOptions(fileset, {
              baseOptions: {
                modelAssetPath: FACE_MODEL,
                delegate: 'GPU',
              },
              runningMode: 'VIDEO',
              numFaces: 2,
              minFaceDetectionConfidence: Math.max(0.35, settingsRef.current.minDetectionConfidence - 0.1),
              minFacePresenceConfidence: 0.5,
              minTrackingConfidence: settingsRef.current.minTrackingConfidence,
              outputFaceBlendshapes: false,
              outputFacialTransformationMatrixes: false,
            }).catch(() => null)
          : Promise.resolve(null),
      ]);

      bundleRef.current = { type: 'ready', pose, hands, face };
      return bundleRef.current;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      bundleRef.current = { type: 'error', message };
      setStatus('error');
      setStatusMessage(`โหลดโมเดลไม่สำเร็จ: ${message}`);
      return bundleRef.current;
    }
  }, []);

  // Reset bundle when mode changes (so it loads correct landmarker next time)
  useEffect(() => {
    if (bundleRef.current.type === 'ready') {
      const { pose, hands, face } = bundleRef.current;
      try {
        pose?.close();
      } catch {
        /* ignore */
      }
      try {
        hands?.close();
      } catch {
        /* ignore */
      }
      try {
        face?.close();
      } catch {
        /* ignore */
      }
      bundleRef.current = { type: 'loading' };
    }
  }, [settings.mode]);

  // Start / stop camera + tracking loop based on `enabled`
  useEffect(() => {
    let cancelled = false;
    let cleanup: (() => void) | undefined;

    async function start() {
      if (typeof window === 'undefined') return;
      const video = videoRef.current;
      const canvas = canvasRef.current;
      const container = containerRef.current;
      if (!video || !canvas || !container) return;

      // 1. Load models
      const bundle = await ensureLandmarkers();
      if (cancelled) return;
      if (bundle.type !== 'ready') {
        return;
      }

      // 2. Request camera
      setStatus('requesting-camera');
      setStatusMessage('กำลังขอสิทธิ์กล้อง...');
      try {
        const portraitScreen = window.matchMedia('(max-width: 640px)').matches;
        const constraints: MediaStreamConstraints = {
          video: {
            facingMode: 'user',
            width: { ideal: portraitScreen ? 720 : 1280 },
            height: { ideal: portraitScreen ? 1280 : 720 },
            ...(activeDeviceId ? { deviceId: { exact: activeDeviceId } } : {}),
          },
          audio: false,
        };
        const stream = await navigator.mediaDevices.getUserMedia(constraints);
        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        streamRef.current = stream;
        video.srcObject = stream;
        await video.play();
        await refreshCameras();

        // Resize canvas to match container
        const resize = () => {
          const w = container.clientWidth;
          const h = container.clientHeight;
          const dpr = Math.min(window.devicePixelRatio || 1, 2);
          canvas.width = Math.floor(w * dpr);
          canvas.height = Math.floor(h * dpr);
          canvas.style.width = `${w}px`;
          canvas.style.height = `${h}px`;
          const ctx = canvas.getContext('2d');
          if (ctx) {
            ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
          }
        };
        resize();
        const ro = new ResizeObserver(resize);
        ro.observe(container);

        setStatus('running');
        setStatusMessage('กำลังติดตาม...');

        // 3. Render loop
        const renderLoop = () => {
          if (cancelled) return;
          const now = performance.now();
          const videoEl = videoRef.current;
          const canvasEl = canvasRef.current;
          if (!videoEl || !canvasEl || videoEl.readyState < 2) {
            rafRef.current = requestAnimationFrame(renderLoop);
            return;
          }
          const ctx = canvasEl.getContext('2d');
          if (!ctx) {
            rafRef.current = requestAnimationFrame(renderLoop);
            return;
          }
          const s = settingsRef.current;
          const w = canvasEl.clientWidth;
          const h = canvasEl.clientHeight;
          ctx.clearRect(0, 0, w, h);
          const viewport = fitVideoToCanvas(videoEl, w, h);

          ctx.save();
          if (s.mirror) {
            ctx.translate(viewport.x + viewport.width, viewport.y);
            ctx.scale(-1, 1);
          } else {
            ctx.translate(viewport.x, viewport.y);
          }

          let poseLandmarks: NormalizedLandmark[][] = [];
          let handLandmarks: NormalizedLandmark[][] = [];
          let faceLandmarks: NormalizedLandmark[][] = [];
          let handedness: string[] = [];

          if (bundle.type === 'ready') {
            const tsMs = performance.now();
            if (bundle.pose && (s.mode === 'pose' || s.mode === 'both')) {
              try {
                const res = bundle.pose.detectForVideo(videoEl, tsMs);
                poseLandmarks = res.landmarks ?? [];
              } catch {
                /* ignore frame error */
              }
            }
            if (bundle.face && (s.mode === 'pose' || s.mode === 'both')) {
              if (tsMs - lastFaceDetectionRef.current >= 90) {
                lastFaceDetectionRef.current = tsMs;
                try {
                  const res = bundle.face.detectForVideo(videoEl, tsMs);
                  faceLandmarksRef.current = res.faceLandmarks ?? [];
                } catch {
                  /* keep last face result for this short interval */
                }
              }
              faceLandmarks = faceLandmarksRef.current;
            } else {
              faceLandmarksRef.current = [];
            }
            if (bundle.hands && (s.mode === 'hands' || s.mode === 'both')) {
              try {
                const res = bundle.hands.detectForVideo(videoEl, tsMs);
                const detectedHands = res.landmarks ?? [];
                handedness = (res.handedness ?? []).map((c) => c[0]?.categoryName ?? '');
                handLandmarks = smoothHandLandmarks(detectedHands, handedness, smoothedHandsRef.current);
              } catch {
                /* ignore frame error */
              }
            }
          }

          for (let i = 0; i < poseLandmarks.length; i++) {
            const color = PERSON_COLORS[i % PERSON_COLORS.length];
            if (s.showSkeleton) {
              for (const group of POSE_CONNECTION_GROUPS) {
                drawConnections(ctx, poseLandmarks[i], group.connections, viewport.width, viewport.height, group.color, s.lineWidth);
              }
            }
            if (s.showPoints) {
              drawPoints(ctx, poseLandmarks[i], viewport.width, viewport.height, color, s.accentColor, s.pointSize, s.showLabels);
            }
          }
          if (s.showSkeleton) {
            for (const face of faceLandmarks) {
              drawConnections(ctx, face, FACE_CONNECTIONS, viewport.width, viewport.height, '#fbbf24', Math.max(1, s.lineWidth * 0.7));
            }
            for (const hand of handLandmarks) {
              for (const group of HAND_CONNECTION_GROUPS) {
                drawConnections(ctx, hand, group.connections, viewport.width, viewport.height, group.color, s.lineWidth);
              }
            }
          }
          if (s.showPoints) {
            for (const hand of handLandmarks) {
              drawPoints(ctx, hand, viewport.width, viewport.height, s.handColor, s.accentColor, s.pointSize, s.showLabels);
              drawFingertips(ctx, hand, viewport.width, viewport.height, s.handColor, s.pointSize);
            }
          }
          ctx.restore();

          const fpsState = fpsCounterRef.current;
          fpsState.frames++;
          if (now - fpsState.lastTs >= 500) {
            fpsState.fps = (fpsState.frames * 1000) / (now - fpsState.lastTs);
            fpsState.frames = 0;
            fpsState.lastTs = now;
            onFps?.(fpsState.fps);
          }

          onLandmarks?.({ pose: poseLandmarks, hands: handLandmarks, handedness });

          rafRef.current = requestAnimationFrame(renderLoop);
        };
        rafRef.current = requestAnimationFrame(renderLoop);

        cleanup = () => {
          ro.disconnect();
          if (rafRef.current) cancelAnimationFrame(rafRef.current);
          rafRef.current = null;
          stream.getTracks().forEach((t) => t.stop());
          streamRef.current = null;
        };
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        setStatus('error');
        setStatusMessage(`ไม่สามารถเปิดกล้องได้: ${message}`);
        return;
      }
    }

    if (settings.enabled) {
      start();
    } else {
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((t) => t.stop());
        streamRef.current = null;
      }
      if (rafRef.current) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
      setStatus('idle');
      setStatusMessage('');
      const canvas = canvasRef.current;
      if (canvas) {
        const ctx = canvas.getContext('2d');
        ctx?.clearRect(0, 0, canvas.clientWidth, canvas.clientHeight);
      }
    }

    return () => {
      cancelled = true;
      cleanup?.();
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((t) => t.stop());
        streamRef.current = null;
      }
      if (rafRef.current) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
    };
  }, [settings.enabled, settings.mode, activeDeviceId, ensureLandmarkers, refreshCameras, onFps, onLandmarks]);

  const handleSwitchCamera = useCallback(async (deviceId: string) => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
    setActiveDeviceId(deviceId);
  }, []);

  return (
    <div
      ref={containerRef}
      className="relative aspect-[3/4] w-full overflow-hidden rounded-xl bg-black sm:aspect-video"
    >
      <video
        ref={videoRef}
        className="absolute inset-0 h-full w-full object-contain"
        style={{
          transform: settings.mirror ? 'scaleX(-1)' : undefined,
          opacity: settings.showVideo ? 1 : 0,
          transition: 'opacity 0.3s ease',
        }}
        playsInline
        muted
      />
      <canvas ref={canvasRef} className="absolute inset-0 h-full w-full" />

      {status !== 'running' && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-black/80 text-center text-white">
          {status === 'loading-model' && <StatusSpinner />}
          {status === 'requesting-camera' && <StatusSpinner />}
          {status === 'error' && (
            <div className="rounded-full bg-red-500/20 px-3 py-1 text-xs font-medium text-red-300">
              ERROR
            </div>
          )}
          {status === 'idle' && (
            <div className="rounded-full bg-cyan-500/20 px-3 py-1 text-xs font-medium text-cyan-300">
              STANDBY
            </div>
          )}
          <p className="max-w-xs text-sm text-zinc-300">{statusMessage || 'กดปุ่มเริ่มเพื่อเปิดกล้อง'}</p>
        </div>
      )}

      {cameraDevices.length > 1 && status === 'running' && (
        <div className="absolute right-3 top-3 z-10">
          <select
            value={activeDeviceId ?? ''}
            onChange={(e) => handleSwitchCamera(e.target.value)}
            className="rounded-md border border-white/20 bg-black/60 px-2 py-1 text-xs text-white backdrop-blur"
          >
            {cameraDevices.map((cam, idx) => (
              <option key={cam.deviceId} value={cam.deviceId} className="bg-zinc-900">
                {cam.label || `กล้อง ${idx + 1}`}
              </option>
            ))}
          </select>
        </div>
      )}
    </div>
  );
}

function smoothHandLandmarks(
  hands: NormalizedLandmark[][],
  handedness: string[],
  previousHands: Map<string, NormalizedLandmark[]>,
): NormalizedLandmark[][] {
  const nextHands = new Map<string, NormalizedLandmark[]>();
  const matchedPrevious = new Set<string>();
  const smoothed = hands.map((landmarks, handIndex) => {
    const side = handedness[handIndex] || 'unknown';
    const wrist = landmarks[0];
    let key: string | undefined;
    let previous: NormalizedLandmark[] | undefined;
    let closestDistance = Infinity;
    if (wrist) {
      for (const [candidateKey, candidate] of previousHands) {
        const priorWrist = candidate[0];
        if (!priorWrist || matchedPrevious.has(candidateKey) || !candidateKey.startsWith(`${side}:`)) continue;
        const distance = Math.hypot(wrist.x - priorWrist.x, wrist.y - priorWrist.y);
        if (distance < closestDistance && distance < 0.25) {
          closestDistance = distance;
          key = candidateKey;
          previous = candidate;
        }
      }
    }
    key ??= `${side}:${handIndex}`;
    matchedPrevious.add(key);
    const result = landmarks.map((point, index) => {
      const prior = previous?.[index];
      if (!prior) return { ...point };

      const distance = Math.hypot(point.x - prior.x, point.y - prior.y, (point.z ?? 0) - (prior.z ?? 0));
      // Filter small frame-to-frame jitter while letting fast gestures catch up quickly.
      const response = distance > 0.035 ? 0.82 : 0.42;
      return {
        ...point,
        x: prior.x + (point.x - prior.x) * response,
        y: prior.y + (point.y - prior.y) * response,
        z: (prior.z ?? 0) + ((point.z ?? 0) - (prior.z ?? 0)) * response,
      };
    });
    nextHands.set(key, result);
    return result;
  });

  previousHands.clear();
  for (const [key, landmarks] of nextHands) previousHands.set(key, landmarks);
  return smoothed;
}

function fitVideoToCanvas(video: HTMLVideoElement, width: number, height: number) {
  const videoWidth = video.videoWidth || width;
  const videoHeight = video.videoHeight || height;
  const scale = Math.min(width / videoWidth, height / videoHeight);
  const fittedWidth = videoWidth * scale;
  const fittedHeight = videoHeight * scale;
  return {
    x: (width - fittedWidth) / 2,
    y: (height - fittedHeight) / 2,
    width: fittedWidth,
    height: fittedHeight,
  };
}

function StatusSpinner() {
  return (
    <div className="h-8 w-8 animate-spin rounded-full border-2 border-white/30 border-t-cyan-400" />
  );
}

function drawConnections(
  ctx: CanvasRenderingContext2D,
  landmarks: NormalizedLandmark[],
  connections: ReadonlyArray<readonly [number, number]>,
  w: number,
  h: number,
  color: string,
  lineWidth: number,
) {
  ctx.strokeStyle = color;
  ctx.lineWidth = lineWidth;
  ctx.lineCap = 'round';
  ctx.shadowColor = color;
  ctx.shadowBlur = 3;
  ctx.beginPath();
  for (const [a, b] of connections) {
    const la = landmarks[a];
    const lb = landmarks[b];
    if (!la || !lb) continue;
    if ((la.visibility ?? 1) < 0.5 || (lb.visibility ?? 1) < 0.5) continue;
    ctx.moveTo(la.x * w, la.y * h);
    ctx.lineTo(lb.x * w, lb.y * h);
  }
  ctx.stroke();
  ctx.shadowBlur = 0;
}

function drawPoints(
  ctx: CanvasRenderingContext2D,
  landmarks: NormalizedLandmark[],
  w: number,
  h: number,
  color: string,
  accent: string,
  size: number,
  showLabels: boolean,
) {
  for (let i = 0; i < landmarks.length; i++) {
    const lm = landmarks[i];
    if (!lm) continue;
    if ((lm.visibility ?? 1) < 0.5) continue;
    const x = lm.x * w;
    const y = lm.y * h;
    ctx.beginPath();
    ctx.fillStyle = accent;
    ctx.shadowColor = accent;
    ctx.shadowBlur = 4;
    ctx.arc(x, y, size + 1.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.fillStyle = color;
    ctx.shadowBlur = 0;
    ctx.arc(x, y, size, 0, Math.PI * 2);
    ctx.fill();

    if (showLabels) {
      ctx.save();
      ctx.shadowBlur = 0;
      ctx.font = '10px ui-monospace, monospace';
      ctx.fillStyle = '#ffffff';
      ctx.textAlign = 'center';
      ctx.fillText(String(i), x, y - size - 4);
      ctx.restore();
    }
  }
}

function drawFingertips(
  ctx: CanvasRenderingContext2D,
  landmarks: NormalizedLandmark[],
  width: number,
  height: number,
  color: string,
  size: number,
) {
  for (const [tipIndex, index] of [4, 8, 12, 16, 20].entries()) {
    const point = landmarks[index];
    if (!point) continue;
    ctx.beginPath();
    const tipColor = HAND_TIP_COLORS[tipIndex] ?? color;
    ctx.strokeStyle = tipColor;
    ctx.lineWidth = Math.max(1, size * 0.55);
    ctx.shadowColor = tipColor;
    ctx.shadowBlur = 5;
    ctx.arc(point.x * width, point.y * height, size * 1.8, 0, Math.PI * 2);
    ctx.stroke();
  }
  ctx.shadowBlur = 0;
}
