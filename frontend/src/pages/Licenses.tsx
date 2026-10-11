import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2, ExternalLink } from "lucide-react";
import { toast } from "sonner";
import Layout from "@/components/Layout";
import { Input } from "@/components/ui/input";
import { api } from "@/lib/api";
import { cn } from "@/lib/utils";

type Order = {
  id: string; number: string | null; status: string; track_id: number; track_title: string; tier_name: string; price_grosze: number;
  buyer_name: string; buyer_email: string; buyer_company: string | null; project_title: string; download_count: number;
  paid_at: string | null; created_at: string;
};
type Tier = { code: string; name: string; summary: string; price_grosze: number | null; quote_only: boolean; active: boolean };
type Inquiry = { id: string; track_title: string | null; name: string; email: string; company: string | null; project: string; message: string | null; created_at: string };
type Data = { orders: Order[]; totals: { sold: number; revenue: number }; inquiries: Inquiry[]; tiers: Tier[]; stripe: boolean };

const STATUS: Record<string, string> = { paid: "Paid", pending: "Awaiting payment", expired: "Abandoned" };
const zl = (g: number) => `${(g / 100).toFixed(2)} zł`;

function TierRow({ t }: { t: Tier }) {
  const qc = useQueryClient();
  const [price, setPrice] = useState(t.price_grosze == null ? "" : String(t.price_grosze / 100));
  const save = useMutation({
    mutationFn: (body: Record<string, unknown>) => api.patch(`/api/licenses/admin/tiers/${t.code}`, body),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["license-admin"] }); toast.success("Saved"); },
    onError: (e: Error) => toast.error(e.message),
  });
  return (
    <div className="flex flex-wrap items-center gap-3 py-3 border-b border-border/60 last:border-0">
      <div className="flex-1 min-w-[200px]">
        <p className="font-medium">{t.name}</p>
        <p className="text-xs text-muted-foreground">{t.summary}</p>
      </div>
      {t.quote_only ? <span className="text-sm text-muted-foreground">Quote on request</span> : (
        <div className="flex items-center gap-2">
          <Input className="w-24 h-9" inputMode="decimal" value={price} onChange={(e) => setPrice(e.target.value)} aria-label={`${t.name} price`} />
          <span className="text-sm text-muted-foreground">zł</span>
          <button className="text-sm px-3 h-9 rounded-lg border border-border hover:bg-white/5" disabled={save.isPending}
            onClick={() => save.mutate({ price: price.replace(",", ".") })}>Save</button>
        </div>
      )}
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" className="accent-violet-500" checked={t.active} onChange={(e) => save.mutate({ active: e.target.checked })} /> On sale
      </label>
    </div>
  );
}

function ClearCatalog() {
  const qc = useQueryClient();
  const { data } = useQuery({
    queryKey: ["clearance-count"],
    queryFn: () => api.get<{ total: number }>("/api/tracks", { clearance: "not_cleared", limit: 1 }),
  });
  const clear = useMutation({
    mutationFn: () => api.post<{ updated: number }>("/api/licenses/admin/clear-catalog", { artist: "CMLP" }),
    onSuccess: (r) => { toast.success(`${r.updated} tracks are now available for licensing`); qc.invalidateQueries(); },
    onError: (e: Error) => toast.error(e.message),
  });
  const waiting = data?.total ?? 0;
  if (!waiting) return null;
  return (
    <div className="hrl-card p-5 flex flex-wrap items-center gap-4 border-amber-500/30">
      <div className="flex-1 min-w-[240px]">
        <p className="font-medium">{waiting} tracks are not cleared yet</p>
        <p className="text-sm text-muted-foreground">Only cleared tracks can be bought. Clear all CMLP tracks if you own both the master and the composition rights.</p>
      </div>
      <button className="hrl-btn-primary px-4 py-2.5" disabled={clear.isPending}
        onClick={() => { if (confirm("Mark all CMLP tracks as cleared for sync licensing?")) clear.mutate(); }}>
        {clear.isPending ? "Saving…" : "Clear all CMLP tracks"}
      </button>
    </div>
  );
}

