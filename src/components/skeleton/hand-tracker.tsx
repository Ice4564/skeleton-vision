'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  FilesetResolver,
  FaceLandmarker,
  HandLandmarker,
  type NormalizedLandmark,
} from '@mediapipe/tasks-vision';
import { HAND_CONNECTION_GROUPS } from '@/lib/hand-connections';
import { Maximize2, Minimize2 } from 'lucide-react';

export type HandGesture = 'finger-heart' | 'l-sign' | 'peace' | 'thumbs-up' | 'open-hand' | 'fist' | 'pinch' | 'index-up' | 'shush' | 'middle-finger' | 'none';

export interface HandResult {
  side: string;
  gesture: HandGesture;
}

export interface HandTrackerSettings {
  enabled: boolean;
  mirror: boolean;
  showVideo: boolean;
  showSkeleton: boolean;
  showPoints: boolean;
  showEffects: boolean;
  pointSize: number;
  lineWidth: number;
  minDetectionConfidence: number;
  minTrackingConfidence: number;
}

export const DEFAULT_HAND_SETTINGS: HandTrackerSettings = {
  enabled: false,
  mirror: true,
  showVideo: true,
  showSkeleton: true,
  showPoints: true,
  showEffects: true,
  pointSize: 5,
  lineWidth: 3,
  minDetectionConfidence: 0.45,
  minTrackingConfidence: 0.45,
};

interface HandTrackerProps {
  settings: HandTrackerSettings;
  onFps?: (fps: number) => void;
  onResults?: (result: { count: number; gestures: HandResult[] }) => void;
}

type ModelState =
  | { type: 'loading' }
  | { type: 'error'; message: string }
  | { type: 'ready'; hands: HandLandmarker };

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  size: number;
  life: number;
  kind: 'heart' | 'spark' | 'burst' | 'wave';
  color: string;
}

const WASM_BASE = 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.22-rc.20250304/wasm';
const HAND_MODEL =
  'https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task';
const HAND_COLOR = '#ff78a8';
const GESTURE_IMAGES: Partial<Record<HandGesture, string>> = {
  'index-up': '/gestures/index.png',
  shush: '/gestures/shush.png',
  'middle-finger': '/gestures/middle.png',
};
export const GESTURE_LABELS: Record<HandGesture, string> = {
  'finger-heart': 'หัวใจนิ้ว',
  'l-sign': 'ท่า L',
  peace: 'ชูสองนิ้ว',
  'thumbs-up': 'เยี่ยมเลย',
  'open-hand': 'แบมือ',
  fist: 'กำมือ',
  pinch: 'แตะปลายนิ้ว',
  'index-up': 'ชูนิ้วชี้',
  shush: 'นิ้วชี้แตะปาก',
  'middle-finger': 'ชูนิ้วกลาง',
  none: '',
};

