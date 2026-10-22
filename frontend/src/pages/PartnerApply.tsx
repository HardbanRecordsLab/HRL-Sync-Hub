import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Check, Loader2 } from "lucide-react";
import { Link } from "react-router-dom";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { api } from "@/lib/api";
import HrlLangSwitch from "@/lib/hrl/HrlLangSwitch";

/** /partners — playlist curators, radios, DJs and creators apply to play and promote HRL music. */
export default function PartnerApply() {
  const { data: kinds = {} } = useQuery({ queryKey: ["promo-kinds"], queryFn: () => api.get<Record<string, string>>("/api/promo/public/kinds") });
  const [f, setF] = useState({ name: "", kind: "spotify_playlist", url: "", country: "", genres: "", audience: "", contact_name: "", contact_email: "", message: "" });
  const [consent, setConsent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState("");
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => setF({ ...f, [k]: e.target.value });

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true); setError("");
    try {
      await api.post("/api/promo/public/apply", { ...f, genres: f.genres.split(",").map((x) => x.trim()).filter(Boolean), consent });
      setDone(true);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

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
      <main className="max-w-3xl mx-auto px-4 py-10 space-y-6">
        <div className="space-y-2">
          <h1 className="text-3xl font-semibold tracking-tight">Play our music — become a partner</h1>
          <p className="text-muted-foreground">
            Run a playlist, a radio station or show, a YouTube channel, a podcast, a blog or a DJ night? We are looking for partners
            to feature music from Hardban Records Lab artists — neo-soul, jazz, R&amp;B, chill, house and more. Tell us about your
            outlet and we will get back to you with new releases and the terms of cooperation.
          </p>
        </div>

        {done ? (
          <div className="hrl-card p-8 text-center space-y-2">
            <Check className="w-8 h-8 mx-auto text-emerald-400" />
            <p className="font-medium">Thank you — we will reply within a few business days.</p>
            <Link to="/public-library" className="text-sm text-violet-300 underline">Listen to the catalog meanwhile</Link>
          </div>
        ) : (
          <form onSubmit={submit} className="hrl-card p-6 grid sm:grid-cols-2 gap-4">
            <label className="text-sm space-y-1 sm:col-span-2"><span>Name of your playlist / station / channel *</span><Input required value={f.name} onChange={set("name")} /></label>
            <label className="text-sm space-y-1"><span>Type *</span>
              <select className="w-full h-10 rounded-md border border-border bg-background px-3" value={f.kind} onChange={set("kind")}>
                {Object.entries(kinds).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
              </select></label>
            <label className="text-sm space-y-1"><span>Link *</span><Input required type="url" placeholder="https://…" value={f.url} onChange={set("url")} /></label>
            <label className="text-sm space-y-1"><span>Genres you play</span><Input placeholder="e.g. neo-soul, jazz, chill" value={f.genres} onChange={set("genres")} /></label>
            <label className="text-sm space-y-1"><span>Reach</span><Input placeholder="followers / listeners" value={f.audience} onChange={set("audience")} /></label>
            <label className="text-sm space-y-1"><span>Country</span><Input value={f.country} onChange={set("country")} /></label>
            <label className="text-sm space-y-1"><span>Your name *</span><Input required value={f.contact_name} onChange={set("contact_name")} autoComplete="name" /></label>
            <label className="text-sm space-y-1 sm:col-span-2"><span>E-mail *</span><Input required type="email" value={f.contact_email} onChange={set("contact_email")} autoComplete="email" /></label>
            <label className="text-sm space-y-1 sm:col-span-2"><span>Anything else? (how you work with artists, fees, schedule)</span><Textarea rows={3} value={f.message} onChange={set("message")} /></label>
            <label className="sm:col-span-2 flex gap-2 items-start text-sm">
              <input type="checkbox" className="mt-1 accent-violet-500" checked={consent} onChange={(e) => setConsent(e.target.checked)} required />
              <span>I agree that Hardban Records Lab stores these details to discuss a cooperation, as described in the <a className="text-violet-300 underline" href="https://hardbanrecordslab.online/privacy/" target="_blank" rel="noreferrer">privacy policy</a>.</span>
            </label>
            {error && <p className="sm:col-span-2 text-sm text-red-300 bg-red-500/10 border border-red-500/25 rounded-lg px-3 py-2" role="alert">{error}</p>}
            <button className="sm:col-span-2 hrl-btn-primary py-2.5 flex items-center justify-center gap-2" disabled={busy || !consent}>
              {busy && <Loader2 className="w-4 h-4 animate-spin" />}Send
            </button>
          </form>
        )}
      </main>
    </div>
  );
}
