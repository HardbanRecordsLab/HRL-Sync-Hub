import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  FileText, Plus, Globe, Lock, RefreshCw, Edit2, Trash2,
  ExternalLink, Eye, Search, Music2, Loader2
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import Layout from "@/components/Layout";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { formatDistanceToNow } from "date-fns";
import { cn } from "@/lib/utils";
import { useSearchParams } from "react-router-dom";

const API = import.meta.env.VITE_API_URL ?? "";

const LANGS = [
  { v: "en", l: "EN" }, { v: "pl", l: "PL" }, { v: "de", l: "DE" },
  { v: "fr", l: "FR" }, { v: "es", l: "ES" }, { v: "it", l: "IT" },
  { v: "pt", l: "PT" }, { v: "nl", l: "NL" },
];

const STATUS_STYLE: Record<string, string> = {
  draft:    "hrl-badge-dim",
  final:    "hrl-badge-red",
  archived: "hrl-badge-dim",
};

interface LyricsEntry {
  id: string;
  title: string;
  artist?: string;
  preview_text?: string;
  language: string;
  is_explicit: boolean;
  is_public: boolean;
  status: "draft" | "final" | "archived";
  google_doc_id?: string;
  last_synced_from_drive?: string;
  created_at: string;
  tracks?: { title: string; artist: string } | null;
}

const EMPTY_FORM = {
  title: "", artist: "", content: "", language: "en",
  is_explicit: false, is_public: false, status: "draft",
  google_doc_id: "", copyright_notice: "", notes: "",
};

