import { useEffect, useRef, useState } from "react";
import {
  Play, Pause, SkipBack, SkipForward, Volume2, VolumeX,
  Music2, ChevronUp, ChevronDown, Loader2
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { AudioPlayer } from "@/hooks/useAudioPlayer";

interface Props { player: AudioPlayer; }

function fmt(s: number) {
  if (!s || isNaN(s)) return "0:00";
  const m = Math.floor(s / 60), sec = Math.floor(s % 60);
  return `${m}:${String(sec).padStart(2, "0")}`;
}

export function AudioPlayerBar({ player }: Props) {
  const {
    track, isPlaying, isLoading, currentTime, duration,
    volume, isMuted, toggle, seek, setVolume, toggleMute, next, prev,
  } = player;

  const progressRef = useRef<HTMLDivElement>(null);
  const [expanded, setExpanded] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [hoverTime, setHoverTime] = useState<number | null>(null);
  const pct = duration ? (currentTime / duration) * 100 : 0;

  const seekFromClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!progressRef.current || !duration) return;
    const rect = progressRef.current.getBoundingClientRect();
    const ratio = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    seek(ratio * duration);
  };

  const hoverFromMove = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!progressRef.current || !duration) return;
    const rect = progressRef.current.getBoundingClientRect();
    const ratio = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    setHoverTime(ratio * duration);
  };

  if (!track) return (
    <div className="fixed bottom-0 right-0 left-0 z-30 player-bar h-[60px] flex items-center justify-center gap-3">
      <Music2 className="w-4 h-4 text-muted-foreground opacity-40" />
      <span className="hrl-label text-muted-foreground opacity-40">No track selected</span>
    </div>
  );

  return (
    <div className={cn(
      "fixed bottom-0 right-0 z-30 player-bar animate-slide-up transition-all duration-300",
      "left-0",
      expanded ? "h-[160px]" : "h-[72px]"
    )}>
      {/* ── Progress bar ───────────────────────────── */}
      <div
        ref={progressRef}
        className="absolute top-0 left-0 right-0 h-[3px] cursor-pointer group"
        onClick={seekFromClick}
        onMouseMove={hoverFromMove}
        onMouseLeave={() => setHoverTime(null)}
      >
        <div className="absolute inset-0 bg-white/5" />
        <div
          className="absolute top-0 left-0 h-full bg-red-500 transition-all"
          style={{ width: `${pct}%` }}
        />
        {/* scrubber dot */}
        <div
          className="absolute top-1/2 -translate-y-1/2 w-3 h-3 rounded-full bg-red-500 opacity-0 group-hover:opacity-100 transition-opacity shadow-lg"
          style={{ left: `calc(${pct}% - 6px)` }}
        />
        {/* hover tooltip */}
        {hoverTime !== null && (
          <div
            className="absolute bottom-3 -translate-x-1/2 bg-card border border-border rounded px-1.5 py-0.5 text-[10px] mono pointer-events-none"
            style={{ left: `${(hoverTime / duration) * 100}%` }}
          >
            {fmt(hoverTime)}
          </div>
        )}
      </div>

      {/* ── Main bar ───────────────────────────────── */}
      <div className="flex items-center h-[72px] px-6 gap-5">
        {/* Track info */}
        <div className="flex items-center gap-3 min-w-0 w-[240px] shrink-0">
          <div className="w-9 h-9 shrink-0 rounded border border-border bg-card flex items-center justify-center">
            <Music2 className="w-4 h-4 text-muted-foreground" />
          </div>
          <div className="min-w-0">
            <p className="text-sm font-medium truncate leading-tight">{track.title}</p>
            <p className="hrl-label text-[10px] text-muted-foreground truncate">{track.artist}</p>
          </div>
          {track.bpm && (
            <span className="hrl-badge-dim shrink-0">{track.bpm} BPM</span>
          )}
        </div>

        {/* Controls */}
        <div className="flex items-center gap-2 mx-auto">
          <button onClick={prev} className="text-muted-foreground hover:text-foreground transition p-1.5 rounded hover:bg-white/5">
            <SkipBack className="w-4 h-4" />
          </button>
          <button
            onClick={toggle}
            className="w-9 h-9 rounded-full bg-red-500 hover:bg-red-400 transition flex items-center justify-center shadow-md"
          >
            {isLoading
              ? <Loader2 className="w-4 h-4 animate-spin text-white" />
              : isPlaying
                ? <Pause className="w-4 h-4 text-white" />
                : <Play className="w-4 h-4 text-white ml-0.5" />
            }
          </button>
          <button onClick={next} className="text-muted-foreground hover:text-foreground transition p-1.5 rounded hover:bg-white/5">
            <SkipForward className="w-4 h-4" />
          </button>
        </div>

        {/* Time */}
        <div className="mono text-xs text-muted-foreground tabular-nums w-24 text-center">
          {fmt(currentTime)} / {fmt(duration)}
        </div>

        {/* Volume */}
        <div className="flex items-center gap-2 w-[140px]">
          <button onClick={toggleMute} className="text-muted-foreground hover:text-foreground transition shrink-0">
            {isMuted || volume === 0
              ? <VolumeX className="w-4 h-4" />
              : <Volume2 className="w-4 h-4" />
            }
          </button>
          <input
            type="range" min={0} max={1} step={0.01} value={isMuted ? 0 : volume}
            onChange={e => setVolume(parseFloat(e.target.value))}
            className="w-full h-1 accent-red-500 cursor-pointer"
          />
        </div>

        {/* Expand toggle */}
        <button
          onClick={() => setExpanded(e => !e)}
          className="text-muted-foreground hover:text-foreground transition ml-2 p-1 rounded hover:bg-white/5"
        >
          {expanded ? <ChevronDown className="w-4 h-4" /> : <ChevronUp className="w-4 h-4" />}
        </button>
      </div>

      {/* ── Expanded metadata ──────────────────────── */}
      {expanded && (
        <div className="px-6 pb-4 flex items-center gap-6 text-sm">
          {track.key && (
            <span className="hrl-label">KEY <span className="text-foreground ml-1">{track.key}</span></span>
          )}
          {track.bpm && (
            <span className="hrl-label">BPM <span className="text-foreground ml-1">{track.bpm}</span></span>
          )}
          <span className="hrl-label">DURATION <span className="text-foreground ml-1">{fmt(duration)}</span></span>
          <a
            href={track.fileUrl}
            target="_blank" rel="noreferrer"
            className="hrl-label text-red-500 hover:text-red-400 transition ml-auto"
          >
            OPEN IN DRIVE ↗
          </a>
        </div>
      )}
    </div>
  );
}
