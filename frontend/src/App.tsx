import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider, useAuth } from "@/contexts/AuthContext";

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

// AuthContext handles loading state + redirect to WP login on 401
function AppRoutes() {
  const { user, isLoading } = useAuth();

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
      </div>
    );
  }

  const isAuthenticated = Boolean(user);

  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={isAuthenticated ? <Dashboard /> : <Auth />} />
        <Route path="/share/:token" element={<SharedPlaylist />} />
        <Route path="/public-library" element={<PublicLibrary />} />
        <Route path="/library" element={isAuthenticated ? <Library /> : <Navigate to="/" replace />} />
        <Route path="/library/:trackId" element={isAuthenticated ? <TrackDetail /> : <Navigate to="/" replace />} />
        <Route path="/lyrics" element={isAuthenticated ? <LyricsCatalog /> : <Navigate to="/" replace />} />
        <Route path="/drive" element={isAuthenticated ? <GoogleDrive /> : <Navigate to="/" replace />} />
        <Route path="/pitches" element={isAuthenticated ? <Pitches /> : <Navigate to="/" replace />} />
        <Route path="/pitches/:playlistId" element={isAuthenticated ? <PlaylistDetail /> : <Navigate to="/" replace />} />
        <Route path="/contacts" element={isAuthenticated ? <Contacts /> : <Navigate to="/" replace />} />
        <Route path="/projects" element={isAuthenticated ? <Projects /> : <Navigate to="/" replace />} />
        <Route path="/business" element={isAuthenticated ? <BusinessHub /> : <Navigate to="/" replace />} />
        <Route path="/analytics" element={isAuthenticated ? <Analytics /> : <Navigate to="/" replace />} />
        <Route path="/settings" element={isAuthenticated ? <Settings /> : <Navigate to="/" replace />} />
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
          <AppRoutes />
        </AuthProvider>
      </TooltipProvider>
    </QueryClientProvider>
  );
}