export default function Licenses() {
  const { data, isLoading } = useQuery({ queryKey: ["license-admin"], queryFn: () => api.get<Data>("/api/licenses/admin/orders") });
  const base = window.location.origin;

  return (
    <Layout>
      <div className="animate-fade-in space-y-6">
        <div>
          <h1 className="hrl-title">Sales</h1>
          <p className="text-sm text-muted-foreground">Sync licences sold from the public catalog</p>
        </div>
        {isLoading || !data ? (
          <div className="py-16 flex justify-center"><Loader2 className="w-5 h-5 animate-spin text-muted-foreground" /></div>
        ) : (
          <>
            {!data.stripe && <p className="text-sm text-amber-300 bg-amber-500/10 border border-amber-500/25 rounded-lg px-3 py-2">Payments are not configured on the server — the shop shows prices but checkout is disabled.</p>}
            <ClearCatalog />
            <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
              <div className="hrl-card p-5"><p className="hrl-label">Licences sold</p><p className="hrl-stat-value">{data.totals.sold}</p></div>
              <div className="hrl-card p-5"><p className="hrl-label">Revenue</p><p className="hrl-stat-value">{zl(data.totals.revenue)}</p></div>
              <div className="hrl-card p-5"><p className="hrl-label">Quote requests</p><p className="hrl-stat-value">{data.inquiries.length}</p></div>
            </div>

            <div className="hrl-card p-5">
              <div className="flex items-center justify-between mb-2">
                <h2 className="text-base font-semibold">Prices</h2>
                <a href={`${base}/public-library`} target="_blank" rel="noreferrer" className="text-sm text-violet-300 inline-flex items-center gap-1">Public catalog <ExternalLink className="w-3.5 h-3.5" /></a>
              </div>
              {data.tiers.map((t) => <TierRow key={t.code} t={t} />)}
            </div>

            <div className="hrl-card overflow-hidden">
              <h2 className="text-base font-semibold px-5 pt-5 pb-3">Orders</h2>
              {data.orders.length === 0 ? <p className="px-5 pb-5 text-sm text-muted-foreground">No orders yet.</p> : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="text-xs text-muted-foreground border-y border-border">
                      <tr><th className="text-left font-medium px-5 py-2">Date</th><th className="text-left font-medium px-3 py-2">Licence</th><th className="text-left font-medium px-3 py-2">Track</th>
                        <th className="text-left font-medium px-3 py-2">Buyer</th><th className="text-left font-medium px-3 py-2">Project</th><th className="text-right font-medium px-5 py-2">Amount</th></tr>
                    </thead>
                    <tbody>
                      {data.orders.map((o) => (
                        <tr key={o.id} className="border-b border-border/60 last:border-0">
                          <td className="px-5 py-2.5 whitespace-nowrap text-muted-foreground">{new Date(o.paid_at || o.created_at).toLocaleDateString()}</td>
                          <td className="px-3 py-2.5 whitespace-nowrap">
                            {o.number ? <a className="text-violet-300" href={`${base}/license/verify/${o.number}`} target="_blank" rel="noreferrer">{o.number}</a>
                              : <span className={cn("hrl-badge-dim")}>{STATUS[o.status] || o.status}</span>}
                          </td>
                          <td className="px-3 py-2.5">{o.track_title}<span className="block text-xs text-muted-foreground">{o.tier_name}</span></td>
                          <td className="px-3 py-2.5">{o.buyer_company || o.buyer_name}<span className="block text-xs text-muted-foreground">{o.buyer_email}</span></td>
                          <td className="px-3 py-2.5">{o.project_title}</td>
                          <td className="px-5 py-2.5 text-right tabular-nums">{zl(o.price_grosze)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            <div className="hrl-card p-5">
              <h2 className="text-base font-semibold mb-3">Quote requests (Extended)</h2>
              {data.inquiries.length === 0 ? <p className="text-sm text-muted-foreground">None yet.</p> : data.inquiries.map((q) => (
                <div key={q.id} className="py-3 border-b border-border/60 last:border-0 text-sm">
                  <p><span className="font-medium">{q.name}</span>{q.company && ` · ${q.company}`} · <a className="text-violet-300" href={`mailto:${q.email}`}>{q.email}</a>
                    <span className="text-muted-foreground"> · {new Date(q.created_at).toLocaleDateString()}</span></p>
                  <p className="text-muted-foreground">{q.track_title ? `${q.track_title} — ` : ""}{q.project}</p>
                  {q.message && <p className="mt-1 whitespace-pre-line">{q.message}</p>}
                </div>
              ))}
            </div>
          </>
        )}
      </div>
    </Layout>
  );
}
