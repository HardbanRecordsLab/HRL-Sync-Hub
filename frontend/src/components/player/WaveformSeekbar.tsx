import { useEffect, useRef, useState } from "react";

// Client-side waveform seekbar — decodes the audio via the Web Audio API and
// draws peak bars (SoundCloud/Spotify style), no server-side pre-computed
// peaks and no extra dependency. Same component/behavior as CMLP's
// WaveformSeekbar (B2BPlayer) — each app keeps its own copy per the
// "every product owns its life, no shared package" rule (see handbook §6),
// but the implementation is intentionally identical.

const BAR_COUNT = 96;
const SKELETON_PEAKS = Array.from({ length: BAR_COUNT }, () => 0.15);

// Decoded peaks rarely change for a given URL within a session — cache across
// mounts (track re-selected, player collapsed/expanded) instead of re-fetching
// and re-decoding the whole file every time.
const peaksCache = new Map<string, number[]>();

async function decodePeaks(url: string, signal: AbortSignal): Promise<number[]> {
  const res = await fetch(url, { signal });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const arrayBuffer = await res.arrayBuffer();

  const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
  const ctx = new AudioCtx();
  try {
    const audioBuffer = await ctx.decodeAudioData(arrayBuffer);
    const channel = audioBuffer.getChannelData(0);
    const blockSize = Math.max(1, Math.floor(channel.length / BAR_COUNT));
    const peaks: number[] = [];
    for (let i = 0; i < BAR_COUNT; i++) {
      const start = i * blockSize;
      const end = Math.min(start + blockSize, channel.length);
      let peak = 0;
      for (let j = start; j < end; j++) {
        const v = Math.abs(channel[j]);
        if (v > peak) peak = v;
      }
      peaks.push(peak);
    }
    const max = Math.max(...peaks, 0.0001);
    return peaks.map((v) => v / max);
  } finally {
    ctx.close().catch(() => {});
  }
}

interface WaveformSeekbarProps {
  audioUrl: string | null;
  currentTime: number;
  duration: number;
  onSeek: (time: number) => void;
  accentClassName?: string;
  height?: number;
}

export function WaveformSeekbar({
  audioUrl,
  currentTime,
  duration,
  onSeek,
  accentClassName = "bg-violet-500",
  height = 40,
}: WaveformSeekbarProps) {
  const [peaks, setPeaks] = useState<number[] | null>(audioUrl ? peaksCache.get(audioUrl) ?? null : null);
  const [failed, setFailed] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setFailed(false);
    if (!audioUrl) {
      setPeaks(null);
      return;
    }
    const cached = peaksCache.get(audioUrl);
    if (cached) {
      setPeaks(cached);
      return;
    }
    setPeaks(null);

    const controller = new AbortController();
    decodePeaks(audioUrl, controller.signal)
      .then((result) => {
        peaksCache.set(audioUrl, result);
        setPeaks(result);
      })
      .catch((e) => {
        if (e.name === "AbortError") return;
        console.warn("Waveform decode failed:", e);
        setFailed(true);
      });

    return () => controller.abort();
  }, [audioUrl]);

  const seekFromEvent = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!containerRef.current || !duration) return;
    const rect = containerRef.current.getBoundingClientRect();
    const ratio = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    onSeek(ratio * duration);
  };

  const progressRatio = duration ? currentTime / duration : 0;
  const loading = !peaks && !failed && !!audioUrl;
  const bars = peaks ?? SKELETON_PEAKS;

  return (
    <div
      ref={containerRef}
      onClick={duration ? seekFromEvent : undefined}
      className={`flex items-end gap-[2px] select-none ${duration ? "cursor-pointer" : "cursor-default"}`}
      style={{ height }}
      title={failed ? "Waveform unavailable — click to seek" : "Click to seek"}
    >
      {bars.map((v, i) => {
        const played = i / BAR_COUNT < progressRatio;
        return (
          <div
            key={i}
            className={`flex-1 rounded-full transition-colors duration-150 ${
              played ? accentClassName : "bg-white/15"
            } ${loading ? "animate-pulse" : ""}`}
            style={{ height: `${Math.max(10, v * 100)}%` }}
          />
        );
      })}
    </div>
  );
}