export function HandTracker({ settings, onFps, onResults }: HandTrackerProps) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const backdropVideoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const modelRef = useRef<ModelState>({ type: 'loading' });
  const faceRef = useRef<FaceLandmarker | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const rafRef = useRef<number | null>(null);
  const settingsRef = useRef(settings);
  settingsRef.current = settings;
  const previousHandsRef = useRef<Map<string, NormalizedLandmark[]>>(new Map());
  const particlesRef = useRef<Particle[]>([]);
  const cachedHandsRef = useRef<NormalizedLandmark[][]>([]);
  const cachedGesturesRef = useRef<HandResult[]>([]);
  const particleTimeRef = useRef(0);
  const lastEffectAtRef = useRef(0);
  const lastGestureBySideRef = useRef<Map<string, HandGesture>>(new Map());
  const lastVideoTimeRef = useRef(-1);
  const fpsRef = useRef({ frames: 0, lastTime: 0 });

  const [status, setStatus] = useState<'idle' | 'loading' | 'camera' | 'running' | 'error'>('idle');
  const [message, setMessage] = useState('กดเริ่มจับมือเพื่อเปิดกล้อง');
  const [cameras, setCameras] = useState<MediaDeviceInfo[]>([]);
  const [deviceId, setDeviceId] = useState('');
  const [fullscreen, setFullscreen] = useState(false);
  const [cameraZoom, setCameraZoom] = useState(0.5);
  const [zoomSupported, setZoomSupported] = useState(false);
  const [imageFailed, setImageFailed] = useState(false);
  const [activeImage, setActiveImage] = useState<{ gesture: HandGesture; src: string } | null>(null);
  const activeImageSourceRef = useRef<string | null>(null);
  const pendingImageChangeRef = useRef<{ key: string; since: number } | null>(null);

  useEffect(() => {
    const updateFullscreen = () => setFullscreen(document.fullscreenElement === containerRef.current);
    document.addEventListener('fullscreenchange', updateFullscreen);
    return () => document.removeEventListener('fullscreenchange', updateFullscreen);
  }, []);

  useEffect(() => {
    const track = streamRef.current?.getVideoTracks()[0];
    if (!track || status !== 'running') return;
    let cancelled = false;
    const applyCameraZoom = async () => {
      try {
        if (typeof track.getCapabilities !== 'function') throw new Error('Camera zoom is unavailable');
        const capabilities = track.getCapabilities() as MediaTrackCapabilities & { zoom?: { min: number; max: number } };
        const zoomRange = capabilities.zoom;
        const canZoomOutToHalf = Boolean(zoomRange && zoomRange.min <= 0.5 && zoomRange.max >= 1);
        setZoomSupported(canZoomOutToHalf);
        if (!canZoomOutToHalf || cameraZoom < zoomRange!.min || cameraZoom > zoomRange!.max) {
          return;
        }
        await track.applyConstraints({ advanced: [{ zoom: cameraZoom } as unknown as MediaTrackConstraintSet] });
      } catch {
        if (!cancelled) {
          setZoomSupported(false);
        }
      }
    };
    void applyCameraZoom();
    return () => { cancelled = true; };
  }, [cameraZoom, status]);

  useEffect(() => () => {
    if (modelRef.current.type === 'ready') {
      modelRef.current.hands.close();
      faceRef.current?.close();
      faceRef.current = null;
      modelRef.current = { type: 'loading' };
    }
  }, []);

  const loadHandModel = useCallback(async () => {
    if (modelRef.current.type === 'ready' || modelRef.current.type === 'error') return modelRef.current;
    setStatus('loading');
    setMessage('กำลังเตรียมตัวจับมือ');
    try {
      const fileset = await FilesetResolver.forVisionTasks(WASM_BASE);
      const hands = await HandLandmarker.createFromOptions(fileset, {
        baseOptions: { modelAssetPath: HAND_MODEL, delegate: 'GPU' },
        runningMode: 'VIDEO',
        numHands: 2,
        minHandDetectionConfidence: settingsRef.current.minDetectionConfidence,
        minHandPresenceConfidence: 0.4,
        minTrackingConfidence: settingsRef.current.minTrackingConfidence,
      });
      try {
        faceRef.current = await FaceLandmarker.createFromOptions(fileset, {
          baseOptions: {
            modelAssetPath: 'https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task',
            delegate: 'GPU',
          },
          runningMode: 'VIDEO',
          numFaces: 1,
          minFaceDetectionConfidence: 0.45,
          minFacePresenceConfidence: 0.4,
          minTrackingConfidence: 0.45,
        });
      } catch {
        faceRef.current = null;
      }
      modelRef.current = { type: 'ready', hands };
      return modelRef.current;
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error);
      modelRef.current = { type: 'error', message: detail };
      setStatus('error');
      setMessage(`เปิดตัวจับมือไม่สำเร็จ: ${detail}`);
      return modelRef.current;
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    let cleanup: (() => void) | undefined;

    async function start() {
      const video = videoRef.current;
      const canvas = canvasRef.current;
      const container = containerRef.current;
      if (!video || !canvas || !container) return;

      const model = await loadHandModel();
      if (cancelled || model.type !== 'ready') return;
      lastVideoTimeRef.current = -1;
      cachedHandsRef.current = [];
      cachedGesturesRef.current = [];
      previousHandsRef.current.clear();
      lastGestureBySideRef.current.clear();

      setStatus('camera');
      setMessage('กำลังขอใช้กล้อง');
      try {
        const portrait = window.matchMedia('(max-width: 640px)').matches;
        const stream = await navigator.mediaDevices.getUserMedia({
          video: {
            width: { ideal: portrait ? 720 : 1280 },
            height: { ideal: portrait ? 1280 : 720 },
            ...(deviceId ? { deviceId: { exact: deviceId } } : { facingMode: 'user' }),
          },
          audio: false,
        });
        if (cancelled) {
          stream.getTracks().forEach((track) => track.stop());
          return;
        }
        streamRef.current = stream;
        video.srcObject = stream;
        await video.play();
        if (backdropVideoRef.current) {
          backdropVideoRef.current.srcObject = stream;
          await backdropVideoRef.current.play().catch(() => undefined);
        }

        const refreshCameras = async () => {
          try {
            const devices = await navigator.mediaDevices.enumerateDevices();
            const available = devices.filter((item) => item.kind === 'videoinput');
            setCameras(available);
            const currentDeviceId = stream.getVideoTracks()[0]?.getSettings().deviceId;
            const selectedDeviceId = currentDeviceId || available[0]?.deviceId;
            if (!deviceId && selectedDeviceId) setDeviceId(selectedDeviceId);
          } catch {
            setCameras([]);
          }
        };
        await refreshCameras();

        const resize = () => {
          const width = container.clientWidth;
          const height = container.clientHeight;
          const dpr = Math.min(window.devicePixelRatio || 1, 2);
          canvas.width = Math.round(width * dpr);
          canvas.height = Math.round(height * dpr);
          canvas.style.width = `${width}px`;
          canvas.style.height = `${height}px`;
          canvas.getContext('2d')?.setTransform(dpr, 0, 0, dpr, 0, 0);
        };
        resize();
        const observer = new ResizeObserver(resize);
        observer.observe(container);
        setStatus('running');
        setMessage('ยื่นมือเข้ามาในกรอบ');
        fpsRef.current = { frames: 0, lastTime: performance.now() };

        const render = (time: number) => {
          if (cancelled) return;
          const currentVideo = videoRef.current;
          const currentCanvas = canvasRef.current;
          const ctx = currentCanvas?.getContext('2d');
          if (!currentVideo || !currentCanvas || !ctx || currentVideo.readyState < 2) {
            rafRef.current = requestAnimationFrame(render);
            return;
          }

          const options = settingsRef.current;
          const width = currentCanvas.clientWidth;
          const height = currentCanvas.clientHeight;
          const viewport = fitVideo(currentVideo, width, height);
          ctx.clearRect(0, 0, width, height);
          ctx.save();
          if (options.mirror) {
            ctx.translate(viewport.x + viewport.width, viewport.y);
            ctx.scale(-1, 1);
          } else {
            ctx.translate(viewport.x, viewport.y);
          }

          let landmarks: NormalizedLandmark[][] = [];
          let sides: string[] = [];
          let gestures: HandResult[] = [];
          if (model.type === 'ready' && currentVideo.currentTime !== lastVideoTimeRef.current) {
            lastVideoTimeRef.current = currentVideo.currentTime;
            try {
              const result = model.hands.detectForVideo(currentVideo, time);
              sides = (result.handedness ?? []).map((side) => side[0]?.categoryName ?? '');
              landmarks = smoothHands(result.landmarks ?? [], sides, previousHandsRef.current);
              let mouth: { x: number; y: number } | null = null;
              try {
                const faceResult = faceRef.current?.detectForVideo(currentVideo, time);
                const face = faceResult?.faceLandmarks[0];
                const upperLip = face?.[13];
                const lowerLip = face?.[14];
                if (upperLip && lowerLip) {
                  mouth = { x: (upperLip.x + lowerLip.x) / 2, y: (upperLip.y + lowerLip.y) / 2 };
                }
              } catch {
                mouth = null;
              }
              gestures = landmarks.map((hand, index) => ({
                side: sides[index] || `มือ ${index + 1}`,
                gesture: recognizeGesture(hand, mouth),
              }));
              for (let index = 0; index < landmarks.length; index++) {
                const side = sides[index] || `มือ ${index + 1}`;
                const gesture = gestures[index]?.gesture ?? 'none';
                const previousGesture = lastGestureBySideRef.current.get(side);
                if (options.showEffects && previousGesture === 'fist' && gesture === 'open-hand') {
                  const center = handGestureCenter(landmarks[index], gesture);
                  addPinkBurst(
                    particlesRef.current,
                    (viewport.x + center.x * viewport.width) / width,
                    (viewport.y + center.y * viewport.height) / height,
                    width,
                    height,
                  );
                }
                lastGestureBySideRef.current.set(side, gesture);
              }
            } catch {
              landmarks = [];
              sides = [];
              gestures = [];
            }
          } else {
            landmarks = cachedHandsRef.current;
            gestures = cachedGesturesRef.current;
          }
          cachedHandsRef.current = landmarks;
          cachedGesturesRef.current = gestures;

          const detectedGesture = gestures.find(({ gesture }) => GESTURE_IMAGES[gesture])?.gesture
            ?? gestures.find(({ gesture }) => gesture !== 'none')?.gesture
            ?? null;
          const imageGesture = detectedGesture && GESTURE_IMAGES[detectedGesture] ? detectedGesture : null;
          const nextImage = imageGesture && GESTURE_IMAGES[imageGesture]
            ? { gesture: imageGesture, src: GESTURE_IMAGES[imageGesture]! }
            : null;
          if (nextImage && activeImageSourceRef.current !== nextImage.src) {
            if (!activeImageSourceRef.current) {
              activeImageSourceRef.current = nextImage.src;
              setActiveImage(nextImage);
              setImageFailed(false);
              pendingImageChangeRef.current = null;
            } else if (pendingImageChangeRef.current?.key === nextImage.src) {
              if (time - pendingImageChangeRef.current.since >= 140) {
                activeImageSourceRef.current = nextImage.src;
                setActiveImage(nextImage);
                setImageFailed(false);
                pendingImageChangeRef.current = null;
              }
            } else {
              pendingImageChangeRef.current = { key: nextImage.src, since: time };
            }
          } else if (nextImage) {
            pendingImageChangeRef.current = null;
          } else if (activeImageSourceRef.current) {
            const key = detectedGesture ?? 'no-hand';
            const delay = detectedGesture ? 200 : 900;
            if (pendingImageChangeRef.current?.key === key) {
              if (time - pendingImageChangeRef.current.since >= delay) {
                activeImageSourceRef.current = null;
                setActiveImage(null);
                setImageFailed(false);
                pendingImageChangeRef.current = null;
              }
            } else {
              pendingImageChangeRef.current = { key, since: time };
            }
          }

          for (let index = 0; index < landmarks.length; index++) {
            const hand = landmarks[index];
            const gesture = gestures[index]?.gesture ?? 'none';
            if (options.showSkeleton) drawHandBones(ctx, hand, viewport.width, viewport.height, options.lineWidth);
            if (options.showPoints) drawHandJoints(ctx, hand, viewport.width, viewport.height, options.pointSize);
            if (gesture !== 'none') {
              const center = handGestureCenter(hand, gesture);
              drawGestureLabel(
                ctx,
                GESTURE_LABELS[gesture],
                center.x * viewport.width,
                center.y * viewport.height,
                viewport.width,
                options.mirror,
              );
              if (options.showEffects && gesture === 'finger-heart' && time - lastEffectAtRef.current > 180) {
                addGestureParticles(
                  particlesRef.current,
                  (viewport.x + center.x * viewport.width) / width,
                  (viewport.y + center.y * viewport.height) / height,
                  gesture,
                );
                lastEffectAtRef.current = time;
              }
            }
          }
          ctx.restore();
          if (options.showEffects) {
            advanceParticles(particlesRef.current, time, particleTimeRef);
            drawParticles(ctx, particlesRef.current, width, height, time);
          } else {
            particlesRef.current = [];
          }

          const fps = fpsRef.current;
          fps.frames++;
          if (time - fps.lastTime >= 600) {
            onFps?.((fps.frames * 1000) / (time - fps.lastTime));
            fps.frames = 0;
            fps.lastTime = time;
          }
          onResults?.({ count: landmarks.length, gestures });
          rafRef.current = requestAnimationFrame(render);
        };
        rafRef.current = requestAnimationFrame(render);

        cleanup = () => {
          observer.disconnect();
          if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
          rafRef.current = null;
          stream.getTracks().forEach((track) => track.stop());
          streamRef.current = null;
        };
      } catch (error) {
        const detail = error instanceof Error ? error.message : String(error);
        streamRef.current?.getTracks().forEach((track) => track.stop());
        streamRef.current = null;
        setStatus('error');
        setMessage(`เปิดกล้องไม่ได้: ${detail}`);
      }
    }

    if (settings.enabled) {
      void start();
    } else {
      streamRef.current?.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
      setStatus('idle');
      setMessage('กดเริ่มจับมือเพื่อเปิดกล้อง');
      particlesRef.current = [];
      previousHandsRef.current.clear();
      cachedHandsRef.current = [];
      cachedGesturesRef.current = [];
      const ctx = canvasRef.current?.getContext('2d');
      if (ctx && canvasRef.current) ctx.clearRect(0, 0, canvasRef.current.clientWidth, canvasRef.current.clientHeight);
    }

    return () => {
      cancelled = true;
      cleanup?.();
      streamRef.current?.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    };
  }, [settings.enabled, deviceId, loadHandModel, onFps, onResults]);

  const switchCamera = useCallback((nextDeviceId: string) => setDeviceId(nextDeviceId), []);

  return (
    <div ref={containerRef} className={`relative aspect-[3/4] w-full overflow-hidden rounded-[20px] bg-[#09090b] sm:aspect-[4/3] ${fullscreen ? 'fixed inset-0 z-[9999] h-[100dvh] w-screen max-h-none max-w-none rounded-none !aspect-auto' : ''}`}>
      <video
        ref={backdropVideoRef}
        className="absolute inset-0 h-full w-full scale-110 object-cover blur-2xl"
        style={{ opacity: settings.showVideo ? 0.42 : 0 }}
        playsInline
        muted
        aria-hidden="true"
      />
      <video
        ref={videoRef}
        className="absolute inset-0 h-full w-full object-contain"
        style={{ transform: settings.mirror ? 'scaleX(-1)' : undefined, opacity: settings.showVideo ? 1 : 0 }}
        playsInline
        muted
      />
      <canvas ref={canvasRef} className="absolute inset-0 h-full w-full" />

      {status === 'running' && (
        <label className="absolute left-4 top-4 z-10 flex items-center gap-2 rounded-lg border border-white/15 bg-[#171514]/90 px-3 py-2 text-xs text-white shadow-lg backdrop-blur">
          <span className="whitespace-nowrap">{zoomSupported ? `ซูม ${cameraZoom.toFixed(2)}×` : 'กล้องนี้ไม่มีซูม 0.5×'}</span>
          <input
            aria-label="ปรับระยะซูมกล้อง"
            type="range"
            min="0.5"
            max="1"
            step="0.05"
            value={cameraZoom}
            disabled={!zoomSupported}
            onChange={(event) => setCameraZoom(Number(event.target.value))}
            className="w-24 accent-[#ff78a8] disabled:cursor-not-allowed disabled:opacity-40"
          />
        </label>
      )}

      <button type="button" onClick={async () => {
        if (fullscreen) {
          if (document.fullscreenElement) await document.exitFullscreen();
          else setFullscreen(false);
        } else if (containerRef.current?.requestFullscreen) {
          try {
            await containerRef.current.requestFullscreen();
          } catch {
            setFullscreen(true);
          }
        } else {
          setFullscreen(true);
        }
      }} className="absolute bottom-4 right-4 z-20 rounded-lg border border-white/20 bg-[#171514]/85 p-2.5 text-white shadow-lg backdrop-blur transition hover:bg-[#292522]" aria-label={fullscreen ? 'ออกจากเต็มจอ' : 'แสดงเต็มจอ'} title={fullscreen ? 'ออกจากเต็มจอ' : 'แสดงเต็มจอ'}>
        {fullscreen ? <Minimize2 className="h-5 w-5" /> : <Maximize2 className="h-5 w-5" />}
      </button>

      {activeImage && status === 'running' && !imageFailed && (
        <img src={activeImage.src} alt={GESTURE_LABELS[activeImage.gesture]} onError={() => setImageFailed(true)} className="pointer-events-none absolute right-4 top-16 z-10 h-[44%] w-[44%] max-h-[48%] max-w-[48%] rounded-xl border border-white/15 bg-[#09090b]/75 p-2 object-contain shadow-xl drop-shadow-[0_4px_18px_rgba(255,120,168,0.45)]" />
      )}

      {status !== 'running' && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 bg-[#09090b]/90 px-6 text-center text-[#f2ede9]">
          {status === 'loading' || status === 'camera' ? (
            <div className="h-8 w-8 animate-spin rounded-full border-2 border-white/15 border-t-[#ff7899]" />
          ) : (
            <HandMark />
          )}
          <p className="max-w-xs text-sm text-[#bcb4ae]">{message}</p>
        </div>
      )}

      {cameras.length > 1 && status === 'running' && (
        <label className="absolute right-4 top-4 z-10">
          <span className="sr-only">เลือกกล้อง</span>
          <select
            value={deviceId}
            onChange={(event) => switchCamera(event.target.value)}
            className="max-w-44 rounded-lg border border-white/15 bg-[#171514]/90 px-3 py-2 text-xs text-[#f2ede9] outline-none focus:border-[#ff7899]"
          >
            {cameras.map((camera, index) => (
              <option key={camera.deviceId} value={camera.deviceId} className="bg-[#171514]">
                {camera.label || `กล้อง ${index + 1}`}
              </option>
            ))}
          </select>
        </label>
      )}

      {status === 'running' && (
        <div className="pointer-events-none absolute bottom-4 left-4 flex items-center gap-2 rounded-lg bg-[#171514]/85 px-3 py-2 text-xs text-[#f2ede9]">
          <span className="h-2 w-2 rounded-full bg-[#70d6b5]" />
          {message}
        </div>
      )}
    </div>
  );
}

