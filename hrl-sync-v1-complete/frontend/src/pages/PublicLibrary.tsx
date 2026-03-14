import { useQuery } from "@tanstack/react-query";
import { Music2, Play, Pause, Loader2 } from "lucide-react";
import { useAudioPlayer } from "@/hooks/useAudioPlayer";
import { api, streamUrl } from "@/lib/api";
import { cn } from "@/lib/utils";

function fmt(s: number | null) {
    if (!s) return "—";
    return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

export default function PublicLibrary() {
    const player = useAudioPlayer();

    const { data: tracks, isLoading } = useQuery({
        queryKey: ["tracks", "public"],
        queryFn: async () => {
            const res = await api.get<{ tracks: any[] }>("/api/tracks/public");
            return res.tracks || [];
        },
    });

    const handlePlay = (track: any) => {
        const allTracks = tracks?.map((t: any) => ({
            id: t.id,
            title: t.title,
            artist: t.artist,
            fileUrl: streamUrl(t.id),
            duration: t.duration,
        })) || [];

        player.play({
            id: track.id,
            title: track.title,
            artist: track.artist,
            fileUrl: streamUrl(track.id),
            duration: track.duration,
        }, allTracks);
    };

    return (
        <div className="min-h-screen bg-background p-6">
            <div className="max-w-5xl mx-auto space-y-8 animate-fade-in">
                {/* Header */}
                <div className="text-center space-y-2">
                    <div className="w-16 h-16 mx-auto mb-4 rounded border border-red-500/40 flex items-center justify-center bg-red-500/8">
                        <Music2 className="w-8 h-8 text-red-500" />
                    </div>
                    <h1 className="hrl-title text-4xl tracking-widest text-foreground">PUBLIC LIBRARY</h1>
                    <p className="hrl-label text-muted-foreground uppercase tracking-widest text-xs">
                        Open Catalog — Hardban Records Lab
                    </p>
                </div>

                {isLoading ? (
                    <div className="flex flex-col items-center justify-center py-20 gap-4 text-muted-foreground">
                        <Loader2 className="w-8 h-8 animate-spin text-red-500" />
                        <span className="hrl-label tracking-widest opacity-50">SYNCING CATALOG…</span>
                    </div>
                ) : !tracks || tracks.length === 0 ? (
                    <div className="text-center py-20 border border-dashed border-border rounded-lg">
                        <Music2 className="w-12 h-12 mx-auto mb-4 text-muted-foreground opacity-20" />
                        <p className="hrl-title text-xl text-muted-foreground">NO PUBLIC TRACKS AVAILABLE</p>
                    </div>
                ) : (
                    <div className="hrl-card overflow-hidden">
                        <div className="grid px-4 py-3 border-b border-border bg-white/2" style={{ gridTemplateColumns: "40px 1fr 100px 80px" }}>
                            {["#", "TITLE", "BPM", "LENGTH"].map(h => (
                                <span key={h} className="hrl-label text-[10px] text-muted-foreground tracking-widest">{h}</span>
                            ))}
                        </div>

                        <div className="divide-y divide-border/50">
                            {tracks.map((track: any, i: number) => {
                                const isActive = player.track?.id === track.id;
                                return (
                                    <div
                                        key={track.id}
                                        className={cn(
                                            "grid items-center px-4 py-4 cursor-pointer group transition-all hover:bg-red-500/5",
                                            isActive && "bg-red-500/10"
                                        )}
                                        style={{ gridTemplateColumns: "40px 1fr 100px 80px" }}
                                        onClick={() => handlePlay(track)}
                                    >
                                        <div className="flex items-center justify-center">
                                            {isActive && player.isPlaying ? (
                                                <div className="flex gap-0.5 items-end h-3">
                                                    {[1, 2, 3].map(b => (
                                                        <div key={b} className="w-0.5 bg-red-500 animate-pulse-red" style={{ height: `${6 + b * 2}px`, animationDelay: `${b * 0.1}s` }} />
                                                    ))}
                                                </div>
                                            ) : (
                                                <Play className={cn("w-3.5 h-3.5 text-muted-foreground group-hover:text-red-400 transition-colors", isActive && "text-red-400")} />
                                            )}
                                        </div>

                                        <div className="min-w-0 pr-4">
                                            <p className={cn("text-sm font-medium truncate tracking-wide", isActive && "text-red-400")}>
                                                {track.title}
                                            </p>
                                            <p className="hrl-label text-[10px] text-muted-foreground/70 truncate uppercase">
                                                {track.artist}
                                            </p>
                                        </div>

                                        <span className="mono text-xs text-muted-foreground">{track.bpm || "—"}</span>
                                        <span className="mono text-xs text-muted-foreground">{fmt(track.duration)}</span>
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                )}

                <div className="text-center pt-8">
                    <p className="hrl-label text-[9px] text-muted-foreground opacity-30 tracking-[0.3em] uppercase">
                        Powered by HRL SYNC HUB v2.0 Premium
                    </p>
                </div>
            </div>
        </div>
    );
}
