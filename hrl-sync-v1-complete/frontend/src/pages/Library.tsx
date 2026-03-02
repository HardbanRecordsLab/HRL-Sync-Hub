import { useState, useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Search, Play, Pause, Download, MoreVertical, Filter,
  Music2, ExternalLink, Loader2, HardDrive, Upload, Plus
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import Layout from "@/components/Layout";
import { useAudioPlayer } from "@/hooks/useAudioPlayer";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { api, streamUrl } from "@/lib/api";

function fmt(s: number | null) {
  if (!s) return "—";
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

export default function Library() {
  const qc = useQueryClient();
  const player = useAudioPlayer();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [search, setSearch] = useState("");
  const [clearanceFilter, setClearanceFilter] = useState("all");
  const [isUploading, setIsUploading] = useState(false);

  // Fetch tracks via Node.js backend API
  const { data: tracksData, isLoading } = useQuery({
    queryKey: ["tracks", search, clearanceFilter],
    queryFn: async () => {
      const res = await api.get<{ tracks: any[] }>("/api/tracks", {
        search,
        clearance: clearanceFilter !== "all" ? clearanceFilter : undefined,
      });
      return res.tracks || [];
    },
  });

  const tracks = Array.isArray(tracksData) ? tracksData : [];

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      await api.delete(`/api/tracks/${id}`);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["tracks"] });
      toast.success("Track removed");
    },
    onError: () => toast.error("Failed to delete track"),
  });

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsUploading(true);
    const fd = new FormData();
    fd.append("file", file);

    try {
      const token = localStorage.getItem("hrl_token") || "";
      const res = await fetch(`${import.meta.env.VITE_API_URL}/api/tracks/upload`, {
        method: "POST",
        headers: { "Authorization": `Bearer ${token}` },
        body: fd,
      });
      if (!res.ok) throw new Error("Upload failed");
      toast.success("Track uploaded to VPS");
      qc.invalidateQueries({ queryKey: ["tracks"] });
    } catch (err) {
      toast.error("Upload failed: " + (err as Error).message);
    } finally {
      setIsUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const handlePlay = (track: any) => {
    const allAsTracks = tracks.map(t => ({
      id: t.id,
      title: t.title,
      artist: t.artist,
      fileUrl: streamUrl(t.id),
      duration: t.duration,
      bpm: t.bpm,
      key: t.key,
    }));
    player.play({
      id: track.id,
      title: track.title,
      artist: track.artist,
      fileUrl: streamUrl(track.id),
      duration: track.duration,
      bpm: track.bpm,
      key: track.key,
    }, allAsTracks);
  };

  const CLEARANCE_LABEL: Record<string, string> = {
    cleared_ready: "Cleared",
    in_progress: "In Progress",
    not_cleared: "Not Cleared",
  };
  const CLEARANCE_COLOR: Record<string, string> = {
    cleared_ready: "hrl-badge-red",
    in_progress: "hrl-badge-dim",
    not_cleared: "hrl-badge-dim",
  };

  return (
    <Layout>
      <div className="animate-fade-in space-y-6">
        {/* Header */}
        <div className="flex items-end justify-between">
          <div>
            <h1 className="hrl-title text-5xl mb-1">LIBRARY</h1>
            <p className="hrl-label text-muted-foreground">
              {tracks.length} track{tracks.length !== 1 ? "s" : ""} · stored on VPS
            </p>
          </div>
          <div className="flex gap-2">
            <input
              type="file"
              ref={fileInputRef}
              className="hidden"
              accept="audio/*"
              onChange={handleUpload}
            />
            <Button
              className="hrl-btn-primary"
              onClick={() => fileInputRef.current?.click()}
              disabled={isUploading}
            >
              {isUploading ? <Loader2 className="w-3.5 h-3.5 animate-spin mr-2" /> : <Upload className="w-3.5 h-3.5 mr-2" />}
              Upload to VPS
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="hrl-label border-dashed border-red-500/30 text-red-400 hover:bg-red-500/10"
              onClick={() => window.location.href = "/drive"}
            >
              <HardDrive className="w-3.5 h-3.5 mr-1.5" />
              Import from Drive
            </Button>
          </div>
        </div>

        {/* Filters */}
        <div className="flex gap-3 flex-wrap">
          <div className="relative flex-1 min-w-[200px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
            <Input
              placeholder="Search tracks…"
              className="pl-9 h-9 text-sm"
              value={search}
              onChange={e => setSearch(e.target.value)}
            />
          </div>
          <Select value={clearanceFilter} onValueChange={setClearanceFilter}>
            <SelectTrigger className="w-[150px] h-9 text-sm">
              <SelectValue placeholder="Clearance" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Status</SelectItem>
              <SelectItem value="cleared_ready">Cleared</SelectItem>
              <SelectItem value="in_progress">In Progress</SelectItem>
              <SelectItem value="not_cleared">Not Cleared</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* Track Table */}
        {isLoading ? (
          <div className="flex items-center justify-center py-16 gap-2 text-muted-foreground">
            <Loader2 className="w-4 h-4 animate-spin" />
            <span className="hrl-label">Loading tracks…</span>
          </div>
        ) : tracks.length === 0 ? (
          <div className="text-center py-20">
            <Music2 className="w-10 h-10 mx-auto mb-4 text-muted-foreground opacity-30" />
            <p className="hrl-title text-2xl text-muted-foreground mb-2">EMPTY LIBRARY</p>
            <p className="hrl-label text-muted-foreground mb-4">Upload audio files to VPS to get started</p>
            <Button className="hrl-btn-primary" onClick={() => fileInputRef.current?.click()}>
              <Plus className="w-3.5 h-3.5 mr-2" /> Start Uploading
            </Button>
          </div>
        ) : (
          <div className="hrl-card overflow-hidden">
            <div className="grid px-4 py-2 border-b border-border" style={{ gridTemplateColumns: "32px 1fr 120px 80px 80px 80px 40px" }}>
              {["#", "TRACK", "CLEARANCE", "BPM", "KEY", "DURATION", ""].map(h => (
                <span key={h} className="hrl-label text-muted-foreground">{h}</span>
              ))}
            </div>

            {tracks.map((track, i) => {
              const isActive = player.track?.id === track.id;
              return (
                <div
                  key={track.id}
                  className={cn(
                    "grid items-center px-4 py-3 border-b border-border/50 last:border-0 cursor-pointer group transition-colors",
                    "hover:bg-white/3",
                    isActive && "bg-red-500/8"
                  )}
                  style={{ gridTemplateColumns: "32px 1fr 120px 80px 80px 80px 40px" }}
                  onClick={() => handlePlay(track)}
                >
                  <div className="w-8 flex items-center justify-center">
                    {isActive && player.isPlaying ? (
                      <span className="flex gap-0.5">
                        {[1, 2, 3].map(b => (
                          <span key={b} className={`w-0.5 bg-red-500 rounded-full animate-pulse-red`} style={{ height: `${8 + b * 3}px`, animationDelay: `${b * 0.15}s` }} />
                        ))}
                      </span>
                    ) : (
                      <>
                        <span className={cn("hrl-label text-muted-foreground group-hover:hidden", isActive && "hidden")}>
                          {String(i + 1).padStart(2, "0")}
                        </span>
                        <Play className={cn("w-3.5 h-3.5 text-red-400 hidden group-hover:block", isActive && "block")} />
                      </>
                    )}
                  </div>

                  <div className="min-w-0 pr-3">
                    <p className={cn("text-sm font-medium truncate", isActive && "text-red-400")}>{track.title}</p>
                    <p className="hrl-label text-muted-foreground truncate">{track.artist}</p>
                    <div className="flex gap-1 mt-1">
                      <span className="hrl-badge-dim text-[10px] opacity-60 uppercase">{track.source}</span>
                      {track.track_genres?.length > 0 && track.track_genres.slice(0, 1).map((g: any) => (
                        <span key={g.genre} className="hrl-badge-dim">{g.genre}</span>
                      ))}
                    </div>
                  </div>

                  <span className={CLEARANCE_COLOR[track.clearance_status ?? "not_cleared"]}>
                    {CLEARANCE_LABEL[track.clearance_status ?? "not_cleared"]}
                  </span>

                  <span className="mono text-sm text-muted-foreground">{track.bpm ?? "—"}</span>
                  <span className="mono text-sm text-muted-foreground">{track.key ?? "—"}</span>
                  <span className="mono text-sm text-muted-foreground">{fmt(track.duration)}</span>

                  <DropdownMenu>
                    <DropdownMenuTrigger asChild onClick={e => e.stopPropagation()}>
                      <Button variant="ghost" size="icon" className="w-7 h-7 opacity-0 group-hover:opacity-100">
                        <MoreVertical className="w-3.5 h-3.5" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem onClick={() => window.location.href = `/library/${track.id}`}>
                        View details
                      </DropdownMenuItem>
                      {track.google_drive_file_id && (
                        <DropdownMenuItem
                          onClick={() => window.open(`https://drive.google.com/file/d/${track.google_drive_file_id}/view`, "_blank")}
                        >
                          <ExternalLink className="w-3.5 h-3.5 mr-2" /> Open in Drive
                        </DropdownMenuItem>
                      )}
                      <DropdownMenuItem
                        className="text-destructive focus:text-destructive"
                        onClick={() => { if (confirm("Remove from library?")) deleteMutation.mutate(track.id); }}
                      >
                        Remove
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </Layout>
  );
}
