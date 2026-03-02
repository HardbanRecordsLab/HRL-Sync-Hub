import { useParams } from "react-router-dom";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Play, Pause, SkipBack, SkipForward, Volume2, Music2, Loader2, Download } from "lucide-react";
import { useAudioPlayer } from "@/hooks/useAudioPlayer";
import { streamUrl } from "@/lib/api";
import { cn } from "@/lib/utils";

const API = import.meta.env.VITE_API_URL ?? "";

function fmt(s: number | null) {
  if (!s) return "0:00";
  return `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}`;
}

export default function SharedPlaylist() {
  const { token } = useParams<{ token: string }>();
  const player    = useAudioPlayer();

  const { data, isLoading, isError } = useQuery({
    queryKey: ["shared", token],
    queryFn: async () => {
      const r = await fetch(`${API}/api/playlists/share/${token}`);
      if (!r.ok) throw new Error("Not found");
      return r.json();
    },
    enabled: !!token,
  });

  const eventMut = useMutation({
    mutationFn: ({ event_type, track_id }: { event_type: string; track_id?: string }) =>
      fetch(`${API}/api/analytics/event`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ link_token: token, event_type, track_id }),
      }),
  });

  const playTrack = (track: any, queue: any[]) => {
    if (!track.google_drive_file_id) return;
    player.play(
      { id: track.id, title: track.title, artist: track.artist, fileUrl: streamUrl(track.google_drive_file_id), bpm: track.bpm, key: track.key, duration: track.duration },
      queue.filter(t => t.google_drive_file_id).map(t => ({ id: t.id, title: t.title, artist: t.artist, fileUrl: streamUrl(t.google_drive_file_id), bpm: t.bpm, key: t.key, duration: t.duration }))
    );
    eventMut.mutate({ event_type: "track_played", track_id: track.id });
  };

  const pct = player.duration ? (player.currentTime / player.duration) * 100 : 0;

  if (isLoading) return (
    <div className="min-h-screen bg-background flex items-center justify-center">
      <div className="text-center">
        <div className="w-12 h-12 mx-auto mb-4 rounded border border-red-500/40 flex items-center justify-center">
          <span className="hrl-title text-xl text-red-500">HRL</span>
        </div>
        <p className="hrl-label text-muted-foreground">Loading…</p>
      </div>
    </div>
  );

  if (isError || !data) return (
    <div className="min-h-screen bg-background flex items-center justify-center">
      <div className="text-center">
        <p className="hrl-title text-4xl text-muted-foreground mb-2">LINK INVALID</p>
        <p className="hrl-label text-muted-foreground">This playlist link has expired or doesn't exist.</p>
      </div>
    </div>
  );

  const { playlist, link } = data;
  const tracks = playlist.tracks ?? [];

  return (
    <div className="min-h-screen bg-background flex flex-col">
      {/* Header */}
      <header className="border-b border-border px-6 py-5">
        <div className="max-w-2xl mx-auto flex items-center justify-between">
          <div>
            <p className="hrl-label mb-1" style={{ color: "var(--hrl-red)", letterSpacing: "0.15em" }}>HARDBAN RECORDS LAB</p>
            <h1 className="hrl-title text-4xl">{playlist.name}</h1>
            {playlist.description && <p className="text-sm text-muted-foreground mt-1">{playlist.description}</p>}
          </div>
          <div className="w-14 h-14 rounded border border-red-500/30 flex items-center justify-center bg-red-500/8">
            <span className="hrl-title text-2xl text-red-500">HRL</span>
          </div>
        </div>
      </header>

      {/* Track list */}
      <main className="flex-1 max-w-2xl mx-auto w-full px-6 py-6">
        <p className="hrl-label text-muted-foreground mb-4">{tracks.length} TRACKS</p>
        <div className="space-y-1">
          {tracks.map((track: any, i: number) => {
            const isActive = player.track?.id === track.id;
            const hasAudio = !!track.google_drive_file_id;
            return (
              <div
                key={track.id}
                className={cn(
                  "flex items-center gap-4 px-4 py-3 rounded-md cursor-pointer transition-colors",
                  !hasAudio && "opacity-50 cursor-default",
                  isActive ? "bg-red-500/10 border border-red-500/20" : "hover:bg-white/4"
                )}
                onClick={() => hasAudio && playTrack(track, tracks)}
              >
                {/* Play indicator */}
                <div className="w-8 flex items-center justify-center shrink-0">
                  {isActive && player.isPlaying ? (
                    <span className="flex gap-px items-end h-3">
                      {[1,2,3].map(b => <span key={b} className="w-px bg-red-500 animate-pulse-red rounded-full" style={{ height: `${4+b*2}px` }} />)}
                    </span>
                  ) : isActive ? (
                    <Play className="w-3.5 h-3.5 text-red-400" />
                  ) : (
                    <span className="hrl-label text-muted-foreground">{String(i+1).padStart(2,"0")}</span>
                  )}
                </div>

                {/* Info */}
                <div className="flex-1 min-w-0">
                  <p className={cn("text-sm font-medium truncate", isActive && "text-red-400")}>{track.title}</p>
                  <p className="hrl-label text-muted-foreground">{track.artist}</p>
                </div>

                {/* Badges + duration */}
                <div className="flex items-center gap-2 shrink-0">
                  {track.bpm  && <span className="hrl-badge-dim">{track.bpm} BPM</span>}
                  {track.key  && <span className="hrl-badge-dim">{track.key}</span>}
                  <span className="mono text-sm text-muted-foreground">{fmt(track.duration)}</span>
                  {link.allow_downloads && track.google_drive_file_id && (
                    <a
                      href={streamUrl(track.google_drive_file_id)}
                      download
                      onClick={e => { e.stopPropagation(); eventMut.mutate({ event_type: "track_downloaded", track_id: track.id }); }}
                      className="text-muted-foreground hover:text-foreground transition"
                    >
                      <Download className="w-3.5 h-3.5" />
                    </a>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </main>

      {/* Player bar */}
      {player.track && (
        <div className="sticky bottom-0 player-bar border-t border-border animate-slide-up">
          {/* Progress */}
          <div
            className="absolute top-0 left-0 right-0 h-[3px] cursor-pointer"
            onClick={e => {
              const r = e.currentTarget.getBoundingClientRect();
              player.seek(((e.clientX - r.left) / r.width) * player.duration);
            }}
          >
            <div className="absolute inset-0 bg-white/5" />
            <div className="absolute top-0 left-0 h-full bg-red-500" style={{ width: `${pct}%` }} />
          </div>

          <div className="max-w-2xl mx-auto flex items-center gap-5 px-6 h-[70px]">
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium truncate">{player.track.title}</p>
              <p className="hrl-label text-muted-foreground truncate">{player.track.artist}</p>
            </div>
            <div className="flex items-center gap-2">
              <button onClick={player.prev} className="text-muted-foreground hover:text-foreground transition p-1.5"><SkipBack className="w-4 h-4" /></button>
              <button
                onClick={player.toggle}
                className="w-9 h-9 rounded-full bg-red-500 hover:bg-red-400 transition flex items-center justify-center"
              >
                {player.isPlaying ? <Pause className="w-4 h-4 text-white" /> : <Play className="w-4 h-4 text-white ml-0.5" />}
              </button>
              <button onClick={player.next} className="text-muted-foreground hover:text-foreground transition p-1.5"><SkipForward className="w-4 h-4" /></button>
            </div>
            <span className="mono text-xs text-muted-foreground tabular-nums">{fmt(player.currentTime)} / {fmt(player.duration)}</span>
          </div>
        </div>
      )}

      {/* Footer */}
      <div className="text-center py-4 border-t border-border/50">
        <p className="hrl-label text-muted-foreground">
          Powered by <a href="https://hardbanrecords.com" target="_blank" rel="noreferrer" className="text-red-500/70 hover:text-red-400 transition">HRL SYNC</a>
        </p>
      </div>
    </div>
  );
}
