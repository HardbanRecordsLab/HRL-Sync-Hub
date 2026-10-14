import { useEffect, useState } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, Edit2, Loader2, Pause, Play, Plus, Save, Sparkles, Tag, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import Layout from "@/components/Layout";
import { api, streamUrl } from "@/lib/api";
import { usePlayer } from "@/components/player/PlayerProvider";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

const CLEARANCE_OPTIONS = [
  { v: "cleared_ready", l: "Cleared" },
  { v: "in_progress", l: "In progress" },
  { v: "not_cleared", l: "Not cleared" },
];
const KEYS = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];

type Meta = {
  keywords?: string[]; useCases?: string[]; instrumentation?: string[]; additionalGenres?: string[]; similarArtists?: string[];
  targetAudience?: string; hasVocals?: boolean; musicalEra?: string; productionQuality?: string; publisher?: string;
  vocalStyle?: { gender?: string; timbre?: string; delivery?: string; emotionalTone?: string }; confidence?: number; analysisVersion?: string;
};

const list = (v?: string[]) => (v ?? []).join(", ");
const parseList = (v: string) => v.split(/[,\n]/).map((x) => x.trim()).filter(Boolean);
const fmtDur = (s?: number | null) => (s ? `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}` : "—");
const fmtSize = (b?: number | null) => (b ? `${(b / 1048576).toFixed(1)} MB` : "—");

function formFrom(t: any) {
  const m: Meta = t.metadata ?? {};
  return {
    title: t.title ?? "", artist: t.artist ?? "", album: t.album ?? "", year: t.year ?? "", composer: t.composer ?? "",
    isrc: t.isrc ?? "", iswc: t.iswc ?? "", catalog_number: t.catalog_number ?? "", bpm: t.bpm ?? "", key: t.key ?? "",
    genre: t.genre ?? "", description: t.description ?? "", clearance_status: t.clearance_status ?? "not_cleared",
    explicit: !!t.explicit, moods: list(t.track_moods), mood_vibe: t.mood_vibe ?? "", energy_level: t.energy_level ?? "",
    keywords: list(m.keywords), useCases: (m.useCases ?? []).join("\n"), instrumentation: list(m.instrumentation),
    additionalGenres: list(m.additionalGenres), targetAudience: m.targetAudience ?? "", hasVocals: m.hasVocals ?? false,
  };
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="min-w-0">
      <p className="text-xs text-muted-foreground mb-1">{label}</p>
      <div className="text-sm">{children}</div>
    </div>
  );
}

function Chips({ items, tone = "dim" }: { items?: string[]; tone?: "dim" | "brand" }) {
  if (!items?.length) return <span className="text-muted-foreground">—</span>;
  return (
    <div className="flex flex-wrap gap-1.5">
      {items.map((x) => <span key={x} className={tone === "brand" ? "hrl-badge-red" : "hrl-badge-dim"}>{x}</span>)}
    </div>
  );
}

