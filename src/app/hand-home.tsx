'use client';

import { useCallback, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import {
  Activity,
  Camera,
  Eye,
  Hand,
  Heart,
  MousePointer2,
  Pause,
  Play,
  RefreshCw,
  Settings2,
  Sparkles,
  Zap,
} from 'lucide-react';
import {
  DEFAULT_HAND_SETTINGS,
  GESTURE_LABELS,
  HandTracker,
  type HandResult,
  type HandTrackerSettings,
} from '@/components/skeleton/hand-tracker';

const PRACTICE_GESTURES: { gesture: HandResult['gesture']; description: string; icon: typeof Heart }[] = [
  { gesture: 'finger-heart', description: 'แตะปลายนิ้วโป้งกับนิ้วชี้', icon: Heart },
  { gesture: 'l-sign', description: 'กางนิ้วโป้งกับนิ้วชี้เป็นมุมฉาก', icon: MousePointer2 },
  { gesture: 'peace', description: 'ชูนิ้วชี้และนิ้วกลาง', icon: Hand },
  { gesture: 'thumbs-up', description: 'ยกนิ้วโป้ง นิ้วอื่นกำไว้', icon: Zap },
  { gesture: 'open-hand', description: 'แบมือให้เห็นปลายนิ้วครบ', icon: Eye },
  { gesture: 'fist', description: 'กำมือเบา ๆ', icon: Activity },
];

export default function HandHome() {
  const [settings, setSettings] = useState<HandTrackerSettings>(DEFAULT_HAND_SETTINGS);
  const [handCount, setHandCount] = useState(0);
  const [gestures, setGestures] = useState<HandResult[]>([]);
  const [fps, setFps] = useState(0);
  const lastUpdateRef = useRef(0);

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

  const activeHands = gestures.filter((item) => item.gesture !== 'none');
  const activeGesture = activeHands[0]?.gesture;

  return (
    <div className="min-h-screen bg-[#12110f] text-[#f2ede9]">
      <header className="border-b border-white/[0.08] bg-[#12110f]">
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

      <main className="mx-auto max-w-[1440px] px-4 py-7 sm:px-8 sm:py-10">
        <div className="mb-6 flex flex-col justify-between gap-4 sm:mb-8 sm:flex-row sm:items-end">
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
        </div>

        <div className="grid gap-5 lg:grid-cols-[minmax(0,1.55fr)_minmax(300px,0.7fr)] lg:gap-6">
          <section className="min-w-0 rounded-2xl border border-white/[0.08] bg-[#191816] p-3 sm:p-4" aria-label="ภาพติดตามมือ">
            <div className="mb-3 flex items-center justify-between px-1">
              <div>
                <h2 className="text-sm font-medium">มุมมองสด</h2>
                <p className="mt-1 text-xs text-[#85807b]">ยกมือให้กล้องเห็นทั้งฝ่ามือและปลายนิ้ว</p>
              </div>
              <span className="rounded-md border border-white/10 bg-[#201d1b] px-2.5 py-1.5 text-xs tabular-nums text-[#c7c0ba]">
                {handCount} / 2 มือ
              </span>
            </div>

            <HandTracker settings={settings} onFps={setFps} onResults={handleResults} />

            <div className="mt-3 flex flex-wrap items-center gap-2">
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
            </div>

            <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3">
              <Metric label="มือที่พบ" value={`${handCount}`} detail="จากกล้องสด" />
              <Metric label="ท่าที่กำลังทำ" value={activeGesture ? GESTURE_LABELS[activeGesture] : '—'} detail={activeHands[0]?.side ?? 'ยังไม่พบท่ามือ'} />
              <Metric label="โครงมือ" value="21 จุด / มือ" detail="ข้อมือ ข้อนิ้ว และปลายนิ้ว" />
            </div>
          </section>

          <aside className="flex flex-col gap-5">
            <section className="rounded-2xl border border-white/[0.08] bg-[#191816] p-5">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h2 className="text-sm font-medium">ลองทำท่ามือ</h2>
                  <p className="mt-1 text-xs leading-5 text-[#85807b]">ระบบจะบอกท่าที่เห็นเหนือมือ</p>
                </div>
                <Sparkles className="h-[18px] w-[18px] text-[#c7c0ba]" strokeWidth={1.6} />
              </div>
              <div className="mt-4 space-y-2">
                {PRACTICE_GESTURES.map(({ gesture, description, icon: Icon }) => {
                  const active = activeHands.some((item) => item.gesture === gesture);
                  return (
                    <div
                      key={gesture}
                      className={`flex items-center gap-3 rounded-xl border px-3 py-3 transition-colors ${
                        active ? 'border-[#ff7899]/50 bg-[#2a1d20]' : 'border-white/[0.07] bg-[#201d1b]'
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
                    </div>
                  );
                })}
              </div>
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
                <Range label="ขนาดจุด" value={settings.pointSize} min={3} max={9} onChange={(value) => update('pointSize', value)} />
                <Range label="ความหนาเส้น" value={settings.lineWidth} min={1} max={6} onChange={(value) => update('lineWidth', value)} />
              </div>
              <div className="mt-5 border-t border-white/[0.08] pt-4 text-xs leading-5 text-[#85807b]">
                นิ้วหัวใจปล่อยรูปหัวใจเล็ก ๆ ส่วนท่า L และท่าอื่นจะมีประกายตามมือ
              </div>
            </section>

            <p className="px-1 text-xs leading-5 text-[#77716c]">
              ประมวลผลภาพในเบราว์เซอร์ · กล้องมือถือใช้กับคอมได้เมื่อเชื่อมเป็นเว็บแคมก่อน
            </p>
          </aside>
        </div>
      </main>
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

function Range({ label, value, min, max, onChange }: { label: string; value: number; min: number; max: number; onChange: (value: number) => void }) {
  return (
    <label className="block space-y-2 text-sm text-[#c7c0ba]">
      <span className="flex items-center justify-between">
        {label}
        <span className="font-mono text-xs tabular-nums text-[#aaa39d]">{value}</span>
      </span>
      <input
        type="range"
        min={min}
        max={max}
        step={1}
        value={value}
        onChange={(event) => onChange(Number(event.target.value))}
        className="h-1.5 w-full cursor-pointer accent-[#ff7899]"
      />
    </label>
  );
}
