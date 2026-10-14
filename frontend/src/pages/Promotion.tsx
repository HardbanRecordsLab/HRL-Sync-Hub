import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ExternalLink, Loader2, Plus, Search, Trash2 } from "lucide-react";
import { toast } from "sonner";
import Layout from "@/components/Layout";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { api } from "@/lib/api";
import { cn } from "@/lib/utils";

type Partner = {
  id: string; name: string; kind: string; country: string | null; genres: string[]; audience: string | null; url: string | null;
  submission_url: string | null; contact_name: string | null; contact_email: string | null; cooperation: string; price_note: string | null;
  status: string; notes: string | null; source: string; submissions: number; wins: number;
};
type Submission = { id: string; partner_id: string; partner_name: string; track_id: number; track_title: string; status: string; sent_at: string | null; result_url: string | null; notes: string | null };
type Application = { id: string; name: string; kind: string; url: string; country: string | null; genres: string[]; audience: string | null; contact_name: string; contact_email: string; message: string | null; created_at: string };
type Data = { partners: Partner[]; submissions: Submission[]; applications: Application[]; kinds: Record<string, string> };

const COOP: Record<string, string> = { free: "Free", paid: "Paid", exchange: "Exchange", partnership: "Partnership", unknown: "Unknown" };
const STATUS: Record<string, string> = { prospect: "To verify", contacted: "Contacted", partner: "Partner", declined: "Declined" };
const SUB: Record<string, string> = { planned: "Planned", sent: "Sent", accepted: "Accepted", played: "Played / added", declined: "Declined", no_reply: "No reply" };
const statusTone = (s: string) => (s === "partner" || s === "played" || s === "accepted" ? "hrl-badge-ok" : s === "contacted" || s === "sent" ? "hrl-badge-warn" : "hrl-badge-dim");

const EMPTY = { name: "", kind: "spotify_playlist", country: "", genres: "", audience: "", url: "", submission_url: "", contact_name: "", contact_email: "", cooperation: "unknown", price_note: "", status: "prospect", notes: "" };

