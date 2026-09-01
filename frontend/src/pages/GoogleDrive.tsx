import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  HardDrive, Folder, Music2, FileText, Check, RefreshCw,
  ChevronRight, X, Download, Loader2, Play, ExternalLink,
  CloudOff, AlertCircle
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import Layout from "@/components/Layout";
import { supabase } from "@/integrations/supabase/client";
import { useAudioPlayer } from "@/hooks/useAudioPlayer";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

const API = import.meta.env.VITE_API_URL ?? "";

const fmtSize = (b: string) => {
  const n = parseInt(b || "0");
  if (n < 1024) return `${n} B`;
  if (n < 1048576) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / 1048576).toFixed(1)} MB`;
};

const AUDIO_MIMES = new Set(["audio/mpeg","audio/mp3","audio/wav","audio/x-wav","audio/flac","audio/aac","audio/ogg","audio/x-m4a"]);
const isAudio = (m: string) => AUDIO_MIMES.has(m);
const isFolder = (m: string) => m === "application/vnd.google-apps.folder";
const isDoc    = (m: string) => m === "application/vnd.google-apps.document";

export default function GoogleDrive() {
  const qc = useQueryClient();
  const player = useAudioPlayer();
  const [folder, setFolder] = useState<string | null>(null);
  const [breadcrumbs, setBreadcrumbs] = useState<{ id: string | null; name: string }[]>([{ id: null, name: "My Drive" }]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [importProg, setImportProg] = useState<{ done: number; total: number } | null>(null);

  const { data: session } = useQuery({
    queryKey: ["session"],
    queryFn: async () => (await supabase.auth.getSession()).data.session,
  });

  const headers = () => ({ Authorization: `Bearer ${session?.access_token}`, "Content-Type": "application/json" });

  const { data: status, isLoading: statusLoading } = useQuery({
    queryKey: ["drive-status"],
    queryFn: async () => {
      const r = await fetch(`${API}/api/drive/status`, { headers: headers() });
      return r.json();
    },
    enabled: !!session,
  });

  const { data: filesData, isLoading: filesLoading, refetch } = useQuery({
    queryKey: ["drive-files", folder],
    queryFn: async () => {
      const params = folder ? `?folderId=${folder}` : "";
      const r = await fetch(`${API}/api/drive/files${params}`, { headers: headers() });
      if (!r.ok) throw new Error("Failed");
      return r.json();
    },
    enabled: !!session && status?.connected,
  });

  const connectDrive = () => {
    fetch(`${API}/api/drive/auth-url`, { headers: headers() })
      .then(r => r.json())
      .then(({ url }) => { window.location.href = url; });
  };

  const disconnect = useMutation({
    mutationFn: () => fetch(`${API}/api/drive/disconnect`, { method: "DELETE", headers: headers() }).then(r => r.json()),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["drive-status"] }); toast.success("Disconnected"); },
  });

  const importSelected = async () => {
    const ids = Array.from(selected);
    setImportProg({ done: 0, total: ids.length });
    let ok = 0;
    for (const fileId of ids) {
      try {
        await fetch(`${API}/api/drive/import`, {
          method: "POST", headers: headers(),
          body: JSON.stringify({ fileId }),
        });
        ok++;
      } catch {}
      setImportProg({ done: ok, total: ids.length });
    }
    setImportProg(null);
    setSelected(new Set());
    qc.invalidateQueries({ queryKey: ["tracks"] });
    toast.success(`Imported ${ok} track${ok !== 1 ? "s" : ""}`);
  };

  const previewAudio = (file: any) => {
    player.play({
      id: file.id,
      title: file.name.replace(/\.[^/.]+$/, ""),
      artist: "Google Drive",
      fileUrl: `${API}/api/drive/stream/${file.id}`,
    });
  };

  const enterFolder = (file: any) => {
    setBreadcrumbs(b => [...b, { id: file.id, name: file.name }]);
    setFolder(file.id);
  };

  const goToBreadcrumb = (idx: number) => {
    const crumb = breadcrumbs[idx];
    setBreadcrumbs(b => b.slice(0, idx + 1));
    setFolder(crumb.id);
  };

  const toggleSelect = (id: string) =>
    setSelected(s => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });

  const files: any[] = filesData?.files ?? [];
  const folders = files.filter(f => isFolder(f.mimeType));
  const audioFiles = files.filter(f => isAudio(f.mimeType));
  const docs = files.filter(f => isDoc(f.mimeType));
  const others = files.filter(f => !isFolder(f.mimeType) && !isAudio(f.mimeType) && !isDoc(f.mimeType));

  // ── Not connected ─────────────────────────────────────────────
  if (!statusLoading && !status?.connected) return (
    <Layout>
      <div className="animate-fade-in max-w-xl mx-auto pt-12 text-center">
        <div className="w-16 h-16 mx-auto mb-6 rounded border border-border flex items-center justify-center">
          <CloudOff className="w-8 h-8 text-muted-foreground" />
        </div>
        <h1 className="hrl-title text-4xl mb-3">CONNECT DRIVE</h1>
        <p className="text-sm text-muted-foreground mb-8 leading-relaxed">
          HRL Sync uses Google Drive as its primary audio storage. Connect your Drive to browse, preview,
          and import tracks directly — no file duplication, just metadata.
        </p>
        <div className="grid grid-cols-3 gap-4 mb-10 text-center text-sm">
          {[
            { icon: Music2, t: "Stream audio", d: "Playback direct from Drive" },
            { icon: FileText, t: "Sync lyrics", d: "Pull content from Google Docs" },
            { icon: HardDrive, t: "Zero storage", d: "VPS stores metadata only" },
          ].map(({ icon: I, t, d }) => (
            <div key={t} className="hrl-card p-4">
              <I className="w-5 h-5 text-red-500 mx-auto mb-2" />
              <p className="font-medium text-xs mb-1">{t}</p>
              <p className="hrl-label text-muted-foreground text-[10px]">{d}</p>
            </div>
          ))}
        </div>
        <Button className="hrl-btn-primary px-8 py-3 text-sm" onClick={connectDrive}>
          <HardDrive className="w-3.5 h-3.5 mr-2" /> Connect Google Drive
        </Button>
      </div>
    </Layout>
  );

  return (
    <Layout>
      <div className="animate-fade-in space-y-6">
        {/* Header */}
        <div className="flex items-end justify-between">
          <div>
            <div className="flex items-center gap-3 mb-1">
              <h1 className="hrl-title text-5xl">GOOGLE DRIVE</h1>
              {status?.connected && (
                <span className="hrl-badge-red flex items-center gap-1">
                  <Check className="w-2.5 h-2.5" /> Connected
                </span>
              )}
            </div>
            <p className="hrl-label text-muted-foreground">Primary file storage — audio streamed on demand</p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" className="hrl-label h-8" onClick={() => refetch()}>
              <RefreshCw className="w-3 h-3 mr-1.5" /> Refresh
            </Button>
            <Button
              variant="outline" size="sm"
              className="hrl-label h-8 text-red-400 border-red-500/30 hover:bg-red-500/10"
              onClick={() => disconnect.mutate()}
            >
              <X className="w-3 h-3 mr-1.5" /> Disconnect
            </Button>
          </div>
        </div>

        {/* Import bar */}
        {selected.size > 0 && (
          <div className="flex items-center justify-between p-3 rounded border border-red-500/30 bg-red-500/8">
            <span className="hrl-label text-red-400">{selected.size} file{selected.size !== 1 ? "s" : ""} selected</span>
            <div className="flex gap-2">
              <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => setSelected(new Set())}>Clear</Button>
              <Button size="sm" className="hrl-btn-primary h-7 text-xs" onClick={importSelected}>
                <Download className="w-3 h-3 mr-1.5" /> Import to Library
              </Button>
            </div>
          </div>
        )}

        {/* Progress */}
        {importProg && (
          <div className="hrl-card p-4">
            <div className="flex items-center gap-2 mb-2">
              <Loader2 className="w-3.5 h-3.5 animate-spin text-red-500" />
              <span className="hrl-label">Importing {importProg.done}/{importProg.total}…</span>
            </div>
            <Progress value={(importProg.done / importProg.total) * 100} className="h-1" />
          </div>
        )}

        {/* Breadcrumbs */}
        <div className="flex items-center gap-1 text-xs text-muted-foreground">
          {breadcrumbs.map((b, i) => (
            <span key={i} className="flex items-center gap-1">
              {i > 0 && <ChevronRight className="w-3 h-3" />}
              <button
                className={cn("hover:text-foreground transition hrl-label", i === breadcrumbs.length - 1 && "text-foreground")}
                onClick={() => goToBreadcrumb(i)}
              >
                {b.name}
              </button>
            </span>
          ))}
        </div>

        {/* Files */}
        {filesLoading ? (
          <div className="flex items-center justify-center py-16 gap-2 text-muted-foreground">
            <Loader2 className="w-4 h-4 animate-spin" />
            <span className="hrl-label">Loading Drive…</span>
          </div>
        ) : (
          <div className="space-y-6">
            {/* Folders */}
            {folders.length > 0 && (
              <section>
                <h3 className="hrl-label text-muted-foreground mb-3">Folders</h3>
                <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-6 gap-2">
                  {folders.map(f => (
                    <button
                      key={f.id}
                      className="hrl-card p-3 text-center hover:border-yellow-500/30 transition group"
                      onClick={() => enterFolder(f)}
                    >
                      <Folder className="w-7 h-7 text-yellow-400/70 mx-auto mb-2 group-hover:text-yellow-400 transition" />
                      <p className="text-xs truncate">{f.name}</p>
                    </button>
                  ))}
                </div>
              </section>
            )}

            {/* Audio files */}
            {audioFiles.length > 0 && (
              <section>
                <div className="flex items-center justify-between mb-3">
                  <h3 className="hrl-label text-muted-foreground">Audio Files ({audioFiles.length})</h3>
                  <Button variant="ghost" size="sm" className="h-6 text-xs hrl-label"
                    onClick={() => {
                      const allSelected = audioFiles.every(f => selected.has(f.id));
                      setSelected(s => {
                        const n = new Set(s);
                        allSelected ? audioFiles.forEach(f => n.delete(f.id)) : audioFiles.forEach(f => n.add(f.id));
                        return n;
                      });
                    }}
                  >
                    {audioFiles.every(f => selected.has(f.id)) ? "Deselect all" : "Select all"}
                  </Button>
                </div>
                <div className="hrl-card overflow-hidden">
                  {audioFiles.map((f, i) => {
                    const isPlaying = player.track?.id === f.id && player.isPlaying;
                    const isSel = selected.has(f.id);
                    return (
                      <div
                        key={f.id}
                        className={cn(
                          "flex items-center gap-3 px-4 py-3 border-b border-border/50 last:border-0 cursor-pointer transition-colors",
                          isSel ? "bg-red-500/8" : "hover:bg-white/3"
                        )}
                        onClick={() => toggleSelect(f.id)}
                      >
                        {/* Checkbox */}
                        <div className={cn(
                          "w-4 h-4 rounded border flex items-center justify-center shrink-0 transition-colors",
                          isSel ? "bg-red-500 border-red-500" : "border-border"
                        )}>
                          {isSel && <Check className="w-2.5 h-2.5 text-white" />}
                        </div>

                        {/* Play button */}
                        <button
                          onClick={e => { e.stopPropagation(); previewAudio(f); }}
                          className={cn(
                            "w-7 h-7 rounded flex items-center justify-center shrink-0 transition",
                            isPlaying ? "bg-red-500/20 text-red-400" : "text-muted-foreground hover:text-foreground hover:bg-white/5"
                          )}
                        >
                          {isPlaying
                            ? <span className="w-3 h-3 flex items-end gap-px">{[1,2,3].map(b => <span key={b} className="w-px bg-red-500 animate-pulse-red rounded-full" style={{ height: `${4 + b * 2}px` }} />)}</span>
                            : <Play className="w-3.5 h-3.5 ml-0.5" />
                          }
                        </button>

                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium truncate">{f.name}</p>
                          <p className="hrl-label text-muted-foreground">{fmtSize(f.size)} · {new Date(f.modifiedTime).toLocaleDateString()}</p>
                        </div>

                        <button
                          onClick={e => { e.stopPropagation(); window.open(`https://drive.google.com/file/d/${f.id}/view`, "_blank"); }}
                          className="text-muted-foreground hover:text-foreground transition p-1"
                        >
                          <ExternalLink className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    );
                  })}
                </div>
              </section>
            )}

            {/* Google Docs (for lyrics) */}
            {docs.length > 0 && (
              <section>
                <h3 className="hrl-label text-muted-foreground mb-3">Google Docs (Lyrics)</h3>
                <div className="hrl-card overflow-hidden">
                  {docs.map(f => (
                    <div key={f.id} className="flex items-center gap-3 px-4 py-3 border-b border-border/50 last:border-0">
                      <FileText className="w-4 h-4 text-blue-400 shrink-0" />
                      <p className="flex-1 text-sm truncate">{f.name}</p>
                      <a
                        href={`/lyrics?docId=${f.id}&docName=${encodeURIComponent(f.name)}`}
                        className="hrl-label text-red-400 hover:text-red-300 transition text-[10px]"
                      >
                        IMPORT LYRICS
                      </a>
                      <a
                        href={`https://docs.google.com/document/d/${f.id}/edit`}
                        target="_blank" rel="noreferrer"
                        className="text-muted-foreground hover:text-foreground transition"
                        onClick={e => e.stopPropagation()}
                      >
                        <ExternalLink className="w-3.5 h-3.5" />
                      </a>
                    </div>
                  ))}
                </div>
              </section>
            )}

            {files.length === 0 && (
              <div className="text-center py-16 text-muted-foreground">
                <Folder className="w-10 h-10 mx-auto mb-4 opacity-30" />
                <p className="hrl-label">This folder is empty</p>
              </div>
            )}
          </div>
        )}
      </div>
    </Layout>
  );
}
