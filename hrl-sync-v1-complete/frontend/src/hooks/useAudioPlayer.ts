import { useState, useRef, useCallback, useEffect } from "react";

export interface TrackInfo {
  id: string;
  title: string;
  artist: string;
  fileUrl: string;       // Google Drive proxy URL from VPS
  duration?: number;
  bpm?: number;
  key?: string;
  coverUrl?: string;
}

export interface AudioPlayerState {
  track: TrackInfo | null;
  isPlaying: boolean;
  currentTime: number;
  duration: number;
  volume: number;
  isMuted: boolean;
  isLoading: boolean;
  queue: TrackInfo[];
  queueIndex: number;
}

export interface AudioPlayerActions {
  play: (track: TrackInfo, queue?: TrackInfo[]) => void;
  pause: () => void;
  resume: () => void;
  toggle: () => void;
  seek: (time: number) => void;
  setVolume: (v: number) => void;
  toggleMute: () => void;
  next: () => void;
  prev: () => void;
  stop: () => void;
  audioRef: React.RefObject<HTMLAudioElement>;
}

export type AudioPlayer = AudioPlayerState & AudioPlayerActions;

export function useAudioPlayer(): AudioPlayer {
  const audioRef = useRef<HTMLAudioElement>(new Audio());
  const [track, setTrack] = useState<TrackInfo | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [volume, setVolumeState] = useState(0.85);
  const [isMuted, setIsMuted] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [queue, setQueue] = useState<TrackInfo[]>([]);
  const [queueIndex, setQueueIndex] = useState(0);

  // ── Wire up audio element events ──
  useEffect(() => {
    const audio = audioRef.current;
    const onTime  = () => setCurrentTime(audio.currentTime);
    const onMeta  = () => setDuration(audio.duration);
    const onPlay  = () => { setIsPlaying(true);  setIsLoading(false); };
    const onPause = () => setIsPlaying(false);
    const onWait  = () => setIsLoading(true);
    const onCanPlay = () => setIsLoading(false);
    const onEnded = () => {
      setQueueIndex(i => {
        const next = i + 1;
        if (next < queue.length) {
          loadTrack(queue[next]);
          return next;
        }
        setIsPlaying(false);
        return i;
      });
    };

    audio.addEventListener("timeupdate",  onTime);
    audio.addEventListener("loadedmetadata", onMeta);
    audio.addEventListener("play",    onPlay);
    audio.addEventListener("pause",   onPause);
    audio.addEventListener("waiting", onWait);
    audio.addEventListener("canplay", onCanPlay);
    audio.addEventListener("ended",   onEnded);

    return () => {
      audio.removeEventListener("timeupdate",  onTime);
      audio.removeEventListener("loadedmetadata", onMeta);
      audio.removeEventListener("play",    onPlay);
      audio.removeEventListener("pause",   onPause);
      audio.removeEventListener("waiting", onWait);
      audio.removeEventListener("canplay", onCanPlay);
      audio.removeEventListener("ended",   onEnded);
    };
  }, [queue]);

  const loadTrack = useCallback((t: TrackInfo) => {
    const audio = audioRef.current;
    setTrack(t);
    setIsLoading(true);
    setCurrentTime(0);
    audio.src = t.fileUrl;
    audio.load();
    audio.play().catch(() => setIsLoading(false));
  }, []);

  const play = useCallback((t: TrackInfo, q?: TrackInfo[]) => {
    if (q) {
      setQueue(q);
      const idx = q.findIndex(x => x.id === t.id);
      setQueueIndex(idx >= 0 ? idx : 0);
    }
    loadTrack(t);
  }, [loadTrack]);

  const pause  = useCallback(() => audioRef.current.pause(), []);
  const resume = useCallback(() => audioRef.current.play(), []);
  const toggle = useCallback(() => {
    if (audioRef.current.paused) audioRef.current.play();
    else audioRef.current.pause();
  }, []);
  const seek = useCallback((t: number) => {
    audioRef.current.currentTime = t;
    setCurrentTime(t);
  }, []);
  const setVolume = useCallback((v: number) => {
    audioRef.current.volume = v;
    setVolumeState(v);
    if (v > 0) setIsMuted(false);
  }, []);
  const toggleMute = useCallback(() => {
    const next = !isMuted;
    audioRef.current.muted = next;
    setIsMuted(next);
  }, [isMuted]);
  const next = useCallback(() => {
    const ni = queueIndex + 1;
    if (ni < queue.length) { loadTrack(queue[ni]); setQueueIndex(ni); }
  }, [queue, queueIndex, loadTrack]);
  const prev = useCallback(() => {
    if (currentTime > 3) { seek(0); return; }
    const pi = queueIndex - 1;
    if (pi >= 0) { loadTrack(queue[pi]); setQueueIndex(pi); }
  }, [queue, queueIndex, currentTime, seek, loadTrack]);
  const stop = useCallback(() => {
    audioRef.current.pause();
    audioRef.current.src = "";
    setTrack(null);
    setIsPlaying(false);
    setCurrentTime(0);
  }, []);

  return {
    track, isPlaying, currentTime, duration, volume, isMuted,
    isLoading, queue, queueIndex,
    play, pause, resume, toggle, seek, setVolume, toggleMute,
    next, prev, stop, audioRef,
  };
}

// Global singleton context
import { createContext, useContext } from "react";
export const PlayerContext = createContext<AudioPlayer | null>(null);
export const usePlayer = () => {
  const ctx = useContext(PlayerContext);
  if (!ctx) throw new Error("usePlayer must be inside PlayerProvider");
  return ctx;
};
