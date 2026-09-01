import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export const useDashboardStats = () => {
  return useQuery({
    queryKey: ["dashboard-stats"],
    queryFn: async () => {
      // Get tracks count
      const { count: totalTracks } = await supabase
        .from("tracks")
        .select("*", { count: "exact", head: true });

      // Get sync-ready tracks count
      const { count: syncReadyTracks } = await supabase
        .from("tracks")
        .select("*", { count: "exact", head: true })
        .eq("clearance_status", "cleared_ready");

      // Get active playlists (pitches) count
      const { count: activePitches } = await supabase
        .from("playlists")
        .select("*", { count: "exact", head: true });

      // Get total plays from tracking events
      const { count: totalPlays } = await supabase
        .from("tracking_events")
        .select("*", { count: "exact", head: true })
        .eq("event_type", "track_played");

      // Get recent activity
      const { data: recentTracks } = await supabase
        .from("tracks")
        .select("id, title, artist, created_at")
        .order("created_at", { ascending: false })
        .limit(3);

      const { data: recentPlaylists } = await supabase
        .from("playlists")
        .select("id, name, created_at")
        .order("created_at", { ascending: false })
        .limit(3);

      const { data: recentEvents } = await supabase
        .from("tracking_events")
        .select(`
          id, 
          event_type, 
          created_at,
          tracks(title),
          shareable_links(playlists(name))
        `)
        .order("created_at", { ascending: false })
        .limit(5);

      // Calculate sync ready percentage
      const syncReadyPercentage = totalTracks && totalTracks > 0 
        ? Math.round((syncReadyTracks || 0) / totalTracks * 100) 
        : 0;

      return {
        totalTracks: totalTracks || 0,
        syncReadyTracks: syncReadyTracks || 0,
        syncReadyPercentage,
        activePitches: activePitches || 0,
        totalPlays: totalPlays || 0,
        recentTracks: recentTracks || [],
        recentPlaylists: recentPlaylists || [],
        recentEvents: recentEvents || [],
      };
    },
  });
};
