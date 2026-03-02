import { useQuery } from "@tanstack/react-query";
import { BarChart3, Eye, Play, Download, Users, Loader2, TrendingUp } from "lucide-react";
import Layout from "@/components/Layout";
import { api } from "@/lib/api";
import { cn } from "@/lib/utils";

interface Overview {
  totals: { total_opens: number; total_plays: number; total_downloads: number; unique_visitors: number };
  topPlaylists: { id: string; name: string; opens: number; plays: number }[];
  topTracks: { id: string; title: string; artist: string; play_count: number }[];
  recentEvents: { event_type: string; created_at: string; track_title?: string; playlist_name: string; ip_address: string }[];
}

interface TimePoint { date: string; opens: number; plays: number; downloads: number; }

function Bar({ value, max, color }: { value: number; max: number; color: string }) {
  const pct = max > 0 ? (value / max) * 100 : 0;
  return (
    <div className="h-1.5 bg-white/5 rounded-full overflow-hidden">
      <div className={`h-full rounded-full transition-all`} style={{ width: `${pct}%`, background: color }} />
    </div>
  );
}

export default function Analytics() {
  const { data: overview, isLoading } = useQuery<Overview>({
    queryKey: ["analytics-overview"],
    queryFn: () => api.get("/api/analytics/overview"),
  });

  const { data: timeseries = [] } = useQuery<TimePoint[]>({
    queryKey: ["analytics-timeseries"],
    queryFn: () => api.get("/api/analytics/timeseries", { days: 30 }),
  });

  const maxPlays = Math.max(...timeseries.map(d => d.plays), 1);
  const sparkMax = maxPlays;

  const STAT_CARDS = [
    { label: "Playlist Opens",    value: overview?.totals.total_opens      ?? 0, icon: Eye,       color: "#60a5fa" },
    { label: "Track Plays",       value: overview?.totals.total_plays      ?? 0, icon: Play,       color: "#FF3C50" },
    { label: "Downloads",         value: overview?.totals.total_downloads  ?? 0, icon: Download,   color: "#34d399" },
    { label: "Unique Visitors",   value: overview?.totals.unique_visitors  ?? 0, icon: Users,      color: "#a78bfa" },
  ];

  const EVENT_LABEL: Record<string, string> = {
    playlist_opened: "Opened playlist",
    track_played:    "Played track",
    track_downloaded:"Downloaded track",
  };

  return (
    <Layout>
      <div className="animate-fade-in space-y-8">
        <div>
          <h1 className="hrl-title text-5xl mb-1">ANALYTICS</h1>
          <p className="hrl-label text-muted-foreground">Track engagement across all shared pitches</p>
        </div>

        {isLoading ? (
          <div className="flex items-center justify-center py-16 gap-2 text-muted-foreground">
            <Loader2 className="w-4 h-4 animate-spin" /><span className="hrl-label">Loading…</span>
          </div>
        ) : (
          <>
            {/* Stats */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
              {STAT_CARDS.map(({ label, value, icon: Icon, color }, i) => (
                <div key={label} className={`hrl-card p-5 animate-fade-in stagger-${i+1}`}>
                  <div className="flex items-center justify-between mb-3">
                    <span className="hrl-label">{label}</span>
                    <Icon className="w-3.5 h-3.5" style={{ color }} />
                  </div>
                  <p className="hrl-stat-value">{value.toLocaleString()}</p>
                </div>
              ))}
            </div>

            {/* Sparkline — last 30 days */}
            <div className="hrl-card p-5 animate-fade-in stagger-2">
              <div className="flex items-center gap-2 mb-5">
                <TrendingUp className="w-3.5 h-3.5 text-red-500" />
                <h2 className="hrl-title text-xl">LAST 30 DAYS — PLAYS</h2>
              </div>
              <div className="flex items-end gap-0.5 h-16">
                {timeseries.map((d, i) => {
                  const h = sparkMax > 0 ? Math.max(2, (d.plays / sparkMax) * 64) : 2;
                  return (
                    <div key={d.date} className="group relative flex-1 flex items-end">
                      <div
                        className="w-full rounded-sm transition-all"
                        style={{ height: `${h}px`, background: d.plays > 0 ? "#FF3C50" : "rgba(255,255,255,0.06)" }}
                      />
                      <div className="absolute bottom-full mb-1 left-1/2 -translate-x-1/2 hidden group-hover:block z-10">
                        <div className="bg-card border border-border rounded px-2 py-1 text-[10px] mono whitespace-nowrap">
                          {d.date}: {d.plays}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
              <div className="flex justify-between mt-2">
                <span className="hrl-label text-muted-foreground">{timeseries[0]?.date}</span>
                <span className="hrl-label text-muted-foreground">{timeseries[timeseries.length - 1]?.date}</span>
              </div>
            </div>

            <div className="grid md:grid-cols-2 gap-5">
              {/* Top playlists */}
              <div className="hrl-card p-5 animate-fade-in stagger-3">
                <h2 className="hrl-title text-xl mb-5">TOP PLAYLISTS</h2>
                {(overview?.topPlaylists ?? []).length === 0 ? (
                  <p className="hrl-label text-muted-foreground text-center py-6">No data yet</p>
                ) : (
                  <div className="space-y-3">
                    {overview!.topPlaylists.map((pl, i) => (
                      <div key={pl.id}>
                        <div className="flex items-center justify-between mb-1">
                          <p className="text-sm font-medium truncate">{pl.name}</p>
                          <div className="flex gap-3 ml-2 shrink-0">
                            <span className="hrl-label text-muted-foreground">{pl.opens} opens</span>
                            <span className="hrl-label" style={{ color: "#FF3C50" }}>{pl.plays} plays</span>
                          </div>
                        </div>
                        <Bar value={pl.plays} max={overview!.topPlaylists[0].plays} color="#FF3C50" />
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Top tracks */}
              <div className="hrl-card p-5 animate-fade-in stagger-4">
                <h2 className="hrl-title text-xl mb-5">TOP TRACKS</h2>
                {(overview?.topTracks ?? []).length === 0 ? (
                  <p className="hrl-label text-muted-foreground text-center py-6">No data yet</p>
                ) : (
                  <div className="space-y-2">
                    {overview!.topTracks.slice(0, 8).map((t, i) => (
                      <div key={t.id} className="flex items-center gap-3">
                        <span className="hrl-label text-muted-foreground w-5 text-right">{i + 1}</span>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium truncate leading-tight">{t.title}</p>
                          <p className="hrl-label text-muted-foreground">{t.artist}</p>
                        </div>
                        <span className="hrl-label" style={{ color: "#FF3C50" }}>{t.play_count}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* Recent events */}
            <div className="hrl-card p-5 animate-fade-in stagger-5">
              <h2 className="hrl-title text-xl mb-5">RECENT ACTIVITY</h2>
              {(overview?.recentEvents ?? []).length === 0 ? (
                <p className="hrl-label text-muted-foreground text-center py-6">No activity yet — share a pitch to start tracking</p>
              ) : (
                <div className="space-y-1">
                  {overview!.recentEvents.map((ev, i) => (
                    <div key={i} className="flex items-center gap-3 py-2 border-b border-border/50 last:border-0 text-sm">
                      <span className={cn(
                        "hrl-badge-dim shrink-0",
                        ev.event_type === "track_played" && "hrl-badge-red"
                      )}>
                        {ev.event_type === "playlist_opened" ? "OPEN" : ev.event_type === "track_played" ? "PLAY" : "DL"}
                      </span>
                      <div className="flex-1 min-w-0">
                        <span className="text-muted-foreground">{EVENT_LABEL[ev.event_type]}</span>
                        {ev.track_title && <span className="ml-1 font-medium">{ev.track_title}</span>}
                        <span className="ml-1 text-muted-foreground">in</span>
                        <span className="ml-1 font-medium">{ev.playlist_name}</span>
                      </div>
                      <span className="hrl-label text-muted-foreground shrink-0">
                        {new Date(ev.created_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </Layout>
  );
}
