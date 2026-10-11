// Dokumenty prawne są wspólne dla całej platformy HardbanRecords Lab (jedno źródło na
// hardbanrecordslab.online). Tu tylko skrót dla HRL Sync Hub.
const SITE = "https://hardbanrecordslab.online";
const DOCS = [
  { href: `${SITE}/terms/`, label: "Regulamin" },
  { href: `${SITE}/privacy/`, label: "Polityka prywatności" },
  { href: `${SITE}/cookies/`, label: "Polityka cookies" },
];

export default function LegalSummary({ title, points }: { title: string; points: string[] }) {
  return (
    <div className="min-h-screen bg-background px-4 py-10">
      <div className="max-w-2xl mx-auto">
        <h1 className="text-2xl font-bold mb-2">{title} — HRL Sync Hub</h1>
        <p className="text-xs text-muted-foreground mb-8">
          Obowiązuje od 11 października 2026 r. · Kamil Skomra, HardbanRecords Lab
        </p>
        <p className="text-sm text-muted-foreground leading-relaxed mb-4">
          HRL Sync Hub jest częścią HardbanRecords Lab. Obowiązują wspólne dokumenty całej platformy.
          Najważniejsze zasady dotyczące tej aplikacji:
        </p>
        <ul className="list-disc pl-5 space-y-2 text-sm text-muted-foreground leading-relaxed mb-8">
          {points.map((p) => (
            <li key={p}>{p}</li>
          ))}
        </ul>
        <div className="flex flex-wrap gap-2">
          {DOCS.map((d) => (
            <a
              key={d.href}
              href={d.href}
              target="_blank"
              rel="noopener noreferrer"
              className="text-sm px-3 py-1.5 rounded-md border border-border hover:bg-muted"
            >
              {d.label} ↗
            </a>
          ))}
        </div>
        <p className="text-xs text-muted-foreground mt-8">
          Sprawy prawne i dane osobowe: legal@hardbanrecordslab.online
        </p>
      </div>
    </div>
  );
}
