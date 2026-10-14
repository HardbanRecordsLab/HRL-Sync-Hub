import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Loader2, Music2, Play, Search, Sparkles, X } from "lucide-react";
import { usePlayer } from "@/components/player/PlayerProvider";
import { AudioPlayerBar } from "@/components/player/AudioPlayerBar";
import { Input } from "@/components/ui/input";
import { LicenseDialog } from "@/components/LicenseDialog";
import { api, streamUrl } from "@/lib/api";
import { cn } from "@/lib/utils";

type PublicTrack = {
  id: number; title: string; artist: string; duration: number | null; bpm: number | null; key: string | null;
  genre: string | null; moods: string[]; energy: string | null; vibe: string | null; vocals: boolean | null; vocal_gender: string | null;
  keywords: string[]; use_cases: string[]; instruments: string[]; genres: string[]; similarity?: number;
};

const fmt = (s: number | null) => (s ? `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}` : "—");

// Polish → English search terms (the catalogue analysis is in English).
const PL: Record<string, string[]> = {
  reklama: ["commercial", "advertisement", "ad", "brand"], reklamy: ["commercial", "advertisement"], kawa: ["coffee"], kawy: ["coffee"],
  samochód: ["car", "driving"], samochodu: ["car"], auto: ["car"], noc: ["night", "late night", "nocturnal"], nocny: ["night", "nocturnal"],
  spokojny: ["calm", "chill", "relaxed"], spokojna: ["calm", "chill", "relaxed"], relaks: ["relaxed", "chill"], smutny: ["melancholic", "sad"],
  smutna: ["melancholic", "sad"], energiczny: ["energetic", "upbeat", "driving"], energiczna: ["energetic", "upbeat"], romantyczny: ["romantic", "love"],
  romantyczna: ["romantic", "love"], miłość: ["love", "romantic"], film: ["film", "cinematic"], filmowy: ["cinematic", "film"], kobiecy: ["female"],
  kobieta: ["female"], męski: ["male"], wokal: ["vocal", "vocals"], instrumentalny: ["instrumental"], miasto: ["city", "urban"], miejski: ["urban", "city"],
  lato: ["summer"], letni: ["summer"], moda: ["fashion"], luksus: ["luxury"], luksusowy: ["luxury"], sport: ["sport", "workout"], trening: ["workout", "fitness"],
  podróż: ["travel"], podróże: ["travel"], jedzenie: ["food", "restaurant"], restauracja: ["restaurant", "dining"], kawiarnia: ["cafe", "coffee"],
  ślub: ["wedding"], wesele: ["wedding"], gra: ["game", "gaming"], gry: ["game", "gaming"], dokument: ["documentary"], technologia: ["tech", "technology"],
};

function haystack(t: PublicTrack) {
  return {
    strong: `${t.title} ${t.genre ?? ""} ${t.genres.join(" ")} ${t.moods.join(" ")}`.toLowerCase(),
    medium: `${t.keywords.join(" ")} ${t.use_cases.join(" ")} ${t.vocal_gender ?? ""}`.toLowerCase(),
    weak: `${t.instruments.join(" ")} ${t.vibe ?? ""} ${t.artist}`.toLowerCase(),
  };
}

function score(t: PublicTrack, terms: string[][]) {
  const h = haystack(t);
  let total = 0;
  for (const alternatives of terms) {
    let best = 0;
    for (const w of alternatives) best = Math.max(best, h.strong.includes(w) ? 3 : h.medium.includes(w) ? 2 : h.weak.includes(w) ? 1 : 0);
    if (!best) return 0; // every word must match somewhere
    total += best;
  }
  return total;
}

