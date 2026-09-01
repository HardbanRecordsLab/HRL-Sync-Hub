import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Copy, Share2, Trash2, ExternalLink } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useQueryClient } from "@tanstack/react-query";

interface ShareableLink {
  id: string;
  link_token: string;
  is_active: boolean | null;
  expires_at: string | null;
  allow_downloads: boolean | null;
  require_email: boolean | null;
}

interface ShareLinkDialogProps {
  playlistId: string;
  playlistName: string;
  existingLinks?: ShareableLink[];
}

const ShareLinkDialog = ({ playlistId, playlistName, existingLinks = [] }: ShareLinkDialogProps) => {
  const [open, setOpen] = useState(false);
  const [isCreating, setIsCreating] = useState(false);
  const [password, setPassword] = useState("");
  const [requireEmail, setRequireEmail] = useState(false);
  const [allowDownloads, setAllowDownloads] = useState(false);
  const [expiresInDays, setExpiresInDays] = useState<number | null>(null);
  const queryClient = useQueryClient();

  const generateToken = () => {
    return crypto.randomUUID().replace(/-/g, "").substring(0, 16);
  };

  const createShareLink = async () => {
    setIsCreating(true);
    try {
      const token = generateToken();
      const expiresAt = expiresInDays 
        ? new Date(Date.now() + expiresInDays * 24 * 60 * 60 * 1000).toISOString()
        : null;

      // Hash password if provided (simple hash for demo - in production use bcrypt on server)
      const passwordHash = password ? btoa(password) : null;

      const { error } = await supabase.from("shareable_links").insert({
        playlist_id: playlistId,
        link_token: token,
        password_hash: passwordHash,
        require_email: requireEmail,
        allow_downloads: allowDownloads,
        expires_at: expiresAt,
        is_active: true,
      });

      if (error) throw error;

      toast.success("Share link created successfully!");
      queryClient.invalidateQueries({ queryKey: ["playlist", playlistId] });
      setPassword("");
      setRequireEmail(false);
      setAllowDownloads(false);
      setExpiresInDays(null);
    } catch (error) {
      console.error("Error creating share link:", error);
      toast.error("Failed to create share link");
    } finally {
      setIsCreating(false);
    }
  };

  const deleteShareLink = async (linkId: string) => {
    try {
      const { error } = await supabase
        .from("shareable_links")
        .delete()
        .eq("id", linkId);

      if (error) throw error;

      toast.success("Share link deleted");
      queryClient.invalidateQueries({ queryKey: ["playlist", playlistId] });
    } catch (error) {
      console.error("Error deleting share link:", error);
      toast.error("Failed to delete share link");
    }
  };

  const toggleLinkActive = async (linkId: string, isActive: boolean) => {
    try {
      const { error } = await supabase
        .from("shareable_links")
        .update({ is_active: !isActive })
        .eq("id", linkId);

      if (error) throw error;

      toast.success(isActive ? "Link deactivated" : "Link activated");
      queryClient.invalidateQueries({ queryKey: ["playlist", playlistId] });
    } catch (error) {
      console.error("Error toggling link:", error);
      toast.error("Failed to update link");
    }
  };

  const copyLink = (token: string) => {
    const url = `${window.location.origin}/share/${token}`;
    navigator.clipboard.writeText(url);
    toast.success("Link copied to clipboard!");
  };

  const activeLinks = existingLinks.filter(l => l.is_active);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button>
          <Share2 className="w-4 h-4 mr-2" />
          Generate Share Link
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Share "{playlistName}"</DialogTitle>
          <DialogDescription>
            Create a shareable link with optional password protection
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6">
          {/* Existing links */}
          {existingLinks.length > 0 && (
            <div className="space-y-3">
              <Label>Existing Links</Label>
              {existingLinks.map((link) => (
                <div
                  key={link.id}
                  className="flex items-center justify-between p-3 rounded-lg bg-accent/50 border"
                >
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-mono truncate">
                      .../{link.link_token}
                    </p>
                    <div className="flex gap-2 mt-1">
                      {link.require_email && (
                        <span className="text-xs bg-primary/20 px-1.5 py-0.5 rounded">Email required</span>
                      )}
                      {link.allow_downloads && (
                        <span className="text-xs bg-primary/20 px-1.5 py-0.5 rounded">Downloads</span>
                      )}
                      {!link.is_active && (
                        <span className="text-xs bg-destructive/20 px-1.5 py-0.5 rounded text-destructive">Inactive</span>
                      )}
                    </div>
                  </div>
                  <div className="flex gap-1 ml-2">
                    <Button size="icon" variant="ghost" onClick={() => copyLink(link.link_token)}>
                      <Copy className="h-4 w-4" />
                    </Button>
                    <Button
                      size="icon"
                      variant="ghost"
                      onClick={() => window.open(`/share/${link.link_token}`, "_blank")}
                    >
                      <ExternalLink className="h-4 w-4" />
                    </Button>
                    <Button
                      size="icon"
                      variant="ghost"
                      onClick={() => toggleLinkActive(link.id, link.is_active ?? false)}
                    >
                      <Switch checked={link.is_active ?? false} />
                    </Button>
                    <Button
                      size="icon"
                      variant="ghost"
                      className="text-destructive hover:text-destructive"
                      onClick={() => deleteShareLink(link.id)}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Create new link */}
          <div className="space-y-4 pt-4 border-t">
            <Label className="text-base font-semibold">Create New Link</Label>
            
            <div className="space-y-2">
              <Label htmlFor="password">Password Protection (optional)</Label>
              <Input
                id="password"
                type="password"
                placeholder="Leave empty for no password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </div>

            <div className="flex items-center justify-between">
              <Label htmlFor="require-email">Require email to access</Label>
              <Switch
                id="require-email"
                checked={requireEmail}
                onCheckedChange={setRequireEmail}
              />
            </div>

            <div className="flex items-center justify-between">
              <Label htmlFor="allow-downloads">Allow downloads</Label>
              <Switch
                id="allow-downloads"
                checked={allowDownloads}
                onCheckedChange={setAllowDownloads}
              />
            </div>

            <div className="space-y-2">
              <Label>Expires in</Label>
              <div className="flex gap-2">
                {[null, 7, 30, 90].map((days) => (
                  <Button
                    key={days ?? "never"}
                    size="sm"
                    variant={expiresInDays === days ? "default" : "outline"}
                    onClick={() => setExpiresInDays(days)}
                  >
                    {days === null ? "Never" : `${days} days`}
                  </Button>
                ))}
              </div>
            </div>

            <Button onClick={createShareLink} disabled={isCreating} className="w-full">
              {isCreating ? "Creating..." : "Create Share Link"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default ShareLinkDialog;
