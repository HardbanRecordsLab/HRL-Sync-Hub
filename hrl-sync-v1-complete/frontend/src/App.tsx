import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Session } from "@supabase/supabase-js";

import Auth from "./pages/Auth";
import Dashboard from "./pages/Dashboard";
import Library from "./pages/Library";
import TrackDetail from "./pages/TrackDetail";
import Pitches from "./pages/Pitches";
import PlaylistDetail from "./pages/PlaylistDetail";
import SharedPlaylist from "./pages/SharedPlaylist";
import Contacts from "./pages/Contacts";
// import ContactDetail from "./pages/ContactDetail";
import Projects from "./pages/Projects";
import Analytics from "./pages/Analytics";
import Settings from "./pages/Settings";
import LyricsCatalog from "./pages/LyricsCatalog";
import GoogleDrive from "./pages/GoogleDrive";
import BusinessHub from "./pages/BusinessHub";
import PublicLibrary from "./pages/PublicLibrary";
import NotFound from "./pages/NotFound";

const queryClient = new QueryClient({
  defaultOptions: { queries: { staleTime: 30_000, retry: 1 } },
});

export default function App() {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_e, s) => {
      setSession(s); setLoading(false);
    });
    supabase.auth.getSession().then(({ data: { session: s } }) => {
      setSession(s); setLoading(false);
    });
    return () => subscription.unsubscribe();
  }, []);

  if (loading) return (
    <div className="min-h-screen flex items-center justify-center bg-background">
      <div className="text-center space-y-4">
        <div className="w-14 h-14 mx-auto rounded border border-red-500/40 flex items-center justify-center">
          <span className="hrl-title text-2xl text-red-500">HRL</span>
        </div>
        <p className="hrl-label text-muted-foreground tracking-widest">Loading…</p>
      </div>
    </div>
  );

  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <Toaster />
        <Sonner theme="dark" />
        <BrowserRouter>
          <Routes>
            <Route path="/share/:token" element={<SharedPlaylist />} />
            <Route path="/public-library" element={<PublicLibrary />} />
            {!session ? (
              <>
                <Route path="/auth" element={<Auth />} />
                <Route path="*" element={<Auth />} />
              </>
            ) : (
              <>
                <Route path="/" element={<Dashboard />} />
                <Route path="/library" element={<Library />} />
                <Route path="/library/:trackId" element={<TrackDetail />} />
                <Route path="/lyrics" element={<LyricsCatalog />} />
                <Route path="/drive" element={<GoogleDrive />} />
                <Route path="/pitches" element={<Pitches />} />
                <Route path="/pitches/:playlistId" element={<PlaylistDetail />} />
                <Route path="/contacts" element={<Contacts />} />
                {/* <Route path="/contacts/:contactId" element={<ContactDetail />} /> */}
                <Route path="/projects" element={<Projects />} />
                <Route path="/business" element={<BusinessHub />} />
                <Route path="/analytics" element={<Analytics />} />
                <Route path="/settings" element={<Settings />} />
                <Route path="*" element={<NotFound />} />
              </>
            )}
          </Routes>
        </BrowserRouter>
      </TooltipProvider>
    </QueryClientProvider>
  );
}
