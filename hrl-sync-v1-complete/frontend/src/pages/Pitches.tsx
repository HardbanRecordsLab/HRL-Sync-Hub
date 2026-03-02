import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Radio, Plus, Share2, Trash2, Edit2, Music2,
  ExternalLink, Copy, Check, Loader2, ChevronRight
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import Layout from "@/components/Layout";
import { api } from "@/lib/api";
import { toast } from "sonner";
import { formatDistanceToNow } from "date-fns";
import { cn } from "@/lib/utils";

interface Playlist {
  id: string;
  name: string;
  description?: string;
  track_count: number;
  updated_at: string;
  share_links?: ShareLink[];
}

interface ShareLink {
  id: string;
  token: string;
  is_active: boolean;
  allow_downloads: boolean;
  expires_at?: string;
  share_url?: string;
}

export default function Pitches() {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Playlist | null>(null);
  const [form, setForm] = useState({ name: "", description: "" });
  const [shareOpen, setShareOpen] = useState<string | null>(null);
  const [shareForm, setShareForm] = useState({ allow_downloads: false, expires_in_days: "" });
  const [copied, setCopied] = useState<string | null>(null);

  const { data: playlists = [], isLoading } = useQuery<Playlist[]>({
    queryKey: ["playlists"],
    queryFn: () => api.get("/api/playlists"),
  });

  const saveMut = useMutation({
    mutationFn: () => editing
      ? api.put(`/api/playlists/${editing.id}`, form)
      : api.post("/api/playlists", form),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["playlists"] });
      setOpen(false); setEditing(null); setForm({ name: "", description: "" });
      toast.success(editing ? "Playlist updated" : "Playlist created");
    },
    onError: (e: any) => toast.error(e.message),
  });

  const deleteMut = useMutation({
    mutationFn: (id: string) => api.delete(`/api/playlists/${id}`),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["playlists"] }); toast.success("Deleted"); },
  });

  const shareMut = useMutation({
    mutationFn: ({ id }: { id: string }) =>
      api.post(`/api/playlists/${id}/share-link`, {
        allow_downloads: shareForm.allow_downloads,
        expires_in_days: shareForm.expires_in_days ? parseInt(shareForm.expires_in_days) : undefined,
      }),
    onSuccess: (link: any) => {
      qc.invalidateQueries({ queryKey: ["playlists"] });
      copyLink(link.share_url);
      toast.success("Share link created and copied!");
    },
    onError: (e: any) => toast.error(e.message),
  });

  const deactivateLinkMut = useMutation({
    mutationFn: (linkId: string) => api.patch(`/api/playlists/links/${linkId}`, { is_active: false }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["playlists"] }); toast.success("Link deactivated"); },
  });

  const copyLink = (url: string) => {
    navigator.clipboard.writeText(url);
    setCopied(url);
    setTimeout(() => setCopied(null), 2000);
  };

  const openEdit = (p: Playlist) => {
    setEditing(p);
    setForm({ name: p.name, description: p.description ?? "" });
    setOpen(true);
  };

  return (
    <Layout>
      <div className="animate-fade-in space-y-6">
        {/* Header */}
        <div className="flex items-end justify-between">
          <div>
            <h1 className="hrl-title text-5xl mb-1">PITCHES</h1>
            <p className="hrl-label text-muted-foreground">
              {playlists.length} playlist{playlists.length !== 1 ? "s" : ""} · shareable with clients
            </p>
          </div>
          <Dialog open={open} onOpenChange={v => { setOpen(v); if (!v) { setEditing(null); setForm({ name: "", description: "" }); } }}>
            <DialogTrigger asChild>
              <Button className="hrl-btn-primary"><Plus className="w-3.5 h-3.5 mr-1.5" /> New Playlist</Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle className="hrl-title text-2xl">{editing ? "EDIT PLAYLIST" : "NEW PLAYLIST"}</DialogTitle>
              </DialogHeader>
              <div className="space-y-4 mt-3">
                <div>
                  <Label className="hrl-label mb-1.5 block">Name *</Label>
                  <Input
                    value={form.name}
                    onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                    placeholder="e.g. Uplifting Corporate Q1 2025"
                  />
                </div>
                <div>
                  <Label className="hrl-label mb-1.5 block">Description</Label>
                  <Textarea
                    value={form.description}
                    onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
                    placeholder="Brief description for the client…"
                    className="resize-none"
                    rows={3}
                  />
                </div>
                <Button
                  className="hrl-btn-primary w-full"
                  disabled={!form.name || saveMut.isPending}
                  onClick={() => saveMut.mutate()}
                >
                  {saveMut.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin mr-2" /> : null}
                  {editing ? "Update" : "Create Playlist"}
                </Button>
              </div>
            </DialogContent>
          </Dialog>
        </div>

        {/* Playlists */}
        {isLoading ? (
          <div className="flex items-center justify-center py-16 gap-2 text-muted-foreground">
            <Loader2 className="w-4 h-4 animate-spin" /><span className="hrl-label">Loading…</span>
          </div>
        ) : playlists.length === 0 ? (
          <div className="text-center py-20">
            <Radio className="w-10 h-10 mx-auto mb-4 text-muted-foreground opacity-30" />
            <p className="hrl-title text-2xl text-muted-foreground mb-2">NO PLAYLISTS</p>
            <p className="hrl-label text-muted-foreground">Create a pitch playlist to share tracks with clients</p>
          </div>
        ) : (
          <div className="space-y-2">
            {playlists.map((pl, i) => {
              const activeLinks = pl.share_links?.filter(l => l.is_active) ?? [];
              return (
                <div key={pl.id} className={cn("hrl-card p-4 animate-fade-in", `stagger-${Math.min(i+1,5)}`)}>
                  <div className="flex items-center gap-4">
                    <div className="w-10 h-10 shrink-0 rounded border border-border bg-card flex items-center justify-center">
                      <Radio className="w-4 h-4 text-red-500" />
                    </div>

                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <p className="font-semibold text-sm">{pl.name}</p>
                        {activeLinks.length > 0 && (
                          <span className="hrl-badge-red">{activeLinks.length} LINK{activeLinks.length > 1 ? "S" : ""}</span>
                        )}
                      </div>
                      {pl.description && (
                        <p className="hrl-label text-muted-foreground truncate mt-0.5">{pl.description}</p>
                      )}
                      <div className="flex items-center gap-3 mt-1">
                        <span className="hrl-label text-muted-foreground">{pl.track_count} track{pl.track_count !== 1 ? "s" : ""}</span>
                        <span className="hrl-label text-muted-foreground">
                          Updated {formatDistanceToNow(new Date(pl.updated_at), { addSuffix: true })}
                        </span>
                      </div>
                    </div>

                    <div className="flex items-center gap-1.5">
                      <a href={`/pitches/${pl.id}`} className="p-1.5 rounded text-muted-foreground hover:text-foreground hover:bg-white/5 transition">
                        <ChevronRight className="w-4 h-4" />
                      </a>
                      <button onClick={() => openEdit(pl)} className="p-1.5 rounded text-muted-foreground hover:text-foreground hover:bg-white/5 transition">
                        <Edit2 className="w-3.5 h-3.5" />
                      </button>
                      <button
                        onClick={() => setShareOpen(shareOpen === pl.id ? null : pl.id)}
                        className={cn(
                          "p-1.5 rounded transition",
                          shareOpen === pl.id
                            ? "text-red-400 bg-red-500/10"
                            : "text-muted-foreground hover:text-foreground hover:bg-white/5"
                        )}
                      >
                        <Share2 className="w-3.5 h-3.5" />
                      </button>
                      <button
                        onClick={() => { if (confirm("Delete playlist?")) deleteMut.mutate(pl.id); }}
                        className="p-1.5 rounded text-muted-foreground hover:text-red-400 hover:bg-red-500/8 transition"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>

                  {/* Share panel */}
                  {shareOpen === pl.id && (
                    <div className="mt-4 pt-4 border-t border-border space-y-4">
                      {/* Existing links */}
                      {activeLinks.length > 0 && (
                        <div className="space-y-2">
                          <p className="hrl-label text-muted-foreground">Active links</p>
                          {activeLinks.map(link => (
                            <div key={link.id} className="flex items-center gap-2 p-2 rounded bg-white/3 text-xs">
                              <span className="font-mono text-muted-foreground truncate flex-1">
                                {process.env.VITE_API_URL || ""}/share/{link.token}
                              </span>
                              {link.allow_downloads && <span className="hrl-badge-dim">DL</span>}
                              {link.expires_at && (
                                <span className="hrl-label text-muted-foreground">
                                  exp. {new Date(link.expires_at).toLocaleDateString()}
                                </span>
                              )}
                              <button
                                onClick={() => copyLink(`${window.location.origin}/share/${link.token}`)}
                                className="text-muted-foreground hover:text-foreground transition"
                              >
                                {copied === `${window.location.origin}/share/${link.token}`
                                  ? <Check className="w-3 h-3 text-green-400" />
                                  : <Copy className="w-3 h-3" />}
                              </button>
                              <button
                                onClick={() => deactivateLinkMut.mutate(link.id)}
                                className="text-muted-foreground hover:text-red-400 transition"
                              >
                                <Trash2 className="w-3 h-3" />
                              </button>
                            </div>
                          ))}
                        </div>
                      )}

                      {/* New link form */}
                      <div className="space-y-3">
                        <p className="hrl-label text-muted-foreground">Create new link</p>
                        <div className="flex items-center gap-2">
                          <Switch
                            id={`dl-${pl.id}`}
                            checked={shareForm.allow_downloads}
                            onCheckedChange={v => setShareForm(f => ({ ...f, allow_downloads: v }))}
                          />
                          <Label htmlFor={`dl-${pl.id}`} className="hrl-label cursor-pointer">Allow downloads</Label>
                        </div>
                        <div className="flex gap-2">
                          <Input
                            placeholder="Expires in days (optional)"
                            type="number"
                            min="1"
                            max="365"
                            className="h-8 text-sm"
                            value={shareForm.expires_in_days}
                            onChange={e => setShareForm(f => ({ ...f, expires_in_days: e.target.value }))}
                          />
                          <Button
                            size="sm"
                            className="hrl-btn-primary h-8 text-xs shrink-0"
                            onClick={() => shareMut.mutate({ id: pl.id })}
                            disabled={shareMut.isPending}
                          >
                            {shareMut.isPending ? <Loader2 className="w-3 h-3 animate-spin" /> : <><Share2 className="w-3 h-3 mr-1" /> Generate</>}
                          </Button>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </Layout>
  );
}
