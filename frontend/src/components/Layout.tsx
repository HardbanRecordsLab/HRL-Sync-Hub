import { useState } from "react";
import { Link, useLocation } from "react-router-dom";
import {
  LayoutDashboard, Library, FileText, Radio, Users,
  Kanban, BarChart3, HardDrive, Settings, LogOut,
  ChevronLeft, ChevronRight, Music2, Briefcase
} from "lucide-react";
import { toast } from "sonner";
import { useNavigate } from "react-router-dom";
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
  { to: "/drive", icon: HardDrive, label: "Drive" },
  { to: "/pitches", icon: Radio, label: "Pitches" },
  { to: "/contacts", icon: Users, label: "Contacts" },
  { to: "/projects", icon: Kanban, label: "Projects" },
  { to: "/business", icon: Briefcase, label: "Business" },
  { to: "/analytics", icon: BarChart3, label: "Analytics" },
  { to: "/settings", icon: Settings, label: "Settings" },
];

export default function Layout({ children }: LayoutProps) {
  const location = useLocation();
  const navigate = useNavigate();
  const [collapsed, setCollapsed] = useState(false);
  const player = usePlayer();
  const { logout } = useAuth();

  const signOut = () => {
    logout();
    toast.success("Signed out");
    navigate("/");
  };

  return (
    <div className="min-h-screen flex bg-background">
      {/* ── Sidebar ─────────────────────────────────────── */}
      <aside className={cn(
        "fixed top-0 left-0 h-full z-20 flex flex-col border-r border-border transition-all duration-200",
        "bg-card",
        collapsed ? "w-[60px]" : "w-[220px]"
      )}>
        {/* Logo */}
        <div className={cn(
          "flex items-center gap-3 px-4 py-5 border-b border-border",
          collapsed && "justify-center px-2"
        )}>
          <img src="/favicon.png" alt="HRL Sync Hub" className="w-9 h-9 shrink-0 object-contain rounded-md bg-white/95 p-0.5" />
          {!collapsed && (
            <div>
              <p className="hrl-title text-lg leading-none text-foreground tracking-wider">HRL SYNC HUB</p>
              <p className="hrl-label text-[10px] mt-0.5 hrl-gradient-text" style={{ letterSpacing: '0.15em' }}>
                HARDBAN RECORDS LAB
              </p>
            </div>
          )}
        </div>

        {/* Search */}
        {!collapsed && (
          <div className="px-3 py-3 border-b border-border">
            <GlobalSearch />
          </div>
        )}

        {/* Nav */}
        <nav className="flex-1 py-3 overflow-y-auto">
          {NAV.map(({ to, icon: Icon, label }) => {
            const active = to === "/" ? location.pathname === "/" : location.pathname.startsWith(to);
            return (
              <Link
                key={to} to={to}
                title={collapsed ? label : undefined}
                className={cn(
                  "flex items-center gap-3 mx-2 my-0.5 rounded px-3 py-2.5 transition-all hrl-nav-link",
                  active
                    ? "bg-violet-500/15 text-violet-400 border border-violet-500/20"
                    : "text-muted-foreground hover:text-foreground hover:bg-white/4",
                  collapsed && "justify-center px-2"
                )}
              >
                <Icon className={cn("shrink-0", collapsed ? "w-4.5 h-4.5" : "w-4 h-4")} />
                {!collapsed && <span>{label}</span>}
              </Link>
            );
          })}
        </nav>

        {/* Bottom */}
        <div className="border-t border-border p-2 space-y-1">
          <button
            onClick={() => setCollapsed(c => !c)}
            className={cn(
              "flex items-center gap-3 w-full rounded px-3 py-2 text-muted-foreground hover:text-foreground hover:bg-white/4 transition-all hrl-nav-link",
              collapsed && "justify-center"
            )}
          >
            {collapsed ? <ChevronRight className="w-4 h-4" /> : <><ChevronLeft className="w-4 h-4" /><span>Collapse</span></>}
          </button>
          <button
            onClick={signOut}
            className={cn(
              "flex items-center gap-3 w-full rounded px-3 py-2 text-muted-foreground hover:text-violet-400 hover:bg-violet-500/8 transition-all hrl-nav-link",
              collapsed && "justify-center"
            )}
          >
            <LogOut className="w-4 h-4 shrink-0" />
            {!collapsed && <span>Sign Out</span>}
          </button>
        </div>
      </aside>

      {/* ── Main ────────────────────────────────────────── */}
      <main className={cn(
        "flex-1 flex flex-col min-h-screen transition-all duration-200",
        collapsed ? "ml-[60px]" : "ml-[220px]"
      )}>
        <div className="flex-1 p-7 pb-28">
          {children}
        </div>
        {/* Fixed audio player bar at bottom */}
        <AudioPlayerBar player={player} />
      </main>
    </div>
  );
}
