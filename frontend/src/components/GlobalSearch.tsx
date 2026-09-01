import { useState } from "react";
import { Search } from "lucide-react";
import { Input } from "@/components/ui/input";

export default function GlobalSearch() {
  const [q, setQ] = useState("");
  return (
    <div className="relative">
      <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
      <Input
        placeholder="Search…"
        value={q}
        onChange={e => setQ(e.target.value)}
        className="pl-8 h-8 text-sm bg-background border-border"
      />
    </div>
  );
}
