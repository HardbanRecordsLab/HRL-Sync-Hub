import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export const useTracksQuery = () => {
  return useQuery({
    queryKey: ["tracks"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("tracks")
        .select(`
          *,
          track_moods(mood),
          track_genres(genre, sub_genre),
          track_keywords(keyword),
          track_instruments(instrument)
        `)
        .order("created_at", { ascending: false });

      if (error) throw error;
      return data;
    },
  });
};

export const useTrackQuery = (trackId: string | undefined) => {
  return useQuery({
    queryKey: ["track", trackId],
    queryFn: async () => {
      if (!trackId) return null;
      
      const { data, error } = await supabase
        .from("tracks")
        .select(`
          *,
          track_moods(id, mood),
          track_genres(id, genre, sub_genre),
          track_keywords(id, keyword),
          track_instruments(id, instrument),
          track_rights(id, name, role, percentage, pro_organization)
        `)
        .eq("id", trackId)
        .single();

      if (error) throw error;
      return data;
    },
    enabled: !!trackId,
  });
};

export const useCreateTrackMutation = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (track: {
      title: string;
      artist: string;
      file_name: string;
      file_url: string;
      composer?: string;
      bpm?: number;
      key?: string;
      description?: string;
      duration?: number;
      file_size?: number;
      isrc?: string;
      iswc?: string;
      rights_type?: "one_stop" | "two_stop";
      clearance_status?: "cleared_ready" | "in_progress" | "not_cleared";
    }) => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");

      const { data, error } = await supabase
        .from("tracks")
        .insert({
          ...track,
          user_id: user.id,
        })
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["tracks"] });
    },
  });
};

export const useUpdateTrackMutation = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ 
      trackId, 
      updates,
      moods,
      genres,
      keywords,
      instruments
    }: {
      trackId: string;
      updates: {
        title?: string;
        artist?: string;
        composer?: string;
        bpm?: number;
        key?: string;
        description?: string;
        isrc?: string;
        iswc?: string;
        rights_type?: "one_stop" | "two_stop";
        clearance_status?: "cleared_ready" | "in_progress" | "not_cleared";
      };
      moods?: string[];
      genres?: { genre: string; sub_genre?: string }[];
      keywords?: string[];
      instruments?: string[];
    }) => {
      // Update track
      const { error: trackError } = await supabase
        .from("tracks")
        .update(updates)
        .eq("id", trackId);

      if (trackError) throw trackError;

      // Update moods if provided
      if (moods !== undefined) {
        await supabase.from("track_moods").delete().eq("track_id", trackId);
        if (moods.length > 0) {
          await supabase.from("track_moods").insert(
            moods.map(mood => ({ track_id: trackId, mood }))
          );
        }
      }

      // Update genres if provided
      if (genres !== undefined) {
        await supabase.from("track_genres").delete().eq("track_id", trackId);
        if (genres.length > 0) {
          await supabase.from("track_genres").insert(
            genres.map(g => ({ track_id: trackId, genre: g.genre, sub_genre: g.sub_genre }))
          );
        }
      }

      // Update keywords if provided
      if (keywords !== undefined) {
        await supabase.from("track_keywords").delete().eq("track_id", trackId);
        if (keywords.length > 0) {
          await supabase.from("track_keywords").insert(
            keywords.map(keyword => ({ track_id: trackId, keyword }))
          );
        }
      }

      // Update instruments if provided
      if (instruments !== undefined) {
        await supabase.from("track_instruments").delete().eq("track_id", trackId);
        if (instruments.length > 0) {
          await supabase.from("track_instruments").insert(
            instruments.map(instrument => ({ track_id: trackId, instrument }))
          );
        }
      }
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ["tracks"] });
      queryClient.invalidateQueries({ queryKey: ["track", variables.trackId] });
    },
  });
};

export const useDeleteTrackMutation = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (trackId: string) => {
      const { error } = await supabase
        .from("tracks")
        .delete()
        .eq("id", trackId);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["tracks"] });
    },
  });
};