function fitVideo(video: HTMLVideoElement, width: number, height: number) {
  const sourceWidth = video.videoWidth || width;
  const sourceHeight = video.videoHeight || height;
          const scale = Math.min(width / sourceWidth, height / sourceHeight);
  const fittedWidth = sourceWidth * scale;
  const fittedHeight = sourceHeight * scale;
  return { x: (width - fittedWidth) / 2, y: (height - fittedHeight) / 2, width: fittedWidth, height: fittedHeight };
}

function smoothHands(
  hands: NormalizedLandmark[][],
  sides: string[],
  previousHands: Map<string, NormalizedLandmark[]>,
) {
  const next = new Map<string, NormalizedLandmark[]>();
  const used = new Set<string>();
  const smoothed = hands.map((hand, index) => {
    const side = sides[index] || 'hand';
    const wrist = hand[0];
    let key: string | undefined;
    let previous: NormalizedLandmark[] | undefined;
    let nearest = 0.2;
    if (wrist) {
      for (const [candidateKey, candidate] of previousHands) {
        if (used.has(candidateKey) || !candidateKey.startsWith(`${side}:`) || !candidate[0]) continue;
        const distance = Math.hypot(wrist.x - candidate[0].x, wrist.y - candidate[0].y);
        if (distance < nearest) {
          nearest = distance;
          key = candidateKey;
          previous = candidate;
        }
      }
    }
    key ??= `${side}:${index}`;
    used.add(key);
    const points = hand.map((point, pointIndex) => {
      const prior = previous?.[pointIndex];
      if (!prior) return { ...point };
      const movement = Math.hypot(point.x - prior.x, point.y - prior.y);
      const response = movement > 0.035 ? 0.82 : 0.48;
      return {
        ...point,
        x: prior.x + (point.x - prior.x) * response,
        y: prior.y + (point.y - prior.y) * response,
        z: (prior.z ?? 0) + ((point.z ?? 0) - (prior.z ?? 0)) * response,
      };
    });
    next.set(key, points);
    return points;
  });
  previousHands.clear();
  for (const [key, points] of next) previousHands.set(key, points);
  return smoothed;
}

