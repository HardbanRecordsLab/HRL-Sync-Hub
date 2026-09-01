import { createContext, useContext, ReactNode } from "react";
import { useAudioPlayerImpl, type AudioPlayer } from "@/hooks/useAudioPlayer";

const PlayerContext = createContext<AudioPlayer | null>(null);

/** Mount once, near the app root. Holds the single shared <audio> instance. */
export function PlayerProvider({ children }: { children: ReactNode }) {
  const player = useAudioPlayerImpl();
  return <PlayerContext.Provider value={player}>{children}</PlayerContext.Provider>;
}

export function usePlayer(): AudioPlayer {
  const ctx = useContext(PlayerContext);
  if (!ctx) throw new Error("usePlayer must be used within <PlayerProvider>");
  return ctx;
}
