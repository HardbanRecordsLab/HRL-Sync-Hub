import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider, useAuth } from "@/contexts/AuthContext";
import { PlayerProvider } from "@/components/player/PlayerProvider";

import Dashboard from "./pages/Dashboard";
import Library from "./pages/Library";
import TrackDetail from "./pages/TrackDetail";
import Pitches from "./pages/Pitches";
import PlaylistDetail from "./pages/PlaylistDetail";
import SharedPlaylist from "./pages/SharedPlaylist";
import Contacts from "./pages/Contacts";
import Projects from "./pages/Projects";
import Analytics from "./pages/Analytics";
import Settings from "./pages/Settings";
import LyricsCatalog from "./pages/LyricsCatalog";
import GoogleDrive from "./pages/GoogleDrive";
import BusinessHub from "./pages/BusinessHub";
import PublicLibrary from "./pages/PublicLibrary";
import Auth from "./pages/Auth";
import NotFound from "./pages/NotFound";

const queryClient = new QueryClient({
  defaultOptions: { queries: { staleTime: 30_000, retry: 1 } },
});

function Protected({ children }: { children: JSX.Element }) {
  const { isAuthenticated } = useAuth();
  return isAuthenticated ? children : <Navigate to="/" replace />;
}

function AppRoutes() {
  const { isAuthenticated, isLoading } = useAuth();

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
      </div>
    );
  }

  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={isAuthenticated ? <Dashboard /> : <Auth />} />

        {/* Public */}
        <Route path="/share/:token" element={<SharedPlaylist />} />
        <Route path="/public-library" element={<PublicLibrary />} />

        {/* Authenticated */}
        <Route path="/library" element={<Protected><Library /></Protected>} />
        <Route path="/library/:trackId" element={<Protected><TrackDetail /></Protected>} />
        <Route path="/lyrics" element={<Protected><LyricsCatalog /></Protected>} />
        <Route path="/drive" element={<Protected><GoogleDrive /></Protected>} />
        <Route path="/pitches" element={<Protected><Pitches /></Protected>} />
        <Route path="/pitches/:playlistId" element={<Protected><PlaylistDetail /></Protected>} />
        <Route path="/contacts" element={<Protected><Contacts /></Protected>} />
        <Route path="/projects" element={<Protected><Projects /></Protected>} />
        <Route path="/business" element={<Protected><BusinessHub /></Protected>} />
        <Route path="/analytics" element={<Protected><Analytics /></Protected>} />
        <Route path="/settings" element={<Protected><Settings /></Protected>} />

        <Route path="*" element={<NotFound />} />
      </Routes>
    </BrowserRouter>
  );
}

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <Toaster />
        <Sonner theme="dark" />
        <AuthProvider>
          <PlayerProvider>
            <AppRoutes />
          </PlayerProvider>
        </AuthProvider>
      </TooltipProvider>
    </QueryClientProvider>
  );
}
