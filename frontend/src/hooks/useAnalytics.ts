import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { format, subDays } from "date-fns";

export const useAnalytics = () => {
  return useQuery({
    queryKey: ["analytics"],
    queryFn: async () => {
      // Get total plays
      const { count: totalPlays } = await supabase
        .from("tracking_events")
        .select("*", { count: "exact", head: true })
        .eq("event_type", "track_played");

      const { count: totalDownloads } = await supabase
        .from("tracking_events")
        .select("*", { count: "exact", head: true })
        .eq("event_type", "track_downloaded");

      const { count: playlistOpens } = await supabase
        .from("tracking_events")
        .select("*", { count: "exact", head: true })
        .eq("event_type", "playlist_opened");

      const { data: uniqueTracksData } = await supabase
        .from("tracking_events")
        .select("track_id")
        .eq("event_type", "track_played")
        .not("track_id", "is", null);

      const uniqueTracks = new Set(uniqueTracksData?.map(e => e.track_id)).size;

      const { data: uniqueListenersData } = await supabase
        .from("tracking_events")
        .select("recipient_email")
        .not("recipient_email", "is", null);

      const uniqueListeners = new Set(uniqueListenersData?.map(e => e.recipient_email)).size;

      const { data: allPlayEvents } = await supabase
        .from("tracking_events")
        .select(`track_id, tracks(id, title, artist)`)
        .eq("event_type", "track_played")
        .not("track_id", "is", null);

      const trackPlayCounts: Record<string, { title: string; artist: string; plays: number }> = {};
      allPlayEvents?.forEach(event => {
        if (event.track_id && event.tracks) {
          const track = event.tracks as { id: string; title: string; artist: string };
          if (!trackPlayCounts[event.track_id]) {
            trackPlayCounts[event.track_id] = { title: track.title, artist: track.artist, plays: 0 };
          }
          trackPlayCounts[event.track_id].plays++;
        }
      });

      const topTracks = Object.values(trackPlayCounts)
        .sort((a, b) => b.plays - a.plays)
        .slice(0, 5);

      return { totalPlays: totalPlays || 0, totalDownloads: totalDownloads || 0, playlistOpens: playlistOpens || 0, uniqueTracks, uniqueListeners, topTracks };
    },
  });
};

export const useAnalyticsTrend = (days: number = 30) => {
  return useQuery({
    queryKey: ["analytics-trend", days],
    queryFn: async () => {
      const startDate = subDays(new Date(), days);

      const { data: events } = await supabase
        .from("tracking_events")
        .select("event_type, created_at")
        .gte("created_at", startDate.toISOString())
        .order("created_at", { ascending: true });

      if (!events || events.length === 0) return [];

      // Build daily buckets
      const buckets: Record<string, { plays: number; downloads: number; opens: number }> = {};
      for (let i = 0; i <= days; i++) {
        const d = format(subDays(new Date(), days - i), "MM/dd");
        buckets[d] = { plays: 0, downloads: 0, opens: 0 };
      }

      events.forEach(e => {
        const d = format(new Date(e.created_at!), "MM/dd");
        if (!buckets[d]) return;
        if (e.event_type === "track_played") buckets[d].plays++;
        else if (e.event_type === "track_downloaded") buckets[d].downloads++;
        else if (e.event_type === "playlist_opened") buckets[d].opens++;
      });

      return Object.entries(buckets).map(([date, counts]) => ({ date, ...counts }));
    },
  });
};
