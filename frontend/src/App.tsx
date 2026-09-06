import { lazy, Suspense } from "react";
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider, useAuth } from "@/contexts/AuthContext";
import { PlayerProvider } from "@/components/player/PlayerProvider";
import Auth from "./pages/Auth";

// Route-level code splitting — only the login screen ships in the entry bundle.
const Dashboard = lazy(() => import("./pages/Dashboard"));
const Library = lazy(() => import("./pages/Library"));
const TrackDetail = lazy(() => import("./pages/TrackDetail"));
const Pitches = lazy(() => import("./pages/Pitches"));
const PlaylistDetail = lazy(() => import("./pages/PlaylistDetail"));
const SharedPlaylist = lazy(() => import("./pages/SharedPlaylist"));
const Contacts = lazy(() => import("./pages/Contacts"));
const Projects = lazy(() => import("./pages/Projects"));
const Analytics = lazy(() => import("./pages/Analytics"));
const Settings = lazy(() => import("./pages/Settings"));
const LyricsCatalog = lazy(() => import("./pages/LyricsCatalog"));
const GoogleDrive = lazy(() => import("./pages/GoogleDrive"));
const BusinessHub = lazy(() => import("./pages/BusinessHub"));
const PublicLibrary = lazy(() => import("./pages/PublicLibrary"));
const NotFound = lazy(() => import("./pages/NotFound"));

const queryClient = new QueryClient({
  defaultOptions: { queries: { staleTime: 30_000, retry: 1 } },
});

function Spinner() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-background">
      <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
    </div>
  );
}

function Protected({ children }: { children: JSX.Element }) {
  const { isAuthenticated } = useAuth();
  return isAuthenticated ? children : <Navigate to="/" replace />;
}

function AppRoutes() {
  const { isAuthenticated, isLoading } = useAuth();

  if (isLoading) return <Spinner />;

  return (
    <BrowserRouter>
      <Suspense fallback={<Spinner />}>
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
      </Suspense>
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
