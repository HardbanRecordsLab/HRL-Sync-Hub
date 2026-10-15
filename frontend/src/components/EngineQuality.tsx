import { cn } from "@/lib/utils";

/** Metadata Engine 3.0 quality block for the track page: trust grade + why, what the audio model heard, tempo consensus, sync-readiness and what was corrected. */
const FLAG_TEXT: Record<string, string> = {
  "genre:llm_vs_hearing": "Text model and audio model disagree about the genre family",
  "genre:llm_vs_context": "Genre contradicts the context",
  "tempo:estimators_disagree": "Tempo estimators disagree – check the BPM",
  "tempo:octave_ambiguous": "Tempo could also be felt at half/double speed",
  "tempo:half_double_ambiguity": "Unusual tempo – maybe half/double",
  "tempo:slow_for_dance_context": "Slow for a dance track",
  "energy:llm_vs_dsp": "Stated energy does not match the measured level",
  "vocals:sources_disagree": "Sources disagree about vocals",
};
const flagText = (f: string) => FLAG_TEXT[f] ?? (f.startsWith("vocals:") ? "Vocals conflict with what was declared" : f);
const grade = (g?: string) =>
  g === "A" ? "bg-emerald-500/15 text-emerald-400 border-emerald-500/40" : g === "B" ? "bg-sky-500/15 text-sky-400 border-sky-500/40"
  : g === "C" ? "bg-amber-500/15 text-amber-400 border-amber-500/40" : "bg-red-500/15 text-red-400 border-red-500/40";

export function hasEngineData(m: any) {
  return !!(m && (m.trust || m.engine3 || m.hearing || m.syncReadiness));
}

export default function EngineQuality({ m }: { m: any }) {
  if (!hasEngineData(m)) return null;
  const e3 = m.engine3 ?? {};
  const hearing = m.hearing ?? e3.hearing;
  const tempo = m.tempoAnalysis ?? e3.tempoAnalysis;
  const sync = m.syncReadiness;
  const prev = e3.previous ?? {};
  const vv = hearing?.vocal_verdict;
  const singer = vv?.hasVocals === false ? "Instrumental" : vv?.hasVocals === true ? `Vocals${vv.gender ? ` (${vv.gender})` : ""}` : "Unclear";
  return (
    <section className="hrl-card p-5 space-y-4">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <h2 className="text-base font-semibold">Engine 3.0 quality</h2>
        {m.trust && (
          <div className="flex items-center gap-2">
            {m.trust.needsReview && <span className="text-xs px-2 py-0.5 rounded-full border border-amber-500/40 text-amber-400">Needs review</span>}
            <span className={cn("text-xs font-bold px-2.5 py-1 rounded-full border", grade(m.trust.grade))}>Trust {m.trust.grade} · {Math.round((m.trust.score ?? 0) * 100)}%</span>
          </div>
        )}
      </div>

      {m.trust?.flags?.length > 0 && <ul className="space-y-1">{m.trust.flags.map((f: string) => <li key={f} className="text-sm text-amber-400">⚠ {flagText(f)}</li>)}</ul>}
      {m.genreCorrected && <p className="text-sm text-muted-foreground">Genre corrected from <b>{m.genreCorrected.from}</b> ({String(m.genreCorrected.reason).replace("+", " + ")})</p>}
      {(prev.genre || prev.bpm) && (
        <p className="text-sm text-muted-foreground">Updated by the engine – previously {[prev.genre && `genre “${prev.genre}”`, prev.bpm && `${prev.bpm} BPM`].filter(Boolean).join(", ")}.</p>
      )}

      {hearing && (
        <div className="text-sm">
          <p className="hrl-label mb-1.5">What the audio model hears</p>
          <div className="flex flex-wrap gap-1.5 mb-1.5">
            {(hearing.genre ?? []).slice(0, 4).map((g: any) => <span key={g.label} className="text-xs px-2 py-0.5 rounded-full bg-violet-500/15 text-violet-300">{g.label} {Math.round(g.p * 100)}%</span>)}
          </div>
          <p className="text-muted-foreground">
            Mood: {(hearing.mood ?? []).slice(0, 3).map((x: any) => x.label).join(", ") || "–"} · Instruments: {(hearing.instrument ?? []).slice(0, 3).map((x: any) => x.label).join(", ") || "–"} · {singer}
          </p>
        </div>
      )}

      {tempo && (
        <p className="text-sm text-muted-foreground">
          <span className="hrl-label mr-2">Tempo</span><b className="text-foreground">{tempo.bpm} BPM</b> · {Math.round((tempo.agreement ?? 0) * 100)}% of estimators agree
          {tempo.alternatives?.length ? ` · also read as ${tempo.alternatives.join(" / ")}` : ""}
        </p>
      )}

      {sync && (
        <div>
          <p className="hrl-label mb-1.5">Sync readiness <span className={cn("ml-1 text-xs font-bold px-2 py-0.5 rounded-full border", grade(sync.grade))}>{sync.grade} · {Math.round(sync.score * 100)}%</span></p>
          <ul className="grid grid-cols-1 gap-y-0.5">
            {(sync.checks ?? []).map((c: any) => (
              <li key={c.id} className="text-sm flex gap-2" title={c.note}>
                <span className={c.ok ? "text-emerald-400" : "text-red-400"}>{c.ok ? "✓" : "✗"}</span>
                <span className="text-muted-foreground">{String(c.id).replace(/_/g, " ")}{c.value !== null && c.value !== undefined ? ` (${c.value})` : ""}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}
