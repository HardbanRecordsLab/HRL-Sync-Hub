export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "13.0.5"
  }
  public: {
    Tables: {
      contacts: {
        Row: {
          company: string | null
          created_at: string | null
          email: string
          full_name: string
          id: string
          notes: string | null
          phone: string | null
          role: string | null
          tags: string[] | null
          updated_at: string | null
          user_id: string
        }
        Insert: {
          company?: string | null
          created_at?: string | null
          email: string
          full_name: string
          id?: string
          notes?: string | null
          phone?: string | null
          role?: string | null
          tags?: string[] | null
          updated_at?: string | null
          user_id: string
        }
        Update: {
          company?: string | null
          created_at?: string | null
          email?: string
          full_name?: string
          id?: string
          notes?: string | null
          phone?: string | null
          role?: string | null
          tags?: string[] | null
          updated_at?: string | null
          user_id?: string
        }
        Relationships: []
      }
      playlist_tracks: {
        Row: {
          id: string
          playlist_id: string
          position: number
          track_comment: string | null
          track_id: string
        }
        Insert: {
          id?: string
          playlist_id: string
          position: number
          track_comment?: string | null
          track_id: string
        }
        Update: {
          id?: string
          playlist_id?: string
          position?: number
          track_comment?: string | null
          track_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "playlist_tracks_playlist_id_fkey"
            columns: ["playlist_id"]
            isOneToOne: false
            referencedRelation: "playlists"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "playlist_tracks_track_id_fkey"
            columns: ["track_id"]
            isOneToOne: false
            referencedRelation: "tracks"
            referencedColumns: ["id"]
          },
        ]
      }
      playlists: {
        Row: {
          created_at: string | null
          description: string | null
          id: string
          name: string
          updated_at: string | null
          user_id: string
        }
        Insert: {
          created_at?: string | null
          description?: string | null
          id?: string
          name: string
          updated_at?: string | null
          user_id: string
        }
        Update: {
          created_at?: string | null
          description?: string | null
          id?: string
          name?: string
          updated_at?: string | null
          user_id?: string
        }
        Relationships: []
      }
      profiles: {
        Row: {
          avatar_url: string | null
          company_name: string | null
          created_at: string | null
          full_name: string | null
          id: string
          updated_at: string | null
        }
        Insert: {
          avatar_url?: string | null
          company_name?: string | null
          created_at?: string | null
          full_name?: string | null
          id: string
          updated_at?: string | null
        }
        Update: {
          avatar_url?: string | null
          company_name?: string | null
          created_at?: string | null
          full_name?: string | null
          id?: string
          updated_at?: string | null
        }
        Relationships: []
      }
      projects: {
        Row: {
          contact_id: string | null
          created_at: string | null
          id: string
          name: string
          notes: string | null
          playlist_id: string | null
          position: number | null
          status: Database["public"]["Enums"]["project_status"] | null
          updated_at: string | null
          user_id: string
        }
        Insert: {
          contact_id?: string | null
          created_at?: string | null
          id?: string
          name: string
          notes?: string | null
          playlist_id?: string | null
          position?: number | null
          status?: Database["public"]["Enums"]["project_status"] | null
          updated_at?: string | null
          user_id: string
        }
        Update: {
          contact_id?: string | null
          created_at?: string | null
          id?: string
          name?: string
          notes?: string | null
          playlist_id?: string | null
          position?: number | null
          status?: Database["public"]["Enums"]["project_status"] | null
          updated_at?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "projects_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "contacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "projects_playlist_id_fkey"
            columns: ["playlist_id"]
            isOneToOne: false
            referencedRelation: "playlists"
            referencedColumns: ["id"]
          },
        ]
      }
      shareable_links: {
        Row: {
          allow_downloads: boolean | null
          created_at: string | null
          expires_at: string | null
          id: string
          is_active: boolean | null
          link_token: string
          password_hash: string | null
          playlist_id: string
          require_email: boolean | null
        }
        Insert: {
          allow_downloads?: boolean | null
          created_at?: string | null
          expires_at?: string | null
          id?: string
          is_active?: boolean | null
          link_token: string
          password_hash?: string | null
          playlist_id: string
          require_email?: boolean | null
        }
        Update: {
          allow_downloads?: boolean | null
          created_at?: string | null
          expires_at?: string | null
          id?: string
          is_active?: boolean | null
          link_token?: string
          password_hash?: string | null
          playlist_id?: string
          require_email?: boolean | null
        }
        Relationships: [
          {
            foreignKeyName: "shareable_links_playlist_id_fkey"
            columns: ["playlist_id"]
            isOneToOne: false
            referencedRelation: "playlists"
            referencedColumns: ["id"]
          },
        ]
      }
      track_genres: {
        Row: {
          genre: string
          id: string
          sub_genre: string | null
          track_id: string
        }
        Insert: {
          genre: string
          id?: string
          sub_genre?: string | null
          track_id: string
        }
        Update: {
          genre?: string
          id?: string
          sub_genre?: string | null
          track_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "track_genres_track_id_fkey"
            columns: ["track_id"]
            isOneToOne: false
            referencedRelation: "tracks"
            referencedColumns: ["id"]
          },
        ]
      }
      track_instruments: {
        Row: {
          id: string
          instrument: string
          track_id: string
        }
        Insert: {
          id?: string
          instrument: string
          track_id: string
        }
        Update: {
          id?: string
          instrument?: string
          track_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "track_instruments_track_id_fkey"
            columns: ["track_id"]
            isOneToOne: false
            referencedRelation: "tracks"
            referencedColumns: ["id"]
          },
        ]
      }
      track_keywords: {
        Row: {
          id: string
          keyword: string
          track_id: string
        }
        Insert: {
          id?: string
          keyword: string
          track_id: string
        }
        Update: {
          id?: string
          keyword?: string
          track_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "track_keywords_track_id_fkey"
            columns: ["track_id"]
            isOneToOne: false
            referencedRelation: "tracks"
            referencedColumns: ["id"]
          },
        ]
      }
      track_moods: {
        Row: {
          id: string
          mood: string
          track_id: string
        }
        Insert: {
          id?: string
          mood: string
          track_id: string
        }
        Update: {
          id?: string
          mood?: string
          track_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "track_moods_track_id_fkey"
            columns: ["track_id"]
            isOneToOne: false
            referencedRelation: "tracks"
            referencedColumns: ["id"]
          },
        ]
      }
      track_rights: {
        Row: {
          created_at: string | null
          id: string
          name: string
          percentage: number
          pro_organization: string | null
          role: string
          track_id: string
        }
        Insert: {
          created_at?: string | null
          id?: string
          name: string
          percentage: number
          pro_organization?: string | null
          role: string
          track_id: string
        }
        Update: {
          created_at?: string | null
          id?: string
          name?: string
          percentage?: number
          pro_organization?: string | null
          role?: string
          track_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "track_rights_track_id_fkey"
            columns: ["track_id"]
            isOneToOne: false
            referencedRelation: "tracks"
            referencedColumns: ["id"]
          },
        ]
      }
      track_versions: {
        Row: {
          created_at: string | null
          file_name: string
          file_size: number | null
          file_url: string
          id: string
          track_id: string
          version_type: string
        }
        Insert: {
          created_at?: string | null
          file_name: string
          file_size?: number | null
          file_url: string
          id?: string
          track_id: string
          version_type: string
        }
        Update: {
          created_at?: string | null
          file_name?: string
          file_size?: number | null
          file_url?: string
          id?: string
          track_id?: string
          version_type?: string
        }
        Relationships: [
          {
            foreignKeyName: "track_versions_track_id_fkey"
            columns: ["track_id"]
            isOneToOne: false
            referencedRelation: "tracks"
            referencedColumns: ["id"]
          },
        ]
      }
      tracking_events: {
        Row: {
          created_at: string | null
          event_type: Database["public"]["Enums"]["event_type"]
          id: string
          ip_address: unknown
          recipient_email: string | null
          shareable_link_id: string
          track_id: string | null
          user_agent: string | null
        }
        Insert: {
          created_at?: string | null
          event_type: Database["public"]["Enums"]["event_type"]
          id?: string
          ip_address?: unknown
          recipient_email?: string | null
          shareable_link_id: string
          track_id?: string | null
          user_agent?: string | null
        }
        Update: {
          created_at?: string | null
          event_type?: Database["public"]["Enums"]["event_type"]
          id?: string
          ip_address?: unknown
          recipient_email?: string | null
          shareable_link_id?: string
          track_id?: string | null
          user_agent?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "tracking_events_shareable_link_id_fkey"
            columns: ["shareable_link_id"]
            isOneToOne: false
            referencedRelation: "shareable_links"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tracking_events_track_id_fkey"
            columns: ["track_id"]
            isOneToOne: false
            referencedRelation: "tracks"
            referencedColumns: ["id"]
          },
        ]
      }
      tracks: {
        Row: {
          artist: string
          bpm: number | null
          clearance_status:
            | Database["public"]["Enums"]["clearance_status"]
            | null
          composer: string | null
          created_at: string | null
          description: string | null
          duration: number | null
          file_name: string
          file_size: number | null
          file_url: string
          id: string
          isrc: string | null
          iswc: string | null
          key: string | null
          rights_type: Database["public"]["Enums"]["rights_type"] | null
          title: string
          updated_at: string | null
          user_id: string
        }
        Insert: {
          artist: string
          bpm?: number | null
          clearance_status?:
            | Database["public"]["Enums"]["clearance_status"]
            | null
          composer?: string | null
          created_at?: string | null
          description?: string | null
          duration?: number | null
          file_name: string
          file_size?: number | null
          file_url: string
          id?: string
          isrc?: string | null
          iswc?: string | null
          key?: string | null
          rights_type?: Database["public"]["Enums"]["rights_type"] | null
          title: string
          updated_at?: string | null
          user_id: string
        }
        Update: {
          artist?: string
          bpm?: number | null
          clearance_status?:
            | Database["public"]["Enums"]["clearance_status"]
            | null
          composer?: string | null
          created_at?: string | null
          description?: string | null
          duration?: number | null
          file_name?: string
          file_size?: number | null
          file_url?: string
          id?: string
          isrc?: string | null
          iswc?: string | null
          key?: string | null
          rights_type?: Database["public"]["Enums"]["rights_type"] | null
          title?: string
          updated_at?: string | null
          user_id?: string
        }
        Relationships: []
      }
      user_roles: {
        Row: {
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      has_role:
        | {
            Args: {
              _role: Database["public"]["Enums"]["app_role"]
              _user_id: string
            }
            Returns: boolean
          }
        | {
            Args: {
              _role: Database["public"]["Enums"]["app_role"]
              _user_id: string
            }
            Returns: boolean
          }
    }
    Enums: {
      app_role: "admin" | "user"
      clearance_status: "cleared_ready" | "in_progress" | "not_cleared"
      event_type: "playlist_opened" | "track_played" | "track_downloaded"
      project_status: "to_do" | "sent" | "shortlist" | "licensed" | "archived"
      rights_type: "one_stop" | "two_stop"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      app_role: ["admin", "user"],
      clearance_status: ["cleared_ready", "in_progress", "not_cleared"],
      event_type: ["playlist_opened", "track_played", "track_downloaded"],
      project_status: ["to_do", "sent", "shortlist", "licensed", "archived"],
      rights_type: ["one_stop", "two_stop"],
    },
  },
} as const
