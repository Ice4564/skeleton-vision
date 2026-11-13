'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  PoseLandmarker,
  HandLandmarker,
  FilesetResolver,
  type NormalizedLandmark,
} from '@mediapipe/tasks-vision';
import { POSE_CONNECTIONS, HAND_CONNECTIONS } from '@/lib/mediapipe-connections';

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
  | { type: 'ready'; pose: PoseLandmarker | null; hands: HandLandmarker | null };

const WASM_BASE = 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.22-rc.20250304/wasm';
const POSE_MODEL =
  'https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_full/float16/1/pose_landmarker_full.task';
const HAND_MODEL =
  'https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task';

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

      const [pose, hands] = await Promise.all([
        needsPose
          ? PoseLandmarker.createFromOptions(fileset, {
              baseOptions: {
                modelAssetPath: POSE_MODEL,
                delegate: 'GPU',
              },
              runningMode: 'VIDEO',
              numPoses: 1,
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
              numHands: 2,
              minHandDetectionConfidence: settingsRef.current.minDetectionConfidence,
              minHandPresenceConfidence: 0.5,
              minTrackingConfidence: settingsRef.current.minTrackingConfidence,
            })
          : Promise.resolve(null),
      ]);

      bundleRef.current = { type: 'ready', pose, hands };
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
      const { pose, hands } = bundleRef.current;
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
        const constraints: MediaStreamConstraints = {
          video: {
            facingMode: 'user',
            width: { ideal: 1280 },
            height: { ideal: 720 },
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

          ctx.save();
          if (s.mirror) {
            ctx.translate(w, 0);
            ctx.scale(-1, 1);
          }

          let poseLandmarks: NormalizedLandmark[][] = [];
          let handLandmarks: NormalizedLandmark[][] = [];
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

          if (s.showSkeleton) {
            if (poseLandmarks.length > 0) {
              drawConnections(ctx, poseLandmarks[0], POSE_CONNECTIONS, w, h, s.poseColor, s.lineWidth);
            }
            for (let i = 0; i < handLandmarks.length; i++) {
              drawConnections(ctx, handLandmarks[i], HAND_CONNECTIONS, w, h, s.handColor, s.lineWidth);
            }
          }
          if (s.showPoints) {
            if (poseLandmarks.length > 0) {
              drawPoints(ctx, poseLandmarks[0], w, h, s.poseColor, s.accentColor, s.pointSize, s.showLabels);
            }
            for (let i = 0; i < handLandmarks.length; i++) {
              drawPoints(ctx, handLandmarks[i], w, h, s.handColor, s.accentColor, s.pointSize, s.showLabels);
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
      className="relative w-full overflow-hidden rounded-xl bg-black"
      style={{ aspectRatio: '16 / 9' }}
    >
      <video
        ref={videoRef}
        className="absolute inset-0 h-full w-full object-cover"
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
  const smoothed = hands.map((landmarks, handIndex) => {
    const key = handedness[handIndex] || `hand-${handIndex}`;
    const previous = previousHands.get(key);
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
  ctx.shadowBlur = 8;
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
    ctx.shadowBlur = 10;
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
