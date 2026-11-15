'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import {
  Activity,
  Camera,
  Eye,
  Hand,
  Heart,
  Fingerprint,
  ImagePlus,
  Info,
  MonitorPlay,
  MousePointer2,
  Pause,
  Play,
  RefreshCw,
  RotateCcw,
  Settings2,
  Sparkles,
  Trash2,
  Trophy,
  Zap,
} from 'lucide-react';
import {
  DEFAULT_HAND_SETTINGS,
  DEFAULT_GESTURE_IMAGES,
  GESTURE_LABELS,
  HandTracker,
  type HandImageLayout,
  type HandImageSources,
  type HandResult,
  type HandTrackerSettings,
} from '@/components/skeleton/hand-tracker';
import { deleteGestureImage, loadGestureImages, saveGestureImage } from '@/lib/gesture-image-store';

const PRACTICE_GESTURES: { gesture: HandResult['gesture']; description: string; icon: typeof Heart }[] = [
  { gesture: 'finger-heart', description: 'แตะปลายนิ้วโป้งกับนิ้วชี้', icon: Heart },
  { gesture: 'l-sign', description: 'กางนิ้วโป้งกับนิ้วชี้เป็นมุมฉาก', icon: MousePointer2 },
  { gesture: 'peace', description: 'ชูนิ้วชี้และนิ้วกลาง', icon: Hand },
  { gesture: 'thumbs-up', description: 'ยกนิ้วโป้ง นิ้วอื่นกำไว้', icon: Zap },
  { gesture: 'open-hand', description: 'แบมือให้เห็นปลายนิ้วครบ', icon: Eye },
  { gesture: 'fist', description: 'กำมือเบา ๆ', icon: Activity },
  { gesture: 'index-up', description: 'ชูนิ้วชี้เดี่ยว', icon: MousePointer2 },
  { gesture: 'shush', description: 'ปลายนิ้วชี้แตะปาก นิ้วตรงเอียงราว 45°', icon: Fingerprint },
  { gesture: 'middle-finger', description: 'ชูนิ้วกลาง นิ้วอื่นงอ', icon: Hand },
  { gesture: 'pinch', description: 'แตะปลายนิ้วโป้งกับนิ้วชี้', icon: Fingerprint },
];

const CHALLENGE_GESTURES: HandResult['gesture'][] = [
  'open-hand', 'fist', 'peace', 'thumbs-up', 'index-up', 'middle-finger', 'l-sign', 'finger-heart',
];

const DEFAULT_IMAGE_LAYOUT: HandImageLayout = { x: 58, y: 12, size: 38 };

