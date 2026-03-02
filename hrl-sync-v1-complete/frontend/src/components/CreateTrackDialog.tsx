import { useState, useRef } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Plus, Upload, Music, X } from "lucide-react";
import { useCreateTrackMutation } from "@/hooks/useTracksQuery";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";

export const CreateTrackDialog = () => {
  const [open, setOpen] = useState(false);
  const [audioFile, setAudioFile] = useState<File | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const fileInputRef = useRef<HTMLInputElement>(null);
  
  const [formData, setFormData] = useState({
    title: "",
    artist: "",
    composer: "",
    bpm: "",
    key: "",
    description: "",
    isrc: "",
    iswc: "",
    rights_type: "one_stop" as "one_stop" | "two_stop",
    clearance_status: "not_cleared" as "cleared_ready" | "in_progress" | "not_cleared",
  });

  const createTrack = useCreateTrackMutation();

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      // Validate file type
      const validTypes = ['audio/mpeg', 'audio/wav', 'audio/mp3', 'audio/x-wav', 'audio/aiff', 'audio/flac'];
      if (!validTypes.includes(file.type)) {
        toast.error("Please upload a valid audio file (MP3, WAV, AIFF, or FLAC)");
        return;
      }
      
      // Validate file size (max 100MB)
      if (file.size > 100 * 1024 * 1024) {
        toast.error("File size must be less than 100MB");
        return;
      }
      
      setAudioFile(file);
      
      // Auto-fill title from filename if empty
      if (!formData.title) {
        const fileName = file.name.replace(/\.[^/.]+$/, "");
        setFormData(prev => ({ ...prev, title: fileName }));
      }
    }
  };

  const removeFile = () => {
    setAudioFile(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  const formatFileSize = (bytes: number) => {
    if (bytes === 0) return "0 Bytes";
    const k = 1024;
    const sizes = ["Bytes", "KB", "MB", "GB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + " " + sizes[i];
  };

  const getAudioDuration = (file: File): Promise<number> => {
    return new Promise((resolve) => {
      const audio = new Audio();
      audio.addEventListener("loadedmetadata", () => {
        resolve(Math.round(audio.duration));
      });
      audio.addEventListener("error", () => {
        resolve(0);
      });
      audio.src = URL.createObjectURL(file);
    });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!formData.title || !formData.artist) {
      toast.error("Title and Artist are required");
      return;
    }

    if (!audioFile) {
      toast.error("Please upload an audio file");
      return;
    }

    setIsUploading(true);
    setUploadProgress(0);

    try {
      // Get user ID
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        toast.error("You must be logged in to upload tracks");
        return;
      }

      // Get audio duration
      const duration = await getAudioDuration(audioFile);

      // Create unique file path
      const fileExt = audioFile.name.split('.').pop();
      const fileName = `${Date.now()}-${formData.title.replace(/[^a-z0-9]/gi, '_')}.${fileExt}`;
      const filePath = `${user.id}/${fileName}`;

      // Upload to Supabase Storage
      setUploadProgress(30);
      const { data: uploadData, error: uploadError } = await supabase.storage
        .from('audio-tracks')
        .upload(filePath, audioFile, {
          cacheControl: '3600',
          upsert: false
        });

      if (uploadError) {
        throw new Error(`Upload failed: ${uploadError.message}`);
      }

      setUploadProgress(70);

      // Get public URL
      const { data: urlData } = supabase.storage
        .from('audio-tracks')
        .getPublicUrl(filePath);

      setUploadProgress(90);

      // Create track in database
      await createTrack.mutateAsync({
        title: formData.title,
        artist: formData.artist,
        composer: formData.composer || undefined,
        bpm: formData.bpm ? parseInt(formData.bpm) : undefined,
        key: formData.key || undefined,
        description: formData.description || undefined,
        isrc: formData.isrc || undefined,
        iswc: formData.iswc || undefined,
        rights_type: formData.rights_type,
        clearance_status: formData.clearance_status,
        file_name: audioFile.name,
        file_url: urlData.publicUrl,
        file_size: audioFile.size,
        duration: duration,
      });
      
      setUploadProgress(100);
      toast.success("Track uploaded successfully");
      setOpen(false);
      resetForm();
    } catch (error) {
      console.error("Upload error:", error);
      toast.error(error instanceof Error ? error.message : "Failed to upload track");
    } finally {
      setIsUploading(false);
      setUploadProgress(0);
    }
  };

  const resetForm = () => {
    setFormData({
      title: "",
      artist: "",
      composer: "",
      bpm: "",
      key: "",
      description: "",
      isrc: "",
      iswc: "",
      rights_type: "one_stop",
      clearance_status: "not_cleared",
    });
    setAudioFile(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  return (
    <Dialog open={open} onOpenChange={(isOpen) => {
      setOpen(isOpen);
      if (!isOpen) resetForm();
    }}>
      <DialogTrigger asChild>
        <Button className="gap-2 shadow-glow">
          <Plus className="w-4 h-4" />
          Add Track
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Add New Track</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Audio File Upload */}
          <div className="space-y-2">
            <Label>Audio File *</Label>
            <input
              ref={fileInputRef}
              type="file"
              accept="audio/*"
              onChange={handleFileChange}
              className="hidden"
              id="audio-upload"
            />
            
            {!audioFile ? (
              <label
                htmlFor="audio-upload"
                className="flex flex-col items-center justify-center w-full h-32 border-2 border-dashed border-muted-foreground/25 rounded-lg cursor-pointer hover:border-primary/50 hover:bg-muted/50 transition-colors"
              >
                <Upload className="w-8 h-8 text-muted-foreground mb-2" />
                <span className="text-sm text-muted-foreground">
                  Click to upload audio file
                </span>
                <span className="text-xs text-muted-foreground mt-1">
                  MP3, WAV, AIFF, FLAC (max 100MB)
                </span>
              </label>
            ) : (
              <div className="flex items-center gap-3 p-3 bg-muted/50 rounded-lg border">
                <div className="flex items-center justify-center w-10 h-10 rounded-lg bg-primary/10">
                  <Music className="w-5 h-5 text-primary" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">{audioFile.name}</p>
                  <p className="text-xs text-muted-foreground">
                    {formatFileSize(audioFile.size)}
                  </p>
                </div>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  onClick={removeFile}
                  disabled={isUploading}
                >
                  <X className="w-4 h-4" />
                </Button>
              </div>
            )}
          </div>

          {/* Upload Progress */}
          {isUploading && (
            <div className="space-y-2">
              <div className="flex justify-between text-sm">
                <span>Uploading...</span>
                <span>{uploadProgress}%</span>
              </div>
              <div className="h-2 bg-muted rounded-full overflow-hidden">
                <div 
                  className="h-full bg-primary transition-all duration-300"
                  style={{ width: `${uploadProgress}%` }}
                />
              </div>
            </div>
          )}

          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label htmlFor="title">Title *</Label>
              <Input
                id="title"
                value={formData.title}
                onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                placeholder="Track title"
              />
            </div>
            <div>
              <Label htmlFor="artist">Artist *</Label>
              <Input
                id="artist"
                value={formData.artist}
                onChange={(e) => setFormData({ ...formData, artist: e.target.value })}
                placeholder="Artist name"
              />
            </div>
          </div>

          <div>
            <Label htmlFor="composer">Composer</Label>
            <Input
              id="composer"
              value={formData.composer}
              onChange={(e) => setFormData({ ...formData, composer: e.target.value })}
              placeholder="Composer name"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label htmlFor="bpm">BPM</Label>
              <Input
                id="bpm"
                type="number"
                value={formData.bpm}
                onChange={(e) => setFormData({ ...formData, bpm: e.target.value })}
                placeholder="120"
              />
            </div>
            <div>
              <Label htmlFor="key">Key</Label>
              <Input
                id="key"
                value={formData.key}
                onChange={(e) => setFormData({ ...formData, key: e.target.value })}
                placeholder="C Major"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label htmlFor="isrc">ISRC</Label>
              <Input
                id="isrc"
                value={formData.isrc}
                onChange={(e) => setFormData({ ...formData, isrc: e.target.value })}
                placeholder="USRC11234567"
              />
            </div>
            <div>
              <Label htmlFor="iswc">ISWC</Label>
              <Input
                id="iswc"
                value={formData.iswc}
                onChange={(e) => setFormData({ ...formData, iswc: e.target.value })}
                placeholder="T-123.456.789-1"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label htmlFor="rights_type">Rights Type</Label>
              <Select
                value={formData.rights_type}
                onValueChange={(value: "one_stop" | "two_stop") => 
                  setFormData({ ...formData, rights_type: value })
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="one_stop">1-Stop (Full Control)</SelectItem>
                  <SelectItem value="two_stop">2-Stop (Split Rights)</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label htmlFor="clearance_status">Clearance Status</Label>
              <Select
                value={formData.clearance_status}
                onValueChange={(value: "cleared_ready" | "in_progress" | "not_cleared") => 
                  setFormData({ ...formData, clearance_status: value })
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="cleared_ready">Cleared & Ready</SelectItem>
                  <SelectItem value="in_progress">In Progress</SelectItem>
                  <SelectItem value="not_cleared">Not Cleared</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div>
            <Label htmlFor="description">Description</Label>
            <Textarea
              id="description"
              value={formData.description}
              onChange={(e) => setFormData({ ...formData, description: e.target.value })}
              placeholder="Short description of the track..."
              maxLength={150}
              rows={3}
            />
            <p className="text-xs text-muted-foreground mt-1">
              {formData.description.length}/150 characters
            </p>
          </div>

          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => setOpen(false)} disabled={isUploading}>
              Cancel
            </Button>
            <Button type="submit" disabled={createTrack.isPending || isUploading || !audioFile}>
              {isUploading ? "Uploading..." : createTrack.isPending ? "Creating..." : "Upload Track"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
};
