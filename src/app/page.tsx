'use client';

import { useCallback, useRef, useState } from 'react';
import {
  BodySkeletonTracker,
  DEFAULT_SETTINGS,
  type TrackerSettings,
  type TrackingMode,
} from '@/components/skeleton/body-skeleton-tracker';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';
import { Slider } from '@/components/ui/slider';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import {
  Activity,
  Camera,
  Hand,
  Layers,
  Pause,
  Play,
  PersonStanding,
  RefreshCw,
  Settings2,
  Sparkles,
  Zap,
} from 'lucide-react';
import type { NormalizedLandmark } from '@mediapipe/tasks-vision';

interface LandmarkSummary {
  poseCount: number;
  handCount: number;
  handedness: string[];
  keyPoints: { name: string; x: number; y: number; visibility: number }[];
}

export default function Home() {
  const [settings, setSettings] = useState<TrackerSettings>(DEFAULT_SETTINGS);
  const [fps, setFps] = useState<number>(0);
  const [summary, setSummary] = useState<LandmarkSummary>({
    poseCount: 0,
    handCount: 0,
    handedness: [],
    keyPoints: [],
  });

  const handleFps = useCallback((value: number) => setFps(value), []);

  const lastSummaryRef = useRef(0);

  const handleLandmarks = useCallback(
    (data: { pose: NormalizedLandmark[][]; hands: NormalizedLandmark[][]; handedness: string[] }) => {
      // Throttle summary updates to ~5/s to avoid React thrash
      const now = performance.now();
      if (now - lastSummaryRef.current < 200) return;
      lastSummaryRef.current = now;

      const pose = data.pose[0] ?? [];
      // Pick a few notable landmarks to show
      const keyIndices = [0, 11, 12, 15, 16, 23, 24, 27, 28];
      const names: Record<number, string> = {
        0: 'จมูก',
        11: 'ไหล่ซ้าย',
        12: 'ไหล่ขวา',
        15: 'ข้อมือซ้าย',
        16: 'ข้อมือขวา',
        23: 'สะโพกซ้าย',
        24: 'สะโพกขวา',
        27: 'ข้อเท้าซ้าย',
        28: 'ข้อเท้าขวา',
      };
      const keyPoints = keyIndices
        .map((i) => {
          const lm = pose[i];
          if (!lm) return null;
          return {
            name: names[i] ?? `#${i}`,
            x: Math.round(lm.x * 1000) / 1000,
            y: Math.round(lm.y * 1000) / 1000,
            visibility: Math.round((lm.visibility ?? 0) * 100) / 100,
          };
        })
        .filter((p): p is NonNullable<typeof p> => p !== null);

      setSummary({
        poseCount: data.pose.length,
        handCount: data.hands.length,
        handedness: data.handedness,
        keyPoints,
      });
    },
    [],
  );

  const update = useCallback(<K extends keyof TrackerSettings>(key: K, value: TrackerSettings[K]) => {
    setSettings((prev) => ({ ...prev, [key]: value }));
  }, []);

  return (
    <div className="min-h-screen bg-gradient-to-br from-zinc-950 via-zinc-900 to-black text-zinc-100">
      {/* Header */}
      <header className="border-b border-white/5 bg-black/40 backdrop-blur-sm sticky top-0 z-30">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-4 py-3 sm:px-6">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-gradient-to-br from-cyan-400 to-emerald-400 text-black shadow-lg shadow-cyan-500/30">
              <PersonStanding className="h-5 w-5" />
            </div>
            <div>
              <h1 className="text-sm font-bold tracking-tight sm:text-base">
                Skeleton Vision
              </h1>
              <p className="text-[11px] text-zinc-400 sm:text-xs">
                จับการเคลื่อนไหวร่างกายและมือด้วย MediaPipe
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Badge
              variant="outline"
              className={`gap-1 border-white/10 ${
                settings.enabled ? 'bg-emerald-500/10 text-emerald-400' : 'bg-zinc-800/50 text-zinc-400'
              }`}
            >
              <Activity className="h-3 w-3" />
              {settings.enabled ? 'LIVE' : 'IDLE'}
            </Badge>
            {settings.enabled && (
              <Badge variant="outline" className="gap-1 border-white/10 bg-zinc-800/50 text-zinc-300">
                <Zap className="h-3 w-3" />
                {fps.toFixed(1)} FPS
              </Badge>
            )}
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-7xl px-4 py-6 sm:px-6">
        <div className="grid gap-6 lg:grid-cols-[1fr_360px]">
          {/* Main canvas + actions */}
          <div className="flex flex-col gap-4">
            <Card className="border-white/10 bg-zinc-900/60 backdrop-blur">
              <CardContent className="p-3 sm:p-4">
                <BodySkeletonTracker
                  settings={settings}
                  onFps={handleFps}
                  onLandmarks={handleLandmarks}
                />
              </CardContent>
            </Card>

            {/* Action bar */}
            <div className="flex flex-wrap items-center gap-2">
              <Button
                onClick={() => update('enabled', !settings.enabled)}
                size="lg"
                className={`gap-2 ${
                  settings.enabled
                    ? 'bg-red-500 text-white hover:bg-red-600'
                    : 'bg-emerald-500 text-black hover:bg-emerald-600'
                }`}
              >
                {settings.enabled ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
                {settings.enabled ? 'หยุด' : 'เริ่มจับ'}
              </Button>

              <Button
                variant="outline"
                className="gap-2 border-white/10 bg-zinc-900/60 text-zinc-200 hover:bg-zinc-800"
                onClick={() => update('mirror', !settings.mirror)}
              >
                <RefreshCw className="h-4 w-4" />
                กระจก{settings.mirror ? ' ON' : ' OFF'}
              </Button>

              <Button
                variant="outline"
                className="gap-2 border-white/10 bg-zinc-900/60 text-zinc-200 hover:bg-zinc-800"
                onClick={() => update('showVideo', !settings.showVideo)}
              >
                <Camera className="h-4 w-4" />
                ภาพ{settings.showVideo ? ' ON' : ' OFF'}
              </Button>

              <Button
                variant="outline"
                className="gap-2 border-white/10 bg-zinc-900/60 text-zinc-200 hover:bg-zinc-800"
                onClick={() => update('mode', cycleMode(settings.mode))}
              >
                <Layers className="h-4 w-4" />
                {modeLabel(settings.mode)}
              </Button>
            </div>

            {/* Stats row */}
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <StatCard
                icon={<PersonStanding className="h-4 w-4" />}
                label="โครงร่างกาย"
                value={summary.poseCount > 0 ? 'พบ' : 'ไม่พบ'}
                color="text-cyan-400"
              />
              <StatCard
                icon={<Hand className="h-4 w-4" />}
                label="มือที่พบ"
                value={String(summary.handCount)}
                color="text-pink-400"
              />
              <StatCard
                icon={<Activity className="h-4 w-4" />}
                label="FPS"
                value={fps.toFixed(1)}
                color="text-emerald-400"
              />
              <StatCard
                icon={<Sparkles className="h-4 w-4" />}
                label="ด้านมือ"
                value={summary.handedness.length > 0 ? summary.handedness.join(', ') : '—'}
                color="text-amber-400"
              />
            </div>
          </div>

          {/* Side panel */}
          <aside className="flex flex-col gap-4">
            <Tabs defaultValue="controls" className="w-full">
              <TabsList className="grid w-full grid-cols-2 bg-zinc-900/60">
                <TabsTrigger value="controls" className="gap-1">
                  <Settings2 className="h-3.5 w-3.5" />
                  ตั้งค่า
                </TabsTrigger>
                <TabsTrigger value="data" className="gap-1">
                  <Activity className="h-3.5 w-3.5" />
                  ข้อมูล
                </TabsTrigger>
              </TabsList>

              <TabsContent value="controls" className="mt-3">
                <Card className="border-white/10 bg-zinc-900/60">
                  <CardHeader className="pb-3">
                    <CardTitle className="text-sm">การแสดงผล</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <ToggleRow
                      label="แสดงโครงกระดูก"
                      checked={settings.showSkeleton}
                      onChange={(v) => update('showSkeleton', v)}
                    />
                    <ToggleRow
                      label="แสดงจุดสำคัญ"
                      checked={settings.showPoints}
                      onChange={(v) => update('showPoints', v)}
                    />
                    <ToggleRow
                      label="หมายเลขจุด"
                      checked={settings.showLabels}
                      onChange={(v) => update('showLabels', v)}
                    />
                    <ToggleRow
                      label="กระจกเงา (Mirror)"
                      checked={settings.mirror}
                      onChange={(v) => update('mirror', v)}
                    />
                    <ToggleRow
                      label="แสดงภาพจากกล้อง"
                      checked={settings.showVideo}
                      onChange={(v) => update('showVideo', v)}
                    />

                    <Separator className="bg-white/10" />

                    <div className="space-y-2">
                      <Label className="text-xs text-zinc-400">โหมดติดตาม</Label>
                      <div className="grid grid-cols-3 gap-2">
                        {(['pose', 'hands', 'both'] as TrackingMode[]).map((m) => (
                          <Button
                            key={m}
                            size="sm"
                            variant={settings.mode === m ? 'default' : 'outline'}
                            className={`h-9 ${
                              settings.mode === m
                                ? 'bg-cyan-500 text-black hover:bg-cyan-600'
                                : 'border-white/10 bg-zinc-900/60 text-zinc-300 hover:bg-zinc-800'
                            }`}
                            onClick={() => update('mode', m)}
                          >
                            {modeShort(m)}
                          </Button>
                        ))}
                      </div>
                    </div>

                    <Separator className="bg-white/10" />

                    <SliderRow
                      label="ขนาดจุด"
                      value={settings.pointSize}
                      min={2}
                      max={12}
                      step={1}
                      onChange={(v) => update('pointSize', v)}
                      unit="px"
                    />
                    <SliderRow
                      label="ความหนาเส้น"
                      value={settings.lineWidth}
                      min={1}
                      max={8}
                      step={1}
                      onChange={(v) => update('lineWidth', v)}
                      unit="px"
                    />
                    <SliderRow
                      label="ความมั่นใจตรวจจับ"
                      value={settings.minDetectionConfidence}
                      min={0.1}
                      max={0.9}
                      step={0.05}
                      onChange={(v) => update('minDetectionConfidence', v)}
                      unit=""
                    />
                    <SliderRow
                      label="ความมั่นใจติดตาม"
                      value={settings.minTrackingConfidence}
                      min={0.1}
                      max={0.9}
                      step={0.05}
                      onChange={(v) => update('minTrackingConfidence', v)}
                      unit=""
                    />
                  </CardContent>
                </Card>
              </TabsContent>

              <TabsContent value="data" className="mt-3">
                <Card className="border-white/10 bg-zinc-900/60">
                  <CardHeader className="pb-3">
                    <CardTitle className="text-sm">พิกัดสำคัญ</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <p className="text-xs text-zinc-400">
                      พิกัดแบบ Normalized (0–1) จากซ้ายบนของภาพ อัปเดต ~5 ครั้ง/วินาที
                    </p>
                    {summary.keyPoints.length === 0 ? (
                      <div className="rounded-md border border-dashed border-white/10 bg-zinc-950/40 px-3 py-6 text-center text-xs text-zinc-500">
                        ยังไม่พบโครงร่าง — กด “เริ่มจับ” และยืนให้กล้องเห็นตัวเต็ม
                      </div>
                    ) : (
                      <div className="max-h-80 overflow-y-auto rounded-md border border-white/5">
                        <table className="w-full text-xs">
                          <thead className="sticky top-0 bg-zinc-900 text-zinc-400">
                            <tr>
                              <th className="px-2 py-1.5 text-left font-medium">จุด</th>
                              <th className="px-2 py-1.5 text-right font-medium">X</th>
                              <th className="px-2 py-1.5 text-right font-medium">Y</th>
                              <th className="px-2 py-1.5 text-right font-medium">Vis</th>
                            </tr>
                          </thead>
                          <tbody>
                            {summary.keyPoints.map((p, i) => (
                              <tr key={i} className={i % 2 === 0 ? 'bg-white/[0.02]' : ''}>
                                <td className="px-2 py-1.5 text-cyan-400">{p.name}</td>
                                <td className="px-2 py-1.5 text-right tabular-nums text-zinc-300">{p.x.toFixed(3)}</td>
                                <td className="px-2 py-1.5 text-right tabular-nums text-zinc-300">{p.y.toFixed(3)}</td>
                                <td className="px-2 py-1.5 text-right tabular-nums text-emerald-400">
                                  {p.visibility.toFixed(2)}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}

                    <Separator className="bg-white/10" />

                    <div className="space-y-1 text-xs text-zinc-400">
                      <p>
                        <span className="text-zinc-500">โครงร่างกาย:</span>{' '}
                        <span className="text-cyan-400">{summary.poseCount}</span> ร่าง
                      </p>
                      <p>
                        <span className="text-zinc-500">มือ:</span>{' '}
                        <span className="text-pink-400">{summary.handCount}</span>{' '}
                        {summary.handedness.length > 0 && `(${summary.handedness.join(', ')})`}
                      </p>
                      <p>
                        <span className="text-zinc-500">FPS:</span>{' '}
                        <span className="text-emerald-400">{fps.toFixed(1)}</span>
                      </p>
                    </div>
                  </CardContent>
                </Card>
              </TabsContent>
            </Tabs>

            {/* Info card */}
            <Card className="border-white/10 bg-gradient-to-br from-zinc-900/80 to-zinc-950/80">
              <CardContent className="space-y-2 p-4 text-xs text-zinc-400">
                <p className="font-medium text-zinc-300">คำแนะนำการใช้งาน</p>
                <ul className="list-inside list-disc space-y-1">
                  <li>ยืนให้กล้องเห็นตัวเต็มจากศีรษะถึงเท้า</li>
                  <li>แสดงผลดีที่สุดในที่แสดงสว่างพอเหมาะ</li>
                  <li>เปิดดูข้อมูลในแท็บ “ข้อมูล” เพื่อดูพิกัดสำคัญ</li>
                  <li>ใช้ GPU ในการประมวลผล — แนะนำเบราว์เซอร์ล่าสุด</li>
                </ul>
              </CardContent>
            </Card>
          </aside>
        </div>
      </main>

      <footer className="mt-6 border-t border-white/5 bg-black/40 py-4 text-center text-xs text-zinc-500">
        สร้างด้วย Next.js + MediaPipe Tasks Vision · ทำงานบนเบราว์เซอร์ ไม่ส่งภาพออกไปข้างนอก
      </footer>
    </div>
  );
}

function StatCard({
  icon,
  label,
  value,
  color,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  color: string;
}) {
  return (
    <div className="rounded-lg border border-white/5 bg-zinc-900/60 px-3 py-2.5 backdrop-blur">
      <div className="flex items-center gap-1.5 text-[11px] text-zinc-400">
        <span className={color}>{icon}</span>
        {label}
      </div>
      <p className="mt-1 truncate text-sm font-semibold text-zinc-100">{value}</p>
    </div>
  );
}

function ToggleRow({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <div className="flex items-center justify-between gap-2">
      <Label className="text-sm text-zinc-300">{label}</Label>
      <Switch checked={checked} onCheckedChange={onChange} />
    </div>
  );
}

function SliderRow({
  label,
  value,
  min,
  max,
  step,
  onChange,
  unit,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  onChange: (v: number) => void;
  unit: string;
}) {
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <Label className="text-xs text-zinc-400">{label}</Label>
        <span className="text-xs tabular-nums text-zinc-300">
          {value.toFixed(step < 1 ? 2 : 0)}
          {unit}
        </span>
      </div>
      <Slider
        value={[value]}
        min={min}
        max={max}
        step={step}
        onValueChange={(v) => onChange(v[0])}
      />
    </div>
  );
}

function cycleMode(m: TrackingMode): TrackingMode {
  if (m === 'both') return 'pose';
  if (m === 'pose') return 'hands';
  return 'both';
}

function modeLabel(m: TrackingMode): string {
  if (m === 'both') return 'ร่าง + มือ';
  if (m === 'pose') return 'เฉพาะร่าง';
  return 'เฉพาะมือ';
}

function modeShort(m: TrackingMode): string {
  if (m === 'both') return 'ร่าง+มือ';
  if (m === 'pose') return 'ร่าง';
  return 'มือ';
}
