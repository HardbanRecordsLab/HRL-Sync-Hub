import { useEffect, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import {
  LayoutDashboard, Library, FileText, Radio, Users,
  Kanban, BarChart3, Settings, LogOut,
  ChevronLeft, ChevronRight, Menu, X, ShoppingBag, Megaphone, Home,
} from "lucide-react";
import { toast } from "sonner";
import GlobalSearch from "./GlobalSearch";
import { cn } from "@/lib/utils";
import { AudioPlayerBar } from "./player/AudioPlayerBar";
import { usePlayer } from "./player/PlayerProvider";
import { useAuth } from "@/contexts/AuthContext";

interface LayoutProps { children: React.ReactNode; }

const NAV = [
  { to: "/", icon: LayoutDashboard, label: "Dashboard" },
  { to: "/library", icon: Library, label: "Library" },
  { to: "/lyrics", icon: FileText, label: "Lyrics" },
  { to: "/pitches", icon: Radio, label: "Pitches" },
  { to: "/contacts", icon: Users, label: "Contacts" },
  { to: "/projects", icon: Kanban, label: "Projects" },
  { to: "/promotion", icon: Megaphone, label: "Promotion" },
  { to: "/sales", icon: ShoppingBag, label: "Sales" },
  { to: "/analytics", icon: BarChart3, label: "Analytics" },
  { to: "/settings", icon: Settings, label: "Settings" },
];

const COLLAPSE_KEY = "hrl_sidebar_collapsed";

export default function Layout({ children }: LayoutProps) {
  const location = useLocation();
  const navigate = useNavigate();
  const [collapsed, setCollapsed] = useState(() => {
    try { return localStorage.getItem(COLLAPSE_KEY) === "1"; } catch { return false; }
  });
  const [mobileOpen, setMobileOpen] = useState(false);
  const player = usePlayer();
  const { logout } = useAuth();

  useEffect(() => { setMobileOpen(false); }, [location.pathname]);
  useEffect(() => {
    try { localStorage.setItem(COLLAPSE_KEY, collapsed ? "1" : "0"); } catch { /* storage disabled */ }
  }, [collapsed]);

  const signOut = () => {
    logout();
    toast.success("Signed out");
    navigate("/");
  };

  // On phones the sidebar is a drawer and always shows labels.
  const compact = collapsed && !mobileOpen;

  const sidebar = (
    <>
      <div className={cn("flex items-center gap-3 px-4 h-16 border-b border-border shrink-0", compact && "justify-center px-2")}>
        <img src="/favicon.png" alt="" className="w-8 h-8 shrink-0 object-contain rounded-md bg-white p-0.5" />
        {!compact && (
          <div className="min-w-0">
            <p className="text-sm font-semibold leading-tight text-foreground">HRL Sync Hub</p>
            <p className="text-xs text-muted-foreground leading-tight">Hardban Records Lab</p>
          </div>
        )}
        <button className="ml-auto md:hidden p-1.5 rounded-md text-muted-foreground hover:text-foreground" onClick={() => setMobileOpen(false)} aria-label="Close menu">
          <X className="w-5 h-5" />
        </button>
      </div>

      {!compact && (
        <div className="px-3 py-3">
          <GlobalSearch />
        </div>
      )}

      <nav className="flex-1 py-2 overflow-y-auto">
        {NAV.map(({ to, icon: Icon, label }) => {
          const active = to === "/" ? location.pathname === "/" : location.pathname.startsWith(to);
          return (
            <Link
              key={to} to={to}
              title={compact ? label : undefined}
              aria-current={active ? "page" : undefined}
              className={cn(
                "flex items-center gap-3 mx-2 my-0.5 rounded-lg px-3 py-2 hrl-nav-link",
                active ? "bg-violet-500/15 text-violet-200" : "text-muted-foreground hover:text-foreground hover:bg-white/5",
                compact && "justify-center px-2"
              )}
            >
              <Icon className="w-4 h-4 shrink-0" />
              {!compact && <span>{label}</span>}
            </Link>
          );
        })}
      </nav>

      <div className="border-t border-border p-2 space-y-0.5 shrink-0">
        <button
          onClick={() => setCollapsed(c => !c)}
          className={cn("hidden md:flex items-center gap-3 w-full rounded-lg px-3 py-2 text-muted-foreground hover:text-foreground hover:bg-white/5 hrl-nav-link", compact && "justify-center px-2")}
          aria-label={compact ? "Expand sidebar" : "Collapse sidebar"}
        >
          {compact ? <ChevronRight className="w-4 h-4" /> : <><ChevronLeft className="w-4 h-4" /><span>Collapse</span></>}
        </button>
        <a
          href="https://hardbanrecordslab.online/"
          title={compact ? "hardbanrecordslab.online" : undefined}
          className={cn("flex items-center gap-3 w-full rounded-lg px-3 py-2 text-muted-foreground hover:text-foreground hover:bg-white/5 hrl-nav-link", compact && "justify-center px-2")}
        >
          <Home className="w-4 h-4 shrink-0" />
          {!compact && <span>Main website</span>}
        </a>
        <button
          onClick={signOut}
          className={cn("flex items-center gap-3 w-full rounded-lg px-3 py-2 text-muted-foreground hover:text-foreground hover:bg-white/5 hrl-nav-link", compact && "justify-center px-2")}
        >
          <LogOut className="w-4 h-4 shrink-0" />
          {!compact && <span>Sign out</span>}
        </button>
      </div>
    </>
  );

  return (
    <div className="min-h-screen bg-background">
      {/* Mobile top bar */}
      <header className="md:hidden sticky top-0 z-30 flex items-center gap-3 h-14 px-4 border-b border-border bg-background/95 backdrop-blur">
        <button onClick={() => setMobileOpen(true)} className="p-1.5 -ml-1.5 rounded-md text-muted-foreground hover:text-foreground" aria-label="Open menu">
          <Menu className="w-5 h-5" />
        </button>
        <img src="/favicon.png" alt="" className="w-7 h-7 object-contain rounded bg-white p-0.5" />
        <span className="text-sm font-semibold">HRL Sync Hub</span>
      </header>

      {mobileOpen && <div className="md:hidden fixed inset-0 z-40 bg-black/60" onClick={() => setMobileOpen(false)} />}

      <aside className={cn(
        "fixed top-0 left-0 z-50 md:z-20 flex flex-col border-r border-border bg-card transition-all duration-200",
        "h-full md:h-auto md:bottom-0",
        player.track && "md:bottom-[72px]",
        mobileOpen ? "w-[260px] translate-x-0" : "-translate-x-full md:translate-x-0",
        compact ? "md:w-[64px]" : "md:w-[232px]"
      )}>
        {sidebar}
      </aside>

      <main className={cn("transition-all duration-200", compact ? "md:ml-[64px]" : "md:ml-[232px]")}>
        <div className={cn("mx-auto max-w-[1400px] px-4 py-6 md:px-8 md:py-8", player.track ? "pb-32" : "pb-12")}>
          {children}
        </div>
      </main>

      <AudioPlayerBar player={player} />
    </div>
  );
}