export default function HandHome() {
  const [settings, setSettings] = useState<HandTrackerSettings>(DEFAULT_HAND_SETTINGS);
  const [handCount, setHandCount] = useState(0);
  const [gestures, setGestures] = useState<HandResult[]>([]);
  const [fps, setFps] = useState(0);
  const [imageSources, setImageSources] = useState<HandImageSources>({});
  const [imageLayout, setImageLayout] = useState<HandImageLayout>(DEFAULT_IMAGE_LAYOUT);
  const [layoutReady, setLayoutReady] = useState(false);
  const [uploadMessage, setUploadMessage] = useState('');
  const [selectedGesture, setSelectedGesture] = useState<HandResult['gesture'] | null>(null);
  const [streamMode, setStreamMode] = useState(false);
  const [airDrawMode, setAirDrawMode] = useState(false);
  const [drawingColor, setDrawingColor] = useState('#ff78a8');
  const [drawingWidth, setDrawingWidth] = useState(5);
  const [clearDrawingToken, setClearDrawingToken] = useState(0);
  const [challengeSequence, setChallengeSequence] = useState<HandResult['gesture'][]>([]);
  const [challengeStep, setChallengeStep] = useState(0);
  const [challengeActive, setChallengeActive] = useState(false);
  const [challengeComplete, setChallengeComplete] = useState(false);
  const lastUpdateRef = useRef(0);
  const imageUrlsRef = useRef<HandImageSources>({});
  const challengeStreakRef = useRef(0);

  useEffect(() => {
    let cancelled = false;
    void loadGestureImages().then((images) => {
      const sources: HandImageSources = {};
      for (const [gesture, blob] of Object.entries(images)) {
        sources[gesture as HandResult['gesture']] = URL.createObjectURL(blob);
      }
      if (cancelled) {
        Object.values(sources).forEach((source) => source && URL.revokeObjectURL(source));
      } else {
        imageUrlsRef.current = sources;
        setImageSources(sources);
      }
    }).catch(() => setUploadMessage('ยังเปิดที่เก็บรูปไม่ได้ ลองเลือกรูปอีกครั้ง'));

    try {
      const savedLayout = localStorage.getItem('skeleton-vision-image-layout');
      if (savedLayout) {
        const layout = JSON.parse(savedLayout) as HandImageLayout;
        if ([layout.x, layout.y, layout.size].every(Number.isFinite) && layout.size >= 20 && layout.size <= 55) {
          setImageLayout({
            ...layout,
            x: Math.max(0, Math.min(layout.x, 100 - layout.size)),
            y: Math.max(0, Math.min(layout.y, 100 - layout.size)),
          });
        }
      }
    } catch {
      // Keep the default image position if saved browser settings cannot be read.
    }
    setLayoutReady(true);

    return () => {
      cancelled = true;
      Object.values(imageUrlsRef.current).forEach((source) => source && URL.revokeObjectURL(source));
      imageUrlsRef.current = {};
    };
  }, []);

  useEffect(() => {
    if (!layoutReady) return;
    try {
      localStorage.setItem('skeleton-vision-image-layout', JSON.stringify(imageLayout));
    } catch {
      // Layout controls remain available for this session without browser storage.
    }
  }, [imageLayout, layoutReady]);

  useEffect(() => {
    if (!challengeActive || !challengeSequence[challengeStep]) return;
    const target = challengeSequence[challengeStep];
    if (gestures.some((item) => item.gesture === target)) {
      challengeStreakRef.current += 1;
      if (challengeStreakRef.current >= 2) {
        challengeStreakRef.current = 0;
        if (challengeStep + 1 >= challengeSequence.length) {
          setChallengeStep(challengeSequence.length);
          setChallengeActive(false);
          setChallengeComplete(true);
        } else {
          setChallengeStep((step) => step + 1);
        }
      }
    } else {
      challengeStreakRef.current = 0;
    }
  }, [gestures, challengeActive, challengeSequence, challengeStep]);

  const handleResults = useCallback((result: { count: number; gestures: HandResult[] }) => {
    const now = performance.now();
    if (now - lastUpdateRef.current < 180) return;
    lastUpdateRef.current = now;
    setHandCount(result.count);
    setGestures(result.gestures);
  }, []);

  const update = useCallback(<K extends keyof HandTrackerSettings>(key: K, value: HandTrackerSettings[K]) => {
    setSettings((current) => ({ ...current, [key]: value }));
  }, []);

  const handleImageUpload = async (gesture: HandResult['gesture'], file?: File) => {
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      setUploadMessage('เลือกรูปภาพก่อนนะครับ');
      return;
    }
    if (file.size > 8 * 1024 * 1024) {
      setUploadMessage('รูปใหญ่เกินไป เลือกรูปไม่เกิน 8 MB');
      return;
    }
    try {
      await saveGestureImage(gesture, file);
      const previous = imageUrlsRef.current[gesture];
      if (previous) URL.revokeObjectURL(previous);
      const next = { ...imageUrlsRef.current, [gesture]: URL.createObjectURL(file) };
      imageUrlsRef.current = next;
      setImageSources(next);
      setUploadMessage(`บันทึกรูปสำหรับท่า${GESTURE_LABELS[gesture]}แล้ว`);
    } catch {
      setUploadMessage('บันทึกรูปไม่สำเร็จ ลองเลือกรูปที่เล็กลง');
    }
  };

  const handleImageDelete = async (gesture: HandResult['gesture']) => {
    try {
      await deleteGestureImage(gesture);
      const previous = imageUrlsRef.current[gesture];
      if (previous) URL.revokeObjectURL(previous);
      const next = { ...imageUrlsRef.current };
      delete next[gesture];
      imageUrlsRef.current = next;
      setImageSources(next);
      setUploadMessage(`ลบรูปที่เลือกไว้สำหรับท่า${GESTURE_LABELS[gesture]}แล้ว`);
    } catch {
      setUploadMessage('ลบรูปไม่สำเร็จ ลองใหม่อีกครั้ง');
    }
  };

  const startChallenge = () => {
    const pool = [...CHALLENGE_GESTURES];
    for (let index = pool.length - 1; index > 0; index--) {
      const swapIndex = Math.floor(Math.random() * (index + 1));
      [pool[index], pool[swapIndex]] = [pool[swapIndex], pool[index]];
    }
    setChallengeSequence(pool.slice(0, 3));
    setChallengeStep(0);
    setChallengeComplete(false);
    setChallengeActive(true);
    challengeStreakRef.current = 0;
    if (!settings.enabled) update('enabled', true);
  };

  const activeHands = gestures.filter((item) => item.gesture !== 'none');
  const activeGesture = activeHands[0]?.gesture;
  const selectedGestureFound = selectedGesture !== null && activeHands.some((item) => item.gesture === selectedGesture);

  return (
    <div className={`min-h-screen bg-[#12110f] text-[#f2ede9] ${streamMode ? 'overflow-hidden bg-black' : ''}`}>
      <header className={`${streamMode ? 'hidden' : 'border-b border-white/[0.08] bg-[#12110f]'}`}>
        <div className="mx-auto flex max-w-[1440px] items-center justify-between px-4 py-4 sm:px-8">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl border border-white/10 bg-[#201d1b] text-[#ff7899]">
              <Hand className="h-5 w-5" strokeWidth={1.7} />
            </div>
            <div>
              <p className="text-[15px] font-semibold">Skeleton Vision</p>
              <p className="mt-0.5 text-xs text-[#aaa39d]">จับมือ · เล่นท่าทาง · สร้างประกาย</p>
            </div>
          </div>
          <div className="flex items-center gap-2 rounded-lg border border-white/10 bg-[#191816] px-3 py-2 text-xs text-[#c7c0ba]">
            <span className={`h-2 w-2 rounded-full ${settings.enabled ? 'bg-[#70d6b5]' : 'bg-[#706a65]'}`} />
            {settings.enabled ? 'กำลังจับมือ' : 'พักอยู่'}
          </div>
        </div>
      </header>

      <main className={`${streamMode ? 'fixed inset-0 z-[100] h-[100dvh] w-screen max-w-none overflow-hidden bg-black p-0' : 'mx-auto max-w-[1440px] px-4 py-7 sm:px-8 sm:py-10'}`}>
        {!streamMode && <div className="mb-6 flex flex-col justify-between gap-4 sm:mb-8 sm:flex-row sm:items-end">
          <div>
            <p className="mb-2 text-sm text-[#aaa39d]">สตูดิโอท่ามือ</p>
            <h1 className="text-2xl font-medium tracking-tight sm:text-3xl">เส้นมือของคุณ ขยับตามจริง</h1>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-[#aaa39d]">
              เห็นครบตั้งแต่ข้อมือถึงปลายนิ้ว ลองทำท่าหัวใจ ท่า L หรือท่าที่ชอบ แล้วดูเอฟเฟกต์ตามมือ
            </p>
          </div>
          <div className="flex items-center gap-2 text-xs text-[#aaa39d]">
            <Activity className="h-4 w-4" />
            <span className="tabular-nums text-[#f2ede9]">{fps.toFixed(0)}</span> FPS
          </div>
        </div>}

        <div className={`${streamMode ? 'h-full' : 'grid gap-5 lg:grid-cols-[minmax(0,1.55fr)_minmax(300px,0.7fr)] lg:gap-6'}`}>
          <section className={`${streamMode ? 'h-full min-w-0 bg-black' : 'min-w-0 rounded-2xl border border-white/[0.08] bg-[#191816] p-3 sm:p-4'}`} aria-label="ภาพติดตามมือ">
            {!streamMode && <div className="mb-3 flex items-center justify-between px-1">
              <div>
                <h2 className="text-sm font-medium">มุมมองสด</h2>
                <p className="mt-1 text-xs text-[#85807b]">ยกมือให้กล้องเห็นทั้งฝ่ามือและปลายนิ้ว</p>
              </div>
              <span className="rounded-md border border-white/10 bg-[#201d1b] px-2.5 py-1.5 text-xs tabular-nums text-[#c7c0ba]">
                {handCount} / 2 มือ
              </span>
            </div>}

            <HandTracker
              settings={settings}
              onFps={setFps}
              onResults={handleResults}
              imageSources={imageSources}
              imageLayout={imageLayout}
              streamMode={streamMode}
              onToggleStreamMode={() => setStreamMode(false)}
              airDrawMode={airDrawMode}
              drawingColor={drawingColor}
              drawingWidth={drawingWidth}
              clearDrawingToken={clearDrawingToken}
              onImageLayoutChange={(next) => setImageLayout({
                ...next,
                x: Math.min(next.x, 100 - next.size),
                y: Math.min(next.y, 100 - next.size),
              })}
            />

            {!streamMode && <div className="mt-3 flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => {
                  const enabled = !settings.enabled;
                  update('enabled', enabled);
                  if (!enabled) {
                    setHandCount(0);
                    setGestures([]);
                    setFps(0);
                  }
                }}
                className={`inline-flex h-11 items-center gap-2 rounded-[10px] px-5 text-sm font-medium transition-colors active:scale-[0.98] ${
                  settings.enabled
                    ? 'bg-[#e8e0da] text-[#211d1a] hover:bg-white'
                    : 'bg-[#ff7899] text-[#2a111a] hover:bg-[#ff94ac]'
                }`}
              >
                {settings.enabled ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
                {settings.enabled ? 'หยุดจับมือ' : 'เริ่มจับมือ'}
              </button>
              <SmallButton onClick={() => update('mirror', !settings.mirror)} icon={<RefreshCw className="h-4 w-4" />}>
                กระจก {settings.mirror ? 'เปิด' : 'ปิด'}
              </SmallButton>
              <SmallButton onClick={() => update('showVideo', !settings.showVideo)} icon={<Camera className="h-4 w-4" />}>
                ภาพ {settings.showVideo ? 'เปิด' : 'ปิด'}
              </SmallButton>
              <SmallButton onClick={() => { setStreamMode(true); if (!settings.enabled) update('enabled', true); }} icon={<MonitorPlay className="h-4 w-4" />}>
                โหมดสตรีม
              </SmallButton>
              <SmallButton onClick={() => setAirDrawMode((current) => !current)} icon={<Fingerprint className="h-4 w-4" />}>
                วาดกลางอากาศ {airDrawMode ? 'เปิด' : 'ปิด'}
              </SmallButton>
              {airDrawMode && <SmallButton onClick={() => setClearDrawingToken((current) => current + 1)} icon={<Trash2 className="h-4 w-4" />}>ล้างเส้น</SmallButton>}
            </div>}

            {!streamMode && <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3">
              <Metric label="มือที่พบ" value={`${handCount}`} detail="จากกล้องสด" />
              <Metric label="ท่าที่กำลังทำ" value={activeGesture ? GESTURE_LABELS[activeGesture] : '—'} detail={activeHands[0]?.side ?? 'ยังไม่พบท่ามือ'} />
              <Metric label="โครงมือ" value="21 จุด / มือ" detail="ข้อมือ ข้อนิ้ว และปลายนิ้ว" />
            </div>}
          </section>

          {!streamMode && <aside className="flex flex-col gap-5">
            <section className="rounded-2xl border border-white/[0.08] bg-[#191816] p-5">
              <div className="flex items-start gap-3">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#2a1d20] text-[#ffb4ce]">
                  <Trophy className="h-5 w-5" />
                </div>
                <div>
                  <h2 className="text-sm font-medium">ชาเลนจ์ท่ามือ</h2>
                  <p className="mt-1 text-xs leading-5 text-[#85807b]">ทำท่าที่สุ่มให้ครบ 3 ท่า กล้องต้องจับแต่ละท่าให้ได้ก่อนถึงจะไปต่อ</p>
                </div>
              </div>
              {challengeSequence.length > 0 && (
                <div className="mt-4 grid grid-cols-3 gap-2">
                  {challengeSequence.map((gesture, index) => {
                    const done = index < challengeStep;
                    const current = challengeActive && index === challengeStep;
                    return (
                      <div key={`${gesture}-${index}`} className={`rounded-xl border px-2 py-3 text-center ${done ? 'border-[#70d6b5]/40 bg-[#19231f]' : current ? 'border-[#ff78a8]/50 bg-[#2a1d20]' : 'border-white/[0.07] bg-[#201d1b]'}`}>
                        <span className={`mx-auto flex h-6 w-6 items-center justify-center rounded-full text-[11px] font-semibold ${done ? 'bg-[#70d6b5] text-[#15211c]' : current ? 'bg-[#ff78a8] text-[#2a111a]' : 'bg-[#302c29] text-[#aaa39d]'}`}>
                          {done ? '✓' : index + 1}
                        </span>
                        <p className="mt-2 text-[11px] leading-4 text-[#e3ddd7]">{GESTURE_LABELS[gesture]}</p>
                      </div>
                    );
                  })}
                </div>
              )}
              <div className="mt-4 flex items-center justify-between gap-3">
                <p aria-live="polite" className={`text-xs ${challengeComplete ? 'text-[#70d6b5]' : 'text-[#aaa39d]'}`}>
                  {challengeComplete ? 'ครบแล้ว เก่งมาก! 🎉' : challengeActive ? `ทำท่า${GESTURE_LABELS[challengeSequence[challengeStep]]}ค้างไว้แป๊บหนึ่ง` : 'พร้อมเริ่มเมื่อไหร่ก็ได้'}
                </p>
                <button type="button" onClick={startChallenge} className="inline-flex h-10 shrink-0 items-center gap-2 rounded-lg bg-[#ff7899] px-3 text-xs font-medium text-[#2a111a] transition hover:bg-[#ff94ac]">
                  <RotateCcw className="h-3.5 w-3.5" />
                  {challengeActive ? 'สุ่มใหม่' : challengeComplete ? 'เล่นอีกครั้ง' : 'เริ่มชาเลนจ์'}
                </button>
              </div>
            </section>

            <section className="rounded-2xl border border-white/[0.08] bg-[#191816] p-5">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h2 className="text-sm font-medium">ลองทำท่ามือ</h2>
                  <p className="mt-1 text-xs leading-5 text-[#85807b]">เลือกท่าที่อยากลอง แล้วดูว่ากล้องจับได้ไหม</p>
                </div>
                <Sparkles className="h-[18px] w-[18px] text-[#c7c0ba]" strokeWidth={1.6} />
              </div>
              <div className={`mt-4 rounded-xl border px-3 py-3 text-xs leading-5 ${selectedGestureFound ? 'border-[#70d6b5]/35 bg-[#19231f] text-[#b3e9d8]' : 'border-white/[0.07] bg-[#201d1b] text-[#aaa39d]'}`}>
                {selectedGesture
                  ? selectedGestureFound
                    ? `เจอแล้ว: ${GESTURE_LABELS[selectedGesture]} ✓`
                    : `กำลังรอท่า${GESTURE_LABELS[selectedGesture]} · เห็นฝ่ามือเต็ม ๆ และแยกนิ้วให้ชัด`
                  : 'แตะชื่อท่าด้านล่างเพื่อเริ่มโหมดทดสอบ'}
              </div>
              <div className="mt-4 space-y-2">
                {PRACTICE_GESTURES.map(({ gesture, description, icon: Icon }) => {
                  const active = activeHands.some((item) => item.gesture === gesture);
                  const selected = selectedGesture === gesture;
                  return (
                    <button
                      type="button"
                      key={gesture}
                      aria-pressed={selected}
                      onClick={() => setSelectedGesture(selected ? null : gesture)}
                      className={`flex w-full items-center gap-3 rounded-xl border px-3 py-3 text-left transition-colors ${
                        active ? 'border-[#ff7899]/50 bg-[#2a1d20]' : selected ? 'border-[#ffb4ce]/50 bg-[#272023]' : 'border-white/[0.07] bg-[#201d1b]'
                      }`}
                    >
                      <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${active ? 'bg-[#ff7899] text-[#29151b]' : 'bg-[#292522] text-[#aaa39d]'}`}>
                        <Icon className="h-[18px] w-[18px]" strokeWidth={1.7} />
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className={`text-sm font-medium ${active ? 'text-[#fff0f2]' : 'text-[#e3ddd7]'}`}>
                          {GESTURE_LABELS[gesture]}
                        </p>
                        <p className="mt-0.5 text-xs leading-4 text-[#85807b]">{description}</p>
                      </div>
                      {active && <span className="h-2 w-2 rounded-full bg-[#ff7899]" />}
                    </button>
                  );
                })}
              </div>
            </section>

            <section className="rounded-2xl border border-white/[0.08] bg-[#191816] p-5">
              <details>
                <summary className="flex cursor-pointer list-none items-center gap-2 text-sm font-medium">
                  <ImagePlus className="h-[18px] w-[18px] text-[#ffb4ce]" />
                  เลือกรูปตามท่ามือ
                </summary>
                <p className="mt-2 text-xs leading-5 text-[#85807b]">
                  เลือกรูปให้แต่ละท่าได้เลย รูปจะจำอยู่ในเบราว์เซอร์นี้ รองรับไฟล์ภาพไม่เกิน 8 MB
                </p>
                <div className="mt-4 grid gap-2 sm:grid-cols-2">
                  {PRACTICE_GESTURES.map(({ gesture }) => {
                    const source = imageSources[gesture] ?? DEFAULT_GESTURE_IMAGES[gesture];
                    const hasCustomImage = Boolean(imageSources[gesture]);
                    return (
                      <div key={gesture} className="flex min-w-0 items-center gap-2 rounded-xl border border-white/[0.07] bg-[#201d1b] p-2">
                        {source ? (
                          <img src={source} alt="" className="h-11 w-11 shrink-0 rounded-lg bg-black/30 object-contain" />
                        ) : (
                          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-[#292522] text-[#77716c]">
                            <ImagePlus className="h-4 w-4" />
                          </div>
                        )}
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-xs font-medium text-[#e3ddd7]">{GESTURE_LABELS[gesture]}</p>
                          <div className="mt-1 flex items-center gap-2">
                            <label className="inline-flex cursor-pointer items-center gap-1 text-[11px] text-[#ffb4ce] hover:text-white">
                              <input
                                type="file"
                                accept="image/*"
                                className="sr-only"
                                onChange={(event) => {
                                  void handleImageUpload(gesture, event.target.files?.[0]);
                                  event.target.value = '';
                                }}
                              />
                              <ImagePlus className="h-3.5 w-3.5" />
                              {hasCustomImage || source ? 'เปลี่ยนรูป' : 'เลือกรูป'}
                            </label>
                            {hasCustomImage && (
                              <button type="button" onClick={() => void handleImageDelete(gesture)} className="inline-flex items-center gap-1 text-[11px] text-[#aaa39d] hover:text-red-300">
                                <Trash2 className="h-3 w-3" /> ลบ
                              </button>
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
                <p aria-live="polite" className="mt-3 min-h-4 text-xs text-[#aaa39d]">{uploadMessage}</p>
              </details>
            </section>

            <section className="rounded-2xl border border-white/[0.08] bg-[#191816] p-5">
              <div className="flex items-center gap-2">
                <Settings2 className="h-[18px] w-[18px] text-[#aaa39d]" strokeWidth={1.7} />
                <h2 className="text-sm font-medium">การแสดงผล</h2>
              </div>
              <div className="mt-4 space-y-4">
                <Toggle label="เส้นข้อต่อมือ" checked={settings.showSkeleton} onChange={(value) => update('showSkeleton', value)} />
                <Toggle label="จุดข้อต่อและปลายนิ้ว" checked={settings.showPoints} onChange={(value) => update('showPoints', value)} />
                <Toggle label="เอฟเฟกต์ท่ามือ" checked={settings.showEffects} onChange={(value) => update('showEffects', value)} />
                <Toggle label="วาดกลางอากาศด้วยนิ้วชี้" checked={airDrawMode} onChange={setAirDrawMode} />
                {airDrawMode && (
                  <div className="space-y-3 rounded-xl border border-white/[0.07] bg-[#201d1b] p-3">
                    <p className="text-xs leading-5 text-[#aaa39d]">ยกนิ้วชี้เดี่ยวแล้วลากมือเพื่อวาด · กำมือเพื่อหยุดลากเส้น</p>
                    <label className="flex items-center justify-between text-xs text-[#aaa39d]">
                      สีเส้นวาด
                      <input type="color" value={drawingColor} onChange={(event) => setDrawingColor(event.target.value)} className="h-8 w-10 cursor-pointer rounded border border-white/15 bg-transparent p-0.5" />
                    </label>
                    <Range label="ความหนาเส้นวาด" value={drawingWidth} min={2} max={14} onChange={setDrawingWidth} />
                    <button type="button" onClick={() => setClearDrawingToken((current) => current + 1)} className="text-xs text-[#ffb4ce] hover:text-white">ล้างภาพวาด</button>
                  </div>
                )}
                <Range label="ความแรงเอฟเฟกต์" value={settings.effectIntensity} min={0.5} max={2} step={0.1} onChange={(value) => update('effectIntensity', value)} />
                <Range label="เวลาประกายค้าง (วินาที)" value={settings.effectDuration} min={0.5} max={2.5} step={0.1} onChange={(value) => update('effectDuration', value)} />
                <Range
                  label="ขนาดรูปที่แสดง"
                  value={imageLayout.size}
                  min={20}
                  max={55}
                  onChange={(size) => setImageLayout((current) => ({
                    ...current,
                    size,
                    x: Math.min(current.x, 100 - size),
                    y: Math.min(current.y, 100 - size),
                  }))}
                />
                <Range label="ขนาดจุด" value={settings.pointSize} min={3} max={9} onChange={(value) => update('pointSize', value)} />
                <Range label="ความหนาเส้น" value={settings.lineWidth} min={1} max={6} onChange={(value) => update('lineWidth', value)} />
                <button type="button" onClick={() => setImageLayout(DEFAULT_IMAGE_LAYOUT)} className="text-xs text-[#ffb4ce] hover:text-white">
                  คืนตำแหน่งและขนาดรูปเริ่มต้น
                </button>
              </div>
              <p className="mt-4 border-t border-white/[0.08] pt-4 text-xs leading-5 text-[#85807b]">
                ลากรูปบนหน้ากล้องเพื่อย้ายตำแหน่ง · กำมือแล้วแบมือเพื่อปล่อยประกายทั่วจอ
              </p>
            </section>

            <section className="rounded-2xl border border-white/[0.08] bg-[#191816] p-4 sm:p-5">
              <details className="group">
                <summary className="flex cursor-pointer list-none items-center gap-3">
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-[#22201e] text-[#ffb4ce]">
                    <Info className="h-[18px] w-[18px]" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-medium">วิธีใช้และสถานะระบบ</span>
                    <span className="mt-1 block text-xs text-[#85807b]">
                      {settings.enabled
                        ? handCount > 0 ? `กล้องทำงาน · พบ ${handCount} มือ` : 'กล้องเปิดอยู่ · กำลังรอมือในภาพ'
                        : 'กล้องพักอยู่ · กด “เริ่มจับมือ” เพื่อเริ่ม'}
                    </span>
                  </span>
                  <span className="text-xs text-[#aaa39d] group-open:hidden">ดู</span>
                  <span className="hidden text-xs text-[#aaa39d] group-open:inline">ซ่อน</span>
                </summary>
                <div className="mt-4 space-y-3 border-t border-white/[0.08] pt-4">
                  <StatusLine label="กล้องและการจับมือ" value={settings.enabled ? handCount > 0 ? `ทำงาน · ${handCount} มือ` : 'เปิดแล้ว · ยังไม่พบมือ' : 'พักอยู่'} active={settings.enabled && handCount > 0} />
                  <StatusLine label="เส้นโครงมือ" value={settings.showSkeleton ? 'เปิด · ข้อมือถึงปลายนิ้ว 21 จุดต่อมือ' : 'ปิดในการตั้งค่าการแสดงผล'} active={settings.showSkeleton} />
                  <StatusLine label="จำแนกท่ามือและรูปประกอบ" value={`${Object.keys(imageSources).length} รูปกำหนดเอง · รูปจะจำในเบราว์เซอร์นี้`} active />
                  <StatusLine label="วาดกลางอากาศ" value={airDrawMode ? 'เปิด · ยกนิ้วชี้แล้วลาก' : 'ปิด'} active={airDrawMode} />
                  <StatusLine label="โหมดสตรีม" value={streamMode ? 'เปิด · ซ่อนแผงควบคุม' : 'พร้อมเปิดจากปุ่มโหมดสตรีม'} active={streamMode} />
                  <StatusLine label="ถ่ายภาพหน้าจอ" value="พร้อมใช้ · กดไอคอนกล้องบนภาพสดเพื่อบันทึก PNG" active />
                  <StatusLine label="ชาเลนจ์ท่ามือ" value={challengeActive ? `กำลังเล่น · ${challengeStep}/${challengeSequence.length} ท่า` : challengeComplete ? 'ทำครบแล้ว' : 'พร้อมเริ่ม'} active={challengeActive || challengeComplete} />
                  <div className="rounded-xl border border-white/[0.07] bg-[#201d1b] px-3 py-2.5 text-xs leading-5 text-[#aaa39d]">
                    ระบบประมวลผลภาพในเบราว์เซอร์ ต้องอนุญาตใช้กล้องก่อน · ซูม 0.5× ใช้ได้เฉพาะกล้องที่เบราว์เซอร์รายงานว่ารองรับ · มือถือจะเป็นกล้องเว็บแคมของคอมได้เมื่อเชื่อมต่อเป็นเว็บแคมก่อน
                  </div>
                </div>
              </details>
            </section>

            <p className="px-1 text-xs leading-5 text-[#77716c]">
              ประมวลผลภาพในเบราว์เซอร์ · กล้องมือถือใช้กับคอมได้เมื่อเชื่อมเป็นเว็บแคมก่อน
            </p>
          </aside>}
        </div>
      </main>
    </div>
  );
}

function StatusLine({ label, value, active }: { label: string; value: string; active: boolean }) {
  return (
    <div className="flex items-start justify-between gap-3 text-xs">
      <span className="shrink-0 text-[#c7c0ba]">{label}</span>
      <span className="flex items-start gap-2 text-right text-[#85807b]">
        <span className={`mt-1 h-1.5 w-1.5 shrink-0 rounded-full ${active ? 'bg-[#70d6b5]' : 'bg-[#706a65]'}`} />
        {value}
      </span>
    </div>
  );
}

function SmallButton({ children, icon, onClick }: { children: ReactNode; icon: ReactNode; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="inline-flex h-11 items-center gap-2 rounded-[10px] border border-white/10 bg-[#201d1b] px-4 text-sm text-[#d9d2cc] transition-colors hover:bg-[#292522] active:scale-[0.98]"
    >
      {icon}{children}
    </button>
  );
}

function Metric({ label, value, detail }: { label: string; value: string; detail: string }) {
  return (
    <div className="min-w-0 rounded-xl border border-white/[0.07] bg-[#201d1b] px-3 py-3">
      <p className="text-xs text-[#85807b]">{label}</p>
      <p className="mt-1 truncate text-base font-medium tabular-nums text-[#f2ede9]">{value}</p>
      <p className="mt-1 truncate text-[11px] text-[#77716c]">{detail}</p>
    </div>
  );
}

function Toggle({ label, checked, onChange }: { label: string; checked: boolean; onChange: (value: boolean) => void }) {
  return (
    <label className="flex cursor-pointer items-center justify-between gap-4 text-sm text-[#c7c0ba]">
      {label}
      <input
        type="checkbox"
        checked={checked}
        onChange={(event) => onChange(event.target.checked)}
        className="h-4 w-4 accent-[#ff7899]"
      />
    </label>
  );
}

function Range({ label, value, min, max, step = 1, onChange }: { label: string; value: number; min: number; max: number; step?: number; onChange: (value: number) => void }) {
  return (
    <label className="block space-y-2 text-sm text-[#c7c0ba]">
      <span className="flex items-center justify-between">
        {label}
        <span className="font-mono text-xs tabular-nums text-[#aaa39d]">{step < 1 ? value.toFixed(1) : value}</span>
      </span>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(event) => onChange(Number(event.target.value))}
        className="h-1.5 w-full cursor-pointer accent-[#ff7899]"
      />
    </label>
  );
}
