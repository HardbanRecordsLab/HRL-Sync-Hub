import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  FileText, Plus, Globe, Lock, Edit2, Trash2, Eye, Search, Music2, Loader2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import Layout from "@/components/Layout";
import { api } from "@/lib/api";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

const LANGS = [
  { v: "en", l: "EN" }, { v: "pl", l: "PL" }, { v: "de", l: "DE" }, { v: "fr", l: "FR" },
  { v: "es", l: "ES" }, { v: "it", l: "IT" }, { v: "pt", l: "PT" }, { v: "nl", l: "NL" },
];

const STATUS_STYLE: Record<string, string> = {
  draft: "hrl-badge-dim",
  final: "hrl-badge-red",
  archived: "hrl-badge-dim",
};

interface LyricsEntry {
  id: string;
  title: string;
  artist?: string;
  content?: string;
  preview_text?: string;
  language: string;
  is_explicit: boolean;
  is_public: boolean;
  status: "draft" | "final" | "archived";
  created_at: string;
  copyright_notice?: string;
  notes?: string;
  track_title?: string;
  track_artist?: string;
}

const EMPTY_FORM = {
  title: "", artist: "", content: "", language: "en",
  is_explicit: false, is_public: false, status: "draft",
  copyright_notice: "", notes: "",
};

