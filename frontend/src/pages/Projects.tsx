import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Kanban, Plus, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import Layout from "@/components/Layout";
import { api } from "@/lib/api";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { formatDistanceToNow } from "date-fns";

type Status = "to_do" | "sent" | "shortlist" | "licensed" | "archived";

const COLUMNS: { id: Status; label: string; color: string }[] = [
  { id: "to_do",     label: "TO DO",     color: "#6E648C" },
  { id: "sent",      label: "SENT",      color: "#60a5fa" },
  { id: "shortlist", label: "SHORTLIST", color: "#fbbf24" },
  { id: "licensed",  label: "LICENSED",  color: "#34d399" },
  { id: "archived",  label: "ARCHIVED",  color: "#4b4558" },
];

interface Project {
  id: string; name: string; status: Status; notes?: string;
  contact_name?: string; playlist_name?: string; updated_at: string;
}

const EMPTY = { name: "", status: "to_do" as Status, notes: "", contact_id: "", playlist_id: "" };

export default function Projects() {
  const qc = useQueryClient();
  const [open, setOpen]     = useState(false);
  const [form, setForm] = useState(EMPTY);

  const { data: projects = [], isLoading } = useQuery<Project[]>({
    queryKey: ["projects"],
    queryFn: () => api.get("/api/projects"),
  });

  const saveMut = useMutation({
    mutationFn: () => api.post("/api/projects", form),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["projects"] });
      setOpen(false); setForm(EMPTY);
      toast.success("Project created");
    },
    onError: (e: any) => toast.error(e.message),
  });

  const moveMut = useMutation({
    mutationFn: ({ id, status }: { id: string; status: Status }) =>
      api.patch(`/api/projects/${id}`, { status }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["projects"] }),
  });

  const deleteMut = useMutation({
    mutationFn: (id: string) => api.delete(`/api/projects/${id}`),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["projects"] }); toast.success("Deleted"); },
  });

  const byStatus = (s: Status) => projects.filter(p => p.status === s);

  return (
    <Layout>
      <div className="animate-fade-in space-y-6">
        <div className="flex items-end justify-between">
          <div>
            <h1 className="hrl-title text-5xl mb-1">PROJECTS</h1>
            <p className="hrl-label text-muted-foreground">Track pitch progress — drag cards to update status</p>
          </div>
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
              <Button className="hrl-btn-primary"><Plus className="w-3.5 h-3.5 mr-1.5" /> New Project</Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader><DialogTitle className="hrl-title text-2xl">NEW PROJECT</DialogTitle></DialogHeader>
              <div className="space-y-4 mt-3">
                <div>
                  <Label className="hrl-label mb-1.5 block">Project Name *</Label>
                  <Input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="e.g. Nike Summer 2025 Campaign" />
                </div>
                <div>
                  <Label className="hrl-label mb-1.5 block">Initial Status</Label>
                  <Select value={form.status} onValueChange={v => setForm(f => ({ ...f, status: v as Status }))}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {COLUMNS.map(c => <SelectItem key={c.id} value={c.id}>{c.label}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label className="hrl-label mb-1.5 block">Notes</Label>
                  <Input value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} placeholder="Brief notes…" />
                </div>
                <Button className="hrl-btn-primary w-full" disabled={!form.name || saveMut.isPending} onClick={() => saveMut.mutate()}>
                  {saveMut.isPending && <Loader2 className="w-3.5 h-3.5 mr-2 animate-spin" />}Create Project
                </Button>
              </div>
            </DialogContent>
          </Dialog>
        </div>

        {isLoading ? (
          <div className="flex items-center justify-center py-16 gap-2 text-muted-foreground">
            <Loader2 className="w-4 h-4 animate-spin" /><span className="hrl-label">Loading…</span>
          </div>
        ) : (
          <div className="grid grid-cols-5 gap-3 overflow-x-auto pb-2">
            {COLUMNS.map(col => (
              <div key={col.id} className="min-w-[200px]">
                {/* Column header */}
                <div className="flex items-center gap-2 mb-3 px-1">
                  <div className="w-2 h-2 rounded-full" style={{ background: col.color }} />
                  <span className="hrl-label" style={{ color: col.color }}>{col.label}</span>
                  <span className="hrl-label text-muted-foreground ml-auto">{byStatus(col.id).length}</span>
                </div>

                {/* Cards */}
                <div className="space-y-2">
                  {byStatus(col.id).map((p, i) => (
                    <div key={p.id} className={cn("hrl-card p-3 text-sm group animate-fade-in", `stagger-${Math.min(i+1,5)}`)}>
                      <p className="font-medium leading-tight mb-1.5">{p.name}</p>
                      {p.contact_name && <p className="hrl-label text-muted-foreground truncate">{p.contact_name}</p>}
                      {p.playlist_name && <p className="hrl-label text-muted-foreground truncate">{p.playlist_name}</p>}
                      {p.notes && <p className="text-xs text-muted-foreground mt-1.5 line-clamp-2">{p.notes}</p>}

                      {/* Move to */}
                      <div className="mt-3 pt-2 border-t border-border/50 opacity-0 group-hover:opacity-100 transition">
                        <Select
                          value={p.status}
                          onValueChange={v => moveMut.mutate({ id: p.id, status: v as Status })}
                        >
                          <SelectTrigger className="h-6 text-[10px] hrl-label border-border/50">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {COLUMNS.map(c => (
                              <SelectItem key={c.id} value={c.id} className="text-xs">
                                {c.label}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>

                      <div className="flex items-center justify-between mt-2">
                        <span className="hrl-label text-muted-foreground">
                          {formatDistanceToNow(new Date(p.updated_at), { addSuffix: true })}
                        </span>
                        <button
                          onClick={() => { if (confirm("Delete?")) deleteMut.mutate(p.id); }}
                          className="opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-red-400 transition"
                        >
                          ×
                        </button>
                      </div>
                    </div>
                  ))}

                  {byStatus(col.id).length === 0 && (
                    <div className="h-16 rounded border border-dashed border-border/40 flex items-center justify-center">
                      <span className="hrl-label text-muted-foreground opacity-50">empty</span>
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </Layout>
  );
}