export default function LyricsCatalog() {
  const qc = useQueryClient();
  const [searchParams] = useSearchParams();
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<LyricsEntry | null>(null);
  const [viewing, setViewing] = useState<LyricsEntry | null>(null);
  const [form, setForm] = useState(EMPTY_FORM);

  // Pre-fill from Drive import
  useEffect(() => {
    const docId = searchParams.get("docId");
    const docName = searchParams.get("docName");
    if (docId) {
      setForm(f => ({ ...f, google_doc_id: docId, title: docName ?? "" }));
      setOpen(true);
    }
  }, []);

  const { data: session } = useQuery({
    queryKey: ["session"],
    queryFn: async () => (await supabase.auth.getSession()).data.session,
  });

  const { data: lyrics = [], isLoading } = useQuery({
    queryKey: ["lyrics", search, statusFilter],
    queryFn: async () => {
      let q = supabase
        .from("lyrics")
        .select("*, tracks(title, artist)")
        .order("updated_at", { ascending: false });
      if (search) q = q.or(`title.ilike.%${search}%,artist.ilike.%${search}%`);
      if (statusFilter !== "all") q = q.eq("status", statusFilter);
      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []) as LyricsEntry[];
    },
    enabled: !!session,
  });

  const saveMut = useMutation({
    mutationFn: async () => {
      const payload = {
        ...form,
        preview_text: form.content.replace(/<[^>]*>/g, "").substring(0, 200),
        user_id: session?.user?.id,
        google_doc_id: form.google_doc_id || null,
        updated_at: new Date().toISOString(),
      };
      if (editing) {
        const { error } = await supabase.from("lyrics").update(payload).eq("id", editing.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("lyrics").insert(payload);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["lyrics"] });
      setOpen(false); setEditing(null); setForm(EMPTY_FORM);
      toast.success(editing ? "Lyrics updated" : "Lyrics saved");
    },
    onError: () => toast.error("Save failed"),
  });

  const deleteMut = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("lyrics").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["lyrics"] }); toast.success("Deleted"); },
  });

  const syncMut = useMutation({
    mutationFn: async (entry: LyricsEntry) => {
      const r = await fetch(`${API}/api/lyrics/${entry.id}/sync-with-drive`, {
        method: "POST",
        headers: { Authorization: `Bearer ${session?.access_token}` },
      });
      if (!r.ok) throw new Error("Sync failed");
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["lyrics"] }); toast.success("Synced from Google Doc"); },
    onError: (e: any) => toast.error(e.message),
  });

  const openEdit = (e: LyricsEntry) => {
    setEditing(e);
    setForm({
      title: e.title, artist: e.artist ?? "", content: (e as any).content ?? "",
      language: e.language, is_explicit: e.is_explicit, is_public: e.is_public,
      status: e.status, google_doc_id: e.google_doc_id ?? "",
      copyright_notice: (e as any).copyright_notice ?? "", notes: (e as any).notes ?? "",
    });
    setOpen(true);
  };

  const f = (k: string, v: any) => setForm(prev => ({ ...prev, [k]: v }));

  return (
    <Layout>
      <div className="animate-fade-in space-y-6">
        {/* Header */}
        <div className="flex items-end justify-between">
          <div>
            <h1 className="hrl-title text-5xl mb-1">LYRICS</h1>
            <p className="hrl-label text-muted-foreground">
              {lyrics.length} entr{lyrics.length !== 1 ? "ies" : "y"} · sync with Google Docs
            </p>
          </div>
          <Dialog open={open} onOpenChange={v => { setOpen(v); if (!v) { setEditing(null); setForm(EMPTY_FORM); } }}>
            <DialogTrigger asChild>
              <Button className="hrl-btn-primary"><Plus className="w-3.5 h-3.5 mr-1.5" /> Add Lyrics</Button>
            </DialogTrigger>
            <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle className="hrl-title text-2xl">
                  {editing ? "EDIT LYRICS" : "NEW LYRICS"}
                </DialogTitle>
              </DialogHeader>
              <div className="space-y-4 mt-3">
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label className="hrl-label mb-1.5 block">Title *</Label>
                    <Input value={form.title} onChange={e => f("title", e.target.value)} placeholder="Song title" />
                  </div>
                  <div>
                    <Label className="hrl-label mb-1.5 block">Artist</Label>
                    <Input value={form.artist} onChange={e => f("artist", e.target.value)} placeholder="Artist name" />
                  </div>
                </div>

                <div>
                  <Label className="hrl-label mb-1.5 block">Lyrics Content</Label>
                  <Textarea
                    value={form.content}
                    onChange={e => f("content", e.target.value)}
                    placeholder="Paste lyrics here, or link a Google Doc below and sync…"
                    className="min-h-[180px] font-mono text-sm leading-relaxed"
                  />
                </div>

                <div>
                  <Label className="hrl-label mb-1.5 block">Google Doc ID (optional)</Label>
                  <Input
                    value={form.google_doc_id}
                    onChange={e => f("google_doc_id", e.target.value)}
                    placeholder="Paste Doc ID from URL — docs.google.com/document/d/[ID]/edit"
                    className="font-mono text-sm"
                  />
                  <p className="text-[11px] text-muted-foreground mt-1.5">
                    Link a Google Doc to keep lyrics in sync. HRL Sync will pull content on demand.
                  </p>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label className="hrl-label mb-1.5 block">Language</Label>
                    <Select value={form.language} onValueChange={v => f("language", v)}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {LANGS.map(l => <SelectItem key={l.v} value={l.v}>{l.l}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label className="hrl-label mb-1.5 block">Status</Label>
                    <Select value={form.status} onValueChange={v => f("status", v)}>
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
                    onChange={e => f("copyright_notice", e.target.value)}
                    placeholder="© 2024 Hardban Records / Publisher (ZAiKS)"
                  />
                </div>

                <div className="flex items-center gap-6 pt-1">
                  <div className="flex items-center gap-2">
                    <Switch id="exp" checked={form.is_explicit} onCheckedChange={v => f("is_explicit", v)} />
                    <Label htmlFor="exp" className="hrl-label cursor-pointer">Explicit</Label>
                  </div>
                  <div className="flex items-center gap-2">
                    <Switch id="pub" checked={form.is_public} onCheckedChange={v => f("is_public", v)} />
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

        {/* Filters */}
        <div className="flex gap-3">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
            <Input placeholder="Search lyrics…" className="pl-9 h-9 text-sm" value={search} onChange={e => setSearch(e.target.value)} />
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

        {/* Grid */}
        {isLoading ? (
          <div className="flex items-center justify-center py-16 gap-2 text-muted-foreground">
            <Loader2 className="w-4 h-4 animate-spin" /><span className="hrl-label">Loading…</span>
          </div>
        ) : lyrics.length === 0 ? (
          <div className="text-center py-16">
            <FileText className="w-10 h-10 mx-auto mb-4 text-muted-foreground opacity-30" />
            <p className="hrl-title text-2xl text-muted-foreground mb-2">NO LYRICS</p>
            <p className="hrl-label text-muted-foreground">Add manually or sync from a Google Doc</p>
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
                  <span className="hrl-badge-dim">{LANGS.find(l => l.v === entry.language)?.l ?? entry.language}</span>
                  {entry.is_explicit && <span className="hrl-badge-red">E</span>}
                  {entry.tracks && (
                    <span className="hrl-badge-dim flex items-center gap-1">
                      <Music2 className="w-2.5 h-2.5" />{entry.tracks.title}
                    </span>
                  )}
                </div>

                {entry.google_doc_id && (
                  <div className="flex items-center gap-1.5 text-[10px] text-blue-400 mb-3 font-mono">
                    <RefreshCw className="w-2.5 h-2.5" />
                    {entry.last_synced_from_drive
                      ? `Synced ${formatDistanceToNow(new Date(entry.last_synced_from_drive), { addSuffix: true })}`
                      : "Google Doc linked"}
                  </div>
                )}

                <div className="flex items-center gap-1 pt-3 border-t border-border/50">
                  <button className="p-1.5 rounded text-muted-foreground hover:text-foreground hover:bg-white/5 transition" onClick={() => setViewing(entry)} title="View">
                    <Eye className="w-3.5 h-3.5" />
                  </button>
                  <button className="p-1.5 rounded text-muted-foreground hover:text-foreground hover:bg-white/5 transition" onClick={() => openEdit(entry)} title="Edit">
                    <Edit2 className="w-3.5 h-3.5" />
                  </button>
                  {entry.google_doc_id && (
                    <>
                      <button
                        className="p-1.5 rounded text-muted-foreground hover:text-blue-400 hover:bg-blue-500/8 transition"
                        onClick={() => syncMut.mutate(entry)} title="Sync from Doc"
                        disabled={syncMut.isPending}
                      >
                        <RefreshCw className={cn("w-3.5 h-3.5", syncMut.isPending && "animate-spin")} />
                      </button>
                      <button
                        className="p-1.5 rounded text-muted-foreground hover:text-foreground hover:bg-white/5 transition"
                        onClick={() => window.open(`https://docs.google.com/document/d/${entry.google_doc_id}`, "_blank")}
                        title="Open in Drive"
                      >
                        <ExternalLink className="w-3.5 h-3.5" />
                      </button>
                    </>
                  )}
                  <button
                    className="p-1.5 rounded text-muted-foreground hover:text-red-400 hover:bg-red-500/8 transition ml-auto"
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

      {/* View dialog */}
      <Dialog open={!!viewing} onOpenChange={() => setViewing(null)}>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="hrl-title text-2xl">
              {viewing?.title}
              {viewing?.artist && <span className="text-muted-foreground font-normal text-base ml-2">— {viewing.artist}</span>}
            </DialogTitle>
          </DialogHeader>
          <pre className="whitespace-pre-wrap font-mono text-sm leading-loose mt-3 text-foreground/90">
            {(viewing as any)?.content || "No content — sync from Google Doc or add manually."}
          </pre>
        </DialogContent>
      </Dialog>
    </Layout>
  );
}
