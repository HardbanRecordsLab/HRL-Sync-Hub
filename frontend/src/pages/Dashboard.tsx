import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { Music2, Radio, Eye, TrendingUp, Clock, HardDrive } from "lucide-react";
import Layout from "@/components/Layout";
import { api } from "@/lib/api";
import { formatDistanceToNow } from "date-fns";

export default function Dashboard() {
  const { data: stats, isLoading } = useQuery({
    queryKey: ["dashboard-stats"],
    queryFn: async () => {
      // Fetch from VPS Backend instead of direct Supabase
      const data = await api.get<any>("/api/analytics/dashboard");
      return {
        totalTracks: data.totalTracks ?? 0,
        syncReady: data.syncReady ?? 0,
        totalPlaylists: data.totalPlaylists ?? 0,
        totalPlays: data.totalPlays ?? 0,
        totalLyrics: data.totalLyrics ?? 0,
        recentTracks: data.recentTracks ?? [],
      };
    },
  });

  const STATS = [
    { label: "Tracks",         value: stats?.totalTracks   ?? 0, icon: Music2,     suffix: "" },
    { label: "Sync ready",     value: stats?.syncReady     ?? 0, icon: TrendingUp,  suffix: "" },
    { label: "Active pitches", value: stats?.totalPlaylists ?? 0, icon: Radio,      suffix: "" },
    { label: "Plays",          value: stats?.totalPlays    ?? 0, icon: Eye,         suffix: "" },
    { label: "Lyrics",         value: stats?.totalLyrics   ?? 0, icon: HardDrive,  suffix: "" },
  ];

  return (
    <Layout>
      <div className="animate-fade-in space-y-8">
        {/* Header */}
        <div>
          <h1 className="hrl-title">Dashboard</h1>
          <p className="text-sm text-muted-foreground">Overview of the sync catalog and pitching activity</p>
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
            <Clock className="w-3.5 h-3.5 text-violet-500" />
            <h2 className="text-base font-semibold">Recently added</h2>
          </div>
          {stats?.recentTracks.length === 0 && (
            <p className="hrl-label text-muted-foreground py-6 text-center">No tracks yet — upload audio in the Library</p>
          )}
          <div className="space-y-2">
            {stats?.recentTracks.map((t, i) => (
              <div key={t.id} className={`track-row animate-fade-in stagger-${i + 1}`}>
                <span className="text-xs text-muted-foreground tabular-nums w-6 text-center">{i + 1}</span>
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
            { href: "/library", label: "Upload audio",   desc: "Add tracks to the library" },
            { href: "/pitches", label: "Send a pitch",    desc: "Share a playlist with a client" },
            { href: "/lyrics",  label: "Lyrics",          desc: "Manage lyrics and translations" },
            { href: "/contacts", label: "Contacts",       desc: "Supervisors & clients" },
          ].map(({ href, label, desc }) => (
            <Link key={href} to={href} className="hrl-card p-4 block hover:border-violet-500/40 transition group">
              <p className="font-medium text-sm group-hover:text-violet-400 transition mb-1">{label}</p>
              <p className="hrl-label text-muted-foreground">{desc}</p>
            </Link>
          ))}
        </div>
      </div>
    </Layout>
  );
}
