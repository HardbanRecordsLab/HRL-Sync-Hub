import { useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  ArrowLeft, Edit2, Save, X, ExternalLink, Play, Pause,
  Music2, Loader2, Plus, Trash2, Check
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import Layout from "@/components/Layout";
import { api, streamUrl } from "@/lib/api";
import { useAudioPlayer } from "@/hooks/useAudioPlayer";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

const CLEARANCE_OPTIONS = [
  { v: "cleared_ready", l: "Cleared & Ready" },
  { v: "in_progress",   l: "In Progress" },
  { v: "not_cleared",   l: "Not Cleared" },
];

const GENRE_OPTIONS = ["Electronic","Hip-Hop","Pop","Rock","Ambient","Classical","Jazz","R&B","Folk","Country","Metal","World"];
const MOOD_OPTIONS  = ["Uplifting","Dark","Tense","Romantic","Epic","Calm","Energetic","Melancholic","Playful","Mysterious"];

export default function TrackDetail() {
  const { trackId } = useParams<{ trackId: string }>();
  const navigate     = useNavigate();
  const qc           = useQueryClient();
  const player       = useAudioPlayer();
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState<any>({});

  const { data: track, isLoading } = useQuery({
    queryKey: ["track", trackId],
    queryFn:  () => api.get<any>(`/api/tracks/${trackId}`),
    onSuccess: (t: any) => {
      if (!editing) setForm({
        title: t.title, artist: t.artist, composer: t.composer ?? "",
        bpm: t.bpm ?? "", key: t.key ?? "", description: t.description ?? "",
        clearance_status: t.clearance_status, rights_type: t.rights_type ?? "",
      });
    },
  });

  const saveMut = useMutation({
    mutationFn: () => api.patch(`/api/tracks/${trackId}`, form),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["track", trackId] });
      qc.invalidateQueries({ queryKey: ["tracks"] });
      setEditing(false);
      toast.success("Track updated");
    },
    onError: (e: any) => toast.error(e.message),
  });

  const genresMut = useMutation({
    mutationFn: (genres: string[]) =>
      api.post(`/api/tracks/${trackId}/genres`, { genres: genres.map(g => ({ genre: g })) }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["track", trackId] }),
  });

  const moodsMut = useMutation({
    mutationFn: (moods: string[]) => api.post(`/api/tracks/${trackId}/moods`, { moods }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["track", trackId] }),
  });

  if (isLoading) return (
    <Layout>
      <div className="flex items-center justify-center py-24 gap-2 text-muted-foreground">
        <Loader2 className="w-4 h-4 animate-spin" /><span className="hrl-label">Loading track…</span>
      </div>
    </Layout>
  );

  if (!track) return (
    <Layout>
      <div className="text-center py-24">
        <p className="hrl-title text-2xl text-muted-foreground">TRACK NOT FOUND</p>
        <Button variant="ghost" className="mt-4" onClick={() => navigate("/library")}>← Back to Library</Button>
      </div>
    </Layout>
  );

  const isActive = player.track?.id === track.id;
  const streamURL = track.google_drive_file_id ? streamUrl(track.google_drive_file_id) : null;

  const toggleGenre = (g: string) => {
    const curr = track.track_genres?.map((x: any) => x.genre) ?? [];
    genresMut.mutate(curr.includes(g) ? curr.filter((x: string) => x !== g) : [...curr, g]);
  };

  const toggleMood = (m: string) => {
    const curr = track.track_moods ?? [];
    moodsMut.mutate(curr.includes(m) ? curr.filter((x: string) => x !== m) : [...curr, m]);
  };

  return (
    <Layout>
      <div className="animate-fade-in space-y-6 max-w-4xl">
        {/* Back + header */}
        <div className="flex items-center gap-4">
          <button onClick={() => navigate("/library")} className="text-muted-foreground hover:text-foreground transition">
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div className="flex-1 min-w-0">
            {editing ? (
              <div className="flex gap-3">
                <Input value={form.title} onChange={e => setForm((f: any) => ({ ...f, title: e.target.value }))} className="text-2xl font-bold h-auto py-1 text-foreground" />
                <Input value={form.artist} onChange={e => setForm((f: any) => ({ ...f, artist: e.target.value }))} className="h-auto py-1" placeholder="Artist" />
              </div>
            ) : (
              <>
                <h1 className="hrl-title text-4xl leading-tight">{track.title}</h1>
                <p className="hrl-label text-muted-foreground mt-1">{track.artist}</p>
              </>
            )}
          </div>
          <div className="flex items-center gap-2">
            {streamURL && (
              <button
                onClick={() => player.play({ id: track.id, title: track.title, artist: track.artist, fileUrl: streamURL, bpm: track.bpm, key: track.key })}
                className={cn(
                  "w-10 h-10 rounded-full flex items-center justify-center transition",
                  isActive && player.isPlaying ? "bg-red-500/20 text-red-400" : "bg-red-500 text-white hover:bg-red-400"
                )}
              >
                {isActive && player.isPlaying ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4 ml-0.5" />}
              </button>
            )}
            {track.google_drive_file_id && (
              <a
                href={`https://drive.google.com/file/d/${track.google_drive_file_id}/view`}
                target="_blank" rel="noreferrer"
                className="p-2 rounded text-muted-foreground hover:text-foreground hover:bg-white/5 transition"
              >
                <ExternalLink className="w-4 h-4" />
              </a>
            )}
            {editing ? (
              <>
                <Button size="sm" className="hrl-btn-primary h-8 text-xs" onClick={() => saveMut.mutate()} disabled={saveMut.isPending}>
                  {saveMut.isPending ? <Loader2 className="w-3 h-3 animate-spin mr-1" /> : <Save className="w-3 h-3 mr-1" />}Save
                </Button>
                <Button variant="ghost" size="sm" className="h-8 text-xs" onClick={() => setEditing(false)}><X className="w-3 h-3" /></Button>
              </>
            ) : (
              <Button variant="outline" size="sm" className="h-8 text-xs hrl-label" onClick={() => setEditing(true)}>
                <Edit2 className="w-3 h-3 mr-1.5" />Edit
              </Button>
            )}
          </div>
        </div>

        <div className="grid md:grid-cols-3 gap-4">
          {/* Metadata */}
          <div className="md:col-span-2 space-y-4">
            <div className="hrl-card p-5">
              <h2 className="hrl-title text-xl mb-4">METADATA</h2>
              <div className="grid grid-cols-2 gap-4">
                {[
                  { label: "BPM", key: "bpm", type: "number" },
                  { label: "Key", key: "key", type: "text" },
                  { label: "Composer", key: "composer", type: "text" },
                  { label: "ISRC", key: "isrc", type: "text" },
                ].map(({ label, key, type }) => (
                  <div key={key}>
                    <p className="hrl-label text-muted-foreground mb-1">{label}</p>
                    {editing ? (
                      <Input type={type} value={form[key] ?? ""} onChange={e => setForm((f: any) => ({ ...f, [key]: e.target.value }))} className="h-8 text-sm" />
                    ) : (
                      <p className="text-sm font-medium mono">{(track as any)[key] ?? "—"}</p>
                    )}
                  </div>
                ))}
                <div>
                  <p className="hrl-label text-muted-foreground mb-1">Clearance</p>
                  {editing ? (
                    <Select value={form.clearance_status} onValueChange={v => setForm((f: any) => ({ ...f, clearance_status: v }))}>
                      <SelectTrigger className="h-8 text-sm"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {CLEARANCE_OPTIONS.map(o => <SelectItem key={o.v} value={o.v}>{o.l}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  ) : (
                    <span className={track.clearance_status === "cleared_ready" ? "hrl-badge-red" : "hrl-badge-dim"}>
                      {CLEARANCE_OPTIONS.find(o => o.v === track.clearance_status)?.l ?? "—"}
                    </span>
                  )}
                </div>
                <div>
                  <p className="hrl-label text-muted-foreground mb-1">Duration</p>
                  <p className="text-sm font-medium mono">
                    {track.duration ? `${Math.floor(track.duration/60)}:${String(track.duration%60).padStart(2,"0")}` : "—"}
                  </p>
                </div>
              </div>
              {(editing || track.description) && (
                <div className="mt-4">
                  <p className="hrl-label text-muted-foreground mb-1">Description</p>
                  {editing ? (
                    <Textarea value={form.description} onChange={e => setForm((f: any) => ({ ...f, description: e.target.value }))} rows={3} className="text-sm" />
                  ) : (
                    <p className="text-sm text-muted-foreground">{track.description}</p>
                  )}
                </div>
              )}
            </div>

            {/* Genres */}
            <div className="hrl-card p-5">
              <h2 className="hrl-title text-xl mb-4">GENRES</h2>
              <div className="flex flex-wrap gap-2">
                {GENRE_OPTIONS.map(g => {
                  const active = track.track_genres?.some((x: any) => x.genre === g);
                  return (
                    <button
                      key={g}
                      onClick={() => toggleGenre(g)}
                      className={cn("px-3 py-1 rounded text-xs transition", active ? "hrl-badge-red" : "hrl-badge-dim hover:border-red-500/30")}
                    >
                      {active && <Check className="w-2.5 h-2.5 inline mr-1" />}{g}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Moods */}
            <div className="hrl-card p-5">
              <h2 className="hrl-title text-xl mb-4">MOODS</h2>
              <div className="flex flex-wrap gap-2">
                {MOOD_OPTIONS.map(m => {
                  const active = track.track_moods?.includes(m);
                  return (
                    <button
                      key={m}
                      onClick={() => toggleMood(m)}
                      className={cn("px-3 py-1 rounded text-xs transition", active ? "hrl-badge-red" : "hrl-badge-dim hover:border-red-500/30")}
                    >
                      {active && <Check className="w-2.5 h-2.5 inline mr-1" />}{m}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>

          {/* Sidebar */}
          <div className="space-y-4">
            {/* Linked lyrics */}
            <div className="hrl-card p-4">
              <h2 className="hrl-title text-lg mb-3">LYRICS</h2>
              {track.lyrics?.length > 0 ? (
                <div className="space-y-1.5">
                  {track.lyrics.map((l: any) => (
                    <a key={l.id} href={`/lyrics`} className="flex items-center gap-2 text-sm hover:text-foreground text-muted-foreground transition">
                      <span className="hrl-badge-dim">{l.status}</span>{l.title}
                    </a>
                  ))}
                </div>
              ) : (
                <p className="hrl-label text-muted-foreground">No lyrics linked</p>
              )}
              <Button
                variant="ghost" size="sm"
                className="w-full mt-3 h-7 text-xs hrl-label"
                onClick={() => navigate(`/lyrics`)}
              >
                <Plus className="w-3 h-3 mr-1" /> Add Lyrics
              </Button>
            </div>

            {/* Versions */}
            <div className="hrl-card p-4">
              <h2 className="hrl-title text-lg mb-3">VERSIONS</h2>
              {track.track_versions?.length > 0 ? (
                <div className="space-y-1.5">
                  {track.track_versions.map((v: any) => (
                    <div key={v.id} className="flex items-center gap-2 text-sm">
                      <span className="hrl-badge-dim">{v.version_type}</span>
                      <span className="text-muted-foreground truncate">{v.file_name}</span>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="hrl-label text-muted-foreground">No alternate versions</p>
              )}
            </div>

            {/* Rights */}
            {track.track_rights?.length > 0 && (
              <div className="hrl-card p-4">
                <h2 className="hrl-title text-lg mb-3">RIGHTS</h2>
                <div className="space-y-2">
                  {track.track_rights.map((r: any) => (
                    <div key={r.id} className="text-xs">
                      <div className="flex items-center justify-between">
                        <span className="font-medium">{r.name}</span>
                        <span className="hrl-badge-dim">{r.percentage}%</span>
                      </div>
                      <p className="hrl-label text-muted-foreground">{r.role}{r.pro_organization ? ` · ${r.pro_organization}` : ""}</p>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </Layout>
  );
}
