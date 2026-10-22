import { useEffect, useState } from "react";
import { Link, useParams, useSearchParams } from "react-router-dom";
import { CheckCircle2, Download, FileText, Loader2, ShieldCheck, XCircle } from "lucide-react";
import { api } from "@/lib/api";
import HrlLangSwitch from "@/lib/hrl/HrlLangSwitch";

type OrderStatus = {
  number: string | null; status: string; track_title: string; track_artist: string; tier_name: string; price: number;
  project_title: string; download_url?: string; certificate_url?: string; verify_url?: string; edit_urls?: Record<string, string>;
};
type Verification = {
  valid: boolean; number: string; track_title: string; track_artist: string; tier_name: string; project_title: string;
  licensee: string; granted_at: string; terms_url: string;
};

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border">
        <div className="max-w-3xl mx-auto px-4 h-16 flex items-center gap-3">
          <img src="/favicon.png" alt="" className="w-8 h-8 object-contain rounded-md bg-white p-0.5" />
          <div>
            <p className="text-sm font-semibold leading-tight">HRL Sync Hub</p>
            <p className="text-xs text-muted-foreground leading-tight">Hardban Records Lab</p>
          </div>
          <div className="ml-auto"><HrlLangSwitch /></div>
          <Link to="/public-library" className="text-sm text-muted-foreground hover:text-foreground">Music catalog</Link>
        </div>
      </header>
      <main className="max-w-3xl mx-auto px-4 py-10">{children}</main>
    </div>
  );
}

/** /license/success?session_id=… — Stripe redirects here; we poll until the payment is confirmed. */
export function LicenseSuccess() {
  const [params] = useSearchParams();
  const sid = params.get("session_id") || "";
  const [order, setOrder] = useState<OrderStatus | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    let stop = false;
    let tries = 0;
    const tick = async () => {
      try {
        const o = await api.get<OrderStatus>(`/api/licenses/session/${encodeURIComponent(sid)}`);
        if (stop) return;
        setOrder(o);
        if (o.status === "pending" && tries++ < 20) setTimeout(tick, 2000);
      } catch (e) {
        if (!stop) setError((e as Error).message);
      }
    };
    if (sid) tick(); else setError("Missing payment reference.");
    return () => { stop = true; };
  }, [sid]);

  return (
    <Shell>
      {error ? (
        <div className="hrl-card p-8 text-center space-y-2">
          <XCircle className="w-8 h-8 mx-auto text-red-400" />
          <p>{error}</p>
          <p className="text-sm text-muted-foreground">If you were charged, write to licensing@hardbanrecordslab.online — we will sort it out.</p>
        </div>
      ) : !order || order.status === "pending" ? (
        <div className="hrl-card p-10 text-center space-y-3">
          <Loader2 className="w-8 h-8 mx-auto animate-spin text-violet-400" />
          <p>Confirming your payment…</p>
        </div>
      ) : order.status !== "paid" ? (
        <div className="hrl-card p-8 text-center space-y-2">
          <XCircle className="w-8 h-8 mx-auto text-red-400" />
          <p>The payment was not completed.</p>
          <Link to="/public-library" className="text-violet-300 underline text-sm">Back to the catalog</Link>
        </div>
      ) : (
        <div className="hrl-card p-8 space-y-6">
          <div className="flex items-start gap-3">
            <CheckCircle2 className="w-8 h-8 text-emerald-400 shrink-0" />
            <div>
              <h1 className="text-2xl font-semibold">Your licence is ready</h1>
              <p className="text-muted-foreground">We have also sent everything to your e-mail.</p>
            </div>
          </div>
          <dl className="grid sm:grid-cols-2 gap-x-6 gap-y-3 text-sm">
            <div><dt className="text-muted-foreground">Licence no.</dt><dd className="font-semibold">{order.number}</dd></div>
            <div><dt className="text-muted-foreground">Tier</dt><dd>{order.tier_name} · {order.price.toFixed(2)} zł</dd></div>
            <div><dt className="text-muted-foreground">Track</dt><dd>{order.track_title} — {order.track_artist}</dd></div>
            <div><dt className="text-muted-foreground">Project</dt><dd>{order.project_title}</dd></div>
          </dl>
          <div className="flex flex-wrap gap-3">
            <a href={order.download_url} className="hrl-btn-primary inline-flex items-center gap-2 px-4 py-2.5"><Download className="w-4 h-4" /> Download the track</a>
            {order.edit_urls && Object.entries(order.edit_urls).map(([sec, url]) => (
              <a key={sec} href={url} className="inline-flex items-center gap-2 px-4 py-2.5 rounded-lg border border-border hover:bg-white/5 text-sm"><Download className="w-4 h-4" /> {sec} s edit</a>
            ))}
            <a href={order.certificate_url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-2 px-4 py-2.5 rounded-lg border border-border hover:bg-white/5 text-sm"><FileText className="w-4 h-4" /> Licence certificate (PDF)</a>
          </div>
          <p className="text-xs text-muted-foreground">The download link works for 30 days. If a platform such as YouTube raises a claim on your video, send the licence number to licensing@hardbanrecordslab.online.</p>
        </div>
      )}
    </Shell>
  );
}

/** /license/verify/:number — public check that a licence exists (for clients and platform disputes). */
export function LicenseVerify() {
  const { number = "" } = useParams();
  const [v, setV] = useState<Verification | null>(null);
  const [missing, setMissing] = useState(false);
  useEffect(() => {
    api.get<Verification>(`/api/licenses/verify/${encodeURIComponent(number)}`).then(setV).catch(() => setMissing(true));
  }, [number]);
  return (
    <Shell>
      {missing ? (
        <div className="hrl-card p-8 text-center space-y-2">
          <XCircle className="w-8 h-8 mx-auto text-red-400" />
          <p className="font-medium">No valid licence with number {number.toUpperCase()}.</p>
          <p className="text-sm text-muted-foreground">Questions: licensing@hardbanrecordslab.online</p>
        </div>
      ) : !v ? (
        <div className="py-16 flex justify-center"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>
      ) : (
        <div className="hrl-card p-8 space-y-5">
          <div className="flex items-center gap-3">
            <ShieldCheck className="w-8 h-8 text-emerald-400" />
            <div>
              <h1 className="text-xl font-semibold">Valid sync licence</h1>
              <p className="text-sm text-muted-foreground">{v.number}</p>
            </div>
          </div>
          <dl className="grid sm:grid-cols-2 gap-x-6 gap-y-3 text-sm">
            <div><dt className="text-muted-foreground">Track</dt><dd>{v.track_title} — {v.track_artist}</dd></div>
            <div><dt className="text-muted-foreground">Licensee</dt><dd>{v.licensee}</dd></div>
            <div><dt className="text-muted-foreground">Project</dt><dd>{v.project_title}</dd></div>
            <div><dt className="text-muted-foreground">Tier</dt><dd>{v.tier_name}</dd></div>
            <div><dt className="text-muted-foreground">Granted</dt><dd>{new Date(v.granted_at).toLocaleDateString()}</dd></div>
            <div><dt className="text-muted-foreground">Licensor</dt><dd>HardbanRecords Lab (Kamil Skomra)</dd></div>
          </dl>
          <a href={v.terms_url} target="_blank" rel="noreferrer" className="text-sm text-violet-300 underline">Licence terms</a>
        </div>
      )}
    </Shell>
  );
}