export default function LyricsCatalog() {
  const qc = useQueryClient();
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<LyricsEntry | null>(null);
  const [viewingId, setViewingId] = useState<string | null>(null);
  const [form, setForm] = useState(EMPTY_FORM);

  const { data: lyrics = [], isLoading } = useQuery<LyricsEntry[]>({
    queryKey: ["lyrics", search, statusFilter],
    queryFn: async () => {
      const res = await api.get<{ lyrics: LyricsEntry[] }>("/api/lyrics", {
        search: search || undefined,
        status: statusFilter !== "all" ? statusFilter : undefined,
        limit: 100,
      });
      return res.lyrics ?? [];
    },
  });

  const { data: viewing } = useQuery<LyricsEntry>({
    queryKey: ["lyrics", viewingId],
    queryFn: () => api.get(`/api/lyrics/${viewingId}`),
    enabled: !!viewingId,
  });

  const saveMut = useMutation({
    mutationFn: () =>
      editing ? api.put(`/api/lyrics/${editing.id}`, form) : api.post("/api/lyrics", form),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["lyrics"] });
      setOpen(false);
      setEditing(null);
      setForm(EMPTY_FORM);
      toast.success(editing ? "Lyrics updated" : "Lyrics saved");
    },
    onError: (e: any) => toast.error(e.message || "Save failed"),
  });

  const deleteMut = useMutation({
    mutationFn: (id: string) => api.delete(`/api/lyrics/${id}`),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["lyrics"] }); toast.success("Deleted"); },
    onError: (e: any) => toast.error(e.message),
  });

  const openEdit = async (entry: LyricsEntry) => {
    let full = entry;
    try {
      full = await api.get<LyricsEntry>(`/api/lyrics/${entry.id}`);
    } catch { /* fall back to list data */ }
    setEditing(full);
    setForm({
      title: full.title, artist: full.artist ?? "", content: full.content ?? "",
      language: full.language, is_explicit: full.is_explicit, is_public: full.is_public,
      status: full.status,
      copyright_notice: full.copyright_notice ?? "", notes: full.notes ?? "",
    });
    setOpen(true);
  };

  const f = (k: string, v: any) => setForm((prev) => ({ ...prev, [k]: v }));

  return (
    <Layout>
      <div className="animate-fade-in space-y-6">
        <div className="flex items-end justify-between">
          <div>
            <h1 className="hrl-title text-5xl mb-1">LYRICS</h1>
            <p className="hrl-label text-muted-foreground">
              {lyrics.length} entr{lyrics.length !== 1 ? "ies" : "y"}
            </p>
          </div>
          <Dialog open={open} onOpenChange={(v) => { setOpen(v); if (!v) { setEditing(null); setForm(EMPTY_FORM); } }}>
            <DialogTrigger asChild>
              <Button className="hrl-btn-primary"><Plus className="w-3.5 h-3.5 mr-1.5" /> Add Lyrics</Button>
            </DialogTrigger>
            <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle className="hrl-title text-2xl">{editing ? "EDIT LYRICS" : "NEW LYRICS"}</DialogTitle>
              </DialogHeader>
              <div className="space-y-4 mt-3">
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label className="hrl-label mb-1.5 block">Title *</Label>
                    <Input value={form.title} onChange={(e) => f("title", e.target.value)} placeholder="Song title" />
                  </div>
                  <div>
                    <Label className="hrl-label mb-1.5 block">Artist</Label>
                    <Input value={form.artist} onChange={(e) => f("artist", e.target.value)} placeholder="Artist name" />
                  </div>
                </div>

                <div>
                  <Label className="hrl-label mb-1.5 block">Lyrics Content</Label>
                  <Textarea
                    value={form.content}
                    onChange={(e) => f("content", e.target.value)}
                    placeholder="Paste the lyrics here…"
                    className="min-h-[200px] font-mono text-sm leading-relaxed"
                  />
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label className="hrl-label mb-1.5 block">Language</Label>
                    <Select value={form.language} onValueChange={(v) => f("language", v)}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {LANGS.map((l) => <SelectItem key={l.v} value={l.v}>{l.l}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label className="hrl-label mb-1.5 block">Status</Label>
                    <Select value={form.status} onValueChange={(v) => f("status", v)}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="draft">Draft</SelectItem>
                        <SelectItem value="final">Final</SelectItem>
                        <SelectItem value="archived">Archived</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                <div>
                  <Label className="hrl-label mb-1.5 block">Copyright</Label>
                  <Input
                    value={form.copyright_notice}
                    onChange={(e) => f("copyright_notice", e.target.value)}
                    placeholder="© 2026 Hardban Records / Publisher (ZAiKS)"
                  />
                </div>

                <div className="flex items-center gap-6 pt-1">
                  <div className="flex items-center gap-2">
                    <Switch id="exp" checked={form.is_explicit} onCheckedChange={(v) => f("is_explicit", v)} />
                    <Label htmlFor="exp" className="hrl-label cursor-pointer">Explicit</Label>
                  </div>
                  <div className="flex items-center gap-2">
                    <Switch id="pub" checked={form.is_public} onCheckedChange={(v) => f("is_public", v)} />
                    <Label htmlFor="pub" className="hrl-label cursor-pointer">Public</Label>
                  </div>
                </div>

                <Button
                  className="hrl-btn-primary w-full"
                  disabled={!form.title || saveMut.isPending}
                  onClick={() => saveMut.mutate()}
                >
                  {saveMut.isPending ? <><Loader2 className="w-3.5 h-3.5 mr-2 animate-spin" /> Saving…</> : editing ? "Update" : "Save Lyrics"}
                </Button>
              </div>
            </DialogContent>
          </Dialog>
        </div>

        <div className="flex gap-3">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
            <Input placeholder="Search lyrics…" className="pl-9 h-9 text-sm" value={search} onChange={(e) => setSearch(e.target.value)} />
          </div>
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-[130px] h-9 text-sm"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Status</SelectItem>
              <SelectItem value="draft">Draft</SelectItem>
              <SelectItem value="final">Final</SelectItem>
              <SelectItem value="archived">Archived</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {isLoading ? (
          <div className="flex items-center justify-center py-16 gap-2 text-muted-foreground">
            <Loader2 className="w-4 h-4 animate-spin" /><span className="hrl-label">Loading…</span>
          </div>
        ) : lyrics.length === 0 ? (
          <div className="text-center py-16">
            <FileText className="w-10 h-10 mx-auto mb-4 text-muted-foreground opacity-30" />
            <p className="hrl-title text-2xl text-muted-foreground mb-2">NO LYRICS</p>
            <p className="hrl-label text-muted-foreground">Paste lyrics in — one entry per song</p>
          </div>
        ) : (
          <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
            {lyrics.map((entry, i) => (
              <div key={entry.id} className={cn("hrl-card p-4 animate-fade-in", `stagger-${Math.min(i + 1, 5)}`)}>
                <div className="flex items-start justify-between gap-2 mb-3">
                  <div className="min-w-0">
                    <p className="font-semibold truncate text-sm leading-tight">{entry.title}</p>
                    {entry.artist && <p className="hrl-label text-muted-foreground mt-0.5">{entry.artist}</p>}
                  </div>
                  {entry.is_public
                    ? <Globe className="w-3.5 h-3.5 text-green-400 shrink-0 mt-0.5" />
                    : <Lock className="w-3.5 h-3.5 text-muted-foreground shrink-0 mt-0.5" />}
                </div>

                {entry.preview_text && (
                  <p className="text-[11px] text-muted-foreground font-mono leading-relaxed line-clamp-2 mb-3">
                    {entry.preview_text}…
                  </p>
                )}

                <div className="flex flex-wrap gap-1.5 mb-3">
                  <span className={STATUS_STYLE[entry.status]}>{entry.status}</span>
                  <span className="hrl-badge-dim">{LANGS.find((l) => l.v === entry.language)?.l ?? entry.language}</span>
                  {entry.is_explicit && <span className="hrl-badge-red">E</span>}
                  {entry.track_title && (
                    <span className="hrl-badge-dim flex items-center gap-1">
                      <Music2 className="w-2.5 h-2.5" />{entry.track_title}
                    </span>
                  )}
                </div>

                <div className="flex items-center gap-1 pt-3 border-t border-border/50">
                  <button className="p-1.5 rounded text-muted-foreground hover:text-foreground hover:bg-white/5 transition" onClick={() => setViewingId(entry.id)} title="View">
                    <Eye className="w-3.5 h-3.5" />
                  </button>
                  <button className="p-1.5 rounded text-muted-foreground hover:text-foreground hover:bg-white/5 transition" onClick={() => openEdit(entry)} title="Edit">
                    <Edit2 className="w-3.5 h-3.5" />
                  </button>
                  <button
                    className="p-1.5 rounded text-muted-foreground hover:text-violet-400 hover:bg-violet-500/8 transition ml-auto"
                    onClick={() => { if (confirm("Delete?")) deleteMut.mutate(entry.id); }}
                    title="Delete"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <Dialog open={!!viewingId} onOpenChange={() => setViewingId(null)}>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="hrl-title text-2xl">
              {viewing?.title}
              {viewing?.artist && <span className="text-muted-foreground font-normal text-base ml-2">— {viewing.artist}</span>}
            </DialogTitle>
          </DialogHeader>
          <pre className="whitespace-pre-wrap font-mono text-sm leading-loose mt-3 text-foreground/90">
            {viewing?.content || "No content yet."}
          </pre>
        </DialogContent>
      </Dialog>
    </Layout>
  );
}
