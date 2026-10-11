import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Search } from "lucide-react";
import { Input } from "@/components/ui/input";

/** Sidebar search: Enter opens the library filtered by the query. */
export default function GlobalSearch() {
  const [q, setQ] = useState("");
  const navigate = useNavigate();
  return (
    <form
      className="relative"
      onSubmit={(e) => {
        e.preventDefault();
        navigate(q.trim() ? `/library?q=${encodeURIComponent(q.trim())}` : "/library");
      }}
    >
      <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
      <Input
        placeholder="Search tracks…"
        value={q}
        onChange={e => setQ(e.target.value)}
        className="pl-8 h-9 text-sm bg-background border-border"
        aria-label="Search tracks"
      />
    </form>
  );
}
