import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export const usePlaylistsQuery = () => {
  return useQuery({
    queryKey: ["playlists"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("playlists")
        .select(`
          *,
          playlist_tracks(
            id,
            track_id,
            position,
            track:tracks(*)
          )
        `)
        .order("created_at", { ascending: false });

      if (error) throw error;
      return data;
    },
  });
};

export const usePlaylistDetailQuery = (playlistId: string | undefined) => {
  return useQuery({
    queryKey: ["playlist", playlistId],
    queryFn: async () => {
      if (!playlistId) throw new Error("Playlist ID is required");

      const { data, error } = await supabase
        .from("playlists")
        .select(`
          *,
          playlist_tracks(
            id,
            position,
            track_comment,
            track:tracks(
              *,
              track_moods(mood),
              track_genres(genre, sub_genre)
            )
          ),
          shareable_links(id, link_token, is_active, expires_at, allow_downloads, require_email)
        `)
        .eq("id", playlistId)
        .single();

      if (error) throw error;
      return data;
    },
    enabled: !!playlistId,
  });
};

export const useCreatePlaylistMutation = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (playlist: {
      name: string;
      description?: string;
    }) => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");

      const { data, error } = await supabase
        .from("playlists")
        .insert({
          ...playlist,
          user_id: user.id,
        })
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["playlists"] });
    },
  });
};

export const useUpdatePlaylistMutation = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ 
      playlistId, 
      updates 
    }: {
      playlistId: string;
      updates: {
        name?: string;
        description?: string;
      };
    }) => {
      const { error } = await supabase
        .from("playlists")
        .update(updates)
        .eq("id", playlistId);

      if (error) throw error;
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ["playlists"] });
      queryClient.invalidateQueries({ queryKey: ["playlist", variables.playlistId] });
    },
  });
};

export const useDeletePlaylistMutation = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (playlistId: string) => {
      const { error } = await supabase
        .from("playlists")
        .delete()
        .eq("id", playlistId);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["playlists"] });
    },
  });
};

export const useAddTrackToPlaylistMutation = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ 
      playlistId, 
      trackId,
      position 
    }: {
      playlistId: string;
      trackId: string;
      position: number;
    }) => {
      const { error } = await supabase
        .from("playlist_tracks")
        .insert({
          playlist_id: playlistId,
          track_id: trackId,
          position,
        });

      if (error) throw error;
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ["playlists"] });
      queryClient.invalidateQueries({ queryKey: ["playlist", variables.playlistId] });
    },
  });
};

export const useRemoveTrackFromPlaylistMutation = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ playlistTrackId, playlistId }: { playlistTrackId: string; playlistId: string }) => {
      const { error } = await supabase
        .from("playlist_tracks")
        .delete()
        .eq("id", playlistTrackId);

      if (error) throw error;
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ["playlists"] });
      queryClient.invalidateQueries({ queryKey: ["playlist", variables.playlistId] });
    },
  });
};
