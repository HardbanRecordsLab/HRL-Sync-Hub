import { useQuery } from "@tanstack/react-query";
import { Music2, Radio, Eye, TrendingUp, Clock, HardDrive } from "lucide-react";
import Layout from "@/components/Layout";
import { supabase } from "@/integrations/supabase/client";
import { formatDistanceToNow } from "date-fns";

export default function Dashboard() {
  const { data: stats, isLoading } = useQuery({
    queryKey: ["dashboard-stats"],
    queryFn: async () => {
      const [tracks, playlists, plays, lyrics] = await Promise.all([
        supabase.from("tracks").select("id, clearance_status, created_at", { count: "exact" }),
        supabase.from("playlists").select("id, name, created_at", { count: "exact" }),
        supabase.from("tracking_events").select("id", { count: "exact" }).eq("event_type", "track_played"),
        supabase.from("lyrics").select("id", { count: "exact" }),
      ]);
      const recentTracks = await supabase
        .from("tracks").select("id, title, artist, created_at")
        .order("created_at", { ascending: false }).limit(5);
      return {
        totalTracks: tracks.count ?? 0,
        syncReady: tracks.data?.filter(t => t.clearance_status === "cleared_ready").length ?? 0,
        totalPlaylists: playlists.count ?? 0,
        totalPlays: plays.count ?? 0,
        totalLyrics: lyrics.count ?? 0,
        recentTracks: recentTracks.data ?? [],
      };
    },
  });

  const STATS = [
    { label: "Total Tracks",   value: stats?.totalTracks   ?? 0, icon: Music2,     suffix: "" },
    { label: "Sync Ready",     value: stats?.syncReady     ?? 0, icon: TrendingUp,  suffix: "" },
    { label: "Active Pitches", value: stats?.totalPlaylists ?? 0, icon: Radio,      suffix: "" },
    { label: "Total Plays",    value: stats?.totalPlays    ?? 0, icon: Eye,         suffix: "" },
    { label: "Lyrics",         value: stats?.totalLyrics   ?? 0, icon: HardDrive,  suffix: "" },
  ];

  return (
    <Layout>
      <div className="animate-fade-in space-y-8">
        {/* Header */}
        <div>
          <h1 className="hrl-title text-5xl text-foreground mb-1">DASHBOARD</h1>
          <p className="hrl-label text-muted-foreground">Hardban Records Lab — Sync Management</p>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3">
          {STATS.map(({ label, value, icon: Icon }, i) => (
            <div key={label} className={`hrl-card p-5 animate-fade-in stagger-${i + 1}`}>
              <div className="flex items-center justify-between mb-3">
                <span className="hrl-label">{label}</span>
                <Icon className="w-3.5 h-3.5 text-muted-foreground" />
              </div>
              <p className="hrl-stat-value">{isLoading ? "—" : value}</p>
            </div>
          ))}
        </div>

        {/* Recent Tracks */}
        <div className="hrl-card p-5 animate-fade-in stagger-3">
          <div className="flex items-center gap-2 mb-5">
            <Clock className="w-3.5 h-3.5 text-red-500" />
            <h2 className="hrl-title text-xl">RECENT TRACKS</h2>
          </div>
          {stats?.recentTracks.length === 0 && (
            <p className="hrl-label text-muted-foreground py-6 text-center">No tracks yet — import from Google Drive</p>
          )}
          <div className="space-y-2">
            {stats?.recentTracks.map((t, i) => (
              <div key={t.id} className={`track-row animate-fade-in stagger-${i + 1}`}>
                <span className="hrl-label w-6 text-center">{String(i + 1).padStart(2, "0")}</span>
                <div>
                  <p className="text-sm font-medium leading-tight">{t.title}</p>
                  <p className="hrl-label text-muted-foreground">{t.artist}</p>
                </div>
                <span className="hrl-label text-muted-foreground">
                  {formatDistanceToNow(new Date(t.created_at), { addSuffix: true })}
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* Quick links */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 animate-fade-in stagger-4">
          {[
            { href: "/drive",   label: "Import from Drive",   desc: "Sync audio files" },
            { href: "/library", label: "Browse Library",      desc: "All tracks" },
            { href: "/lyrics",  label: "Lyrics Catalog",      desc: "Manage lyrics" },
            { href: "/pitches", label: "Send Pitch",          desc: "Create playlist" },
          ].map(({ href, label, desc }) => (
            <a key={href} href={href} className="hrl-card p-4 block hover:border-red-500/30 transition group">
              <p className="font-medium text-sm group-hover:text-red-400 transition mb-1">{label}</p>
              <p className="hrl-label text-muted-foreground">{desc}</p>
            </a>
          ))}
        </div>
      </div>
    </Layout>
  );
}