function PartnerDialog({ partner, kinds, onClose }: { partner: Partner | "new" | null; kinds: Record<string, string>; onClose: () => void }) {
  const qc = useQueryClient();
  const init = partner && partner !== "new"
    ? { ...EMPTY, ...Object.fromEntries(Object.entries(partner).map(([k, v]) => [k, v ?? ""])), genres: (partner.genres || []).join(", ") }
    : EMPTY;
  const [f, setF] = useState<Record<string, string>>(init as Record<string, string>);
  const save = useMutation({
    mutationFn: () => (partner === "new" ? api.post("/api/promo/partners", f) : api.put(`/api/promo/partners/${(partner as Partner).id}`, f)),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["promo"] }); toast.success("Saved"); onClose(); },
    onError: (e: Error) => toast.error(e.message),
  });
  const input = (k: string, label: string, props: Record<string, unknown> = {}) => (
    <label className="text-sm space-y-1"><span className="text-muted-foreground">{label}</span>
      <Input value={f[k] ?? ""} onChange={(e) => setF({ ...f, [k]: e.target.value })} {...props} /></label>
  );
  const select = (k: string, label: string, opts: Record<string, string>) => (
    <label className="text-sm space-y-1"><span className="text-muted-foreground">{label}</span>
      <select className="w-full h-10 rounded-md border border-border bg-background px-3" value={f[k]} onChange={(e) => setF({ ...f, [k]: e.target.value })}>
        {Object.entries(opts).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
      </select></label>
  );
  return (
    <Dialog open={!!partner} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-2xl max-h-[92vh] overflow-y-auto">
        <DialogHeader><DialogTitle>{partner === "new" ? "New partner" : f.name}</DialogTitle></DialogHeader>
        <form className="grid sm:grid-cols-2 gap-3" onSubmit={(e) => { e.preventDefault(); save.mutate(); }}>
          <div className="sm:col-span-2">{input("name", "Name *", { required: true })}</div>
          {select("kind", "Type", kinds)}
          {input("country", "Country")}
          {input("genres", "Genres (comma separated)")}
          {input("audience", "Reach (followers, listeners)")}
          {input("url", "Link", { placeholder: "https://…" })}
          {input("submission_url", "Submission form", { placeholder: "https://…" })}
          {input("contact_name", "Contact person")}
          {input("contact_email", "Contact e-mail", { type: "email" })}
          {select("cooperation", "Cooperation", COOP)}
          {input("price_note", "Price / terms")}
          {select("status", "Status", STATUS)}
          <label className="text-sm space-y-1 sm:col-span-2"><span className="text-muted-foreground">Notes</span>
            <Textarea rows={3} value={f.notes ?? ""} onChange={(e) => setF({ ...f, notes: e.target.value })} /></label>
          <div className="sm:col-span-2 flex gap-2">
            <button className="hrl-btn-primary px-4 py-2" disabled={save.isPending}>{save.isPending ? "Saving…" : "Save"}</button>
            <button type="button" className="px-4 py-2 rounded-lg border border-border" onClick={onClose}>Cancel</button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function SubmitDialog({ partner, onClose }: { partner: Partner | null; onClose: () => void }) {
  const qc = useQueryClient();
  const [q, setQ] = useState("");
  const [picked, setPicked] = useState<{ id: number; title: string }[]>([]);
  const [draft, setDraft] = useState<{ subject: string; body: string; share_url: string; ai: boolean; to: string | null } | null>(null);
  const { data: tracks = [] } = useQuery({
    queryKey: ["promo-track-search", q],
    queryFn: async () => (await api.get<{ tracks: { id: number; title: string; artist: string; genre: string }[] }>("/api/tracks", { search: q || undefined, limit: 20 })).tracks,
    enabled: !!partner,
  });
  const toggle = (t: { id: number; title: string }) =>
    setPicked((p) => (p.some((x) => x.id === t.id) ? p.filter((x) => x.id !== t.id) : p.length >= 10 ? p : [...p, t]));
  const pitch = useMutation({
    mutationFn: () => api.post<any>("/api/promo/pitch", { partner_id: partner!.id, track_ids: picked.map((t) => t.id) }),
    onSuccess: (d) => setDraft(d),
    onError: (e: Error) => toast.error(e.message),
  });
  const log = useMutation({
    mutationFn: async () => {
      for (const t of picked) {
        await api.post("/api/promo/submissions", { partner_id: partner!.id, track_id: t.id, status: "sent", notes: draft ? `Pitch link: ${draft.share_url}` : "" });
      }
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["promo"] }); toast.success(`Logged ${picked.length} track(s) as sent`); close(); },
    onError: (e: Error) => toast.error(e.message),
  });
  const close = () => { setDraft(null); setPicked([]); onClose(); };
  const copy = (text: string) => navigator.clipboard.writeText(text).then(() => toast.success("Copied"));
  const mailto = draft ? `mailto:${draft.to ?? ""}?subject=${encodeURIComponent(draft.subject)}&body=${encodeURIComponent(draft.body)}` : "";

  return (
    <Dialog open={!!partner} onOpenChange={(o) => { if (!o) close(); }}>
      <DialogContent className="max-w-2xl max-h-[92vh] overflow-y-auto">
        <DialogHeader><DialogTitle>Pitch to {partner?.name}</DialogTitle></DialogHeader>
        {!draft ? (
          <div className="space-y-3">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input className="pl-9" placeholder="Search the library…" value={q} onChange={(e) => setQ(e.target.value)} />
            </div>
            <div className="max-h-60 overflow-y-auto rounded-lg border border-border">
              {tracks.map((t) => {
                const on = picked.some((x) => x.id === t.id);
                return (
                  <button key={t.id} type="button" onClick={() => toggle(t)}
                    className={cn("w-full text-left px-3 py-2 text-sm border-b border-border/60 last:border-0 hover:bg-white/5 flex gap-2", on && "bg-violet-500/15")}>
                    <input type="checkbox" readOnly checked={on} className="accent-violet-500 mt-0.5" />
                    <span>{t.title} <span className="text-muted-foreground">· {[t.artist, t.genre].filter(Boolean).join(" · ")}</span></span>
                  </button>
                );
              })}
            </div>
            {picked.length > 0 && <p className="text-xs text-muted-foreground">Selected: {picked.map((t) => t.title).join(", ")}</p>}
            {partner?.submission_url && <a className="text-sm text-violet-300 inline-flex items-center gap-1" href={partner.submission_url} target="_blank" rel="noreferrer">They use a submission form <ExternalLink className="w-3.5 h-3.5" /></a>}
            <div className="flex flex-wrap gap-2">
              <button className="hrl-btn-primary px-4 py-2.5 inline-flex items-center gap-2" disabled={!picked.length || pitch.isPending} onClick={() => pitch.mutate()}>
                {pitch.isPending && <Loader2 className="w-4 h-4 animate-spin" />}Draft pitch e-mail
              </button>
              <button className="px-4 py-2.5 rounded-lg border border-border" disabled={!picked.length || log.isPending} onClick={() => log.mutate()}>Just log as sent</button>
            </div>
            <p className="text-xs text-muted-foreground">The draft includes a private listening link (watermarked previews; opens and plays appear in Analytics).</p>
          </div>
        ) : (
          <div className="space-y-3">
            <p className="text-xs text-muted-foreground">{draft.ai ? "Drafted with AI — read it once and adjust before sending." : "Template draft (AI unavailable) — personalise it before sending."}</p>
            <label className="text-sm space-y-1 block"><span className="text-muted-foreground">Subject</span>
              <Input value={draft.subject} onChange={(e) => setDraft({ ...draft, subject: e.target.value })} /></label>
            <label className="text-sm space-y-1 block"><span className="text-muted-foreground">Message</span>
              <Textarea rows={12} value={draft.body} onChange={(e) => setDraft({ ...draft, body: e.target.value })} /></label>
            <div className="flex flex-wrap gap-2">
              <a href={mailto} className="hrl-btn-primary px-4 py-2.5">Open in mail app</a>
              <button className="px-4 py-2.5 rounded-lg border border-border" onClick={() => copy(`${draft.subject}\n\n${draft.body}`)}>Copy</button>
              <button className="px-4 py-2.5 rounded-lg border border-border" disabled={log.isPending} onClick={() => log.mutate()}>Log as sent</button>
            </div>
            {!draft.to && <p className="text-xs text-amber-300">No e-mail saved for this partner — send it through their form or social profile, then log it.</p>}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

export default function Promotion() {
  const qc = useQueryClient();
  const { data, isLoading } = useQuery({ queryKey: ["promo"], queryFn: () => api.get<Data>("/api/promo") });
  const [tab, setTab] = useState<"partners" | "submissions" | "applications">("partners");
  const [editing, setEditing] = useState<Partner | "new" | null>(null);
  const [sending, setSending] = useState<Partner | null>(null);
  const [q, setQ] = useState("");
  const [kind, setKind] = useState("");

  const refresh = () => qc.invalidateQueries({ queryKey: ["promo"] });
  const seed = useMutation({ mutationFn: () => api.post<{ added: number }>("/api/promo/seed"), onSuccess: (r) => { toast.success(`Added ${r.added} starter entries`); refresh(); } });
  const del = useMutation({ mutationFn: (id: string) => api.delete(`/api/promo/partners/${id}`), onSuccess: refresh });
  const subUpdate = useMutation({ mutationFn: ({ id, status }: { id: string; status: string }) => api.patch(`/api/promo/submissions/${id}`, { status }), onSuccess: refresh });
  const appAction = useMutation({ mutationFn: ({ id, action }: { id: string; action: string }) => api.post(`/api/promo/applications/${id}/${action}`), onSuccess: refresh });

  const partners = useMemo(() => (data?.partners ?? []).filter((p) =>
    (!kind || p.kind === kind) && (!q || `${p.name} ${p.genres.join(" ")} ${p.country ?? ""}`.toLowerCase().includes(q.toLowerCase()))), [data, q, kind]);

  const kinds = data?.kinds ?? {};
  const followUps = (data?.submissions ?? []).filter((s) => s.status === "sent" && s.sent_at && Date.now() - new Date(s.sent_at).getTime() > 7 * 86400000);
  const stats = data ? {
    partners: data.partners.filter((p) => p.status === "partner").length,
    sent: data.submissions.filter((s) => s.status !== "planned").length,
    wins: data.submissions.filter((s) => s.status === "played" || s.status === "accepted").length,
  } : null;

  return (
    <Layout>
      <div className="animate-fade-in space-y-6">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="hrl-title">Promotion</h1>
            <p className="text-sm text-muted-foreground">Playlists, radios, curators and blogs that play and promote our artists</p>
          </div>
          <div className="flex gap-2">
            <a href="/partners" target="_blank" rel="noreferrer" className="px-3 py-2 rounded-lg border border-border text-sm inline-flex items-center gap-1">Public partner form <ExternalLink className="w-3.5 h-3.5" /></a>
            <button className="hrl-btn-primary px-4 py-2 inline-flex items-center gap-1" onClick={() => setEditing("new")}><Plus className="w-4 h-4" /> Add partner</button>
          </div>
        </div>

        {stats && (
          <div className="grid grid-cols-3 gap-3">
            <div className="hrl-card p-4"><p className="hrl-label">Active partners</p><p className="hrl-stat-value">{stats.partners}</p></div>
            <div className="hrl-card p-4"><p className="hrl-label">Tracks sent</p><p className="hrl-stat-value">{stats.sent}</p></div>
            <div className="hrl-card p-4"><p className="hrl-label">Added / played</p><p className="hrl-stat-value">{stats.wins}</p></div>
          </div>
        )}

        {followUps.length > 0 && (
          <div className="hrl-card p-4 border-amber-500/30 space-y-2">
            <p className="font-medium text-sm">Follow up ({followUps.length}) — sent over 7 days ago, no answer logged</p>
            {followUps.slice(0, 6).map((s) => (
              <div key={s.id} className="flex flex-wrap items-center gap-2 text-sm">
                <span className="flex-1 min-w-[200px]">{s.track_title} → <b>{s.partner_name}</b> <span className="text-muted-foreground">({s.sent_at ? new Date(s.sent_at).toLocaleDateString() : ""})</span></span>
                <button className="text-xs px-2.5 py-1 rounded-full border border-border" onClick={() => subUpdate.mutate({ id: s.id, status: "no_reply" })}>No reply</button>
                <button className="text-xs px-2.5 py-1 rounded-full border border-emerald-500/40 text-emerald-300" onClick={() => subUpdate.mutate({ id: s.id, status: "accepted" })}>Accepted</button>
              </div>
            ))}
          </div>
        )}

        <div className="flex gap-1 border-b border-border">
          {([["partners", `Partners (${data?.partners.length ?? 0})`], ["submissions", `Submissions (${data?.submissions.length ?? 0})`], ["applications", `Applications (${data?.applications.length ?? 0})`]] as const).map(([k, l]) => (
            <button key={k} onClick={() => setTab(k)} className={cn("px-4 py-2 text-sm -mb-px border-b-2", tab === k ? "border-violet-400 text-foreground" : "border-transparent text-muted-foreground hover:text-foreground")}>{l}</button>
          ))}
        </div>

        {isLoading || !data ? <div className="py-16 flex justify-center"><Loader2 className="w-5 h-5 animate-spin text-muted-foreground" /></div> : tab === "partners" ? (
          <div className="space-y-3">
            <div className="flex flex-wrap gap-3">
              <div className="relative flex-1 min-w-[220px]">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input className="pl-9 h-10" placeholder="Search name, genre, country…" value={q} onChange={(e) => setQ(e.target.value)} />
              </div>
              <select className="h-10 rounded-md border border-border bg-background px-3 text-sm" value={kind} onChange={(e) => setKind(e.target.value)}>
                <option value="">All types</option>
                {Object.entries(kinds).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
              </select>
            </div>
            {data.partners.length === 0 && (
              <div className="hrl-card p-8 text-center space-y-3">
                <p className="font-medium">No partners yet</p>
                <p className="text-sm text-muted-foreground">Start with a verified starter list of curator platforms and radio stations, or add your own contacts.</p>
                <button className="hrl-btn-primary px-4 py-2" onClick={() => seed.mutate()} disabled={seed.isPending}>Add starter list</button>
              </div>
            )}
            <div className="grid md:grid-cols-2 xl:grid-cols-3 gap-3">
              {partners.map((p) => (
                <div key={p.id} className="hrl-card p-4 space-y-2">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <button className="font-medium text-left hover:text-violet-300" onClick={() => setEditing(p)}>{p.name}</button>
                      <p className="text-xs text-muted-foreground">{[kinds[p.kind] ?? p.kind, p.country, p.audience].filter(Boolean).join(" · ")}</p>
                    </div>
                    <span className={statusTone(p.status)}>{STATUS[p.status] ?? p.status}</span>
                  </div>
                  {p.genres.length > 0 && <div className="flex flex-wrap gap-1">{p.genres.map((g) => <span key={g} className="hrl-badge-dim">{g}</span>)}</div>}
                  <p className="text-xs text-muted-foreground">{COOP[p.cooperation]}{p.price_note ? ` · ${p.price_note}` : ""}{p.submissions ? ` · sent ${p.submissions}, wins ${p.wins}` : ""}</p>
                  {p.notes && <p className="text-xs text-muted-foreground line-clamp-2">{p.notes}</p>}
                  <div className="flex items-center gap-3 pt-1 text-sm">
                    <button className="text-violet-300 hover:text-violet-200" onClick={() => setSending(p)}>Pitch tracks</button>
                    {p.url && <a className="text-muted-foreground hover:text-foreground inline-flex items-center gap-1" href={p.url} target="_blank" rel="noreferrer">Open <ExternalLink className="w-3 h-3" /></a>}
                    <button className="ml-auto text-muted-foreground hover:text-red-300" aria-label="Delete" onClick={() => { if (confirm(`Delete ${p.name}?`)) del.mutate(p.id); }}><Trash2 className="w-4 h-4" /></button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        ) : tab === "submissions" ? (
          <div className="hrl-card overflow-x-auto">
            {data.submissions.length === 0 ? <p className="p-6 text-sm text-muted-foreground">Nothing sent yet — open a partner and use “Pitch tracks”.</p> : (
              <table className="w-full text-sm">
                <thead className="text-xs text-muted-foreground border-b border-border"><tr>
                  <th className="text-left font-medium px-4 py-2">Date</th><th className="text-left font-medium px-3 py-2">Track</th>
                  <th className="text-left font-medium px-3 py-2">Partner</th><th className="text-left font-medium px-3 py-2">Status</th><th className="text-left font-medium px-4 py-2">Notes</th></tr></thead>
                <tbody>{data.submissions.map((s) => (
                  <tr key={s.id} className="border-b border-border/60 last:border-0">
                    <td className="px-4 py-2 whitespace-nowrap text-muted-foreground">{s.sent_at ? new Date(s.sent_at).toLocaleDateString() : "—"}</td>
                    <td className="px-3 py-2">{s.track_title}</td>
                    <td className="px-3 py-2">{s.partner_name}</td>
                    <td className="px-3 py-2">
                      <select className="h-8 rounded-md border border-border bg-background px-2" value={s.status} onChange={(e) => subUpdate.mutate({ id: s.id, status: e.target.value })}>
                        {Object.entries(SUB).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                      </select>
                    </td>
                    <td className="px-4 py-2 text-muted-foreground">{s.result_url ? <a className="text-violet-300" href={s.result_url} target="_blank" rel="noreferrer">result</a> : null} {s.notes}</td>
                  </tr>
                ))}</tbody>
              </table>
            )}
          </div>
        ) : (
          <div className="space-y-3">
            {data.applications.length === 0 && <p className="text-sm text-muted-foreground">No new applications. Share the public form: <a className="text-violet-300" href="/partners" target="_blank" rel="noreferrer">{window.location.origin}/partners</a></p>}
            {data.applications.map((a) => (
              <div key={a.id} className="hrl-card p-4 flex flex-wrap items-start gap-4">
                <div className="flex-1 min-w-[240px] text-sm space-y-1">
                  <p className="font-medium">{a.name} <span className="text-muted-foreground">· {kinds[a.kind] ?? a.kind}{a.country ? ` · ${a.country}` : ""}</span></p>
                  <a className="text-violet-300 break-all" href={a.url} target="_blank" rel="noreferrer">{a.url}</a>
                  <p className="text-muted-foreground">{[a.audience, a.genres.join(", ")].filter(Boolean).join(" · ")}</p>
                  <p>{a.contact_name} · <a className="text-violet-300" href={`mailto:${a.contact_email}`}>{a.contact_email}</a></p>
                  {a.message && <p className="text-muted-foreground whitespace-pre-line">{a.message}</p>}
                </div>
                <div className="flex gap-2">
                  <button className="hrl-btn-primary px-3 py-2" onClick={() => appAction.mutate({ id: a.id, action: "accept" })}>Add as partner</button>
                  <button className="px-3 py-2 rounded-lg border border-border" onClick={() => appAction.mutate({ id: a.id, action: "reject" })}>Reject</button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
      {editing && <PartnerDialog key={editing === "new" ? "new" : editing.id} partner={editing} kinds={kinds} onClose={() => setEditing(null)} />}
      <SubmitDialog partner={sending} onClose={() => setSending(null)} />
    </Layout>
  );
}
