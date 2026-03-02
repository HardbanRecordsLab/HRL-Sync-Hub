import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Users, Plus, Search, Edit2, Trash2, Loader2, Mail, Phone, Building } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import Layout from "@/components/Layout";
import { api } from "@/lib/api";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

interface Contact {
  id: string; name: string; email?: string; phone?: string;
  company?: string; role?: string; notes?: string; tags?: string[];
}

const EMPTY = { name: "", email: "", phone: "", company: "", role: "", notes: "", tags: "" };

export default function Contacts() {
  const qc = useQueryClient();
  const [search, setSearch] = useState("");
  const [open, setOpen]     = useState(false);
  const [editing, setEditing] = useState<Contact | null>(null);
  const [form, setForm] = useState(EMPTY);

  const { data: contacts = [], isLoading } = useQuery<Contact[]>({
    queryKey: ["contacts"],
    queryFn: () => api.get("/api/contacts"),
  });

  const filtered = contacts.filter(c =>
    !search || `${c.name} ${c.company} ${c.email}`.toLowerCase().includes(search.toLowerCase())
  );

  const saveMut = useMutation({
    mutationFn: () => {
      const payload = { ...form, tags: form.tags ? form.tags.split(",").map(t => t.trim()) : undefined };
      return editing ? api.patch(`/api/contacts/${editing.id}`, payload) : api.post("/api/contacts", payload);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["contacts"] });
      setOpen(false); setEditing(null); setForm(EMPTY);
      toast.success(editing ? "Contact updated" : "Contact added");
    },
    onError: (e: any) => toast.error(e.message),
  });

  const deleteMut = useMutation({
    mutationFn: (id: string) => api.delete(`/api/contacts/${id}`),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["contacts"] }); toast.success("Deleted"); },
  });

  const openEdit = (c: Contact) => {
    setEditing(c);
    setForm({ name: c.name, email: c.email ?? "", phone: c.phone ?? "", company: c.company ?? "", role: c.role ?? "", notes: c.notes ?? "", tags: c.tags?.join(", ") ?? "" });
    setOpen(true);
  };

  const f = (k: string, v: string) => setForm(p => ({ ...p, [k]: v }));

  return (
    <Layout>
      <div className="animate-fade-in space-y-6">
        <div className="flex items-end justify-between">
          <div>
            <h1 className="hrl-title text-5xl mb-1">CONTACTS</h1>
            <p className="hrl-label text-muted-foreground">{contacts.length} supervisor{contacts.length !== 1 ? "s" : ""} & clients</p>
          </div>
          <Dialog open={open} onOpenChange={v => { setOpen(v); if (!v) { setEditing(null); setForm(EMPTY); } }}>
            <DialogTrigger asChild>
              <Button className="hrl-btn-primary"><Plus className="w-3.5 h-3.5 mr-1.5" /> Add Contact</Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader><DialogTitle className="hrl-title text-2xl">{editing ? "EDIT" : "NEW"} CONTACT</DialogTitle></DialogHeader>
              <div className="space-y-3 mt-3">
                <div className="grid grid-cols-2 gap-3">
                  <div><Label className="hrl-label mb-1 block">Name *</Label><Input value={form.name} onChange={e => f("name", e.target.value)} /></div>
                  <div><Label className="hrl-label mb-1 block">Email</Label><Input type="email" value={form.email} onChange={e => f("email", e.target.value)} /></div>
                  <div><Label className="hrl-label mb-1 block">Phone</Label><Input value={form.phone} onChange={e => f("phone", e.target.value)} /></div>
                  <div><Label className="hrl-label mb-1 block">Company</Label><Input value={form.company} onChange={e => f("company", e.target.value)} /></div>
                  <div className="col-span-2"><Label className="hrl-label mb-1 block">Role</Label><Input value={form.role} onChange={e => f("role", e.target.value)} placeholder="Music Supervisor, Ad Agency…" /></div>
                  <div className="col-span-2"><Label className="hrl-label mb-1 block">Tags (comma separated)</Label><Input value={form.tags} onChange={e => f("tags", e.target.value)} placeholder="TV, Film, Advertising" /></div>
                  <div className="col-span-2"><Label className="hrl-label mb-1 block">Notes</Label><Textarea value={form.notes} onChange={e => f("notes", e.target.value)} rows={3} /></div>
                </div>
                <Button className="hrl-btn-primary w-full" disabled={!form.name || saveMut.isPending} onClick={() => saveMut.mutate()}>
                  {saveMut.isPending ? <Loader2 className="w-3.5 h-3.5 mr-2 animate-spin" /> : null}
                  {editing ? "Update" : "Save"} Contact
                </Button>
              </div>
            </DialogContent>
          </Dialog>
        </div>

        <div className="relative max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
          <Input placeholder="Search contacts…" className="pl-9 h-9 text-sm" value={search} onChange={e => setSearch(e.target.value)} />
        </div>

        {isLoading ? (
          <div className="flex items-center justify-center py-16 gap-2 text-muted-foreground">
            <Loader2 className="w-4 h-4 animate-spin" /><span className="hrl-label">Loading…</span>
          </div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-16">
            <Users className="w-10 h-10 mx-auto mb-4 text-muted-foreground opacity-30" />
            <p className="hrl-title text-2xl text-muted-foreground">{search ? "NO RESULTS" : "NO CONTACTS"}</p>
          </div>
        ) : (
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-3">
            {filtered.map((c, i) => (
              <div key={c.id} className={cn("hrl-card p-4 group animate-fade-in", `stagger-${Math.min(i+1,5)}`)}>
                <div className="flex items-start justify-between mb-3">
                  <div>
                    <p className="font-semibold text-sm">{c.name}</p>
                    {c.role && <p className="hrl-label text-muted-foreground mt-0.5">{c.role}</p>}
                  </div>
                  <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition">
                    <button onClick={() => openEdit(c)} className="p-1 rounded text-muted-foreground hover:text-foreground hover:bg-white/5 transition"><Edit2 className="w-3 h-3" /></button>
                    <button onClick={() => { if (confirm("Delete?")) deleteMut.mutate(c.id); }} className="p-1 rounded text-muted-foreground hover:text-red-400 hover:bg-red-500/8 transition"><Trash2 className="w-3 h-3" /></button>
                  </div>
                </div>
                <div className="space-y-1.5">
                  {c.company && <div className="flex items-center gap-2 text-xs text-muted-foreground"><Building className="w-3 h-3 shrink-0" />{c.company}</div>}
                  {c.email   && <div className="flex items-center gap-2 text-xs text-muted-foreground"><Mail className="w-3 h-3 shrink-0" /><a href={`mailto:${c.email}`} className="hover:text-foreground transition truncate">{c.email}</a></div>}
                  {c.phone   && <div className="flex items-center gap-2 text-xs text-muted-foreground"><Phone className="w-3 h-3 shrink-0" />{c.phone}</div>}
                </div>
                {c.tags?.length ? (
                  <div className="flex flex-wrap gap-1 mt-3">
                    {c.tags.map(t => <span key={t} className="hrl-badge-dim">{t}</span>)}
                  </div>
                ) : null}
              </div>
            ))}
          </div>
        )}
      </div>
    </Layout>
  );
}