function Select({ value, onChange, label, options }: { value: string; onChange: (v: string) => void; label: string; options: [string, string][] }) {
  return (
    <select aria-label={label} value={value} onChange={(e) => onChange(e.target.value)}
      className={cn("h-9 rounded-md border bg-background px-2.5 text-sm", value ? "border-violet-500/60 text-foreground" : "border-border text-muted-foreground")}>
      <option value="">{label}</option>
      {options.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
    </select>
  );
}

/** Public catalog for supervisors: smart search, filters, "more like this", watermarked previews and licensing. */
export default function PublicLibrary() {
  const player = usePlayer();
  const [q, setQ] = useState("");
  const [mood, setMood] = useState("");
  const [energy, setEnergy] = useState("");
  const [vocals, setVocals] = useState("");
  const [tempo, setTempo] = useState("");
  const [genre, setGenre] = useState("");
  const [likeOf, setLikeOf] = useState<PublicTrack | null>(null);
  const [licensing, setLicensing] = useState<PublicTrack | null>(null);

  const { data: tracks = [], isLoading } = useQuery({
    queryKey: ["tracks", "public"],
    queryFn: async () => (await api.get<{ tracks: PublicTrack[] }>("/api/tracks/public")).tracks || [],
  });
  const { data: similar, isFetching: loadingSimilar } = useQuery({
    queryKey: ["tracks", "similar", likeOf?.id],
    queryFn: async () => (await api.get<{ tracks: PublicTrack[] }>(`/api/tracks/public/similar/${likeOf!.id}`)).tracks,
    enabled: !!likeOf,
  });

  // Filter options from the catalogue itself (most frequent first).
  const { moodOptions, genreOptions } = useMemo(() => {
    const count = (xs: string[]) => {
      const m = new Map<string, number>();
      xs.forEach((x) => m.set(x, (m.get(x) ?? 0) + 1));
      return [...m.entries()].sort((a, b) => b[1] - a[1]);
    };
    const families = tracks.flatMap((t) => (t.genre ?? "").split(/[\s/]+/).filter((w) => w.length > 3 && /^[A-Z&-]/.test(w) && !/^(Velvet|Cinematic|Introspective|Melancholic|Dark|Kinetic|Nocturnal|Driving|Warm|Smooth|Modern|Deep)$/.test(w)));
    return {
      moodOptions: count(tracks.flatMap((t) => t.moods)).slice(0, 24).map(([m]) => [m, m] as [string, string]),
      genreOptions: count(families).slice(0, 16).map(([g]) => [g.toLowerCase(), g] as [string, string]),
    };
  }, [tracks]);

  const filtersOn = !!(q || mood || energy || vocals || tempo || genre);
  const shown = useMemo(() => {
    if (likeOf) return similar ?? [];
    const terms = q.toLowerCase().split(/\s+/).filter((w) => w.length > 1).map((w) => [w, ...(PL[w] ?? [])]);
    let list = tracks.filter((t) =>
      (!mood || t.moods.includes(mood)) &&
      (!energy || (t.energy ?? "").toLowerCase() === energy) &&
      (!vocals || (vocals === "instrumental" ? t.vocals === false : vocals === "vocal" ? t.vocals === true : t.vocals === true && t.vocal_gender === vocals)) &&
      (!tempo || (t.bpm != null && (tempo === "slow" ? t.bpm < 90 : tempo === "mid" ? t.bpm >= 90 && t.bpm <= 120 : t.bpm > 120))) &&
      (!genre || `${t.genre ?? ""} ${t.genres.join(" ")}`.toLowerCase().includes(genre)));
    if (terms.length) {
      list = list.map((t) => ({ t, s: score(t, terms) })).filter((x) => x.s > 0).sort((a, b) => b.s - a.s).map((x) => x.t);
    }
    return list;
  }, [tracks, similar, likeOf, q, mood, energy, vocals, tempo, genre]);

  const clear = () => { setQ(""); setMood(""); setEnergy(""); setVocals(""); setTempo(""); setGenre(""); };
  const toItem = (t: PublicTrack) => ({ id: String(t.id), title: t.title, artist: t.artist, fileUrl: streamUrl(String(t.id)), duration: t.duration ?? undefined, bpm: t.bpm ?? undefined, key: t.key ?? undefined });
  const handlePlay = (t: PublicTrack) => player.play(toItem(t), shown.map(toItem));

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border">
        <div className="max-w-5xl mx-auto px-4 md:px-6 h-16 flex items-center gap-3">
          <img src="/favicon.png" alt="" className="w-8 h-8 object-contain rounded-md bg-white p-0.5" />
          <div>
            <p className="text-sm font-semibold leading-tight">HRL Sync Hub</p>
            <p className="text-xs text-muted-foreground leading-tight">Hardban Records Lab</p>
          </div>
          <a href="https://hardbanrecordslab.online/sync-hub/" className="ml-auto text-sm text-muted-foreground hover:text-foreground">Licensing enquiries</a>
        </div>
      </header>

      <main className={cn("max-w-5xl mx-auto px-4 md:px-6 py-8 md:py-12 space-y-5", player.track ? "pb-32" : "pb-16")}>
        <div className="space-y-2">
          <h1 className="text-3xl md:text-4xl font-semibold tracking-tight">Music catalog</h1>
          <p className="text-muted-foreground max-w-2xl">
            Original music from Hardban Records Lab for film, advertising, games and online content. Describe the scene you are
            scoring — “coffee commercial”, “late night city drive”, “female vocal, calm” — and license a track online in a minute:
            from 79 zł for online videos, 429 zł for ads and commercial use. Previews carry a soft audible watermark; the licensed file is clean.
          </p>
        </div>

        <div className="space-y-3">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input placeholder="Describe the mood, scene or use — e.g. luxury car ad, calm piano, summer travel vlog…" className="pl-9 h-11"
              value={q} onChange={(e) => { setQ(e.target.value); setLikeOf(null); }} aria-label="Search the catalog" />
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Select label="Mood" value={mood} onChange={(v) => { setMood(v); setLikeOf(null); }} options={moodOptions} />
            <Select label="Energy" value={energy} onChange={(v) => { setEnergy(v); setLikeOf(null); }} options={[["low", "Low"], ["medium", "Medium"], ["high", "High"]]} />
            <Select label="Vocals" value={vocals} onChange={(v) => { setVocals(v); setLikeOf(null); }} options={[["vocal", "With vocals"], ["female", "Female vocal"], ["male", "Male vocal"], ["instrumental", "Instrumental"]]} />
            <Select label="Tempo" value={tempo} onChange={(v) => { setTempo(v); setLikeOf(null); }} options={[["slow", "Slow (< 90 BPM)"], ["mid", "Medium (90–120)"], ["fast", "Fast (> 120)"]]} />
            <Select label="Genre" value={genre} onChange={(v) => { setGenre(v); setLikeOf(null); }} options={genreOptions} />
            {filtersOn && <button className="text-sm text-muted-foreground hover:text-foreground inline-flex items-center gap-1" onClick={clear}><X className="w-3.5 h-3.5" />Clear</button>}
            {!isLoading && !likeOf && <span className="ml-auto text-sm text-muted-foreground">{filtersOn ? `${shown.length} of ${tracks.length}` : tracks.length} tracks</span>}
          </div>
          {likeOf && (
            <div className="hrl-card px-4 py-3 flex items-center gap-3 text-sm">
              <Sparkles className="w-4 h-4 text-violet-300" />
              <span>Tracks like <b>{likeOf.title}</b>{loadingSimilar ? "…" : ""}</span>
              <button className="ml-auto text-muted-foreground hover:text-foreground inline-flex items-center gap-1" onClick={() => setLikeOf(null)}><X className="w-3.5 h-3.5" />Back to all</button>
            </div>
          )}
        </div>

        {isLoading ? (
          <div className="flex items-center justify-center py-20 gap-2 text-muted-foreground"><Loader2 className="w-5 h-5 animate-spin" /> <span className="text-sm">Loading catalog…</span></div>
        ) : shown.length === 0 ? (
          <div className="hrl-card text-center py-16 space-y-2">
            <Music2 className="w-10 h-10 mx-auto text-muted-foreground opacity-40" />
            <p className="text-muted-foreground">{tracks.length ? "Nothing matches — try fewer words or clear a filter." : "No tracks available yet."}</p>
            {filtersOn && <button className="text-sm text-violet-300 underline" onClick={clear}>Clear search and filters</button>}
          </div>
        ) : (
          <div className="hrl-card overflow-hidden">
            {shown.map((t, i) => {
              const active = player.track?.id === String(t.id);
              return (
                <div
                  key={t.id}
                  role="button" tabIndex={0}
                  onKeyDown={(e) => { if (e.key === "Enter") (active ? player.toggle() : handlePlay(t)); }}
                  onClick={() => (active ? player.toggle() : handlePlay(t))}
                  className={cn("grid items-center cursor-pointer gap-3 md:gap-4 px-3 md:px-4 py-3 border-b border-border/60 last:border-0 group hover:bg-white/[0.03] transition-colors cat-grid", active && "bg-violet-500/10")}
                >
                  <span className="w-8 h-8 flex items-center justify-center">
                    {active && player.isPlaying ? (
                      <span className="flex gap-0.5 items-end h-3.5">
                        {[1, 2, 3].map((b) => <span key={b} className="w-0.5 bg-violet-400 rounded-full animate-pulse-red" style={{ height: `${6 + b * 3}px`, animationDelay: `${b * 0.15}s` }} />)}
                      </span>
                    ) : (
                      <>
                        <span className={cn("text-xs text-muted-foreground tabular-nums group-hover:hidden", active && "hidden")}>{i + 1}</span>
                        <Play className={cn("w-4 h-4 text-violet-300 hidden group-hover:block", active && "block")} />
                      </>
                    )}
                  </span>
                  <span className="min-w-0 space-y-1">
                    <span className={cn("block text-sm font-medium truncate", active && "text-violet-300")}>
                      {t.title}
                    </span>
                    <span className="block text-xs text-muted-foreground truncate">
                      {[t.genre, t.bpm && `${t.bpm} BPM`, t.key, t.vocals === false ? "instrumental" : t.vocal_gender && `${t.vocal_gender} vocal`, fmt(t.duration)].filter(Boolean).join(" · ")}
                    </span>
                    {t.moods.length > 0 && (
                      <span className="hidden sm:flex flex-wrap gap-1">
                        {t.moods.slice(0, 4).map((m) => (
                          <button key={m} onClick={(e) => { e.stopPropagation(); setMood(m); setLikeOf(null); }} className="hrl-badge-dim hover:border-violet-500/40">{m}</button>
                        ))}
                      </span>
                    )}
                    {t.use_cases[0] && <span className="hidden md:block text-xs text-muted-foreground/80 truncate">Fits: {t.use_cases.slice(0, 2).join(" · ")}</span>}
                  </span>
                  <span className="flex items-center gap-2 justify-self-end">
                    <button onClick={(e) => { e.stopPropagation(); setLikeOf(t); window.scrollTo({ top: 0, behavior: "smooth" }); }}
                      className="hidden sm:inline-flex text-xs px-2.5 py-1.5 rounded-full border border-border text-muted-foreground hover:text-foreground" title="Find similar tracks">
                      More like this
                    </button>
                    <button onClick={(e) => { e.stopPropagation(); setLicensing(t); }}
                      className="text-xs font-medium px-3 py-1.5 rounded-full border border-violet-500/40 text-violet-200 hover:bg-violet-500/15">
                      License
                    </button>
                  </span>
                </div>
              );
            })}
          </div>
        )}

        <footer className="pt-6 text-xs text-muted-foreground flex flex-wrap gap-x-4 gap-y-1">
          <span>© Hardban Records Lab</span>
          <a href="/partners" className="hover:text-foreground">Play our music on your playlist or station</a>
          <a href="/terms" className="hover:text-foreground">Terms</a>
          <a href="/privacy" className="hover:text-foreground">Privacy</a>
          <a href="https://hardbanrecordslab.online/contact/" className="hover:text-foreground">Contact</a>
        </footer>
      </main>

      <LicenseDialog track={licensing} onClose={() => setLicensing(null)} />
      <AudioPlayerBar player={player} />
    </div>
  );
}
