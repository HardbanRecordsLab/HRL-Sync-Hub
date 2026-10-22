import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Check, Loader2 } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { api } from "@/lib/api";
import { getLang } from "@/lib/hrl/hrl-i18n";
import { cn } from "@/lib/utils";

type Tier = { code: string; name: string; summary: string; price: number | null; quote_only: boolean };
type TrackRef = { id: number | string; title: string; artist: string };

const TERMS_URL = "https://hardbanrecordslab.online/sync-license-terms/";

export function LicenseDialog({ track, onClose }: { track: TrackRef | null; onClose: () => void }) {
  const { data } = useQuery({
    queryKey: ["license-tiers"],
    queryFn: () => api.get<{ tiers: Tier[]; terms_url: string }>("/api/licenses/tiers"),
    enabled: !!track,
  });
  const tiers = data?.tiers ?? [];
  const [tier, setTier] = useState("online");
  const [form, setForm] = useState({ buyer_name: "", buyer_email: "", buyer_company: "", project_title: "", project_description: "" });
  const [terms, setTerms] = useState(false);
  const [waiver, setWaiver] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [sent, setSent] = useState(false);

  useEffect(() => { setError(""); setSent(false); setBusy(false); }, [track?.id]);

  const selected = tiers.find((t) => t.code === tier);
  const quote = !!selected?.quote_only;
  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setForm({ ...form, [k]: e.target.value });

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!track) return;
    setBusy(true); setError("");
    try {
      if (quote) {
        await api.post("/api/licenses/inquiry", {
          track_id: track.id, name: form.buyer_name, email: form.buyer_email, company: form.buyer_company,
          project: form.project_title, message: form.project_description,
        });
        setSent(true);
        setBusy(false);
      } else {
        const r = await api.post<{ url: string }>("/api/licenses/checkout", {
          track_id: track.id, tier, ...form, accept_terms: terms, accept_waiver: waiver, lang: getLang(),
        });
        window.location.href = r.url;
      }
    } catch (err) {
      setError((err as Error).message);
      setBusy(false);
    }
  };

  return (
    <Dialog open={!!track} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-xl max-h-[92vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>License “{track?.title}”</DialogTitle>
          <DialogDescription>{track?.artist} · one track, one project, worldwide, no time limit</DialogDescription>
        </DialogHeader>

        {sent ? (
          <div className="py-6 text-center space-y-2">
            <Check className="w-8 h-8 mx-auto text-emerald-400" />
            <p className="font-medium">Thank you — we will reply with a quote within 2 business days.</p>
          </div>
        ) : (
          <form onSubmit={submit} className="space-y-5">
            <div className="grid gap-2" role="radiogroup" aria-label="Licence tier">
              {tiers.map((t) => (
                <button
                  type="button" key={t.code} role="radio" aria-checked={tier === t.code}
                  onClick={() => setTier(t.code)}
                  className={cn("text-left rounded-lg border px-4 py-3 transition-colors",
                    tier === t.code ? "border-violet-500 bg-violet-500/10" : "border-border hover:border-violet-500/40")}
                >
                  <span className="flex items-center justify-between gap-3">
                    <span className="font-medium">{t.name}</span>
                    <span className="font-semibold tabular-nums">{t.price == null ? "Quote" : `$${t.price.toFixed(0)}`}</span>
                  </span>
                  <span className="block text-sm text-muted-foreground mt-0.5">{t.summary}</span>
                </button>
              ))}
            </div>

            <div className="grid sm:grid-cols-2 gap-3">
              <label className="text-sm space-y-1"><span>Full name *</span><Input required value={form.buyer_name} onChange={set("buyer_name")} autoComplete="name" /></label>
              <label className="text-sm space-y-1"><span>E-mail *</span><Input required type="email" value={form.buyer_email} onChange={set("buyer_email")} autoComplete="email" /></label>
              <label className="text-sm space-y-1 sm:col-span-2"><span>Company (optional)</span><Input value={form.buyer_company} onChange={set("buyer_company")} autoComplete="organization" /></label>
              <label className="text-sm space-y-1 sm:col-span-2"><span>Project title *</span>
                <Input required value={form.project_title} onChange={set("project_title")} placeholder="e.g. Autumn campaign 2026 — online spot" /></label>
              <label className="text-sm space-y-1 sm:col-span-2"><span>{quote ? "Tell us about the use (media, territory, duration)" : "Where will it be used? (optional)"}</span>
                <Textarea rows={2} value={form.project_description} onChange={set("project_description")} /></label>
            </div>

            {!quote && (
              <div className="space-y-2 text-sm">
                <label className="flex gap-2 items-start">
                  <input type="checkbox" className="mt-1 accent-violet-500" checked={terms} onChange={(e) => setTerms(e.target.checked)} required />
                  <span>I accept the <a href={data?.terms_url || TERMS_URL} target="_blank" rel="noreferrer" className="text-violet-300 underline">sync licence terms</a> and the <a href="https://hardbanrecordslab.online/privacy/" target="_blank" rel="noreferrer" className="text-violet-300 underline">privacy policy</a>.</span>
                </label>
                <label className="flex gap-2 items-start">
                  <input type="checkbox" className="mt-1 accent-violet-500" checked={waiver} onChange={(e) => setWaiver(e.target.checked)} required />
                  <span>I want the file and licence delivered immediately after payment and I acknowledge that I thereby lose the right to withdraw from the contract (art. 38(1)(13) Polish Consumer Rights Act).</span>
                </label>
              </div>
            )}

            {error && <p className="text-sm text-red-300 bg-red-500/10 border border-red-500/25 rounded-lg px-3 py-2" role="alert">{error}</p>}

            <button type="submit" disabled={busy || !selected || (!quote && (!terms || !waiver))}
              className="hrl-btn-primary w-full py-2.5 flex items-center justify-center gap-2 disabled:opacity-50">
              {busy && <Loader2 className="w-4 h-4 animate-spin" />}
              {quote ? "Request a quote" : `Pay $${selected?.price?.toFixed(0) ?? ""}`}
            </button>
            {!quote && <p className="text-xs text-muted-foreground text-center">Secure payment by Stripe. Price is final (seller exempt from VAT). You get the clean, full-quality file plus ready-made 30 s and 60 s edits, and a PDF licence by e-mail right away.</p>}
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