function distance(a: NormalizedLandmark, b: NormalizedLandmark) {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

function recognizeGesture(hand: NormalizedLandmark[], mouth: { x: number; y: number } | null): HandGesture {
  if (hand.length < 21) return 'none';
  const wrist = hand[0];
  const extended = [
    distance(hand[4], hand[5]) > distance(hand[2], hand[5]) * 1.12,
    distance(hand[8], wrist) > distance(hand[5], wrist) * 1.18,
    distance(hand[12], wrist) > distance(hand[9], wrist) * 1.18,
    distance(hand[16], wrist) > distance(hand[13], wrist) * 1.15,
    distance(hand[20], wrist) > distance(hand[17], wrist) * 1.12,
  ];
  const [thumb, index, middle, ring, pinky] = extended;
  const palmWidth = Math.max(0.04, distance(hand[5], hand[17]));
  const pinch = distance(hand[4], hand[8]) < palmWidth * 0.42;
  const thumbIndexDot = (hand[4].x - wrist.x) * (hand[8].x - wrist.x) + (hand[4].y - wrist.y) * (hand[8].y - wrist.y);
  const thumbLength = distance(hand[4], wrist);
  const indexLength = distance(hand[8], wrist);
  const nearRightAngle = Math.abs(thumbIndexDot / Math.max(thumbLength * indexLength, 0.0001)) < 0.72;
  const indexBaseX = hand[8].x - hand[5].x;
  const indexBaseY = hand[8].y - hand[5].y;
  const indexAngleFromVertical = Math.atan2(Math.abs(indexBaseX), Math.abs(indexBaseY)) * (180 / Math.PI);
  const segmentOne = { x: hand[6].x - hand[5].x, y: hand[6].y - hand[5].y };
  const segmentTwo = { x: hand[8].x - hand[7].x, y: hand[8].y - hand[7].y };
  const segmentCosine = (segmentOne.x * segmentTwo.x + segmentOne.y * segmentTwo.y) /
    Math.max(Math.hypot(segmentOne.x, segmentOne.y) * Math.hypot(segmentTwo.x, segmentTwo.y), 0.0001);
  const indexIsStraight = segmentCosine > 0.78;
  const fingertipNearMouth = mouth !== null && distance(hand[8], mouth) < Math.max(0.045, Math.min(0.085, palmWidth * 0.8));
  const shushPose = index && !middle && !ring && !pinky && fingertipNearMouth && indexIsStraight && indexAngleFromVertical >= 20 && indexAngleFromVertical <= 70;

  if (middle && !index && !ring && !pinky) return 'middle-finger';
  if (shushPose) return 'shush';
  if (index && !middle && !ring && !pinky && !thumb) {
    return 'index-up';
  }
  if (pinch && !middle && !ring && !pinky) return 'finger-heart';
  if (thumb && index && !middle && !ring && !pinky && nearRightAngle) return 'l-sign';
  if (index && middle && !ring && !pinky) return 'peace';
  if (thumb && !index && !middle && !ring && !pinky) return 'thumbs-up';
  if (index && middle && ring && pinky) return 'open-hand';
  if (!thumb && !index && !middle && !ring && !pinky) return 'fist';
  if (pinch) return 'pinch';
  return 'none';
}

function handGestureCenter(hand: NormalizedLandmark[], gesture: HandGesture) {
  if (gesture === 'finger-heart' || gesture === 'pinch') {
    return { x: (hand[4].x + hand[8].x) / 2, y: (hand[4].y + hand[8].y) / 2 };
  }
  return { x: (hand[0].x + hand[9].x + hand[13].x) / 3, y: (hand[0].y + hand[9].y + hand[13].y) / 3 };
}

function drawHandBones(ctx: CanvasRenderingContext2D, hand: NormalizedLandmark[], width: number, height: number, lineWidth: number) {
  for (const group of HAND_CONNECTION_GROUPS) {
    ctx.beginPath();
    ctx.strokeStyle = HAND_COLOR;
    ctx.lineWidth = lineWidth;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.shadowColor = HAND_COLOR;
    ctx.shadowBlur = 2;
    for (const [start, end] of group.connections) {
      const a = hand[start];
      const b = hand[end];
      if (!a || !b) continue;
      ctx.moveTo(a.x * width, a.y * height);
      ctx.lineTo(b.x * width, b.y * height);
    }
    ctx.stroke();
  }
  ctx.shadowBlur = 0;
}

function drawHandJoints(ctx: CanvasRenderingContext2D, hand: NormalizedLandmark[], width: number, height: number, size: number) {
  for (let index = 0; index < hand.length; index++) {
    const point = hand[index];
    if (!point) continue;
    const color = HAND_COLOR;
    const radius = size * ([4, 8, 12, 16, 20].includes(index) ? 1.15 : 0.8);
    ctx.beginPath();
    ctx.fillStyle = '#171514';
    ctx.strokeStyle = color;
    ctx.lineWidth = Math.max(1.25, size * 0.48);
    ctx.arc(point.x * width, point.y * height, radius, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
  }
}

function drawGestureLabel(
  ctx: CanvasRenderingContext2D,
  label: string,
  x: number,
  y: number,
  viewWidth: number,
  mirrored: boolean,
) {
  ctx.save();
  ctx.font = '500 12px ui-sans-serif, system-ui, sans-serif';
  const badgeWidth = ctx.measureText(label).width + 24;
  const height = 28;
  const centerX = Math.max(badgeWidth / 2 + 4, Math.min(x, viewWidth - badgeWidth / 2 - 4));
  const top = Math.max(4, y - 58);
  ctx.translate(centerX, top + height);
  if (mirrored) ctx.scale(-1, 1);
  ctx.beginPath();
  roundedRect(ctx, -badgeWidth / 2, -height, badgeWidth, height, 8);
  ctx.fillStyle = 'rgba(23, 21, 20, 0.92)';
  ctx.fill();
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.28)';
  ctx.lineWidth = 1;
  ctx.stroke();
  ctx.fillStyle = '#fff7ef';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(label, 0, -height / 2);
  ctx.restore();
}

function roundedRect(ctx: CanvasRenderingContext2D, x: number, y: number, width: number, height: number, radius: number) {
  ctx.moveTo(x + radius, y);
  ctx.arcTo(x + width, y, x + width, y + height, radius);
  ctx.arcTo(x + width, y + height, x, y + height, radius);
  ctx.arcTo(x, y + height, x, y, radius);
  ctx.arcTo(x, y, x + width, y, radius);
  ctx.closePath();
}

function addGestureParticles(particles: Particle[], x: number, y: number, gesture: HandGesture) {
  const kind = gesture === 'finger-heart' ? 'heart' : 'spark';
  const colors = ['#ff78a8', '#ffb4ce', '#ffe0ed'];
  for (let index = 0; index < (kind === 'heart' ? 2 : 1); index++) {
    particles.push({
      x: x + (Math.random() - 0.5) * 0.04,
      y: y + (Math.random() - 0.5) * 0.035,
      vx: (Math.random() - 0.5) * 0.12,
      vy: -0.08 - Math.random() * 0.08,
      size: 0.008 + Math.random() * 0.008,
      life: 1,
      kind,
      color: colors[index % colors.length],
    });
  }
  if (particles.length > 48) particles.splice(0, particles.length - 48);
}

function addPinkBurst(particles: Particle[], x: number, y: number, width: number, height: number) {
  const shortSide = Math.min(width, height);
  for (let index = 0; index < 360; index++) {
    const angle = (Math.PI * 2 * index) / 360 + (Math.random() - 0.5) * 0.24;
    const speed = 0.45 + Math.random() * 1.45;
    particles.push({
      x, y,
      vx: Math.cos(angle) * speed * shortSide / width,
      vy: Math.sin(angle) * speed * shortSide / height,
      size: 0.012 + Math.random() * 0.019, life: 1.2,
      kind: index % 6 === 0 ? 'heart' : 'burst',
      color: ['#ff4f93', '#ff78a8', '#ff9bc0', '#ffd0e1'][index % 4],
    });
  }
  for (let index = 0; index < 3; index++) {
    particles.push({
      x, y, vx: 0, vy: 0, size: 0.04, life: 1 - index * 0.12,
      kind: 'wave', color: ['#ff4f93', '#ff9bc0', '#ffe0ed'][index],
    });
  }
  if (particles.length > 500) particles.splice(0, particles.length - 500);
}

function advanceParticles(particles: Particle[], time: number, lastTimeRef: { current: number }) {
  const previousTime = lastTimeRef.current || time;
  const delta = Math.min(0.05, (time - previousTime) / 1000);
  lastTimeRef.current = time;
  for (const particle of particles) {
    particle.x += particle.vx * delta;
    particle.y += particle.vy * delta;
    particle.life -= delta * 0.9;
  }
  for (let index = particles.length - 1; index >= 0; index--) {
    if (particles[index].life <= 0) particles.splice(index, 1);
  }
}

function drawParticles(ctx: CanvasRenderingContext2D, particles: Particle[], width: number, height: number, time: number) {
  for (const particle of particles) {
    const scale = 0.65 + Math.sin(time / 90 + particle.x * 20) * 0.08;
    const x = particle.x * width;
    const y = particle.y * height;
    const size = particle.size * Math.min(width, height) * scale;
    ctx.save();
    ctx.globalAlpha = Math.max(0, particle.life);
    if (particle.kind === 'heart') drawHeart(ctx, x, y, size, particle.color);
    else if (particle.kind === 'wave') drawWave(ctx, x, y, Math.max(width, height) * (1 - particle.life) * 1.25, particle.color, particle.life);
    else drawSpark(ctx, x, y, size, particle.color);
    ctx.restore();
  }
}

function drawWave(ctx: CanvasRenderingContext2D, x: number, y: number, radius: number, color: string, life: number) {
  ctx.beginPath();
  ctx.arc(x, y, Math.max(4, radius), 0, Math.PI * 2);
  ctx.strokeStyle = color;
  ctx.lineWidth = 2 + life * 7;
  ctx.shadowColor = color;
  ctx.shadowBlur = 18 * life;
  ctx.stroke();
  ctx.shadowBlur = 0;
}

function drawHeart(ctx: CanvasRenderingContext2D, x: number, y: number, size: number, color: string) {
  ctx.translate(x, y);
  ctx.scale(size, size);
  ctx.beginPath();
  ctx.moveTo(0, 0.35);
  ctx.bezierCurveTo(-0.9, -0.2, -0.65, -0.75, -0.2, -0.62);
  ctx.bezierCurveTo(0, -0.57, 0.02, -0.3, 0, -0.18);
  ctx.bezierCurveTo(0.02, -0.3, 0.2, -0.62, 0.48, -0.62);
  ctx.bezierCurveTo(1.05, -0.62, 0.85, 0.02, 0, 0.72);
  ctx.closePath();
  ctx.fillStyle = color;
  ctx.fill();
}

function drawSpark(ctx: CanvasRenderingContext2D, x: number, y: number, size: number, color: string) {
  ctx.translate(x, y);
  ctx.beginPath();
  ctx.moveTo(0, -size);
  ctx.quadraticCurveTo(size * 0.16, -size * 0.16, size, 0);
  ctx.quadraticCurveTo(size * 0.16, size * 0.16, 0, size);
  ctx.quadraticCurveTo(-size * 0.16, size * 0.16, -size, 0);
  ctx.quadraticCurveTo(-size * 0.16, -size * 0.16, 0, -size);
  ctx.fillStyle = color;
  ctx.fill();
}

function HandMark() {
  return (
    <div className="flex h-14 w-14 items-center justify-center rounded-2xl border border-white/10 bg-[#201d1b] text-[#ff7899]">
      <svg viewBox="0 0 32 32" className="h-7 w-7" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M10 16V7a2 2 0 0 1 4 0v7-9a2 2 0 0 1 4 0v9-7a2 2 0 0 1 4 0v9-4a2 2 0 0 1 4 0v9c0 5-3 8-8 8h-2c-3 0-5-1-7-4l-4-5a2 2 0 0 1 3-3l2 2" />
      </svg>
    </div>
  );
}