export default function TrackDetail() {
  const { trackId } = useParams<{ trackId: string }>();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const qc = useQueryClient();
  const player = usePlayer();
  const [editing, setEditing] = useState(searchParams.get("edit") === "1");
  const [form, setForm] = useState<ReturnType<typeof formFrom> | null>(null);

  const { data: track, isLoading, isError } = useQuery({
    queryKey: ["track", trackId],
    queryFn: () => api.get<any>(`/api/tracks/${trackId}`),
  });
  const { data: similar = [] } = useQuery({
    queryKey: ["tracks", "similar", trackId],
    queryFn: async () => (await api.get<{ tracks: any[] }>(`/api/tracks/public/similar/${trackId}`)).tracks.slice(0, 8),
    enabled: !!track?.is_public,
    retry: false,
  });

  // Seed the form from the loaded track — also when the page opens straight in edit mode
  // (Library "…" → Edit metadata). Previously it only seeded outside edit mode, so that path showed empty fields.
  useEffect(() => {
    if (track && (!editing || !form)) setForm(formFrom(track));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [track]);

  useEffect(() => {
    if (searchParams.get("edit") === "1") {
      searchParams.delete("edit");
      setSearchParams(searchParams, { replace: true });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const set = (k: string, v: unknown) => setForm((f) => (f ? { ...f, [k]: v } : f));

  const saveMut = useMutation({
    mutationFn: () => {
      const f = form!;
      return api.patch(`/api/tracks/${trackId}`, {
        title: f.title, artist: f.artist, album: f.album, year: f.year, composer: f.composer, isrc: f.isrc, iswc: f.iswc,
        catalog_number: f.catalog_number, bpm: f.bpm, key: f.key, genre: f.genre, description: f.description,
        clearance_status: f.clearance_status, explicit: f.explicit, moods: parseList(f.moods), mood_vibe: f.mood_vibe,
        energy_level: f.energy_level, keywords: parseList(f.keywords), useCases: f.useCases.split("\n").map((x) => x.trim()).filter(Boolean),
        instrumentation: parseList(f.instrumentation), additionalGenres: parseList(f.additionalGenres),
        targetAudience: f.targetAudience, hasVocals: f.hasVocals,
      });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["track", trackId] });
      qc.invalidateQueries({ queryKey: ["tracks"] });
      setEditing(false);
      toast.success("Saved");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const aiMut = useMutation({
    mutationFn: () => api.post<any>(`/api/ai/analyze-track/${trackId}`, {}),
    onSuccess: async (data: any) => {
      const moods = Array.isArray(data?.moods) ? data.moods : [];
      const genre = Array.isArray(data?.genres) ? data.genres[0] : undefined;
      if (moods.length || genre) await api.patch(`/api/tracks/${trackId}`, { ...(moods.length ? { moods } : {}), ...(genre ? { genre } : {}) });
      qc.invalidateQueries({ queryKey: ["track", trackId] });
      toast.success("AI suggestions applied — check genre and moods.");
    },
    onError: (e: Error) => toast.error("AI: " + e.message),
  });

  // Embeds the catalogue metadata as real ID3/Vorbis tags in the stored file (via Metadata Engine).
  const tagMut = useMutation({
    mutationFn: () => api.post<any>(`/api/tracks/${trackId}/tag-via-metadata-engine`),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["track", trackId] }); toast.success("File tags updated via Metadata Engine."); },
    onError: (e: Error) => toast.error("Tagging failed: " + e.message),
  });

  if (isLoading) return (
    <Layout>
      <div className="flex items-center justify-center py-24 gap-2 text-muted-foreground"><Loader2 className="w-4 h-4 animate-spin" />Loading track…</div>
    </Layout>
  );
  if (isError || !track) return (
    <Layout>
      <div className="text-center py-24">
        <p className="text-xl font-semibold text-muted-foreground">Track not found</p>
        <Button variant="ghost" className="mt-4" onClick={() => navigate("/library")}>← Back to library</Button>
      </div>
    </Layout>
  );

  const m: Meta = track.metadata ?? {};
  const isActive = player.track?.id === track.id;
  const playable = !!track.local_file_path;
  const f = form ?? formFrom(track);
  const E = editing;

  return (
    <Layout>
      <div className="animate-fade-in space-y-6 max-w-6xl">
        <div className="flex flex-wrap items-start gap-4">
          <button onClick={() => navigate("/library")} className="mt-1 text-muted-foreground hover:text-foreground" aria-label="Back to library">
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div className="flex-1 min-w-[240px]">
            {E ? (
              <div className="grid sm:grid-cols-2 gap-2">
                <Input value={f.title} onChange={(e) => set("title", e.target.value)} placeholder="Title" className="text-lg font-semibold" />
                <Input value={f.artist} onChange={(e) => set("artist", e.target.value)} placeholder="Artist" />
              </div>
            ) : (
              <>
                <h1 className="hrl-title">{track.title}</h1>
                <p className="text-sm text-muted-foreground">{[track.artist, track.album, track.year].filter(Boolean).join(" · ")}</p>
              </>
            )}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {playable && (
              <button
                onClick={() => (isActive ? player.toggle() : player.play({ id: track.id, title: track.title, artist: track.artist, fileUrl: streamUrl(track.id), bpm: track.bpm, key: track.key, duration: track.duration }))}
                className={cn("w-10 h-10 rounded-full flex items-center justify-center", isActive && player.isPlaying ? "bg-violet-500/20 text-violet-300" : "bg-violet-500 text-white hover:bg-violet-400")}
                aria-label={isActive && player.isPlaying ? "Pause" : "Play"}
              >
                {isActive && player.isPlaying ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4 ml-0.5" />}
              </button>
            )}
            {E ? (
              <>
                <Button className="hrl-btn-primary h-9" onClick={() => saveMut.mutate()} disabled={saveMut.isPending}>
                  {saveMut.isPending ? <Loader2 className="w-4 h-4 animate-spin mr-1.5" /> : <Save className="w-4 h-4 mr-1.5" />}Save
                </Button>
                <Button variant="ghost" className="h-9" onClick={() => { setEditing(false); setForm(formFrom(track)); }}><X className="w-4 h-4 mr-1" />Cancel</Button>
              </>
            ) : (
              <Button variant="outline" className="h-9" onClick={() => { setForm(formFrom(track)); setEditing(true); }}><Edit2 className="w-4 h-4 mr-1.5" />Edit</Button>
            )}
            <Button variant="outline" className="h-9" onClick={() => aiMut.mutate()} disabled={aiMut.isPending || E}>
              {aiMut.isPending ? <Loader2 className="w-4 h-4 animate-spin mr-1.5" /> : <Sparkles className="w-4 h-4 mr-1.5" />}AI suggest
            </Button>
            <Button variant="outline" className="h-9" onClick={() => tagMut.mutate()} disabled={tagMut.isPending || !playable || E}
              title="Write the catalogue metadata into the audio file's ID3 tags (Metadata Engine)">
              {tagMut.isPending ? <Loader2 className="w-4 h-4 animate-spin mr-1.5" /> : <Tag className="w-4 h-4 mr-1.5" />}Tag file
            </Button>
          </div>
        </div>

        <div className="grid lg:grid-cols-3 gap-4">
          <div className="lg:col-span-2 space-y-4">
            {/* Music */}
            <section className="hrl-card p-5 space-y-4">
              <h2 className="text-base font-semibold">Music</h2>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                <Field label="Genre">{E ? <Input value={f.genre} onChange={(e) => set("genre", e.target.value)} className="h-9" /> : track.genre || "—"}</Field>
                <Field label="BPM">{E ? <Input inputMode="numeric" value={f.bpm} onChange={(e) => set("bpm", e.target.value)} className="h-9" /> : track.bpm ?? "—"}</Field>
                <Field label="Key">{E ? (
                  <Input list="keys" value={f.key} onChange={(e) => set("key", e.target.value)} className="h-9" />
                ) : track.key || "—"}</Field>
                <Field label="Length">{fmtDur(track.duration)}</Field>
                <Field label="Energy">{E ? <Input value={f.energy_level} onChange={(e) => set("energy_level", e.target.value)} className="h-9" placeholder="Low / Medium / High" /> : track.energy_level || "—"}</Field>
                <Field label="Vocals">{E ? (
                  <label className="flex items-center gap-2 h-9"><input type="checkbox" className="accent-violet-500" checked={!!f.hasVocals} onChange={(e) => set("hasVocals", e.target.checked)} /> has vocals</label>
                ) : m.hasVocals === undefined ? "—" : m.hasVocals ? [m.vocalStyle?.gender, m.vocalStyle?.timbre].filter(Boolean).join(", ") || "Yes" : "Instrumental"}</Field>
                <Field label="Era">{m.musicalEra || "—"}</Field>
                <Field label="Explicit">{E ? (
                  <label className="flex items-center gap-2 h-9"><input type="checkbox" className="accent-violet-500" checked={!!f.explicit} onChange={(e) => set("explicit", e.target.checked)} /> explicit lyrics</label>
                ) : track.explicit ? "Yes" : "No"}</Field>
              </div>
              <datalist id="keys">{KEYS.flatMap((k) => [k, `${k}m`]).map((k) => <option key={k} value={k} />)}</datalist>
              <Field label="Moods">{E ? <Input value={f.moods} onChange={(e) => set("moods", e.target.value)} placeholder="comma separated" /> : <Chips items={track.track_moods} tone="brand" />}</Field>
              <Field label="Vibe">{E ? <Input value={f.mood_vibe} onChange={(e) => set("mood_vibe", e.target.value)} /> : track.mood_vibe || "—"}</Field>
              <Field label="Additional genres">{E ? <Input value={f.additionalGenres} onChange={(e) => set("additionalGenres", e.target.value)} placeholder="comma separated" /> : <Chips items={m.additionalGenres} />}</Field>
              <Field label="Instrumentation">{E ? <Input value={f.instrumentation} onChange={(e) => set("instrumentation", e.target.value)} placeholder="comma separated" /> : <Chips items={m.instrumentation} />}</Field>
              {(m.similarArtists?.length ?? 0) > 0 && !E && <Field label="Sounds like"><Chips items={m.similarArtists} /></Field>}
            </section>

            {/* Sync */}
            <section className="hrl-card p-5 space-y-4">
              <h2 className="text-base font-semibold">For sync</h2>
              <Field label="Description">{E ? <Textarea rows={3} value={f.description} onChange={(e) => set("description", e.target.value)} /> : <p className="text-muted-foreground whitespace-pre-line">{track.description || "—"}</p>}</Field>
              <Field label="Use cases">{E ? <Textarea rows={4} value={f.useCases} onChange={(e) => set("useCases", e.target.value)} placeholder="one per line" /> : (
                m.useCases?.length ? <ul className="list-disc pl-5 space-y-0.5 text-muted-foreground">{m.useCases.map((u) => <li key={u}>{u}</li>)}</ul> : "—"
              )}</Field>
              <Field label="Target audience">{E ? <Input value={f.targetAudience} onChange={(e) => set("targetAudience", e.target.value)} /> : <span className="text-muted-foreground">{m.targetAudience || "—"}</span>}</Field>
              <Field label="Keywords">{E ? <Input value={f.keywords} onChange={(e) => set("keywords", e.target.value)} placeholder="comma separated" /> : <Chips items={m.keywords} />}</Field>
            </section>
          </div>

          <div className="space-y-4">
            {/* Rights */}
            <section className="hrl-card p-5 space-y-3">
              <h2 className="text-base font-semibold">Rights & IDs</h2>
              <Field label="Clearance">{E ? (
                <Select value={f.clearance_status} onValueChange={(v) => set("clearance_status", v)}>
                  <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                  <SelectContent>{CLEARANCE_OPTIONS.map((o) => <SelectItem key={o.v} value={o.v}>{o.l}</SelectItem>)}</SelectContent>
                </Select>
              ) : (
                <span className={track.clearance_status === "cleared_ready" ? "hrl-badge-ok" : track.clearance_status === "in_progress" ? "hrl-badge-warn" : "hrl-badge-dim"}>
                  {CLEARANCE_OPTIONS.find((o) => o.v === track.clearance_status)?.l ?? "—"}
                </span>
              )}</Field>
              {([["Composer", "composer"], ["ISRC", "isrc"], ["ISWC", "iswc"], ["Catalog no.", "catalog_number"], ["Album", "album"], ["Year", "year"]] as const).map(([label, k]) => (
                <Field key={k} label={label}>{E ? <Input value={(f as any)[k]} onChange={(e) => set(k, e.target.value)} className="h-9" /> : (track as any)[k] || "—"}</Field>
              ))}
              <Field label="Publisher">{m.publisher || "—"}</Field>
            </section>

            {/* File */}
            <section className="hrl-card p-5 space-y-3">
              <h2 className="text-base font-semibold">File</h2>
              <Field label="File name"><span className="break-all">{track.file_name || "—"}</span></Field>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Format">{(track.format || track.mime_type || "—").toString().replace("audio/", "").toUpperCase()}</Field>
                <Field label="Size">{fmtSize(track.file_size)}</Field>
                <Field label="Added">{track.created_at ? new Date(track.created_at).toLocaleDateString() : "—"}</Field>
                <Field label="Public">{track.is_public ? "Yes (preview)" : "No"}</Field>
              </div>
              {m.analysisVersion && <p className="text-xs text-muted-foreground">AI analysis v{m.analysisVersion}{m.confidence ? ` · confidence ${Math.round(m.confidence * 100)}%` : ""}</p>}
            </section>

            {/* Similar */}
            {similar.length > 0 && (
              <section className="hrl-card p-5">
                <h2 className="text-base font-semibold mb-3">Similar tracks</h2>
                <div className="space-y-1">
                  {similar.map((s: any) => (
                    <button key={s.id} onClick={() => navigate(`/library/${s.id}`)} className="w-full flex items-center justify-between gap-2 text-sm text-left hover:text-violet-300">
                      <span className="truncate">{s.title}<span className="text-muted-foreground"> · {s.genre}</span></span>
                    </button>
                  ))}
                </div>
                <p className="text-xs text-muted-foreground mt-2">Handy for pitch playlists — add a few similar options.</p>
              </section>
            )}

            {/* Lyrics */}
            <section className="hrl-card p-5">
              <h2 className="text-base font-semibold mb-3">Lyrics</h2>
              {track.lyrics?.length ? (
                <div className="space-y-1.5">
                  {track.lyrics.map((l: any) => (
                    <button key={l.id} onClick={() => navigate("/lyrics")} className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground">
                      <span className="hrl-badge-dim">{l.status}</span>{l.title}
                    </button>
                  ))}
                </div>
              ) : <p className="text-sm text-muted-foreground">No lyrics linked</p>}
              <Button variant="ghost" size="sm" className="w-full mt-3" onClick={() => navigate("/lyrics")}><Plus className="w-4 h-4 mr-1" />Add lyrics</Button>
            </section>
          </div>
        </div>
      </div>
    </Layout>
  );
}
