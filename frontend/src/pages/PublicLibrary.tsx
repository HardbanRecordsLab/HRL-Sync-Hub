import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Music2, Play, Loader2, Search } from "lucide-react";
import { usePlayer } from "@/components/player/PlayerProvider";
import { AudioPlayerBar } from "@/components/player/AudioPlayerBar";
import { Input } from "@/components/ui/input";
import { LicenseDialog } from "@/components/LicenseDialog";
import { api, streamUrl } from "@/lib/api";
import { cn } from "@/lib/utils";

type PublicTrack = { id: number; title: string; artist: string; duration: number | null; bpm: number | null; key: string | null };

function fmt(s: number | null) {
  if (!s) return "—";
  return `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}`;
}

/** Public catalog: every track marked public, playable without an account. */
export default function PublicLibrary() {
  const player = usePlayer();
  const [q, setQ] = useState("");
  const [licensing, setLicensing] = useState<PublicTrack | null>(null);

  const { data: tracks = [], isLoading } = useQuery({
    queryKey: ["tracks", "public"],
    queryFn: async () => (await api.get<{ tracks: PublicTrack[] }>("/api/tracks/public")).tracks || [],
  });

  const shown = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return needle ? tracks.filter((t) => `${t.title} ${t.artist}`.toLowerCase().includes(needle)) : tracks;
  }, [tracks, q]);

  const toItem = (t: PublicTrack) => ({ id: String(t.id), title: t.title, artist: t.artist, fileUrl: streamUrl(String(t.id)), duration: t.duration ?? undefined, bpm: t.bpm ?? undefined, key: t.key ?? undefined });
  const handlePlay = (t: PublicTrack) => player.play(toItem(t), shown.map(toItem));

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border">
        <div className="max-w-5xl mx-auto px-4 md:px-6 h-16 flex items-center gap-3">
          <img src="/favicon.png" alt="" className="w-8 h-8 object-contain rounded-md bg-white p-0.5" />
          <div>
            <p className="text-sm font-semibold leading-tight">HRL Sync Hub</p>
            <p className="text-xs text-muted-foreground leading-tight">Hardban Records Lab</p>
          </div>
          <a href="https://hardbanrecordslab.online/sync-hub/" className="ml-auto text-sm text-muted-foreground hover:text-foreground">Licensing enquiries</a>
        </div>
      </header>

      <main className={cn("max-w-5xl mx-auto px-4 md:px-6 py-8 md:py-12 space-y-6", player.track ? "pb-32" : "pb-16")}>
        <div className="space-y-2">
          <h1 className="text-3xl md:text-4xl font-semibold tracking-tight">Music catalog</h1>
          <p className="text-muted-foreground max-w-2xl">
            Original music from Hardban Records Lab, available for sync licensing in film, advertising, games and online content.
            Press play on any track — no account needed — and license it online in a minute: from 79 zł for online videos, 429 zł for ads and commercial use. Previews carry a soft audible watermark; the licensed file is clean, full quality.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <div className="relative flex-1 min-w-[220px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input placeholder="Search by title or artist…" className="pl-9 h-10" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search the catalog" />
          </div>
          {!isLoading && <span className="text-sm text-muted-foreground">{q ? `${shown.length} of ${tracks.length}` : `${tracks.length}`} tracks</span>}
        </div>

        {isLoading ? (
          <div className="flex items-center justify-center py-20 gap-2 text-muted-foreground">
            <Loader2 className="w-5 h-5 animate-spin" /> <span className="text-sm">Loading catalog…</span>
          </div>
        ) : shown.length === 0 ? (
          <div className="hrl-card text-center py-16">
            <Music2 className="w-10 h-10 mx-auto mb-3 text-muted-foreground opacity-40" />
            <p className="text-muted-foreground">{tracks.length ? "No tracks match your search." : "No tracks available yet."}</p>
          </div>
        ) : (
          <div className="hrl-card overflow-hidden">
            <div className="hidden md:grid gap-4 px-4 py-2.5 border-b border-border text-xs font-medium text-muted-foreground pub-grid">
              <span className="text-center">#</span><span>Track</span><span>BPM</span><span>Key</span><span className="text-right">Length</span><span />
            </div>
            {shown.map((t, i) => {
              const active = player.track?.id === String(t.id);
              return (
                <div
                  key={t.id}
                  role="button" tabIndex={0}
                  onKeyDown={(e) => { if (e.key === "Enter") (active ? player.toggle() : handlePlay(t)); }}
                  onClick={() => (active ? player.toggle() : handlePlay(t))}
                  className={cn("w-full text-left grid items-center cursor-pointer gap-3 md:gap-4 px-3 md:px-4 py-2.5 border-b border-border/60 last:border-0 group hover:bg-white/[0.03] transition-colors pub-grid",
                    active && "bg-violet-500/10")}
                >
                  <span className="w-8 h-8 flex items-center justify-center">
                    {active && player.isPlaying ? (
                      <span className="flex gap-0.5 items-end h-3.5">
                        {[1, 2, 3].map((b) => <span key={b} className="w-0.5 bg-violet-400 rounded-full animate-pulse-red" style={{ height: `${6 + b * 3}px`, animationDelay: `${b * 0.15}s` }} />)}
                      </span>
                    ) : (
                      <>
                        <span className={cn("text-xs text-muted-foreground tabular-nums group-hover:hidden", active && "hidden")}>{i + 1}</span>
                        <Play className={cn("w-4 h-4 text-violet-300 hidden group-hover:block", active && "block")} />
                      </>
                    )}
                  </span>
                  <span className="min-w-0">
                    <span className={cn("block text-sm font-medium truncate", active && "text-violet-300")}>{t.title}</span>
                    <span className="block text-xs text-muted-foreground truncate">
                      {t.artist}
                      <span className="md:hidden">{[t.bpm && `${t.bpm} BPM`, t.key, fmt(t.duration)].filter(Boolean).map((x) => ` · ${x}`).join("")}</span>
                    </span>
                  </span>
                  <span className="hidden md:block text-sm text-muted-foreground tabular-nums">{t.bpm ?? "—"}</span>
                  <span className="hidden md:block text-sm text-muted-foreground">{t.key ?? "—"}</span>
                  <span className="hidden md:block text-sm text-muted-foreground tabular-nums text-right">{fmt(t.duration)}</span>
                  <button
                    onClick={(e) => { e.stopPropagation(); setLicensing(t); }}
                    className="justify-self-end text-xs font-medium px-3 py-1.5 rounded-full border border-violet-500/40 text-violet-200 hover:bg-violet-500/15"
                  >
                    License
                  </button>
                </div>
              );
            })}
          </div>
        )}

        <footer className="pt-6 text-xs text-muted-foreground flex flex-wrap gap-x-4 gap-y-1">
          <span>© Hardban Records Lab</span>
          <a href="/terms" className="hover:text-foreground">Terms</a>
          <a href="/privacy" className="hover:text-foreground">Privacy</a>
          <a href="https://hardbanrecordslab.online/contact/" className="hover:text-foreground">Contact</a>
        </footer>
      </main>

      <LicenseDialog track={licensing} onClose={() => setLicensing(null)} />
      <AudioPlayerBar player={player} />
    </div>
  );
}
