import { useEffect, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useInfiniteQuery, useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Search, Play, MoreVertical, Loader2, Upload, Plus, Music2, ListPlus,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
  DropdownMenuSub, DropdownMenuSubTrigger, DropdownMenuSubContent, DropdownMenuPortal,
} from "@/components/ui/dropdown-menu";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import Layout from "@/components/Layout";
import { usePlayer } from "@/components/player/PlayerProvider";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { api, streamUrl } from "@/lib/api";

function fmtDur(s: number | null) {
  if (!s) return "—";
  return `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}`;
}
function fmtBytes(n: number) {
  if (!n) return "0 MB";
  const gb = n / 1073741824;
  if (gb >= 1) return `${gb.toFixed(2)} GB`;
  return `${(n / 1048576).toFixed(0)} MB`;
}

const CLEARANCE_LABEL: Record<string, string> = {
  cleared_ready: "Cleared", in_progress: "In progress", not_cleared: "Not cleared",
};

export default function Library() {
  const qc = useQueryClient();
  const player = usePlayer();
  const navigate = useNavigate();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [params, setParams] = useSearchParams();
  const [search, setSearch] = useState(params.get("q") ?? "");
  const [debounced, setDebounced] = useState(search);
  const [clearanceFilter, setClearanceFilter] = useState("all");
  const [uploadProg, setUploadProg] = useState<{ done: number; total: number } | null>(null);
  const sentinel = useRef<HTMLDivElement>(null);

  // Sidebar search writes ?q= — follow it.
  useEffect(() => { const q = params.get("q") ?? ""; setSearch(q); setDebounced(q); }, [params]);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(search), 250);
    return () => clearTimeout(t);
  }, [search]);

  const PAGE = 100;
  const tracksQuery = useInfiniteQuery({
    queryKey: ["tracks", debounced, clearanceFilter],
    initialPageParam: 1,
    queryFn: ({ pageParam }) => api.get<{ tracks: any[]; total: number; page: number }>("/api/tracks", {
      search: debounced || undefined,
      clearance: clearanceFilter !== "all" ? clearanceFilter : undefined,
      page: pageParam, limit: PAGE,
    }),
    getNextPageParam: (last, all) => (all.length * PAGE < last.total ? last.page + 1 : undefined),
  });
  const { isLoading, hasNextPage, fetchNextPage, isFetchingNextPage } = tracksQuery;
  const tracks = tracksQuery.data?.pages.flatMap((p) => p.tracks) ?? [];
  const total = tracksQuery.data?.pages[0]?.total ?? 0;

  // Load the next page when the bottom of the list scrolls into view.
  useEffect(() => {
    const el = sentinel.current;
    if (!el) return;
    const io = new IntersectionObserver((e) => {
      if (e[0].isIntersecting && hasNextPage && !isFetchingNextPage) fetchNextPage();
    }, { rootMargin: "600px" });
    io.observe(el);
    return () => io.disconnect();
  }, [hasNextPage, isFetchingNextPage, fetchNextPage, tracks.length]);

  const { data: storage } = useQuery<{ driver: string; bucket: string; localFiles: number; localBytes: number; totalTracks: number; maxUploadBytes: number }>({
    queryKey: ["tracks-storage"],
    queryFn: () => api.get("/api/tracks/storage"),
  });

  const { data: playlists = [] } = useQuery<any[]>({
    queryKey: ["playlists"],
    queryFn: () => api.get("/api/playlists"),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => api.delete(`/api/tracks/${id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["tracks"] });
      qc.invalidateQueries({ queryKey: ["tracks-storage"] });
      toast.success("Track removed");
    },
    onError: (e: any) => toast.error(e.message || "Failed to delete track"),
  });

  const addToPlaylist = useMutation({
    mutationFn: ({ playlistId, trackId }: { playlistId: string; trackId: string }) =>
      api.post(`/api/playlists/${playlistId}/tracks`, { track_id: trackId }),
    onSuccess: () => toast.success("Added to playlist"),
    onError: (e: any) => toast.error(e.message || "Could not add to playlist"),
  });

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []);
    if (!files.length) return;
    setUploadProg({ done: 0, total: files.length });
    let ok = 0;
    for (const file of files) {
      const fd = new FormData();
      fd.append("file", file);
      try {
        await api.upload("/api/tracks/upload", fd);
        ok++;
      } catch (err) {
        toast.error(`${file.name}: ${(err as Error).message}`);
      }
      setUploadProg({ done: ok, total: files.length });
    }
    setUploadProg(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
    qc.invalidateQueries({ queryKey: ["tracks"] });
    qc.invalidateQueries({ queryKey: ["tracks-storage"] });
    if (ok) toast.success(`Uploaded ${ok} file${ok !== 1 ? "s" : ""} to the VPS library`);
  };

  const handlePlay = (track: any) => {
    const queue = tracks
      .filter((t) => t.local_file_path)
      .map((t) => ({
        id: t.id, title: t.title, artist: t.artist,
        fileUrl: streamUrl(t.id), duration: t.duration, bpm: t.bpm, key: t.key,
      }));
    player.play(
      { id: track.id, title: track.title, artist: track.artist, fileUrl: streamUrl(track.id), duration: track.duration, bpm: track.bpm, key: track.key },
      queue
    );
  };

  return (
    <Layout>
      <div className="animate-fade-in space-y-6">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="hrl-title">Library</h1>
            <p className="text-sm text-muted-foreground">
              {isLoading ? "Loading…" : debounced || clearanceFilter !== "all"
                ? `${total} matching track${total !== 1 ? "s" : ""}`
                : `${total} track${total !== 1 ? "s" : ""}`}
              {storage ? ` · ${fmtBytes(storage.localBytes)} of audio` : ""}
            </p>
          </div>
          <div className="flex gap-2">
            <input type="file" ref={fileInputRef} className="hidden" accept="audio/*" multiple onChange={handleUpload} />
            <Button className="hrl-btn-primary" onClick={() => fileInputRef.current?.click()} disabled={!!uploadProg}>
              {uploadProg
                ? <><Loader2 className="w-4 h-4 animate-spin mr-2" /> Uploading {uploadProg.done}/{uploadProg.total}…</>
                : <><Upload className="w-4 h-4 mr-2" /> Upload audio</>}
            </Button>
          </div>
        </div>

        <div className="flex gap-3 flex-wrap">
          <div className="relative flex-1 min-w-[200px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              placeholder="Search by title, artist or composer…" className="pl-9 h-10" value={search}
              onChange={(e) => { setSearch(e.target.value); if (params.get("q")) setParams({}, { replace: true }); }}
              aria-label="Search tracks"
            />
          </div>
          <Select value={clearanceFilter} onValueChange={setClearanceFilter}>
            <SelectTrigger className="w-[170px] h-10"><SelectValue placeholder="Clearance" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All clearance</SelectItem>
              <SelectItem value="cleared_ready">Cleared</SelectItem>
              <SelectItem value="in_progress">In progress</SelectItem>
              <SelectItem value="not_cleared">Not cleared</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {isLoading ? (
          <div className="flex items-center justify-center py-16 gap-2 text-muted-foreground">
            <Loader2 className="w-4 h-4 animate-spin" /><span className="text-sm">Loading tracks…</span>
          </div>
        ) : tracks.length === 0 ? (
          <div className="hrl-card text-center py-16 px-6">
            <Music2 className="w-10 h-10 mx-auto mb-4 text-muted-foreground opacity-40" />
            {debounced || clearanceFilter !== "all" ? (
              <p className="text-muted-foreground">No tracks match these filters.</p>
            ) : (
              <>
                <p className="text-lg font-semibold mb-1">Your library is empty</p>
                <p className="text-sm text-muted-foreground mb-5">Upload audio files to start building the catalog.</p>
                <Button className="hrl-btn-primary" onClick={() => fileInputRef.current?.click()}>
                  <Plus className="w-4 h-4 mr-2" /> Upload audio
                </Button>
              </>
            )}
          </div>
        ) : (
          <div className="hrl-card overflow-hidden">
            <div className="hidden md:grid gap-4 px-4 py-2.5 border-b border-border text-xs font-medium text-muted-foreground lib-grid">
              <span className="text-center">#</span><span>Track</span><span>Clearance</span><span>BPM</span><span>Key</span><span className="text-right">Length</span><span />
            </div>

            {tracks.map((track, i) => {
              const isActive = player.track?.id === track.id;
              const clearance = track.clearance_status ?? "not_cleared";
              return (
                <div
                  key={track.id}
                  className={cn(
                    "grid items-center gap-3 md:gap-4 px-3 md:px-4 py-2.5 border-b border-border/60 last:border-0 cursor-pointer group transition-colors hover:bg-white/[0.03] lib-grid",
                    isActive && "bg-violet-500/10"
                  )}
                  onClick={() => handlePlay(track)}
                >
                  <div className="w-8 h-8 flex items-center justify-center">
                    {isActive && player.isPlaying ? (
                      <span className="flex gap-0.5 items-end h-3.5">
                        {[1, 2, 3].map((b) => (
                          <span key={b} className="w-0.5 bg-violet-400 rounded-full animate-pulse-red" style={{ height: `${6 + b * 3}px`, animationDelay: `${b * 0.15}s` }} />
                        ))}
                      </span>
                    ) : (
                      <>
                        <span className={cn("text-xs text-muted-foreground tabular-nums group-hover:hidden", isActive && "hidden")}>{i + 1}</span>
                        <Play className={cn("w-4 h-4 text-violet-300 hidden group-hover:block", isActive && "block")} />
                      </>
                    )}
                  </div>

                  <div className="min-w-0">
                    <p className={cn("text-sm font-medium truncate", isActive && "text-violet-300")}>{track.title}</p>
                    <p className="text-xs text-muted-foreground truncate">
                      {track.artist}
                      <span className="md:hidden">{[track.bpm && `${track.bpm} BPM`, track.key, fmtDur(track.duration)].filter(Boolean).map((x) => ` · ${x}`).join("")}</span>
                    </p>
                  </div>

                  <span className={cn("hidden md:inline-flex", clearance === "cleared_ready" ? "hrl-badge-ok" : clearance === "in_progress" ? "hrl-badge-warn" : "hrl-badge-dim")}>
                    {CLEARANCE_LABEL[clearance]}
                  </span>
                  <span className="hidden md:block text-sm text-muted-foreground tabular-nums">{track.bpm ?? "—"}</span>
                  <span className="hidden md:block text-sm text-muted-foreground">{track.key ?? "—"}</span>
                  <span className="hidden md:block text-sm text-muted-foreground tabular-nums text-right">{fmtDur(track.duration)}</span>

                  <DropdownMenu>
                    <DropdownMenuTrigger asChild onClick={(e) => e.stopPropagation()}>
                      <Button variant="ghost" size="icon" className="w-8 h-8 md:opacity-0 md:group-hover:opacity-100 focus:opacity-100" aria-label="Track actions">
                        <MoreVertical className="w-4 h-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" onClick={(e) => e.stopPropagation()}>
                      <DropdownMenuItem onClick={() => navigate(`/library/${track.id}`)}>View details</DropdownMenuItem>
                      <DropdownMenuItem onClick={() => navigate(`/library/${track.id}?edit=1`)}>Edit metadata</DropdownMenuItem>
                      <DropdownMenuSub>
                        <DropdownMenuSubTrigger><ListPlus className="w-4 h-4 mr-2" /> Add to playlist</DropdownMenuSubTrigger>
                        <DropdownMenuPortal>
                          <DropdownMenuSubContent>
                            {playlists.length === 0 ? (
                              <DropdownMenuItem disabled>No playlists yet</DropdownMenuItem>
                            ) : (
                              playlists.map((pl) => (
                                <DropdownMenuItem key={pl.id} onClick={() => addToPlaylist.mutate({ playlistId: pl.id, trackId: track.id })}>
                                  {pl.name}
                                </DropdownMenuItem>
                              ))
                            )}
                          </DropdownMenuSubContent>
                        </DropdownMenuPortal>
                      </DropdownMenuSub>
                      <DropdownMenuItem
                        className="text-destructive focus:text-destructive"
                        onClick={() => { if (confirm("Remove from library? This deletes the audio file too.")) deleteMutation.mutate(track.id); }}
                      >
                        Remove
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              );
            })}
            <div ref={sentinel} className="flex items-center justify-center gap-2 py-4 text-sm text-muted-foreground">
              {isFetchingNextPage ? <><Loader2 className="w-4 h-4 animate-spin" /> Loading more…</>
                : hasNextPage ? <button className="hover:text-foreground" onClick={() => fetchNextPage()}>Load more</button>
                : `Showing all ${tracks.length} tracks`}
            </div>
          </div>
        )}
      </div>
    </Layout>
  );
}
