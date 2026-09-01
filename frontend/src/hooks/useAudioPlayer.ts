import { useRef, useState, useCallback, useEffect } from "react";

export interface TrackInfo {
  id: string;
  title: string;
  artist: string;
  fileUrl: string;
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
}

export type AudioPlayer = AudioPlayerState & AudioPlayerActions;

/**
 * Implementation hook — instantiate ONCE (in PlayerProvider). Pages read the
 * shared instance through `usePlayer()`.
 */
export function useAudioPlayerImpl(): AudioPlayer {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  if (audioRef.current === null && typeof Audio !== "undefined") {
    audioRef.current = new Audio();
  }
  const queueRef = useRef<TrackInfo[]>([]);
  const indexRef = useRef(0);

  const [track, setTrack] = useState<TrackInfo | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [volume, setVolumeState] = useState(0.85);
  const [isMuted, setIsMuted] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [queue, setQueue] = useState<TrackInfo[]>([]);
  const [queueIndex, setQueueIndex] = useState(0);

  const loadTrack = useCallback((t: TrackInfo) => {
    const audio = audioRef.current;
    if (!audio) return;
    setTrack(t);
    setIsLoading(true);
    setCurrentTime(0);
    audio.src = t.fileUrl;
    audio.load();
    audio.play().catch(() => setIsLoading(false));
  }, []);

  const playIndex = useCallback(
    (i: number) => {
      const q = queueRef.current;
      if (i < 0 || i >= q.length) return;
      indexRef.current = i;
      setQueueIndex(i);
      loadTrack(q[i]);
    },
    [loadTrack]
  );

  // Wire audio element events once.
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    const onTime = () => setCurrentTime(audio.currentTime);
    const onMeta = () => setDuration(audio.duration || 0);
    const onPlay = () => {
      setIsPlaying(true);
      setIsLoading(false);
    };
    const onPause = () => setIsPlaying(false);
    const onWaiting = () => setIsLoading(true);
    const onCanPlay = () => setIsLoading(false);
    const onEnded = () => {
      const nextIdx = indexRef.current + 1;
      if (nextIdx < queueRef.current.length) playIndex(nextIdx);
      else setIsPlaying(false);
    };

    audio.addEventListener("timeupdate", onTime);
    audio.addEventListener("loadedmetadata", onMeta);
    audio.addEventListener("play", onPlay);
    audio.addEventListener("pause", onPause);
    audio.addEventListener("waiting", onWaiting);
    audio.addEventListener("canplay", onCanPlay);
    audio.addEventListener("ended", onEnded);
    audio.volume = volume;

    return () => {
      audio.removeEventListener("timeupdate", onTime);
      audio.removeEventListener("loadedmetadata", onMeta);
      audio.removeEventListener("play", onPlay);
      audio.removeEventListener("pause", onPause);
      audio.removeEventListener("waiting", onWaiting);
      audio.removeEventListener("canplay", onCanPlay);
      audio.removeEventListener("ended", onEnded);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [playIndex]);

  const play = useCallback(
    (t: TrackInfo, q?: TrackInfo[]) => {
      const nextQueue = q && q.length ? q : [t];
      queueRef.current = nextQueue;
      setQueue(nextQueue);
      const idx = Math.max(0, nextQueue.findIndex((x) => x.id === t.id));
      indexRef.current = idx;
      setQueueIndex(idx);
      loadTrack(nextQueue[idx] ?? t);
    },
    [loadTrack]
  );

  const pause = useCallback(() => audioRef.current?.pause(), []);
  const resume = useCallback(() => audioRef.current?.play().catch(() => {}), []);
  const toggle = useCallback(() => {
    const a = audioRef.current;
    if (!a) return;
    if (a.paused) a.play().catch(() => {});
    else a.pause();
  }, []);
  const seek = useCallback((t: number) => {
    if (!audioRef.current) return;
    audioRef.current.currentTime = t;
    setCurrentTime(t);
  }, []);
  const setVolume = useCallback((v: number) => {
    if (audioRef.current) audioRef.current.volume = v;
    setVolumeState(v);
    if (v > 0) setIsMuted(false);
  }, []);
  const toggleMute = useCallback(() => {
    setIsMuted((prev) => {
      const nextMuted = !prev;
      if (audioRef.current) audioRef.current.muted = nextMuted;
      return nextMuted;
    });
  }, []);
  const next = useCallback(() => playIndex(indexRef.current + 1), [playIndex]);
  const prev = useCallback(() => {
    if ((audioRef.current?.currentTime ?? 0) > 3) {
      seek(0);
      return;
    }
    playIndex(indexRef.current - 1);
  }, [playIndex, seek]);
  const stop = useCallback(() => {
    const a = audioRef.current;
    if (a) {
      a.pause();
      a.removeAttribute("src");
      a.load();
    }
    queueRef.current = [];
    indexRef.current = 0;
    setTrack(null);
    setQueue([]);
    setQueueIndex(0);
    setIsPlaying(false);
    setCurrentTime(0);
  }, []);

  return {
    track,
    isPlaying,
    currentTime,
    duration,
    volume,
    isMuted,
    isLoading,
    queue,
    queueIndex,
    play,
    pause,
    resume,
    toggle,
    seek,
    setVolume,
    toggleMute,
    next,
    prev,
    stop,
  };
}
