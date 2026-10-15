import { useQuery } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
import { Link } from "react-router-dom";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { api } from "@/lib/api";

type Group = { similarity: number; members: { id: number; title: string; artist: string; album?: string | null; duration?: number | null; bpm?: number | null }[] };
const fmt = (s?: number | null) => (s ? `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}` : "—");

/** Tracks whose sonic vectors are (nearly) identical: another master, a re-export, the same song in two albums. */
export default function DuplicatesDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { data, isLoading, error } = useQuery({
    queryKey: ["tracks", "duplicates"],
    queryFn: () => api.get<{ groups: Group[]; analysed: number; threshold: number }>("/api/tracks/duplicates"),
    enabled: open,
    staleTime: 10 * 60 * 1000,
  });
  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
        <DialogHeader><DialogTitle>Possible duplicates &amp; other masters</DialogTitle></DialogHeader>
        {isLoading && <div className="flex items-center gap-2 text-muted-foreground py-6"><Loader2 className="w-4 h-4 animate-spin" />Comparing sonic vectors…</div>}
        {error && <p className="text-sm text-red-400">Could not load the report.</p>}
        {data && (
          <>
            <p className="text-sm text-muted-foreground">
              {data.analysed} tracks have a sonic vector · similarity ≥ {Math.round(data.threshold * 100)}% means the same recording (another master, re-export or the same song in two albums).
              {data.analysed < 50 ? " The catalogue back-fill is still running, so this list is incomplete." : ""}
            </p>
            {data.groups.length === 0 && <p className="text-sm py-4">No duplicates found.</p>}
            <div className="space-y-3">
              {data.groups.map((g, i) => (
                <div key={i} className="hrl-card p-3">
                  <p className="text-xs text-muted-foreground mb-1.5">{g.members.length} tracks · {Math.round(g.similarity * 1000) / 10}% similar</p>
                  <ul className="space-y-1">
                    {g.members.map((m) => (
                      <li key={m.id} className="text-sm flex gap-2 justify-between">
                        <Link to={`/library/${m.id}`} onClick={onClose} className="text-violet-300 hover:underline truncate">{m.title}</Link>
                        <span className="text-muted-foreground shrink-0">{[m.album, m.bpm && `${m.bpm} BPM`, fmt(m.duration)].filter(Boolean).join(" · ")}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
