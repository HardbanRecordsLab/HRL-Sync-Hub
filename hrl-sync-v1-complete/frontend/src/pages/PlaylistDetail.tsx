import { useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  ArrowLeft, Play, Pause, Trash2, GripVertical,
  ExternalLink, Share2, Copy, Check, Loader2, Plus
} from "lucide-react";
import { Button } from "@/components/ui/button";
import Layout from "@/components/Layout";
import { api, streamUrl } from "@/lib/api";
import { useAudioPlayer } from "@/hooks/useAudioPlayer";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

export default function PlaylistDetail() {
  const { playlistId } = useParams<{ playlistId: string }>();
  const navigate = useNavigate();
  const qc       = useQueryClient();
  const player   = useAudioPlayer();
  const [copied, setCopied] = useState<string | null>(null);

  const { data: playlist, isLoading } = useQuery({
    queryKey: ["playlist", playlistId],
    queryFn: () => api.get<any>(`/api/playlists/${playlistId}`),
  });

  const removeMut = useMutation({
    mutationFn: (trackId: string) => api.delete(`/api/playlists/${playlistId}/tracks/${trackId}`),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["playlist", playlistId] }); toast.success("Track removed"); },
  });

  const shareMut = useMutation({
    mutationFn: () => api.post(`/api/playlists/${playlistId}/share-link`, { allow_downloads: false }),
    onSuccess: (sl: any) => { copyText(sl.share_url); toast.success("Share link copied!"); },
    onError: (e: any) => toast.error(e.message),
  });

  const copyText = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopied(text);
    setTimeout(() => setCopied(null), 2000);
  };

  const playAll = () => {
    if (!playlist?.tracks?.length) return;
    const queue = playlist.tracks.map((t: any) => ({
      id: t.id, title: t.title, artist: t.artist,
      fileUrl: t.google_drive_file_id ? streamUrl(t.google_drive_file_id) : "",
      bpm: t.bpm, key: t.key, duration: t.duration,
    })).filter((t: any) => t.fileUrl);
    if (queue.length) player.play(queue[0], queue);
  };

  const fmt = (s: number | null) => s ? `${Math.floor(s/60)}:${String(s%60).padStart(2,"0")}` : "—";

  if (isLoading) return (
    <Layout>
      <div className="flex items-center justify-center py-24 gap-2 text-muted-foreground">
        <Loader2 className="w-4 h-4 animate-spin" /><span className="hrl-label">Loading…</span>
      </div>
    </Layout>
  );

  return (
    <Layout>
      <div className="animate-fade-in space-y-6 max-w-3xl">
        {/* Header */}
        <div className="flex items-center gap-4">
          <button onClick={() => navigate("/pitches")} className="text-muted-foreground hover:text-foreground transition">
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div className="flex-1">
            <h1 className="hrl-title text-4xl leading-tight">{playlist?.name}</h1>
            {playlist?.description && <p className="hrl-label text-muted-foreground mt-1">{playlist.description}</p>}
            <p className="hrl-label text-muted-foreground mt-0.5">{playlist?.tracks?.length ?? 0} tracks</p>
          </div>
          <div className="flex gap-2">
            {(playlist?.tracks?.length ?? 0) > 0 && (
              <button
                onClick={playAll}
                className="w-9 h-9 rounded-full bg-red-500 hover:bg-red-400 transition flex items-center justify-center"
              >
                <Play className="w-4 h-4 text-white ml-0.5" />
              </button>
            )}
            <Button
              variant="outline" size="sm" className="h-9 hrl-label text-xs"
              onClick={() => shareMut.mutate()} disabled={shareMut.isPending}
            >
              {shareMut.isPending ? <Loader2 className="w-3 h-3 animate-spin mr-1.5" /> : <Share2 className="w-3 h-3 mr-1.5" />}
              Share
            </Button>
          </div>
        </div>

        {/* Active share links */}
        {(playlist?.share_links ?? []).filter((l: any) => l.is_active).length > 0 && (
          <div className="hrl-card p-4">
            <p className="hrl-label text-muted-foreground mb-3">Active Share Links</p>
            <div className="space-y-2">
              {playlist.share_links.filter((l: any) => l.is_active).map((link: any) => (
                <div key={link.id} className="flex items-center gap-2 text-xs">
                  <span className="font-mono text-muted-foreground flex-1 truncate">…/share/{link.token}</span>
                  <button onClick={() => copyText(link.share_url ?? `${window.location.origin}/share/${link.token}`)} className="text-muted-foreground hover:text-foreground transition">
                    {copied === (link.share_url ?? `${window.location.origin}/share/${link.token}`) ? <Check className="w-3 h-3 text-green-400" /> : <Copy className="w-3 h-3" />}
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Track list */}
        {(playlist?.tracks ?? []).length === 0 ? (
          <div className="text-center py-16">
            <p className="hrl-title text-2xl text-muted-foreground mb-2">EMPTY PLAYLIST</p>
            <p className="hrl-label text-muted-foreground mb-4">Go to Library and add tracks to this playlist</p>
            <Button variant="outline" className="hrl-label" onClick={() => navigate("/library")}>
              <Plus className="w-3.5 h-3.5 mr-1.5" /> Browse Library
            </Button>
          </div>
        ) : (
          <div className="hrl-card overflow-hidden">
            {/* Header row */}
            <div className="grid px-4 py-2 border-b border-border" style={{ gridTemplateColumns: "28px 28px 1fr 80px 60px 60px 36px" }}>
              {["", "#", "TRACK", "CLEARANCE", "BPM", "DUR", ""].map((h, i) => (
                <span key={i} className="hrl-label text-muted-foreground">{h}</span>
              ))}
            </div>

            {playlist.tracks.map((track: any, i: number) => {
              const isActive = player.track?.id === track.id;
              const hasAudio = !!track.google_drive_file_id;
              return (
                <div
                  key={track.id}
                  className={cn(
                    "grid items-center px-4 py-3 border-b border-border/50 last:border-0 group cursor-pointer transition-colors",
                    "hover:bg-white/3",
                    isActive && "bg-red-500/8"
                  )}
                  style={{ gridTemplateColumns: "28px 28px 1fr 80px 60px 60px 36px" }}
                  onClick={() => {
                    if (!hasAudio) return;
                    const queue = playlist.tracks
                      .filter((t: any) => t.google_drive_file_id)
                      .map((t: any) => ({ id: t.id, title: t.title, artist: t.artist, fileUrl: streamUrl(t.google_drive_file_id), bpm: t.bpm, key: t.key, duration: t.duration }));
                    player.play({ id: track.id, title: track.title, artist: track.artist, fileUrl: streamUrl(track.google_drive_file_id), bpm: track.bpm, key: track.key, duration: track.duration }, queue);
                  }}
                >
                  <GripVertical className="w-3.5 h-3.5 text-muted-foreground opacity-30" />
                  <div className="flex items-center justify-center">
                    {isActive && player.isPlaying ? (
                      <span className="flex gap-px items-end h-3">
                        {[1,2,3].map(b => <span key={b} className="w-px bg-red-500 animate-pulse-red rounded-full" style={{ height: `${4+b*2}px` }} />)}
                      </span>
                    ) : (
                      <>
                        <span className={cn("hrl-label text-muted-foreground", hasAudio && "group-hover:hidden")}>{i + 1}</span>
                        {hasAudio && <Play className="w-3 h-3 text-red-400 hidden group-hover:block" />}
                      </>
                    )}
                  </div>
                  <div className="min-w-0 pr-2">
                    <p className={cn("text-sm font-medium truncate", isActive && "text-red-400")}>{track.title}</p>
                    <p className="hrl-label text-muted-foreground truncate">{track.artist}</p>
                    {track.track_comment && <p className="hrl-label text-muted-foreground italic">{track.track_comment}</p>}
                  </div>
                  <span className={track.clearance_status === "cleared_ready" ? "hrl-badge-red text-[9px]" : "hrl-badge-dim text-[9px]"}>
                    {track.clearance_status === "cleared_ready" ? "CLEARED" : track.clearance_status === "in_progress" ? "IN PROG" : "PENDING"}
                  </span>
                  <span className="mono text-sm text-muted-foreground">{track.bpm ?? "—"}</span>
                  <span className="mono text-sm text-muted-foreground">{fmt(track.duration)}</span>
                  <button
                    onClick={e => { e.stopPropagation(); if (confirm("Remove from playlist?")) removeMut.mutate(track.id); }}
                    className="opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-red-400 transition p-1 rounded"
                  >
                    <Trash2 className="w-3 h-3" />
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </Layout>
  );
}
